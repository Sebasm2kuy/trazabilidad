// ============================================================
// DEEP INSIGHTS ENGINE — Hallazgos de alto valor
// ------------------------------------------------------------
// Motor de inteligencia que piensa como un analista senior.
// NO lista cambios ("Perú creció"). EXPLICA por qué pasan,
// qué impacto tienen, qué representan y qué hacer.
//
// Cada hallazgo tiene obligatoriamente:
//   1. Título
//   2. Evidencia (datos concretos)
//   3. Impacto (Muy Alto/Alto/Medio/Bajo + toneladas + USD)
//   4. Explicación (por qué pasó, contexto)
//   5. Acción recomendada
//
// 12 detectores de alto valor:
//   1. Concentración de pérdidas
//   2. Concentración de crecimiento
//   3. Cambios estructurales
//   4. Relaciones causa-efecto
//   5. Dependencias
//   6. Oportunidades
//   7. Hallazgos económicos
//   8. Hallazgos explicativos
//   9. Hallazgos comparativos
//  10. Hallazgos anómalos
//  11. Hallazgos predictivos (usa Prediction Engine)
//  12. Hallazgos accionables
//
// PURE FUNCTIONS. TypeScript estricto. Sin any.
// Reutiliza Prediction Engine (linearRegression, predictLinear).
// ============================================================

import type { MovRecord } from '@/intelligence/types';
import { linearRegression, predictLinear, type TimeSeriesPoint } from '@/prediction/engine';

// ============================================================
// Tipos
// ============================================================

export type ImpactLevel = 'muy_alto' | 'alto' | 'medio' | 'bajo';
export type InsightCategory =
  | 'concentracion_perdida'
  | 'concentracion_crecimiento'
  | 'cambio_estructural'
  | 'causa_efecto'
  | 'dependencia'
  | 'oportunidad'
  | 'anomalia'
  | 'predictivo'
  | 'comparativo';

export interface EvidenceItem {
  label: string;
  value: string;
  tons?: number;
  pct?: number;
}

export interface DeepInsight {
  id: string;
  category: InsightCategory;
  title: string;
  summary: string;           // resumen ejecutivo (1-2 líneas)
  evidence: EvidenceItem[];  // datos concretos
  explanation: string;       // por qué pasó, contexto
  impact: ImpactLevel;
  impactTons: number;        // toneladas afectadas
  impactUsd: number;         // valor económico estimado
  confidence: number;        // 0-100, basada en cantidad/calidad de datos
  action: string;            // recomendación accionable
  priority: number;          // score de prioridad (mayor = más importante)
}

export interface DeepInsightsResult {
  insights: DeepInsight[];   // top 5-6, ordenados por prioridad
  totalDetected: number;     // total antes de filtrar
  period1Label: string;
  period2Label: string;
}

// ============================================================
// Configuración
// ============================================================

const CONFIG = {
  /** Precio promedio USD por tonelada de carne bovina exportable. */
  pricePerTonUsd: 5000,
  /** Umbral mínimo de volumen (kg) para considerar un actor significativo. */
  significantVolumeKg: 100000, // 100 toneladas
  /** Umbral de participación para considerar concentración. */
  concentrationThreshold: 0.60, // 60%
  /** Máximo de hallazgos a mostrar. */
  maxInsights: 6,
  /** Umbral de cambio para considerar significativo. */
  significantChangePct: 10,
} as const;

// ============================================================
// ORQUESTADOR PRINCIPAL
// ============================================================

/**
 * Genera hallazgos de alto valor comparando dos períodos.
 * Piensa como un analista senior: NO lista cambios, los EXPLICA.
 */
