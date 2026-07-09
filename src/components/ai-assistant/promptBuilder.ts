// ============================================================
// promptBuilder.ts — Construcción de prompts y análisis local
// ------------------------------------------------------------
// Extrae TODA la lógica de prompts del componente React.
// Esto incluye:
//   - buildSystemPrompt(): contexto del sistema para GPT
//   - buildVisionPrompt(): prompt para extracción de imágenes
//   - localAnalysis(): análisis offline (cuando no hay Puter o
//     para queries específicas como COTE, errores, borrado, etc.)
// ============================================================

import type { ChatMessage } from './types';
import {
  loadDepImported, loadDepNewRecords, loadDepEdits, loadStockPallets,
  loadExpImported, saveDepNewRecords, saveDepEdits, notifyDataChanged,
  type IngresoRecord, type StockPallet,
} from './storage';

// --- Prompt del sistema (para chat con texto) ---

/**
 * Construye el prompt del sistema con el contexto de la app.
 * Lee datos reales de localStorage para dar contexto actualizado.
 */
export function buildSystemPrompt(activeTab: string): string {
  let context = `Sos un INGENIERO DE TRAZABILIDAD integrado en la app. Conocés cómo funciona la app y detectás bugs reales.

CÓMO FUNCIONA LA APP (ESTADO ACTUAL DEL CÓDIGO):
- Pestaña "A Depósitos": ingresos a Caliral. Guarda en:
  • trazabilidad_dep_imported (Excel), trazabilidad_dep_new_records (manuales/PDF), trazabilidad_dep_edits (ediciones)
- Pestaña "Trazabilidad": cruza stock + ingresos + exportaciones.
  ⚠️ IMPORTANTE: YA lee dep_new_records + dep_edits + dep_imported (fix aplicado).
  Si un COTE está en dep_edits con ID new_dep_, YA aparece en Trazabilidad. NO reportar esto como bug.
- Pestaña "Cruces X COTE": similar.
- Stock: en trazabilidad_stock_data.

BUGS YA RESUELTOS (NO reportar como pendientes):
- P14702 en dep_edits: YA resuelto. Trazabilidad lee dep_edits, P14702 aparece con ingreso 1891 cajas.
- Cualquier COTE en dep_edits con ID new_dep_: YA aparece en Trazabilidad.

PROBLEMAS REALES PENDIENTES (podés reportar estos):
- 9 COTEs en stock sin ingreso: B44473, B444750, B489250 (pases sanitarios), P14699, P14651, P14677, P14694, P14706, P14689 (retornos China). Necesitan archivo de pases sanitarios o ingresos manuales.
- Algunos COTEs con diff grande por doble conteo en exportaciones consolidadas.

PESTAÑA ACTUAL: ${activeTab}

`;

  // Scan for inconsistencies
  try {
    const newRecs = loadDepNewRecords();
    const edits = loadDepEdits();
    const imported = loadDepImported();
    const stockPallets = loadStockPallets();

    const cotesInNew = new Set(newRecs.map(r => r.nroCote).filter(Boolean));
    const cotesInEdits = new Set<string>();
    const editsNotInNew: string[] = [];
    for (const [editId, editData] of Object.entries(edits)) {
      if (editData.nroCote && (editId.startsWith('new_dep_') || editId.startsWith('manual_'))) {
        cotesInEdits.add(editData.nroCote);
        if (!cotesInNew.has(editData.nroCote)) {
          editsNotInNew.push(`${editData.nroCote} (editId: ${editId}, cajas: ${editData.cantidadEnvases})`);
        }
      }
    }

    const stockCotes = new Set(stockPallets.map(p => p.codigo).filter(Boolean));
    const cotesInImported = new Set(imported.map(r => r.nroCote).filter(Boolean));
    const stockSinIngreso: string[] = [];
    for (const cote of stockCotes) {
      if (!cotesInNew.has(cote) && !cotesInEdits.has(cote) && !cotesInImported.has(cote)) {
        stockSinIngreso.push(cote);
      }
    }

    context += `ESTADO DE DATOS:
- dep_imported: ${imported.length} registros, ${cotesInImported.size} COTEs únicos
- dep_new_records: ${newRecs.length} registros, ${cotesInNew.size} COTEs únicos
- dep_edits: ${Object.keys(edits).length} ediciones, ${cotesInEdits.size} COTEs únicos
- stock_data: ${stockCotes.size} COTEs únicos

INCONSISTENCIAS DETECTADAS:
`;

    if (editsNotInNew.length > 0) {
      context += `⚠️ COTEs en EDITS pero NO en NEW_RECORDS (Trazabilidad podría no verlos):
${editsNotInNew.map(c => `  - ${c}`).join('\n')}
`;
    }

    if (stockSinIngreso.length > 0) {
      context += `⚠️ COTEs en STOCK sin ingreso en ningún lado (${stockSinIngreso.length}):
${stockSinIngreso.slice(0, 15).map(c => `  - ${c}`).join('\n')}
`;
    }

    // Stock data summary
    if (stockPallets.length > 0) {
      const coteStats: Record<string, { cajas: number; kg: number; pallets: number; productos: Set<string> }> = {};
      for (const p of stockPallets) {
        if (!p.codigo) continue;
        if (!coteStats[p.codigo]) coteStats[p.codigo] = { cajas: 0, kg: 0, pallets: 0, productos: new Set() };
        coteStats[p.codigo].cajas += p.cajas || 0;
        coteStats[p.codigo].kg += p.kilos || 0;
        coteStats[p.codigo].pallets += 1;
        if (p.producto) coteStats[p.codigo].productos.add(p.producto);
      }
      const cotes = Object.entries(coteStats).map(([cote, s]) => ({
        cote, cajas: s.cajas, kg: Math.round(s.kg), pallets: s.pallets,
        productos: [...s.productos].slice(0, 2),
        hasIngreso: cotesInNew.has(cote) || cotesInEdits.has(cote) || cotesInImported.has(cote),
      })).sort((a, b) => b.cajas - a.cajas);

      context += `
COTEs EN STOCK (top 25):
${cotes.slice(0, 25).map(c => `- ${c.cote}: ${c.cajas} cajas, ${c.pallets} pallets, ingreso=${c.hasIngreso ? 'SÍ' : 'NO'}, productos: ${c.productos.join(', ')}`).join('\n')}
`;
    }
  } catch {
    context += '\n(Error cargando datos detallados)\n';
  }

  context += `\nComo ingeniero, debés:
1. Detectar bugs e inconsistencias entre pestañas
2. Explicar por qué un COTE aparece en un lado y no en otro
3. Sugerir fixes concretos
4. Analizar datos reales, no dar consejos genéricos`;

  return context;
}

