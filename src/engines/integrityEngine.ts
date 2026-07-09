// ============================================================
// INTEGRITY ENGINE — Motor central de integridad
// ------------------------------------------------------------
// ETI-05: Valida que el TraceGraph sea coherente.
// NUNCA modifica datos. NUNCA corrige. Solo detecta.
//
// REFACTOR (Staff Engineer):
//   - Motor reducido a orquestador delgado.
//   - Toda la lógica de validación vive en reglas (rules/).
//   - Rule Registry: el motor no conoce reglas específicas.
//   - Cada regla devuelve RuleFinding (código, severidad,
//     explicación, datos), nunca texto final.
//   - El motor materializa RuleFinding → AlertaIntegridad
//     vía templates centralizadas (MESSAGE_TEMPLATES).
//   - Cero `any`. API pública 100% compatible.
// ============================================================

import type {
  TraceNode, Alerta, Cote, Ingreso, Exportacion, StockPallet,
} from '@/domain';
import type { IntegrityEngine as IIntegrityEngine } from './interfaces';
import { TraceGraph } from './traceGraphEngine';
import { createDefaultRegistry, RuleRegistry } from './integrity';
import type { RuleFinding, RuleContext } from './integrity';

// --- Configuración de reglas ---

export interface ReglaConfig {
  // Tolerancias
  pesoToleranciaKg: number;
  pesoToleranciaPct: number;
  cajasTolerancia: number;
  // Pesos de penalización (cuánto resta del score 0-100)
  pesoSobreexportacion: number;
  pesoSaldoNegativo: number;
  pesoDocumentoDuplicado: number;
  pesoPesoInconsistente: number;
  pesoCajasInconsistentes: number;
  pesoFechaImposible: number;
  pesoSinIngreso: number;
  pesoSinProductor: number;
  pesoSinCertificadora: number;
  pesoSinDeposito: number;
  pesoSinCliente: number;
  pesoSinPais: number;
  pesoSinCOTE: number;
  pesoSinDocumento: number;
  pesoSinFecha: number;
  pesoSinPeso: number;
  pesoSinCajas: number;
  pesoObservacionFaltante: number;
  pesoExportacionAntesIngreso: number;
  pesoFechaFutura: number;
}

export const DEFAULT_CONFIG: ReglaConfig = {
  pesoToleranciaKg: 5,
  pesoToleranciaPct: 0.5,
  cajasTolerancia: 0,
  pesoSobreexportacion: 30,
  pesoSaldoNegativo: 25,
  pesoDocumentoDuplicado: 20,
  pesoPesoInconsistente: 15,
  pesoCajasInconsistentes: 15,
  pesoFechaImposible: 15,
  pesoSinIngreso: 40,
  pesoSinProductor: 10,
  pesoSinCertificadora: 10,
  pesoSinDeposito: 8,
  pesoSinCliente: 3,
  pesoSinPais: 3,
  pesoSinCOTE: 15,
  pesoSinDocumento: 10,
  pesoSinFecha: 8,
  pesoSinPeso: 10,
  pesoSinCajas: 5,
  pesoObservacionFaltante: 1,
  pesoExportacionAntesIngreso: 20,
  pesoFechaFutura: 15,
};

// --- Tipos de alertas de integridad ---

export type GrupoIntegridad = 'A_estructural' | 'B_documental' | 'C_cronologico' | 'D_logistico' | 'E_comercial' | 'F_matematico' | 'G_operativo' | 'H_historico';
export type SeveridadIntegridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFORMATIVA';

export interface AlertaIntegridad {
  id: string;
  grupo: GrupoIntegridad;
  severidad: SeveridadIntegridad;
  nodoId: string;
  nroCote: string;
  tipo: string;
  mensaje: string;
  causa: string;
  impacto: string;
  recomendacion: string;
  peso: number;
  detectadaEn: string;
}

// --- Log de auditoría ---

export interface LogEjecucion {
  id: string;
  fecha: string;
  tipo: 'completa' | 'incremental';
  nodos: number;
  alertas: number;
  score: number;
  duracionMs: number;
}

// --- Resultado de validación ---