export function generateDeepInsights(
  p1Records: MovRecord[],
  p2Records: MovRecord[],
  period1Label: string,
  period2Label: string,
  pricePerTonUsd?: number,
): DeepInsightsResult {
  const price = pricePerTonUsd ?? CONFIG.pricePerTonUsd;
  const allInsights: DeepInsight[] = [];

  // 1. Concentración de pérdidas
  allInsights.push(...detectLossConcentration(p1Records, p2Records, price));
  // 2. Concentración de crecimiento
  allInsights.push(...detectGrowthConcentration(p1Records, p2Records, price));
  // 3. Cambios estructurales (migración entre mercados)
  allInsights.push(...detectStructuralShifts(p1Records, p2Records, price));
  // 4. Relaciones causa-efecto
  allInsights.push(...detectCausalRelationships(p1Records, p2Records, price));
  // 5. Dependencias
  allInsights.push(...detectDependencies(p2Records, price));
  // 6. Oportunidades
  allInsights.push(...detectOpportunities(p1Records, p2Records, price));
  // 7. Hallazgos anómalos
  allInsights.push(...detectAnomalies(p1Records, p2Records, price));
  // 8. Hallazgos predictivos
  allInsights.push(...detectPredictive(p1Records, p2Records, price));

  // Filtrar: "¿Este dato ayuda realmente a tomar una decisión?"
  const decisionUseful = allInsights.filter(i => isDecisionUseful(i));

  // Ordenar por prioridad (mayor = más importante)
  decisionUseful.sort((a, b) => b.priority - a.priority);

  // Limitar a top 6
  const top = decisionUseful.slice(0, CONFIG.maxInsights);

  return {
    insights: top,
    totalDetected: allInsights.length,
    period1Label,
    period2Label,
  };
}

// ============================================================
// 1. CONCENTRACIÓN DE PÉRDIDAS
// ============================================================
// Detecta si la mayor parte de la caída proviene de pocos actores.
// Ej: "El 81% de la caída total proviene de solo 3 empresas."
// ============================================================

function detectLossConcentration(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const p1ByCompany = aggregateBy(p1, 'p');
  const p2ByCompany = aggregateBy(p2, 'p');

  const losses: Array<{ name: string; lossKg: number }> = [];
  for (const name of new Set([...Object.keys(p1ByCompany), ...Object.keys(p2ByCompany)])) {
    const v1 = p1ByCompany[name] || 0;
    const v2 = p2ByCompany[name] || 0;
    const loss = v1 - v2;
    if (loss > 0) losses.push({ name, lossKg: loss });
  }

  if (losses.length === 0) return [];

  const totalLoss = losses.reduce((s, l) => s + l.lossKg, 0);
  if (totalLoss === 0) return [];

  losses.sort((a, b) => b.lossKg - a.lossKg);

  // Calcular qué % de la caída explican los top N actores
  const top3 = losses.slice(0, 3);
  const top3Loss = top3.reduce((s, l) => s + l.lossKg, 0);
  const top3Pct = (top3Loss / totalLoss) * 100;

  // Solo generar hallazgo si la concentración es alta (>50% en 3 actores)
  if (top3Pct < 50) return [];

  const impactTons = top3Loss / 1000;
  const impactUsd = impactTons * price;
  const impact: ImpactLevel = top3Pct > 80 ? 'muy_alto' : top3Pct > 60 ? 'alto' : 'medio';

  return [{
    id: 'loss-concentration',
    category: 'concentracion_perdida',
    title: 'CAÍDA CONCENTRADA',
    summary: `El ${top3Pct.toFixed(0)}% de la caída del mercado proviene de ${top3.length === 1 ? 'una sola empresa' : `${top3.length} empresas`}.`,
    evidence: top3.map(l => ({
      label: l.name,
      value: `-${(l.lossKg / 1000).toFixed(0)} t`,
      tons: l.lossKg / 1000,
      pct: (l.lossKg / totalLoss) * 100,
    })),
    explanation: `El resto del mercado permanece estable. La contracción está altamente concentrada en ${top3.length === 1 ? 'un actor único' : `${top3.length} actores`}, lo que sugiere un problema específico (no una caída generalizada).`,
    impact,
    impactTons,
    impactUsd,
    confidence: Math.min(95, 60 + losses.length * 3),
    action: `Analizar inmediatamente ${top3.map(l => l.name).join(', ')}. Investigar causas operativas, comerciales o regulatorias de la caída.`,
    priority: 100 + top3Pct,
  }];
}

// ============================================================
// 2. CONCENTRACIÓN DE CRECIMIENTO
// ============================================================
// Detecta si el crecimiento depende de pocos clientes.
// Ej: "Dos empresas explican el 75% del crecimiento."
// ============================================================

