// ============================================================
// ADAPTERS — Conversión de datos existentes a entidades de dominio
// ------------------------------------------------------------
// Estos adapters NO modifican Shipment / ExpRecord / MovRecord.
// Solo leen y derivan entidades de dominio.
// ============================================================

import type { Shipment, ExpRecord } from '@/lib/types';
import type { MovRecord } from '@/intelligence/types';
import type {
  Company, Producer, Certifier, Client, Warehouse, StockItem,
  StockMovement, ExportOperation, ActivityEvent, CoteStatus, EntityType,
} from '@/domain/types';

const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / DAY_MS);
}

function safeDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Determina el estado operativo de un COTE. */
export function inferCoteStatus(opts: {
  tieneStock?: boolean;
  tieneIngreso?: boolean;
  tieneExportacion?: boolean;
  diasSinMovimiento?: number;
  retenido?: boolean;
}): CoteStatus {
  if (opts.retenido) return 'retenido';
  if (opts.tieneExportacion && opts.tieneStock) return 'parcial';
  if (opts.tieneExportacion) return 'exportado';
  if (opts.tieneStock && (opts.diasSinMovimiento ?? 0) > 60) return 'en_stock';
  if (opts.tieneStock) return 'en_stock';
  if (opts.tieneIngreso) return 'en_transito';
  return 'sin_destino';
}

// ============================================================
// Desde Shipment / ExpRecord (datos propios)
// ============================================================

interface DepositoSnapshot {
  cote: string;
  empresa: string;
  productor: string;
  deposito: string;
  corte: string;
  producto: string;
  pais: string;
  destino: string;
  pesoNeto: number;
  envases: number;
  pallets: number;
  fecha: string | null;
  contenedor?: string | null;
  puerto?: string | null;
  retencion?: string | null;
}

/** Normaliza un Shipment/ExpRecord a un snapshot común. */
function toSnapshot(s: Shipment | ExpRecord): DepositoSnapshot {
  const e = s as ExpRecord;
  // Shipment usa campos compuestos; en algunos datasets importados vía batches
  // pueden existir campos legacy como establecimiento/productor/destino.
  const legacy = s as unknown as Record<string, string | undefined>;
  const empresa = s.nombreEstablecimientoCertif || legacy.establecimiento || s.nombreEstablecimientoProd || '';
  const productor = s.nombreEstablecimientoProd || legacy.productor || '';
  const deposito = s.nombreEstablecimientoDestino || legacy.deposito || empresa;
  const destino = s.nombreEstablecimientoDestino || legacy.destino || '';
  const producto = s.denominacionMercaderia || legacy.denominacion || legacy.producto || '';
  return {
    cote: s.nroCote || '',
    empresa,
    productor,
    deposito,
    corte: s.corte || '',
    producto,
    pais: s.paisDestino || '',
    destino,
    pesoNeto: s.pesoNeto || 0,
    envases: s.cantidadEnvases || 0,
    pallets: s.pallets || 0,
    fecha: safeDate(s.fechaTramite),
    contenedor: (e.contenedorSerieNro ?? legacy.contenedor ?? null) as string | null,
    puerto: legacy.puerto ?? null,
    retencion: legacy.retencion as string | undefined,
  };
}

/** Construye StockItem[] a partir de depósitos, opcionalmente cruzado con exportaciones. */
export function buildStockItems(
  depositos: (Shipment | ExpRecord)[],
  exportaciones: (Shipment | ExpRecord)[] = [],
): StockItem[] {
  const expByCote = new Set(exportaciones.map(e => toSnapshot(e).cote).filter(Boolean));
  return depositos.map(s => {
    const snap = toSnapshot(s);
    const dias = daysSince(snap.fecha);
    return {
      id: snap.cote || Math.random().toString(36).slice(2),
      cote: snap.cote,
      deposito: snap.deposito,
      productor: snap.productor,
      corte: snap.corte,
      producto: snap.producto,
      pesoNeto: snap.pesoNeto,
      envases: snap.envases,
      pallets: snap.pallets,
      fechaIngreso: snap.fecha,
      ultimaActividad: snap.fecha,
      diasSinMovimiento: isFinite(dias) ? dias : 0,
      estado: inferCoteStatus({
        tieneStock: true,
        tieneExportacion: expByCote.has(snap.cote),
        diasSinMovimiento: dias,
      }),
      tieneDestino: Boolean(snap.destino),
      tieneExportacion: expByCote.has(snap.cote),
    } satisfies StockItem;
  });
}

