// ============================================================
// AGGREGATION ENGINE — Motor de agregación reutilizable
// ============================================================
// Todas las funciones reciben datos + filtros y devuelven resultados.
// No contienen lógica de UI. No dependen de React.
// ============================================================

import type { MovRecord, DateRange, FilterOptions, MarketSummary, RankingEntry, TimeSeriesPoint, GrowthResult, ConcentrationResult } from './types';

/** Filtrar registros por fecha + opciones */
export function filterRecords(
  records: MovRecord[],
  range: DateRange,
  options?: FilterOptions
): MovRecord[] {
  return records.filter(r => {
    // Date filter
    if (range.start && r.f < range.start) return false;
    if (range.end && r.f > range.end) return false;
    // Option filters
    if (options?.empresa && r.p !== options.empresa && r.cf !== options.empresa) return false;
    if (options?.pais && r.pa !== options.pais) return false;
    if (options?.corte && r.co !== options.corte) return false;
    if (options?.producto && r.d !== options.producto) return false;
    if (options?.tipoMov && r.tm !== options.tipoMov) return false;
    if (options?.tipoProducto === 'congelado' && r.tpd !== 'Congelado') return false;
    if (options?.tipoProducto === 'fresco' && r.tpd !== 'Fresco') return false;
    return true;
  });
}

/** Resumen del mercado */
export function getMarketSummary(records: MovRecord[]): MarketSummary {
  const empresas = new Set<string>();
  const paises = new Set<string>();
  const cortes = new Set<string>();
  const productos = new Set<string>();
  const clientes = new Set<string>();
  let totalCajas = 0, totalPb = 0, totalPn = 0;

  for (const r of records) {
    if (r.p) empresas.add(r.p);
    if (r.pa) paises.add(r.pa);
    if (r.co) cortes.add(r.co);
    if (r.d) productos.add(r.d);
    if (r.ed) clientes.add(r.ed);
    totalCajas += r.e || 0;
    totalPb += r.pb || 0;
    totalPn += r.pn || 0;
  }

  const n = records.length || 1;
  return {
    totalRegistros: records.length,
    totalCajas,
    totalPesoBruto: totalPb,
    totalPesoNeto: totalPn,
    empresasUnicas: empresas.size,
    paisesUnicos: paises.size,
    cortesUnicos: cortes.size,
    productosUnicos: productos.size,
    clientesUnicos: clientes.size,
    pesoPromedioPorEmbarque: Math.round(totalPn / n),
    envasesPromedioPorEmbarque: Math.round(totalCajas / n),
  };
}

/** Ranking genérico por cualquier campo */
export function getRanking(
  records: MovRecord[],
  field: keyof MovRecord,
  limit?: number
): RankingEntry[] {
  const map: Record<string, { regs: number; cajas: number; pn: number }> = {};
  for (const r of records) {
    const key = String(r[field] || '');
    if (!key) continue;
    if (!map[key]) map[key] = { regs: 0, cajas: 0, pn: 0 };
    map[key].regs++;
    map[key].cajas += r.e || 0;
    map[key].pn += r.pn || 0;
  }
  const totalPn = Object.values(map).reduce((s, v) => s + v.pn, 0) || 1;
  return Object.entries(map)
    .map(([name, v]) => ({
      name, registros: v.regs, cajas: v.cajas, pesoNeto: v.pn,
      share: (v.pn / totalPn) * 100,
    }))
    .sort((a, b) => b.pesoNeto - a.pesoNeto)
    .slice(0, limit);
}

/** Ranking de empresas (productores) */
export function getCompanyRanking(records: MovRecord[], limit?: number): RankingEntry[] {
  return getRanking(records, 'p', limit);
}

/** Ranking de países */
export function getCountryRanking(records: MovRecord[], limit?: number): RankingEntry[] {
  return getRanking(records, 'pa', limit);
}

/** Ranking de productos */
export function getProductRanking(records: MovRecord[], limit?: number): RankingEntry[] {
  return getRanking(records, 'd', limit);
}

/** Ranking de cortes */
export function getCorteRanking(records: MovRecord[], limit?: number): RankingEntry[] {
  return getRanking(records, 'co', limit);
}