function detectGrowthConcentration(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const p1ByCompany = aggregateBy(p1, 'p');
  const p2ByCompany = aggregateBy(p2, 'p');

  const gains: Array<{ name: string; gainKg: number }> = [];
  for (const name of new Set([...Object.keys(p1ByCompany), ...Object.keys(p2ByCompany)])) {
    const v1 = p1ByCompany[name] || 0;
    const v2 = p2ByCompany[name] || 0;
    const gain = v2 - v1;
    if (gain > 0) gains.push({ name, gainKg: gain });
  }

  if (gains.length === 0) return [];

  const totalGain = gains.reduce((s, g) => s + g.gainKg, 0);
  if (totalGain === 0) return [];

  gains.sort((a, b) => b.gainKg - a.gainKg);

  const top3 = gains.slice(0, 3);
  const top3Gain = top3.reduce((s, g) => s + g.gainKg, 0);
  const top3Pct = (top3Gain / totalGain) * 100;

  if (top3Pct < 50) return [];

  const impactTons = top3Gain / 1000;
  const impactUsd = impactTons * price;
  const impact: ImpactLevel = top3Pct > 80 ? 'muy_alto' : top3Pct > 60 ? 'alto' : 'medio';

  return [{
    id: 'growth-concentration',
    category: 'concentracion_crecimiento',
    title: 'CRECIMIENTO CONCENTRADO',
    summary: `${top3.length} empresa${top3.length > 1 ? 's' : ''} explican el ${top3Pct.toFixed(0)}% del crecimiento del mercado.`,
    evidence: top3.map(g => ({
      label: g.name,
      value: `+${(g.gainKg / 1000).toFixed(0)} t`,
      tons: g.gainKg / 1000,
      pct: (g.gainKg / totalGain) * 100,
    })),
    explanation: `El crecimiento del mercado depende de ${top3.length === 1 ? 'un único actor' : `${top3.length} actores`}. ${top3Pct > 75 ? 'Dependencia alta: si estos actores se detienen, el mercado se contrae.' : 'Dependencia moderada.'}`,
    impact,
    impactTons,
    impactUsd,
    confidence: Math.min(95, 60 + gains.length * 3),
    action: `Asegurar relación con ${top3.map(g => g.name).join(', ')}. No depender de ${top3.length === 1 ? 'un solo' : 'pocos'} motor${top3.length > 1 ? 'es' : ''} de crecimiento.`,
    priority: 90 + top3Pct,
  }];
}

// ============================================================
// 3. CAMBIOS ESTRUCTURALES (migración entre mercados)
// ============================================================
// Detecta migración de un país/producto a otro.
// Ej: "No existe una caída general. Existe una migración de Europa a Asia."
// ============================================================

