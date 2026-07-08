// ============================================================
// ÍNDICE DE CAPTURA CALIRAL
// ------------------------------------------------------------
// Mide qué porcentaje de las exportaciones de un cliente
// estratégico (ej: NIREA SAN JACINTO) pasó por CALIRAL como
// depósito/certificador, versus el total exportado por ese
// cliente a través de cualquier certificador.
// ============================================================

import type { MovRecord } from '@/intelligence/types';

/** Constante que identifica a CALIRAL en el dataset. */
export const CALIRAL_ID = 'CALIRAL S.A.';

/** Clientes estratégicos conocidos (para autocompletar). */
export const CLIENTES_ESTRATEGICOS = [
  { id: 'NIREA', name: 'NIREA SAN JACINTO', aliases: ['NIREA SAN JACINTO', 'NIREA'] },
  { id: 'FRIGORIFICO_SAN_JACINTO', name: 'Frigorífico San Jacinto', aliases: ['FRIGORIFICO SAN JACINTO', 'FRIG. SAN JACINTO'] },
];

export interface CapturaResult {
  /** Total exportado por el cliente (kg). */
  totalClientePn: number;
  /** Total exportado a través de CALIRAL (kg). */
  caliralPn: number;
  /** Total exportado a través de otros certificadores (kg). */
  otrosPn: number;
  /** Índice de captura CALIRAL (%). */
  captureIndex: number;
  /** Registros totales del cliente. */
  totalRegistros: number;
  /** Registros a través de CALIRAL. */
  caliralRegistros: number;
  /** Desglose por país. */
  byPais: CapturaBreakdown[];
  /** Desglose por corte. */
  byCorte: CapturaBreakdown[];
  /** Desglose por mes (YYYY-MM). */
  byMes: CapturaBreakdown[];
  /** Desglose por año. */
  byAnio: CapturaBreakdown[];
  /** Desglose por certificador (todos los que usó el cliente). */
  byCertificador: CapturaBreakdown[];
  /** Países donde CALIRAL NO participó. */
  paisesSinCaliral: string[];
  /** Cortes que NO pasaron por CALIRAL. */
  cortesSinCaliral: string[];
  /** Certificadores competidores (los que el cliente usó además de CALIRAL). */
  competidores: string[];
}

export interface CapturaBreakdown {
  label: string;
  totalPn: number;
  caliralPn: number;
  captureIndex: number;
  registros: number;
}

/**
 * Filtra los registros del dataset nacional que pertenecen a un cliente.
 * IMPORTANTE: solo busca en `p` (productor) y `cf` (certificador/empresa).
 * NO busca en `ed` (establecimiento destino) porque ese campo puede ser
 * una ciudad o depósito, no el nombre del cliente, lo que generaría
 * falsos positivos masivos (ej: "San Jacinto" como ciudad).
 */
export function filterByCliente(records: MovRecord[], clienteAliases: string[]): MovRecord[] {
  if (!records.length || !clienteAliases.length) return [];
  const upper = clienteAliases.map(a => a.toUpperCase());
  return records.filter(r => {
    // Solo buscar en productor (p) y certificador (cf)
    const fields = [r.cf, r.p].filter(Boolean).map(s => (s || '').toUpperCase());
    return upper.some(alias => fields.some(f => f.includes(alias)));
  });
}

