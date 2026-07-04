// ============================================================
// PROJECTORS — Reconstruyen el estado actual desde eventos
// ------------------------------------------------------------
// Puros: dado una lista de BusinessEvent[] devuelven un snapshot.
// No tienen estado. No mutan los eventos.
// ============================================================

import type { Shipment, ExpRecord } from '@/lib/types';
import type {
  BusinessEvent, TwinSnapshot, InventoryLot, InventoryMovement,
  Company, Producer, Certifier, Warehouse, Client, ExportOperation,
  Container, Port, Country, Document, Inspection, TimelineEvent,
} from './types';
import { buildStockItems, buildProducers, buildCertifiers, buildWarehouses, buildClients, buildExportOperations, buildActivityEvents } from '@/domain/adapters';

const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / DAY_MS);
}

function safe(s: string | null | undefined): string | null {
  return s || null;
}

/** Construye el snapshot inicial desde datos existentes (Shipment/ExpRecord). */
export function projectInitialState(
  depositos: (Shipment | ExpRecord)[],
  exportaciones: (Shipment | ExpRecord)[],
): TwinSnapshot {
  // Reutiliza adapters del dominio
  const stockItems = buildStockItems(depositos, exportaciones);
  const productoresDom = buildProducers(depositos);
  const certifiersDom = buildCertifiers(depositos);
  const warehousesDom = buildWarehouses(depositos);
  const clientsDom = buildClients(exportaciones);
  const exportsDom = buildExportOperations(exportaciones);
  const activityDom = buildActivityEvents(depositos, exportaciones, 100);

  // Convertir a entidades del gemelo
  const lots: InventoryLot[] = stockItems.map(s => ({
    id: s.id,
    cote: s.cote,
    companyId: s.deposito, // aproxima: depósito = empresa certificadora
    producerId: s.productor,
    warehouseId: s.deposito,
    corte: s.corte,
    producto: s.producto,
    pesoNeto: s.pesoNeto,
    envases: s.envases,
    pallets: s.pallets,
    paisDestino: undefined,
    destino: undefined,
    estado: s.estado,
    fechaIngreso: s.fechaIngreso,
    ultimaActividad: s.ultimaActividad,
    diasSinMovimiento: s.diasSinMovimiento,
    tieneExportacion: s.tieneExportacion,
    timeline: [],
  }));

  const companies: Company[] = certifiersDom.map(c => ({
    id: c.id, name: c.name, roles: ['certifier' as const],
    totalPn: c.totalPn, embarques: c.embarques, marketShare: c.marketShare,
    paises: c.paises, cortes: c.cortes, clientes: 0, riskScore: 0,
  }));

  const producers: Producer[] = productoresDom.map(p => ({
    id: p.id, name: p.name,
    certificadorPreferidoId: p.certificadorPreferido,
    depositoPreferidoId: p.depositoPreferido,
    totalPn: p.totalPn, embarques: p.embarques,
    paises: p.paises, cortes: p.cortes,
    ultimaActividad: p.ultimaActividad,
    activo: p.activo, riskScore: 0,
  }));

  const certifiers: Certifier[] = certifiersDom.map(c => ({
    id: c.id, name: c.name, totalPn: c.totalPn, embarques: c.embarques,
    marketShare: c.marketShare, productores: c.productores,
    paises: c.paises, cortes: c.cortes, riskScore: 0,
  }));

  // Capacidad estimada de cada depósito: 3x su stock actual (placeholder)
  const warehouses: Warehouse[] = warehousesDom.map(w => ({
    id: w.id, name: w.name, totalPn: w.totalPn, embarques: w.embarques,
    productores: w.productores, marketShare: w.marketShare,
    stockPn: w.stockPn, stockPallets: w.stockPallets,
    capacidadKg: w.stockPn * 3,
    utilizacion: 33.3,
    productoresList: w.productoresList, riskScore: 0,
  }));

  const clients: Client[] = clientsDom.map(c => ({
    id: c.id, name: c.name, totalPn: c.totalPn, embarques: c.embarques,
    paises: c.paises, productores: c.productores,
    ultimaActividad: c.ultimaActividad,
    activo: c.activo, riskScore: 0,
  }));

  const exports: ExportOperation[] = exportsDom.map(e => ({
    id: e.id, cote: e.cote, companyId: e.empresa,
    destino: e.destino, pais: e.pais, puertoId: null, contenedorId: null,
    pesoNeto: e.pesoNeto, envases: e.envases, fecha: e.fecha,
    estado: e.estado,
  }));

  // Containers / Ports / Countries derivados
  const containers = new Map<string, Container>();
  const ports = new Map<string, Port>();
  const countries = new Map<string, Country>();

  for (const e of exports) {
    if (e.contenedorId) {
      const id = e.contenedorId;
      if (!containers.has(id)) {
        containers.set(id, { id, numero: id, embarques: 0, pesoNetoTotal: 0, ultimaActividad: e.fecha });
      }
      const c = containers.get(id)!;
      c.embarques++;
      c.pesoNetoTotal += e.pesoNeto;
      if (e.fecha && (!c.ultimaActividad || e.fecha > c.ultimaActividad)) c.ultimaActividad = e.fecha;
    }
    if (e.destino) {
      const id = e.destino;
      if (!ports.has(id)) {
        ports.set(id, { id, name: id, pais: e.pais, embarques: 0, pesoNetoTotal: 0 });
      }
      const p = ports.get(id)!;
      p.embarques++;
      p.pesoNetoTotal += e.pesoNeto;
    }
    if (e.pais) {
      const id = e.pais;
      if (!countries.has(id)) {
        countries.set(id, { id, name: id, embarques: 0, pesoNetoTotal: 0, empresas: [], productores: [] });
      }
      const c = countries.get(id)!;
      c.embarques++;
      c.pesoNetoTotal += e.pesoNeto;
      if (!c.empresas.includes(e.companyId)) c.empresas.push(e.companyId);
    }
  }

  const documents: Document[] = [];
  const inspections: Inspection[] = [];

  // Timeline desde activity events del dominio
  const timeline: TimelineEvent[] = activityDom.map(a => ({
    id: a.id,
    lotId: a.entity?.type === 'cote' ? a.entity.id : null,
    entityType: 'inventory_lot',
    entityId: a.entity?.id || a.id,
    type: a.type === 'ingreso' ? 'mercaderia_ingresada'
       : a.type === 'exportacion' ? 'nueva_exportacion'
       : 'cambio_documental',
    timestamp: a.timestamp,
    description: a.description,
    payload: a.meta as Record<string, unknown> | undefined,
  }));

  // Movimientos derivados de depósitos + exportaciones
  const movements: InventoryMovement[] = [];
  for (const s of stockItems) {
    if (!s.cote) continue;
    movements.push({
      id: `mov-dep-${s.id}`,
      lotId: s.id, cote: s.cote, tipo: 'ingreso',
      timestamp: s.fechaIngreso || new Date().toISOString(),
      origenId: s.productor, destinoId: s.deposito,
      pesoNeto: s.pesoNeto, envases: s.envases, eventId: `seed-${s.id}`,
    });
  }
  for (const e of exports) {
    if (!e.cote) continue;
    movements.push({
      id: `mov-exp-${e.id}`,
      lotId: e.id, cote: e.cote, tipo: 'exportacion',
      timestamp: e.fecha || new Date().toISOString(),
      origenId: e.companyId, destinoId: e.pais,
      pesoNeto: e.pesoNeto, envases: e.envases, eventId: `seed-exp-${e.id}`,
    });
  }

  // KPIs
  const totalStockPn = lots.reduce((s, l) => s + l.pesoNeto, 0);
  const totalExportacionesPn = exports.reduce((s, e) => s + e.pesoNeto, 0);
  const totalDepositosPn = movements.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.pesoNeto, 0);
  const productoresActivos = producers.filter(p => p.activo).length;
  const clientesActivos = clients.filter(c => c.activo).length;

  return {
    generatedAt: new Date().toISOString(),
    lots, movements, companies, producers, certifiers, warehouses, clients,
    exports,
    containers: Array.from(containers.values()),
    ports: Array.from(ports.values()),
    countries: Array.from(countries.values()),
    documents, inspections, timeline,
    risks: [], recommendations: [],
    kpis: {
      totalStockPn, totalExportacionesPn, totalDepositosPn,
      productoresActivos, clientesActivos,
      alertasCriticas: lots.filter(l => l.estado === 'retenido').length,
      riskScorePromedio: 0,
      utilizacionPromedioDepositos: warehouses.reduce((s, w) => s + w.utilizacion, 0) / (warehouses.length || 1),
    },
  };
}