// --- Prompt de visión (para extracción de imágenes) ---

export function buildVisionPrompt(): string {
  return `Analizá esta captura del MGAP (Sistema de Trazabilidad de Uruguay).

IMPORTANTE: Esta captura puede mostrar:
- La pantalla principal del COTE (con trámite, fecha, producto)
- O la ventana "Mercadería Lotes" que muestra MÚLTIPLES LOTES del mismo COTE

Si ves una tabla con múltiples filas, cada fila es un LOTE (corte) del MISMO COTE, no COTEs diferentes.
El "Nro. de C.O.T.E." en cada fila puede mostrar números como P14702, P14703 — pero son sub-lotes del mismo trámite.

Extraé TODOS los lotes visibles. Si hay una sola fila, devolvé un objeto. Si hay múltiples filas, devolvé un array.

Para cada lote extraé:
- nroCote: el COTE principal (ej: P14702)
- nroTramite: número de trámite
- fecha: fecha
- producto: denominación de mercadería
- corte: nombre del corte (ej: CHUCK ROLL, FAJADA, etc.)
- cantidadEnvases: cantidad de cajas/envases de ESE lote (NO el Id Linea)
- pesoBruto: peso bruto de ese lote
- pesoNeto: peso neto de ese lote
- paisDestino: país
- establecimiento: establecimiento

IMPORTANTE: "Cantidad de Envases" es el número REAL de cajas (ej: 101, 437, 570), NO el "Id Linea" (que es 1, 2, 3...).

Si hay un solo lote, respondé: {"nroCote":"Pxxxxx",...}
Si hay múltiples lotes, respondé: [{"nroCote":"Pxxxxx","corte":"CHUCK ROLL","cantidadEnvases":"101",...},{...}]

Respondé SOLO el JSON (sin markdown, sin explicación).`;
}

// --- Análisis local (offline) ---

/**
 * Análisis local cuando no hay Puter o para queries específicas
 * (COTE, errores, borrado, corrección, saludo).
 * Reproduce exactamente el comportamiento del componente original.
 */