/** Computa el Índice de Captura CALIRAL para un cliente. */
export function computeCapturaCaliral(records: MovRecord[], clienteAliases: string[]): CapturaResult {
  const clienteRecs = filterByCliente(records, clienteAliases);

  if (clienteRecs.length === 0) {
    return {
      totalClientePn: 0, caliralPn: 0, otrosPn: 0, captureIndex: 0,
      totalRegistros: 0, caliralRegistros: 0,
      byPais: [], byCorte: [], byMes: [], byAnio: [], byCertificador: [],
      paisesSinCaliral: [], cortesSinCaliral: [], competidores: [],
    };
  }

  // Identificar registros que pasaron por CALIRAL.
  // CALIRAL puede aparecer como `cf` (certificador) en registros donde el
  // cliente es el productor (p). O como `ed` (establecimiento destino).
  const isCaliral = (r: MovRecord): boolean => {
    const cf = (r.cf || '').toUpperCase();
    const ed = (r.ed || '').toUpperCase();
    return cf.includes('CALIRAL') || ed.includes('CALIRAL');
  };

  const caliralRecs = clienteRecs.filter(isCaliral);
  const otrosRecs = clienteRecs.filter(r => !isCaliral(r));

  const totalClientePn = clienteRecs.reduce((s, r) => s + (r.pn || 0), 0);
  const caliralPn = caliralRecs.reduce((s, r) => s + (r.pn || 0), 0);
  const otrosPn = otrosRecs.reduce((s, r) => s + (r.pn || 0), 0);
  const captureIndex = totalClientePn > 0 ? (caliralPn / totalClientePn) * 100 : 0;

  // Desgloses
  const byPais = breakdownBy(clienteRecs, r => r.pa || '—', isCaliral);
  const byCorte = breakdownBy(clienteRecs, r => r.co || '—', isCaliral);
  const byMes = breakdownBy(clienteRecs, r => (r.f || '').substring(0, 7) || '—', isCaliral)
    .sort((a, b) => a.label.localeCompare(b.label));
  const byAnio = breakdownBy(clienteRecs, r => (r.f || '').substring(0, 4) || '—', isCaliral)
    .sort((a, b) => a.label.localeCompare(b.label));
  const byCertificador = breakdownBy(clienteRecs, r => r.cf || '—', isCaliral)
    .sort((a, b) => b.totalPn - a.totalPn);

  // Países donde CALIRAL no participó
  const paisesConCaliral = new Set(caliralRecs.map(r => r.pa).filter(Boolean));
  const paisesSinCaliral = Array.from(new Set(clienteRecs.map(r => r.pa).filter(Boolean)))
    .filter(p => !paisesConCaliral.has(p));

  // Cortes que no pasaron por CALIRAL
  const cortesConCaliral = new Set(caliralRecs.map(r => r.co).filter(Boolean));
  const cortesSinCaliral = Array.from(new Set(clienteRecs.map(r => r.co).filter(Boolean)))
    .filter(c => !cortesConCaliral.has(c));

  // Competidores: certificadores que el cliente usó además de CALIRAL
  const competidores = Array.from(new Set(otrosRecs.map(r => r.cf).filter(Boolean)));

  return {
    totalClientePn, caliralPn, otrosPn, captureIndex,
    totalRegistros: clienteRecs.length,
    caliralRegistros: caliralRecs.length,
    byPais, byCorte, byMes, byAnio, byCertificador,
    paisesSinCaliral, cortesSinCaliral, competidores,
  };
}

/** Agrupa registros por una clave y calcula captura CALIRAL por grupo. */
function breakdownBy(
  records: MovRecord[],
  keyFn: (r: MovRecord) => string,
  isCaliral: (r: MovRecord) => boolean,
): CapturaBreakdown[] {
  const map = new Map<string, { totalPn: number; caliralPn: number; registros: number }>();
  for (const r of records) {
    const k = keyFn(r);
    if (!k || k === '—') continue;
    if (!map.has(k)) map.set(k, { totalPn: 0, caliralPn: 0, registros: 0 });
    const e = map.get(k)!;
    e.totalPn += r.pn || 0;
    e.caliralPn += isCaliral(r) ? (r.pn || 0) : 0;
    e.registros++;
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({
      label,
      totalPn: v.totalPn,
      caliralPn: v.caliralPn,
      captureIndex: v.totalPn > 0 ? (v.caliralPn / v.totalPn) * 100 : 0,
      registros: v.registros,
    }))
    .sort((a, b) => b.totalPn - a.totalPn);
}

// ------------------------------------------------------------
// Generador de insights automáticos
// ------------------------------------------------------------

export interface CapturaInsight {
  id: string;
  text: string;
  severity: 'positive' | 'negative' | 'neutral' | 'warning' | 'opportunity';
}

