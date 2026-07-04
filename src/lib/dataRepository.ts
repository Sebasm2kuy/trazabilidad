import { dataUrl, fetchShipments } from './staticData';
import type { ExpRecord, Shipment } from './types';

export const STORAGE_KEYS = {
  depImported: 'trazabilidad_dep_imported',
  depNew: 'trazabilidad_dep_new_records',
  depEdits: 'trazabilidad_dep_edits',
  depDeleted: 'trazabilidad_dep_deleted',
  expImported: 'trazabilidad_exp_imported',
  expNew: 'trazabilidad_new_records',
  expEdits: 'trazabilidad_exp_edits',
  expDeleted: 'trazabilidad_exp_deleted',
  importedBatches: 'trazabilidad_imported_batches',
} as const;

interface ImportedBatch<T extends Shipment = Shipment> {
  data?: T[];
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readStorageJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorageJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function mergeUniqueById<T extends Shipment>(base: T[], additions: T[]): T[] {
  const seen = new Set(base.map(item => item.id));
  const merged = [...base];
  for (const item of additions) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}

function applyEdits<T extends Shipment>(records: T[], edits: Record<string, Partial<T>>): T[] {
  if (Object.keys(edits).length === 0) return records;
  return records.map(record => edits[record.id] ? { ...record, ...edits[record.id] } : record);
}

function applyDeleted<T extends Shipment>(records: T[], deletedIds: string[]): T[] {
  if (deletedIds.length === 0) return records;
  const deleted = new Set(deletedIds);
  return records.filter(record => !deleted.has(record.id));
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path));
  if (!response.ok) throw new Error(`No se pudo cargar ${path}: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadDepositos(): Promise<Shipment[]> {
  const imported = readStorageJson<Shipment[] | null>(STORAGE_KEYS.depImported, null);
  let base = imported ?? await fetchJson<Shipment[]>('data/shipments.json');

  const batchRecords = readStorageJson<ImportedBatch[]>(STORAGE_KEYS.importedBatches, [])
    .flatMap(batch => batch.data || [])
    .filter(record => record.tipo === 'INGRESO');
  base = mergeUniqueById(base, batchRecords);

  const newRecords = readStorageJson<Shipment[]>(STORAGE_KEYS.depNew, []);
  base = mergeUniqueById(base, newRecords);

  const edits = readStorageJson<Record<string, Partial<Shipment>>>(STORAGE_KEYS.depEdits, {});
  base = applyEdits(base, edits);

  const deleted = readStorageJson<string[]>(STORAGE_KEYS.depDeleted, []);
  return applyDeleted(base, deleted);
}

export async function loadExportaciones(): Promise<ExpRecord[]> {
  const imported = readStorageJson<ExpRecord[] | null>(STORAGE_KEYS.expImported, null);
  let base = imported ?? await fetchJson<ExpRecord[]>('data/exportaciones.json');

  const batchRecords = readStorageJson<ImportedBatch<ExpRecord>[]>(STORAGE_KEYS.importedBatches, [])
    .flatMap(batch => batch.data || [])
    .filter(record => record.tipo === 'EXPORTACION');
  base = mergeUniqueById(base, batchRecords);

  const newRecords = readStorageJson<ExpRecord[]>(STORAGE_KEYS.expNew, []);
  base = mergeUniqueById(base, newRecords);

  const edits = readStorageJson<Record<string, Partial<ExpRecord>>>(STORAGE_KEYS.expEdits, {});
  base = applyEdits(base, edits);

  const deleted = readStorageJson<string[]>(STORAGE_KEYS.expDeleted, []);
  return applyDeleted(base, deleted);
}

export async function searchDepositos(params: Parameters<typeof fetchShipments>[0]): Promise<Shipment[]> {
  const allDepositos = await loadDepositos();
  const { search = '', cote, pais, producto, destino, tipo, fechaDesde, fechaHasta } = params;
  let filtered = allDepositos;

  if (search) {
    const s = search.toLowerCase();
    const num = Number(search);
    filtered = filtered.filter(sh =>
      sh.nroTramite === num ||
      sh.nroCote?.toLowerCase().includes(s) ||
      sh.nombreEstablecimientoDestino?.toLowerCase().includes(s) ||
      sh.denominacionMercaderia?.toLowerCase().includes(s) ||
      sh.matriculaCamion?.toLowerCase().includes(s) ||
      sh.precinto1?.toLowerCase().includes(s)
    );
  }
  if (cote) filtered = filtered.filter(sh => sh.nroCote?.toUpperCase() === String(cote).toUpperCase());
  if (pais) filtered = filtered.filter(sh => sh.paisDestino?.includes(pais));
  if (producto) filtered = filtered.filter(sh => sh.denominacionMercaderia?.includes(producto));
  if (destino) filtered = filtered.filter(sh => sh.nombreEstablecimientoDestino?.includes(destino));
  if (tipo) filtered = filtered.filter(sh => sh.tipo === tipo);
  if (fechaDesde) filtered = filtered.filter(sh => sh.fechaTramite >= new Date(fechaDesde).toISOString());
  if (fechaHasta) filtered = filtered.filter(sh => sh.fechaTramite <= new Date(`${fechaHasta}T23:59:59`).toISOString());

  return filtered;
}