/** Serie temporal por mes */
export function getTimeSeries(records: MovRecord[]): TimeSeriesPoint[] {
  const map: Record<string, { registros: number; cajas: number; pesoNeto: number }> = {};
  for (const r of records) {
    if (!r.f) continue;
    const mes = r.f.substring(0, 7); // YYYY-MM
    if (!map[mes]) map[mes] = { registros: 0, cajas: 0, pesoNeto: 0 };
    map[mes].registros++;
    map[mes].cajas += r.e || 0;
    map[mes].pesoNeto += r.pn || 0;
  }
  return Object.entries(map)
    .map(([fecha, v]) => ({ fecha, ...v }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Calcular período anterior (misma duración, inmediatamente antes) */
export function getPreviousRange(range: DateRange, records: MovRecord[]): DateRange {
  if (!range.start || !range.end) {
    // If no range, use last 6 months vs previous 6 months
    const dates = records.map(r => r.f).filter(Boolean).sort();
    if (dates.length === 0) return { start: null, end: null };
    const lastDate = dates[dates.length - 1];
    const lastMonth = lastDate.substring(0, 7);
    const [y, m] = lastMonth.split('-').map(Number);
    const endPrev = new Date(y, m - 7, 1).toISOString().substring(0, 10);
    const startPrev = new Date(y, m - 13, 1).toISOString().substring(0, 10);
    return { start: startPrev, end: endPrev };
  }
  const duration = new Date(range.end).getTime() - new Date(range.start).getTime();
  const prevEnd = new Date(new Date(range.start).getTime() - 1).toISOString().substring(0, 10);
  const prevStart = new Date(new Date(range.start).getTime() - duration - 1).toISOString().substring(0, 10);
  return { start: prevStart, end: prevEnd };
}

/** Crecimiento: comparar período actual vs anterior por campo */
export function getGrowth(
  currentRecords: MovRecord[],
  previousRecords: MovRecord[],
  field: keyof MovRecord
): GrowthResult[] {
  const currentMap: Record<string, number> = {};
  const previousMap: Record<string, number> = {};

  for (const r of currentRecords) {
    const key = String(r[field] || '');
    if (!key) continue;
    currentMap[key] = (currentMap[key] || 0) + (r.pn || 0);
  }
  for (const r of previousRecords) {
    const key = String(r[field] || '');
    if (!key) continue;
    previousMap[key] = (previousMap[key] || 0) + (r.pn || 0);
  }

  const allKeys = new Set([...Object.keys(currentMap), ...Object.keys(previousMap)]);
  return Array.from(allKeys).map(name => {
    const currentPn = currentMap[name] || 0;
    const previousPn = previousMap[name] || 0;
    const growthRate = previousPn > 0 ? ((currentPn - previousPn) / previousPn) * 100 : (currentPn > 0 ? 100 : 0);
    return { name, currentPn, previousPn, growthRate, absoluteChange: currentPn - previousPn };
  }).sort((a, b) => b.growthRate - a.growthRate);
}

/** Top crecimiento */
export function getTopGrowth(
  currentRecords: MovRecord[],
  previousRecords: MovRecord[],
  field: keyof MovRecord,
  limit: number = 5
): GrowthResult[] {
  return getGrowth(currentRecords, previousRecords, field)
    .filter(g => g.previousPn > 0) // Only those that existed before
    .sort((a, b) => b.growthRate - a.growthRate)
    .slice(0, limit);
}

/** Top caída */
export function getTopDecline(
  currentRecords: MovRecord[],
  previousRecords: MovRecord[],
  field: keyof MovRecord,
  limit: number = 5
): GrowthResult[] {
  return getGrowth(currentRecords, previousRecords, field)
    .filter(g => g.previousPn > 0)
    .sort((a, b) => a.growthRate - b.growthRate)
    .slice(0, limit);
}

/** Participación de mercado por empresa */
export function getMarketShare(records: MovRecord[], field: keyof MovRecord = 'p'): RankingEntry[] {
  return getRanking(records, field);
}

/** Concentración: cuánto depende una empresa de su top destino */
export function getConcentration(records: MovRecord[], field: keyof MovRecord = 'p'): ConcentrationResult[] {
  const companyMap: Record<string, { totalPn: number; destinos: Record<string, number> }> = {};
  for (const r of records) {
    const key = String(r[field] || '');
    if (!key) continue;
    if (!companyMap[key]) companyMap[key] = { totalPn: 0, destinos: {} };
    companyMap[key].totalPn += r.pn || 0;
    const dest = r.pa || 'S/D';
    companyMap[key].destinos[dest] = (companyMap[key].destinos[dest] || 0) + (r.pn || 0);
  }

  return Object.entries(companyMap).map(([name, data]) => {
    const sortedDest = Object.entries(data.destinos).sort(([,a],[,b]) => b - a);
    const topDestinoName = sortedDest[0]?.[0] || 'S/D';
    const topDestinoPn = sortedDest[0]?.[1] || 0;
    const concentration = data.totalPn > 0 ? (topDestinoPn / data.totalPn) * 100 : 0;
    return {
      name,
      totalPn: data.totalPn,
      topDestinoPn,
      topDestinoName,
      concentration,
      risk: (concentration > 60 ? 'alto' : concentration > 40 ? 'medio' : 'bajo') as 'alto' | 'medio' | 'bajo',
    };
  }).sort((a, b) => b.concentration - a.concentration);
}

/** Detectar nuevos destinos (existentes en current pero no en previous) */
export function getNewDestinations(currentRecords: MovRecord[], previousRecords: MovRecord[]): string[] {
  const currentPaises = new Set(currentRecords.map(r => r.pa).filter(Boolean));
  const previousPaises = new Set(previousRecords.map(r => r.pa).filter(Boolean));
  return [...currentPaises].filter(p => !previousPaises.has(p));
}

/** Detectar destinos perdidos */
export function getLostDestinations(currentRecords: MovRecord[], previousRecords: MovRecord[]): string[] {
  const currentPaises = new Set(currentRecords.map(r => r.pa).filter(Boolean));
  const previousPaises = new Set(previousRecords.map(r => r.pa).filter(Boolean));
  return [...previousPaises].filter(p => !currentPaises.has(p));
}

/** Comparación de métricas entre períodos */
export function comparePeriods(
  currentRecords: MovRecord[],
  previousRecords: MovRecord[]
): import('./types').ComparisonResult[] {
  const cur = getMarketSummary(currentRecords);
  const prev = getMarketSummary(previousRecords);
  const results: import('./types').ComparisonResult[] = [
    { metric: 'Registros', currentValue: cur.totalRegistros, previousValue: prev.totalRegistros, change: cur.totalRegistros - prev.totalRegistros, changeRate: prev.totalRegistros > 0 ? ((cur.totalRegistros - prev.totalRegistros) / prev.totalRegistros) * 100 : 0 },
    { metric: 'Cajas', currentValue: cur.totalCajas, previousValue: prev.totalCajas, change: cur.totalCajas - prev.totalCajas, changeRate: prev.totalCajas > 0 ? ((cur.totalCajas - prev.totalCajas) / prev.totalCajas) * 100 : 0 },
    { metric: 'Peso Neto (kg)', currentValue: cur.totalPesoNeto, previousValue: prev.totalPesoNeto, change: cur.totalPesoNeto - prev.totalPesoNeto, changeRate: prev.totalPesoNeto > 0 ? ((cur.totalPesoNeto - prev.totalPesoNeto) / prev.totalPesoNeto) * 100 : 0 },
    { metric: 'Empresas', currentValue: cur.empresasUnicas, previousValue: prev.empresasUnicas, change: cur.empresasUnicas - prev.empresasUnicas, changeRate: prev.empresasUnicas > 0 ? ((cur.empresasUnicas - prev.empresasUnicas) / prev.empresasUnicas) * 100 : 0 },
    { metric: 'Países', currentValue: cur.paisesUnicos, previousValue: prev.paisesUnicos, change: cur.paisesUnicos - prev.paisesUnicos, changeRate: prev.paisesUnicos > 0 ? ((cur.paisesUnicos - prev.paisesUnicos) / prev.paisesUnicos) * 100 : 0 },
    { metric: 'Cortes', currentValue: cur.cortesUnicos, previousValue: prev.cortesUnicos, change: cur.cortesUnicos - prev.cortesUnicos, changeRate: prev.cortesUnicos > 0 ? ((cur.cortesUnicos - prev.cortesUnicos) / prev.cortesUnicos) * 100 : 0 },
  ];
  return results;
}