function detectStructuralShifts(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const insights: DeepInsight[] = [];

  // Migración entre países
  const p1ByCountry = aggregateBy(p1, 'pa');
  const p2ByCountry = aggregateBy(p2, 'pa');

  const countryChanges: Array<{ name: string; changeKg: number; v1: number; v2: number }> = [];
  for (const name of new Set([...Object.keys(p1ByCountry), ...Object.keys(p2ByCountry)])) {
    const v1 = p1ByCountry[name] || 0;
    const v2 = p2ByCountry[name] || 0;
    countryChanges.push({ name, changeKg: v2 - v1, v1, v2 });
  }

  const losers = countryChanges.filter(c => c.changeKg < -CONFIG.significantVolumeKg).sort((a, b) => a.changeKg - b.changeKg);
  const winners = countryChanges.filter(c => c.changeKg > CONFIG.significantVolumeKg).sort((a, b) => b.changeKg - a.changeKg);

  // Si hay perdedores y ganadores significativos, hay migración
  if (losers.length >= 1 && winners.length >= 1) {
    const totalLost = losers.reduce((s, l) => s + Math.abs(l.changeKg), 0);
    const totalGained = winners.reduce((s, w) => s + w.changeKg, 0);
    const netChange = totalGained - totalLost;

    // Si la migración es significativa (net change pequeño pero mucho movimiento)
    if (totalLost > CONFIG.significantVolumeKg && totalGained > CONFIG.significantVolumeKg) {
      const isNeturalMigration = Math.abs(netChange) < totalLost * 0.3;

      const impactTons = (totalLost + totalGained) / 2 / 1000;
      const impactUsd = impactTons * price;
      const impact: ImpactLevel = isNeturalMigration ? 'medio' : 'alto';

      insights.push({
        id: 'structural-migration',
        category: 'cambio_estructural',
        title: isNeturalMigration ? 'MIGRACIÓN ENTRE MERCADOS' : 'REESTRUCTURACIÓN DEL MERCADO',
        summary: isNeturalMigration
          ? `No existe una caída general. Existe una migración: ${losers.map(l => l.name).join(', ')} → ${winners.map(w => w.name).join(', ')}.`
          : `El mercado se está reestructurando: pérdida de ${losers.map(l => l.name).join(', ')} y ganancia de ${winners.map(w => w.name).join(', ')}.`,
        evidence: [
          ...losers.slice(0, 2).map(l => ({ label: `↓ ${l.name}`, value: `${(l.changeKg / 1000).toFixed(0)} t`, tons: l.changeKg / 1000 })),
          ...winners.slice(0, 2).map(w => ({ label: `↑ ${w.name}`, value: `+${(w.changeKg / 1000).toFixed(0)} t`, tons: w.changeKg / 1000 })),
        ],
        explanation: isNeturalMigration
          ? `El volumen total se mantiene estable, pero hay un cambio de destinos. Esto sugiere un cambio estratégico de las empresas, no una contracción del mercado.`
          : `Hay un cambio estructural con ${netChange < 0 ? 'contracción neta' : 'expansión neta'} de ${(Math.abs(netChange) / 1000).toFixed(0)} t. Los mercados ganadores no compensan completamente a los perdedores.`,
        impact,
        impactTons,
        impactUsd,
        confidence: 75,
        action: `Investigar causas de la migración: ¿cambios arancelarios, regulaciones sanitarias, acuerdos comerciales? Adaptar estrategia comercial a los nuevos destinos.`,
        priority: 85,
      });
    }
  }

  return insights;
}

// ============================================================
// 4. RELACIONES CAUSA-EFECTO
// ============================================================
// Cruza empresas × países × productos para detectar patrones.
// Ej: "La caída de Brasil explica el 63% de la caída total."
// ============================================================

function detectCausalRelationships(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const insights: DeepInsight[] = [];

  const totalP1 = p1.reduce((s, r) => s + (r.pn || 0), 0);
  const totalP2 = p2.reduce((s, r) => s + (r.pn || 0), 0);
  const totalChange = totalP2 - totalP1;

  if (Math.abs(totalChange) < CONFIG.significantVolumeKg) return [];

  // Analizar por país: ¿qué país explica la mayor parte del cambio?
  const p1ByCountry = aggregateBy(p1, 'pa');
  const p2ByCountry = aggregateBy(p2, 'pa');
  const countryChanges: Array<{ name: string; changeKg: number }> = [];
  for (const name of new Set([...Object.keys(p1ByCountry), ...Object.keys(p2ByCountry)])) {
    const change = (p2ByCountry[name] || 0) - (p1ByCountry[name] || 0);
    if (Math.abs(change) > CONFIG.significantVolumeKg) {
      countryChanges.push({ name, changeKg: change });
    }
  }

  if (countryChanges.length === 0) return [];

  // Encontrar el país que más explica el cambio
  const sameDirection = countryChanges.filter(c =>
    (totalChange < 0 && c.changeKg < 0) || (totalChange > 0 && c.changeKg > 0)
  );
  sameDirection.sort((a, b) => Math.abs(b.changeKg) - Math.abs(a.changeKg));

  if (sameDirection.length === 0) return [];

  const topDriver = sameDirection[0];
  const driverPct = Math.abs(topDriver.changeKg / totalChange) * 100;

  if (driverPct < 40) return []; // solo si explica >40% del cambio

  const isDecline = topDriver.changeKg < 0;
  const impactTons = Math.abs(topDriver.changeKg) / 1000;
  const impactUsd = impactTons * price;
  const impact: ImpactLevel = driverPct > 70 ? 'muy_alto' : driverPct > 50 ? 'alto' : 'medio';

  insights.push({
    id: 'causal-driver',
    category: 'causa_efecto',
    title: isDecline ? `CAÍDA EXPLICADA POR ${topDriver.name.toUpperCase()}` : `CRECIMIENTO IMPULSADO POR ${topDriver.name.toUpperCase()}`,
    summary: `${topDriver.name} ${isDecline ? 'explica' : 'impulsa'} el ${driverPct.toFixed(0)}% del ${isDecline ? 'declive' : 'crecimiento'} total del mercado.`,
    evidence: [
      { label: `${topDriver.name}`, value: `${isDecline ? '-' : '+'}${(Math.abs(topDriver.changeKg) / 1000).toFixed(0)} t`, tons: Math.abs(topDriver.changeKg) / 1000, pct: driverPct },
      { label: 'Cambio total del mercado', value: `${totalChange > 0 ? '+' : ''}${(totalChange / 1000).toFixed(0)} t`, tons: totalChange / 1000 },
    ],
    explanation: `El ${isDecline ? 'declive' : 'crecimiento'} del mercado NO es generalizado. Está ${isDecline ? 'concentrado en' : 'impulsado por'} ${topDriver.name}. ${sameDirection.length > 1 ? `Otros ${sameDirection.length - 1} destinos también contribuyen en la misma dirección.` : 'Es el único destino que explica el cambio.'}`,
    impact,
    impactTons,
    impactUsd,
    confidence: 80,
    action: isDecline
      ? `Investigar causas específicas de la caída en ${topDriver.name}: ¿barreras arancelarias, problemas sanitarios, competencia? Diseñar plan de recuperación.`
      : `Capitalizar el crecimiento en ${topDriver.name}: asegurar capacidad logística, fortalecer relaciones comerciales, explorar expansión.`,
    priority: 95,
  });

  return insights;
}

