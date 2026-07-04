// ============================================================
// EVENT STORE — Almacén append-only de eventos de negocio
// ------------------------------------------------------------
// Implementa event sourcing puro. Los eventos son la única
// fuente de verdad; el estado se reconstruye proyectándolos.
// Persistencia: localStorage + Firebase sync (reutiliza claves).
// ============================================================

import type { BusinessEvent, BusinessEventType, TwinId, TwinEntityType } from './types';

const STORAGE_KEY = 'trazabilidad_twin_events';
const SCENARIO_KEY_PREFIX = 'trazabilidad_twin_scenario_';

/** Genera un ID único estable. */
export function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Lee todos los eventos reales (no de simulación) desde localStorage. */
export function readEvents(): BusinessEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BusinessEvent[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Persiste la lista de eventos reales. */
export function writeEvents(events: BusinessEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    console.error('[event-store] no se pudo persistir:', e);
  }
}

/** Agrega un evento al store real. Retorna el evento creado. */
export function appendEvent(event: Omit<BusinessEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): BusinessEvent {
  const full: BusinessEvent = {
    id: event.id || generateEventId(),
    timestamp: event.timestamp || new Date().toISOString(),
    ...event,
  };
  const all = readEvents();
  all.push(full);
  writeEvents(all);
  // Notificar observadores
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('twin:event-appended', { detail: full }));
  }
  return full;
}

/** Lee los eventos de un escenario guardado (simulación). */
export function readScenarioEvents(scenarioId: string): BusinessEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${SCENARIO_KEY_PREFIX}${scenarioId}`);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BusinessEvent[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Persiste los eventos de un escenario. */
export function writeScenarioEvents(scenarioId: string, events: BusinessEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${SCENARIO_KEY_PREFIX}${scenarioId}`, JSON.stringify(events));
  } catch (e) {
    console.error('[event-store] no se pudo persistir escenario:', e);
  }
}

/** Borra todos los eventos reales. Peligroso. */
export function clearEvents(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('twin:events-cleared'));
}

// ------------------------------------------------------------
// Factory helpers — crear eventos tipados
// ------------------------------------------------------------

export function emitMercaderiaIngresada(lotId: TwinId, payload: {
  cote: string;
  companyId: TwinId;
  producerId: TwinId;
  warehouseId: TwinId;
  corte: string;
  producto: string;
  pesoNeto: number;
  envases: number;
  pallets: number;
  fecha?: string;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'mercaderia_ingresada',
    entityType: 'inventory_lot',
    entityId: lotId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitMercaderiaEgresada(lotId: TwinId, payload: {
  warehouseId: TwinId;
  pesoNeto: number;
  envases: number;
  motivo: string;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'mercaderia_egresada',
    entityType: 'inventory_lot',
    entityId: lotId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitCambioDeposito(lotId: TwinId, payload: {
  fromWarehouseId: TwinId;
  toWarehouseId: TwinId;
  pesoNeto: number;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'cambio_deposito',
    entityType: 'inventory_lot',
    entityId: lotId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitCambioPropietario(lotId: TwinId, payload: {
  fromOwnerId: TwinId;
  toOwnerId: TwinId;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'cambio_propietario',
    entityType: 'inventory_lot',
    entityId: lotId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitNuevaExportacion(lotId: TwinId, payload: {
  cote: string;
  companyId: TwinId;
  destino: string;
  pais: string;
  puertoId?: TwinId | null;
  contenedorId?: TwinId | null;
  pesoNeto: number;
  envases: number;
  fecha?: string;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'nueva_exportacion',
    entityType: 'export_operation',
    entityId: lotId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitInspeccion(lotId: TwinId | null, payload: {
  tipo: string;
  resultado: 'conforme' | 'no_conforme' | 'observacion' | 'pendiente';
  observaciones?: string;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'inspeccion_realizada',
    entityType: lotId ? 'inventory_lot' : 'inspection',
    entityId: lotId || generateEventId(),
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitCorreccion(parentEventId: TwinId, lotId: TwinId, payload: {
  campo: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  motivo: string;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'correccion',
    entityType: 'inventory_lot',
    entityId: lotId,
    parentEventId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

export function emitAnulacion(parentEventId: TwinId, lotId: TwinId, payload: {
  motivo: string;
  actor?: string;
}): BusinessEvent {
  return appendEvent({
    type: 'anulacion',
    entityType: 'inventory_lot',
    entityId: lotId,
    parentEventId,
    payload: payload as unknown as Record<string, unknown>,
    actor: payload.actor,
  });
}

/** Crea un evento de simulación (no se persiste en el store real). */
export function createSimulationEvent(
  type: BusinessEventType,
  entityType: TwinEntityType,
  entityId: TwinId,
  payload: Record<string, unknown>,
  scenarioId: string,
): BusinessEvent {
  return {
    id: generateEventId(),
    type,
    timestamp: new Date().toISOString(),
    entityType,
    entityId,
    payload,
    simulation: true,
    scenarioId,
  };
}
