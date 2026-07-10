// ============================================================
// COMMERCIAL INTELLIGENCE ENGINE — Inteligencia comercial
// ------------------------------------------------------------
// Motor de inteligencia comercial para clientes estratégicos.
// Enriquece el análisis de captura CALIRAL con:
//   - Health Score multidimensional (0-100)
//   - Diagnóstico automático de causas
//   - Detección de oportunidades económicas
//   - Ranking de competidores con tendencias
//   - Detección de clientes recuperables
//   - Alertas inteligentes priorizadas
//   - Predicción de captura futura
//   - Recomendaciones accionables
//
// PURE FUNCTIONS. Sin side effects. TypeScript estricto. Sin any.
// Reutiliza: Prediction Engine (linearRegression, predictLinear).
// ============================================================

import type { MovRecord } from '@/intelligence/types';
import type { CapturaResult, CapturaBreakdown } from '@/intelligence-engine/capturaCaliral';
import { filterByCliente } from '@/intelligence-engine/capturaCaliral';
import { linearRegression, predictLinear, type TimeSeriesPoint } from '@/prediction/engine';

// ============================================================
// Tipos
// ============================================================

export type HealthLevel = 'excelente' | 'bueno' | 'riesgo' | 'critico';
export type RecoveryProbability = 'alta' | 'media' | 'baja';
export type AlertSeverity = 'critica' | 'alta' | 'media' | 'baja';
export type TrendDirection = 'subiendo' | 'estable' | 'bajando';

export interface HealthFactor {
  code: string;
  label: string;
  value: number;       // 0-100
  weight: number;      // 0-1
  contribution: number; // value * weight
  explanation: string;
}

export interface HealthScore {
  score: number;        // 0-100
  level: HealthLevel;
  factors: HealthFactor[];
  summary: string;
}

export interface TemporalEvolution {
  monthlyCapture: Array<{ label: string; capturePct: number; totalPn: number; caliralPn: number }>;
  vsPreviousPeriod: number | null;   // diferencia en puntos porcentuales
  vsSamePeriodLastYear: number | null;
  trend: TrendDirection;
  trendMonths: number;
  interpretation: string;
}

export interface EconomicOpportunity {
  recoverableTons: number;     // toneladas potencialmente recuperables
  estimatedValueUsd: number;   // valor económico estimado
  pricePerTonUsd: number;      // factor usado (configurable)
  breakdown: Array<{ label: string; tons: number; valueUsd: number }>;
  explanation: string;
}

export interface CompetitorInfo {
  name: string;
  tons: number;
  sharePct: number;
  trend: TrendDirection;
  rank: number;
  isCaliral: boolean;
}

export interface DiagnosisFinding {
  code: string;
  title: string;
  detail: string;
  severity: 'positive' | 'warning' | 'negative' | 'neutral';
  evidence: string;
}

export interface RecoverableClient {
  name: string;
  lastCaliralMonth: string | null;
  monthsSinceLast: number;
  lostTons: number;
  probability: RecoveryProbability;
  reason: string;
}

export interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  impact: string;
  action: string;
}

export interface PredictionResult {
  expectedCapturePct: number;
  optimisticPct: number;
  pessimisticPct: number;
  trend: TrendDirection;
  horizon: number;
  explanation: string;
  confidence: number;
}

export interface RecommendedAction {
  id: string;
  priority: 'critica' | 'alta' | 'media' | 'baja';
  title: string;
  detail: string;
  expectedImpact: string;
  deadline: string;
}

export interface CommercialIntelligenceResult {
  health: HealthScore;
  temporal: TemporalEvolution;
  opportunity: EconomicOpportunity;
  competitors: CompetitorInfo[];
  diagnosis: DiagnosisFinding[];
  recoverable: RecoverableClient[];
  alerts: SmartAlert[];
  prediction: PredictionResult;
  actions: RecommendedAction[];
  executiveSummary: string;
}

// ============================================================
// Configuración
// ============================================================

const COMMERCIAL_CONFIG = {
  /** Precio promedio USD por tonelada de carne bovina (exportable). */
  defaultPricePerTonUsd: 5000,
  /** Umbral de captura para considerar "excelente". */
  excellentCapture: 50,
  /** Umbral de captura para considerar "bueno". */
  goodCapture: 25,
  /** Umbral de captura para considerar "riesgo". */
  riskCapture: 10,
  /** Meses mínimos para calcular tendencia. */
  minMonthsForTrend: 4,
  /** Umbral de cambio en puntos porcentuales para considerar tendencia significativa. */
  significantTrendChange: 3,
  /** Meses sin actividad CALIRAL para considerar cliente "perdido". */
  lostClientMonths: 3,
  /** Volumen mínimo (kg) para considerar un mercado significativo. */
  significantMarketKg: 5000,
} as const;

// ============================================================
// 1. HEALTH SCORE — Score multidimensional 0-100
// ============================================================

/**
 * Calcula un Health Score multidimensional para un cliente estratégico.
 *
 * Factores:
 *   - Captura actual (30%): porcentaje de captura CALIRAL
 *   - Tendencia (20%): dirección de la captura en últimos meses
 *   - Fidelidad histórica (20%): cuántos meses CALIRAL estuvo presente
 *   - Diversificación (10%): en cuántos países/cortes participa CALIRAL
 *   - Pérdida frente a competidores (10%): cuánto se fue a terceros
 *   - Estabilidad mensual (10%): varianza de la captura mensual
 *
 * @param result Resultado de computeCapturaCaliral
 * @param clienteName Nombre del cliente (para explicaciones)
 */
