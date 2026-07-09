// ============================================================
// CONCILIATION ENGINE — Motor de Conciliación y Trazabilidad
// ------------------------------------------------------------
// ETI-09: Reconstruye el recorrido completo de cada lote desde
// ingreso hasta destino. Vincula ingresos con exportaciones y
// stock. Genera TraceFlow con confianza explicable.
// ============================================================

import type {
  Ingreso, Exportacion, StockPallet, TraceNode,
} from '@/domain';
import { TraceGraph } from './traceGraphEngine';

// --- TraceFlow ---

export interface TraceFlowEvento {
  id: string;
  tipo: 'ingreso' | 'recepcion' | 'cambio_deposito' | 'movimiento_interno'
      | 'consolidacion' | 'division_lote' | 'exportacion_parcial'
      | 'exportacion_total' | 'ajuste' | 'correccion_manual' | 'bloqueo' | 'desbloqueo';
  fecha: string;
  origen: string | null;
  destino: string | null;
  pesoNeto: number;
  cajas: number;
  documento: string;
  usuario: string | null;
  referencia: string | null;
}

export interface TraceFlow {
  id: string;
  cote: string;
  empresa: string;
  productor: string;
  certificadora: string;
  fechaCreacion: string;
  estado: TraceFlowEstado;
  integridad: number;   // 0-100
  riesgo: number;       // 0-100
  eventos: TraceFlowEvento[];
  relaciones: string[]; // COTEs relacionados
  conciliaciones: Conciliacion[];
  saldo: { cajas: number; pesoNeto: number };
}

export type TraceFlowEstado =
  | 'ABIERTO' | 'CONCILIADO_PARCIAL' | 'CONCILIADO_TOTAL'
  | 'CON_DIFERENCIAS' | 'HUERFANO' | 'BLOQUEADO' | 'ARCHIVADO';

// --- Niveles de conciliación ---

export type NivelConciliacion = 1 | 2 | 3 | 4 | 5;

export interface Conciliacion {
  id: string;
  ingresoId: string;
  exportacionId: string;
  nivel: NivelConciliacion;
  confianza: number;     // 0-100
  estado: 'automatica' | 'manual' | 'pendiente' | 'rechazada';
  explicacion: string[];
  diferenciaCajas: number;
  diferenciaPeso: number;
  fecha: string;
  usuario: string | null;
}

// --- Configuración ---

export interface ConciliacionConfig {
  toleranciaPesoKg: number;
  toleranciaPesoPct: number;
  toleranciaCajas: number;
  diasProximidad: number;
  umbralConfianzaAlta: number;   // >= → automática
  umbralConfianzaMedia: number;  // >= → pendiente revisión
  diasIngresoSinExportacion: number; // alerta si > N días
}

export const DEFAULT_CONCILIACION_CONFIG: ConciliacionConfig = {
  toleranciaPesoKg: 5,
  toleranciaPesoPct: 0.5,
  toleranciaCajas: 0,
  diasProximidad: 7,
  umbralConfianzaAlta: 95,
  umbralConfianzaMedia: 70,
  diasIngresoSinExportacion: 90,
};

// --- Indicadores ---

export interface ConciliacionStats {
  total: number;
  automaticas: number;
  manuales: number;
  pendientes: number;
  rechazadas: number;
  confianzaPromedio: number;
  huerfanos: number;
  diferenciasDetectadas: number;
}

// --- Implementación ---

class ConciliationEngineImpl {
  private config: ConciliacionConfig = DEFAULT_CONCILIACION_CONFIG;
  private flows: Map<string, TraceFlow> = new Map();
  private statsCache: ConciliacionStats | null = null;

