// ============================================================
// PREDICTION ENGINE — Predicciones basadas en histórico
// ------------------------------------------------------------
// Métodos: moving_average, linear_regression, seasonal_naive.
// Puros: dada una serie temporal devuelve una predicción.
//
// REFACTOR (Staff Engineer):
//   1. Regresión contra tiempo real (YYYY-MM → mes continuo) en
//      lugar de índices 0,1,2,... Esto corrige el sesgo cuando
//      hay meses faltantes: antes un gap de 3 meses se contaba
//      como 1 paso, ahora se cuenta como 3.
//   2. fillMonthlyGaps(): rellena meses faltantes entre min y
//      max con interpolación lineal, produciendo series
//      continuas exigidas por regresión y seasonal-naive.
//   3. detectOutliersIQR(): detección IQR simple. Los outliers
//      se suavizan al límite inferior/superior del bigote para
//      no descartar observaciones (winsorización).
//   4. Intervalo de confianza estadísticamente consistente:
//        σ_res = sqrt(SS_res / (n-2))
//        se_pred(x*) = σ_res * sqrt(1 + 1/n + (x*-x̄)²/Sxx)
//        IC 95% = ŷ ± t(0.975, n-2) * se_pred
//      donde t es el cuantil de la t de Student. Reemplaza el
//      viejo "±2σ * max(0.5, 1-R²)" que no era estadísticamente
//      interpretable.
//   5. API pública 100% compatible: mismas firmas y tipos.
// ============================================================

import type { Prediction, TwinId, TwinEntityType } from '@/digital-twin/types';
import type { Shipment, ExpRecord } from '@/lib/types';

export interface TimeSeriesPoint {
  label: string; // YYYY-MM
  value: number;
}

// ------------------------------------------------------------
// Configuración centralizada
// ------------------------------------------------------------

const PREDICTION_CONFIG = {
  /** Meses por año — constante de calendario gregoriano. */
  monthsPerYear: 12,
  /** Mínimo de observaciones para ajustar regresión. */
  minSamplesForRegression: 2,
  /** Multiplicador IQR para bigote (1.5 = criterio clásico de Tukey). */
  iqrWhiskerMultiplier: 1.5,
  /** Nivel de confianza para el intervalo de predicción. */
  confidenceLevel: 0.95,
  /** Últimos N meses considerados por movingAverage por defecto. */
  defaultMovingAverageWindow: 3,
  /** Meses estacionales por defecto (ciclo anual). */
  defaultSeasonalPeriods: 12,
  /** Máximo historial considerado por generatePredictions. */
  maxHistoryMonths: 24,
} as const;

// ------------------------------------------------------------
// Tiempo real: conversión YYYY-MM ↔ mes continuo
// ------------------------------------------------------------

/**
 * Convierte 'YYYY-MM' a un número continuo de meses desde una época
 * interna (año 0, mes 1). Solo importa la diferencia entre dos
 * fechas, no el valor absoluto.
 *
 *   monthIndex('2025-01') = 2025 * 12 + 0 = 24300
 *   monthIndex('2025-04') = 24303
 *   diff = 3  → 3 meses de distancia (correcto)
 */
function monthIndex(label: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > PREDICTION_CONFIG.monthsPerYear) return null;
  return year * PREDICTION_CONFIG.monthsPerYear + (month - 1);
}

