// ============================================================
// DOMAIN TYPES — Plataforma de Inteligencia Cárnica
// ------------------------------------------------------------
// Estas entidades COMPLEMENTAN a Shipment / ExpRecord / MovRecord.
// No los reemplazan. Se construyen mediante adapters a partir
// de los datos existentes, dejando el sistema preparado para
// crecer hacia un modelo relacional completo.
// ============================================================

/** Identificadores estables de entidades. */
export type EntityId = string;

/** Tipos de entidad soportados por el buscador universal y drawers. */
export type EntityType =
  | 'cote'
  | 'empresa'
  | 'cliente'
  | 'productor'
  | 'certificador'
  | 'deposito'
  | 'puerto'
  | 'pais'
  | 'destino'
  | 'documento'
  | 'contenedor'
  | 'corte'
  | 'producto';

/** Estado operativo de un COTE / embarque. */
export type CoteStatus =
  | 'en_stock'
  | 'en_transito'
  | 'exportado'
  | 'retenido'
  | 'parcial'
  | 'sin_destino'
  | 'desconocido';

/** Prioridad de una alerta. */
export type AlertPriority = 'critica' | 'alta' | 'media' | 'baja';

/** Categoría de una alerta. */
export type AlertCategory =
  | 'stock_inmovilizado'
  | 'stock_sin_movimiento'
  | 'mercaderia_retenida'
  | 'duplicados'
  | 'documentacion_incompleta'
  | 'mercaderia_sin_destino'
  | 'stock_en_terceros'
  | 'anomalia'
  | 'exportacion_demorada'
  | 'operacion_sospechosa';

/** Severidad de un insight generado automáticamente. */
export type InsightSeverity = 'positive' | 'negative' | 'neutral' | 'warning' | 'opportunity';

// ------------------------------------------------------------
// Entidades de dominio
// ------------------------------------------------------------

export interface Company {
  id: EntityId;
  name: string;
  /** Rol principal: certificador, productor, deposito, cliente (puede tener varios). */
  roles: EntityType[];
  /** Total peso neto certificado/depósitado (kg). */
  totalPn: number;
  embarques: number;
  /** Share de mercado % calculado sobre el período actual. */
  marketShare: number;
  paises: number;
  cortes: number;
  clientes: number;
}

export interface Producer {
  id: EntityId;
  name: string;
  certificadorPreferido: string | null;
  depositoPreferido: string | null;
  totalPn: number;
  embarques: number;
  paises: string[];
  cortes: string[];
  ultimaActividad: string | null; // ISO date
  activo: boolean; // true si tuvo actividad en los últimos 90 días
}

export interface Certifier {
  id: EntityId;
  name: string;
  totalPn: number;
  embarques: number;
  marketShare: number;
  productores: number;
  paises: number;
  cortes: number;
}

export interface Client {
  id: EntityId;
  name: string;
  totalPn: number;
  embarques: number;
  paises: string[];
  productores: string[];
  ultimaActividad: string | null;
  activo: boolean;
}

export interface Warehouse {
  id: EntityId;
  name: string;
  totalPn: number;
  embarques: number;
  productores: number;
  marketShare: number;
  stockPn: number; // peso neto en stock actual
  stockPallets: number;
  productoresList: string[];
}

export interface StockItem {
  id: EntityId;
  cote: string;
  deposito: string;
  productor: string;
  corte: string;
  producto: string;
  pesoNeto: number;
  envases: number;
  pallets: number;
  fechaIngreso: string | null;
  ultimaActividad: string | null;
  diasSinMovimiento: number;
  estado: CoteStatus;
  tieneDestino: boolean;
  tieneExportacion: boolean;
}

export interface StockMovement {
  id: EntityId;
  cote: string;
  tipo: 'ingreso' | 'transferencia' | 'exportacion' | 'retorno' | 'desconocido';
  fecha: string;
  origen: string | null;
  destino: string | null;
  pesoNeto: number;
  envases: number;
  observaciones?: string;
}

export interface ExportOperation {
  id: EntityId;
  cote: string;
  empresa: string;
  destino: string;
  pais: string;
  pesoNeto: number;
  envases: number;
  contenedor: string | null;
  puerto: string | null;
  fecha: string | null;
  estado: 'confirmada' | 'pendiente' | 'desconocido';
}

export interface Alert {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  title: string;
  description: string;
  entity?: { type: EntityType; id: EntityId; label: string };
  metric?: number;
  suggestedAction?: string;
  detectedAt: string;
}

export interface ActivityEvent {
  id: string;
  type: 'ingreso' | 'exportacion' | 'transferencia' | 'edicion' | 'nuevo_cote' | 'cambio_stock' | 'alerta';
  description: string;
  timestamp: string;
  entity?: { type: EntityType; id: EntityId; label: string };
  meta?: Record<string, string | number>;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  icon: string;
  category: 'growth' | 'decline' | 'concentration' | 'opportunity' | 'anomaly' | 'milestone' | 'warning';
  value?: number;
  entity?: string;
  trend?: number; // % change vs período anterior
}

export interface KPI {
  id: string;
  label: string;
  value: number;
  unit: 'kg' | 'count' | 'percent' | 'currency' | 'days';
  trend?: number; // % vs período anterior
  trendLabel?: string;
  icon?: string;
  color?: string;
  /** Drill-down target: si se cliquea, abrir drawer o navegar. */
  drillDown?: { type: EntityType; id?: EntityId };
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: AlertPriority;
  action: string;
  icon: string;
}

// ------------------------------------------------------------
// Filtros y preferencias
// ------------------------------------------------------------

export interface WidgetPref {
  id: string;
  visible: boolean;
  /** Orden dentro de la fila; los no visibles se ignoran. */
  order: number;
}

export interface CentroPreferences {
  widgets: WidgetPref[];
  lastUpdated: string;
}

export interface SearchResult {
  type: EntityType;
  id: EntityId;
  label: string;
  subtitle?: string;
  meta?: string;
}
