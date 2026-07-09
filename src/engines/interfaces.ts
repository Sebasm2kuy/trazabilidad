// ============================================================
// ENGINE INTERFACES — Contratos de los motores de cálculo
// ------------------------------------------------------------
// Cada motor tiene UNA responsabilidad. Los KPIs se calculan
// UNA sola vez aquí. Las pantallas solo consumen los resultados.
// ============================================================

import type {
  Cote, Ingreso, Exportacion, StockPallet, Movimiento,
  Alerta, Indicador, TraceNode, TraceEstado, RiesgoNivel,
  MatrizCaptura, TraceIngreso, TraceExportacion,
} from '@/domain';

// --- TraceGraph Engine ---
// Construye el grafo de trazabilidad: la línea de tiempo completa
// de cada COTE desde producción hasta exportación.
// ES LA ÚNICA FUENTE DE VERDAD de trazabilidad.

export interface TraceGraphEngine {
  /** Construye el grafo de trazabilidad para todos los COTEs. */
  buildGraph(cotes: Cote[], ingresos: Ingreso[], exportaciones: Exportacion[], movimientos: Movimiento[]): TraceNode[];
  /** Obtiene la trazabilidad de un COTE específico. */
  getTrace(nroCote: string): TraceNode[];
  /** Obtiene el siguiente evento esperado para un COTE. */
  getNextExpectedEvent(nroCote: string): string | null;
  /** Búsqueda por productor. */
  getByProductor(productor: string): TraceNode[];
  /** Búsqueda por certificadora. */
  getByCertificadora(cert: string): TraceNode[];
  /** Búsqueda por depósito. */
  getByDeposito(deposito: string): TraceNode[];
  /** Búsqueda por estado. */
  getByEstado(estado: TraceEstado): TraceNode[];
  /** Búsqueda por nivel de riesgo. */
  getByRiesgo(riesgo: RiesgoNivel): TraceNode[];
  /** Búsqueda por país. */
  getByPais(pais: string): TraceNode[];
  /** Búsqueda por cliente. */
  getByCliente(cliente: string): TraceNode[];
  /** Estadísticas generales del grafo. */
  getStats(): {
    total: number;
    porEstado: Record<TraceEstado, number>;
    integridadPromedio: number;
    alertasTotal: number;
    stockTotalPn: number;
    stockTotalCajas: number;
  };
  /** Suscribirse a cambios del grafo. */
  subscribe(listener: (node: TraceNode, event: any) => void): () => void;
  /** Trazabilidad inversa de un COTE. */
  getTrazabilidadInversa(nroCote: string): {
    ingreso: TraceIngreso | null;
    exportaciones: TraceExportacion[];
    pallets: StockPallet[];
    cliente: string | null;
    certificadora: string;
    productor: string;
  } | null;
  /** Agregar stock de pallets a nodos existentes. */
  addPallets(pallets: StockPallet[]): void;
}

// --- Integrity Engine ---
// Valida la integridad de los datos: duplicados, inconsistencias,
// documentación faltante, mercadería sin destino.

export interface IntegrityEngine {
  /** Valida todos los datos y genera alertas de integridad. */
  validate(cotes: Cote[], ingresos: Ingreso[], exportaciones: Exportacion[], stock: StockPallet[]): Alerta[];
  /** Detecta duplicados de COTE. */
  detectDuplicates(cotes: Cote[]): Alerta[];
  /** Detecta mercadería sin documentación. */
  detectMissingDocs(cotes: Cote[]): Alerta[];
  /** Detecta mercadería retenida. */
  detectRetained(stock: StockPallet[]): Alerta[];
  /** Detecta mercadería sin movimiento > N días. */
  detectImmovilized(stock: StockPallet[], dias: number): Alerta[];
}

// --- KPI Engine ---
// Calcula TODOS los KPIs del sistema. UNA sola fuente de verdad.

export interface KPIEngine {
  /** Calcula todos los KPIs operacionales. */
  calculate(stock: StockPallet[], ingresos: Ingreso[], exportaciones: Exportacion[]): Indicador[];
  /** Calcula el índice de captura de CALIRAL para un cliente. */
  calculateCaptureIndex(ingresos: Ingreso[], exportaciones: Exportacion[], clienteAliases: string[]): {
    totalClientePn: number;
    caliralDepositoPn: number;
    caliralCertificacionPn: number;
    captureIndex: number;
    matriz: MatrizCaptura;
  };
  /** Calcula el stock total. */
  calculateStock(stock: StockPallet[]): { totalKg: number; totalCajas: number; totalPallets: number; cotes: number };
}

// --- Risk Engine ---
// Evalúa riesgos operacionales y comerciales.

export interface RiskEngine {
  /** Evalúa el riesgo de todas las entidades. */
  assess(stock: StockPallet[], ingresos: Ingreso[], exportaciones: Exportacion[]): Alerta[];
  /** Detecta concentración de stock. */
  detectConcentration(stock: StockPallet[]): Alerta[];
  /** Detecta dependencia de un solo cliente/país. */
  detectDependency(exportaciones: Exportacion[]): Alerta[];
}

// --- Prediction Engine ---
// Genera predicciones basadas en histórico.

export interface PredictionEngine {
  /** Predice stock futuro. */
  predictStock(ingresos: Ingreso[], exportaciones: Exportacion[], horizon: number): Indicador[];
  /** Predice saturación de depósitos. */
  predictWarehouseSaturation(stock: StockPallet[], ingresos: Ingreso[], horizon: number): any[];
}

// --- Stock Engine ---
// Calcula el estado del stock. UNA sola fuente de verdad.

export interface StockEngine {
  /** Calcula el stock real = ingresos − exportaciones por COTE. */
  calculateRealStock(ingresos: Ingreso[], exportaciones: Exportacion[], pallets: StockPallet[]): any[];
  /** Calcula stock inmovilizado. */
  calculateImmovilized(pallets: StockPallet[], dias: number): StockPallet[];
  /** Calcula stock por depósito. */
  calculateByDeposito(pallets: StockPallet[]): any[];
}

// --- Market Engine ---
// Analiza el mercado nacional (MGAP).

export interface MarketEngine {
  /** Calcula participación de mercado. */
  calculateMarketShare(exportaciones: Exportacion[]): any[];
  /** Calcula ranking de empresas. */
  calculateRanking(exportaciones: Exportacion[]): any[];
  /** Calcula tendencia mensual. */
  calculateMonthlyTrend(exportaciones: Exportacion[]): any[];
}

// --- Analytics Engine ---
// Genera insights automáticos.

export interface AnalyticsEngine {
  /** Genera insights a partir del estado actual. */
  generateInsights(stock: StockPallet[], ingresos: Ingreso[], exportaciones: Exportacion[], alertas: Alerta[]): any[];
}

// --- Dashboard Engine ---
// Agrega todos los motores para el dashboard.

export interface DashboardEngine {
  /** Calcula todos los KPIs para el dashboard. */
  calculateDashboard(stock: StockPallet[], ingresos: Ingreso[], exportaciones: Exportacion[]): {
    kpis: Indicador[];
    alerts: Alerta[];
    insights: any[];
    trends: any[];
  };
}

// --- Search Engine ---
// Búsqueda global de entidades.

export interface SearchEngine {
  search(query: string, cotes: Cote[], ingresos: Ingreso[], exportaciones: Exportacion[], stock: StockPallet[]): any[];
}

// --- Audit Engine ---
// Auditoría de cambios.

export interface AuditEngine {
  log(event: string, entityId: string, details: Record<string, unknown>): void;
  getHistory(entityId: string): any[];
}
