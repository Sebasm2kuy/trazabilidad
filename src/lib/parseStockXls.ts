// ============================================================
// Stock XLS Parser — Warehouse stock report (pallet-level)
// ============================================================
// Parses warehouse stock XLS files (e.g., movimientopallets*.xls)
// and extracts pallet data with COTE/Pase Sanitario codes.
// ============================================================

export interface StockPallet {
  id: string;
  fechaComision: string;
  fechaEntrega: string;
  contenedor: string;
  pallets: number;
  cajas: number;
  kilos: number;
  contenido: string;
  nroLote: string;
  dua: string;
  fechaVencimiento: string;
  le: string;
  codigo: string;                    // COTE (P12345) or Pase Sanitario (B44473) or ''
  codigoTipo: 'COTE' | 'PASE_SANITARIO' | 'NINGUNO';
  fechaCarga: string;                // ISO string when loaded
}

export interface StockLoad {
  fecha: string;
  cliente: string;
  pallets: StockPallet[];
}

export interface StockCodigoAgg {
  codigo: string;
  tipo: 'COTE' | 'PASE_SANITARIO';
  totalPallets: number;
  totalCajas: number;
  totalKilos: number;
  pallets: StockPallet[];
  producto: string;
  contenedores: string[];
}

// Regex patterns
const RE_COTE = /COTE\s+(P\d{4,8})/i;
const RE_PASE = /PASE\s+SANITARIO\s+(B\d{4,8})/i;

// Sentinel date meaning "no date"
const NULL_DATE_STR = '30/12/1899';

function isNullDate(d: unknown): boolean {
  if (d === null || d === undefined) return true;
  if (typeof d === 'number') {
    // Excel serial date for 1899-12-30 is 0
    return d === 0;
  }
  if (typeof d === 'string') {
    const s = d.trim();
    if (s === '' || s === NULL_DATE_STR || s === '0') return true;
    // Check for Excel serial 0
    if (s === '1899-12-30' || s === '1899/12/30') return true;
  }
  return false;
}

function formatDate(val: unknown): string {
  if (isNullDate(val)) return '';
  if (typeof val === 'number') {
    // Excel serial date: days since 1899-12-30
    try {
      const epoch = new Date(1899, 11, 30);
      const ms = epoch.getTime() + val * 86400000;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === NULL_DATE_STR) return '';
    // Try parsing DD/MM/YYYY
    const parts = s.split('/');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // Try ISO format
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { /* ignore */ }
    return s;
  }
  return '';
}

function safeNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/,/g, '').replace(/\s/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }
  return 0;
}

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractCodigo(contenido: string): { codigo: string; tipo: 'COTE' | 'PASE_SANITARIO' | 'NINGUNO' } {
  // Try COTE first
  const coteMatch = contenido.match(RE_COTE);
  if (coteMatch) {
    return { codigo: coteMatch[1].toUpperCase(), tipo: 'COTE' };
  }
  // Try Pase Sanitario
  const paseMatch = contenido.match(RE_PASE);
  if (paseMatch) {
    return { codigo: paseMatch[1].toUpperCase(), tipo: 'PASE_SANITARIO' };
  }
  return { codigo: '', tipo: 'NINGUNO' };
}

export function buildStockAggMap(pallets: StockPallet[]): Map<string, StockCodigoAgg> {
  const map = new Map<string, StockCodigoAgg>();
  for (const p of pallets) {
    if (!p.codigo) continue;
    if (!map.has(p.codigo)) {
      map.set(p.codigo, {
        codigo: p.codigo,
        tipo: p.codigoTipo,
        totalPallets: 0,
        totalCajas: 0,
        totalKilos: 0,
        pallets: [],
        producto: p.contenido.split(' - ')[0]?.substring(0, 80) || p.contenido.substring(0, 80),
        contenedores: [],
      });
    }
    const agg = map.get(p.codigo)!;
    agg.totalPallets += p.pallets;
    agg.totalCajas += p.cajas;
    agg.totalKilos += p.kilos;
    agg.pallets.push(p);
    if (p.contenedor && !agg.contenedores.includes(p.contenedor)) {
      agg.contenedores.push(p.contenedor);
    }
  }
  return map;
}

export async function parseStockXls(file: File): Promise<StockLoad> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, raw: true });

  // Get first sheet
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('El archivo no tiene hojas');
  const sheet = wb.Sheets[sheetName];

  // Convert to array of arrays (raw cell values)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 7) throw new Error('El archivo no tiene suficientes filas. Se esperan al menos 7 filas de encabezado + datos.');

  // Extract metadata from header rows
  let fecha = '';
  let cliente = '';

  // Row 1 (index 1): "Fecha: DD/MM/YYYY"
  const row1Str = safeStr(rows[1]?.[0] || rows[1]?.[1] || '');
  const fechaMatch = row1Str.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (fechaMatch) fecha = fechaMatch[1];

  // Row 0 (index 0): "Cliente: ..."
  const row0Str = safeStr(rows[0]?.[0] || '');
  if (row0Str.includes('Cliente:')) {
    cliente = row0Str.replace(/^.*?Cliente:\s*/i, '').trim();
  }

  // Parse data rows starting from index 6 (row 7 in 1-indexed)
  const pallets: StockPallet[] = [];
  let idCounter = 0;

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    // Get column values
    const col1 = safeStr(row[1]); // "Unnamed: 1" - check for "Totales:"
    const col3 = safeStr(row[3]); // Pallets column

    // Skip Totales rows
    if (col1 === 'Totales:') continue;

    // Skip header rows or NaN pallets
    if (col3 === 'Pallets' || col3 === '' || col3 === '0' && (safeStr(row[0]) === '')) {
      // Check if it's a total row by looking at column 0
      const col0 = safeStr(row[0]);
      if (col0 === 'Totales' || col0 === '' && col3 === '') continue;
      // If pallets column is "Pallets" it's a header
      if (col3 === 'Pallets') continue;
    }

    // Extract data
    const contenido = safeStr(row[6]); // Column 6: Contenido
    const palletsCount = safeNum(row[3]); // Column 3: Pallets
    const cajas = safeNum(row[4]);       // Column 4: Cajas
    const kilos = safeNum(row[5]);       // Column 5: Kilos
    const contenedor = safeStr(row[2]);  // Column 2: Contenedor
    const nroLote = safeStr(row[8]);     // Column 8: Nro Lote
    const dua = safeStr(row[9]);         // Column 9: DUA
    const fechaVenc = formatDate(row[10]); // Column 10: F. Venc.
    const le = safeStr(row[11]);         // Column 11: L/E
    const fecCom = formatDate(row[0]);   // Column 0: Fec Com
    const fecEnt = formatDate(row[1]);   // Column 1: Fec Ent (may overlap with col1 check)

    // Skip empty rows
    if (palletsCount <= 0 && cajas <= 0 && kilos <= 0 && !contenido) continue;
    if (!contenido && !contenedor) continue;

    const { codigo, tipo } = extractCodigo(contenido);

    pallets.push({
      id: `stock-${Date.now()}-${idCounter++}`,
      fechaComision: fecCom,
      fechaEntrega: fecEnt,
      contenedor,
      pallets: palletsCount || 1,
      cajas,
      kilos,
      contenido,
      nroLote,
      dua,
      fechaVencimiento: fechaVenc,
      le,
      codigo,
      codigoTipo: tipo,
      fechaCarga: new Date().toISOString(),
    });
  }

  if (pallets.length === 0) throw new Error('No se encontraron pallets en el archivo. Verifica el formato.');

  return {
    fecha,
    cliente,
    pallets,
  };
}
