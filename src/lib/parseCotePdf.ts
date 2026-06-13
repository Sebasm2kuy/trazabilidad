import type { ExpRecord } from './types';

interface CoteParsed extends Record<string, string | number | null> {
  nroTramite: number | null;
  nroCote: string | null;
  fechaEmitidoCote: string | null;
  contenedorSerieNro: string | null;
  precinto1: string | null;
  precintoAgencia: string | null;
  nombreMedicoVeterinario: string | null;
  nombreEstablecimientoProd: string | null;
  nroEstablecimientoProd: string | null;
  paisDestino: string | null;
  denominacionMercaderia: string | null;
  pesoBruto: number | null;
  pesoNeto: number | null;
  cantidadEnvases: number | null;
  corte: string | null;
  pallets: number | null;
  temperaturaC: number | null;
  tipoTransporte: string | null;
  guiaINAC: string | null;
  nombreEstablecimientoDestino: string | null;
  tipoMovimiento: string | null;
  observaciones: string | null;
  fechaInicioFaena: string | null;
  fechaFinFaena: string | null;
  fechaInicioProduccion: string | null;
  fechaFinProduccion: string | null;
  fechaInicioCongelacion: string | null;
  fechaFinCongelacion: string | null;
  validezMercaderia: string | null;
  estabFaenaNro: string | null;
  estabFaenaNombre: string | null;
  estabCertificadorNro: string | null;
  estabCertificadorNombre: string | null;
  expiracion: string | null;
  ingresoCotes: string[];
  codigoEnvase: number | null;
}

interface TextItem {
  text: string;
  x: number;
  y: number;
}

function parseDateDDMMYY(d: string): string | null {
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  let day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  // Validate
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
}

function parseDateWithTime(d: string): string | null {
  // Format: "11/06/26 14:57"
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  let day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

// Find the value that appears after a label (within ~50px to the right on same y line)
function findValueAfterLabel(items: TextItem[], labelText: string, yTolerance = 8): string | null {
  const labelItems = items.filter(it =>
    it.text.toLowerCase().includes(labelText.toLowerCase()) && it.text.length < 80
  );
  for (const label of labelItems) {
    // Look for items to the right, similar y
    const candidates = items.filter(it =>
      it !== label &&
      Math.abs(it.y - label.y) <= yTolerance &&
      it.x > label.x &&
      it.x - label.x < 300 &&
      it.text.trim().length > 0
    ).sort((a, b) => a.x - b.x);
    if (candidates.length > 0) {
      return candidates.map(c => c.text.trim()).join(' ').replace(/\s+/g, ' ');
    }
    // Also check next line (y + ~13-17px)
    const nextLine = items.filter(it =>
      it !== label &&
      it.y > label.y + 5 &&
      it.y < label.y + 25 &&
      it.x > 10 &&
      it.text.trim().length > 0
    ).sort((a, b) => a.x - b.x);
    if (nextLine.length > 0) {
      return nextLine.map(c => c.text.trim()).join(' ').replace(/\s+/g, ' ');
    }
  }
  return null;
}

// Find a value that appears on the same y-line and to the right of a given x position
function findValueAtPosition(items: TextItem[], targetX: number, targetY: number, xTol = 100, yTol = 10): string | null {
  const match = items.find(it =>
    Math.abs(it.x - targetX) < xTol &&
    Math.abs(it.y - targetY) < yTol &&
    it.text.trim().length > 0
  );
  return match ? match.text.trim() : null;
}

export async function extractTextItems(file: File): Promise<TextItem[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allItems: TextItem[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const tx = item.transform;
        // tx[4] = x, tx[5] = y (in PDF coords, y is from bottom)
        // Convert to top-down coords
        allItems.push({
          text: item.str.trim(),
          x: Math.round(tx[4]),
          y: Math.round(viewport.height - tx[5]),
        });
      }
    }
  }
  return allItems;
}