export function localAnalysis(question: string): string {
  const q = question.toLowerCase();

  const newRecs = loadDepNewRecords();
  const edits = loadDepEdits();
  const imported = loadDepImported();
  const stockPallets = loadStockPallets();

  const cotesInNew = new Set(newRecs.map(r => r.nroCote).filter(Boolean));
  const cotesInImported = new Set(imported.map(r => r.nroCote).filter(Boolean));
  const cotesInEdits = new Set<string>();
  const editsByCote: Record<string, Array<{ id: string; data: IngresoRecord }>> = {};
  for (const [editId, editData] of Object.entries(edits)) {
    if (editData.nroCote) {
      cotesInEdits.add(editData.nroCote);
      if (!editsByCote[editData.nroCote]) editsByCote[editData.nroCote] = [];
      editsByCote[editData.nroCote].push({ id: editId, data: editData });
    }
  }

  const stockCotes = new Set(stockPallets.map(p => p.codigo).filter(Boolean));

  // Specific COTE query
  const coteMatch = q.match(/(p\d{4,8}|b\d{4,8})/);
  if (coteMatch) {
    return analyzeCote(coteMatch[1].toUpperCase(), { cotesInNew, cotesInImported, cotesInEdits, stockCotes, newRecs, imported, editsByCote });
  }

  // Detect bugs / inconsistencies
  if (q.includes('error') || q.includes('bug') || q.includes('inconsisten') || q.includes('verifica')) {
    return analyzeErrors({ cotesInNew, cotesInImported, cotesInEdits, stockCotes, newRecs, imported, edits, stockPallets });
  }

  // P14702 específico
  if (q.includes('p14702')) {
    return analyzeP14702({ cotesInNew, cotesInImported, cotesInEdits, stockCotes, edits });
  }

  // Borrar registros
  if (q.includes('borrar') || q.includes('eliminar') || q.includes('borra')) {
    return handleDelete(q, newRecs, edits);
  }

  // Corregir cajas
  if (q.includes('corregir') || q.includes('corregí') || q.includes('actualizá') || q.includes('actualizar')) {
    return handleCorrect(q, newRecs, edits);
  }

  // Saludo
  if (q.includes('hola') || q.includes('buenas') || q.includes('hey')) {
    return `Hola! Soy tu ingeniero de trazabilidad. Monitoreo los datos en tiempo real y detecto bugs.\n\nSoy consciente de cómo funciona la app:\n- A Depósitos guarda en dep_imported, dep_new_records, dep_edits\n- Trazabilidad cruza stock + ingresos + exportaciones\n- Si un COTE está en un lado y no en otro, lo detecto\n\nPreguntame sobre un COTE específico (ej: P14702) o pedime "verifica errores".`;
  }

  // Cargar / guardar
  if (q.includes('hazlo') || q.includes('hacelo') || q.includes('ingresalo') || q.includes('ingresá') || q.includes('cargalo') || q.includes('cargá') || q.includes('guardalo') || q.includes('guardá')) {
    return `No puedo guardar datos directamente desde el chat.\n\nPara cargar un ingreso:\n1. Usá el botón 📷 para subir capturas del MGAP\n2. Pegá capturas con Ctrl+V\n3. Presioná Enter para procesar\n\nEl sistema extrae los datos automáticamente con GPT-5.4 Vision y los guarda en A Depósitos.`;
  }

  return `Pregunta: "${question}"\n\nSoy un ingeniero que analiza datos reales. Probá:\n• "P14702" - analiza un COTE específico\n• "verifica errores" - escanea inconsistencias\n• "bugs" - detecta problemas entre pestañas\n• 📷 Subí capturas del MGAP para extraer datos automáticamente`;
}

// --- Helpers de análisis local ---

interface AnalysisContext {
  cotesInNew: Set<string>;
  cotesInImported: Set<string>;
  cotesInEdits: Set<string>;
  stockCotes: Set<string>;
  newRecs?: IngresoRecord[];
  imported?: IngresoRecord[];
  editsByCote?: Record<string, Array<{ id: string; data: IngresoRecord }>>;
  edits?: Record<string, IngresoRecord>;
  stockPallets?: StockPallet[];
}

