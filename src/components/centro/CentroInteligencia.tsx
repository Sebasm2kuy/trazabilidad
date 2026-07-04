'use client';

// ============================================================
// CentroInteligencia — Página principal del Centro de Inteligencia
// ------------------------------------------------------------
// Reemplaza al Dashboard como pantalla inicial. Muestra:
//   - Buscador universal + estado del negocio
//   - KPIs principales
//   - Alertas críticas
//   - Insights automáticos
//   - Actividad reciente
//   - Rankings
//   - Acciones rápidas
//   - Recomendaciones
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Sparkles, TrendingUp, Settings2,
  RefreshCw, Bell, ArrowRight, Zap, Target, ClipboardCheck,
  Building2, ShieldAlert, Lightbulb, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  KPIWidget, InsightCard, AlertWidget, AlertList,
  TimelineWidget, RankingWidget, TrendWidget, QuickActionWidget,
  WidgetShell,
} from '@/widgets';
import type { QuickAction } from '@/widgets';
import type { RankingItem } from '@/widgets';
import type { TrendPoint } from '@/widgets';
import {
  Alert as AlertType, Recommendation, ActivityEvent,
} from '@/domain/types';
import {
  buildStockItems, buildProducers, buildActivityEvents,
} from '@/domain/adapters';
import {
  runRules, getMainKPIs, generateOperationalInsights,
  getStockByEmpresa, getStockInmovilizadoByDeposito,
} from '@/intelligence-engine';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import { useCentroPreferences } from '@/store/useCentroPreferences';
import { useAppStore } from '@/store/useAppStore';
import { useEntityDrawer } from '@/store/useEntityDrawer';
import { UniversalSearch } from './UniversalSearch';
import { EntityDrawer } from './EntityDrawer';
import type { Shipment, ExpRecord } from '@/lib/types';