export function computeHealthScore(
  result: CapturaResult,
  clienteName: string,
): HealthScore {
  const factors: HealthFactor[] = [];

  // 1. Captura actual (30%)
  const captureValue = Math.min(100, result.captureIndex * 2); // 50% captura = score 100
  factors.push({
    code: 'capture',
    label: 'Captura actual',
    value: captureValue,
    weight: 0.30,
    contribution: captureValue * 0.30,
    explanation: `CALIRAL captura ${result.captureIndex.toFixed(1)}% de las exportaciones de ${clienteName}. ${
      result.captureIndex >= COMMERCIAL_CONFIG.excellentCapture ? 'Participación fuerte.' :
      result.captureIndex >= COMMERCIAL_CONFIG.goodCapture ? 'Participación moderada.' :
      result.captureIndex >= COMMERCIAL_CONFIG.riskCapture ? 'Participación baja, en zona de riesgo.' :
      'Participación crítica, cliente casi perdido.'
    }`,
  });

  // 2. Tendencia (20%)
  const trendScore = computeTrendScore(result.byMes);
  factors.push({
    code: 'trend',
    label: 'Tendencia reciente',
    value: trendScore.value,
    weight: 0.20,
    contribution: trendScore.value * 0.20,
    explanation: trendScore.explanation,
  });

  // 3. Fidelidad histórica (20%)
  const totalMonths = result.byMes.length;
  const caliralMonths = result.byMes.filter(m => m.caliralPn > 0).length;
  const fidelityPct = totalMonths > 0 ? (caliralMonths / totalMonths) * 100 : 0;
  factors.push({
    code: 'fidelity',
    label: 'Fidelidad histórica',
    value: fidelityPct,
    weight: 0.20,
    contribution: fidelityPct * 0.20,
    explanation: `CALIRAL estuvo presente en ${caliralMonths} de ${totalMonths} meses analizados (${fidelityPct.toFixed(0)}%). ${
      fidelityPct >= 75 ? 'Cliente histórico con relación sólida.' :
      fidelityPct >= 50 ? 'Relación intermitente.' :
      'Relación reciente o inestable.'
    }`,
  });

  // 4. Diversificación (10%)
  const totalPaises = result.byPais.length;
  const paisesConCaliral = result.byPais.filter(p => p.caliralPn > 0).length;
  const diversificationPct = totalPaises > 0 ? (paisesConCaliral / totalPaises) * 100 : 0;
  factors.push({
    code: 'diversification',
    label: 'Diversificación geográfica',
    value: diversificationPct,
    weight: 0.10,
    contribution: diversificationPct * 0.10,
    explanation: `CALIRAL participa en ${paisesConCaliral} de ${totalPaises} destinos (${diversificationPct.toFixed(0)}%). ${
      diversificationPct >= 75 ? 'Presencia global sólida.' :
      diversificationPct >= 50 ? 'Presencia parcial, hay mercados sin cubrir.' :
      'Presencia limitada a pocos destinos.'
    }`,
  });

  // 5. Pérdida frente a competidores (10%)
  const lossPct = result.totalClientePn > 0
    ? (result.otrosPn / result.totalClientePn) * 100
    : 0;
  const lossScore = Math.max(0, 100 - lossPct);
  factors.push({
    code: 'competitor_loss',
    label: 'Pérdida vs competidores',
    value: lossScore,
    weight: 0.10,
    contribution: lossScore * 0.10,
    explanation: `${lossPct.toFixed(1)}% del volumen fue capturado por ${result.competidores.length} competidor(es). ${
      lossPct < 25 ? 'Baja fuga hacia terceros.' :
      lossPct < 50 ? 'Fuga moderada hacia terceros.' :
      'Alta fuga hacia terceros, atención requerida.'
    }`,
  });

  // 6. Estabilidad mensual (10%)
  const stabilityScore = computeStabilityScore(result.byMes);
  factors.push({
    code: 'stability',
    label: 'Estabilidad mensual',
    value: stabilityScore.value,
    weight: 0.10,
    contribution: stabilityScore.value * 0.10,
    explanation: stabilityScore.explanation,
  });

  const score = Math.round(factors.reduce((s, f) => s + f.contribution, 0));
  const level: HealthLevel =
    score >= 70 ? 'excelente' :
    score >= 50 ? 'bueno' :
    score >= 30 ? 'riesgo' :
    'critico';

  const summary = generateHealthSummary(score, level, result, clienteName);

  return { score, level, factors, summary };
}

function computeTrendScore(byMes: CapturaBreakdown[]): { value: number; explanation: string } {
  if (byMes.length < COMMERCIAL_CONFIG.minMonthsForTrend) {
    return { value: 50, explanation: 'Datos insuficientes para calcular tendencia.' };
  }
  const recent = byMes.slice(-3);
  const previous = byMes.slice(-6, -3);
  const recentAvg = recent.length > 0
    ? recent.reduce((s, m) => s + m.captureIndex, 0) / recent.length
    : 0;
  const previousAvg = previous.length > 0
    ? previous.reduce((s, m) => s + m.captureIndex, 0) / previous.length
    : 0;
  const diff = recentAvg - previousAvg;

  // Mapear diff (-20 a +20) a score (0 a 100)
  const value = Math.max(0, Math.min(100, 50 + diff * 2.5));

  const explanation = diff > COMMERCIAL_CONFIG.significantTrendChange
    ? `Captura subiendo ${diff.toFixed(1)} puntos en últimos 3 meses. Tendencia positiva.`
    : diff < -COMMERCIAL_CONFIG.significantTrendChange
    ? `Captura cayendo ${Math.abs(diff).toFixed(1)} puntos en últimos 3 meses. Tendencia negativa.`
    : `Captura estable (cambio de ${diff.toFixed(1)} puntos).`;

  return { value: Math.round(value), explanation };
}