/** Aplica un evento sobre el snapshot. Devuelve un nuevo snapshot. */
export function applyEvent(snapshot: TwinSnapshot, event: BusinessEvent): TwinSnapshot {
  // Clon superficial — solo mutamos lo necesario
  const next: TwinSnapshot = { ...snapshot };
  next.timeline = [{
    id: event.id,
    lotId: event.entityType === 'inventory_lot' ? event.entityId : null,
    type: event.type,
    timestamp: event.timestamp,
    entityType: event.entityType,
    entityId: event.entityId,
    description: describe(event),
    payload: event.payload,
  }, ...snapshot.timeline];

  switch (event.type) {
    case 'mercaderia_ingresada': {
      const p = event.payload as {
        cote: string; companyId: string; producerId: string; warehouseId: string;
        corte: string; producto: string; pesoNeto: number; envases: number; pallets: number;
        fecha?: string;
      };
      const lot: InventoryLot = {
        id: event.entityId,
        cote: p.cote,
        companyId: p.companyId,
        producerId: p.producerId,
        warehouseId: p.warehouseId,
        corte: p.corte,
        producto: p.producto,
        pesoNeto: p.pesoNeto,
        envases: p.envases,
        pallets: p.pallets,
        estado: 'en_stock',
        fechaIngreso: p.fecha || event.timestamp,
        ultimaActividad: event.timestamp,
        diasSinMovimiento: 0,
        tieneExportacion: false,
        timeline: [],
      };
      next.lots = [lot, ...snapshot.lots];
      // Movimiento
      next.movements = [{
        id: `mov-${event.id}`, lotId: lot.id, cote: lot.cote, tipo: 'ingreso',
        timestamp: event.timestamp,
        origenId: lot.producerId, destinoId: lot.warehouseId,
        pesoNeto: lot.pesoNeto, envases: lot.envases, eventId: event.id,
      }, ...snapshot.movements];
      // KPI
      next.kpis = { ...snapshot.kpis, totalStockPn: snapshot.kpis.totalStockPn + lot.pesoNeto };
      break;
    }
    case 'mercaderia_egresada': {
      const p = event.payload as { warehouseId: string; pesoNeto: number; envases: number; motivo: string };
      next.lots = snapshot.lots.map(l => l.id === event.entityId
        ? { ...l, pesoNeto: Math.max(0, l.pesoNeto - p.pesoNeto), estado: 'en_transito' as const, ultimaActividad: event.timestamp, diasSinMovimiento: 0 }
        : l);
      next.movements = [{
        id: `mov-${event.id}`, lotId: event.entityId, cote: next.lots.find(l => l.id === event.entityId)?.cote || '',
        tipo: 'egreso', timestamp: event.timestamp,
        origenId: p.warehouseId, destinoId: null,
        pesoNeto: p.pesoNeto, envases: p.envases, eventId: event.id,
      }, ...snapshot.movements];
      next.kpis = { ...snapshot.kpis, totalStockPn: Math.max(0, snapshot.kpis.totalStockPn - p.pesoNeto) };
      break;
    }
    case 'cambio_deposito': {
      const p = event.payload as { fromWarehouseId: string; toWarehouseId: string; pesoNeto: number };
      next.lots = snapshot.lots.map(l => l.id === event.entityId
        ? { ...l, warehouseId: p.toWarehouseId, ultimaActividad: event.timestamp, diasSinMovimiento: 0 }
        : l);
      next.movements = [{
        id: `mov-${event.id}`, lotId: event.entityId, cote: next.lots.find(l => l.id === event.entityId)?.cote || '',
        tipo: 'transferencia', timestamp: event.timestamp,
        origenId: p.fromWarehouseId, destinoId: p.toWarehouseId,
        pesoNeto: p.pesoNeto, envases: 0, eventId: event.id,
      }, ...snapshot.movements];
      break;
    }
    case 'cambio_propietario': {
      const p = event.payload as { fromOwnerId: string; toOwnerId: string };
      next.lots = snapshot.lots.map(l => l.id === event.entityId
        ? { ...l, companyId: p.toOwnerId, ultimaActividad: event.timestamp }
        : l);
      break;
    }
    case 'nueva_exportacion': {
      const p = event.payload as {
        cote: string; companyId: string; destino: string; pais: string;
        puertoId?: string | null; contenedorId?: string | null;
        pesoNeto: number; envases: number; fecha?: string;
      };
      const op: ExportOperation = {
        id: event.entityId, cote: p.cote, companyId: p.companyId,
        destino: p.destino, pais: p.pais,
        puertoId: p.puertoId || null, contenedorId: p.contenedorId || null,
        pesoNeto: p.pesoNeto, envases: p.envases,
        fecha: p.fecha || event.timestamp, estado: 'confirmada',
      };
      next.exports = [op, ...snapshot.exports];
      // Marcar lote como exportado
      next.lots = snapshot.lots.map(l => l.cote === p.cote ? { ...l, tieneExportacion: true, estado: 'exportado' as const, ultimaActividad: event.timestamp } : l);
      next.movements = [{
        id: `mov-${event.id}`, lotId: event.entityId, cote: p.cote,
        tipo: 'exportacion', timestamp: event.timestamp,
        origenId: p.companyId, destinoId: p.pais,
        pesoNeto: p.pesoNeto, envases: p.envases, eventId: event.id,
      }, ...snapshot.movements];
      next.kpis = { ...snapshot.kpis, totalExportacionesPn: snapshot.kpis.totalExportacionesPn + p.pesoNeto };
      break;
    }
    case 'inspeccion_realizada': {
      const p = event.payload as { tipo: string; resultado: 'conforme' | 'no_conforme' | 'observacion' | 'pendiente'; observaciones?: string };
      const insp: Inspection = {
        id: event.id, lotId: event.entityType === 'inventory_lot' ? event.entityId : null,
        fecha: event.timestamp, tipo: p.tipo, resultado: p.resultado, observaciones: p.observaciones,
      };
      next.inspections = [insp, ...snapshot.inspections];
      // Si no conforme → marcar lote como retenido
      if (p.resultado === 'no_conforme' && insp.lotId) {
        next.lots = snapshot.lots.map(l => l.id === insp.lotId ? { ...l, estado: 'retenido' as const } : l);
      }
      break;
    }
    case 'correccion': {
      const p = event.payload as { campo: string; valorAnterior: unknown; valorNuevo: unknown };
      // Aplicar corrección al lote
      next.lots = snapshot.lots.map(l => {
        if (l.id !== event.entityId) return l;
        const updated = { ...l, [p.campo]: p.valorNuevo, ultimaActividad: event.timestamp };
        return updated;
      });
      break;
    }
    case 'anulacion': {
      // Revertir el evento padre — simplificado: marcar lote como sin destino
      next.lots = snapshot.lots.map(l => l.id === event.entityId
        ? { ...l, estado: 'sin_destino' as const, ultimaActividad: event.timestamp }
        : l);
      break;
    }
    default:
      // Otros eventos solo se registran en timeline
      break;
  }

  return next;
}

