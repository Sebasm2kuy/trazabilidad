// ============================================================
// NACIONAL EXCEL PARSER — Lee .xlsb/.xlsx del MGAP → MovRecord[]
// ------------------------------------------------------------
// El MGAP exporta "Cargas y Embarques de Carne" con:
//   - Filas 0-15: filtros/metadata
//   - Fila 16: headers de columnas
//   - Fila 17+: datos (un registro por línea de producto)
// Convertimos a MovRecord (campos cortos) para ahorrar memoria.
// ============================================================

import type { MovRecord } from '@/intelligence/types';

const FB_URL = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function cleanNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  // DD/MM/YYYY o MM/DD/YYYY
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [_, aStr, bStr, y] = m;
    let a = parseInt(aStr, 10);
    let b = parseInt(bStr, 10);
    if (y.length === 2) y = '20' + y;
    // Heurística: si a > 12, es DD/MM. Si b > 12, es MM/DD.
    if (a > 12 && b <= 12) { [a, b] = [b, a]; }
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  // ISO
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split('T')[0];
  return s;
}

export interface ParseProgress {
  phase: 'reading' | 'parsing' | 'done';
  current: number;
  total: number;
  message: string;
}

/** Parsea un archivo .xlsb o .xlsx del MGAP → MovRecord[] */
export async function parseNacionalExcel(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<MovRecord[]> {
  onProgress?.({ phase: 'reading', current: 0, total: file.size, message: `Leyendo ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…` });

  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.({ phase: 'reading', current: file.size, total: file.size, message: 'Decodificando hojas…' });

  // XLSX.read soporta .xlsb, .xlsx, .xls
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, dense: true });

  const sheetName = wb.SheetNames[0]; // 'Registros'
  if (!sheetName) throw new Error('El archivo no tiene hojas');

  const sheet = wb.Sheets[sheetName];

  onProgress?.({ phase: 'parsing', current: 0, total: 0, message: 'Extrayendo filas…' });

  // sheet_to_json con header:1 → array de arrays, raw:true para mantener números
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  onProgress?.({ phase: 'parsing', current: 0, total: rows.length, message: `Procesando ${rows.length.toLocaleString('es-UY')} filas…` });

  const records: MovRecord[] = [];
  // Datos empiezan en fila 17 (índice 16 = header)
  for (let i = 16; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const tramite = cleanNum(row[0]);
    const cote = cleanStr(row[2]);
    if (!tramite || !cote) continue;

    const tipoMov = cleanStr(row[20]).toUpperCase();
    const isExport = tipoMov.includes('EXPORT');
    const isDep = tipoMov.includes('DEP') || tipoMov.includes('INGRESO');
    const proceso = cleanStr(row[59]).toUpperCase();
    const tpd = proceso.includes('CONGEL') ? 'Congelado' : proceso.includes('FRESC') || proceso.includes('REFRIG') ? 'Fresco' : '';

    const rec: MovRecord = {
      t: isExport ? 'EXPORTACION' : 'INGRESO',
      f: parseDate(row[1]),
      c: cote,
      cf: cleanStr(row[4]),        // certificador/empresa
      p: cleanStr(row[5]),          // productor
      np: cleanStr(row[6]),         // nro establecimiento productor
      ed: cleanStr(row[19]),        // establecimiento destino (cliente)
      tm: cleanStr(row[20]),        // tipo movimiento
      pa: cleanStr(row[23]),        // país destino
      d: cleanStr(row[42]),         // denominación mercadería (producto)
      co: cleanStr(row[43]),        // corte
      pa2: cleanNum(row[44]),       // pallets
      e: cleanNum(row[45]),         // envases
      pb: cleanNum(row[46]),        // peso bruto
      pn: cleanNum(row[47]),        // peso neto
      tt: cleanStr(row[9]),         // tipo transporte
      sh: cleanStr(row[49]),        // shipping
      tpd: tpd,                     // tipo producto (Congelado/Fresco)
      isd: isDep,                   // es depósito
    };

    records.push(rec);

    // Reportar progreso cada 10K filas
    if (onProgress && i % 10000 === 0) {
      onProgress({ phase: 'parsing', current: i, total: rows.length, message: `Procesando… ${i.toLocaleString('es-UY')} / ${rows.length.toLocaleString('es-UY')} filas` });
      // Ceder al event loop para no bloquear UI
      await new Promise(r => setTimeout(r, 0));
    }
  }

  onProgress?.({ phase: 'done', current: records.length, total: records.length, message: `${records.length.toLocaleString('es-UY')} registros procesados` });

  return records;
}

