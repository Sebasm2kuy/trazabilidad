import * as XLSX from 'xlsx';
import { makeDedupKey, normalizeHeader, parseDecimal, parseUruguayanDate, preserveCode } from './normalization';

export type ImportKind = 'INBOUND' | 'OUTBOUND' | 'STOCK';
export interface WorkbookPreview {
  kind: ImportKind; sheetName: string; headerRow: number; headers: string[];
  recognized: Record<string, number>; unknown: string[]; validRows: number;
  rejectedRows: { row: number; reasons: string[] }[]; duplicateRows: number;
  preview: unknown[][];
}

const ALIASES: Record<string, string> = {
  numero_tramite: 'procedureNumber', fecha_del_tramite: 'procedureDate', numero_de_cote: 'cote',
  nombre_medico_veterinario: 'veterinarianName', nombre_del_establecimiento_certificador: 'certifierName',
  nombre_establecimiento_productor: 'originName', numero_establecimiento_productor: 'originNumber',
  fecha_emitido_cote: 'coteIssuedAt', temperatura_c: 'temperatureC', tipo_de_transporte: 'transportType',
  contenedor_serie_y_numero: 'containerNumber', matricula_avion: 'aircraftRegistration', matricula_camion: 'truckRegistration',
  precinto_1: 'seal1', precinto_2: 'seal2', precinto_3: 'seal3', precinto_4: 'seal4',
  precinto_agencia: 'agencySeal', guia_de_i_n_a_c: 'inacGuide', nombre_establecimiento_destino: 'destinationName',
  tipo_de_movimiento: 'movementType', observaciones: 'observations', corresponde_abrir_contenedor: 'openContainer',
  pais_de_destino: 'destinationCountry', validez_de_la_mercaderia: 'goodsValidity',
  recepcion_servicio_de_inspeccion_veterinaria_de: 'receptionService', recibida_fecha_hora: 'receivedAt',
  recibida_temperatura_c: 'receivedTemperature', recepcion_obseraciones: 'receptionObservations',
  recepcion_usuario: 'receptionUser', la_inspeccion_exterior_es_conforme: 'exteriorInspectionOk',
  contenedor_serie_y_numero_de_inspeccion: 'inspectionContainer', avion_matricula_de_inspeccion: 'inspectionAircraft',
  camion_matricula_de_inspeccion: 'inspectionTruck', insp_precinto_1: 'inspectionSeal1',
  insp_precinto_2: 'inspectionSeal2', insp_precinto_3: 'inspectionSeal3', insp_precinto_4: 'inspectionSeal4',
  observaciones_insp_exterior: 'inspectionObservations',
  denominacion_de_mercaderia: 'product', corte: 'cut', pallets: 'pallets', cantidad_de_envases: 'packages',
  peso_bruto: 'grossWeight', peso_neto: 'netWeight', id_linea: 'sourceLineId', baja: 'deleted',
  codigo_envase: 'packageCode', numero_certificado_sanitario: 'sanitaryCertificate', shipping: 'shipping',
  lote_usa_canada: 'lotUsaCanada', lotes_china: 'lotsChina', fecha_inicio_faena: 'slaughterStart',
  fecha_fin_faena: 'slaughterEnd', fecha_inicio_produccion: 'productionStart',
  fecha_fin_de_produccion: 'productionEnd', fecha_inicio_congelacion: 'freezingStart',
  fecha_fin_congelacion: 'freezingEnd', papel_de_seguridad: 'securityPaper', proceso: 'process',
  fec_com: 'commissionDate', fec_ent: 'deliveryDate', contenedor: 'containerNumber', cajas: 'packages',
  kilos: 'kilos', contenido: 'productDescription', numero_lote: 'lot', dua: 'dua', f_venc: 'expirationDate', l_e: 'entryExit',
};
const REQUIRED: Record<ImportKind, string[]> = {
  INBOUND: ['procedureNumber', 'procedureDate', 'cote', 'product'],
  OUTBOUND: ['procedureNumber', 'procedureDate', 'cote', 'product'],
  STOCK: ['containerNumber', 'pallets', 'packages', 'kilos', 'productDescription', 'lot'],
};