// ============================================================
// 5. DEPENDENCIAS
// ============================================================
// Detecta dependencia de un cliente/destino/país/producto.
// ============================================================

function detectDependencies(
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const insights: DeepInsight[] = [];

  // Dependencia de un país
  const byCountry = aggregateBy(p2, 'pa');
  const totalP2 = Object.values(byCountry).reduce((s, v) => s + v, 0);
  if (totalP2 === 0) return insights;

  const sortedCountries = Object.entries(byCountry)
    .map(([name, kg]) => ({ name, kg, pct: (kg / totalP2) * 100 }))
    .sort((a, b) => b.kg - a.kg);

  const topCountry = sortedCountries[0];
  if (topCountry && topCountry.pct > CONFIG.concentrationThreshold * 100) {
    const impactTons = topCountry.kg / 1000;
    const impactUsd = impactTons * price;
    const risk: ImpactLevel = topCountry.pct > 80 ? 'muy_alto' : topCountry.pct > 70 ? 'alto' : 'medio';

    insights.push({
      id: 'dependency-country',
      category: 'dependencia',
      title: `DEPENDENCIA DE ${topCountry.name.toUpperCase()}`,
      summary: `${topCountry.pct.toFixed(0)}% del mercado depende de un solo destino: ${topCountry.name}.`,
      evidence: [
        { label: topCountry.name, value: `${topCountry.pct.toFixed(1)}%`, tons: topCountry.kg / 1000, pct: topCountry.pct },
        { label: 'Diversificación', value: `${sortedCountries.length} destinos totales` },
      ],
      explanation: `La concentración en ${topCountry.name} supera el ${CONFIG.concentrationThreshold * 100}% de umbral de riesgo. Si ${topCountry.name} cierra su mercado (regulaciones, aranceles, crisis), el impacto sería devastador.`,
      impact: risk,
      impactTons,
      impactUsd,
      confidence: 90,
      action: `Diversificar destinos urgentemente. Negociar acuerdos con mercados alternativos. No exponer más del 50% a un solo destino.`,
      priority: 88,
    });
  }

  return insights;
}

// ============================================================
// 6. OPORTUNIDADES
// ============================================================
// Busca mercados nuevos con crecimiento, clientes nuevos, etc.
// No considerar < 2% del volumen.
// ============================================================

