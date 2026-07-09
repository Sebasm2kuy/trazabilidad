// ============================================================
// PREDICTION ENGINE — Benchmarks ANTES vs DESPUÉS
// ------------------------------------------------------------
// Compara el algoritmo viejo (índice 0..n, sin gaps, sin outliers,
// margen stdDev * 2 * max(0.5, 1-R²)) contra el nuevo (tiempo real,
// gap-fill, IQR, IC estadístico con t de Student).
//
// Se re-implementa el algoritmo viejo INLINE para no tener que
// mantener dos versiones del motor en producción.
//
// Ejecutar:  bun run scripts/prediction-benchmarks.ts
// ============================================================

// ----- Algoritmo VIEJO (réplica exacta del código pre-refactor) -----

interface TimeSeriesPoint { label: string; value: number; }

function oldLinearRegression(series: TimeSeriesPoint[]) {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: series[0]?.value || 0, r2: 0 };
  const xs = series.map((_, i) => i);
  const ys = series.map(p => p.value);
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - pred) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function oldComputeStdDev(series: TimeSeriesPoint[], slope: number, intercept: number): number {
  if (series.length < 2) return 0;
  const residuals = series.map((p, i) => p.value - (slope * i + intercept));
  const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const variance = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / residuals.length;
  return Math.sqrt(variance);
}

function oldPredictLinear(series: TimeSeriesPoint[], horizon: number) {
  const { slope, intercept, r2 } = oldLinearRegression(series);
  const lastLabel = series[series.length - 1]?.label || '2025-01';
  const [lastYear, lastMonth] = lastLabel.split('-').map(Number);
  const values: { label: string; value: number; lower: number; upper: number }[] = [];
  const stdDev = oldComputeStdDev(series, slope, intercept);
  for (let i = 1; i <= horizon; i++) {
    const futureValue = Math.max(0, slope * (series.length - 1 + i) + intercept);
    let m = lastMonth + i;
    let y = lastYear;
    while (m > 12) { m -= 12; y++; }
    const label = `${y}-${String(m).padStart(2, '0')}`;
    const margin = stdDev * 2 * Math.max(0.5, 1 - r2);
    values.push({
      label,
      value: futureValue,
      lower: Math.max(0, futureValue - margin),
      upper: futureValue + margin,
    });
  }
  return { values, confidence: Math.max(0, Math.min(1, r2)) };
}

// ----- Algoritmo NUEVO (import del motor refactorizado) -----

import {
  predictLinear as newPredictLinear,
  fillMonthlyGaps,
  detectOutliersIQR,
  linearRegression as newLinearRegression,
} from '../trazabilidad/src/prediction/engine';

// ============================================================
// Escenarios de benchmark
// ============================================================

function seriesFromLabels(labels: string[], valueFn: (i: number) => number): TimeSeriesPoint[] {
  return labels.map((label, i) => ({ label, value: valueFn(i) }));
}

function consecutiveMonths(start: string, count: number): string[] {
  const [y, m] = start.split('-').map(Number);
  const out: string[] = [];
  let cy = y, cm = m;
  for (let i = 0; i < count; i++) {
    out.push(`${cy}-${String(cm).padStart(2, '0')}`);
    cm++;
    if (cm > 12) { cm = 1; cy++; }
  }
  return out;
}

// Generador de series con gaps: toma un set de labels y salta algunos.
function withGaps(labels: string[], skipIndices: number[]): string[] {
  return labels.filter((_, i) => !skipIndices.includes(i));
}

// ============================================================
// Escenarios
// ============================================================

interface Scenario {
  name: string;
  series: TimeSeriesPoint[];
  description: string;
  /** Si la serie sigue una tendencia lineal conocida, esta función devuelve
   *  el valor verdadero para un label futuro. null si no aplica. */
  truth?: (label: string) => number | null;
  /** Tendencia verdadera (kg/mes) para mostrar en consola. */
  trueSlope?: number;
  trueIntercept?: number;
}

/**
 * Genera un truth(label) para una tendencia lineal definida por
 * intercepto y slope, donde t = meses transcurridos desde `refLabel`.
 */
function linearTruth(refLabel: string, intercept: number, slope: number): (label: string) => number | null {
  const refIdx = parseLabelToMonthIdx(refLabel);
  if (refIdx === null) return () => null;
  return (label: string) => {
    const idx = parseLabelToMonthIdx(label);
    if (idx === null) return null;
    return Math.max(0, intercept + slope * (idx - refIdx));
  };
}

