// ============================================================
// PREDICTION ENGINE — Predicciones basadas en histórico
// ------------------------------------------------------------
// Métodos: moving_average, linear_regression, seasonal_naive.
// Puros: dado una serie temporal devuelve una predicción.
// ============================================================

import type { Prediction, TwinId, TwinEntityType } from '@/digital-twin/types';
import type { Shipment, ExpRecord } from '@/lib/types';

export interface TimeSeriesPoint {
  label: string; // YYYY-MM
  value: number;
}

/** Promedio móvil simple. */
export function movingAverage(series: TimeSeriesPoint[], window = 3): number {
  if (series.length === 0) return 0;
  const lastN = series.slice(-window);
  return lastN.reduce((s, p) => s + p.value, 0) / lastN.length;
}

/** Regresión lineal simple (least squares). Devuelve { slope, intercept }. */
export function linearRegression(series: TimeSeriesPoint[]): { slope: number; intercept: number; r2: number } {
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
  // R²
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

/** Predicción estacional naive: el próximo período = mismo mes del año anterior. */
export function seasonalNaive(series: TimeSeriesPoint[], periods = 12): number {
  if (series.length < periods) return movingAverage(series);
  return series[series.length - periods].value;
}

/** Genera una predicción de N períodos futuros usando regresión lineal. */
export function predictLinear(
  series: TimeSeriesPoint[],
  horizon: number,
): { values: { label: string; value: number; lower: number; upper: number }[]; confidence: number } {
  const { slope, intercept, r2 } = linearRegression(series);
  const lastLabel = series[series.length - 1]?.label || '2025-01';
  const [lastYear, lastMonth] = lastLabel.split('-').map(Number);
  const values: { label: string; value: number; lower: number; upper: number }[] = [];
  const stdDev = computeStdDev(series, slope, intercept);
  for (let i = 1; i <= horizon; i++) {
    const futureValue = Math.max(0, slope * (series.length - 1 + i) + intercept);
    let m = lastMonth + i;
    let y = lastYear;
    while (m > 12) { m -= 12; y++; }
    const label = `${y}-${String(m).padStart(2, '0')}`;
    // Banda de confianza aproximada: ±2σ escalada por R²
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

function computeStdDev(series: TimeSeriesPoint[], slope: number, intercept: number): number {
  if (series.length < 2) return 0;
  const residuals = series.map((p, i) => p.value - (slope * i + intercept));
  const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const variance = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / residuals.length;
  return Math.sqrt(variance);
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

  const ingresosSeries = getIngresosTimeSeries(opts.depositos).slice(-24);
  const expSeries = getExportacionesTimeSeries(opts.exportaciones).slice(-24);

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
  const { slope } = linearRegression(ingresosSeries.slice(-12));
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
