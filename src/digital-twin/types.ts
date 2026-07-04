// ============================================================
// DIGITAL TWIN — Modelo de dominio del gemelo digital
// ------------------------------------------------------------
// Entidades independientes con identidad propia. Cada una tiene
// una línea temporal (TimelineEvent[]) y se reconstruye desde
// el EventStore mediante projectores.
// ============================================================

import type { EntityType } from '@/domain/types';

/** ID estable de cualquier entidad. */
export type TwinId = string;

/** Tipos de entidad del gemelo digital. */
export type TwinEntityType =
  | 'company' | 'producer' | 'certifier' | 'warehouse' | 'cold_storage'
  | 'inventory_lot' | 'shipment' | 'export_operation' | 'national_operation'
  | 'client' | 'country' | 'port' | 'container' | 'vessel' | 'truck'
  | 'document' | 'inspection' | 'alert' | 'recommendation'
  | 'simulation' | 'prediction' | 'scenario';

// ------------------------------------------------------------
// Event Sourcing — tipos de evento
// ------------------------------------------------------------

export type BusinessEventType =
  | 'mercaderia_ingresada'
  | 'mercaderia_egresada'
  | 'cambio_deposito'
  | 'cambio_propietario'
  | 'cambio_certificador'
  | 'cambio_documental'
  | 'nueva_certificacion'
  | 'nueva_exportacion'
  | 'anulacion'
  | 'correccion'
  | 'inspeccion_realizada'
  | 'transferencia'
  | 'carga_balanza'
  | 'carga_iot'
  | 'cambio_temperatura'
  | ' mercaderia_retencion'
  | 'mercaderia_liberacion'
  | 'simulacion_creada'
  | 'escenario_guardado';

export interface BusinessEvent {
  id: TwinId;
  type: BusinessEventType;
  timestamp: string; // ISO
  /** Tipo de entidad afectada. */
  entityType: TwinEntityType;
  entityId: TwinId;
  /** Cambio aplicado (payload). */
  payload: Record<string, unknown>;
  /** Usuario o sistema que originó el evento. */
  actor?: string;
  /** Evento de simulación (no afecta datos reales). */
  simulation?: boolean;
  /** ID del escenario, si aplica. */
  scenarioId?: string;
  /** Evento padre que motivó éste (ej: corrección de un ingreso). */
  parentEventId?: TwinId;
}

// ------------------------------------------------------------
// Entidades del gemelo digital
// ------------------------------------------------------------

export interface InventoryLot {
  id: TwinId;
  cote: string;
  /** Empresa certificadora. */
  companyId: TwinId;
  /** Productor. */
  producerId: TwinId;
  /** Depósito actual. */
  warehouseId: TwinId;
  corte: string;
  producto: string;
  pesoNeto: number;
  envases: number;
  pallets: number;
  paisDestino?: string;
  destino?: string;
  estado: 'en_stock' | 'en_transito' | 'exportado' | 'retenido' | 'parcial' | 'sin_destino' | 'desconocido';
  fechaIngreso: string | null;
  ultimaActividad: string | null;
  diasSinMovimiento: number;
  /** True si tiene exportación vinculada. */
  tieneExportacion: boolean;
  /** Historial completo de eventos que afectaron este lote. */
  timeline: TimelineEvent[];
}

export interface InventoryMovement {
  id: TwinId;
  lotId: TwinId;
  cote: string;
  tipo: 'ingreso' | 'egreso' | 'transferencia' | 'exportacion' | 'retorno' | 'correccion';
  timestamp: string;
  origenId: TwinId | null;
  destinoId: TwinId | null;
  pesoNeto: number;
  envases: number;
  observaciones?: string;
  /** ID del evento que originó este movimiento. */
  eventId: TwinId;
}

export interface Company {
  id: TwinId;
  name: string;
  roles: TwinEntityType[];
  totalPn: number;
  embarques: number;
  marketShare: number;
  paises: number;
  cortes: number;
  clientes: number;
  riskScore: number; // 0-100, mayor = más riesgo
}

export interface Producer {
  id: TwinId;
  name: string;
  certificadorPreferidoId: TwinId | null;
  depositoPreferidoId: TwinId | null;
  totalPn: number;
  embarques: number;
  paises: string[];
  cortes: string[];
  ultimaActividad: string | null;
  activo: boolean;
  riskScore: number;
}

export interface Certifier {
  id: TwinId;
  name: string;
  totalPn: number;
  embarques: number;
  marketShare: number;
  productores: number;
  paises: number;
  cortes: number;
  riskScore: number;
}

export interface Warehouse {
  id: TwinId;
  name: string;
  totalPn: number;
  embarques: number;
  productores: number;
  marketShare: number;
  stockPn: number;
  stockPallets: number;
  /** Capacidad máxima estimada en kg. null = desconocida. */
  capacidadKg: number | null;
  /** Porcentaje de utilización (0-100). */
  utilizacion: number;
  productoresList: string[];
  riskScore: number;
}