export function detectHeader(rows: unknown[][], kind: ImportKind): { row: number; recognized: Record<string, number> } {
  let best = { row: -1, recognized: {} as Record<string, number>, score: -1 };
  rows.forEach((row, rowIndex) => {
    const recognized: Record<string, number> = {};
    row.forEach((cell, column) => { const field = ALIASES[normalizeHeader(cell)]; if (field) recognized[field] = column; });
    const score = REQUIRED[kind].filter(field => recognized[field] != null).length;
    if (score > best.score) best = { row: rowIndex, recognized, score };
  });
  if (best.score < REQUIRED[kind].length) throw new Error(`No se encontró un encabezado ${kind} completo (${best.score}/${REQUIRED[kind].length}).`);
  return best;
}

export function analyzeRows(rows: unknown[][], kind: ImportKind, sheetName = 'Sheet1'): WorkbookPreview {
  const detected = detectHeader(rows, kind);
  const header = rows[detected.row];
  const unknown = header.map((value, index) => ({ value: preserveCode(value), index })).filter(x => x.value && !Object.values(detected.recognized).includes(x.index)).map(x => x.value);
  const rejectedRows: { row: number; reasons: string[] }[] = []; const keys = new Set<string>(); let validRows = 0; let duplicateRows = 0;
  for (let index = detected.row + 1; index < rows.length; index++) {
    const row = rows[index]; const get = (field: string) => row?.[detected.recognized[field]];
    if (!row?.some(value => preserveCode(value))) continue;
    if (/^(cliente|fecha|fecha hasta|reporte):?$/i.test(preserveCode(row[0]))) continue;
    if (/^(totales?|subtotal)/i.test(preserveCode(row[0])) || row.some(value => /^(totales?|subtotal):?$/i.test(preserveCode(value)))) continue;
    if (normalizeHeader(row[0]) === normalizeHeader(header[0])) continue;
    const reasons: string[] = [];
    for (const field of REQUIRED[kind]) if (!preserveCode(get(field))) reasons.push(`${field}: requerido`);
    for (const field of kind === 'STOCK' ? ['pallets', 'packages', 'kilos'] : ['pallets', 'packages', 'grossWeight', 'netWeight']) {
      if (get(field) != null && preserveCode(get(field)) && parseDecimal(get(field)) == null) reasons.push(`${field}: número inválido`);
    }
    for (const field of kind === 'STOCK' ? ['commissionDate', 'deliveryDate', 'expirationDate'] : ['procedureDate']) {
      if (get(field) != null && preserveCode(get(field)) && parseUruguayanDate(get(field)) == null) reasons.push(`${field}: fecha inválida`);
    }
    const key = makeDedupKey(kind === 'STOCK' ? ['commissionDate','deliveryDate','containerNumber','pallets','packages','kilos','productDescription','lot','dua','expirationDate','entryExit'].map(get) : ['procedureNumber','sourceLineId','product','cut'].map(get));
    if (keys.has(key)) { duplicateRows++; continue; } keys.add(key);
    if (reasons.length) rejectedRows.push({ row: index + 1, reasons }); else validRows++;
  }
  return { kind, sheetName, headerRow: detected.row + 1, headers: header.map(preserveCode), recognized: detected.recognized, unknown, validRows, rejectedRows, duplicateRows, preview: rows.slice(detected.row + 1, detected.row + 11) };
}

export function analyzeWorkbook(buffer: ArrayBuffer, kind: ImportKind): WorkbookPreview {
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: false });
  const candidates = workbook.SheetNames.map(sheetName => ({ sheetName, rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' }) }));
  for (const candidate of candidates) { try { return analyzeRows(candidate.rows, kind, candidate.sheetName); } catch { /* continue with the next sheet */ } }
  throw new Error(`Ninguna hoja contiene las columnas obligatorias para ${kind}.`);
}
