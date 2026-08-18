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
  denominacion_de_mercaderia: 'product', corte: 'cut', pallets: 'pallets', cantidad_de_envases: 'packages',
  peso_bruto: 'grossWeight', peso_neto: 'netWeight', id_linea: 'sourceLineId', baja: 'deleted',
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
    if (row.some(value => normalizeHeader(value) === normalizeHeader(header[0]))) continue;
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