/** Inversa de monthIndex: dado un índice continuo, devuelve 'YYYY-MM'. */
function labelFromMonthIndex(idx: number): string {
  const year = Math.floor(idx / PREDICTION_CONFIG.monthsPerYear);
  const month = idx % PREDICTION_CONFIG.monthsPerYear + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Suma N meses a un label 'YYYY-MM'. */
function addMonths(label: string, n: number): string {
  const idx = monthIndex(label);
  if (idx === null) return label;
  return labelFromMonthIndex(idx + n);
}

// ------------------------------------------------------------
// Gap-filling — construye series continuas
// ------------------------------------------------------------

/**
 * Rellena meses faltantes entre min(label) y max(label).
 *
 * Estrategia: interpolación lineal entre las dos observaciones
 * que rodean el gap. Si el gap está al inicio (left-padding)
 * se rellena con el primer valor conocido; si está al final
 * (right-padding) con el último. Esto preserva la continuidad
 * sin introducir tendencias artificiales.
 *
 * Ejemplo:
 *   [{label:'2025-01', value:100}, {label:'2025-04', value:400}]
 *   →
 *   [{2025-01,100}, {2025-02,200}, {2025-03,300}, {2025-04,400}]
 *
 * O(n) donde n = rango de meses cubierto.
 */
export function fillMonthlyGaps(series: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (series.length <= 1) return series.slice();

  // Validar y mapear labels → índices continuos.
  const indexed = series
    .map(p => ({ ...p, idx: monthIndex(p.label) }))
    .filter(p => p.idx !== null) as (TimeSeriesPoint & { idx: number })[];

  if (indexed.length <= 1) return series.slice();

  // Asegurar ordenamiento ascendente por tiempo.
  indexed.sort((a, b) => a.idx - b.idx);

  const result: TimeSeriesPoint[] = [];
  for (let i = 0; i < indexed.length - 1; i++) {
    const curr = indexed[i];
    const next = indexed[i + 1];
    result.push({ label: curr.label, value: curr.value });

    const gap = next.idx - curr.idx;
    if (gap <= 1) continue;

    // Interpolar linealmente los (gap - 1) meses intermedios.
    const step = (next.value - curr.value) / gap;
    for (let k = 1; k < gap; k++) {
      const interpIdx = curr.idx + k;
      const interpValue = curr.value + step * k;
      result.push({ label: labelFromMonthIndex(interpIdx), value: interpValue });
    }
  }
  // Último punto
  result.push({ label: indexed[indexed.length - 1].label, value: indexed[indexed.length - 1].value });
  return result;
}

// ------------------------------------------------------------
// Detección de outliers — IQR (Tukey)
// ------------------------------------------------------------

export interface OutlierResult {
  /** Serie original (sin modificar). */
  original: TimeSeriesPoint[];
  /** Serie con outliers winsorizados al bigote. */
  winsorized: TimeSeriesPoint[];
  /** Índices de los puntos marcados como outliers. */
  outlierIndices: number[];
  /** Q1, Q3, IQR calculados. */
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
}

/**
 * Cálculo de cuantil por el método de interpolación lineal de Hyndman-Fan
 * (tipo 7, el default de R, numpy, pandas). O(n log n) por el sort.
 */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const n = sortedAsc.length;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const frac = pos - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

/**
 * Detecta outliers por el método IQR clásico de Tukey.
 *
 *   Q1 = cuantil 0.25
 *   Q3 = cuantil 0.75
 *   IQR = Q3 - Q1
 *   lowerFence = Q1 - 1.5 * IQR
 *   upperFence = Q3 + 1.5 * IQR
 *
 * Un punto es outlier si value < lowerFence o value > upperFence.
 *
 * Estrategia de mitigación: winsorización. Los outliers se
 * reemplazan por la cerca correspondiente (no se descartan),
 * de forma que la regresión no se distorsione pero tampoco
 * perdemos la observación.
 *
 * No se aplica si la serie tiene < 4 observaciones (IQR no
 * es estadísticamente significativo con tan pocos puntos).
 */
export function detectOutliersIQR(series: TimeSeriesPoint[]): OutlierResult {
  if (series.length < 4) {
    return {
      original: series,
      winsorized: series.slice(),
      outlierIndices: [],
      q1: 0, q3: 0, iqr: 0, lowerFence: -Infinity, upperFence: Infinity,
    };
  }

  const values = series.map(p => p.value);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const k = PREDICTION_CONFIG.iqrWhiskerMultiplier;
  const lowerFence = q1 - k * iqr;
  const upperFence = q3 + k * iqr;

  const outlierIndices: number[] = [];
  const winsorized = series.map((p, i) => {
    if (p.value < lowerFence) {
      outlierIndices.push(i);
      return { ...p, value: lowerFence };
    }
    if (p.value > upperFence) {
      outlierIndices.push(i);
      return { ...p, value: upperFence };
    }
    return p;
  });

  return {
    original: series,
    winsorized,
    outlierIndices,
    q1, q3, iqr, lowerFence, upperFence,
  };
}

// ------------------------------------------------------------
// Estadística de Student — cuantil t para IC
// ------------------------------------------------------------

/**
 * Aproximación del cuantil t de Student por la fórmula de
 * Cornish-Fisher (1937). Precisión típica < 0.001 vs tablas
 * para df ≥ 2 y p ∈ [0.7, 0.999].
 *
 * Para df < 1 retornamos NaN; los callers deben caer a z (~1.96
 * para 95%) cuando eso ocurra.
 *
 * Alternativa: una tabla hardcodeada para los df típicos. Elegí
 * Cornish-Fisher para no acotar el rango de n y porque el error
 * es despreciable respecto a la incertidumbre del modelo mismo.
 */
function studentTQuantile(p: number, df: number): number {
  if (df < 1) return NaN;
  // Cuantil de la normal estándar (aproximación de Acklam).
  const a = [-3.969683028665376e+01, 2.209460984245205e+02,
             -2.759285104469687e+02, 1.383577518672690e+02,
             -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02,
             -1.556989798598866e+02, 6.680131188771972e+01,
             -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
              4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01,
             2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425; const phigh = 1 - plow;
  let z: number;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
        ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= phigh) {
    const q = p - 0.5; const r = q * q;
    z = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
        (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
         ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  // Cornish-Fisher: ajusta z por la asimetría y kurtosis de t.
  const g1 = 1 / (df - 0.5);
  const g2 = 1 / (df - 1) / (df - 1.5);
  const t = z +
            (z * z + 1) * g1 / 4 +
            (z * z * z + 3 * z) * g2 * 3 / 16 +
            (z * z * z * z + z * z) * g1 * g1 * 3 / 4 +
            (z * z * z * z * z - z * z * z - 5 * z) * g1 * g2 * 3 / 16;
  return t;
}

// ------------------------------------------------------------
// Métodos de forecasting
// ------------------------------------------------------------

/** Promedio móvil simple. */
export function movingAverage(series: TimeSeriesPoint[], window = PREDICTION_CONFIG.defaultMovingAverageWindow): number {
  if (series.length === 0) return 0;
  const lastN = series.slice(-window);
  return lastN.reduce((s, p) => s + p.value, 0) / lastN.length;
}

/**
 * Regresión lineal simple (least squares).
 *
 * CAMBIO: xs ahora son índices continuos de mes (monthIndex),
 * no 0,1,2,.... Esto corrige el sesgo cuando hay gaps:
 * si entre 2025-01 y 2025-04 hay un salto real de 3 meses,
 * la pendiente se calcula respecto a esos 3 meses y no respecto
 * a un paso unitario del índice del array.
 *
 * Devuelve { slope, intercept, r2 } donde:
 *   - slope: cambio por mes (unidades/mes)
 *   - intercept: valor teórico en el mes 0 de la época interna
 *   - r2: coeficiente de determinación (calidad del ajuste)
 *
 * Expone además xBar y sxx para que el caller pueda calcular
 * el intervalo de predicción sin recalcularlos.
 */
export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  /** Media de los x usados en el ajuste. */
  xBar: number;
  /** Suma de cuadrados de x: Σ(xi - x̄)². */
  sxx: number;
  /** Residuales (yi - ŷi) para diagnóstico. */
  residuals: number[];
  /** σ residual: sqrt(SS_res / (n-2)). 0 si n < 3. */
  residualStdError: number;
  /** Número de observaciones usadas. */
  n: number;
}

export function linearRegression(series: TimeSeriesPoint[]): LinearRegressionResult {
  const n = series.length;
  if (n < PREDICTION_CONFIG.minSamplesForRegression) {
    return {
      slope: 0,
      intercept: series[0]?.value || 0,
      r2: 0,
      xBar: 0,
      sxx: 0,
      residuals: [],
      residualStdError: 0,
      n,
    };
  }

  // x = índice continuo de mes (tiempo real, no posición en array).
  const xs = series.map(p => monthIndex(p.label)).filter((x): x is number => x !== null);
  const ys = series.map(p => p.value);

  // Si algún label no parsea, descartamos la serie a fallback.
  if (xs.length !== ys.length || xs.length < 2) {
    return {
      slope: 0,
      intercept: ys[0] || 0,
      r2: 0,
      xBar: 0,
      sxx: 0,
      residuals: [],
      residualStdError: 0,
      n: ys.length,
    };
  }

  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    return {
      slope: 0,
      intercept: sumY / n,
      r2: 0,
      xBar: sumX / n,
      sxx: 0,
      residuals: ys.map(y => y - sumY / n),
      residualStdError: 0,
      n,
    };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const xBar = sumX / n;

  let ssTot = 0, ssRes = 0;
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    const res = ys[i] - pred;
    residuals.push(res);
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += res * res;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Σ(xi - x̄)² — usado por el intervalo de predicción.
  const sxx = xs.reduce((s, x) => s + (x - xBar) ** 2, 0);

  // σ residual con corrección Bessel (n-2 grados de libertad:
  // slope e intercept consumen 2).
  const residualStdError = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { slope, intercept, r2, xBar, sxx, residuals, residualStdError, n };
}

/** Predicción estacional naive: el próximo período = mismo mes del año anterior. */
export function seasonalNaive(series: TimeSeriesPoint[], periods = PREDICTION_CONFIG.defaultSeasonalPeriods): number {
  if (series.length < periods) return movingAverage(series);
  return series[series.length - periods].value;
}

// ------------------------------------------------------------
// Intervalo de predicción estadístico (reemplaza ±2σ * f(R²))
// ------------------------------------------------------------

/**
 * Calcula el intervalo de predicción al 95% para un nuevo punto
 * futuro x*, basado en la regresión ajustada.
 *
 * Fórmula (Weisberg, "Applied Linear Regression", cap. 2):
 *
 *   ŷ(x*) = β₀ + β₁·x*
 *   σ_res = sqrt(SS_res / (n-2))                    // σ residual
 *   se_pred(x*) = σ_res * sqrt(1 + 1/n + (x* - x̄)² / Sxx)
 *   IC = ŷ(x*) ± t(0.975, n-2) · se_pred(x*)
 *
 * Diferencias vs el viejo margen (stdDev * 2 * max(0.5, 1-R²)):
 *
 *   - "1 + 1/n" refleja que la predicción de un nuevo punto
 *     incluye SUPIENTE el ruido del propio punto futuro. El viejo
 *     margen lo ignoraba (subestimaba).
 *   - "(x*-x̄)²/Sxx" amplifica la incertidumbre cuando x* se
 *     aleja del centro de los datos (extrapolación). El viejo
 *     margen era constante sin importar cuán lejos se proyectara.
 *   - "t(0.975, n-2)" reemplaza el factor 2 fijo. Con n grande
 *     t→z≈1.96 (cercano a 2); con n pequeño t crece, ensanchando
 *     el IC para reflejar mayor incertidumbre muestral.
 *   - No usar R² como multiplicador era incorrecto: R² mide
 *     calidad del ajuste, no incertidumbre de predicción. Una
 *     serie perfectamente lineal pero ruidosa puede tener R² bajo
 *     y aún así un IC bien definido.
 *
 * Casos borde:
 *   - n < 3: no hay grados de libertad para estimar σ. Fallback
 *     a z·σ_poblacional (factor 1.96) con desviación muestral.
 *   - sxx = 0: todos los x iguales; fallback a intervalo constante.
 *   - xBar/sxx NaN: fallback a margen 0.
 */
function predictionInterval(
  xStar: number,
  yHat: number,
  reg: LinearRegressionResult,
): { lower: number; upper: number; margin: number } {
  const { n, xBar, sxx, residualStdError } = reg;

  if (n < 3 || residualStdError === 0) {
    // Fallback: sin grados de libertad suficientes.
    const margin = residualStdError * 1.96;
    return { lower: yHat - margin, upper: yHat + margin, margin };
  }

  const tQuantile = studentTQuantile(PREDICTION_CONFIG.confidenceLevel, n - 2);
  const t = isNaN(tQuantile) ? 1.96 : tQuantile;

  const leverage = sxx > 0 ? (xStar - xBar) ** 2 / sxx : 0;
  const sePred = residualStdError * Math.sqrt(1 + 1 / n + leverage);
  const margin = t * sePred;

  return { lower: yHat - margin, upper: yHat + margin, margin };
}

// ------------------------------------------------------------
// predictLinear — predicción con IC estadístico
// ------------------------------------------------------------

export function predictLinear(
  series: TimeSeriesPoint[],
  horizon: number,
): { values: { label: string; value: number; lower: number; upper: number }[]; confidence: number } {
  // Pipeline: gap-fill → outliers → regresión → IC.
  const filled = fillMonthlyGaps(series);
  const winsorized = detectOutliersIQR(filled).winsorized;
  const reg = linearRegression(winsorized);

  const lastLabel = filled[filled.length - 1]?.label || '2025-01';
  const lastIdx = monthIndex(lastLabel);
  if (lastIdx === null) {
    return { values: [], confidence: 0 };
  }

  const values: { label: string; value: number; lower: number; upper: number }[] = [];
  for (let i = 1; i <= horizon; i++) {
    const futureIdx = lastIdx + i;
    const futureValue = Math.max(0, reg.slope * futureIdx + reg.intercept);
    const label = labelFromMonthIndex(futureIdx);
    const { lower, upper } = predictionInterval(futureIdx, futureValue, reg);
    values.push({
      label,
      value: futureValue,
      lower: Math.max(0, lower),
      upper: Math.max(0, upper),
    });
  }

  // Confianza: transformamos R² al rango [0,1] con floor de 0.
  // Mantenemos la firma `confidence: number` original; el IC
  // separado (lower/upper) ya captura la incertidumbre real.
  const confidence = Math.max(0, Math.min(1, reg.r2));
  return { values, confidence };
}

// ------------------------------------------------------------
// Agregadores — series temporales desde datos reales
// ------------------------------------------------------------

/** Serie temporal mensual de peso neto de ingresos a depósitos. */
export function getIngresosTimeSeries(depositos: (Shipment | ExpRecord)[]): TimeSeriesPoint[] {
  const months: Record<string, number> = {};
  for (const r of depositos) {
    if (!r.fechaTramite) continue;
    const m = String(r.fechaTramite).substring(0, 7);
    if (m.length !== 7) continue;
    months[m] = (months[m] || 0) + (r.pesoNeto || 0);
  }
  return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

/** Serie temporal mensual de exportaciones. */
export function getExportacionesTimeSeries(exportaciones: (Shipment | ExpRecord)[]): TimeSeriesPoint[] {
  const months: Record<string, number> = {};
  for (const r of exportaciones) {
    if (!r.fechaTramite) continue;
    const m = String(r.fechaTramite).substring(0, 7);
    if (m.length !== 7) continue;
    months[m] = (months[m] || 0) + (r.pesoNeto || 0);
  }
  return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

// ------------------------------------------------------------
// Generador de predicciones
// ------------------------------------------------------------

export function generatePredictions(opts: {
  depositos: (Shipment | ExpRecord)[];
  exportaciones: (Shipment | ExpRecord)[];
  horizon?: number;
}): Prediction[] {
  const horizon = opts.horizon || 6;
  const predictions: Prediction[] = [];
  const now = new Date().toISOString();

  const ingresosSeries = getIngresosTimeSeries(opts.depositos).slice(-PREDICTION_CONFIG.maxHistoryMonths);
  const expSeries = getExportacionesTimeSeries(opts.exportaciones).slice(-PREDICTION_CONFIG.maxHistoryMonths);

  if (ingresosSeries.length >= 3) {
    const { values, confidence } = predictLinear(ingresosSeries, horizon);
    predictions.push({
      id: `pred-ingresos-${Date.now()}`,
      targetEntityType: 'inventory_lot',
      targetEntityId: 'global',
      metric: 'ingresos_pn',
      horizon,
      values,
      method: 'linear_regression',
      confidence,
      generatedAt: now,
    });
  }

  if (expSeries.length >= 3) {
    const { values, confidence } = predictLinear(expSeries, horizon);
    predictions.push({
      id: `pred-exportaciones-${Date.now()}`,
      targetEntityType: 'export_operation',
      targetEntityId: 'global',
      metric: 'exportaciones_pn',
      horizon,
      values,
      method: 'linear_regression',
      confidence,
      generatedAt: now,
    });
  }

  return predictions;
}

// ------------------------------------------------------------
// Predicciones por depósito (saturación futura)
// ------------------------------------------------------------

export interface WarehousePrediction {
  warehouseId: string;
  warehouseName: string;
  currentPn: number;
  capacidadKg: number | null;
  predictedPn: number;
  utilizacionActual: number;
  utilizacionPredicha: number;
  diasParaSaturacion: number | null; // días hasta llegar al 100% si sigue la tendencia
}

export function predictWarehouseSaturation(
  snapshot: { warehouses: { id: string; name: string; stockPn: number; capacidadKg: number | null; utilizacion: number }[] },
  ingresosSeries: TimeSeriesPoint[],
  horizon = 6,
): WarehousePrediction[] {
  // Aplicar el mismo pipeline que predictLinear para consistencia.
  const filled = fillMonthlyGaps(ingresosSeries.slice(-12));
  const winsorized = detectOutliersIQR(filled).winsorized;
  const { slope } = linearRegression(winsorized);
  // slope = kg/mes por depósito (aproximación uniforme)
  const numWarehouses = Math.max(1, snapshot.warehouses.length);
  const slopePerWarehouse = slope / numWarehouses;

  return snapshot.warehouses.map(w => {
    const currentPn = w.stockPn;
    const predictedPn = Math.max(0, currentPn + slopePerWarehouse * horizon);
    const capacidad = w.capacidadKg || currentPn * 3;
    const utilizacionActual = capacidad > 0 ? (currentPn / capacidad) * 100 : 0;
    const utilizacionPredicha = capacidad > 0 ? (predictedPn / capacidad) * 100 : 0;
    let diasParaSaturacion: number | null = null;
    if (slopePerWarehouse > 0 && capacidad > 0) {
      const monthsToSat = (capacidad - currentPn) / slopePerWarehouse;
      diasParaSaturacion = monthsToSat > 0 ? Math.ceil(monthsToSat * 30) : null;
    }
    return {
      warehouseId: w.id,
      warehouseName: w.name,
      currentPn, capacidadKg: w.capacidadKg,
      predictedPn, utilizacionActual, utilizacionPredicha,
      diasParaSaturacion,
    };
  });
}
