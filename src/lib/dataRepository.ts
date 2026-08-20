import { getSupabaseBrowserClient } from './supabase/client';
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

/** @deprecated Transitional helpers; operational readers no longer consume these values. */
export function readStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

/** @deprecated Writes will move to authenticated Edge Functions. */
export function writeStorageJson<T>(key: string, value: T): void {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}

interface MovementRow {
  procedure_number: string;
  procedure_date: string;
  cote: string;
  movement_type: string | null;
  origin_name?: string | null;
  origin_number?: string | null;
  certifier_name?: string | null;
  veterinarian_name?: string | null;
  cote_issued_at?: string | null;
  transport_type?: string | null;
  truck_registration?: string | null;
  container_number?: string | null;
  seal_1?: string | null;
  seal_2?: string | null;
  seal_3?: string | null;
  seal_4?: string | null;
  destination_name?: string | null;
  destination_country?: string | null;
  observations?: string | null;
  sanitary_certificate?: string | null;
  received_at?: string | null;
  reception_service?: string | null;
  reception_observations?: string | null;
  reception_user?: string | null;
  exterior_inspection_ok?: boolean | null;
  inspection_observations?: string | null;
}

interface LineRow {
  id: string;
  source_line_id: string;
  package_code: string | null;
  product: string;
  cut: string | null;
  lot_usa_canada: string | null;
  lots_china: string | null;
  pallets: number | null;
  packages: number | null;
  gross_weight: number | null;
  net_weight: number | null;
  slaughter_start?: string | null;
  slaughter_end?: string | null;
  production_start?: string | null;
  production_end?: string | null;
  freezing_start?: string | null;
  freezing_end?: string | null;
  shipping?: string | null;
  security_paper?: string | null;
  movement: MovementRow;
}

function numberOrZero(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchAllLines(table: 'inbound_lines' | 'outbound_lines', relation: 'inbound_movements' | 'outbound_movements'): Promise<LineRow[]> {
  const supabase = getSupabaseBrowserClient();
  const rows: LineRow[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(`*, movement:${relation}!inner(*)`)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`No se pudieron cargar datos de Supabase: ${error.message}`);
    const page = (data || []) as unknown as LineRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function baseShipment(line: LineRow): Shipment {
  const movement = line.movement;
  return {
    id: line.id,
    nroTramite: numberOrZero(movement.procedure_number),
    fechaTramite: movement.procedure_date,
    nroCote: movement.cote,
    nombreMedicoVeterinario: movement.veterinarian_name,
    nombreEstablecimientoCertif: movement.certifier_name,
    nombreEstablecimientoProd: movement.origin_name,
    nroEstablecimientoProd: movement.origin_number ? numberOrZero(movement.origin_number) : null,
    fechaEmitidoCote: movement.cote_issued_at,
    tipoTransporte: movement.transport_type,
    contenedorSerieNro: movement.container_number,
    matriculaCamion: movement.truck_registration,
    precinto1: movement.seal_1,
    nombreEstablecimientoDestino: movement.destination_name || '',
    tipoMovimiento: movement.movement_type,
    observaciones: movement.observations,
    paisDestino: movement.destination_country || '',
    idLinea: numberOrZero(line.source_line_id),
    codigoEnvase: line.package_code ? numberOrZero(line.package_code) : null,
    denominacionMercaderia: line.product,
    corte: line.cut || '',
    pallets: line.pallets,
    cantidadEnvases: line.packages,
    pesoBruto: line.gross_weight,
    pesoNeto: line.net_weight,
    loteUsaCanada: line.lot_usa_canada,
    lotesChina: line.lots_china,
    fechaInicioFaena: line.slaughter_start,
    fechaFinFaena: line.slaughter_end,
    fechaInicioProduccion: line.production_start,
    fechaFinProduccion: line.production_end,
    fechaInicioCongelacion: line.freezing_start,
    fechaFinCongelacion: line.freezing_end,
    tipo: movement.movement_type || 'DEPOSITO',
  };
}

export async function loadDepositos(): Promise<Shipment[]> {
  return (await fetchAllLines('inbound_lines', 'inbound_movements')).map(baseShipment);
}

export async function loadExportaciones(): Promise<ExpRecord[]> {
  return (await fetchAllLines('outbound_lines', 'outbound_movements')).map(line => {
    const base = baseShipment(line);
    return {
      ...base,
      tipo: line.movement.movement_type || 'EXPORTACION',
      nroCertificadoSanitario: line.movement.sanitary_certificate,
      shipping: line.shipping,
      papelSeguridad: line.security_paper || undefined,
      recibidaFechaHora: line.movement.received_at || undefined,
      recepcionServicio: line.movement.reception_service || undefined,
      recepcionObservaciones: line.movement.reception_observations || undefined,
      recepcionUsuario: line.movement.reception_user || undefined,
      inspeccionExteriorConforme: line.movement.exterior_inspection_ok == null ? undefined : String(line.movement.exterior_inspection_ok),
      obsInspeccionExterior: line.movement.inspection_observations || undefined,
      precinto2: line.movement.seal_2 || undefined,
      precinto3: line.movement.seal_3 || undefined,
      precinto4: line.movement.seal_4 || undefined,
    };
  });
}

export async function searchDepositos(params: {
  search?: string; cote?: string; pais?: string; producto?: string; destino?: string;
  tipo?: string; fechaDesde?: string; fechaHasta?: string; page?: number; limit?: number;
}): Promise<Shipment[]> {
  const allDepositos = await loadDepositos();
  const { search = '', cote, pais, producto, destino, tipo, fechaDesde, fechaHasta } = params;
  return allDepositos.filter(shipment => {
    const query = search.toLowerCase();
    return (!query || [shipment.nroCote, shipment.nombreEstablecimientoDestino, shipment.denominacionMercaderia, shipment.matriculaCamion]
      .some(value => String(value || '').toLowerCase().includes(query))) &&
      (!cote || shipment.nroCote?.toUpperCase() === cote.toUpperCase()) &&
      (!pais || shipment.paisDestino?.includes(pais)) &&
      (!producto || shipment.denominacionMercaderia?.includes(producto)) &&
      (!destino || shipment.nombreEstablecimientoDestino?.includes(destino)) &&
      (!tipo || shipment.tipo === tipo) &&
      (!fechaDesde || shipment.fechaTramite >= new Date(fechaDesde).toISOString()) &&
      (!fechaHasta || shipment.fechaTramite <= new Date(`${fechaHasta}T23:59:59`).toISOString());
  });
}
