// ============================================================
// INTEGRITY ENGINE — Motor central de integridad
// ------------------------------------------------------------
// ETI-05: Valida que el TraceGraph sea coherente.
// NUNCA modifica datos. NUNCA corrige. Solo detecta.
// ============================================================

import type {
  TraceNode, TraceAlerta, Alerta, RiesgoNivel,
} from '@/domain';
import type { IntegrityEngine as IIntegrityEngine } from './interfaces';
import { TraceGraph } from './traceGraphEngine';

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

// --- Implementación ---

class IntegrityEngineImpl implements IIntegrityEngine {
  private config: ReglaConfig = DEFAULT_CONFIG;
  private logs: LogEjecucion[] = [];
  private alertasActivas: AlertaIntegridad[] = [];

  // --- Configuración ---

  setConfig(config: Partial<ReglaConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ReglaConfig {
    return this.config;
  }

  // --- API Interna ---

  validarTodo(): ResultadoIntegridad {
    const startTime = Date.now();
    const stats = TraceGraph.getStats();
    const nodes: TraceNode[] = [];

    // Obtener todos los nodos via índice por COTE
    for (const node of (TraceGraph as any).nodes.values() as IterableIterator<TraceNode>) {
      nodes.push(node);
    }

    const alertas: AlertaIntegridad[] = [];
    let scoreSum = 0;

    for (const node of nodes) {
      const nodeAlertas = this.validarNodo(node);
      alertas.push(...nodeAlertas);
      scoreSum += this.calcularScoreNodo(node, nodeAlertas);
    }

    const scoreGlobal = nodes.length > 0 ? scoreSum / nodes.length : 100;
    this.alertasActivas = alertas;

    // Construir resultado
    const porSeveridad: Record<string, number> = {};
    const porGrupo: Record<string, number> = {};
    const porTipo: Map<string, { cantidad: number; severidad: SeveridadIntegridad }> = new Map();

    for (const a of alertas) {
      porSeveridad[a.severidad] = (porSeveridad[a.severidad] || 0) + 1;
      porGrupo[a.grupo] = (porGrupo[a.grupo] || 0) + 1;
      if (!porTipo.has(a.tipo)) porTipo.set(a.tipo, { cantidad: 0, severidad: a.severidad });
      porTipo.get(a.tipo)!.cantidad++;
    }

    const matrizAnomalias = Array.from(porTipo.entries())
      .map(([tipo, v]) => ({ tipo, cantidad: v.cantidad, severidad: v.severidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const log: LogEjecucion = {
      id: `log_${Date.now()}`,
      fecha: new Date().toISOString(),
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
      alertasPorSeveridad: porSeveridad as Record<SeveridadIntegridad, number>,
      alertasPorGrupo: porGrupo as Record<GrupoIntegridad, number>,
      matrizAnomalias,
      alertas,
      log,
    };
  }

  validarNodo(node: TraceNode): AlertaIntegridad[] {
    const alertas: AlertaIntegridad[] = [];
    const now = new Date().toISOString();

    // --- GRUPO A: Estructural ---
    if (!node.nroCote) {
      alertas.push(this.crearAlerta('A_estructural', 'CRITICA', node, 'sin_cote', 'COTE vacío', 'Falta el número de COTE', 'No se puede identificar el embarque', 'Verificar el documento origen', this.config.pesoSinCOTE, now));
    }
    if (!node.productor) {
      alertas.push(this.crearAlerta('A_estructural', 'ALTA', node, 'sin_productor', 'Productor vacío', 'Falta el nombre del productor', 'No se puede atribuir el origen', 'Verificar el campo productor', this.config.pesoSinProductor, now));
    }
    if (!node.certificadora) {
      alertas.push(this.crearAlerta('A_estructural', 'ALTA', node, 'sin_certificadora', 'Certificadora vacía', 'Falta la certificadora', 'No se puede atribuir la certificación', 'Verificar el campo certificadora', this.config.pesoSinCertificadora, now));
    }
    if (node.ingreso && !node.ingreso.deposito) {
      alertas.push(this.crearAlerta('A_estructural', 'MEDIA', node, 'sin_deposito', 'Depósito vacío', 'Falta el depósito de ingreso', 'No se sabe dónde está la mercadería', 'Verificar el campo depósito', this.config.pesoSinDeposito, now));
    }
    if (node.ingreso && !node.ingreso.fecha) {
      alertas.push(this.crearAlerta('A_estructural', 'MEDIA', node, 'sin_fecha_ingreso', 'Fecha de ingreso vacía', 'Falta la fecha de ingreso', 'No se puede verificar cronología', 'Verificar la fecha', this.config.pesoSinFecha, now));
    }
    if (node.ingreso && node.ingreso.pesoNeto === 0) {
      alertas.push(this.crearAlerta('A_estructural', 'ALTA', node, 'sin_peso', 'Peso neto cero', 'El peso neto del ingreso es cero', 'No se puede calcular stock', 'Verificar el peso', this.config.pesoSinPeso, now));
    }
    if (node.ingreso && node.ingreso.cajas === 0) {
      alertas.push(this.crearAlerta('A_estructural', 'MEDIA', node, 'sin_cajas', 'Cajas cero', 'La cantidad de cajas del ingreso es cero', 'No se puede conciliar', 'Verificar las cajas', this.config.pesoSinCajas, now));
    }

    // --- GRUPO B: Documental ---
    if (!node.ingreso && node.exportaciones.length > 0) {
      alertas.push(this.crearAlerta('B_documental', 'CRITICA', node, 'sin_ingreso', 'Exportación sin ingreso', 'Hay exportaciones pero no hay ingreso relacionado', 'No se puede verificar el origen de la mercadería', 'Vincular un ingreso o crearlo manualmente', this.config.pesoSinIngreso, now));
    }
    // Documentos duplicados en exportaciones
    const docsExp = node.exportaciones.map(e => e.documento);
    const docsDups = docsExp.filter((d, i) => docsExp.indexOf(d) !== i);
    if (docsDups.length > 0) {
      alertas.push(this.crearAlerta('B_documental', 'CRITICA', node, 'doc_duplicado', 'Documento duplicado', `Documento(s) repetido(s): ${docsDups.join(', ')}`, 'Posible doble exportación', 'Verificar y eliminar duplicados', this.config.pesoDocumentoDuplicado, now));
    }

    // --- GRUPO C: Cronológico ---
    if (node.ingreso && node.ingreso.fecha) {
      const fechaIng = new Date(node.ingreso.fecha);
      for (const exp of node.exportaciones) {
        if (exp.fecha) {
          const fechaExp = new Date(exp.fecha);
          if (fechaExp < fechaIng) {
            alertas.push(this.crearAlerta('C_cronologico', 'ALTA', node, 'exp_antes_ing', 'Exportación anterior al ingreso', `Exportación ${exp.documento} es anterior al ingreso`, 'Cronología imposible', 'Verificar fechas', this.config.pesoExportacionAntesIngreso, now));
          }
        }
      }
      // Fecha futura
      const now2 = new Date();
      if (fechaIng > now2) {
        alertas.push(this.crearAlerta('C_cronologico', 'ALTA', node, 'fecha_futura', 'Fecha futura', `Fecha de ingreso ${node.ingreso.fecha} es futura`, 'Fecha imposible', 'Corregir la fecha', this.config.pesoFechaFutura, now));
      }
    }

    // --- GRUPO D: Logístico ---
    if (node.stock.saldoCajas < 0) {
      alertas.push(this.crearAlerta('D_logistico', 'CRITICA', node, 'saldo_negativo', 'Saldo negativo', `Saldo de cajas: ${node.stock.saldoCajas}`, 'Se exportó más de lo ingresado', 'Verificar exportaciones o agregar ingreso faltante', this.config.pesoSaldoNegativo, now));
    }
    if (node.stock.exportadoCajas > node.stock.ingresoCajas && node.stock.ingresoCajas > 0) {
      alertas.push(this.crearAlerta('D_logistico', 'CRITICA', node, 'sobreexportacion', 'Sobreexportación', `Ingreso: ${node.stock.ingresoCajas} cajas, Exportado: ${node.stock.exportadoCajas} cajas`, 'Se exportó más de lo ingresado', 'Verificar exportaciones', this.config.pesoSobreexportacion, now));
    }

    // --- GRUPO E: Comercial ---
    if (node.exportaciones.length > 0 && !node.cliente) {
      alertas.push(this.crearAlerta('E_comercial', 'BAJA', node, 'sin_cliente', 'Cliente vacío', 'No hay cliente asignado', 'No se puede atribuir el destino comercial', 'Verificar el cliente', this.config.pesoSinCliente, now));
    }
    if (node.exportaciones.length > 0 && !node.paisDestino) {
      alertas.push(this.crearAlerta('E_comercial', 'BAJA', node, 'sin_pais', 'País vacío', 'No hay país de destino', 'No se puede atribuir el destino geográfico', 'Verificar el país', this.config.pesoSinPais, now));
    }

    // --- GRUPO F: Matemático ---
    if (node.ingreso && node.ingreso.pesoNeto < 0) {
      alertas.push(this.crearAlerta('F_matematico', 'CRITICA', node, 'peso_negativo', 'Peso neto negativo', `Peso: ${node.ingreso.pesoNeto} kg`, 'Valor imposible', 'Corregir el peso', this.config.pesoPesoInconsistente, now));
    }
    if (node.ingreso && node.ingreso.cajas < 0) {
      alertas.push(this.crearAlerta('F_matematico', 'CRITICA', node, 'cajas_negativas', 'Cajas negativas', `Cajas: ${node.ingreso.cajas}`, 'Valor imposible', 'Corregir las cajas', this.config.pesoCajasInconsistentes, now));
    }
    // Verificar que la suma de cajas de exportaciones no exceda el ingreso
    if (node.ingreso && node.ingreso.cajas > 0) {
      const totalExpCajas = node.exportaciones.reduce((s, e) => s + e.cajas, 0);
      if (totalExpCajas > node.ingreso.cajas + this.config.cajasTolerancia) {
        alertas.push(this.crearAlerta('F_matematico', 'CRITICA', node, 'cajas_inconsistentes', 'Cajas inconsistentes', `Ingreso: ${node.ingreso.cajas}, Exportado: ${totalExpCajas}`, 'La suma de exportaciones excede el ingreso', 'Verificar exportaciones', this.config.pesoCajasInconsistentes, now));
      }
    }

    // --- GRUPO G: Operativo ---
    // Mercadería inmovilizada > 180 días
    if (node.ingreso && node.ingreso.fecha && node.stock.saldoCajas > 0) {
      const dias = Math.floor((Date.now() - new Date(node.ingreso.fecha).getTime()) / (1000 * 60 * 60 * 24));
      if (dias > 180) {
        alertas.push(this.crearAlerta('G_operativo', 'MEDIA', node, 'inmovilizado', 'Mercadería inmovilizada', `${dias} días sin movimiento`, 'Stock inmovilizado >180 días', 'Gestionar retorno o reasignar', 5, now));
      }
    }

    return alertas;
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

  validate(cotes: any[], ingresos: any[], exportaciones: any[], stock: any[]): Alerta[] {
    const result = this.validarTodo();
    return result.alertas.map(a => ({
      id: a.id,
      categoria: a.tipo as any,
      prioridad: a.severidad.toLowerCase() as any,
      titulo: a.mensaje,
      descripcion: `${a.causa}. Impacto: ${a.impacto}. Recomendación: ${a.recomendacion}`,
      entidad: { tipo: 'cote', id: a.nodoId, label: a.nroCote },
      metrica: a.peso,
      accionSugerida: a.recomendacion,
      detectadaEn: a.detectadaEn,
    })) as Alerta[];
  }

  detectDuplicates(cotes: any[]): Alerta[] { return []; }
  detectMissingDocs(cotes: any[]): Alerta[] { return []; }
  detectRetained(stock: any[]): Alerta[] { return []; }
  detectImmovilized(stock: any[], dias: number): Alerta[] { return []; }

  // --- Helper ---

  private crearAlerta(
    grupo: GrupoIntegridad,
    severidad: SeveridadIntegridad,
    node: TraceNode,
    tipo: string,
    titulo: string,
    causa: string,
    impacto: string,
    recomendacion: string,
    peso: number,
    fecha: string,
  ): AlertaIntegridad {
    return {
      id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      grupo, severidad, nodoId: node.id, nroCote: node.nroCote,
      tipo, mensaje: titulo, causa, impacto, recomendacion, peso, detectadaEn: fecha,
    };
  }
}

// --- Singleton ---

export const IntegrityEngine = new IntegrityEngineImpl();
