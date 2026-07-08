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
import type { StockPallet, StockLoad } from '@/lib/parseStockXls';

const DAY_MS = 1000 * 60 * 60 * 24;

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
  const [stockPallets, setStockPallets] = useState<StockPallet[]>([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadDepositos(), loadExportaciones()])
      .then(([deps, exps]) => {
        if (!mounted) return;
        // FILTRAR: solo registros donde CALIRAL aparece como certificador o destino
        const isCaliral = (r: Shipment | ExpRecord): boolean => {
          const cf = String(r.nombreEstablecimientoCertif || '').toUpperCase();
          const ed = String(r.nombreEstablecimientoDestino || '').toUpperCase();
          return cf.includes('CALIRAL') || ed.includes('CALIRAL');
        };
        setDepositos(deps.filter(isCaliral));
        setExportaciones(exps.filter(isCaliral));

        // Leer stock de pallets desde localStorage (mismo lugar que Cruces Frimaral)
        try {
          const raw = localStorage.getItem('trazabilidad_stock_data');
          if (raw) {
            const load: StockLoad = JSON.parse(raw);
            setStockPallets(load.pallets || []);
          }
        } catch { /* noop */ }
      })
      .catch((e) => console.error('[centro] carga falló:', e))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [tick]);

  // --- Cálculos operativos basados en STOCK REAL de pallets ---
  const stockTotalKg = useMemo(() => stockPallets.reduce((s, p) => s + (p.kilos || 0), 0), [stockPallets]);
  const stockTotalCajas = useMemo(() => stockPallets.reduce((s, p) => s + (p.cajas || 0), 0), [stockPallets]);
  const stockCotes = useMemo(() => {
    const set = new Set<string>();
    for (const p of stockPallets) {
      if (p.codigo) set.add(p.codigo);
    }
    return Array.from(set);
  }, [stockPallets]);

  const retenidaPallets = useMemo(() => stockPallets.filter(p => {
    const c = (p.contenido || '').toUpperCase();
    return c.includes('RETENIDO');
  }), [stockPallets]);
  const retenidaPn = retenidaPallets.reduce((s, p) => s + (p.kilos || 0), 0);

  const mayor180Pallets = useMemo(() => stockPallets.filter(p => {
    if (!p.fechaComision) return false;
    const d = new Date(p.fechaComision);
    if (isNaN(d.getTime())) return false;
    return Math.floor((Date.now() - d.getTime()) / DAY_MS) > 180;
  }), [stockPallets]);
  const mayor180Pn = mayor180Pallets.reduce((s, p) => s + (p.kilos || 0), 0);

  const sinDocPallets = useMemo(() => stockPallets.filter(p => !p.codigo || p.codigoTipo === 'NINGUNO'), [stockPallets]);

  // KPIs principales basados en stock de pallets
  const kpis = useMemo(() => {
    return [
      { id: 'k1', label: 'Stock Total', value: stockTotalKg, unit: 'kg' as const, icon: 'Warehouse', color: 'blue' as const, drillDown: { type: 'deposito' as const } },
      { id: 'k2', label: 'Exportaciones', value: exportaciones.reduce((s, r) => s + (r.pesoNeto || 0), 0), unit: 'kg' as const, icon: 'Ship', color: 'emerald' as const, drillDown: { type: 'pais' as const } },
      { id: 'k3', label: 'Productores Activos', value: new Set(depositos.map(r => r.nombreEstablecimientoProd).filter(Boolean)).size, unit: 'count' as const, icon: 'Users', color: 'amber' as const },
      { id: 'k4', label: 'COTEs en Stock', value: stockCotes.length, unit: 'count' as const, icon: 'Boxes', color: 'violet' as const },
      { id: 'k5', label: 'Mercadería >180 días', value: mayor180Pn, unit: 'kg' as const, icon: 'Clock', color: mayor180Pn > 0 ? 'red' as const : 'emerald' as const },
      { id: 'k6', label: 'Alertas', value: retenidaPallets.length + mayor180Pallets.length, unit: 'count' as const, icon: 'AlertTriangle', color: (retenidaPallets.length + mayor180Pallets.length) > 0 ? 'red' as const : 'emerald' as const },
    ];
  }, [stockTotalKg, exportaciones, depositos, stockCotes, mayor180Pn, retenidaPallets, mayor180Pallets]);

  // Insights basados en stock real
  const insights = useMemo(() => {
    const out: { id: string; title: string; description: string; severity: 'positive' | 'negative' | 'warning' | 'opportunity' | 'neutral'; icon: string }[] = [];
    if (stockPallets.length === 0) {
      out.push({ id: 'ins-empty', title: 'Sin stock cargado', description: 'Subí el Excel de pallets desde Cruces Frimaral o Trazabilidad para ver métricas reales.', severity: 'warning', icon: 'AlertTriangle' });
      return out;
    }
    out.push({ id: 'ins-stock', title: `${stockCotes.length} COTEs en stock`, description: `${(stockTotalKg / 1000).toFixed(1)} t en ${stockPallets.length} pallets. ${stockTotalCajas.toLocaleString('es-UY')} cajas totales.`, severity: 'neutral', icon: 'Warehouse' });
    if (retenidaPallets.length > 0) {
      out.push({ id: 'ins-retenida', title: `${retenidaPallets.length} pallets retenidos`, description: `${(retenidaPn / 1000).toFixed(1)} t retenidos. Requiere atención inmediata.`, severity: 'negative', icon: 'AlertTriangle' });
    }
    if (mayor180Pallets.length > 0) {
      out.push({ id: 'ins-180', title: `${mayor180Pallets.length} pallets >180 días`, description: `${(mayor180Pn / 1000).toFixed(1)} t sin movimiento por más de 180 días. Stock inmovilizado.`, severity: 'warning', icon: 'Clock' });
    }
    if (sinDocPallets.length > 0) {
      out.push({ id: 'ins-sindoc', title: `${sinDocPallets.length} pallets sin COTE`, description: 'Pallets sin código COTE o Pase Sanitario identificado.', severity: 'warning', icon: 'FileText' });
    }
    const expPn = exportaciones.reduce((s, r) => s + (r.pesoNeto || 0), 0);
    if (expPn > 0) {
      out.push({ id: 'ins-exp', title: `Exportaciones: ${(expPn / 1000).toFixed(1)} t`, description: `${exportaciones.length} registros de exportación con CALIRAL como certificador o depósito.`, severity: 'positive', icon: 'Ship' });
    }
    return out;
  }, [stockPallets, stockCotes, stockTotalKg, stockTotalCajas, retenidaPallets, retenidaPn, mayor180Pallets, mayor180Pn, sinDocPallets, exportaciones]);

  // Alertas basadas en pallets (formato compatible con AlertWidget)
  const alerts = useMemo(() => {
    const out: any[] = [];
    for (const p of retenidaPallets.slice(0, 5)) {
      out.push({ id: `ret-${p.id}`, category: 'mercaderia_retenida', priority: 'critica', title: `Retenido: ${p.codigo || 'sin COTE'}`, description: `${p.contenido?.substring(0, 60)} • ${(p.kilos / 1000).toFixed(1)} t`, entity: { type: 'cote', id: p.codigo || p.id, label: p.codigo || 'sin COTE' }, detectedAt: new Date().toISOString() });
    }
    for (const p of mayor180Pallets.slice(0, 5)) {
      out.push({ id: `180-${p.id}`, category: 'stock_inmovilizado', priority: 'alta', title: `Inmovilizado: ${p.codigo || 'sin COTE'}`, description: `${p.contenido?.substring(0, 60)} • ${(p.kilos / 1000).toFixed(1)} t`, entity: { type: 'cote', id: p.codigo || p.id, label: p.codigo || 'sin COTE' }, detectedAt: new Date().toISOString() });
    }
    return out;
  }, [retenidaPallets, mayor180Pallets]);

  // Timeline de actividad
  const activity = useMemo(() => {
    return [...depositos, ...exportaciones]
      .map(r => {
        const rec = r as unknown as Record<string, string | number | null | undefined>;
        return {
          id: String(r.id || Math.random()),
          type: rec.tipo === 'EXPORTACION' ? 'exportacion' as const : 'ingreso' as const,
          description: `${rec.nombreEstablecimientoCertif || '—'} → ${rec.nombreEstablecimientoDestino || r.paisDestino || '—'}`,
          timestamp: r.fechaTramite || new Date().toISOString(),
          entity: r.nroCote ? { type: 'cote' as const, id: r.nroCote, label: r.nroCote } : undefined,
          meta: { pn: r.pesoNeto || 0 },
        };
      })
      .filter(m => m.timestamp)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 30);
  }, [depositos, exportaciones]);

  // Rankings
  const rankingEmpresas: RankingItem[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of stockPallets) {
      const dep = p.contenido?.split(' - ')[0]?.substring(0, 40) || 'Sin producto';
      map.set(dep, (map.get(dep) || 0) + (p.kilos || 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ id: label, label, value, subtitle: `${(value / 1000).toFixed(1)} t` }));
  }, [stockPallets]);

  const rankingInmovilizado: RankingItem[] = useMemo(() => {
    const map = new Map<string, { pn: number; count: number }>();
    for (const p of mayor180Pallets) {
      const dep = p.codigo || 'Sin COTE';
      if (!map.has(dep)) map.set(dep, { pn: 0, count: 0 });
      const e = map.get(dep)!;
      e.pn += p.kilos || 0;
      e.count++;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].pn - a[1].pn)
      .slice(0, 8)
      .map(([label, v]) => ({ id: label, label, value: v.pn, subtitle: `${v.count} pallets` }));
  }, [mayor180Pallets]);

  // Trend: serie mensual de ingresos
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
    const inmov = mayor180Pallets;
    if (inmov.length > 0) {
      recs.push({
        id: 'rec-inmov',
        title: 'Auditar stock inmovilizado',
        description: `${inmov.length} pallets sin movimiento por más de 180 días. Liberar o reasignar.`,
        priority: 'alta', action: 'Ver ranking de inmovilizado', icon: 'ClipboardCheck',
      });
    }
    const productoresActivos = new Set(depositos.map(r => r.nombreEstablecimientoProd).filter(Boolean));
    if (productoresActivos.size > 0 && productoresActivos.size < 5) {
      recs.push({
        id: 'rec-prod',
        title: 'Diversificar productores',
        description: `Solo ${productoresActivos.size} productor(es) activo(s). Considerar captar más.`,
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
  }, [alerts, mayor180Pallets, depositos]);

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
                {stockPallets.length > 0
                  ? `${stockCotes.length} COTEs en stock • ${stockPallets.length} pallets • ${alerts.length} alerta(s)`
                  : 'Sin stock cargado. Subí el Excel de pallets en Cruces Frimaral.'}
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
                    onClick={kpi.drillDown ? () => openDrawer(kpi.drillDown!.type, '') : undefined}
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