/** Construye Productor[] a partir de depósitos. */
export function buildProducers(records: (Shipment | ExpRecord)[]): Producer[] {
  const map = new Map<string, {
    pn: number; embarques: number; paises: Set<string>; cortes: Set<string>;
    certificador: Record<string, number>; deposito: Record<string, number>;
    ultima: string | null;
  }>();
  for (const r of records) {
    const snap = toSnapshot(r);
    if (!snap.productor) continue;
    if (!map.has(snap.productor)) {
      map.set(snap.productor, {
        pn: 0, embarques: 0, paises: new Set(), cortes: new Set(),
        certificador: {}, deposito: {}, ultima: null,
      });
    }
    const e = map.get(snap.productor)!;
    e.pn += snap.pesoNeto;
    e.embarques++;
    if (snap.pais) e.paises.add(snap.pais);
    if (snap.corte) e.cortes.add(snap.corte);
    if (snap.empresa) e.certificador[snap.empresa] = (e.certificador[snap.empresa] || 0) + 1;
    if (snap.deposito) e.deposito[snap.deposito] = (e.deposito[snap.deposito] || 0) + 1;
    if (snap.fecha && (!e.ultima || snap.fecha > e.ultima)) e.ultima = snap.fecha;
  }
  return Array.from(map.entries()).map(([name, v]) => {
    const topCert = Object.entries(v.certificador).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topDep = Object.entries(v.deposito).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const dias = daysSince(v.ultima);
    return {
      id: name,
      name,
      certificadorPreferido: topCert,
      depositoPreferido: topDep,
      totalPn: v.pn,
      embarques: v.embarques,
      paises: Array.from(v.paises),
      cortes: Array.from(v.cortes),
      ultimaActividad: v.ultima,
      activo: isFinite(dias) ? dias <= 90 : false,
    } satisfies Producer;
  }).sort((a, b) => b.totalPn - a.totalPn);
}

/** Construye Certifier[] a partir de depósitos. */
export function buildCertifiers(records: (Shipment | ExpRecord)[]): Certifier[] {
  const map = new Map<string, { pn: number; embarques: number; productores: Set<string>; paises: Set<string>; cortes: Set<string> }>();
  for (const r of records) {
    const snap = toSnapshot(r);
    if (!snap.empresa) continue;
    if (!map.has(snap.empresa)) {
      map.set(snap.empresa, { pn: 0, embarques: 0, productores: new Set(), paises: new Set(), cortes: new Set() });
    }
    const e = map.get(snap.empresa)!;
    e.pn += snap.pesoNeto;
    e.embarques++;
    if (snap.productor) e.productores.add(snap.productor);
    if (snap.pais) e.paises.add(snap.pais);
    if (snap.corte) e.cortes.add(snap.corte);
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v.pn, 0) || 1;
  return Array.from(map.entries()).map(([name, v]) => ({
    id: name,
    name,
    totalPn: v.pn,
    embarques: v.embarques,
    marketShare: (v.pn / total) * 100,
    productores: v.productores.size,
    paises: v.paises.size,
    cortes: v.cortes.size,
  })).sort((a, b) => b.totalPn - a.totalPn);
}

/** Construye Warehouse[] (depósitos) a partir de depósitos. */
export function buildWarehouses(records: (Shipment | ExpRecord)[]): Warehouse[] {
  const map = new Map<string, { pn: number; embarques: number; productores: Set<string> }>();
  for (const r of records) {
    const snap = toSnapshot(r);
    if (!snap.deposito) continue;
    if (!map.has(snap.deposito)) map.set(snap.deposito, { pn: 0, embarques: 0, productores: new Set() });
    const e = map.get(snap.deposito)!;
    e.pn += snap.pesoNeto;
    e.embarques++;
    if (snap.productor) e.productores.add(snap.productor);
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v.pn, 0) || 1;
  return Array.from(map.entries()).map(([name, v]) => ({
    id: name,
    name,
    totalPn: v.pn,
    embarques: v.embarques,
    productores: v.productores.size,
    marketShare: (v.pn / total) * 100,
    stockPn: v.pn,
    stockPallets: 0,
    productoresList: Array.from(v.productores),
  })).sort((a, b) => b.totalPn - a.totalPn);
}

/** Construye Client[] a partir de exportaciones (establecimiento destino = cliente). */
export function buildClients(records: (Shipment | ExpRecord)[]): Client[] {
  const map = new Map<string, { pn: number; embarques: number; paises: Set<string>; productores: Set<string>; ultima: string | null }>();
  for (const r of records) {
    const snap = toSnapshot(r);
    const cliente = snap.destino || snap.empresa;
    if (!cliente) continue;
    if (!map.has(cliente)) map.set(cliente, { pn: 0, embarques: 0, paises: new Set(), productores: new Set(), ultima: null });
    const e = map.get(cliente)!;
    e.pn += snap.pesoNeto;
    e.embarques++;
    if (snap.pais) e.paises.add(snap.pais);
    if (snap.productor) e.productores.add(snap.productor);
    if (snap.fecha && (!e.ultima || snap.fecha > e.ultima)) e.ultima = snap.fecha;
  }
  return Array.from(map.entries()).map(([name, v]) => {
    const dias = daysSince(v.ultima);
    return {
      id: name,
      name,
      totalPn: v.pn,
      embarques: v.embarques,
      paises: Array.from(v.paises),
      productores: Array.from(v.productores),
      ultimaActividad: v.ultima,
      activo: isFinite(dias) ? dias <= 90 : false,
    } satisfies Client;
  }).sort((a, b) => b.totalPn - a.totalPn);
}

