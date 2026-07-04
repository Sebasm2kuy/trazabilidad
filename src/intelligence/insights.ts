// ============================================================
// INSIGHTS ENGINE — Descubridor automático de hallazgos
// ============================================================
// Analiza los datos y genera insights en lenguaje natural.
// No usa IA. Todo se calcula con reglas estadísticas.
// ============================================================

import type { MovRecord, Insight } from './types';
import {
  getMarketSummary, getGrowth, getTopGrowth, getTopDecline,
  getConcentration, getNewDestinations, getLostDestinations,
  getCompanyRanking, getCountryRanking, comparePeriods
} from './aggregation';

export function generateInsights(
  currentRecords: MovRecord[],
  previousRecords: MovRecord[]
): Insight[] {
  const insights: Insight[] = [];
  let id = 0;

  const cur = getMarketSummary(currentRecords);
  const prev = getMarketSummary(previousRecords);
  const comparisons = comparePeriods(currentRecords, previousRecords);

  // 1. Crecimiento/caída del mercado total
  const pnComparison = comparisons.find(c => c.metric === 'Peso Neto (kg)');
  if (pnComparison && prev.totalPesoNeto > 0) {
    const rate = pnComparison.changeRate;
    if (rate > 5) {
      insights.push({
        id: `insight_${id++}`,
        type: 'growth',
        icon: '📈',
        title: 'El mercado creció',
        description: `El volumen total exportado aumentó ${rate.toFixed(1)}% respecto al período anterior (${(cur.totalPesoNeto / 1000).toFixed(0)} ton vs ${(prev.totalPesoNeto / 1000).toFixed(0)} ton).`,
        severity: 'positive',
        value: rate,
      });
    } else if (rate < -5) {
      insights.push({
        id: `insight_${id++}`,
        type: 'decline',
        icon: '📉',
        title: 'El mercado se contrajo',
        description: `El volumen total exportado cayó ${Math.abs(rate).toFixed(1)}% respecto al período anterior (${(cur.totalPesoNeto / 1000).toFixed(0)} ton vs ${(prev.totalPesoNeto / 1000).toFixed(0)} ton).`,
        severity: 'negative',
        value: rate,
      });
    }
  }

  // 2. Top países con mayor crecimiento
  const countryGrowth = getTopGrowth(currentRecords, previousRecords, 'pa', 3);
  for (const g of countryGrowth) {
    if (g.growthRate > 20 && g.currentPn > 100000) {
      insights.push({
        id: `insight_${id++}`,
        type: 'growth',
        icon: '📈',
        title: `${g.name} creció ${g.growthRate.toFixed(0)}%`,
        description: `${g.name} aumentó de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas (+${((g.currentPn - g.previousPn) / 1000).toFixed(0)} ton).`,
        severity: 'positive',
        value: g.growthRate,
        entity: g.name,
      });
    }
  }

  // 3. Top países con mayor caída
  const countryDecline = getTopDecline(currentRecords, previousRecords, 'pa', 3);
  for (const g of countryDecline) {
    if (g.growthRate < -20 && g.previousPn > 100000) {
      insights.push({
        id: `insight_${id++}`,
        type: 'decline',
        icon: '📉',
        title: `${g.name} cayó ${Math.abs(g.growthRate).toFixed(0)}%`,
        description: `${g.name} disminuyó de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas (${((g.currentPn - g.previousPn) / 1000).toFixed(0)} ton).`,
        severity: 'negative',
        value: g.growthRate,
        entity: g.name,
      });
    }
  }

  // 4. Top empresas con mayor crecimiento
  const companyGrowth = getTopGrowth(currentRecords, previousRecords, 'p', 3);
  for (const g of companyGrowth) {
    if (g.growthRate > 30 && g.currentPn > 50000) {
      insights.push({
        id: `insight_${id++}`,
        type: 'growth',
        icon: '🏭',
        title: `${g.name.substring(0, 25)} creció ${g.growthRate.toFixed(0)}%`,
        description: `${g.name} aumentó sus envíos de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas.`,
        severity: 'positive',
        value: g.growthRate,
        entity: g.name,
      });
    }
  }

  // 5. Top empresas con mayor caída
  const companyDecline = getTopDecline(currentRecords, previousRecords, 'p', 3);
  for (const g of companyDecline) {
    if (g.growthRate < -30 && g.previousPn > 50000) {
      insights.push({
        id: `insight_${id++}`,
        type: 'decline',
        icon: '⚠️',
        title: `${g.name.substring(0, 25)} cayó ${Math.abs(g.growthRate).toFixed(0)}%`,
        description: `${g.name} redujo sus envíos de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas.`,
        severity: 'warning',
        value: g.growthRate,
        entity: g.name,
      });
    }
  }

  // 6. Nuevos destinos
  const newDests = getNewDestinations(currentRecords, previousRecords);
  if (newDests.length > 0) {
    insights.push({
      id: `insight_${id++}`,
      type: 'new',
      icon: '🌎',
      title: `${newDests.length} nuevo${newDests.length > 1 ? 's' : ''} destino${newDests.length > 1 ? 's' : ''}`,
      description: `Se incorporaron exportaciones a: ${newDests.slice(0, 5).join(', ')}${newDests.length > 5 ? ` y ${newDests.length - 5} más` : ''}.`,
      severity: 'positive',
    });
  }

  // 7. Destinos perdidos
  const lostDests = getLostDestinations(currentRecords, previousRecords);
  if (lostDests.length > 0) {
    insights.push({
      id: `insight_${id++}`,
      type: 'lost',
      icon: '❌',
      title: `${lostDests.length} destino${lostDests.length > 1 ? 's' : ''} perdido${lostDests.length > 1 ? 's' : ''}`,
      description: `Se dejaron de exportar a: ${lostDests.slice(0, 5).join(', ')}${lostDests.length > 5 ? ` y ${lostDests.length - 5} más` : ''}.`,
      severity: 'warning',
    });
  }

  // 8. Concentración de riesgo (empresas que dependen de un solo destino)
  const concentration = getConcentration(currentRecords, 'p');
  const highRisk = concentration.filter(c => c.risk === 'alto' && c.totalPn > 100000);
  for (const c of highRisk.slice(0, 3)) {
    insights.push({
      id: `insight_${id++}`,
      type: 'concentration',
      icon: '⚠️',
      title: `${c.name.substring(0, 25)} depende ${c.concentration.toFixed(0)}% de ${c.topDestinoName}`,
      description: `${c.name} concentra el ${c.concentration.toFixed(0)}% de sus exportaciones (${(c.topDestinoPn / 1000).toFixed(0)} ton) en ${c.topDestinoName}. Riesgo: ${c.risk}.`,
      severity: 'warning',
      value: c.concentration,
      entity: c.name,
    });
  }

  // 9. Productos con mayor crecimiento
  const productGrowth = getTopGrowth(currentRecords, previousRecords, 'd', 3);
  for (const g of productGrowth) {
    if (g.growthRate > 50 && g.currentPn > 50000) {
      insights.push({
        id: `insight_${id++}`,
        type: 'growth',
        icon: '📦',
        title: `${g.name.substring(0, 30)}... duplicó su volumen`,
        description: `El producto "${g.name.substring(0, 40)}" creció ${g.growthRate.toFixed(0)}% (de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} ton).`,
        severity: 'positive',
        value: g.growthRate,
        entity: g.name,
      });
    }
  }

  // 10. Cortes con mayor crecimiento
  const corteGrowth = getTopGrowth(currentRecords, previousRecords, 'co', 2);
  for (const g of corteGrowth) {
    if (g.growthRate > 50 && g.currentPn > 30000) {
      insights.push({
        id: `insight_${id++}`,
        type: 'growth',
        icon: '🥩',
        title: `Corte "${g.name}" creció ${g.growthRate.toFixed(0)}%`,
        description: `El corte ${g.name} aumentó de ${(g.previousPn / 1000).toFixed(0)} a ${(g.currentPn / 1000).toFixed(0)} toneladas.`,
        severity: 'positive',
        value: g.growthRate,
        entity: g.name,
      });
    }
  }

  // 11. Ranking de líderes
  const topCompany = getCompanyRanking(currentRecords, 1)[0];
  if (topCompany) {
    insights.push({
      id: `insight_${id++}`,
      type: 'milestone',
      icon: '🏆',
      title: `${topCompany.name.substring(0, 25)} lidera el mercado`,
      description: `${topCompany.name} es el principal exportador con ${(topCompany.pesoNeto / 1000).toFixed(0)} toneladas (${topCompany.share.toFixed(1)}% del mercado total).`,
      severity: 'neutral',
      value: topCompany.share,
      entity: topCompany.name,
    });
  }

  // 12. Diversificación del mercado
  if (cur.paisesUnicos > 0) {
    const topPaises = getCountryRanking(currentRecords, 3);
    const top3Share = topPaises.reduce((s, p) => s + p.share, 0);
    if (top3Share > 60) {
      insights.push({
        id: `insight_${id++}`,
        type: 'concentration',
        icon: '📊',
        title: `Top 3 países concentran ${top3Share.toFixed(0)}% del mercado`,
        description: `${topPaises.map(p => `${p.name} (${p.share.toFixed(0)}%)`).join(', ')} dominan el mercado exportador. Considerar diversificación.`,
        severity: 'warning',
        value: top3Share,
      });
    }
  }

  return insights;
}