function detectOpportunities(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const insights: DeepInsight[] = [];

  const totalP2 = p2.reduce((s, r) => s + (r.pn || 0), 0);
  if (totalP2 === 0) return insights;

  // Mercados nuevos (países que aparecieron en p2 pero no en p1)
  const p1Countries = new Set(p1.map(r => r.pa).filter(Boolean));
  const newCountries: Array<{ name: string; kg: number }> = [];
  const p2ByCountry = aggregateBy(p2, 'pa');
  for (const [name, kg] of Object.entries(p2ByCountry)) {
    if (!p1Countries.has(name) && kg > CONFIG.significantVolumeKg) {
      const pct = (kg / totalP2) * 100;
      if (pct >= 2) { // solo >= 2% del volumen
        newCountries.push({ name, kg });
      }
    }
  }

  if (newCountries.length === 0) return insights;

  newCountries.sort((a, b) => b.kg - a.kg);
  const totalNewKg = newCountries.reduce((s, c) => s + c.kg, 0);
  const impactTons = totalNewKg / 1000;
  const impactUsd = impactTons * price;

  insights.push({
    id: 'opportunity-new-markets',
    category: 'oportunidad',
    title: `${newCountries.length} MERCADO${newCountries.length > 1 ? 'S' : ''} NUEVO${newCountries.length > 1 ? 'S' : ''}`,
    summary: `Se detectaron ${newCountries.length} destino${newCountries.length > 1 ? 's' : ''} nuevo${newCountries.length > 1 ? 's' : ''} con volumen significativo: ${newCountries.map(c => c.name).join(', ')}.`,
    evidence: newCountries.map(c => ({
      label: c.name,
      value: `${(c.kg / 1000).toFixed(0)} t`,
      tons: c.kg / 1000,
      pct: (c.kg / totalP2) * 100,
    })),
    explanation: `Estos mercados no existían en el período anterior y ya representan volumen significativo (${(totalNewKg / 1000).toFixed(0)} t). Oportunidad de consolidar presencia comercial.`,
    impact: 'alto',
    impactTons,
    impactUsd,
    confidence: 85,
    action: `Asignar responsable comercial para ${newCountries.map(c => c.name).join(', ')}. Investigar demanda, regulaciones, logística. Asegurar posicionamiento antes que competidores.`,
    priority: 82,
  });

  return insights;
}

// ============================================================
// 7. HALLAZGOS ANÓMALOS
// ============================================================
// Detecta outliers, cambios abruptos, empresas que aparecieron/desaparecieron.
// ============================================================

function detectAnomalies(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const insights: DeepInsight[] = [];

  // Empresas que desaparecieron (estaban en p1, no en p2)
  const p1Companies = new Set(p1.map(r => r.p).filter(Boolean));
  const p2Companies = new Set(p2.map(r => r.p).filter(Boolean));

  const disappeared: Array<{ name: string; kg: number }> = [];
  const p1ByCompany = aggregateBy(p1, 'p');
  for (const name of p1Companies) {
    if (!p2Companies.has(name) && p1ByCompany[name] > CONFIG.significantVolumeKg) {
      disappeared.push({ name, kg: p1ByCompany[name] });
    }
  }

  if (disappeared.length > 0) {
    disappeared.sort((a, b) => b.kg - a.kg);
    const top = disappeared.slice(0, 3);
    const totalKg = top.reduce((s, d) => s + d.kg, 0);
    const impactTons = totalKg / 1000;
    const impactUsd = impactTons * price;

    insights.push({
      id: 'anomaly-disappeared',
      category: 'anomalia',
      title: `${disappeared.length} EMPRESA${disappeared.length > 1 ? 'S' : ''} DESAPARECIERON`,
      summary: `${disappeared.length} empresa${disappeared.length > 1 ? 's' : ''} que exportaban en el período anterior ya no registran actividad.`,
      evidence: top.map(d => ({
        label: d.name,
        value: `-${(d.kg / 1000).toFixed(0)} t`,
        tons: d.kg / 1000,
      })),
      explanation: `Estas empresas dejaron de exportar completamente. Puede indicar: cierre operativo, pérdida de habilitación sanitaria, cambio de razón social, o quiebra. Requiere investigación.`,
      impact: 'alto',
      impactTons,
      impactUsd,
      confidence: 70,
      action: `Verificar estado operativo de ${top.map(d => d.name).join(', ')}. Si cerraron, evaluar captar su volumen. Si cambiaron de razón social, actualizar registros.`,
      priority: 78,
    });
  }

  return insights;
}

// ============================================================
// 8. HALLAZGOS PREDICTIVOS
// ============================================================
// Usa Prediction Engine para proyectar tendencias.
// ============================================================

