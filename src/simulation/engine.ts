// ============================================================
// SIMULATION ENGINE — Escenarios hipotéticos
// ------------------------------------------------------------
// Clona el snapshot, aplica eventos de simulación y calcula
// el impacto. Nunca modifica el estado real.
// ============================================================

import type {
  TwinSnapshot, BusinessEvent, Simulation, Scenario, TwinId,
} from '@/digital-twin/types';
import { applyEvents, projectInitialState } from '@/digital-twin/projectors';
import { createSimulationEvent, generateEventId } from '@/digital-twin/eventStore';
import type { Shipment, ExpRecord } from '@/lib/types';

export interface SimulationImpact {
  /** Stock total antes / después. */
  stockBefore: number;
  stockAfter: number;
  /** Exportaciones totales antes / después. */
  exportsBefore: number;
  exportsAfter: number;
  /** N° de depósitos saturados (>90% capacidad). */
  saturatedBefore: number;
  saturatedAfter: number;
  /** N° de alertas críticas. */
  alertsBefore: number;
  alertsAfter: number;
  /** Risk score promedio. */
  riskBefore: number;
  riskAfter: number;
  /** Resumen textual del impacto. */
  summary: string[];
  /** Eventos generados por la simulación. */
  events: BusinessEvent[];
}

const SCENARIO_LIST_KEY = 'trazabilidad_twin_scenarios';

// ------------------------------------------------------------
// Creadores de acciones hipotéticas
// ------------------------------------------------------------

export function simulateMoveStock(opts: {
  scenarioId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  pesoNeto: number; // kg a mover
  cotes?: string[]; // opcional: COTEs específicos
}): BusinessEvent[] {
  // Aproxima: mover todo el peso del primer lote que coincida
  return [createSimulationEvent(
    'cambio_deposito',
    'inventory_lot',
    `sim-${generateEventId()}`,
    {
      fromWarehouseId: opts.fromWarehouseId,
      toWarehouseId: opts.toWarehouseId,
      pesoNeto: opts.pesoNeto,
      cotes: opts.cotes,
    },
    opts.scenarioId,
  )];
}

export function simulateExport(opts: {
  scenarioId: string;
  pais: string;
  pesoNeto: number;
  companyId?: string;
  cote?: string;
}): BusinessEvent[] {
  return [createSimulationEvent(
    'nueva_exportacion',
    'export_operation',
    `sim-${generateEventId()}`,
    {
      cote: opts.cote || `SIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      companyId: opts.companyId || 'SIMULATION',
      destino: opts.pais,
      pais: opts.pais,
      puertoId: null,
      contenedorId: null,
      pesoNeto: opts.pesoNeto,
      envases: Math.ceil(opts.pesoNeto / 27),
      fecha: new Date().toISOString(),
    },
    opts.scenarioId,
  )];
}

export function simulateCloseWarehouse(opts: {
  scenarioId: string;
  warehouseId: string;
  targetWarehouseId: string;
}): BusinessEvent[] {
  // Mover todo el stock del depósito cerrado al destino
  return [createSimulationEvent(
    'cambio_deposito',
    'inventory_lot',
    `sim-${generateEventId()}`,
    {
      fromWarehouseId: opts.warehouseId,
      toWarehouseId: opts.targetWarehouseId,
      pesoNeto: 0, // se calculará en runtime
      allLots: true,
    },
    opts.scenarioId,
  )];
}

export function simulateNewClient(opts: {
  scenarioId: string;
  clientName: string;
  pais: string;
  pesoNeto: number;
}): BusinessEvent[] {
  return [createSimulationEvent(
    'nueva_exportacion',
    'export_operation',
    `sim-${generateEventId()}`,
    {
      cote: `SIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      companyId: 'SIMULATION',
      destino: opts.clientName,
      pais: opts.pais,
      pesoNeto: opts.pesoNeto,
      envases: Math.ceil(opts.pesoNeto / 27),
      fecha: new Date().toISOString(),
    },
    opts.scenarioId,
  )];
}

// ------------------------------------------------------------
// Ejecución de la simulación
// ------------------------------------------------------------