/** Aplica una lista de eventos sobre un snapshot, en orden. */
export function applyEvents(snapshot: TwinSnapshot, events: BusinessEvent[]): TwinSnapshot {
  let s = snapshot;
  for (const e of events) {
    s = applyEvent(s, e);
  }
  return s;
}

function describe(event: BusinessEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'mercaderia_ingresada':
      return `Ingreso: ${p.cote} → ${p.warehouseId} • ${p.pesoNeto} kg`;
    case 'mercaderia_egresada':
      return `Egreso: ${p.pesoNeto} kg (${p.motivo})`;
    case 'cambio_deposito':
      return `Transferencia: ${p.fromWarehouseId} → ${p.toWarehouseId}`;
    case 'cambio_propietario':
      return `Cambio propietario: ${p.fromOwnerId} → ${p.toOwnerId}`;
    case 'nueva_exportacion':
      return `Exportación: ${p.cote} → ${p.pais} • ${p.pesoNeto} kg`;
    case 'inspeccion_realizada':
      return `Inspección ${p.tipo}: ${p.resultado}`;
    case 'correccion':
      return `Corrección: ${p.campo} = ${String(p.valorNuevo)}`;
    case 'anulacion':
      return `Anulación: ${String(p.motivo)}`;
    default:
      return event.type;
  }
}
