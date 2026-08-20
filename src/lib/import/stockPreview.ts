import * as XLSX from 'xlsx';
import { detectHeader } from './workbookAnalyzer';
import { makeDedupKey, parseDecimal, parseUruguayanDate, preserveCode } from './normalization';

export interface StockPreviewLine {
  sourceRow: number;
  customerCode: string;
  customerName: string;
  commissionDate: string | null;
  deliveryDate: string | null;
  containerNumber: string;
  pallets: number;
  packages: number;
  kilos: number;
  productDescription: string;
  lot: string;
  dua: string;
  expirationDate: string | null;
  entryExit: string;
  cote: string;
  sanitaryPass: string;
  dedupKey: string;
}

export interface StockFilePreview {
  fileName: string;
  sourceBytes: number;
  sourceHash: string;
  sheetName: string;
  headerRow: number;
  stockDate: string | null;
  validRows: number;
  rejectedRows: { row: number; reasons: string[] }[];
  duplicateRows: number;
  totalPallets: number;
  totalPackages: number;
  totalKilos: number;
  lines: StockPreviewLine[];
  allLines: StockPreviewLine[];
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isoDate(value: unknown): string | null {
  return parseUruguayanDate(value)?.toISOString().slice(0, 10) || null;
}

function codeFromDescription(description: string, pattern: RegExp): string {
  return pattern.exec(description)?.[1]?.toUpperCase() || '';
}

export async function previewStockFile(file: File): Promise<StockFilePreview> {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 10 MB.');
  if (!/\.xls[x]?$/i.test(file.name)) throw new Error('Seleccioná un archivo XLS o XLSX.');

  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sourceHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: false });

  let selected: { sheetName: string; rows: unknown[][]; headerRow: number; recognized: Record<string, number> } | null = null;
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    try {
      const detected = detectHeader(rows, 'STOCK');
      selected = { sheetName, rows, headerRow: detected.row, recognized: detected.recognized };
      break;
    } catch { /* inspect the next sheet */ }
  }
  if (!selected) throw new Error('No se encontró una hoja con el formato de stock esperado.');

  const { rows, recognized } = selected;
  const rejectedRows: { row: number; reasons: string[] }[] = [];
  const lines: StockPreviewLine[] = [];
  const keys = new Set<string>();
  let duplicateRows = 0;
  let customerCode = '';
  let customerName = '';
  let stockDate: string | null = null;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || [];
    const first = preserveCode(row[0]);
    if (/^cliente:?$/i.test(first)) {
      customerCode = preserveCode(row[1]);
      customerName = preserveCode(row[2]);
      continue;
    }
    if (/^fecha:?$/i.test(first)) {
      stockDate ||= isoDate(row[1]);
      continue;
    }
    if (/^(fecha hasta|reporte):?$/i.test(first)) continue;
    if (index <= selected.headerRow || !row.some(value => preserveCode(value))) continue;
    if (row.some(value => /^(totales?|subtotal):?$/i.test(preserveCode(value)))) continue;
    if (/^fec\s*com$/i.test(first)) continue;

    const get = (field: string) => row[recognized[field]];
    const containerNumber = preserveCode(get('containerNumber'));
    const productDescription = preserveCode(get('productDescription'));
    const lot = preserveCode(get('lot'));
    const pallets = parseDecimal(get('pallets'));
    const packages = parseDecimal(get('packages'));
    const kilos = parseDecimal(get('kilos'));
    const reasons: string[] = [];
    if (!containerNumber) reasons.push('contenedor requerido');
    if (!productDescription) reasons.push('contenido requerido');
    if (!lot) reasons.push('lote requerido');
    if (pallets == null || !Number.isInteger(pallets) || pallets < 0) reasons.push('pallets inválidos');
    if (packages == null || !Number.isInteger(packages) || packages < 0) reasons.push('cajas inválidas');
    if (kilos == null || kilos < 0) reasons.push('kilos inválidos');
    if (reasons.length) {
      rejectedRows.push({ row: index + 1, reasons });
      continue;
    }

    const dedupKey = makeDedupKey([
      customerCode, get('commissionDate'), get('deliveryDate'), containerNumber,
      pallets, packages, kilos, productDescription, lot, get('dua'),
      get('expirationDate'), get('entryExit'),
    ]);
    if (keys.has(dedupKey)) {
      duplicateRows++;
      continue;
    }
    keys.add(dedupKey);
    lines.push({
      sourceRow: index + 1,
      customerCode,
      customerName,
      commissionDate: isoDate(get('commissionDate')),
      deliveryDate: isoDate(get('deliveryDate')),
      containerNumber,
      pallets: pallets as number,
      packages: packages as number,
      kilos: kilos as number,
      productDescription,
      lot,
      dua: preserveCode(get('dua')),
      expirationDate: isoDate(get('expirationDate')),
      entryExit: preserveCode(get('entryExit')),
      cote: codeFromDescription(productDescription, /COTE\s+(P\d{4,8})/i),
      sanitaryPass: codeFromDescription(productDescription, /PASE\s+SANITARIO\s+(B\d{4,8})/i),
      dedupKey,
    });
  }

  return {
    fileName: file.name,
    sourceBytes: file.size,
    sourceHash,
    sheetName: selected.sheetName,
    headerRow: selected.headerRow + 1,
    stockDate,
    validRows: lines.length,
    rejectedRows,
    duplicateRows,
    totalPallets: lines.reduce((sum, line) => sum + line.pallets, 0),
    totalPackages: lines.reduce((sum, line) => sum + line.packages, 0),
    totalKilos: lines.reduce((sum, line) => sum + line.kilos, 0),
    lines: lines.slice(0, 25),
    allLines: lines,
  };
}