/** Ejecuta una lista de eventos hipotéticos sobre el snapshot y calcula el impacto. */
export function runSimulation(
  baseSnapshot: TwinSnapshot,
  events: BusinessEvent[],
): { snapshot: TwinSnapshot; impact: SimulationImpact } {
  const stockBefore = baseSnapshot.kpis.totalStockPn;
  const exportsBefore = baseSnapshot.kpis.totalExportacionesPn;
  const saturatedBefore = baseSnapshot.warehouses.filter(w => w.utilizacion > 90).length;
  const alertsBefore = baseSnapshot.kpis.alertasCriticas;
  const riskBefore = baseSnapshot.kpis.riskScorePromedio;

  // Aplicar eventos
  const newSnapshot = applyEvents(baseSnapshot, events);

  // Recalcular KPIs post-simulación
  const stockAfter = newSnapshot.kpis.totalStockPn;
  const exportsAfter = newSnapshot.kpis.totalExportacionesPn;
  const saturatedAfter = newSnapshot.warehouses.filter(w => w.utilizacion > 90).length;
  const alertsAfter = newSnapshot.kpis.alertasCriticas;
  const riskAfter = newSnapshot.kpis.riskScorePromedio;

  // Generar resumen textual
  const summary: string[] = [];
  if (stockAfter !== stockBefore) {
    const delta = stockAfter - stockBefore;
    summary.push(`Stock ${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toLocaleString('es-UY')} kg`);
  }
  if (exportsAfter !== exportsBefore) {
    const delta = exportsAfter - exportsBefore;
    summary.push(`Exportaciones ${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toLocaleString('es-UY')} kg`);
  }
  if (saturatedAfter !== saturatedBefore) {
    summary.push(`Depósitos saturados: ${saturatedBefore} → ${saturatedAfter}`);
  }
  if (alertsAfter !== alertsBefore) {
    summary.push(`Alertas: ${alertsBefore} → ${alertsAfter}`);
  }
  if (riskAfter !== riskBefore) {
    summary.push(`Riesgo: ${riskBefore.toFixed(1)} → ${riskAfter.toFixed(1)}`);
  }

  return {
    snapshot: newSnapshot,
    impact: {
      stockBefore, stockAfter,
      exportsBefore, exportsAfter,
      saturatedBefore, saturatedAfter,
      alertsBefore, alertsAfter,
      riskBefore, riskAfter,
      summary,
      events,
    },
  };
}

// ------------------------------------------------------------
// Persistencia de escenarios
// ------------------------------------------------------------

export function listScenarios(): Scenario[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SCENARIO_LIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Scenario[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveScenario(scenario: Scenario): void {
  if (typeof window === 'undefined') return;
  const all = listScenarios();
  const idx = all.findIndex(s => s.id === scenario.id);
  if (idx >= 0) all[idx] = scenario;
  else all.push(scenario);
  localStorage.setItem(SCENARIO_LIST_KEY, JSON.stringify(all));
}

export function deleteScenario(id: string): void {
  if (typeof window === 'undefined') return;
  const all = listScenarios().filter(s => s.id !== id);
  localStorage.setItem(SCENARIO_LIST_KEY, JSON.stringify(all));
  localStorage.removeItem(`trazabilidad_twin_scenario_${id}`);
}

export function createScenario(opts: {
  name: string;
  description: string;
  category: Scenario['category'];
  baseSnapshotId: string;
}): Scenario {
  return {
    id: `scn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name,
    description: opts.description,
    category: opts.category,
    createdAt: new Date().toISOString(),
    simulationIds: [],
    baseSnapshotId: opts.baseSnapshotId,
  };
}

// ------------------------------------------------------------
// Comparación de escenarios
// ------------------------------------------------------------

export interface ScenarioComparison {
  scenarioId: string;
  scenarioName: string;
  category: string;
  stockAfter: number;
  exportsAfter: number;
  saturatedAfter: number;
  alertsAfter: number;
  riskAfter: number;
}

export function compareScenarios(
  baseSnapshot: TwinSnapshot,
  scenarios: { scenario: Scenario; events: BusinessEvent[] }[],
): ScenarioComparison[] {
  return scenarios.map(({ scenario, events }) => {
    const { impact } = runSimulation(baseSnapshot, events);
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      category: scenario.category,
      stockAfter: impact.stockAfter,
      exportsAfter: impact.exportsAfter,
      saturatedAfter: impact.saturatedAfter,
      alertsAfter: impact.alertsAfter,
      riskAfter: impact.riskAfter,
    };
  });
}

// ------------------------------------------------------------
// Builder desde datos reales
// ------------------------------------------------------------

/** Construye el snapshot base desde Shipment/ExpRecord. */
export function buildBaseSnapshot(depositos: (Shipment | ExpRecord)[], exportaciones: (Shipment | ExpRecord)[]): TwinSnapshot {
  return projectInitialState(depositos, exportaciones);
}