function computeStabilityScore(byMes: CapturaBreakdown[]): { value: number; explanation: string } {
  if (byMes.length < 3) {
    return { value: 50, explanation: 'Datos insuficientes para calcular estabilidad.' };
  }
  const captures = byMes.map(m => m.captureIndex);
  const mean = captures.reduce((s, c) => s + c, 0) / captures.length;
  const variance = captures.reduce((s, c) => s + (c - mean) ** 2, 0) / captures.length;
  const stdDev = Math.sqrt(variance);
  // Menor desviación = mayor estabilidad. Mapear stdDev (0-50) a score (100-0)
  const value = Math.max(0, Math.min(100, 100 - stdDev * 2));
  const explanation = stdDev < 5
    ? `Captura muy estable (σ=${stdDev.toFixed(1)}). Comportamiento predecible.`
    : stdDev < 15
    ? `Captura moderadamente variable (σ=${stdDev.toFixed(1)}).`
    : `Captura muy volátil (σ=${stdDev.toFixed(1)}). Difícil de predecir.`;
  return { value: Math.round(value), explanation };
}

function generateHealthSummary(
  score: number,
  level: HealthLevel,
  result: CapturaResult,
  clienteName: string,
): string {
  const levelLabels: Record<HealthLevel, string> = {
    excelente: 'Excelente',
    bueno: 'Bueno',
    riesgo: 'Riesgo',
    critico: 'Crítico',
  };
  const levelEmojis: Record<HealthLevel, string> = {
    excelente: '🟢',
    bueno: '🔵',
    riesgo: '🟠',
    critico: '🔴',
  };
  const opportunities = result.paisesSinCaliral.length + result.cortesSinCaliral.length;
  return `${levelEmojis[level]} ${levelLabels[level]} (Score: ${score}/100). CALIRAL captura ${result.captureIndex.toFixed(1)}% de las exportaciones de ${clienteName}. ${opportunities} oportunidades de recuperación detectadas.`;
}

// ============================================================
// 2. EVOLUCIÓN TEMPORAL
// ============================================================

export function computeTemporalEvolution(
  result: CapturaResult,
  records: MovRecord[],
  clienteAliases: string[],
): TemporalEvolution {
  const monthlyCapture = result.byMes.map(m => ({
    label: m.label,
    capturePct: m.captureIndex,
    totalPn: m.totalPn,
    caliralPn: m.caliralPn,
  }));

  // vs período anterior: comparar últimos 3 meses vs 3 anteriores
  let vsPreviousPeriod: number | null = null;
  if (monthlyCapture.length >= 6) {
    const last3 = monthlyCapture.slice(-3);
    const prev3 = monthlyCapture.slice(-6, -3);
    const lastAvg = last3.reduce((s, m) => s + m.capturePct, 0) / 3;
    const prevAvg = prev3.reduce((s, m) => s + m.capturePct, 0) / 3;
    vsPreviousPeriod = lastAvg - prevAvg;
  }

  // vs mismo período año anterior
  let vsSamePeriodLastYear: number | null = null;
  if (monthlyCapture.length >= 15) {
    const last3 = monthlyCapture.slice(-3);
    const yearAgo3 = monthlyCapture.slice(-15, -12);
    const lastAvg = last3.reduce((s, m) => s + m.capturePct, 0) / 3;
    const yearAvg = yearAgo3.reduce((s, m) => s + m.capturePct, 0) / 3;
    vsSamePeriodLastYear = lastAvg - yearAvg;
  }

  // Tendencia: regresión lineal sobre captura mensual
  let trend: TrendDirection = 'estable';
  let trendMonths = monthlyCapture.length;
  if (monthlyCapture.length >= COMMERCIAL_CONFIG.minMonthsForTrend) {
    const series: TimeSeriesPoint[] = monthlyCapture.map((m, i) => ({
      label: m.label,
      value: m.capturePct,
    }));
    const reg = linearRegression(series);
    if (reg.slope > 0.5) trend = 'subiendo';
    else if (reg.slope < -0.5) trend = 'bajando';
  }

  const interpretation = generateTemporalInterpretation(
    vsPreviousPeriod, vsSamePeriodLastYear, trend, monthlyCapture.length,
  );

  return {
    monthlyCapture,
    vsPreviousPeriod,
    vsSamePeriodLastYear,
    trend,
    trendMonths,
    interpretation,
  };
}

function generateTemporalInterpretation(
  vsPrev: number | null,
  vsYear: number | null,
  trend: TrendDirection,
  months: number,
): string {
  const parts: string[] = [];
  if (vsPrev !== null) {
    const direction = vsPrev > 0 ? 'subió' : 'cayó';
    parts.push(`La captura ${direction} ${Math.abs(vsPrev).toFixed(1)} puntos vs los 3 meses anteriores.`);
  }
  if (vsYear !== null) {
    const direction = vsYear > 0 ? 'subió' : 'cayó';
    parts.push(`Variación anual: ${direction} ${Math.abs(vsYear).toFixed(1)} puntos.`);
  }
  if (trend === 'subiendo') parts.push('Tendencia ascendente.');
  else if (trend === 'bajando') parts.push('Tendencia descendente.');
  else parts.push('Tendencia estable.');

  if (parts.length === 0) return `Datos insuficientes (${months} meses analizados).`;
  return parts.join(' ');
}

// ============================================================
// 3. OPORTUNIDAD ECONÓMICA
// ============================================================