function analyzeCote(coteUpper: string, ctx: AnalysisContext): string {
  const { cotesInNew, cotesInImported, cotesInEdits, stockCotes, newRecs, imported, editsByCote } = ctx;
  let resp = `ANÁLISIS DE ${coteUpper}:\n\n`;
  const inNew = cotesInNew.has(coteUpper);
  const inImported = cotesInImported.has(coteUpper);
  const inEdits = cotesInEdits.has(coteUpper);
  const inStock = stockCotes.has(coteUpper);

  resp += `UBICACIÓN:\n`;
  resp += `• A Depósitos (imported): ${inImported ? 'SÍ' : 'NO'}\n`;
  resp += `• A Depósitos (new_records): ${inNew ? 'SÍ' : 'NO'}\n`;
  resp += `• A Depósitos (edits): ${inEdits ? 'SÍ' : 'NO'}\n`;
  resp += `• Stock: ${inStock ? 'SÍ' : 'NO'}\n\n`;

  const newCajas = (newRecs ?? []).filter(r => r.nroCote === coteUpper).reduce((s, r) => s + (r.cantidadEnvases || 0), 0);
  const importedCajas = (imported ?? []).filter(r => r.nroCote === coteUpper).reduce((s, r) => s + (r.cantidadEnvases || 0), 0);
  const editCajas = (editsByCote?.[coteUpper] || []).reduce((s, e) => s + (e.data.cantidadEnvases || 0), 0);

  resp += `CAJAS:\n`;
  if (inImported) resp += `• imported: ${importedCajas.toLocaleString('es-UY')} cajas\n`;
  if (inNew) resp += `• new_records: ${newCajas.toLocaleString('es-UY')} cajas\n`;
  if (inEdits) resp += `• edits: ${editCajas.toLocaleString('es-UY')} cajas\n`;

  const hasIngreso = inNew || inEdits || inImported;
  if (hasIngreso && !inStock) {
    resp += `\n⚠️ ${coteUpper} tiene ingreso pero NO está en stock. Posiblemente ya se exportó.\n`;
  }
  if (inStock && !hasIngreso) {
    resp += `\n⚠️ ${coteUpper} está en stock pero NO tiene ingreso. Puede ser retorno o pase sanitario.\n`;
    resp += `   Solución: usá el botón 📷 para subir capturas del MGAP y crear el ingreso.\n`;
  }
  if (inEdits) {
    resp += `\n✅ ${coteUpper} está en EDITS (${editCajas.toLocaleString('es-UY')} cajas). `;
    resp += `Trazabilidad YA lee dep_edits, debería aparecer correctamente.\n`;
  }
  if (inNew) {
    resp += `\n✅ ${coteUpper} está en NEW_RECORDS (${newCajas.toLocaleString('es-UY')} cajas).\n`;
  }
  return resp;
}