export function CentroInteligencia() {
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // refresca cómputos

  const widgets = useCentroPreferences(s => s.widgets);
  const toggleWidget = useCentroPreferences(s => s.toggleWidget);
  const moveWidget = useCentroPreferences(s => s.moveWidget);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const openDrawer = useEntityDrawer(s => s.openDrawer);

  // Carga de datos
  const [depositos, setDepositos] = useState<(Shipment | ExpRecord)[]>([]);
  const [exportaciones, setExportaciones] = useState<(Shipment | ExpRecord)[]>([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadDepositos(), loadExportaciones()])
      .then(([deps, exps]) => {
        if (!mounted) return;
        setDepositos(deps);
        setExportaciones(exps);
      })
      .catch((e) => console.error('[centro] carga falló:', e))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [tick]);

  // Cómputos de dominio
  const stock = useMemo(() => buildStockItems(depositos, exportaciones), [depositos, exportaciones]);
  const productores = useMemo(() => buildProducers(depositos), [depositos]);
  const alerts = useMemo(() => runRules({ stock, productores, depositos: [] }), [stock, productores]);
  const activity = useMemo(() => buildActivityEvents(depositos, exportaciones, 30), [depositos, exportaciones]);
  const insights = useMemo(() => generateOperationalInsights({ stock, productores, alerts, activity }), [stock, productores, alerts, activity]);
  const kpis = useMemo(() => getMainKPIs({
    stock, productores, alerts, activity,
    exportacionesPn: exportaciones.reduce((s, r) => s + (r.pesoNeto || 0), 0),
    depositosPn: depositos.reduce((s, r) => s + (r.pesoNeto || 0), 0),
  }), [stock, productores, alerts, activity, exportaciones, depositos]);

  // Rankings
  const rankingEmpresas: RankingItem[] = useMemo(() => {
    return getStockByEmpresa(stock).map(e => ({
      id: e.empresa, label: e.empresa, value: e.pn, subtitle: `${e.count} COTEs`,
    }));
  }, [stock]);

  const rankingInmovilizado: RankingItem[] = useMemo(() => {
    return getStockInmovilizadoByDeposito(stock).map(d => ({
      id: d.deposito, label: d.deposito, value: d.pn, subtitle: `${d.count} COTEs`,
    }));
  }, [stock]);

  // Trend: serie mensual de ingresos (placeholder simple basado en fechas)
  const trendData: TrendPoint[] = useMemo(() => {
    const months: Record<string, number> = {};
    for (const r of depositos) {
      if (!r.fechaTramite) continue;
      const m = String(r.fechaTramite).substring(0, 7);
      if (m.length !== 7) continue;
      months[m] = (months[m] || 0) + (r.pesoNeto || 0);
    }
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([m, v]) => ({
      label: m, value: v,
    }));
  }, [depositos]);

  // Recomendaciones
  const recommendations: Recommendation[] = useMemo(() => {
    const recs: Recommendation[] = [];
    const crit = alerts.filter(a => a.priority === 'critica').length;
    if (crit > 0) {
      recs.push({
        id: 'rec-crit',
        title: 'Atender alertas críticas',
        description: `${crit} alerta(s) crítica(s) detectada(s). Revisar mercadería retenida o stock inmovilizado.`,
        priority: 'critica', action: 'Abrir Centro de Alertas', icon: 'ShieldAlert',
      });
    }
    const inmov = stock.filter(s => s.diasSinMovimiento > 90);
    if (inmov.length > 0) {
      recs.push({
        id: 'rec-inmov',
        title: 'Auditar stock inmovilizado',
        description: `${inmov.length} COTEs sin movimiento por más de 90 días. Liberar o reasignar.`,
        priority: 'alta', action: 'Ver ranking de inmovilizado', icon: 'ClipboardCheck',
      });
    }
    const inactivos = productores.filter(p => !p.activo);
    if (inactivos.length > 0) {
      recs.push({
        id: 'rec-prod',
        title: 'Reactivar productores inactivos',
        description: `${inactivos.length} productores sin actividad en 90 días. Contactar comercial.`,
        priority: 'media', action: 'Ver productores', icon: 'Target',
      });
    }
    recs.push({
      id: 'rec-bench',
      title: 'Benchmark mensual vs top 3 competidores',
      description: 'Comparar share, diversificación geográfica y cartera de cortes.',
      priority: 'baja', action: 'Abrir Mercado Nacional', icon: 'Lightbulb',
    });
    return recs;
  }, [alerts, stock, productores]);

  // Quick actions
  const quickActions: QuickAction[] = [
    { id: 'qa-import', label: 'Importar Excel', icon: Layers, color: 'text-blue-600', onClick: () => setActiveTab('importar') },
    { id: 'qa-new',    label: 'Nuevo Registro', icon: Zap,    color: 'text-emerald-600', onClick: () => setActiveTab('nuevo') },
    { id: 'qa-trace',  label: 'Trazabilidad',   icon: TrendingUp, color: 'text-violet-600', onClick: () => setActiveTab('trazabilidad-explorer') },
    { id: 'qa-merc',   label: 'Mercado Nac.',   icon: Building2,  color: 'text-amber-600', onClick: () => setActiveTab('mercado-nacional') },
  ];

  const isWidgetVisible = (id: string) => widgets.find(w => w.id === id)?.visible ?? false;
  const widgetOrder = (id: string) => widgets.find(w => w.id === id)?.order ?? 99;
  const sortedWidgetIds = [...widgets].sort((a, b) => a.order - b.order).map(w => w.id);

  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
                Centro de Inteligencia
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {depositos.length + exportaciones.length} registros • {alerts.length} alertas activas
              </p>
            </div>
          </div>
          <div className="flex-1 max-w-2xl">
            <UniversalSearch />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => setTick(t => t + 1)}
              className="text-slate-600 dark:text-slate-300"
              title="Refrescar"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowSettings(s => !s)}
              className="text-slate-600 dark:text-slate-300"
              title="Personalizar widgets"
            >
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="text-slate-600 dark:text-slate-300 relative"
              title="Alertas"
              onClick={() => toggleWidget('alerts')}
            >
              <Bell className="w-4 h-4" />
              {alerts.filter(a => a.priority === 'critica').length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </Button>
          </div>
        </div>

        {/* Panel de personalización */}
        {showSettings && (
          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300">Widgets visibles</p>
              <Button
                variant="ghost" size="sm"
                onClick={() => useCentroPreferences.getState().reset()}
                className="text-[10px] h-6 px-2"
              >Restablecer</Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {sortedWidgetIds.map(id => {
                const w = widgets.find(x => x.id === id)!;
                const labels: Record<string, string> = {
                  'kpi-row': 'KPIs',
                  'alerts': 'Alertas',
                  'insights': 'Insights',
                  'activity': 'Actividad',
                  'stock-rankings': 'Rankings',
                  'stock-by-empresa': 'Stock x Empresa',
                  'trends': 'Tendencias',
                  'quick-actions': 'Acciones',
                  'recommendations': 'Recomendaciones',
                };
                return (
                  <button
                    key={id}
                    onClick={() => toggleWidget(id)}
                    className={cn(
                      'text-[11px] px-2 py-1.5 rounded border transition-colors flex items-center gap-1',
                      w.visible
                        ? 'bg-violet-100 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', w.visible ? 'bg-violet-500' : 'bg-slate-400')} />
                    {labels[id] || id}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CONTENIDO */}
      <div className="px-6 py-5 space-y-4 max-w-[1600px] mx-auto">
        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-slate-400" />
            <p className="mt-3 text-sm text-slate-500">Cargando inteligencia operacional…</p>
          </div>
        )}

        {!loading && (
          <>
            {/* Resumen textual */}
            <Card className="p-3 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-violet-200 dark:border-violet-900">
              <p className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-semibold">Estado actual:</span>{' '}
                {depositos.length} ingresos • {exportaciones.length} exportaciones •{' '}
                {productores.length} productores • {alerts.length} alertas activas •{' '}
                <span className="text-violet-700 dark:text-violet-300 font-medium">
                  {alerts.filter(a => a.priority === 'critica').length} críticas
                </span>
              </p>
            </Card>

            {/* Fila 1: KPIs */}
            {isWidgetVisible('kpi-row') && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {kpis.map(kpi => (
                  <KPIWidget
                    key={kpi.id}
                    kpi={kpi}
                    onClick={kpi.drillDown ? () => openDrawer(kpi.drillDown!.type, kpi.drillDown!.id || '') : undefined}
                  />
                ))}
              </div>
            )}

            {/* Fila 2: Alertas + Insights + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {isWidgetVisible('alerts') && (
                <WidgetShell
                  id="alerts-widget"
                  title="Centro de Alertas"
                  icon={AlertTriangle}
                  subtitle={`${alerts.length} alertas activas`}
                  onRemove={() => toggleWidget('alerts')}
                >
                  <AlertList
                    alerts={alerts}
                    onSelect={(a) => a.entity && openDrawer(a.entity.type, a.entity.id)}
                    maxPerPriority={4}
                  />
                </WidgetShell>
              )}

              {isWidgetVisible('insights') && (
                <WidgetShell
                  id="insights-widget"
                  title="Insights Automáticos"
                  icon={Sparkles}
                  subtitle={`${insights.length} conclusiones`}
                  onRemove={() => toggleWidget('insights')}
                >
                  <div className="space-y-2">
                    {insights.slice(0, 5).map(ins => (
                      <InsightCard key={ins.id} insight={ins} />
                    ))}
                  </div>
                </WidgetShell>
              )}

              {isWidgetVisible('activity') && (
                <WidgetShell
                  id="activity-widget"
                  title="Actividad Reciente"
                  icon={Activity}
                  subtitle="Últimos movimientos"
                  onRemove={() => toggleWidget('activity')}
                >
                  <TimelineWidget events={activity} maxItems={15} />
                </WidgetShell>
              )}
            </div>

            {/* Fila 3: Rankings + Stock por empresa */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isWidgetVisible('stock-rankings') && (
                <WidgetShell
                  id="stock-rankings-widget"
                  title="Stock Inmovilizado por Depósito"
                  icon={AlertTriangle}
                  subtitle="COTEs > 90 días sin movimiento"
                  onRemove={() => toggleWidget('stock-rankings')}
                >
                  <RankingWidget
                    items={rankingInmovilizado}
                    formatValue={(v) => `${(v / 1000).toFixed(1)} t`}
                    barColor="bg-red-500"
                    emptyLabel="No hay stock inmovilizado 🎉"
                    maxItems={8}
                  />
                </WidgetShell>
              )}

              {isWidgetVisible('stock-by-empresa') && (
                <WidgetShell
                  id="stock-by-empresa-widget"
                  title="Stock por Empresa / Depósito"
                  icon={Building2}
                  subtitle="Top 10 empresas por peso neto en stock"
                  onRemove={() => toggleWidget('stock-by-empresa')}
                >
                  <RankingWidget
                    items={rankingEmpresas}
                    formatValue={(v) => `${(v / 1000).toFixed(1)} t`}
                    barColor="bg-blue-500"
                    onSelect={(item) => openDrawer('empresa', item.id)}
                    maxItems={10}
                  />
                </WidgetShell>
              )}
            </div>

            {/* Fila 4: Trends + Quick Actions + Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {isWidgetVisible('trends') && (
                <WidgetShell
                  id="trends-widget"
                  title="Tendencia Mensual"
                  icon={TrendingUp}
                  subtitle="Ingresos a depósitos (últimos 12 meses)"
                  onRemove={() => toggleWidget('trends')}
                >
                  <TrendWidget
                    data={trendData}
                    color="#8b5cf6"
                    height={120}
                    formatValue={(v) => `${(v / 1000).toFixed(1)} t`}
                  />
                </WidgetShell>
              )}

              {isWidgetVisible('quick-actions') && (
                <WidgetShell
                  id="quick-actions-widget"
                  title="Acciones Rápidas"
                  icon={Zap}
                  onRemove={() => toggleWidget('quick-actions')}
                >
                  <QuickActionWidget actions={quickActions} columns={2} />
                </WidgetShell>
              )}

              {isWidgetVisible('recommendations') && (
                <WidgetShell
                  id="recommendations-widget"
                  title="Panel de Decisiones"
                  icon={Target}
                  subtitle="Recomendaciones priorizadas"
                  onRemove={() => toggleWidget('recommendations')}
                >
                  <div className="space-y-2">
                    {recommendations.map(rec => (
                      <div
                        key={rec.id}
                        className={cn(
                          'rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-all',
                          rec.priority === 'critica' && 'border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20',
                          rec.priority === 'alta' && 'border-orange-300 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20',
                          rec.priority === 'media' && 'border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20',
                          rec.priority === 'baja' && 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Target className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{rec.title}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{rec.description}</p>
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-violet-700 dark:text-violet-300 font-medium">
                              {rec.action} <ArrowRight className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </WidgetShell>
              )}
            </div>

            {/* Estado vacío si no hay widgets visibles */}
            {!widgets.some(w => w.visible) && (
              <Card className="p-10 text-center">
                <Settings2 className="w-10 h-10 mx-auto text-slate-400" />
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  No hay widgets visibles. Activa algunos desde el botón <Settings2 className="w-3 h-3 inline" /> de la cabecera.
                </p>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Drawer global de drill-down */}
      <EntityDrawer />
    </div>
  );
}