export async function parseCotePdf(file: File): Promise<CoteParsed> {
  const items = await extractTextItems(file);
  const fullText = items.map(it => it.text).join(' ');

  const result: CoteParsed = {
    nroTramite: null, nroCote: null, fechaEmitidoCote: null,
    contenedorSerieNro: null, precinto1: null, precintoAgencia: null,
    nombreMedicoVeterinario: null, nombreEstablecimientoProd: null,
    nroEstablecimientoProd: null, paisDestino: null, denominacionMercaderia: null,
    pesoBruto: null, pesoNeto: null, cantidadEnvases: null,
    corte: null, pallets: null, temperaturaC: null,
    tipoTransporte: null, guiaINAC: null, nombreEstablecimientoDestino: null,
    tipoMovimiento: null, observaciones: null,
    fechaInicioFaena: null, fechaFinFaena: null,
    fechaInicioProduccion: null, fechaFinProduccion: null,
    fechaInicioCongelacion: null, fechaFinCongelacion: null,
    validezMercaderia: null, estabFaenaNro: null, estabFaenaNombre: null,
    estabCertificadorNro: null, estabCertificadorNombre: null,
    expiracion: null,
    ingresoCotes: [],
    codigoEnvase: null,
  };

  // === CLEARLY LABELED FIELDS ===

  // NRO (COTE number)
  const nroMatch = fullText.match(/NRO\.\s*:\s*(P?\d[\d]+)/i);
  if (nroMatch) result.nroCote = nroMatch[1];

  // Tramite
  const tramMatch = fullText.match(/Nro\.\s*de\s*Trámite\s*:\s*(\d+)/i);
  if (tramMatch) result.nroTramite = parseInt(tramMatch[1], 10);

  // Fecha emitido COTE
  const emitidoVal = findValueAfterLabel(items, 'Fecha de emitido COTE');
  if (emitidoVal) result.fechaEmitidoCote = parseDateWithTime(emitidoVal);

  // Contenedor
  const contVal = findValueAfterLabel(items, 'Contenedor-Serie');
  if (contVal) result.contenedorSerieNro = contVal;

  // Precintos
  const precVal = findValueAfterLabel(items, 'Precintos Oficial');
  if (precVal) result.precinto1 = precVal;

  const precAgVal = findValueAfterLabel(items, 'Precinto Agencia');
  if (precAgVal) result.precintoAgencia = precAgVal;

  // Medico Veterinario
  const vetVal = findValueAfterLabel(items, 'Médico Veterinario');
  if (vetVal) result.nombreMedicoVeterinario = vetVal;

  // Pais Destino
  const paisVal = findValueAfterLabel(items, 'País Destino');
  if (paisVal) result.paisDestino = paisVal.toUpperCase();

  // Denominacion Mercaderia - try multiple label variations
  const denomLabels = [
    'Denominación de las Mercaderías',
    'Denominación de la Mercadería',
    'Denominación de Mercadería',
    'Denominacion de las Mercaderias',
    'Denominacion de la Mercaderia',
  ];
  for (const label of denomLabels) {
    const dv = findValueAfterLabel(items, label);
    if (dv) {
      const upper = dv.toUpperCase();
      if (upper.length >= 5 && !upper.includes('°') && !/^[\d.,\-\s°C]+$/.test(upper)) {
        result.denominacionMercaderia = upper;
        break;
      }
    }
  }
  // Fallback 1: regex on fullText
  if (!result.denominacionMercaderia) {
    const denomRegex = /Denominaci[oó]n\s+(?:de\s+(?:las|la)?\s*)?Mercader[íi]as?\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,\.\-()\/0-9]{3,})/i;
    const denomMatch = fullText.match(denomRegex);
    if (denomMatch) {
      let val = denomMatch[1].trim().toUpperCase();
      val = val.replace(/\s*-?\s*\d+[\s,]*°?\s*C.*$/i, '').trim();
      if (val.length >= 5 && !val.includes('°')) {
        result.denominacionMercaderia = val;
      }
    }
  }
  // Fallback 2: look for 'Denominación' label alone (sometimes split across lines)
  if (!result.denominacionMercaderia) {
    const denomItem = items.find(it => it.text === 'Denominación' || it.text === 'Denominacion');
    if (denomItem) {
      const vals = items.filter(it =>
        it !== denomItem &&
        it.x > denomItem.x &&
        it.y >= denomItem.y - 5 &&
        it.y <= denomItem.y + 25 &&
        it.text.trim().length > 3 &&
        !/^\d+[\s,]*°?\s*C/.test(it.text)
      ).sort((a, b) => a.y - b.y || a.x - b.x);
      if (vals.length > 0) {
        const combined = vals.map(v => v.text.trim()).join(' ').toUpperCase();
        const cleaned = combined.replace(/\s*-?\s*\d+[\s,]*°?\s*C.*$/i, '').trim();
        if (cleaned.length >= 5 && !cleaned.includes('°') && !/^[\d.,\-\s°C]+$/.test(cleaned)) {
          result.denominacionMercaderia = cleaned;
        }
      }
    }
  }

  // Helper: parse a number string handling Spanish format (dot=thousands, comma=decimal)
  function parseNum(s: string): number | null {
    if (!s) return null;
    const trimmed = s.trim();
    // Match patterns like: 1.435  |  25.680,50  |  24.500,00  |  -18  |  1.435,00
    // Spanish: dots are thousands sep, comma is decimal sep
    if (/^-?\d[\d.]*,\d+$/.test(trimmed)) {
      // Has comma-decimal: "25.680,50" → remove dots → "25680,50" → replace comma → "25680.50"
      return parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
    }
    if (/^-?\d[\d,]*\.\d+$/.test(trimmed)) {
      // Has dot-decimal: "25680.50" → just parse (already standard)
      return parseFloat(trimmed.replace(/,/g, ''));
    }
    if (/^-?\d[\d.]+$/.test(trimmed)) {
      // Integer with possible dot-thousands: "1.435" → 1435
      return parseInt(trimmed.replace(/\./g, ''), 10) || null;
    }
    if (/^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    const n = parseFloat(trimmed.replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Totales - X-POSITION PROXIMITY MATCHING
  // Strategy: find column headers in a wide area, match TOTALES row values to nearest header by x-position
  const totalesLabel = items.find(it => it.text === 'TOTALES');
  if (totalesLabel) {
    function classifyHeader(text: string): string | null {
      const t = text.toLowerCase();
      if (t.includes('pallet')) return 'pallets';
      if (t.includes('cantidad') && t.includes('envase')) return 'envases';
      if (t.includes('cant') && t.includes('envase')) return 'envases';
      if (t.includes('cajas') && !t.includes('cod') && !t.includes('código')) return 'envases';
      // "Envases" alone — but NOT "Código Envase" or "Cod. Envase"
      if (t === 'envases' || t === 'envase' || (t.includes('envase') && !t.includes('código') && !t.includes('cod') && !t.includes('cant'))) return 'envases';
      if (t.includes('peso bruto') || (t.includes('bruto') && t.includes('peso'))) return 'pesoBruto';
      if (t.includes('peso neto') || (t.includes('neto') && t.includes('peso'))) return 'pesoNeto';
      if (t.includes('temperatura') || t.includes('temp')) return 'temperatura';
      if ((t.includes('cod') || t.includes('código')) && t.includes('envase')) return 'codigoEnvase';
      return null;
    }

    // Search for headers in a WIDE area above TOTALES (up to 200px) and full x-range
    const headerCandidates = items.filter(it =>
      it.y < totalesLabel.y &&
      it.y > totalesLabel.y - 200 &&
      it.text.trim().length > 2 &&
      classifyHeader(it.text) !== null
    );

    // Deduplicate headers by type (keep leftmost occurrence for each type)
    const seenTypes = new Set<string>();
    const columns: { type: string; x: number }[] = [];
    for (const item of headerCandidates) {
      const type = classifyHeader(item.text);
      if (type && !seenTypes.has(type)) {
        seenTypes.add(type);
        columns.push({ type, x: item.x });
      }
    }
    columns.sort((a, b) => a.x - b.x);

    // Get ALL items on the TOTALES row (same y, to the right of TOTALES label)
    const totalesRowItems = items.filter(it =>
      Math.abs(it.y - totalesLabel.y) <= 10 &&
      it.x > totalesLabel.x &&
      it !== totalesLabel
    ).sort((a, b) => a.x - b.x);

    // Extract only numeric items from TOTALES row
    const numericItems = totalesRowItems.filter(it => /^-?[\d.,]+$/.test(it.text.trim()));

    if (columns.length >= 2 && numericItems.length >= 2) {
      // X-POSITION PROXIMITY: match each header to the nearest unassigned numeric value by x-position
      const assigned = new Set<number>();
      for (const col of columns) {
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < numericItems.length; i++) {
          if (assigned.has(i)) continue;
          const dist = Math.abs(numericItems[i].x - col.x);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0 && bestDist < 120) {
          assigned.add(bestIdx);
          const val = parseNum(numericItems[bestIdx].text.trim());
          if (val !== null) {
            switch (col.type) {
              case 'pallets': result.pallets = Math.round(val); break;
              case 'envases': result.cantidadEnvases = Math.round(val); break;
              case 'pesoBruto': result.pesoBruto = Math.round(val * 100) / 100; break;
              case 'pesoNeto': result.pesoNeto = Math.round(val * 100) / 100; break;
              case 'temperatura': result.temperaturaC = Math.round(val * 10) / 10; break;
              case 'codigoEnvase': result.codigoEnvase = Math.round(val); break;
            }
          }
        }
      }

      // Assign any UNASSIGNED numeric values using magnitude heuristics
      const unassigned = numericItems
        .filter((_, i) => !assigned.has(i))
        .map(it => parseNum(it.text))
        .filter((v): v is number => v !== null);

      if (result.cantidadEnvases == null && unassigned.length > 0) {
        // The smallest value is most likely envases (typically 100-50000)
        const sorted = [...unassigned].sort((a, b) => a - b);
        result.cantidadEnvases = Math.round(sorted[0]);
        unassigned.splice(unassigned.indexOf(sorted[0]), 1);
      }
      if (result.pesoBruto == null && unassigned.length > 0) {
        // Larger of remaining values is pesoBruto
        const sorted = [...unassigned].sort((a, b) => b - a);
        result.pesoBruto = Math.round(sorted[0] * 100) / 100;
        unassigned.splice(unassigned.indexOf(sorted[0]), 1);
      }
      if (result.pesoNeto == null && unassigned.length > 0) {
        result.pesoNeto = Math.round(unassigned[0] * 100) / 100;
      }
    } else if (numericItems.length >= 1) {
      // No headers found - use magnitude heuristics for all values
      const values = numericItems.map(it => parseNum(it.text)).filter((v): v is number => v !== null);
      values.sort((a, b) => a - b);

      if (values.length >= 4) {
        // 4+ values: smallest could be pallets (< 100), 2nd is envases, 2 larger are pesos
        if (values[0] < 100) {
          result.pallets = Math.round(values[0]);
          result.cantidadEnvases = Math.round(values[1]);
        } else {
          result.cantidadEnvases = Math.round(values[0]);
        }
        // Two largest: bigger is pesoBruto
        const pesos = values.length >= 4 && values[0] < 100 ? values.slice(2) : values.slice(1);
        if (pesos.length >= 2) {
          result.pesoBruto = Math.round(Math.max(pesos[0], pesos[1]) * 100) / 100;
          result.pesoNeto = Math.round(Math.min(pesos[0], pesos[1]) * 100) / 100;
        } else if (pesos.length === 1) {
          result.pesoBruto = Math.round(pesos[0] * 100) / 100;
        }
      } else if (values.length === 3) {
        // 3 values: smallest is envases, two larger are peso values
        result.cantidadEnvases = Math.round(values[0]);
        result.pesoBruto = Math.round(Math.max(values[1], values[2]) * 100) / 100;
        result.pesoNeto = Math.round(Math.min(values[1], values[2]) * 100) / 100;
      } else if (values.length === 2) {
        // 2 values: if one is much smaller, it's envases
        if (values[0] < values[1] * 0.5) {
          result.cantidadEnvases = Math.round(values[0]);
          result.pesoBruto = Math.round(values[1] * 100) / 100;
        } else {
          result.pesoBruto = Math.round(values[0] * 100) / 100;
          result.pesoNeto = Math.round(values[1] * 100) / 100;
        }
      } else if (values.length === 1) {
        result.pesoBruto = Math.round(values[0] * 100) / 100;
      }
    }
  }

  // Establecimiento Faena - look for label, get number and name
  const faenaItems = items.filter(it => it.text.includes('Establecimiento/s Faena'));
  if (faenaItems.length > 0) {
    const faenaLabel = faenaItems[0];
    // Number and name usually appear below the label
    const below = items.filter(it =>
      it.y > faenaLabel.y + 5 && it.y < faenaLabel.y + 30 &&
      it.x > 10 && it.x < 400
    ).sort((a, b) => a.y - b.y || a.x - b.x);
    if (below.length >= 2) {
      result.estabFaenaNro = below[0].text.trim();
      result.estabFaenaNombre = below[1].text.trim();
    } else if (below.length === 1) {
      // Try to split number from name
      const m = below[0].text.trim().match(/^(\d+)\s+(.+)$/);
      if (m) {
        result.estabFaenaNro = m[1];
        result.estabFaenaNombre = m[2];
      }
    }
  }

  // Establecimiento Productor
  const prodItems = items.filter(it => it.text.includes('Establecimiento Productor'));
  if (prodItems.length > 0) {
    const prodLabel = prodItems[0];
    const below = items.filter(it =>
      it.y > prodLabel.y + 5 && it.y < prodLabel.y + 25 &&
      it.x > 10 && it.x < 400
    ).sort((a, b) => a.y - b.y || a.x - b.x);
    if (below.length >= 2) {
      result.nroEstablecimientoProd = below[0].text.trim();
      result.nombreEstablecimientoProd = below[1].text.trim();
    } else if (below.length === 1) {
      const m = below[0].text.trim().match(/^(\d+)\s+(.+)$/);
      if (m) {
        result.nroEstablecimientoProd = m[1];
        result.nombreEstablecimientoProd = m[2];
      }
    }
  }

  // Establecimiento Certificador
  const certItems = items.filter(it => it.text.includes('Establecimiento Certificador'));
  if (certItems.length > 0) {
    const certLabel = certItems[0];
    const below = items.filter(it =>
      it.y > certLabel.y + 5 && it.y < certLabel.y + 25 &&
      it.x > 10 && it.x < 400
    ).sort((a, b) => a.y - b.y || a.x - b.x);
    if (below.length >= 2) {
      result.estabCertificadorNro = below[0].text.trim();
      result.estabCertificadorNombre = below[1].text.trim();
    } else if (below.length === 1) {
      const m = below[0].text.trim().match(/^(\d+)\s+(.+)$/);
      if (m) {
        result.estabCertificadorNro = m[1];
        result.estabCertificadorNombre = m[2];
      }
    }
  }

  // Establecimiento Destino
  const destItems = items.filter(it => it.text.includes('Establecimiento Destino'));
  if (destItems.length > 0) {
    const destLabel = destItems[0];
    const below = items.filter(it =>
      it.y > destLabel.y - 5 && it.y < destLabel.y + 20 &&
      it.x > 100
    ).sort((a, b) => a.x - b.x);
    if (below.length >= 2) {
      result.nombreEstablecimientoDestino = below.slice(1).map(b => b.text.trim()).join(' ');
    }
  }

  // Tipo de movimiento
  const movItems = items.filter(it => it.text.includes('Tipo de movimiento'));
  if (movItems.length > 0) {
    const movLabel = movItems[0];
    const sameLine = items.filter(it =>
      Math.abs(it.y - movLabel.y) <= 8 && it.x > movLabel.x
    ).sort((a, b) => a.x - b.x);
    if (sameLine.length > 0) {
      result.tipoMovimiento = sameLine[0].text.trim();
    }
  }

  // Temperatura
  const tempVal = findValueAfterLabel(items, 'Temperatura');
  if (tempVal) {
    const num = parseFloat(tempVal.replace(',', '.'));
    if (!isNaN(num)) result.temperaturaC = num;
  }

  // Tipo de transporte
  const transVal = findValueAfterLabel(items, 'Tipo de transporte');
  if (transVal) result.tipoTransporte = transVal;

  // Guia INAC
  const guiaVal = findValueAfterLabel(items, 'Guía de INAC');
  if (guiaVal && guiaVal.length > 0) result.guiaINAC = guiaVal;

  // Observaciones (section 2.3)
  const obsItems = items.filter(it => it.text.includes('2.3 Observaciones'));
  if (obsItems.length > 0) {
    const obsLabel = obsItems[0];
    const obsTexts = items.filter(it =>
      it.y > obsLabel.y - 5 && it.y < obsLabel.y + 30 &&
      it.x > obsLabel.x && it.x < 550 &&
      it.text.length > 2 &&
      !it.text.includes('2.3')
    ).sort((a, b) => a.y - b.y || a.x - b.x);
    if (obsTexts.length > 0) {
      result.observaciones = obsTexts.map(t => t.text.trim()).join(' ').replace(/\s+/g, ' ');
    }
  }

  // === EXTRACT INGRESO COTES FROM OBSERVACIONES ===
  // Patterns: "P14882 - P14907 - P14938" or "P14882, P14907" or "COTES DE INGRESO ... P\d+"
  const obsText = result.observaciones || fullText;
  // Match COTE numbers like P15246, P14882, etc. (P followed by digits)
  const coteMatches = obsText.match(/P\d{4,8}/gi) || [];
  // Filter out the export COTE itself and deduplicate
  const exportCote = result.nroCote?.toUpperCase() || '';
  const ingresoSet = new Set<string>();
  for (const c of coteMatches) {
    const upper = c.toUpperCase();
    if (upper !== exportCote) {
      ingresoSet.add(upper);
    }
  }
  result.ingresoCotes = [...ingresoSet];

  // === TABLE SECTION: Dates ===
  // Find the table area by looking for "Fechas" header and date patterns
  const fechaItems = items.filter(it => it.text === 'Fechas');
  if (fechaItems.length > 0) {
    const fechaY = fechaItems[0].y;

    // Find all date-like items near the Fechas section (within ~50px below)
    const datePattern = /\d{2}\/\d{2}\/\d{2}/;
    const dateItemsInTable = items.filter(it =>
      datePattern.test(it.text) &&
      it.y > fechaY - 15 && it.y < fechaY + 50
    );

    // Group dates by x-position (column) - within 15px tolerance
    const columns: { x: number; dates: TextItem[] }[] = [];
    for (const di of dateItemsInTable) {
      let found = false;
      for (const col of columns) {
        if (Math.abs(col.x - di.x) < 15) {
          col.dates.push(di);
          found = true;
          break;
        }
      }
      if (!found) {
        columns.push({ x: di.x, dates: [di] });
      }
    }
    columns.sort((a, b) => a.x - b.x);

    // Also find column headers to map columns
    const colHeaders = ['Faena', 'Producción', 'Congelación', 'Expiración'];
    // Find header positions
    const headerPositions: { name: string; x: number }[] = [];
    for (const header of colHeaders) {
      const hItem = items.find(it =>
        it.text.includes(header) && Math.abs(it.y - (fechaY - 12)) < 15
      );
      if (hItem) headerPositions.push({ name: header, x: hItem.x });
    }
    headerPositions.sort((a, b) => a.x - b.x);

    // Map each column of dates to the nearest header
    // Each column has 2 dates: Inicio (higher y) and Fin (lower y)
    for (const col of columns) {
      // Find nearest header
      let nearestHeader = headerPositions.reduce((best, h) =>
        Math.abs(h.x - col.x) < Math.abs(best.x - col.x) ? h : best
      , headerPositions[0]);

      col.dates.sort((a, b) => a.y - b.y);

      if (nearestHeader) {
        const headerName = nearestHeader.name;
        if (col.dates.length >= 1) {
          const inicioDate = parseDateDDMMYY(col.dates[0].text);
          if (headerName === 'Faena' && inicioDate) result.fechaInicioFaena = inicioDate;
          if (headerName === 'Producción' && inicioDate) result.fechaInicioProduccion = inicioDate;
          if (headerName === 'Congelación' && inicioDate) result.fechaInicioCongelacion = inicioDate;
          if (headerName === 'Expiración' && inicioDate) result.expiracion = inicioDate;
        }
        if (col.dates.length >= 2) {
          const finDate = parseDateDDMMYY(col.dates[1].text);
          if (headerName === 'Faena' && finDate) result.fechaFinFaena = finDate;
          if (headerName === 'Producción' && finDate) result.fechaFinProduccion = finDate;
          if (headerName === 'Congelación' && finDate) result.fechaFinCongelacion = finDate;
        }
      }
    }

    // If there's an extra date column after Expiración, it might be Validez
    if (columns.length > headerPositions.length) {
      const extraCol = columns[columns.length - 1];
      if (extraCol.dates.length > 0) {
        const vDate = parseDateDDMMYY(extraCol.dates[0].text);
        if (vDate) result.validezMercaderia = vDate;
      }
    }
  }

  // === TABLE SECTION: Corte, Pallets, etc. ===
  // Look for "Corte:" label in the table area
  const corteLabel = items.find(it => it.text === 'Corte:');
  if (corteLabel) {
    const corteVal = items.find(it =>
      Math.abs(it.y - corteLabel.y) <= 8 &&
      it.x > corteLabel.x && it.x < corteLabel.x + 150
    );
    if (corteVal) result.corte = corteVal.text.trim();
  }

  // Pallets - also check table body rows (not just TOTALES)
  // Only set if not already extracted from TOTALES row
  if (result.pallets == null) {
    const palletsLabel = items.find(it => it.text === 'Pallets');
    if (palletsLabel) {
      const palletVal = items.find(it =>
        Math.abs(it.y - palletsLabel.y) <= 20 &&
        it.x > palletsLabel.x - 10 && it.x < palletsLabel.x + 120 &&
        /^[\d]+$/.test(it.text.trim())
      );
      if (palletVal) {
        const p = parseInt(palletVal.text, 10);
        if (!isNaN(p)) result.pallets = p;
      }
    }
  }

  // Código Envase - only set if not already extracted from TOTALES row
  if (result.codigoEnvase == null) {
    const codEnvLabel = items.find(it => it.text === 'Cod. Envase:' || it.text === 'Cod.Envase:');
    if (codEnvLabel) {
      const codEnvVal = items.find(it =>
        Math.abs(it.y - codEnvLabel.y) <= 20 &&
        it.x > codEnvLabel.x && it.x < codEnvLabel.x + 100
      );
      if (codEnvVal) {
        const c = parseInt(codEnvVal.text, 10);
        if (!isNaN(c)) result.codigoEnvase = c;
      }
    }
  }

  return result;
}

// Convert parsed COTE to a new ExpRecord for adding to the system
export function coteToExpRecord(parsed: CoteParsed): Partial<ExpRecord> & { id: string; nroTramite: number; nroCote: string; tipo: string; nombreEstablecimientoDestino: string; paisDestino: string; denominacionMercaderia: string; corte: string; fechaTramite: string } {
  const now = new Date().toISOString();
  return {
    id: `pdf_${parsed.nroCote || Date.now()}_${Date.now()}`,
    nroTramite: parsed.nroTramite || 0,
    nroCote: parsed.nroCote || '',
    tipo: 'EXPORTACION',
    fechaTramite: parsed.fechaEmitidoCote || now,
    fechaEmitidoCote: parsed.fechaEmitidoCote,
    paisDestino: parsed.paisDestino || '',
    denominacionMercaderia: parsed.denominacionMercaderia || '',
    corte: parsed.corte || '',
    nombreEstablecimientoDestino: parsed.nombreEstablecimientoDestino || '',
    nombreEstablecimientoProd: parsed.nombreEstablecimientoProd || '',
    nroEstablecimientoProd: parsed.nroEstablecimientoProd ? parseInt(parsed.nroEstablecimientoProd, 10) : null,
    nombreEstablecimientoCertif: parsed.estabCertificadorNombre || '',
    nombreMedicoVeterinario: parsed.nombreMedicoVeterinario || '',
    contenedorSerieNro: parsed.contenedorSerieNro || '',
    matriculaCamion: '',
    precinto1: parsed.precinto1 || '',
    precintoAgencia: parsed.precintoAgencia || '',
    guiaINAC: parsed.guiaINAC || '',
    tipoTransporte: parsed.tipoTransporte || '',
    pesoBruto: parsed.pesoBruto,
    pesoNeto: parsed.pesoNeto,
    cantidadEnvases: parsed.cantidadEnvases,
    pallets: parsed.pallets,
    temperaturaC: parsed.temperaturaC,
    tipoMovimiento: parsed.tipoMovimiento || '',
    observaciones: parsed.observaciones || '',
    fechaInicioFaena: parsed.fechaInicioFaena,
    fechaFinFaena: parsed.fechaFinFaena,
    fechaInicioProduccion: parsed.fechaInicioProduccion,
    fechaFinProduccion: parsed.fechaFinProduccion,
    fechaInicioCongelacion: parsed.fechaInicioCongelacion,
    fechaFinCongelacion: parsed.fechaFinCongelacion,
    papelSeguridad: '',
    recibidaFechaHora: '',
    recepcionServicio: '',
    inspeccionExteriorConforme: '',
    recibidaTemperatura: null,
    recepcionObservaciones: '',
    recepcionUsuario: '',
    obsInspeccionExterior: '',
    correspondeAbrirContenedor: '',
    validezMercaderia: parsed.validezMercaderia || '',
    matriculaAvion: '',
    precinto2: '',
    precinto3: '',
    precinto4: '',
    contenedorInspeccion: '',
    avionInspeccion: '',
    camionInspeccion: '',
    inspPrecinto1: '',
    inspPrecinto2: '',
    inspPrecinto3: '',
    inspPrecinto4: '',
    loteUsaCanada: '',
    lotesChina: '',
    baja: '',
    proceso: '',
    shipping: '',
    codigoEnvase: parsed.codigoEnvase,
  };
}