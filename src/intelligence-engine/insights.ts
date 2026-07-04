// ============================================================
// INSIGHTS ENGINE — Conclusiones operacionales automáticas
// ------------------------------------------------------------
// Diferente del /intelligence/insights.ts existente (que es solo
// para mercado nacional). Este genera insights OPERACIONALES
// sobre el propio negocio: stock, depósitos, productores, etc.
// ============================================================

import type { StockItem, Alert, Producer, Insight, ActivityEvent } from '@/domain/types';
import { getStockInmovilizadoByDeposito, getStockByEmpresa } from './aggregators';

export interface InsightsContext {
  stock: StockItem[];
  productores: Producer[];
  alerts: Alert[];
  activity: ActivityEvent[];
}

/** Genera insights a partir del contexto operacional. */
export function generateOperationalInsights(ctx: InsightsContext): Insight[] {
  const insights: Insight[] = [];
  const totalStockPn = ctx.stock.reduce((s, x) => s + x.pesoNeto, 0) || 1;

  // 1. Stock inmovilizado — conclusión sobre concentración
  const inmovilizado = ctx.stock.filter(s => s.diasSinMovimiento > 90);
  if (inmovilizado.length > 0) {
    const pnInmovilizado = inmovilizado.reduce((s, x) => s + x.pesoNeto, 0);
    const pct = (pnInmovilizado / totalStockPn) * 100;
    insights.push({
      id: 'ins-inmovilizado',
      title: `${inmovilizado.length} COTEs inmovilizados representan el ${pct.toFixed(1)}% del stock`,
      description: `Hay ${pnInmovilizado.toLocaleString('es-UY')} kg sin movimiento por más de 90 días. El depósito con más inmovilizado es ${getStockInmovilizadoByDeposito(ctx.stock)[0]?.deposito || '—'}.`,
      severity: pct > 30 ? 'negative' : pct > 10 ? 'warning' : 'neutral',
      icon: pct > 30 ? 'AlertTriangle' : 'Clock',
      category: 'anomaly',
      value: pct,
    });
  }

  // 2. Productores inactivos
  const inactivos = ctx.productores.filter(p => !p.activo);
  if (inactivos.length > 0) {
    const pct = (inactivos.length / (ctx.productores.length || 1)) * 100;
    insights.push({
      id: 'ins-productores-inactivos',
      title: `${inactivos.length} productores sin actividad en 90 días (${pct.toFixed(0)}%)`,
      description: `Posibles bajas operativas o churn. Los 3 con más historial inactivo: ${inactivos.slice(0, 3).map(p => p.name).join(', ')}.`,
      severity: pct > 30 ? 'negative' : 'warning',
      icon: 'UserMinus',
      category: 'decline',
      value: inactivos.length,
    });
  }

  // 3. Concentración por empresa
  const byEmpresa = getStockByEmpresa(ctx.stock);
  if (byEmpresa.length > 0) {
    const top = byEmpresa[0];
    const pct = (top.pn / totalStockPn) * 100;
    if (pct > 50) {
      insights.push({
        id: 'ins-concentracion-empresa',
        title: `${top.empresa} concentra el ${pct.toFixed(1)}% del stock propio`,
        description: `Riesgo de dependencia operativa. Diversificar hacia otros depósitos reduciría el riesgo de un solo punto de falla.`,
        severity: pct > 70 ? 'warning' : 'neutral',
        icon: 'Building2',
        category: 'concentration',
        value: pct,
        entity: top.empresa,
      });
    }
  }

  // 4. Alertas críticas detectadas
  const criticas = ctx.alerts.filter(a => a.priority === 'critica');
  if (criticas.length > 0) {
    insights.push({
      id: 'ins-alertas-criticas',
      title: `${criticas.length} alerta${criticas.length > 1 ? 's' : ''} crítica${criticas.length > 1 ? 's' : ''} requieren atención inmediata`,
      description: criticas.slice(0, 3).map(a => `• ${a.title}`).join('\n'),
      severity: 'negative',
      icon: 'AlertOctagon',
      category: 'anomaly',
      value: criticas.length,
    });
  }

  // 5. Actividad reciente
  if (ctx.activity.length > 0) {
    const ultimas24h = ctx.activity.filter(a => {
      const diff = Date.now() - new Date(a.timestamp).getTime();
      return diff < 24 * 60 * 60 * 1000;
    });
    if (ultimas24h.length > 0) {
      const exp = ultimas24h.filter(a => a.type === 'exportacion').length;
      const dep = ultimas24h.filter(a => a.type === 'ingreso').length;
      insights.push({
        id: 'ins-actividad-24h',
        title: `${ultimas24h.length} movimientos en las últimas 24 horas`,
        description: `${dep} ingresos a depósito • ${exp} exportaciones. Actividad operativa sostenida.`,
        severity: 'positive',
        icon: 'Activity',
        category: 'milestone',
        value: ultimas24h.length,
      });
    } else {
      insights.push({
        id: 'ins-actividad-baja',
        title: 'Sin actividad en las últimas 24 horas',
        description: 'No se registraron movimientos recientes. Verificar ingesta de datos.',
        severity: 'neutral',
        icon: 'PauseCircle',
        category: 'warning',
      });
    }
  }

  // 6. Oportunidad: productor activo sin destino asignado
  const sinDestino = ctx.stock.filter(s => !s.tieneDestino && !s.tieneExportacion && s.diasSinMovimiento > 30 && s.diasSinMovimiento <= 90);
  if (sinDestino.length > 0) {
    const pnSinDestino = sinDestino.reduce((s, x) => s + x.pesoNeto, 0);
    insights.push({
      id: 'ins-op-sin-destino',
      title: `Oportunidad: ${pnSinDestino.toLocaleString('es-UY')} kg disponibles para exportación`,
      description: `${sinDestino.length} COTEs en stock sin destino ni exportación. Moverlos a venta directa o exportación liberaría capital inmovilizado.`,
      severity: 'opportunity',
      icon: 'Target',
      category: 'opportunity',
      value: pnSinDestino,
    });
  }

  return insights;
}