export function computeEconomicOpportunity(
  result: CapturaResult,
  pricePerTonUsd: number = COMMERCIAL_CONFIG.defaultPricePerTonUsd,
): EconomicOpportunity {
  const breakdown: Array<{ label: string; tons: number; valueUsd: number }> = [];

  // Oportunidad por país sin CALIRAL
  const paisesSinCaliralConVolumen = result.byPais
    .filter(p => p.caliralPn === 0 && p.totalPn >= COMMERCIAL_CONFIG.significantMarketKg)
    .sort((a, b) => b.totalPn - a.totalPn);

  for (const p of paisesSinCaliralConVolumen) {
    const tons = p.totalPn / 1000;
    breakdown.push({
      label: `Mercado: ${p.label}`,
      tons,
      valueUsd: tons * pricePerTonUsd,
    });
  }

  // Oportunidad por país con baja captura (recuperable)
  const paisesBajaCaptura = result.byPais
    .filter(p => p.caliralPn > 0 && p.captureIndex < 30 && p.totalPn >= COMMERCIAL_CONFIG.significantMarketKg)
    .sort((a, b) => (b.totalPn - b.caliralPn) - (a.totalPn - a.caliralPn));

  for (const p of paisesBajaCaptura) {
    const lostTons = (p.totalPn - p.caliralPn) / 1000;
    breakdown.push({
      label: `Recuperar en: ${p.label}`,
      tons: lostTons,
      valueUsd: lostTons * pricePerTonUsd,
    });
  }

  // Oportunidad por corte sin CALIRAL
  const cortesSinCaliralConVolumen = result.byCorte
    .filter(c => c.caliralPn === 0 && c.totalPn >= COMMERCIAL_CONFIG.significantMarketKg)
    .sort((a, b) => b.totalPn - a.totalPn)
    .slice(0, 5);

  for (const c of cortesSinCaliralConVolumen) {
    const tons = c.totalPn / 1000;
    breakdown.push({
      label: `Corte: ${c.label}`,
      tons,
      valueUsd: tons * pricePerTonUsd,
    });
  }

  const recoverableTons = breakdown.reduce((s, b) => s + b.tons, 0);
  const estimatedValueUsd = recoverableTons * pricePerTonUsd;

  const explanation = recoverableTons > 0
    ? `${(recoverableTons / 1000).toFixed(1)} toneladas potencialmente recuperables en ${breakdown.length} oportunidades, estimadas en USD ${estimatedValueUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })} (a USD ${pricePerTonUsd.toLocaleString('es-UY')}/t).`
    : 'No se detectaron oportunidades de recuperación significativas.';

  return {
    recoverableTons,
    estimatedValueUsd,
    pricePerTonUsd,
    breakdown: breakdown.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 10),
    explanation,
  };
}

// ============================================================
// 4. RANKING DE COMPETIDORES
// ============================================================

export function computeCompetitorRanking(
  result: CapturaResult,
): CompetitorInfo[] {
  const totalPn = result.totalClientePn;
  const competitors: CompetitorInfo[] = result.byCertificador.map(c => {
    const isCaliral = c.label.toUpperCase().includes('CALIRAL');
    const sharePct = totalPn > 0 ? (c.totalPn / totalPn) * 100 : 0;

    // Calcular tendencia del competidor (últimos 3 vs anteriores 3 meses)
    const trend = computeCompetitorTrend(result, c.label);

    return {
      name: c.label,
      tons: c.totalPn / 1000,
      sharePct,
      trend,
      rank: 0, // se asigna después
      isCaliral,
    };
  });

  // Ordenar por toneladas y asignar rank
  competitors.sort((a, b) => b.tons - a.tons);
  competitors.forEach((c, i) => { c.rank = i + 1; });

  return competitors;
}

function computeCompetitorTrend(
  result: CapturaResult,
  competidorName: string,
): TrendDirection {
  if (result.byMes.length < 6) return 'estable';
  // Aproximación: si CALIRAL perdió captura en últimos meses,
  // asumimos que el competidor ganó. No tenemos el detalle por competidor
  // por mes en CapturaResult, así que usamos la tendencia global de CALIRAL.
  const last3 = result.byMes.slice(-3);
  const prev3 = result.byMes.slice(-6, -3);
  const lastAvg = last3.reduce((s, m) => s + m.captureIndex, 0) / 3;
  const prevAvg = prev3.reduce((s, m) => s + m.captureIndex, 0) / 3;
  const diff = lastAvg - prevAvg;

  if (competidorName.toUpperCase().includes('CALIRAL')) {
    return diff > COMMERCIAL_CONFIG.significantTrendChange ? 'subiendo'
         : diff < -COMMERCIAL_CONFIG.significantTrendChange ? 'bajando'
         : 'estable';
  }
  // Competidor: tendencia inversa a CALIRAL
  return diff < -COMMERCIAL_CONFIG.significantTrendChange ? 'subiendo'
       : diff > COMMERCIAL_CONFIG.significantTrendChange ? 'bajando'
       : 'estable';
}

// ============================================================
// 5. DIAGNÓSTICO AUTOMÁTICO
// ============================================================

