// ============================================================
// Excel Parser for Registro files (Envios / Expo)
// ============================================================
// Both files share the same format: 60 columns, headers on row 16,
// data starts row 17. Rows 1-15 are filter/title rows.
// ============================================================

import type { Shipment, ExpRecord } from './types';

const HEADER_ROW = 16; // 1-indexed in Excel
const DATA_START_ROW = 17; // 1-indexed
const COTE_PREFIX = 'dep-';
const EXPO_PREFIX = 'exp-';

// Column mapping: Excel column index (1-based) -> field name
// Based on the standard Registro export format
const COL_MAP: Record<number, string> = {
  1: 'nroTramite',
  2: 'fechaTramite',
  3: 'nroCote',
  4: 'nombreMedicoVeterinario',
  5: 'nombreEstablecimientoCertif',
  6: 'nombreEstablecimientoProd',
  7: 'nroEstablecimientoProd',
  8: 'fechaEmitidoCote',
  9: 'temperaturaC',
  10: 'tipoTransporte',
  11: 'contenedorSerieNro',
  12: 'matriculaAvion',
  13: 'matriculaCamion',
  14: 'precinto1',
  15: 'precinto2',
  16: 'precinto3',
  17: 'precinto4',
  18: 'precintoAgencia',
  19: 'guiaINAC',
  20: 'nombreEstablecimientoDestino',
  21: 'tipoMovimiento',
  22: 'observaciones',
  23: 'correspondeAbrirContenedor',
  24: 'paisDestino',
  25: 'validezMercaderia',
  26: 'recepcionServicio',
  27: 'recibidaFechaHora',
  28: 'recibidaTemperatura',
  29: 'recepcionObservaciones',
  30: 'recepcionUsuario',
  31: 'inspeccionExteriorConforme',
  32: 'contenedorInspeccion',
  33: 'avionInspeccion',
  34: 'camionInspeccion',
  35: 'inspPrecinto1',
  36: 'inspPrecinto2',
  37: 'inspPrecinto3',
  38: 'inspPrecinto4',
  39: 'obsInspeccionExterior',
  40: 'baja',
  41: 'idLinea',
  42: 'codigoEnvase',
  43: 'denominacionMercaderia',
  44: 'corte',
  45: 'pallets',
  46: 'cantidadEnvases',
  47: 'pesoBruto',
  48: 'pesoNeto',
  49: 'nroCertificadoSanitario',
  50: 'shipping',
  51: 'loteUsaCanada',
  52: 'lotesChina',
  53: 'fechaInicioFaena',
  54: 'fechaFinFaena',
  55: 'fechaInicioProduccion',
  56: 'fechaFinProduccion',
  57: 'fechaInicioCongelacion',
  58: 'fechaFinCongelacion',
  59: 'papelSeguridad',
  60: 'proceso',
};

function cleanStr(val: unknown): string {
  if (val == null) return '';
  return String(val).trim();
}