function analyzeErrors(ctx: AnalysisContext): string {
  const { cotesInNew, cotesInImported, cotesInEdits, stockCotes, newRecs, imported, edits, stockPallets } = ctx;
  let resp = `🔍 VERIFICACIÓN DE ERRORES\n=========================\n\n`;

  // 1. COTEs in edits but not in new_records
  const editsNotInNew: string[] = [];
  for (const [editId, editData] of Object.entries(edits ?? {})) {
    if (editData.nroCote && (editId.startsWith('new_dep_') || editId.startsWith('manual_'))) {
      if (!cotesInNew.has(editData.nroCote)) {
        editsNotInNew.push(`${editData.nroCote} (${editData.cantidadEnvases} cajas)`);
      }
    }
  }
  if (editsNotInNew.length > 0) {
    resp += `✅ BUG RESUELTO: COTEs en EDITS pero no en NEW_RECORDS (${editsNotInNew.length}):\n`;
    resp += editsNotInNew.map(c => `   • ${c}`).join('\n');
    resp += `\n   Estado: Trazabilidad YA lee dep_edits, estos COTEs aparecen correctamente.\n\n`;
  }

  // 2. Stock COTEs without ingreso
  const stockSinIngreso: { cote: string; cajas: number; producto: string; tipo: string }[] = [];
  if (stockPallets && stockPallets.length > 0) {
    const coteInfo: Record<string, { cajas: number; productos: Set<string>; tipo: string }> = {};
    for (const p of stockPallets) {
      if (!p.codigo) continue;
      if (!coteInfo[p.codigo]) coteInfo[p.codigo] = { cajas: 0, productos: new Set(), tipo: p.codigoTipo || 'COTE' };
      coteInfo[p.codigo].cajas += p.cajas || 0;
      if (p.producto) coteInfo[p.codigo].productos.add(p.producto);
    }
    for (const cote of stockCotes) {
      if (!cotesInNew.has(cote) && !cotesInEdits.has(cote) && !cotesInImported.has(cote)) {
        const info = coteInfo[cote];
        stockSinIngreso.push({
          cote,
          cajas: info?.cajas || 0,
          producto: info?.productos ? [...info.productos][0] || 'N/A' : 'N/A',
          tipo: info?.tipo || 'COTE',
        });
      }
    }
  }

  if (stockSinIngreso.length > 0) {
    resp += `⚠️ COTEs en STOCK sin ingreso registrado (${stockSinIngreso.length}):\n`;
    for (const s of stockSinIngreso) {
      const isPase = s.cote.startsWith('B');
      const isRetorno = s.producto.toUpperCase().includes('RETORNO');
      const causa = isPase ? 'PASE SANITARIO (canal paralelo, no en archivo COTEs)' :
                   isRetorno ? 'RETORNO DE CHINA (volvió del puerto)' :
                   'ORIGEN DESCONOCIDO';
      resp += `   • ${s.cote}: ${s.cajas} cajas — ${s.producto.substring(0, 40)}\n     Causa: ${causa}\n`;
    }
    resp += `\n   ACCIÓN: Usá el botón verde "+" en Trazabilidad para añadir ingreso manual,\n`;
    resp += `   o cargá el archivo de PASES SANITARIOS / RETORNOS si está disponible.\n\n`;
  }

  // 3. COTEs con diff > 100
  const exps = loadExpImported();
  if (exps.length > 0 && stockPallets && stockPallets.length > 0) {
    const expByCote: Record<string, number> = {};
    for (const e of exps) {
      const obs = (e.observaciones || '').toUpperCase();
      const matches = obs.match(/P\d{4,8}/g) || [];
      for (const m of matches) {
        expByCote[m] = (expByCote[m] || 0) + (e.cantidadEnvases || 0);
      }
    }

    const bigDiffs: { cote: string; stock: number; ingreso: number; exp: number; diff: number }[] = [];
    for (const cote of stockCotes) {
      const palletsForCote = stockPallets.filter(p => p.codigo === cote);
      const sc = palletsForCote.reduce((s, p) => s + (p.cajas || 0), 0);
      let ingCajas = 0;
      if (cotesInImported.has(cote)) {
        ingCajas = (imported ?? []).filter(r => r.nroCote === cote).reduce((s, r) => s + (r.cantidadEnvases || 0), 0);
      }
      const expCajas = expByCote[cote] || 0;
      const diff = sc - (ingCajas - expCajas);
      if (Math.abs(diff) > 100) {
        bigDiffs.push({ cote, stock: sc, ingreso: ingCajas, exp: expCajas, diff });
      }
    }
    bigDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (bigDiffs.length > 0) {
      resp += `🔴 COTEs con DIFF > 100 cajas (${bigDiffs.length} — top 5):\n`;
      for (const d of bigDiffs.slice(0, 5)) {
        resp += `   • ${d.cote}: stock=${d.stock}, ingreso=${d.ingreso}, exp=${d.exp}, diff=${d.diff > 0 ? '+' : ''}${d.diff}\n`;
      }
      resp += `\n`;
    }
  }

  resp += `RESUMEN:\n`;
  resp += `• ${editsNotInNew.length} COTEs en edits (YA resueltos en Trazabilidad)\n`;
  resp += `• ${stockSinIngreso.length} COTEs en stock sin ingreso (retornos/pases)\n`;
  return resp;
}

