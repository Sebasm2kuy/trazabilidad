// ============================================================
// AGGREGATORS — KPIs operacionales para el Centro de Inteligencia
// ------------------------------------------------------------
// Puros, sin dependencias de React. Tomán entidades de dominio
// y devuelven KPI[] listos para renderizar.
// ============================================================

import type { KPI, StockItem, Alert, Producer, ActivityEvent } from '@/domain/types';

const fmt = (n: number) => n.toLocaleString('es-UY');

export interface AggregatorContext {
  stock: StockItem[];
  productores: Producer[];
  alerts: Alert[];
  activity: ActivityEvent[];
  exportacionesPn: number;
  depositosPn: number;
  /** KPIs vs período anterior (opcional, para tendencia). */
  previous?: {
    exportacionesPn?: number;
    depositosPn?: number;
    stockPn?: number;
    productoresActivos?: number;
  };
}

function trend(current: number, previous?: number): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

/** KPIs principales para la fila 1 del Centro de Inteligencia. */
export function getMainKPIs(ctx: AggregatorContext): KPI[] {
  const stockPn = ctx.stock.reduce((s, x) => s + x.pesoNeto, 0);
  const stockEnvases = ctx.stock.reduce((s, x) => s + x.envases, 0);
  const productoresActivos = ctx.productores.filter(p => p.activo).length;
  const alertasCriticas = ctx.alerts.filter(a => a.priority === 'critica').length;

  return [
    {
      id: 'kpi-stock-pn',
      label: 'Stock Total',
      value: stockPn,
      unit: 'kg',
      trend: trend(stockPn, ctx.previous?.stockPn),
      trendLabel: 'vs período anterior',
      icon: 'Warehouse',
      color: 'blue',
      drillDown: { type: 'deposito' },
    },
    {
      id: 'kpi-stock-envases',
      label: 'Envases en Stock',
      value: stockEnvases,
      unit: 'count',
      icon: 'Package',
      color: 'slate',
    },
    {
      id: 'kpi-exportaciones-pn',
      label: 'Exportaciones',
      value: ctx.exportacionesPn,
      unit: 'kg',
      trend: trend(ctx.exportacionesPn, ctx.previous?.exportacionesPn),
      trendLabel: 'vs período anterior',
      icon: 'Ship',
      color: 'emerald',
      drillDown: { type: 'pais' },
    },
    {
      id: 'kpi-depositos-pn',
      label: 'Ingresos a Depósitos',
      value: ctx.depositosPn,
      unit: 'kg',
      trend: trend(ctx.depositosPn, ctx.previous?.depositosPn),
      trendLabel: 'vs período anterior',
      icon: 'Truck',
      color: 'violet',
      drillDown: { type: 'empresa' },
    },
    {
      id: 'kpi-productores-activos',
      label: 'Productores Activos',
      value: productoresActivos,
      unit: 'count',
      trend: trend(productoresActivos, ctx.previous?.productoresActivos),
      trendLabel: 'vs período anterior',
      icon: 'Users',
      color: 'amber',
      drillDown: { type: 'productor' },
    },
    {
      id: 'kpi-alertas-criticas',
      label: 'Alertas Críticas',
      value: alertasCriticas,
      unit: 'count',
      icon: 'AlertTriangle',
      color: alertasCriticas > 0 ? 'red' : 'emerald',
      drillDown: { type: 'cote' },
    },
  ];
}

/** Resumen textual del estado del negocio — para la cabecera del Centro. */
export function getOperationalSummary(ctx: AggregatorContext): string {
  const parts: string[] = [];
  const stockPn = ctx.stock.reduce((s, x) => s + x.pesoNeto, 0);
  parts.push(`${fmt(stockPn)} kg en stock`);
  parts.push(`${ctx.productores.filter(p => p.activo).length} productores activos`);
  const crit = ctx.alerts.filter(a => a.priority === 'critica').length;
  if (crit > 0) parts.push(`${crit} alerta${crit > 1 ? 's' : ''} crítica${crit > 1 ? 's' : ''}`);
  if (ctx.activity.length > 0) {
    parts.push(`${ctx.activity.length} eventos recientes`);
  }
  return parts.join(' • ');
}

/** Stock inmovilizado agregado por depósito. */
export function getStockInmovilizadoByDeposito(stock: StockItem[], thresholdDays = 90): { deposito: string; pn: number; count: number }[] {
  const map = new Map<string, { pn: number; count: number }>();
  for (const s of stock) {
    if (s.diasSinMovimiento <= thresholdDays) continue;
    if (!map.has(s.deposito)) map.set(s.deposito, { pn: 0, count: 0 });
    const e = map.get(s.deposito)!;
    e.pn += s.pesoNeto;
    e.count++;
  }
  return Array.from(map.entries())
    .map(([deposito, v]) => ({ deposito, ...v }))
    .sort((a, b) => b.pn - a.pn);
}

/** Stock por empresa/certificador. */
export function getStockByEmpresa(stock: StockItem[]): { empresa: string; pn: number; count: number }[] {
  const map = new Map<string, { pn: number; count: number }>();
  for (const s of stock) {
    const emp = s.deposito; // aproxima empresa = depósito
    if (!map.has(emp)) map.set(emp, { pn: 0, count: 0 });
    const e = map.get(emp)!;
    e.pn += s.pesoNeto;
    e.count++;
  }
  return Array.from(map.entries())
    .map(([empresa, v]) => ({ empresa, ...v }))
    .sort((a, b) => b.pn - a.pn)
    .slice(0, 10);
}