export function generateCapturaInsights(result: CapturaResult, clienteName: string): CapturaInsight[] {
  const insights: CapturaInsight[] = [];
  const fmt = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: 0 });

  // Captura global — solo si hay captura real
  if (result.captureIndex > 0 && result.caliralPn > 0) {
    insights.push({
      id: 'capture-overall',
      text: `CALIRAL captura el ${result.captureIndex.toFixed(1)}% de las exportaciones de ${clienteName} (${fmt(result.caliralPn)} kg de ${fmt(result.totalClientePn)} kg totales).`,
      severity: result.captureIndex > 50 ? 'positive' : result.captureIndex > 25 ? 'neutral' : 'negative',
    });
  }

  // País con menor captura — SOLO si CALIRAL participó en ese país (caliralPn > 0)
  // No generar insight de "oportunidad" para países donde CALIRAL tiene 0 kg
  const paisWithCaliral = result.byPais.filter(p => p.caliralPn > 0 && p.totalPn > 1000);
  if (paisWithCaliral.length > 0) {
    const worst = paisWithCaliral.reduce((min, p) => p.captureIndex < min.captureIndex ? p : min);
    if (worst.captureIndex < 30 && worst.caliralPn > 100) {
      insights.push({
        id: 'capture-pais-worst',
        text: `En ${worst.label}, CALIRAL captura el ${worst.captureIndex.toFixed(1)}% (${fmt(worst.caliralPn)} kg de ${fmt(worst.totalPn)} kg). Oportunidad de crecimiento.`,
        severity: 'opportunity',
      });
    }
    const best = paisWithCaliral.reduce((max, p) => p.captureIndex > max.captureIndex ? p : max);
    if (best.captureIndex > 70 && best.totalPn > 5000) {
      insights.push({
        id: 'capture-pais-best',
        text: `En ${best.label}, CALIRAL captura el ${best.captureIndex.toFixed(1)}% (${fmt(best.caliralPn)} kg de ${fmt(best.totalPn)} kg). Posición dominante.`,
        severity: 'positive',
      });
    }
  }

  // Países sin CALIRAL — solo top 3 por volumen, y solo si el volumen es significativo
  if (result.paisesSinCaliral.length > 0) {
    const paisesSinCaliralConVolumen = result.byPais
      .filter(p => result.paisesSinCaliral.includes(p.label) && p.totalPn > 5000)
      .sort((a, b) => b.totalPn - a.totalPn)
      .slice(0, 3);
    if (paisesSinCaliralConVolumen.length > 0) {
      const totalPnSinCaliral = paisesSinCaliralConVolumen.reduce((s, p) => s + p.totalPn, 0);
      insights.push({
        id: 'paises-sin-caliral',
        text: `${paisesSinCaliralConVolumen.length} mercado(s) con volumen significativo sin CALIRAL: ${paisesSinCaliralConVolumen.map(p => `${p.label} (${fmt(p.totalPn)} kg)`).join(', ')}. Total no capturado: ${fmt(totalPnSinCaliral)} kg.`,
        severity: 'opportunity',
      });
    }
  }

  // Competidores — excluir al propio cliente (NIREA se autogestiona en algunos casos)
  // y excluir CALIRAL (es el que estamos midiendo)
  const competidoresReales = result.byCertificador.filter(c =>
    !c.label.toUpperCase().includes('CALIRAL') &&
    !c.label.toUpperCase().includes('NIREA') &&
    !c.label.toUpperCase().includes('SAN JACINTO') &&
    c.totalPn > 1000
  );

  // Calcular % de autogestión del cliente (cuando el cliente es su propio certificador)
  const autogestion = result.byCertificador.find(c =>
    c.label.toUpperCase().includes('NIREA') || c.label.toUpperCase().includes('SAN JACINTO')
  );
  const pctAutogestion = autogestion && result.totalClientePn > 0
    ? (autogestion.totalPn / result.totalClientePn) * 100
    : 0;

  // Insight: desglose completo de cómo se reparte el volumen
  const desglose: string[] = [];
  for (const c of result.byCertificador.slice(0, 5)) {
    const pct = result.totalClientePn > 0 ? (c.totalPn / result.totalClientePn) * 100 : 0;
    const isCaliralCf = c.label.toUpperCase().includes('CALIRAL');
    const isSelf = c.label.toUpperCase().includes('NIREA') || c.label.toUpperCase().includes('SAN JACINTO');
    const label = isCaliralCf ? 'CALIRAL (certificador)' : isSelf ? `${clienteName} (autogestión)` : c.label;
    desglose.push(`${label}: ${pct.toFixed(1)}% (${fmt(c.totalPn)} kg)`);
  }
  insights.push({
    id: 'desglose-certificadores',
    text: `Desglose del volumen: ${desglose.join(' | ')}.`,
    severity: 'neutral',
  });

  if (competidoresReales.length > 0) {
    const topCompetitor = competidoresReales[0];
    const pctDelTotal = result.totalClientePn > 0 ? (topCompetitor.totalPn / result.totalClientePn) * 100 : 0;
    insights.push({
      id: 'competidor-top',
      text: `Mayor competidor externo: ${topCompetitor.label} maneja ${fmt(topCompetitor.totalPn)} kg (${pctDelTotal.toFixed(1)}% del volumen de ${clienteName}). CALIRAL captura el ${result.captureIndex.toFixed(1)}%.`,
      severity: 'warning',
    });
  }

  // Tendencia mensual (comparar últimos 3 meses vs 3 anteriores)
  if (result.byMes.length >= 6) {
    const last3 = result.byMes.slice(-3);
    const prev3 = result.byMes.slice(-6, -3);
    const lastCapture = last3.reduce((s, m) => s + m.caliralPn, 0);
    const lastTotal = last3.reduce((s, m) => s + m.totalPn, 0);
    const prevCapture = prev3.reduce((s, m) => s + m.caliralPn, 0);
    const prevTotal = prev3.reduce((s, m) => s + m.totalPn, 0);
    const lastIdx = lastTotal > 0 ? (lastCapture / lastTotal) * 100 : 0;
    const prevIdx = prevTotal > 0 ? (prevCapture / prevTotal) * 100 : 0;
    if (Math.abs(lastIdx - prevIdx) > 3) {
      insights.push({
        id: 'trend-capture',
        text: `Participación de CALIRAL en ${clienteName} ${lastIdx > prevIdx ? 'subió' : 'cayó'} de ${prevIdx.toFixed(1)}% a ${lastIdx.toFixed(1)}% en los últimos 3 meses.`,
        severity: lastIdx > prevIdx ? 'positive' : 'negative',
      });
    }
  }

  return insights;
}