export interface ResultadoIntegridad {
  scoreGlobal: number;
  totalAlertas: number;
  alertasPorSeveridad: Record<SeveridadIntegridad, number>;
  alertasPorGrupo: Record<GrupoIntegridad, number>;
  matrizAnomalias: { tipo: string; cantidad: number; severidad: SeveridadIntegridad }[];
  alertas: AlertaIntegridad[];
  log: LogEjecucion;
}

// ------------------------------------------------------------
// MESSAGE_TEMPLATES — materialización RuleFinding → AlertaIntegridad
// ------------------------------------------------------------
// El motor es el único lugar que conoce los textos finales.
// Las reglas son puramente estructurales. Esto permite cambiar
// el wording sin tocar la lógica de detección.
// ------------------------------------------------------------

interface MessageTemplate {
  mensaje: string;
  causa: string;
  impacto: string;
  recomendacion: string;
}

function fmt(template: string, data: Record<string, string | number | boolean | null>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = data[k];
    return v === null || v === undefined ? '' : String(v);
  });
}

const MESSAGE_TEMPLATES: Record<string, MessageTemplate> = {
  // --- Grupo A: Estructural ---
  sin_cote: {
    mensaje: 'COTE vacío',
    causa: 'Falta el número de COTE',
    impacto: 'No se puede identificar el embarque',
    recomendacion: 'Verificar el documento origen',
  },
  sin_productor: {
    mensaje: 'Productor vacío',
    causa: 'Falta el nombre del productor',
    impacto: 'No se puede atribuir el origen',
    recomendacion: 'Verificar el campo productor',
  },
  sin_certificadora: {
    mensaje: 'Certificadora vacía',
    causa: 'Falta la certificadora',
    impacto: 'No se puede atribuir la certificación',
    recomendacion: 'Verificar el campo certificadora',
  },
  sin_deposito: {
    mensaje: 'Depósito vacío',
    causa: 'Falta el depósito de ingreso',
    impacto: 'No se sabe dónde está la mercadería',
    recomendacion: 'Verificar el campo depósito',
  },
  sin_fecha_ingreso: {
    mensaje: 'Fecha de ingreso vacía',
    causa: 'Falta la fecha de ingreso',
    impacto: 'No se puede verificar cronología',
    recomendacion: 'Verificar la fecha',
  },
  sin_peso: {
    mensaje: 'Peso neto cero',
    causa: 'El peso neto del ingreso es cero',
    impacto: 'No se puede calcular stock',
    recomendacion: 'Verificar el peso',
  },
  sin_cajas: {
    mensaje: 'Cajas cero',
    causa: 'La cantidad de cajas del ingreso es cero',
    impacto: 'No se puede conciliar',
    recomendacion: 'Verificar las cajas',
  },

  // --- Grupo B: Documental ---
  sin_ingreso: {
    mensaje: 'Exportación sin ingreso',
    causa: 'Hay exportaciones pero no hay ingreso relacionado',
    impacto: 'No se puede verificar el origen de la mercadería',
    recomendacion: 'Vincular un ingreso o crearlo manualmente',
  },
  doc_duplicado: {
    mensaje: 'Documento duplicado',
    causa: 'Documento(s) repetido(s): {documentos}',
    impacto: 'Posible doble exportación',
    recomendacion: 'Verificar y eliminar duplicados',
  },

  // --- Grupo C: Cronológico ---
  exp_antes_ing: {
    mensaje: 'Exportación anterior al ingreso',
    causa: 'Exportación {documento} es anterior al ingreso',
    impacto: 'Cronología imposible',
    recomendacion: 'Verificar fechas',
  },
  fecha_futura: {
    mensaje: 'Fecha futura',
    causa: 'Fecha de ingreso {fecha} es futura',
    impacto: 'Fecha imposible',
    recomendacion: 'Corregir la fecha',
  },

  // --- Grupo D: Logístico ---
  saldo_negativo: {
    mensaje: 'Saldo negativo',
    causa: 'Saldo de cajas: {saldoCajas}',
    impacto: 'Se exportó más de lo ingresado',
    recomendacion: 'Verificar exportaciones o agregar ingreso faltante',
  },
  sobreexportacion: {
    mensaje: 'Sobreexportación',
    causa: 'Ingreso: {ingresoCajas} cajas, Exportado: {exportadoCajas} cajas',
    impacto: 'Se exportó más de lo ingresado',
    recomendacion: 'Verificar exportaciones',
  },

  // --- Grupo E: Comercial ---
  sin_cliente: {
    mensaje: 'Cliente vacío',
    causa: 'No hay cliente asignado',
    impacto: 'No se puede atribuir el destino comercial',
    recomendacion: 'Verificar el cliente',
  },
  sin_pais: {
    mensaje: 'País vacío',
    causa: 'No hay país de destino',
    impacto: 'No se puede atribuir el destino geográfico',
    recomendacion: 'Verificar el país',
  },
  pais_invalido: {
    mensaje: 'País inválido',
    causa: 'País declarado {paisDeclarado} no está en el catálogo',
    impacto: 'Posible error de carga',
    recomendacion: 'Verificar el catálogo de países',
  },

  // --- Grupo F: Matemático ---
  peso_negativo: {
    mensaje: 'Peso neto negativo',
    causa: 'Peso: {pesoNeto} kg',
    impacto: 'Valor imposible',
    recomendacion: 'Corregir el peso',
  },
  cajas_negativas: {
    mensaje: 'Cajas negativas',
    causa: 'Cajas: {cajas}',
    impacto: 'Valor imposible',
    recomendacion: 'Corregir las cajas',
  },
  cajas_inconsistentes: {
    mensaje: 'Cajas inconsistentes',
    causa: 'Ingreso: {ingresoCajas}, Exportado: {exportadoCajas}',
    impacto: 'La suma de exportaciones excede el ingreso',
    recomendacion: 'Verificar exportaciones',
  },

  // --- Grupo G: Operativo ---
  inmovilizado: {
    mensaje: 'Mercadería inmovilizada',
    causa: '{dias} días sin movimiento',
    impacto: 'Stock inmovilizado >180 días',
    recomendacion: 'Gestionar retorno o reasignar',
  },

  // --- Nuevos códigos (PortRule, DestinationRule) ---
  sin_contenedor: {
    mensaje: 'Sin contenedor',
    causa: 'Exportación {documento} sin contenedor asignado',
    impacto: 'No se puede rastrear logísticamente',
    recomendacion: 'Asignar contenedor',
  },
  contenedor_mal_formado: {
    mensaje: 'Contenedor mal formado',
    causa: 'Contenedor {contenedor} no cumple ISO 6346 (4 letras + 7 dígitos)',
    impacto: 'Posible error de carga',
    recomendacion: 'Verificar el número de contenedor',
  },
  sin_destino: {
    mensaje: 'Sin destino',
    causa: 'Exportación {documento} sin destino declarado',
    impacto: 'No se puede atribuir el destino geográfico',
    recomendacion: 'Verificar el campo destino',
  },
};