export function generateDiagnosis(
  result: CapturaResult,
  temporal: TemporalEvolution,
  clienteName: string,
): DiagnosisFinding[] {
  const findings: DiagnosisFinding[] = [];

  // 1. ¿El cliente sigue usando depósitos CALIRAL?
  if (result.caliralEdPn > 0 && result.caliralCfPn === 0) {
    findings.push({
      code: 'deposit_without_cert',
      title: 'Cliente usa depósitos CALIRAL pero no certifica con CALIRAL',
      detail: `El cliente deposita ${fmtTons(result.caliralEdPn)} en CALIRAL pero la certificación la maneja otro organismo. La relación logística se mantiene, la pérdida es comercial (de certificación).`,
      severity: 'warning',
      evidence: `Matriz B: ${result.matrizBPn.toLocaleString('es-UY')} kg (${result.matrizBCount} registros) depositados en CALIRAL pero certificados por terceros.`,
    });
  } else if (result.caliralEdPn > 0 && result.caliralCfPn > 0) {
    findings.push({
      code: 'full_caliral_flow',
      title: 'Flujo CALIRAL completo activo',
      detail: `El cliente mantiene depósito Y certificación con CALIRAL para ${fmtTons(result.matrizAPn)} (${result.matrizACount} registros). Relación integral preservada.`,
      severity: 'positive',
      evidence: `Matriz A: ${result.matrizAPn.toLocaleString('es-UY')} kg con flujo 100% CALIRAL.`,
    });
  }

  // 2. ¿La pérdida es hacia un destino específico?
  if (result.paisesSinCaliral.length > 0) {
    const topLostMarket = result.byPais
      .filter(p => result.paisesSinCaliral.includes(p.label))
      .sort((a, b) => b.totalPn - a.totalPn)[0];
    if (topLostMarket) {
      findings.push({
        code: 'loss_by_market',
        title: `Pérdida concentrada en ${topLostMarket.label}`,
        detail: `CALIRAL no participa en ${topLostMarket.label}, mercado que representa ${fmtTons(topLostMarket.totalPn)} para ${clienteName}.`,
        severity: 'negative',
        evidence: `${topLostMarket.totalPn.toLocaleString('es-UY')} kg exportados a ${topLostMarket.label} sin participación de CALIRAL.`,
      });
    }
  }

  // 3. ¿Hay un competidor dominante?
  const externalCompetitors = result.byCertificador
    .filter(c => !c.label.toUpperCase().includes('CALIRAL') && !c.label.toUpperCase().includes('NIREA') && !c.label.toUpperCase().includes('SAN JACINTO'));
  if (externalCompetitors.length > 0 && externalCompetitors[0].totalPn > 0) {
    const top = externalCompetitors[0];
    const sharePct = result.totalClientePn > 0 ? (top.totalPn / result.totalClientePn) * 100 : 0;
    if (sharePct > 20) {
      findings.push({
        code: 'competitor_dominant',
        title: `Competidor dominante: ${top.label}`,
        detail: `${top.label} maneja ${sharePct.toFixed(1)}% del volumen de ${clienteName} (${fmtTons(top.totalPn)}). Concentración significativa en un competidor.`,
        severity: 'negative',
        evidence: `${top.totalPn.toLocaleString('es-UY')} kg certificados por ${top.label} vs ${result.caliralPn.toLocaleString('es-UY')} kg de CALIRAL.`,
      });
    }
  }

  // 4. ¿La caída comenzó en una fecha específica?
  if (temporal.trend === 'bajando' && temporal.monthlyCapture.length >= 4) {
    const monthly = temporal.monthlyCapture;
    // Buscar el punto de inflexión
    for (let i = 1; i < monthly.length; i++) {
      if (monthly[i].capturePct < monthly[i - 1].capturePct - 10) {
        findings.push({
          code: 'drop_start',
          title: `Caída comenzó en ${monthly[i].label}`,
          detail: `La captura de CALIRAL cayó de ${monthly[i - 1].capturePct.toFixed(1)}% a ${monthly[i].capturePct.toFixed(1)}% en ${monthly[i].label}. Punto de inflexión detectado.`,
          severity: 'negative',
          evidence: `Antes: ${monthly[i - 1].capturePct.toFixed(1)}% (${monthly[i - 1].label}). Después: ${monthly[i].capturePct.toFixed(1)}% (${monthly[i].label}).`,
        });
        break;
      }
    }
  }

  // 5. ¿Es un problema comercial u operativo?
  if (result.caliralEdPn > 0 && result.caliralCfPn < result.caliralEdPn * 0.5) {
    findings.push({
      code: 'commercial_problem',
      title: 'Hipótesis: problema comercial, no operativo',
      detail: `El cliente sigue depositando mercadería en CALIRAL (${fmtTons(result.caliralEdPn)}), pero CALIRAL certifica menos del 50% de lo que deposita. La infraestructura logística funciona; la pérdida es de certificación/comercial.`,
      severity: 'warning',
      evidence: `Depósito CALIRAL: ${result.caliralEdPn.toLocaleString('es-UY')} kg. Certificación CALIRAL: ${result.caliralCfPn.toLocaleString('es-UY')} kg. Ratio: ${((result.caliralCfPn / result.caliralEdPn) * 100).toFixed(1)}%.`,
    });
  }

  return findings;
}

// ============================================================
// 6. CLIENTES RECUPERABLES
// ============================================================