/** Construye ExportOperation[] a partir de exportaciones. */
export function buildExportOperations(records: (Shipment | ExpRecord)[]): ExportOperation[] {
  return records.map(r => {
    const snap = toSnapshot(r);
    return {
      id: snap.cote || Math.random().toString(36).slice(2),
      cote: snap.cote,
      empresa: snap.empresa,
      destino: snap.destino,
      pais: snap.pais,
      pesoNeto: snap.pesoNeto,
      envases: snap.envases,
      contenedor: snap.contenedor ?? null,
      puerto: snap.puerto ?? null,
      fecha: snap.fecha,
      estado: snap.contenedor ? 'confirmada' : 'desconocido',
    } satisfies ExportOperation;
  });
}

/** Construye StockMovement[] combinando ingresos + exportaciones por COTE. */
export function buildStockMovements(
  depositos: (Shipment | ExpRecord)[],
  exportaciones: (Shipment | ExpRecord)[],
): StockMovement[] {
  const movs: StockMovement[] = [];
  for (const r of depositos) {
    const snap = toSnapshot(r);
    if (!snap.cote) continue;
    movs.push({
      id: `dep-${snap.cote}-${snap.fecha || ''}`,
      cote: snap.cote,
      tipo: 'ingreso',
      fecha: snap.fecha || new Date().toISOString(),
      origen: snap.productor || null,
      destino: snap.deposito || null,
      pesoNeto: snap.pesoNeto,
      envases: snap.envases,
    });
  }
  for (const r of exportaciones) {
    const snap = toSnapshot(r);
    if (!snap.cote) continue;
    movs.push({
      id: `exp-${snap.cote}-${snap.fecha || ''}`,
      cote: snap.cote,
      tipo: 'exportacion',
      fecha: snap.fecha || new Date().toISOString(),
      origen: snap.deposito || snap.empresa || null,
      destino: snap.pais || snap.destino || null,
      pesoNeto: snap.pesoNeto,
      envases: snap.envases,
    });
  }
  return movs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

// ============================================================
// Desde MovRecord (mercado nacional)
// ============================================================

/** Construye Company[] a partir de MovRecord[] (mercado nacional). */
export function buildCompaniesFromMarket(records: MovRecord[]): Company[] {
  const map = new Map<string, { pn: number; embarques: number; paises: Set<string>; cortes: Set<string>; clientes: Set<string> }>();
  for (const r of records) {
    const name = r.cf || '';
    if (!name) continue;
    if (!map.has(name)) map.set(name, { pn: 0, embarques: 0, paises: new Set(), cortes: new Set(), clientes: new Set() });
    const e = map.get(name)!;
    e.pn += r.pn || 0;
    e.embarques++;
    if (r.pa) e.paises.add(r.pa);
    if (r.co) e.cortes.add(r.co);
    if (r.ed) e.clientes.add(r.ed);
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v.pn, 0) || 1;
  return Array.from(map.entries()).map(([name, v]) => ({
    id: name,
    name,
    roles: ['certificador'] as EntityType[],
    totalPn: v.pn,
    embarques: v.embarques,
    marketShare: (v.pn / total) * 100,
    paises: v.paises.size,
    cortes: v.cortes.size,
    clientes: v.clientes.size,
  })).sort((a, b) => b.totalPn - a.totalPn);
}

/** Construye ActivityEvent[] combinando depósitos + exportaciones. */
export function buildActivityEvents(
  depositos: (Shipment | ExpRecord)[],
  exportaciones: (Shipment | ExpRecord)[] = [],
  limit = 50,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const r of depositos.slice(-200)) {
    const snap = toSnapshot(r);
    if (!snap.fecha) continue;
    events.push({
      id: `act-dep-${snap.cote}-${snap.fecha}`,
      type: 'ingreso',
      description: `Ingreso a depósito: ${snap.deposito || '—'} • ${snap.productor || '—'} • ${snap.corte || '—'}`,
      timestamp: snap.fecha,
      entity: snap.cote ? { type: 'cote', id: snap.cote, label: snap.cote } : undefined,
      meta: { pn: snap.pesoNeto, envases: snap.envases },
    });
  }
  for (const r of exportaciones.slice(-200)) {
    const snap = toSnapshot(r);
    if (!snap.fecha) continue;
    events.push({
      id: `act-exp-${snap.cote}-${snap.fecha}`,
      type: 'exportacion',
      description: `Exportación a ${snap.pais || snap.destino || '—'} • ${snap.empresa || '—'}`,
      timestamp: snap.fecha,
      entity: snap.cote ? { type: 'cote', id: snap.cote, label: snap.cote } : undefined,
      meta: { pn: snap.pesoNeto, envases: snap.envases },
    });
  }
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}