// ============================================================
// Firebase storage en chunks
// ============================================================

const CHUNK_SIZE = 5000;

/** Guarda los registros en Firebase en chunks de 5000 */
export async function saveNacionalToFirebase(
  records: MovRecord[],
  fileName: string,
  onProgress?: (saved: number, total: number) => void,
): Promise<void> {
  const totalChunks = Math.ceil(records.length / CHUNK_SIZE);

  // 1. Guardar metadata
  const meta = {
    totalRegistros: records.length,
    totalChunks,
    fileName,
    fecha: new Date().toISOString(),
  };
  const metaResp = await fetch(`${FB_URL}/mercado_nacional_meta.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!metaResp.ok) throw new Error(`Error guardando metadata: ${metaResp.status}`);

  // 2. Guardar chunks
  for (let i = 0; i < totalChunks; i++) {
    const chunk = records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const resp = await fetch(`${FB_URL}/mercado_nacional_data/${i}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!resp.ok) throw new Error(`Error guardando chunk ${i}: ${resp.status}`);
    onProgress?.(i + 1, totalChunks);
  }

  // 3. Borrar chunks sobrantes (si los hay de una carga anterior más grande)
  // Intentar borrar los siguientes 5 chunks por las dudas
  for (let i = totalChunks; i < totalChunks + 5; i++) {
    try {
      await fetch(`${FB_URL}/mercado_nacional_data/${i}.json`, { method: 'DELETE' });
    } catch { /* ignorar si no existen */ }
  }
}

/** Carga los registros desde Firebase */
export async function loadNacionalFromFirebase(): Promise<MovRecord[] | null> {
  try {
    // Chequear bloqueo post-reset
    if (typeof window !== 'undefined') {
      const blockFlag = localStorage.getItem('trazabilidad_block_firebase_pull_until');
      if (blockFlag && Date.now() < parseInt(blockFlag, 10)) {
        return null;
      }
    }

    const metaResp = await fetch(`${FB_URL}/mercado_nacional_meta.json`);
    if (!metaResp.ok) return null;
    const meta = await metaResp.json();
    if (!meta || !meta.totalRegistros || !meta.totalChunks) return null;

    const allRecords: MovRecord[] = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkResp = await fetch(`${FB_URL}/mercado_nacional_data/${i}.json`);
      if (chunkResp.ok) {
        const chunk = await chunkResp.json();
        if (Array.isArray(chunk)) allRecords.push(...chunk);
      }
    }
    return allRecords.length > 0 ? allRecords : null;
  } catch {
    return null;
  }
}

/** Obtiene la metadata del último archivo subido */
export async function getNacionalMeta(): Promise<{ fileName: string; fecha: string; totalRegistros: number } | null> {
  try {
    if (typeof window !== 'undefined') {
      const blockFlag = localStorage.getItem('trazabilidad_block_firebase_pull_until');
      if (blockFlag && Date.now() < parseInt(blockFlag, 10)) return null;
    }
    const resp = await fetch(`${FB_URL}/mercado_nacional_meta.json`);
    if (!resp.ok) return null;
    const meta = await resp.json();
    if (!meta || !meta.totalRegistros) return null;
    return { fileName: meta.fileName || '', fecha: meta.fecha || '', totalRegistros: meta.totalRegistros };
  } catch {
    return null;
  }
}