export function detectRecoverableClients(
  result: CapturaResult,
  records: MovRecord[],
  clienteAliases: string[],
): RecoverableClient[] {
  // Filtrar los registros del cliente usando la MISMA función que computeCapturaCaliral
  const clienteRecs = filterByCliente(records, clienteAliases);
  if (clienteRecs.length === 0) return [];

  // BUG FIX: Antes solo mirábamos `result.byMes[i].caliralPn` que se basa
  // EXCLUSIVAMENTE en depósito (ed). Pero CALIRAL puede estar certificando
  // (cf) sin recibir depósito. Si San Jacinto exporta y CALIRAL certifica,
  // CALIRAL ESTÁ activo, aunque no reciba depósito.
  //
  // Ahora usamos los records crudos para detectar meses donde CALIRAL
  // participó de CUALQUIER forma (ed O cf).

  const isCaliralEd = (r: MovRecord): boolean => (r.ed || '').toUpperCase().includes('CALIRAL');
  const isCaliralCf = (r: MovRecord): boolean => (r.cf || '').toUpperCase().includes('CALIRAL');

  // Conjunto de meses (YYYY-MM) donde CALIRAL participó (ed O cf)
  const monthsWithCaliralActivity = new Set<string>();
  // Conjunto de TODOS los meses del cliente en el dataset
  const allClienteMonths = new Set<string>();
  // Registros por mes para calcular toneladas perdidas
  const tonsByMonth = new Map<string, number>();
  // Para cada mes, si CALIRAL participó (ed O cf)
  const monthHasCaliral = new Map<string, boolean>();

  for (const r of clienteRecs) {
    const month = (r.f || '').substring(0, 7);
    if (!month) continue;
    allClienteMonths.add(month);
    tonsByMonth.set(month, (tonsByMonth.get(month) || 0) + (r.pn || 0));

    const hasCaliral = isCaliralEd(r) || isCaliralCf(r);
    if (hasCaliral) {
      monthsWithCaliralActivity.add(month);
      monthHasCaliral.set(month, true);
    } else if (!monthHasCaliral.has(month)) {
      monthHasCaliral.set(month, false);
    }
  }

  // Si CALIRAL nunca participó en ningún mes — es prospecto nuevo
  if (monthsWithCaliralActivity.size === 0) {
    return [{
      name: clienteAliases[0] || 'Cliente',
      lastCaliralMonth: null,
      monthsSinceLast: -1,
      lostTons: result.totalClientePn / 1000,
      probability: 'baja',
      reason: 'CALIRAL nunca participó en exportaciones de este cliente (ni como depósito ni como certificador). Es un prospecto nuevo, no un cliente recuperable.',
    }];
  }

  // Último mes con actividad CALIRAL (cualquier tipo)
  const sortedCaliralMonths = Array.from(monthsWithCaliralActivity).sort();
  const lastCaliralMonth = sortedCaliralMonths[sortedCaliralMonths.length - 1];

  // Todos los meses del dataset, ordenados
  const sortedAllMonths = Array.from(allClienteMonths).sort();
  const lastDatasetMonth = sortedAllMonths[sortedAllMonths.length - 1];

  // Meses DESPUÉS del último mes con CALIRAL (meses realmente sin actividad)
  const monthsAfterCaliral = sortedAllMonths.filter(m => m > lastCaliralMonth);
  const lostTons = monthsAfterCaliral.reduce((s, m) => s + (tonsByMonth.get(m) || 0), 0) / 1000;

  // monthsSinceLast: comparar contra el último mes del DATASET, no contra `now`.
  // Si el dataset llega a junio y CALIRAL estuvo activo en junio,
  // monthsSinceLast = 0 (está activo en el último mes del dataset).
  // Solo si hay meses posteriores sin CALIRAL, esos son meses "perdidos".
  const monthsSinceLast = monthsAfterCaliral.length;

  // Si no hay meses posteriores sin CALIRAL, el cliente está ACTIVO
  if (monthsAfterCaliral.length === 0) {
    return [{
      name: clienteAliases[0] || 'Cliente',
      lastCaliralMonth,
      monthsSinceLast: 0,
      lostTons: 0,
      probability: 'alta',
      reason: `CALIRAL sigue activo con este cliente (última actividad: ${lastCaliralMonth}, que es el último mes del dataset ${lastDatasetMonth}). No es un cliente recuperable — la relación está vigente tanto en depósito como en certificación.`,
    }];
  }

  // Hay meses posteriores sin CALIRAL — calcular probabilidad de recuperación
  let probability: RecoveryProbability;
  let reason: string;

  if (monthsSinceLast <= 3) {
    probability = 'alta';
    reason = `CALIRAL estuvo activo hasta ${lastCaliralMonth}. Última actividad hace ${monthsSinceLast} mes(es) dentro del dataset. Reciente, alta probabilidad de reactivar la relación.`;
  } else if (monthsSinceLast <= 6) {
    probability = 'media';
    reason = `CALIRAL estuvo activo hasta ${lastCaliralMonth}. ${monthsSinceLast} meses sin actividad CALIRAL en el dataset. Ventana de recuperación moderada.`;
  } else {
    probability = 'baja';
    reason = `CALIRAL estuvo activo hasta ${lastCaliralMonth}. ${monthsSinceLast} meses sin actividad CALIRAL. Relación fría, requiere reacercamiento comercial.`;
  }

  return [{
    name: clienteAliases[0] || 'Cliente',
    lastCaliralMonth,
    monthsSinceLast,
    lostTons,
    probability,
    reason,
  }];
}

// ============================================================
// 7. ALERTAS INTELIGENTES
// ============================================================