function cleanNum(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function cleanDate(val: unknown): string | null {
  if (val == null) return null;
  if (val instanceof Date) {
    // Check if it's a valid date (not 1899 default)
    if (val.getFullYear() < 1900) return null;
    return val.toISOString();
  }
  // Handle Excel serial date numbers
  if (typeof val === 'number') {
    if (val <= 0) return null;
    try {
      const epoch = new Date(1899, 11, 30);
      const ms = epoch.getTime() + val * 86400000;
      const d = new Date(ms);
      if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null;
      return d.toISOString();
    } catch { return null; }
  }
  const s = String(val).trim();
  if (!s || s === '0') return null;
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d.toISOString();
  }
  // Handle DD/MM/YYYY, MM/DD/YYYY, DD/MM/YY, MM/DD/YY strings
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let a = parseInt(parts[0]), b = parseInt(parts[1]), y = parseInt(parts[2]);
    if (isNaN(a) || isNaN(b) || isNaN(y)) return null;
    // Fix 2-digit year: 00-99 → 2000-2099 (datos del siglo XXI)
    if (y < 100) y += 2000;
    // Helper: construir fecha válida
    const make = (year: number, monthIdx: number, day: number): Date | null => {
      const d = new Date(year, monthIdx, day);
      if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null;
      // Verificar que la fecha no se "auto-corrigió" (ej: 31/02 → 03/03)
      if (d.getMonth() !== monthIdx || d.getDate() !== day) return null;
      return d;
    };
    const now = Date.now();
    // Si a > 12, debe ser DD/MM (día > 12)
    if (a > 12 && b <= 12) {
      const d = make(y, b - 1, a);
      if (d) return d.toISOString();
    }
    // Si b > 12, debe ser MM/DD (día > 12 en segunda posición)
    if (b > 12 && a <= 12) {
      const d = make(y, a - 1, b);
      if (d) return d.toISOString();
    }
    // Ambiguo (ambos ≤ 12): aplicar heurística de fecha futura.
    // Los datos del Registro son operativos (ya ocurrieron), así que si
    // una interpretación da fecha futura y la otra pasada, usar la pasada.
    // Esto resuelve el caso "3/12/26": DD/MM → 3 Dic 2026 (futuro) vs
    // MM/DD → 12 Mar 2026 (pasado). Elegimos MM/DD.
    const dDD = make(y, b - 1, a); // interpretación DD/MM
    const dMM = make(y, a - 1, b); // interpretación MM/DD
    if (dDD && dMM) {
      const ddFuture = dDD.getTime() > now;
      const mmFuture = dMM.getTime() > now;
      // Si DD/MM es futura y MM/DD es pasada → usar MM/DD (formato US)
      if (ddFuture && !mmFuture) return dMM.toISOString();
      // Si MM/DD es futura y DD/MM es pasada → usar DD/MM (formato UY)
      if (mmFuture && !ddFuture) return dDD.toISOString();
      // Ambas pasadas o ambas futuras: preferir DD/MM (formato Uruguay por defecto)
      return dDD.toISOString();
    }
    if (dDD) return dDD.toISOString();
    if (dMM) return dMM.toISOString();
  }
  // Last resort: let JS try
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d.toISOString();
  return null;
}

function parseRow(row: unknown[], idPrefix: string, rowIndex: number): Shipment | null {
  // Extract raw values using 0-based index (row array is 0-based, COL_MAP is 1-based)
  const raw: Record<string, unknown> = {};
  for (const [colStr, field] of Object.entries(COL_MAP)) {
    const colIdx = Number(colStr) - 1; // Convert to 0-based
    raw[field] = row[colIdx] ?? null;
  }

  // Skip empty rows (no tramite number)
  const tramite = cleanNum(raw.nroTramite);
  if (!tramite) return null;

  // Skip "Baja" rows
  if (cleanStr(raw.baja) === 'SI') return null;

  const record: Shipment = {
    id: `${idPrefix}${tramite}-${raw.idLinea ?? rowIndex}`,
    nroTramite: tramite,
    fechaTramite: cleanDate(raw.fechaTramite) ?? '',
    nroCote: cleanStr(raw.nroCote),
    nombreMedicoVeterinario: cleanStr(raw.nombreMedicoVeterinario) || null,
    nombreEstablecimientoCertif: cleanStr(raw.nombreEstablecimientoCertif) || null,
    nombreEstablecimientoProd: cleanStr(raw.nombreEstablecimientoProd) || null,
    nroEstablecimientoProd: cleanNum(raw.nroEstablecimientoProd),
    fechaEmitidoCote: cleanDate(raw.fechaEmitidoCote),
    temperaturaC: cleanNum(raw.temperaturaC),
    tipoTransporte: cleanStr(raw.tipoTransporte) || null,
    contenedorSerieNro: cleanStr(raw.contenedorSerieNro) || null,
    matriculaCamion: cleanStr(raw.matriculaCamion) || null,
    precinto1: cleanStr(raw.precinto1) || null,
    nombreEstablecimientoDestino: cleanStr(raw.nombreEstablecimientoDestino),
    tipoMovimiento: cleanStr(raw.tipoMovimiento) || null,
    observaciones: cleanStr(raw.observaciones) || null,
    paisDestino: cleanStr(raw.paisDestino),
    baja: cleanStr(raw.baja) || null,
    idLinea: cleanNum(raw.idLinea),
    codigoEnvase: cleanNum(raw.codigoEnvase),
    denominacionMercaderia: cleanStr(raw.denominacionMercaderia),
    corte: cleanStr(raw.corte),
    pallets: cleanNum(raw.pallets),
    cantidadEnvases: cleanNum(raw.cantidadEnvases),
    pesoBruto: cleanNum(raw.pesoBruto),
    pesoNeto: cleanNum(raw.pesoNeto),
    nroCertificadoSanitario: cleanStr(raw.nroCertificadoSanitario) || null,
    shipping: cleanStr(raw.shipping) || null,
    loteUsaCanada: cleanStr(raw.loteUsaCanada) || null,
    lotesChina: cleanStr(raw.lotesChina) || null,
    fechaInicioFaena: cleanDate(raw.fechaInicioFaena),
    fechaFinFaena: cleanDate(raw.fechaFinFaena),
    fechaInicioProduccion: cleanDate(raw.fechaInicioProduccion),
    fechaFinProduccion: cleanDate(raw.fechaFinProduccion),
    fechaInicioCongelacion: cleanDate(raw.fechaInicioCongelacion),
    fechaFinCongelacion: cleanDate(raw.fechaFinCongelacion),
    proceso: cleanStr(raw.proceso) || null,
    tipo: cleanStr(raw.tipoMovimiento) === 'Exportación' ? 'exportacion' : 'deposito',
  };

  return record;
}