function analyzeP14702(ctx: AnalysisContext): string {
  const { cotesInNew, cotesInImported, cotesInEdits, stockCotes, edits } = ctx;
  let resp = `P14702 - ANÁLISIS DE BUG:\n\n`;
  resp += `VERIFICACIÓN DE UBICACIÓN:\n`;
  resp += `• dep_imported: ${cotesInImported.has('P14702') ? 'SÍ' : 'NO'}\n`;
  resp += `• dep_new_records: ${cotesInNew.has('P14702') ? 'SÍ' : 'NO'}\n`;
  resp += `• dep_edits: ${cotesInEdits.has('P14702') ? 'SÍ' : 'NO'}\n`;
  resp += `• stock: ${stockCotes.has('P14702') ? 'SÍ' : 'NO'}\n\n`;
  if (cotesInEdits.has('P14702') && !cotesInNew.has('P14702')) {
    const editData = Object.entries(edits ?? {}).find(([, e]) => e.nroCote === 'P14702');
    const cajas = editData ? editData[1].cantidadEnvases ?? 0 : 0;
    resp += `✅ BUG YA RESUELTO:\n`;
    resp += `P14702 está en dep_edits (${cajas} cajas) pero no en dep_new_records.\n`;
    resp += `ANTES: Trazabilidad solo leía dep_new_records → no veía P14702.\n`;
    resp += `AHORA: Trazabilidad lee dep_new_records + dep_edits + dep_imported.\n`;
    resp += `RESULTADO: P14702 aparece con ingreso=${cajas} cajas en Trazabilidad.\n\n`;
    resp += `Verificá en la pestaña Trazabilidad: P14702 debería mostrar:\n`;
    resp += `• Stock: 1.888 cajas\n`;
    resp += `• Ingreso: ${cajas} cajas\n`;
    resp += `• Diff: ${1888 - cajas} cajas\n`;
  }
  return resp;
}

function handleDelete(q: string, newRecs: IngresoRecord[], edits: Record<string, IngresoRecord>): string {
  const coteMatch2 = q.match(/(p\d{4,8}|b\d{4,8})/);
  if (!coteMatch2) {
    return 'Especificá el COTE a borrar. Ej: "borrar P14702"';
  }
  const cote = coteMatch2[1].toUpperCase();
  let deleted = 0;
  const filtered = newRecs.filter(r => r.nroCote !== cote);
  deleted += newRecs.length - filtered.length;
  saveDepNewRecords(filtered);
  for (const [id, ed] of Object.entries(edits)) {
    if (ed.nroCote === cote) {
      delete edits[id];
      deleted++;
    }
  }
  saveDepEdits(edits);
  notifyDataChanged();
  return `✅ Borrados ${deleted} registro(s) de ${cote}.\nAndá a Trazabilidad para verificar.`;
}

function handleCorrect(q: string, newRecs: IngresoRecord[], edits: Record<string, IngresoRecord>): string {
  const coteMatch3 = q.match(/(p\d{4,8}|b\d{4,8})/);
  const cajasMatch = q.match(/(\d+)\s*cajas?/);
  if (!coteMatch3 || !cajasMatch) {
    return 'Especificá COTE y cajas. Ej: "corregir P14702 1888 cajas"';
  }
  const cote = coteMatch3[1].toUpperCase();
  const nuevasCajas = parseInt(cajasMatch[1]);
  let updated = 0;
  for (const r of newRecs) {
    if (r.nroCote === cote) {
      r.cantidadEnvases = nuevasCajas;
      updated++;
    }
  }
  saveDepNewRecords(newRecs);
  for (const [id, ed] of Object.entries(edits)) {
    if (ed.nroCote === cote) {
      edits[id].cantidadEnvases = nuevasCajas;
      updated++;
    }
  }
  saveDepEdits(edits);
  notifyDataChanged();
  return `✅ ${cote} actualizado a ${nuevasCajas.toLocaleString('es-UY')} cajas (${updated} registro(s) modificados).`;
}

/**
 * Determina si una pregunta debe responderse localmente (sin llamar a Puter).
 * Replica la lógica del componente original.
 */
export function isLocalQuery(question: string): boolean {
  const q = question.toLowerCase();
  return q.includes('error') || q.includes('bug') || q.includes('verifica') ||
         q.includes('inconsisten') || !!q.match(/(p\d{4,8}|b\d{4,8})/) ||
         q.includes('hola') || q.includes('buenas') || q.includes('resumen') ||
         q.includes('borrar') || q.includes('eliminar') || q.includes('corregir') ||
         q.includes('actualizá') || q.includes('actualizar');
}

/**
 * Determina si el mensaje del usuario corresponde a "cargar/guardar algo".
 * Replica la lógica del componente original.
 */
export function isLoadIntent(question: string): boolean {
  const q = question.toLowerCase();
  return q.includes('hazlo') || q.includes('hacelo') || q.includes('ingresalo') ||
         q.includes('ingresá') || q.includes('cargalo') || q.includes('cargá') ||
         q.includes('guardalo') || q.includes('guardá');
}