// --- Implementación ---

class IntegrityEngineImpl implements IIntegrityEngine {
  private config: ReglaConfig = DEFAULT_CONFIG;
  private logs: LogEjecucion[] = [];
  private alertasActivas: AlertaIntegridad[] = [];
  private registry: RuleRegistry = createDefaultRegistry();

  // --- Configuración ---

  setConfig(config: Partial<ReglaConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ReglaConfig {
    return this.config;
  }

  // --- Rule Registry access ---

  getRegistry(): RuleRegistry {
    return this.registry;
  }

  /** Reemplaza el registry (avanzado). */
  setRegistry(registry: RuleRegistry): void {
    this.registry = registry;
  }

  // --- API Interna ---

  validarTodo(): ResultadoIntegridad {
    const startTime = Date.now();
    const nodes: TraceNode[] = TraceGraph.getAllNodes();
    const now = new Date().toISOString();

    const alertas: AlertaIntegridad[] = [];
    let scoreSum = 0;

    for (const node of nodes) {
      const nodeAlertas = this.validarNodo(node, now);
      alertas.push(...nodeAlertas);
      scoreSum += this.calcularScoreNodo(node, nodeAlertas);
    }

    const scoreGlobal = nodes.length > 0 ? scoreSum / nodes.length : 100;
    this.alertasActivas = alertas;

    // Construir resultado
    const porSeveridad = this.initCounter<SeveridadIntegridad>(['CRITICA', 'ALTA', 'MEDIA', 'BAJA', 'INFORMATIVA']);
    const porGrupo = this.initCounter<GrupoIntegridad>([
      'A_estructural', 'B_documental', 'C_cronologico', 'D_logistico',
      'E_comercial', 'F_matematico', 'G_operativo', 'H_historico',
    ]);
    const porTipo: Map<string, { cantidad: number; severidad: SeveridadIntegridad }> = new Map();

    for (const a of alertas) {
      porSeveridad[a.severidad]++;
      porGrupo[a.grupo]++;
      if (!porTipo.has(a.tipo)) porTipo.set(a.tipo, { cantidad: 0, severidad: a.severidad });
      porTipo.get(a.tipo)!.cantidad++;
    }

    const matrizAnomalias = Array.from(porTipo.entries())
      .map(([tipo, v]) => ({ tipo, cantidad: v.cantidad, severidad: v.severidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const log: LogEjecucion = {
      id: `log_${Date.now()}`,
      fecha: now,
      tipo: 'completa',
      nodos: nodes.length,
      alertas: alertas.length,
      score: scoreGlobal,
      duracionMs: Date.now() - startTime,
    };
    this.logs.unshift(log);
    if (this.logs.length > 100) this.logs = this.logs.slice(0, 100);

    return {
      scoreGlobal,
      totalAlertas: alertas.length,
      alertasPorSeveridad: porSeveridad,
      alertasPorGrupo: porGrupo,
      matrizAnomalias,
      alertas,
      log,
    };
  }

  /**
   * Ejecuta todas las reglas registradas sobre un nodo y materializa
   * los hallazgos en AlertaIntegridad. No contiene lógica de detección.
   */
  validarNodo(node: TraceNode, nowOverride?: string): AlertaIntegridad[] {
    const now = nowOverride ?? new Date().toISOString();
    const ctx: RuleContext = { node, config: this.config, now };
    const findings: RuleFinding[] = [];

    for (const rule of this.registry.all()) {
      const ruleFindings = rule.evaluate(ctx);
      for (const f of ruleFindings) findings.push(f);
    }

    return findings.map(f => this.materialize(f, node, now));
  }

  /**
   * Convierte un RuleFinding estructurado en una AlertaIntegridad con
   * texto final. Usa MESSAGE_TEMPLATES para los mensajes.
   */
  private materialize(finding: RuleFinding, node: TraceNode, now: string): AlertaIntegridad {
    const template = MESSAGE_TEMPLATES[finding.code] ?? {
      mensaje: finding.code,
      causa: finding.code,
      impacto: '',
      recomendacion: '',
    };
    return {
      id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      grupo: finding.group,
      severidad: finding.severity,
      nodoId: node.id,
      nroCote: node.nroCote,
      tipo: finding.code,
      mensaje: fmt(template.mensaje, finding.data),
      causa: fmt(template.causa, finding.data),
      impacto: fmt(template.impacto, finding.data),
      recomendacion: fmt(template.recomendacion, finding.data),
      peso: finding.weight,
      detectadaEn: now,
    };
  }

  private initCounter<T extends string>(keys: readonly T[]): Record<T, number> {
    const out = {} as Record<T, number>;
    for (const k of keys) out[k] = 0;
    return out;
  }

  // --- Calcular score de un nodo ---

  calcularScoreNodo(node: TraceNode, alertas: AlertaIntegridad[]): number {
    let score = 100;
    for (const a of alertas) {
      score -= a.peso;
    }
    return Math.max(0, Math.min(100, score));
  }

  // --- Obtener alertas ---

  obtenerAlertas(): AlertaIntegridad[] {
    return this.alertasActivas;
  }

  obtenerScore(): number {
    const result = this.validarTodo();
    return result.scoreGlobal;
  }

  obtenerResumen(): ResultadoIntegridad {
    return this.validarTodo();
  }

  obtenerReglasFallidas(): AlertaIntegridad[] {
    return this.alertasActivas.filter(a => a.severidad === 'CRITICA' || a.severidad === 'ALTA');
  }

  recalcularNodo(node: TraceNode): AlertaIntegridad[] {
    return this.validarNodo(node);
  }

  // --- Modo simulación ---

  simularModificacion(node: TraceNode, modificacion: Partial<TraceNode>): {
    scoreAntes: number;
    scoreDespues: number;
    nuevasAlertas: number;
    alertasResueltas: number;
  } {
    const alertasAntes = this.validarNodo(node);
    const scoreAntes = this.calcularScoreNodo(node, alertasAntes);

    // Clonar nodo y aplicar modificación
    const nodeSimulado: TraceNode = { ...node, ...modificacion };
    const alertasDespues = this.validarNodo(nodeSimulado);
    const scoreDespues = this.calcularScoreNodo(nodeSimulado, alertasDespues);

    const tiposAntes = new Set(alertasAntes.map(a => a.tipo));
    const tiposDespues = new Set(alertasDespues.map(a => a.tipo));

    const nuevasAlertas = [...tiposDespues].filter(t => !tiposAntes.has(t)).length;
    const alertasResueltas = [...tiposAntes].filter(t => !tiposDespues.has(t)).length;

    return { scoreAntes, scoreDespues, nuevasAlertas, alertasResueltas };
  }

  // --- Logs ---

  obtenerLogs(): LogEjecucion[] {
    return this.logs;
  }

  // --- Métodos de la interfaz (compatibilidad) ---

  validate(cotes: Cote[], ingresos: Ingreso[], exportaciones: Exportacion[], stock: StockPallet[]): Alerta[] {
    const result = this.validarTodo();
    return result.alertas.map(a => ({
      id: a.id,
      categoria: this.mapCategoria(a.tipo),
      prioridad: this.mapPrioridad(a.severidad),
      titulo: a.mensaje,
      descripcion: `${a.causa}. Impacto: ${a.impacto}. Recomendación: ${a.recomendacion}`,
      entidad: { tipo: 'cote', id: a.nodoId, label: a.nroCote },
      metrica: a.peso,
      accionSugerida: a.recomendacion,
      detectadaEn: a.detectadaEn,
    }));
  }

  /** Mapea el código de hallazgo a CategoriaAlerta del dominio. */
  private mapCategoria(tipo: string): Alerta['categoria'] {
    const map: Record<string, Alerta['categoria']> = {
      sin_cote: 'documentacion_incompleta',
      sin_productor: 'documentacion_incompleta',
      sin_certificadora: 'documentacion_incompleta',
      sin_deposito: 'documentacion_incompleta',
      sin_fecha_ingreso: 'documentacion_incompleta',
      sin_peso: 'anomalia',
      sin_cajas: 'anomalia',
      sin_ingreso: 'documentacion_incompleta',
      doc_duplicado: 'duplicados',
      exp_antes_ing: 'anomalia',
      fecha_futura: 'anomalia',
      saldo_negativo: 'anomalia',
      sobreexportacion: 'anomalia',
      sin_cliente: 'mercaderia_sin_destino',
      sin_pais: 'mercaderia_sin_destino',
      pais_invalido: 'mercaderia_sin_destino',
      peso_negativo: 'anomalia',
      cajas_negativas: 'anomalia',
      cajas_inconsistentes: 'anomalia',
      inmovilizado: 'stock_inmovilizado',
      sin_contenedor: 'documentacion_incompleta',
      contenedor_mal_formado: 'anomalia',
      sin_destino: 'mercaderia_sin_destino',
    };
    return map[tipo] ?? 'anomalia';
  }

  /** Mapea SeveridadIntegridad → PrioridadAlerta. */
  private mapPrioridad(severidad: SeveridadIntegridad): Alerta['prioridad'] {
    const map: Record<SeveridadIntegridad, Alerta['prioridad']> = {
      CRITICA: 'critica',
      ALTA: 'alta',
      MEDIA: 'media',
      BAJA: 'baja',
      INFORMATIVA: 'baja',
    };
    return map[severidad];
  }

  detectDuplicates(cotes: Cote[]): Alerta[] { return []; }
  detectMissingDocs(cotes: Cote[]): Alerta[] { return []; }
  detectRetained(stock: StockPallet[]): Alerta[] { return []; }
  detectImmovilized(stock: StockPallet[], dias: number): Alerta[] { return []; }
}

// --- Singleton ---

export const IntegrityEngine = new IntegrityEngineImpl();