  setConfig(config: Partial<ConciliacionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ConciliacionConfig {
    return this.config;
  }

  // --- Construir TraceFlows desde datos ---

  buildFlows(ingresos: Ingreso[], exportaciones: Exportacion[], stock: StockPallet[]): TraceFlow[] {
    this.flows.clear();
    const now = new Date().toISOString();

    // 1. Crear flows desde ingresos
    for (const ing of ingresos) {
      if (!ing.nroCote) continue;
      const flow = this.getOrCreateFlow(ing.nroCote);
      flow.empresa = ing.depositoId || flow.empresa;
      flow.productor = ing.productorId || flow.productor;
      flow.eventos.push({
        id: `evt_${ing.id}`,
        tipo: 'ingreso',
        fecha: ing.fecha,
        origen: ing.productorId,
        destino: ing.depositoId,
        pesoNeto: ing.pesoNeto,
        cajas: ing.cantidadEnvases,
        documento: String(ing.nroTramite),
        usuario: null,
        referencia: null,
      });
      flow.saldo.cajas += ing.cantidadEnvases;
      flow.saldo.pesoNeto += ing.pesoNeto;
    }

    // 2. Agregar exportaciones a los flows
    for (const exp of exportaciones) {
      if (!exp.nroCote) continue;
      const flow = this.getOrCreateFlow(exp.nroCote);
      flow.certificadora = exp.certificadoraId || flow.certificadora;
      flow.empresa = exp.certificadoraId || flow.empresa;
      flow.eventos.push({
        id: `evt_${exp.id}`,
        tipo: exp.pesoNeto >= flow.saldo.pesoNeto ? 'exportacion_total' : 'exportacion_parcial',
        fecha: exp.fecha,
        origen: exp.certificadoraId,
        destino: exp.paisDestino,
        pesoNeto: exp.pesoNeto,
        cajas: exp.cantidadEnvases,
        documento: String(exp.nroTramite),
        usuario: null,
        referencia: exp.contenedor,
      });
    }

    // 3. Conciliar automáticamente
    this.conciliarAutomaticamente(ingresos, exportaciones);

    // 4. Calcular saldos y estados
    for (const flow of this.flows.values()) {
      this.recalculateFlow(flow);
    }

    // 5. Agregar stock de pallets
    for (const p of stock) {
      if (!p.codigo) continue;
      const flow = this.flows.get(p.codigo);
      if (flow) {
        // El stock de pallets es la fuente de verdad del stock real
        flow.saldo.pesoNeto = p.kilos;
        flow.saldo.cajas = p.cajas;
      }
    }

    this.statsCache = null; // invalidar cache
    return Array.from(this.flows.values());
  }

  // --- Conciliación automática ---

  private conciliarAutomaticamente(ingresos: Ingreso[], exportaciones: Exportacion[]): void {
    // Indexar por COTE
    const ingByCote = new Map<string, Ingreso[]>();
    for (const ing of ingresos) {
      if (!ing.nroCote) continue;
      if (!ingByCote.has(ing.nroCote)) ingByCote.set(ing.nroCote, []);
      ingByCote.get(ing.nroCote)!.push(ing);
    }

    const expByCote = new Map<string, Exportacion[]>();
    for (const exp of exportaciones) {
      if (!exp.nroCote) continue;
      if (!expByCote.has(exp.nroCote)) expByCote.set(exp.nroCote, []);
      expByCote.get(exp.nroCote)!.push(exp);
    }

    // Para cada COTE que tenga ingreso y exportación
    for (const [cote, ings] of ingByCote) {
      const exps = expByCote.get(cote);
      if (!exps || exps.length === 0) continue;

      const flow = this.flows.get(cote);
      if (!flow) continue;

      // Si hay 1 ingreso y N exportaciones → distribución proporcional
      if (ings.length === 1 && exps.length > 1) {
        this.conciliarUnoAMuchos(ings[0], exps, flow);
      } else if (ings.length > 1 && exps.length === 1) {
        this.conciliarMuchosAUno(ings, exps[0], flow);
      } else {
        // 1:1 o N:M → conciliar uno a uno por orden
        for (let i = 0; i < Math.min(ings.length, exps.length); i++) {
          this.crearConciliacion(ings[i], exps[i], flow);
        }
      }
    }

    // Exportaciones sin ingreso → huérfanos
    for (const [cote, exps] of expByCote) {
      if (!ingByCote.has(cote)) {
        const flow = this.flows.get(cote);
        if (flow) {
          flow.estado = 'HUERFANO';
          flow.integridad = 30;
        }
      }
    }
  }

  // --- 1 a muchos: distribuir proporcionalmente ---

  private conciliarUnoAMuchos(ing: Ingreso, exps: Exportacion[], flow: TraceFlow): void {
    const totalExpPn = exps.reduce((s, e) => s + e.pesoNeto, 0);
    const totalExpCajas = exps.reduce((s, e) => s + e.cantidadEnvases, 0);

    // Distribución proporcional sin pérdida de unidades
    let cajasAcumuladas = 0;
    let pnAcumulado = 0;

    for (let i = 0; i < exps.length; i++) {
      const exp = exps[i];
      let cajasAsignadas: number;
      let pnAsignado: number;

      if (i === exps.length - 1) {
        // Último: recibe el remanente para conservar el total
        cajasAsignadas = ing.cantidadEnvases - cajasAcumuladas;
        pnAsignado = ing.pesoNeto - pnAcumulado;
      } else {
        const proporcion = exp.pesoNeto / totalExpPn;
        cajasAsignadas = Math.round(ing.cantidadEnvases * proporcion);
        pnAsignado = Math.round(ing.pesoNeto * (exp.pesoNeto / totalExpPn));
        cajasAcumuladas += cajasAsignadas;
        pnAcumulado += pnAsignado;
      }

      const nivel = this.evaluarNivel(ing, exp, Math.abs(pnAsignado - exp.pesoNeto), Math.abs(cajasAsignadas - exp.cantidadEnvases));
      flow.conciliaciones.push({
        id: `con_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ingresoId: ing.id,
        exportacionId: exp.id,
        nivel: nivel.nivel,
        confianza: nivel.confianza,
        estado: nivel.confianza >= this.config.umbralConfianzaAlta ? 'automatica' : 'pendiente',
        explicacion: nivel.explicacion,
        diferenciaCajas: cajasAsignadas - exp.cantidadEnvases,
        diferenciaPeso: pnAsignado - exp.pesoNeto,
        fecha: new Date().toISOString(),
        usuario: null,
      });
    }
  }

  // --- Muchos a uno ---

  private conciliarMuchosAUno(ings: Ingreso[], exp: Exportacion, flow: TraceFlow): void {
    for (const ing of ings) {
      this.crearConciliacion(ing, exp, flow);
    }
  }

  // --- Crear conciliación 1:1 ---

  private crearConciliacion(ing: Ingreso, exp: Exportacion, flow: TraceFlow): void {
    const diffPeso = Math.abs(ing.pesoNeto - exp.pesoNeto);
    const diffCajas = Math.abs(ing.cantidadEnvases - exp.cantidadEnvases);
    const nivel = this.evaluarNivel(ing, exp, diffPeso, diffCajas);

    flow.conciliaciones.push({
      id: `con_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ingresoId: ing.id,
      exportacionId: exp.id,
      nivel: nivel.nivel,
      confianza: nivel.confianza,
      estado: nivel.confianza >= this.config.umbralConfianzaAlta ? 'automatica' : 'pendiente',
      explicacion: nivel.explicacion,
      diferenciaCajas: diffCajas,
      diferenciaPeso: diffPeso,
      fecha: new Date().toISOString(),
      usuario: null,
    });
  }

  // --- Evaluar nivel de conciliación ---

  private evaluarNivel(ing: Ingreso, exp: Exportacion, diffPeso: number, diffCajas: number): {
    nivel: NivelConciliacion; confianza: number; explicacion: string[];
  } {
    const explicacion: string[] = [];
    explicacion.push(`Mismo COTE: ${ing.nroCote}`);

    // Nivel 1: exacta
    if (diffPeso <= this.config.toleranciaPesoKg && diffCajas <= this.config.toleranciaCajas) {
      explicacion.push(`Diferencia peso: ${diffPeso.toFixed(1)} kg (tolerancia: ${this.config.toleranciaPesoKg} kg)`);
      explicacion.push(`Diferencia cajas: ${diffCajas} (tolerancia: ${this.config.toleranciaCajas})`);
      return { nivel: 1, confianza: 100, explicacion };
    }

    // Nivel 2: alta (COTE + documento, pequeñas diferencias)
    if (diffPeso <= this.config.toleranciaPesoKg * 2 && diffCajas <= 2) {
      explicacion.push(`Diferencia peso: ${diffPeso.toFixed(1)} kg (dentro de 2x tolerancia)`);
      explicacion.push(`Diferencia cajas: ${diffCajas}`);
      return { nivel: 2, confianza: 97, explicacion };
    }

    // Nivel 3: media (COTE + peso aproximado + fecha cercana)
    const diasDiff = Math.abs(new Date(ing.fecha).getTime() - new Date(exp.fecha).getTime()) / (1000 * 60 * 60 * 24);
    if (diasDiff <= this.config.diasProximidad) {
      explicacion.push(`Diferencia peso: ${diffPeso.toFixed(1)} kg`);
      explicacion.push(`Diferencia cajas: ${diffCajas}`);
      explicacion.push(`Días entre ingreso y exportación: ${diasDiff.toFixed(0)}`);
      return { nivel: 3, confianza: 82, explicacion };
    }

    // Nivel 4: baja (coincidencias parciales)
    explicacion.push(`Diferencia peso: ${diffPeso.toFixed(1)} kg`);
    explicacion.push(`Diferencia cajas: ${diffCajas}`);
    explicacion.push(`Días entre ingreso y exportación: ${diasDiff.toFixed(0)}`);
    return { nivel: 4, confianza: 61, explicacion };

    // Nivel 5: sin conciliación — se maneja en el flujo general
  }

  // --- Recalcular flow ---

  private recalculateFlow(flow: TraceFlow): void {
    const ingCajas = flow.eventos.filter(e => e.tipo === 'ingreso').reduce((s, e) => s + e.cajas, 0);
    const ingPn = flow.eventos.filter(e => e.tipo === 'ingreso').reduce((s, e) => s + e.pesoNeto, 0);
    const expCajas = flow.eventos.filter(e => e.tipo.startsWith('exportacion')).reduce((s, e) => s + e.cajas, 0);
    const expPn = flow.eventos.filter(e => e.tipo.startsWith('exportacion')).reduce((s, e) => s + e.pesoNeto, 0);

    flow.saldo = {
      cajas: ingCajas - expCajas,
      pesoNeto: ingPn - expPn,
    };

    // Estado
    if (flow.estado === 'HUERFANO') {
      // mantener
    } else if (flow.conciliaciones.length === 0 && expCajas === 0) {
      flow.estado = 'ABIERTO';
    } else if (expCajas === 0) {
      flow.estado = 'ABIERTO';
    } else if (expCajas < ingCajas) {
      flow.estado = 'CONCILIADO_PARCIAL';
    } else if (expCajas === ingCajas) {
      flow.estado = 'CONCILIADO_TOTAL';
    } else if (expCajas > ingCajas) {
      flow.estado = 'CON_DIFERENCIAS';
    } else {
      flow.estado = 'CON_DIFERENCIAS';
    }

    // Integridad
    flow.integridad = this.calcularIntegridad(flow);

    // Riesgo
    flow.riesgo = this.calcularRiesgo(flow);
  }

  private calcularIntegridad(flow: TraceFlow): number {
    let score = 100;
    if (flow.estado === 'HUERFANO') score -= 40;
    if (flow.saldo.cajas < 0) score -= 25;
    if (flow.estado === 'CON_DIFERENCIAS') score -= 20;
    const pendientes = flow.conciliaciones.filter(c => c.estado === 'pendiente').length;
    score -= pendientes * 5;
    return Math.max(0, Math.min(100, score));
  }

  private calcularRiesgo(flow: TraceFlow): number {
    let score = 100 - flow.integridad;
    if (flow.saldo.cajas < 0) score += 20;
    if (flow.estado === 'HUERFANO') score += 15;
    return Math.min(100, Math.max(0, score));
  }

  // --- Get or create flow ---

  private getOrCreateFlow(cote: string): TraceFlow {
    if (!this.flows.has(cote)) {
      this.flows.set(cote, {
        id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        cote,
        empresa: '',
        productor: '',
        certificadora: '',
        fechaCreacion: new Date().toISOString(),
        estado: 'ABIERTO',
        integridad: 100,
        riesgo: 0,
        eventos: [],
        relaciones: [],
        conciliaciones: [],
        saldo: { cajas: 0, pesoNeto: 0 },
      });
    }
    return this.flows.get(cote)!;
  }

  // --- API pública ---

  obtenerFlow(cote: string): TraceFlow | null {
    return this.flows.get(cote) || null;
  }

  obtenerTodos(): TraceFlow[] {
    return Array.from(this.flows.values());
  }

  obtenerPorEstado(estado: TraceFlowEstado): TraceFlow[] {
    return Array.from(this.flows.values()).filter(f => f.estado === estado);
  }

  obtenerStats(): ConciliacionStats {
    if (this.statsCache) return this.statsCache;
    const flows = Array.from(this.flows.values());
    const allConc = flows.flatMap(f => f.conciliaciones);
    const total = allConc.length;
    const automaticas = allConc.filter(c => c.estado === 'automatica').length;
    const manuales = allConc.filter(c => c.estado === 'manual').length;
    const pendientes = allConc.filter(c => c.estado === 'pendiente').length;
    const rechazadas = allConc.filter(c => c.estado === 'rechazada').length;
    const confianzaProm = total > 0 ? allConc.reduce((s, c) => s + c.confianza, 0) / total : 0;
    const huerfanos = flows.filter(f => f.estado === 'HUERFANO').length;
    const diferencias = allConc.filter(c => c.diferenciaCajas > 0 || c.diferenciaPeso > this.config.toleranciaPesoKg).length;

    this.statsCache = {
      total, automaticas, manuales, pendientes, rechazadas,
      confianzaPromedio: confianzaProm, huerfanos: huerfanos, diferenciasDetectadas: diferencias,
    };
    return this.statsCache;
  }

  // --- Resolución manual ---

  confirmarConciliacion(flowId: string, conciliacionId: string, usuario: string, motivo: string): boolean {
    const flow = Array.from(this.flows.values()).find(f => f.id === flowId);
    if (!flow) return false;
    const con = flow.conciliaciones.find(c => c.id === conciliacionId);
    if (!con) return false;
    con.estado = 'manual';
    con.usuario = usuario;
    con.fecha = new Date().toISOString();
    con.explicacion.push(`Confirmación manual por ${usuario}: ${motivo}`);
    this.recalculateFlow(flow);
    this.statsCache = null;
    return true;
  }

  rechazarConciliacion(flowId: string, conciliacionId: string, usuario: string, motivo: string): boolean {
    const flow = Array.from(this.flows.values()).find(f => f.id === flowId);
    if (!flow) return false;
    const con = flow.conciliaciones.find(c => c.id === conciliacionId);
    if (!con) return false;
    con.estado = 'rechazada';
    con.usuario = usuario;
    con.fecha = new Date().toISOString();
    con.explicacion.push(`Rechazado por ${usuario}: ${motivo}`);
    this.recalculateFlow(flow);
    this.statsCache = null;
    return true;
  }

  // --- Trazabilidad bidireccional ---

  trazarDesdeIngreso(cote: string): TraceFlow | null {
    return this.obtenerFlow(cote);
  }

  trazarDesdeExportacion(cote: string): TraceFlow | null {
    return this.obtenerFlow(cote);
  }
}

// --- Singleton ---

export const ConciliationEngine = new ConciliationEngineImpl();