export function generateSmartAlerts(
  result: CapturaResult,
  temporal: TemporalEvolution,
  clienteName: string,
): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  // Alerta: captura crítica
  if (result.captureIndex < COMMERCIAL_CONFIG.riskCapture) {
    alerts.push({
      id: 'alert-critical-capture',
      severity: 'critica',
      title: 'Captura crítica',
      detail: `CALIRAL captura solo ${result.captureIndex.toFixed(1)}% de las exportaciones de ${clienteName}.`,
      impact: `${fmtTons(result.otrosPn)} perdidas hacia competidores.`,
      action: 'Reactivar relación comercial de forma urgente.',
    });
  }

  // Alerta: dejó de certificar
  if (result.caliralCfPn === 0 && result.caliralEdPn > 0) {
    alerts.push({
      id: 'alert-stopped-certifying',
      severity: 'alta',
      title: 'Cliente dejó de certificar con CALIRAL',
      detail: `${clienteName} aún deposita en CALIRAL pero no certifica con CALIRAL.`,
      impact: `${fmtTons(result.caliralEdPn)} en depósito sin certificación CALIRAL.`,
      action: 'Investigar motivo de cambio de certificador y negociar retorno.',
    });
  }

  // Alerta: pérdida supera 40%
  const lossPct = result.totalClientePn > 0 ? (result.otrosPn / result.totalClientePn) * 100 : 0;
  if (lossPct > 40) {
    alerts.push({
      id: 'alert-high-loss',
      severity: 'alta',
      title: `Pérdida supera el 40% (${lossPct.toFixed(1)}%)`,
      detail: `Más del 40% del volumen de ${clienteName} va por competidores.`,
      impact: `${fmtTons(result.otrosPn)} no capturadas por CALIRAL.`,
      action: 'Auditoría completa de relación comercial y revisión de pricing.',
    });
  }

  // Alerta: tendencia bajando
  if (temporal.trend === 'bajando' && temporal.vsPreviousPeriod !== null && temporal.vsPreviousPeriod < -5) {
    alerts.push({
      id: 'alert-declining-trend',
      severity: 'media',
      title: 'Tendencia a la baja',
      detail: `Captura cayó ${Math.abs(temporal.vsPreviousPeriod).toFixed(1)} puntos en últimos 3 meses.`,
      impact: 'Si continúa, la captura podría llegar a niveles críticos.',
      action: 'Reunión con cliente en menos de 30 días.',
    });
  }

  // Alerta: dependencia de un destino
  if (result.byPais.length > 0) {
    const topPais = result.byPais[0];
    const concentrationPct = result.totalClientePn > 0 ? (topPais.totalPn / result.totalClientePn) * 100 : 0;
    if (concentrationPct > 60) {
      alerts.push({
        id: 'alert-destination-dependency',
        severity: 'media',
        title: `Dependencia de ${topPais.label}`,
        detail: `${concentrationPct.toFixed(1)}% del volumen de ${clienteName} va a ${topPais.label}.`,
        impact: 'Riesgo de mercado si el destino cierra o cambia regulaciones.',
        action: 'Diversificar destinos o asegurar contrato a largo plazo.',
      });
    }
  }

  // Alerta: competidor ganando
  const externalCompetitors = result.byCertificador
    .filter(c => !c.label.toUpperCase().includes('CALIRAL') && !c.label.toUpperCase().includes('NIREA') && !c.label.toUpperCase().includes('SAN JACINTO'));
  if (externalCompetitors.length > 0 && externalCompetitors[0].totalPn > result.caliralPn) {
    const top = externalCompetitors[0];
    alerts.push({
      id: 'alert-competitor-winning',
      severity: 'alta',
      title: `${top.label} supera a CALIRAL`,
      detail: `${top.label} certifica más volumen que CALIRAL para ${clienteName}.`,
      impact: `${fmtTons(top.totalPn)} vs ${fmtTons(result.caliralPn)} de CALIRAL.`,
      action: `Investigar propuesta de valor de ${top.label} y contraofrecer.`,
    });
  }

  // Ordenar por severidad
  const severityOrder: Record<AlertSeverity, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// ============================================================
// 8. PREDICCIÓN
// ============================================================

export function computePrediction(
  result: CapturaResult,
): PredictionResult {
  if (result.byMes.length < COMMERCIAL_CONFIG.minMonthsForTrend) {
    return {
      expectedCapturePct: result.captureIndex,
      optimisticPct: result.captureIndex,
      pessimisticPct: result.captureIndex,
      trend: 'estable',
      horizon: 3,
      explanation: 'Datos insuficientes para predecir. Se muestra captura actual.',
      confidence: 0,
    };
  }

  // Construir serie temporal de captura mensual
  const series: TimeSeriesPoint[] = result.byMes.map(m => ({
    label: m.label,
    value: m.captureIndex,
  }));

  // Usar predictLinear del Prediction Engine
  const prediction = predictLinear(series, 3);
  const expected = Math.max(0, Math.min(100, prediction.values[0]?.value ?? result.captureIndex));
  const optimistic = Math.max(0, Math.min(100, prediction.values[0]?.upper ?? expected));
  const pessimistic = Math.max(0, Math.min(100, prediction.values[0]?.lower ?? expected));

  // Tendencia de la pendiente
  const reg = linearRegression(series);
  const trend: TrendDirection = reg.slope > 0.5 ? 'subiendo' : reg.slope < -0.5 ? 'bajando' : 'estable';

  const explanation = generatePredictionExplanation(expected, optimistic, pessimistic, trend, reg.r2);

  return {
    expectedCapturePct: expected,
    optimisticPct: optimistic,
    pessimisticPct: pessimistic,
    trend,
    horizon: 3,
    explanation,
    confidence: Math.max(0, Math.min(1, reg.r2)),
  };
}

function generatePredictionExplanation(
  expected: number,
  optimistic: number,
  pessimistic: number,
  trend: TrendDirection,
  r2: number,
): string {
  const trendText = trend === 'subiendo' ? 'ascendente' : trend === 'bajando' ? 'descendente' : 'estable';
  const confidenceText = r2 > 0.7 ? 'alta confianza' : r2 > 0.4 ? 'confianza media' : 'baja confianza (datos ruidosos)';
  return `Predicción a 3 meses: captura esperada ${expected.toFixed(1)}% (rango ${pessimistic.toFixed(1)}%–${optimistic.toFixed(1)}%). Tendencia ${trendText}. ${confidenceText} (R²=${r2.toFixed(2)}).`;
}

// ============================================================
// 9. ACCIONES RECOMENDADAS
// ============================================================