export interface Client {
  id: TwinId;
  name: string;
  totalPn: number;
  embarques: number;
  paises: string[];
  productores: string[];
  ultimaActividad: string | null;
  activo: boolean;
  riskScore: number;
}

export interface ExportOperation {
  id: TwinId;
  cote: string;
  companyId: TwinId;
  destino: string;
  pais: string;
  puertoId: TwinId | null;
  contenedorId: TwinId | null;
  pesoNeto: number;
  envases: number;
  fecha: string | null;
  estado: 'confirmada' | 'pendiente' | 'desconocido';
}

export interface Container {
  id: TwinId;
  numero: string;
  embarques: number;
  pesoNetoTotal: number;
  ultimaActividad: string | null;
}

export interface Port {
  id: TwinId;
  name: string;
  pais: string;
  embarques: number;
  pesoNetoTotal: number;
}

export interface Country {
  id: TwinId;
  name: string;
  embarques: number;
  pesoNetoTotal: number;
  empresas: string[];
  productores: string[];
}

export interface Document {
  id: TwinId;
  tipo: string;
  numero: string;
  lotId: TwinId | null;
  fecha: string | null;
  estado: 'vigente' | 'vencido' | 'pendiente' | 'desconocido';
}

export interface Inspection {
  id: TwinId;
  lotId: TwinId | null;
  fecha: string;
  tipo: string;
  resultado: 'conforme' | 'no_conforme' | 'observacion' | 'pendiente';
  observaciones?: string;
}

export interface TimelineEvent {
  id: TwinId;
  lotId: TwinId | null;
  entityType: TwinEntityType;
  entityId: TwinId;
  type: BusinessEventType;
  timestamp: string;
  description: string;
  payload?: Record<string, unknown>;
}

export interface Prediction {
  id: TwinId;
  targetEntityType: TwinEntityType;
  targetEntityId: TwinId;
  metric: string; // 'stock_pn', 'exportaciones_pn', 'produccion_pn'
  horizon: number; // períodos futuros
  values: { label: string; value: number; lower?: number; upper?: number }[];
  method: 'moving_average' | 'linear_regression' | 'seasonal_naive';
  confidence: number; // 0-1
  generatedAt: string;
}

export interface Simulation {
  id: TwinId;
  name: string;
  description: string;
  createdAt: string;
  events: BusinessEvent[];
  scenarioId?: string;
}

export interface Scenario {
  id: TwinId;
  name: string;
  description: string;
  category: 'optimista' | 'conservador' | 'crisis' | 'exportacion' | 'mercado_interno' | 'custom';
  createdAt: string;
  simulationIds: TwinId[];
  baseSnapshotId: TwinId;
}

export interface RiskAssessment {
  entityType: TwinEntityType;
  entityId: TwinId;
  entityName: string;
  score: number; // 0-100
  level: 'bajo' | 'medio' | 'alto' | 'critico';
  factors: { code: string; label: string; weight: number; value: number }[];
}

export interface Recommendation {
  id: TwinId;
  title: string;
  description: string;
  priority: 'critica' | 'alta' | 'media' | 'baja';
  category: 'mover_stock' | 'reducir_concentracion' | 'aumentar_exportaciones'
          | 'redistribuir_depositos' | 'controlar_documentacion' | 'auditar'
          | 'reducir_riesgo' | 'reactivar_cliente' | 'diversificar';
  action: string;
  entityType?: TwinEntityType;
  entityId?: TwinId;
  expectedImpact?: string;
}

// ------------------------------------------------------------
// Snapshot — proyección del estado actual
// ------------------------------------------------------------

export interface TwinSnapshot {
  generatedAt: string;
  lots: InventoryLot[];
  movements: InventoryMovement[];
  companies: Company[];
  producers: Producer[];
  certifiers: Certifier[];
  warehouses: Warehouse[];
  clients: Client[];
  exports: ExportOperation[];
  containers: Container[];
  ports: Port[];
  countries: Country[];
  documents: Document[];
  inspections: Inspection[];
  timeline: TimelineEvent[];
  risks: RiskAssessment[];
  recommendations: Recommendation[];
  /** KPIs agregados. */
  kpis: {
    totalStockPn: number;
    totalExportacionesPn: number;
    totalDepositosPn: number;
    productoresActivos: number;
    clientesActivos: number;
    alertasCriticas: number;
    riskScorePromedio: number;
    utilizacionPromedioDepositos: number;
  };
}

// ------------------------------------------------------------
// Graph — relaciones entre entidades
// ------------------------------------------------------------

export interface GraphNode {
  id: TwinId;
  type: TwinEntityType | EntityType;
  label: string;
  weight: number;
  riskScore?: number;
}

export interface GraphEdge {
  source: TwinId;
  target: TwinId;
  type: 'certifica' | 'produce' | 'deposita' | 'exporta' | 'pertenece' | 'destina' | 'opera';
  weight: number;
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