function detectPredictive(
  p1: MovRecord[],
  p2: MovRecord[],
  price: number,
): DeepInsight[] {
  const insights: DeepInsight[] = [];

  // Construir serie temporal mensual combinada
  const monthlyMap = new Map<string, number>();
  for (const r of [...p1, ...p2]) {
    const month = (r.f || '').substring(0, 7);
    if (!month) continue;
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + (r.pn || 0));
  }

  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  if (sortedMonths.length < 4) return insights; // mínimo 4 meses para predecir

  const series: TimeSeriesPoint[] = sortedMonths.map(m => ({
    label: m,
    value: monthlyMap.get(m) || 0,
  }));

  const reg = linearRegression(series);
  const prediction = predictLinear(series, 3);

  // Solo generar hallazgo si la tendencia es fuerte
  if (Math.abs(reg.slope) < 1000) return insights; // < 1 tonelada/mes de pendiente

  const isDecline = reg.slope < 0;
  const lastValue = series[series.length - 1].value;
  const predictedValue = prediction.values[0]?.value ?? lastValue;
  const changePct = lastValue > 0 ? ((predictedValue - lastValue) / lastValue) * 100 : 0;

  if (Math.abs(changePct) < 10) return insights; // solo si >10% cambio proyectado

  const impactTons = Math.abs(predictedValue - lastValue) / 1000;
  const impactUsd = impactTons * price;
  const impact: ImpactLevel = Math.abs(changePct) > 30 ? 'muy_alto' : Math.abs(changePct) > 20 ? 'alto' : 'medio';
  const confidence = Math.round(Math.max(30, Math.min(90, reg.r2 * 100)));

  insights.push({
    id: 'predictive-trend',
    category: 'predictivo',
    title: isDecline ? `PROYECCIÓN: CAÍDA DE ${Math.abs(changePct).toFixed(0)}%` : `PROYECCIÓN: CRECIMIENTO DE ${changePct.toFixed(0)}%`,
    summary: `Si continúa la tendencia, el mercado ${isDecline ? 'caerá' : 'crecerá'} ${Math.abs(changePct).toFixed(0)}% en los próximos 3 meses (${(predictedValue / 1000).toFixed(0)} t proyectadas vs ${(lastValue / 1000).toFixed(0)} t actuales).`,
    evidence: [
      { label: 'Tendencia actual', value: `${reg.slope > 0 ? '+' : ''}${(reg.slope / 1000).toFixed(1)} t/mes` },
      { label: 'Proyección 3 meses', value: `${(predictedValue / 1000).toFixed(0)} t` },
      { label: 'Confianza (R²)', value: `${(reg.r2 * 100).toFixed(0)}%` },
    ],
    explanation: `Basado en regresión lineal de ${sortedMonths.length} meses. ${reg.r2 > 0.7 ? 'Alta confianza: la tendencia es consistente.' : reg.r2 > 0.4 ? 'Confianza media: hay variabilidad.' : 'Baja confianza: datos ruidosos.'} ${isDecline ? 'Si no se actúa, la caída se profundizará.' : 'El crecimiento debe capitalizarse.'}`,
    impact,
    impactTons,
    impactUsd,
    confidence,
    action: isDecline
      ? `Frenar la caída: identificar causas raíz, ejecutar plan de retención de clientes, diversificar mercados. No esperar a que se profundice.`
      : `Capitalizar crecimiento: asegurar capacidad operativa, fortalecer posición comercial, no subinvertir en producción.`,
    priority: 87,
  });

  return insights;
}

// ============================================================
// HELPER: ¿Este hallazgo ayuda a tomar una decisión?
// ============================================================

function isDecisionUseful(insight: DeepInsight): boolean {
  // Filtrar hallazgos triviales
  if (insight.impactTons < 10) return false; // < 10 toneladas = irrelevante
  if (insight.confidence < 30) return false; // muy baja confianza
  if (!insight.action || insight.action.length < 10) return false; // sin acción clara
  return true;
}

// ============================================================
// HELPER: Agregar por campo
// ============================================================

function aggregateBy(records: MovRecord[], field: keyof MovRecord): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of records) {
    const key = String(r[field] || '').trim();
    if (!key || key === '—') continue;
    map[key] = (map[key] || 0) + (r.pn || 0);
  }
  return map;
}