function parseRowExp(row: unknown[], rowIndex: number): ExpRecord | null {
  const base = parseRow(row, EXPO_PREFIX, rowIndex);
  if (!base) return null;

  // Extract extra fields from the row (0-based index)
  const g = (col: number) => row[col - 1] ?? null;

  return {
    ...base,
    tipo: 'exportacion',
    papelSeguridad: cleanStr(g(59)) || undefined,
    recibidaFechaHora: cleanDate(g(27)) ?? undefined,
    recepcionServicio: cleanStr(g(26)) || undefined,
    inspeccionExteriorConforme: cleanStr(g(31)) || undefined,
    precinto2: cleanStr(g(15)) || undefined,
    precinto3: cleanStr(g(16)) || undefined,
    precinto4: cleanStr(g(17)) || undefined,
    precintoAgencia: cleanStr(g(18)) || undefined,
    guiaINAC: cleanStr(g(19)) || undefined,
    correspondeAbrirContenedor: cleanStr(g(23)) || undefined,
    validezMercaderia: cleanStr(g(25)) || undefined,
    recibidaTemperatura: g(28) != null ? (cleanNum(g(28)) ?? cleanStr(g(28))) : undefined,
    recepcionObservaciones: cleanStr(g(29)) || undefined,
    recepcionUsuario: cleanStr(g(30)) || undefined,
    obsInspeccionExterior: cleanStr(g(39)) || undefined,
    contenedorInspeccion: cleanStr(g(32)) || undefined,
    avionInspeccion: cleanStr(g(33)) || undefined,
    camionInspeccion: cleanStr(g(34)) || undefined,
    inspPrecinto1: cleanStr(g(35)),
    inspPrecinto2: cleanStr(g(36)) || undefined,
    inspPrecinto3: cleanStr(g(37)) || undefined,
    inspPrecinto4: cleanStr(g(38)) || undefined,
  };
}

/**
 * Parse a Registro Excel file for Depósitos (shipments).
 * Returns an array of Shipment objects.
 */
export async function parseEnviosExcel(file: File): Promise<Shipment[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Convert to array of arrays
  // Use raw: true so Date objects pass through directly to cleanDate()
  // raw: false causes XLSX to format dates as strings using cell locale, corrupting day/month
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const results: Shipment[] = [];
  for (let i = DATA_START_ROW - 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 10) continue;
    const record = parseRow(row, COTE_PREFIX, i);
    if (record) results.push(record);
  }

  return results;
}

/**
 * Parse a Registro Excel file for Exportaciones.
 * Returns an array of ExpRecord objects.
 */
export async function parseExpoExcel(file: File): Promise<ExpRecord[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const results: ExpRecord[] = [];
  for (let i = DATA_START_ROW - 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 10) continue;
    const record = parseRowExp(row, i);
    if (record) results.push(record);
  }

  return results;
}