export function generateRecommendedActions(
  result: CapturaResult,
  temporal: TemporalEvolution,
  alerts: SmartAlert[],
  clienteName: string,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  // Acción basada en captura crítica
  if (result.captureIndex < COMMERCIAL_CONFIG.riskCapture) {
    actions.push({
      id: 'action-urgent-contact',
      priority: 'critica',
      title: `Contactar a ${clienteName} de forma urgente`,
      detail: `Captura en nivel crítico (${result.captureIndex.toFixed(1)}%). Reunión ejecutiva inmediata para entender motivos de fuga.`,
      expectedImpact: `Recuperar participación en ${fmtTons(result.otrosPn)} actualmente perdidas.`,
      deadline: '7 días',
    });
  }

  // Acción basada en mercados sin CALIRAL
  const topLostMarket = result.byPais
    .filter(p => result.paisesSinCaliral.includes(p.label))
    .sort((a, b) => b.totalPn - a.totalPn)[0];
  if (topLostMarket) {
    actions.push({
      id: 'action-lost-market',
      priority: 'alta',
      title: `Investigar operaciones hacia ${topLostMarket.label}`,
      detail: `${topLostMarket.label} representa ${fmtTons(topLostMarket.totalPn)} sin participación de CALIRAL. Revisar requisitos regulatorios y oportunidades comerciales.`,
      expectedImpact: `Potencial captura de ${fmtTons(topLostMarket.totalPn)}.`,
      deadline: '15 días',
    });
  }

  // Acción basada en competidor dominante
  const externalCompetitors = result.byCertificador
    .filter(c => !c.label.toUpperCase().includes('CALIRAL') && !c.label.toUpperCase().includes('NIREA') && !c.label.toUpperCase().includes('SAN JACINTO'));
  if (externalCompetitors.length > 0) {
    const top = externalCompetitors[0];
    actions.push({
      id: 'action-competitor-analysis',
      priority: 'alta',
      title: `Investigar pérdida frente a ${top.label}`,
      detail: `${top.label} maneja ${fmtTons(top.totalPn)} del volumen de ${clienteName}. Auditar propuesta comercial del competidor (precio, servicio, plazos).`,
      expectedImpact: `Recuperar cuota frente al competidor principal.`,
      deadline: '30 días',
    });
  }

  // Acción basada en matriz B (depósito sin certificación)
  if (result.matrizBPn > 0) {
    actions.push({
      id: 'action-negotiate-certification',
      priority: 'alta',
      title: 'Negociar retorno de certificación',
      detail: `El cliente deposita ${fmtTons(result.matrizBPn)} en CALIRAL pero certifica con terceros. Negociar paquete depósito+certificación integrado.`,
      expectedImpact: `Recuperar ${fmtTons(result.matrizBPn)} en certificación.`,
      deadline: '30 días',
    });
  }

  // Acción basada en tendencia bajando
  if (temporal.trend === 'bajando') {
    actions.push({
      id: 'action-stop-decline',
      priority: 'alta',
      title: 'Frenar caída de captura',
      detail: `Tendencia descendente detectada (${temporal.vsPreviousPeriod?.toFixed(1) ?? 'N/A'} puntos vs período anterior). Visita comercial para identificar causa raíz.`,
      expectedImpact: 'Estabilizar y revertir tendencia negativa.',
      deadline: '15 días',
    });
  }

  // Acción basada en alertas críticas
  const criticalAlerts = alerts.filter(a => a.severity === 'critica');
  if (criticalAlerts.length > 0) {
    actions.push({
      id: 'action-alerts-critical',
      priority: 'critica',
      title: 'Atender alertas críticas',
      detail: `${criticalAlerts.length} alerta(s) crítica(s) detectada(s). Requiere intervención inmediata del equipo comercial.`,
      expectedImpact: 'Mitigar riesgo de pérdida total del cliente.',
      deadline: '7 días',
    });
  }

  // Ordenar por prioridad
  const priorityOrder: Record<RecommendedAction['priority'], number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// ============================================================
// ORQUESTADOR PRINCIPAL
// ============================================================

/**
 * Genera el análisis completo de inteligencia comercial para un cliente.
 * Recibe el resultado de computeCapturaCaliral (no lo recalcula).
 * Reutiliza Prediction Engine para forecasting.
 */
export function generateCommercialIntelligence(
  result: CapturaResult,
  records: MovRecord[],
  clienteAliases: string[],
  clienteName: string,
  pricePerTonUsd?: number,
): CommercialIntelligenceResult {
  const health = computeHealthScore(result, clienteName);
  const temporal = computeTemporalEvolution(result, records, clienteAliases);
  const opportunity = computeEconomicOpportunity(result, pricePerTonUsd);
  const competitors = computeCompetitorRanking(result);
  const diagnosis = generateDiagnosis(result, temporal, clienteName);
  const recoverable = detectRecoverableClients(result, records, clienteAliases);
  const alerts = generateSmartAlerts(result, temporal, clienteName);
  const prediction = computePrediction(result);
  const actions = generateRecommendedActions(result, temporal, alerts, clienteName);

  const executiveSummary = generateExecutiveSummary(
    health, result, opportunity, alerts, clienteName,
  );

  return {
    health, temporal, opportunity, competitors, diagnosis,
    recoverable, alerts, prediction, actions, executiveSummary,
  };
}

function generateExecutiveSummary(
  health: HealthScore,
  result: CapturaResult,
  opportunity: EconomicOpportunity,
  alerts: SmartAlert[],
  clienteName: string,
): string {
  const levelLabels: Record<HealthLevel, string> = {
    excelente: 'Excelente',
    bueno: 'Bueno',
    riesgo: 'Riesgo Alto',
    critico: 'Crítico',
  };
  const levelEmojis: Record<HealthLevel, string> = {
    excelente: '🟢',
    bueno: '🔵',
    riesgo: '🟠',
    critico: '🔴',
  };
  const criticalAlerts = alerts.filter(a => a.severity === 'critica' || a.severity === 'alta').length;
  const opportunities = opportunity.breakdown.length;

  return `${levelEmojis[health.level]} ${levelLabels[health.level]}

CALIRAL captó solamente el ${result.captureIndex.toFixed(1)}% de las exportaciones de ${clienteName} durante el período analizado.

Se detectan ${opportunities} oportunidades concretas de recuperación${opportunity.estimatedValueUsd > 0 ? ` (≈ USD ${opportunity.estimatedValueUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })} potenciales)` : ''}.

${criticalAlerts > 0 ? `⚠️ ${criticalAlerts} alerta(s) requieren atención.` : 'Sin alertas críticas.'}`;
}

// ============================================================
// Helpers
// ============================================================

function fmtTons(kg: number): string {
  return `${(kg / 1000).toFixed(1)} t`;
}