function parseLabelToMonthIdx(label: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

const scenarios: Scenario[] = [
  {
    name: '1. Datos limpios · tendencia lineal · sin gaps · sin outliers',
    description: '24 meses consecutivos, valor = 1000 + 50*i. Tendencia real de 50 kg/mes.',
    series: seriesFromLabels(consecutiveMonths('2023-01', 24), i => 1000 + 50 * i),
    trueIntercept: 1000,
    trueSlope: 50,
    truth: linearTruth('2023-01', 1000, 50),
  },
  {
    name: '2. Tendencia con gaps · 3 meses faltantes',
    description: 'Saltamos meses 5, 6, 7 (2023-06, 07, 08). Tendencia real subyacente = 50 kg/mes.',
    // Aquí la clave: los valores se generan con la MISMA fórmula lineal
    // para los labels conservados, así la tendencia verdadera es 50 kg/mes.
    // Antes tenía `i+1` como offset, lo que hacía inconsistente el truth.
    series: (() => {
      const labels = withGaps(consecutiveMonths('2023-01', 24), [5, 6, 7]);
      return labels.map(label => {
        const idx = parseLabelToMonthIdx(label)!;
        const ref = parseLabelToMonthIdx('2023-01')!;
        return { label, value: 1000 + 50 * (idx - ref) };
      });
    })(),
    trueIntercept: 1000,
    trueSlope: 50,
    truth: linearTruth('2023-01', 1000, 50),
  },
  {
    name: '3. Outliers · 2 picos extremos',
    description: 'Tendencia base 50 kg/mes. Mes 10 = 10000 (spike), mes 18 = -3000 (caída).',
    series: seriesFromLabels(consecutiveMonths('2023-01', 24), i => {
      const base = 1000 + 50 * i;
      if (i === 10) return 10000;
      if (i === 18) return Math.max(0, base - 3000);
      return base;
    }),
    trueIntercept: 1000,
    trueSlope: 50,
    truth: linearTruth('2023-01', 1000, 50),
  },
  {
    name: '4. Estacionalidad pura · ciclo 12 meses',
    description: 'Sin tendencia, oscila con seno. La regresión NO debe inferir pendiente fuerte.',
    series: seriesFromLabels(consecutiveMonths('2023-01', 36), i =>
      5000 + 3000 * Math.sin((2 * Math.PI * i) / 12),
    ),
    // Sin verdad lineal: la serie no es lineal.
    truth: (label) => {
      const idx = parseLabelToMonthIdx(label);
      if (idx === null) return null;
      const ref = parseLabelToMonthIdx('2023-01')!;
      return 5000 + 3000 * Math.sin((2 * Math.PI * (idx - ref)) / 12);
    },
  },
  {
    name: '5. Datos reales simulados · ruido gausiano σ=300',
    description: 'Tendencia 80 kg/mes + ruido N(0, 300). 24 meses. Compara el ancho del IC.',
    series: (() => {
      let seed = 42;
      const rng = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      const gauss = () => {
        const u1 = Math.max(rng(), 1e-10);
        const u2 = rng();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      };
      return seriesFromLabels(consecutiveMonths('2023-01', 24), i => Math.max(0, 2000 + 80 * i + gauss() * 300));
    })(),
    trueIntercept: 2000,
    trueSlope: 80,
    truth: linearTruth('2023-01', 2000, 80),
  },
  {
    name: '6. Serie corta · 5 observaciones',
    description: 'Pocos datos. El IC del nuevo algoritmo debe ensancharse (t de Student crece).',
    series: seriesFromLabels(consecutiveMonths('2024-08', 5), i => 3000 + 100 * i),
    trueIntercept: 3000,
    trueSlope: 100,
    truth: linearTruth('2024-08', 3000, 100),
  },
  {
    name: '7. Serie con gaps + outliers combinados',
    description: 'Lo peor: gaps en meses 3,4 y outliers en 8, 15.',
    series: (() => {
      const labels = withGaps(consecutiveMonths('2023-01', 24), [3, 4]);
      return labels.map(label => {
        const idx = parseLabelToMonthIdx(label)!;
        const ref = parseLabelToMonthIdx('2023-01')!;
        const base = 1500 + 60 * (idx - ref);
        // outliers en labels específicos
        if (label === '2023-08') return { label, value: 12000 };
        if (label === '2024-03') return { label, value: 0 };
        return { label, value: base };
      });
    })(),
    trueIntercept: 1500,
    trueSlope: 60,
    truth: linearTruth('2023-01', 1500, 60),
  },
];

// ============================================================
// Helpers de comparación
// ============================================================

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function rmseAgainstTrue(
  preds: { label: string; value: number }[],
  trueFn: (label: string) => number | null,
): number {
  const errors: number[] = [];
  for (const p of preds) {
    const truth = trueFn(p.label);
    if (truth !== null) errors.push((p.value - truth) ** 2);
  }
  return errors.length ? Math.sqrt(mean(errors)) : NaN;
}

function meanICWidth(preds: { lower: number; upper: number }[]): number {
  return mean(preds.map(p => p.upper - p.lower));
}

function coverage(
  preds: { lower: number; upper: number; label: string }[],
  trueFn: (label: string) => number | null,
): number {
  let inIC = 0, total = 0;
  for (const p of preds) {
    const truth = trueFn(p.label);
    if (truth === null) continue;
    total++;
    if (truth >= p.lower && truth <= p.upper) inIC++;
  }
  return total > 0 ? (inIC / total) * 100 : NaN;
}

// ============================================================
// Runner
// ============================================================

const HORIZON = 6;

console.log('═'.repeat(120));
console.log('PREDICTION ENGINE — Benchmarks ANTES vs DESPUÉS');
console.log('═'.repeat(120));
console.log(`Horizonte: ${HORIZON} meses`);
console.log();

const results: {
  scenario: string;
  oldSlope: number;
  newSlope: number;
  oldRMSE: number;
  newRMSE: number;
  oldICWidth: number;
  newICWidth: number;
  oldCoverage: number;
  newCoverage: number;
  gapFillAdded: number;
  outliersDetected: number;
}[] = [];

for (const sc of scenarios) {
  const old = oldPredictLinear(sc.series, HORIZON);
  const neo = newPredictLinear(sc.series, HORIZON);

  const filled = fillMonthlyGaps(sc.series);
  const iqr = detectOutliersIQR(filled);

  // Pendientes
  const oldReg = oldLinearRegression(sc.series);
  const newReg = newLinearRegression(filled);

  // RMSE vs tendencia verdadera (usa el truth del escenario, si lo hay)
  const truthFn = sc.truth ?? (() => null);
  const oldRMSE = rmseAgainstTrue(old.values, truthFn);
  const newRMSE = rmseAgainstTrue(neo.values, truthFn);

  // IC width y coverage
  const oldICW = meanICWidth(old.values);
  const newICW = meanICWidth(neo.values);
  const oldCov = coverage(old.values, truthFn);
  const newCov = coverage(neo.values, truthFn);

  results.push({
    scenario: sc.name,
    oldSlope: oldReg.slope,
    newSlope: newReg.slope,
    oldRMSE: isNaN(oldRMSE) ? -1 : oldRMSE,
    newRMSE: isNaN(newRMSE) ? -1 : newRMSE,
    oldICWidth: oldICW,
    newICWidth: newICW,
    oldCoverage: isNaN(oldCov) ? -1 : oldCov,
    newCoverage: isNaN(newCov) ? -1 : newCov,
    gapFillAdded: filled.length - sc.series.length,
    outliersDetected: iqr.outlierIndices.length,
  });

  console.log('─'.repeat(120));
  console.log(sc.name);
  console.log('  ' + sc.description);
  console.log('  Observaciones: ' + sc.series.length + ' → después de gap-fill: ' + filled.length +
              ' (+ ' + (filled.length - sc.series.length) + ' interp.)' +
              ' | outliers detectados: ' + iqr.outlierIndices.length);
  const trueSlopeStr = sc.trueSlope !== undefined ? ` (verdadera: ${sc.trueSlope})` : '';
  console.log();
  console.log('  PENDIENTE estimada (kg/mes):');
  console.log('    Viejo (índice 0..n):  ' + oldReg.slope.toFixed(2) + trueSlopeStr);
  console.log('    Nuevo (mes continuo): ' + newReg.slope.toFixed(2) + '  · R²: ' + newReg.r2.toFixed(3) + trueSlopeStr);
  console.log();
  console.log('  RMSE vs tendencia verdadera:');
  console.log('    Viejo: ' + (isNaN(oldRMSE) ? 'n/a (sin verdad lineal)' : oldRMSE.toFixed(1)));
  console.log('    Nuevo: ' + (isNaN(newRMSE) ? 'n/a (sin verdad lineal)' : newRMSE.toFixed(1)));
  console.log();
  console.log('  INTERVALO DE CONFIANZA (ancho promedio en kg):');
  console.log('    Viejo (±2σ · max(0.5, 1-R²)): ' + oldICW.toFixed(1));
  console.log('    Nuevo (t · se_pred):          ' + newICW.toFixed(1));
  console.log();
  console.log('  COBERTURA del IC 95% (% de puntos verdaderos futuros que caen dentro del IC):');
  console.log('    Viejo: ' + (isNaN(oldCov) ? 'n/a' : oldCov.toFixed(1) + ' %'));
  console.log('    Nuevo: ' + (isNaN(newCov) ? 'n/a' : newCov.toFixed(1) + ' %'));
  console.log('    (Cobertura nominal esperada para IC 95%: 95%)');
  console.log();
}

console.log('═'.repeat(120));
console.log('RESUMEN TABULAR');
console.log('═'.repeat(120));
console.log(
  'Escenario'.padEnd(60) +
  'oldSlope'.padStart(10) +
  'newSlope'.padStart(10) +
  'oldICW'.padStart(10) +
  'newICW'.padStart(10) +
  'oldCov%'.padStart(9) +
  'newCov%'.padStart(9),
);
console.log('─'.repeat(120));
for (const r of results) {
  console.log(
    r.scenario.slice(0, 60).padEnd(60) +
    r.oldSlope.toFixed(1).padStart(10) +
    r.newSlope.toFixed(1).padStart(10) +
    r.oldICWidth.toFixed(0).padStart(10) +
    r.newICWidth.toFixed(0).padStart(10) +
    (r.oldCoverage < 0 ? 'n/a' : r.oldCoverage.toFixed(0)).padStart(9) +
    (r.newCoverage < 0 ? 'n/a' : r.newCoverage.toFixed(0)).padStart(9),
  );
}
console.log('═'.repeat(120));
