'use client';

// ============================================================
// CommandCenter — Pantalla principal del Gemelo Digital
// ------------------------------------------------------------
// Combina: snapshot del gemelo + predicciones + riesgos + recomendaciones
// + acceso rápido a simulación y grafo.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Brain, GitBranch, TrendingUp, Target,
  Shield, Network, FlaskConical, Boxes, Ship, Users, Warehouse,
  Gauge, Zap, ArrowRight, RefreshCw, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  KPIWidget, InsightCard, AlertWidget, AlertList,
  TimelineWidget, RankingWidget, TrendWidget, QuickActionWidget,
  WidgetShell,
} from '@/widgets';
import type { QuickAction, RankingItem, TrendPoint } from '@/widgets';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import type { Shipment, ExpRecord } from '@/lib/types';
import {
  projectInitialState, applyEvents,
} from '@/digital-twin/projectors';
import { readEvents } from '@/digital-twin/eventStore';
import { assessAllRisks, portfolioRiskScore, detectSystemRisks, riskLevelDistribution } from '@/risk/engine';
import { generateRecommendations } from '@/decision/engine';
import { generatePredictions, predictWarehouseSaturation, getIngresosTimeSeries } from '@/prediction/engine';
import { buildRelationshipGraph, analyzeGraph } from '@/graph/engine';
import { useAppStore } from '@/store/useAppStore';
import { SimulationLab } from '@/components/simulation-lab/SimulationLab';
import { OperationalMap } from '@/components/operational-map/OperationalMap';

type View = 'overview' | 'simulation' | 'graph' | 'predictions' | 'risks';

export function CommandCenter() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('overview');
  const [tick, setTick] = useState(0);
  const [depositos, setDepositos] = useState<(Shipment | ExpRecord)[]>([]);
  const [exportaciones, setExportaciones] = useState<(Shipment | ExpRecord)[]>([]);
  const setActiveTab = useAppStore(s => s.setActiveTab);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadDepositos(), loadExportaciones()])
      .then(([deps, exps]) => {
        if (!mounted) return;
        setDepositos(deps);
        setExportaciones(exps);
      })
      .catch(e => console.error('[command-center] carga falló:', e))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [tick]);

  // Gemelo digital: snapshot base + eventos aplicados
  const snapshot = useMemo(() => {
    const base = projectInitialState(depositos, exportaciones);
    const events = readEvents();
    return applyEvents(base, events);
  }, [depositos, exportaciones, tick]);

  // Predicciones
  const predictions = useMemo(() => generatePredictions({ depositos, exportaciones }), [depositos, exportaciones]);

  // Riesgos
  const riskAssessments = useMemo(() => assessAllRisks(snapshot), [snapshot]);
  const systemRisks = useMemo(() => detectSystemRisks(snapshot), [snapshot]);
  const riskDist = useMemo(() => riskLevelDistribution(riskAssessments), [riskAssessments]);
  const portfolioRisk = useMemo(() => portfolioRiskScore(riskAssessments), [riskAssessments]);

  // Recomendaciones
  const recommendations = useMemo(() => generateRecommendations(snapshot, riskAssessments, predictions), [snapshot, riskAssessments, predictions]);

  // Grafo
  const graph = useMemo(() => buildRelationshipGraph(snapshot), [snapshot]);
  const graphStats = useMemo(() => analyzeGraph(graph), [graph]);

  // Predicción de saturación de depósitos
  const warehousePredictions = useMemo(() => {
    const series = getIngresosTimeSeries(depositos).slice(-12);
    return predictWarehouseSaturation(snapshot, series, 6);
  }, [snapshot, depositos]);

  // KPIs principales del Command Center
  const kpis = useMemo(() => {
    const stockPn = snapshot.kpis.totalStockPn;
    const expPn = snapshot.kpis.totalExportacionesPn;
    return [
      { id: 'k1', label: 'Stock Total', value: stockPn, unit: 'kg' as const, icon: 'Warehouse', color: 'blue' as const, drillDown: { type: 'deposito' as const } },
      { id: 'k2', label: 'Exportaciones', value: expPn, unit: 'kg' as const, icon: 'Ship', color: 'emerald' as const, drillDown: { type: 'pais' as const } },
      { id: 'k3', label: 'Productores Activos', value: snapshot.kpis.productoresActivos, unit: 'count' as const, icon: 'Users', color: 'amber' as const },
      { id: 'k4', label: 'Depósitos', value: snapshot.warehouses.length, unit: 'count' as const, icon: 'Boxes', color: 'violet' as const },
      { id: 'k5', label: 'Riesgo Portafolio', value: portfolioRisk, unit: 'count' as const, icon: 'Shield', color: portfolioRisk > 50 ? 'red' : portfolioRisk > 30 ? 'amber' : 'emerald' },
      { id: 'k6', label: 'Alertas Sistema', value: systemRisks.length, unit: 'count' as const, icon: 'AlertTriangle', color: systemRisks.length > 3 ? 'red' : 'slate' },
    ];
  }, [snapshot, portfolioRisk, systemRisks]);

  // Ranking de depósitos por riesgo
  const rankingWarehousesByRisk: RankingItem[] = useMemo(() => {
    return snapshot.warehouses
      .map(w => {
        const risk = riskAssessments.find(r => r.entityId === w.id);
        return {
          id: w.id,
          label: w.name,
          value: risk?.score || 0,
          subtitle: `${w.utilizacion.toFixed(0)}% utilización`,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [snapshot, riskAssessments]);

  // Ranking de predicciones de saturación
  const rankingSaturacion: RankingItem[] = useMemo(() => {
    return warehousePredictions
      .filter(w => w.diasParaSaturacion !== null)
      .sort((a, b) => (a.diasParaSaturacion || 999) - (b.diasParaSaturacion || 999))
      .slice(0, 8)
      .map(w => ({
        id: w.warehouseId,
        label: w.warehouseName,
        value: w.diasParaSaturacion || 0,
        subtitle: `${w.utilizacionPredicha.toFixed(0)}% en 6 meses`,
      }));
  }, [warehousePredictions]);

  // Trend de exportaciones proyectadas
  const expTrend: TrendPoint[] = useMemo(() => {
    const pred = predictions.find(p => p.metric === 'exportaciones_pn');
    return pred?.values.map(v => ({ label: v.label, value: v.value })) || [];
  }, [predictions]);

  // Insights automáticos
  const insights = useMemo(() => {
    const out: { id: string; title: string; description: string; severity: 'positive' | 'negative' | 'warning' | 'opportunity' | 'neutral'; icon: string }[] = [];
    if (systemRisks.length > 0) {
      out.push({
        id: 'ins-risks',
        title: `${systemRisks.length} riesgos sistémicos detectados`,
        description: systemRisks.slice(0, 3).map(r => `• ${r.description}`).join('\n'),
        severity: 'negative',
        icon: 'AlertTriangle',
      });
    }
    if (rankingSaturacion.length > 0) {
      const top = rankingSaturacion[0];
      out.push({
        id: 'ins-sat',
        title: `${top.label} se saturará en ~${top.value} días`,
        description: `Tendencia actual proyecta saturación. Considerar redistribuir stock o ampliar capacidad.`,
        severity: 'warning',
        icon: 'Gauge',
      });
    }
    const expPred = predictions.find(p => p.metric === 'exportaciones_pn');
    if (expPred && expPred.values.length > 0) {
      const last = expPred.values[expPred.values.length - 1];
      const first = expPred.values[0];
      const change = ((last.value / (first.value || 1)) - 1) * 100;
      out.push({
        id: 'ins-exp-pred',
        title: `Exportaciones proyectadas: ${change > 0 ? '+' : ''}${change.toFixed(1)}% en ${expPred.horizon} meses`,
        description: `Confianza: ${(expPred.confidence * 100).toFixed(0)}%. Método: regresión lineal.`,
        severity: change > 5 ? 'positive' : change < -5 ? 'negative' : 'neutral',
        icon: 'TrendingUp',
      });
    }
    if (graphStats.clusters.length > 0) {
      const biggest = graphStats.clusters[0];
      out.push({
        id: 'ins-graph',
        title: `Grafo: ${graphStats.totalNodes} entidades, ${graphStats.totalEdges} relaciones`,
        description: `Cluster dominante: ${biggest.size} entidades. Centralidad alta indica concentración.`,
        severity: 'neutral',
        icon: 'Network',
      });
    }
    if (portfolioRisk > 50) {
      out.push({
        id: 'ins-risk-portfolio',
        title: `Risk score del portafolio elevado: ${portfolioRisk.toFixed(0)}/100`,
        description: `Distribución: ${riskDist.critico} críticos, ${riskDist.alto} altos, ${riskDist.medio} medios, ${riskDist.bajo} bajos.`,
        severity: 'negative',
        icon: 'Shield',
      });
    }
    return out;
  }, [systemRisks, rankingSaturacion, predictions, graphStats, portfolioRisk, riskDist]);

  const quickActions: QuickAction[] = [
    { id: 'qa-sim', label: 'Simular Escenario', icon: FlaskConical, color: 'text-violet-600', onClick: () => setView('simulation') },
    { id: 'qa-graph', label: 'Grafo Operacional', icon: Network, color: 'text-blue-600', onClick: () => setView('graph') },
    { id: 'qa-pred', label: 'Predicciones', icon: TrendingUp, color: 'text-emerald-600', onClick: () => setView('predictions') },
    { id: 'qa-risk', label: 'Riesgos', icon: Shield, color: 'text-amber-600', onClick: () => setView('risks') },
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
        <p className="ml-3 text-sm text-slate-500">Construyendo gemelo digital…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 via-blue-500 to-emerald-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
                Command Center — Digital Twin
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {snapshot.lots.length} lotes • {snapshot.warehouses.length} depósitos • {snapshot.producers.length} productores
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <nav className="flex items-center gap-1">
            {(['overview', 'simulation', 'graph', 'predictions', 'risks'] as View[]).map(v => (
              <Button
                key={v}
                variant={view === v ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView(v)}
                className={cn('text-xs', view === v && 'bg-violet-600 hover:bg-violet-700')}
              >
                {v === 'overview' && <Activity className="w-3 h-3 mr-1" />}
                {v === 'simulation' && <FlaskConical className="w-3 h-3 mr-1" />}
                {v === 'graph' && <Network className="w-3 h-3 mr-1" />}
                {v === 'predictions' && <TrendingUp className="w-3 h-3 mr-1" />}
                {v === 'risks' && <Shield className="w-3 h-3 mr-1" />}
                {v === 'overview' ? 'Resumen' : v === 'simulation' ? 'Simulación' : v === 'graph' ? 'Grafo' : v === 'predictions' ? 'Predicción' : 'Riesgos'}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setTick(t => t + 1)} title="Refrescar">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </nav>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4 max-w-[1600px] mx-auto">
        {view === 'overview' && (
          <>
            {/* Resumen textual */}
            <Card className="p-3 bg-gradient-to-r from-violet-50 via-blue-50 to-emerald-50 dark:from-violet-950/30 dark:via-blue-950/30 dark:to-emerald-950/30 border-violet-200 dark:border-violet-900">
              <p className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-semibold">Estado del gemelo digital:</span>{' '}
                {snapshot.kpis.totalStockPn.toLocaleString('es-UY')} kg en stock •{' '}
                {snapshot.kpis.totalExportacionesPn.toLocaleString('es-UY')} kg exportados •{' '}
                <span className="text-amber-700 dark:text-amber-300 font-medium">{systemRisks.length} riesgos sistémicos</span>{' '}
                • <span className="text-violet-700 dark:text-violet-300 font-medium">Risk score {portfolioRisk.toFixed(0)}/100</span>
              </p>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {kpis.map(kpi => (
                <KPIWidget key={kpi.id} kpi={kpi} />
              ))}
            </div>

            {/* Fila principal: insights + alertas + recomendaciones */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <WidgetShell title="Insights del Gemelo" icon={Sparkles} subtitle={`${insights.length} conclusiones`}>
                <div className="space-y-2">
                  {insights.map(ins => (
                    <InsightCard key={ins.id} insight={ins as any} />
                  ))}
                </div>
              </WidgetShell>

              <WidgetShell title="Riesgos del Sistema" icon={Shield} subtitle={`${systemRisks.length} detectados`}>
                <div className="space-y-2">
                  {systemRisks.slice(0, 6).map(r => (
                    <div key={r.id} className={cn(
                      'rounded-lg border p-3',
                      r.severity === 'critico' && 'border-red-300 bg-red-50/50 dark:bg-red-950/20',
                      r.severity === 'alto' && 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20',
                      r.severity === 'medio' && 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20',
                      r.severity === 'bajo' && 'border-slate-200 bg-slate-50/50 dark:bg-slate-900/30',
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[9px] uppercase">{r.severity}</Badge>
                        <Badge variant="secondary" className="text-[9px]">{r.category.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200">{r.description}</p>
                    </div>
                  ))}
                </div>
              </WidgetShell>

              <WidgetShell title="Recomendaciones" icon={Target} subtitle={`${recommendations.length} acciones`}>
                <div className="space-y-2">
                  {recommendations.slice(0, 6).map(rec => (
                    <div
                      key={rec.id}
                      className={cn(
                        'rounded-lg border p-3',
                        rec.priority === 'critica' && 'border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20',
                        rec.priority === 'alta' && 'border-orange-300 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20',
                        rec.priority === 'media' && 'border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20',
                        rec.priority === 'baja' && 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30',
                      )}
                    >
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{rec.title}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{rec.description}</p>
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-violet-700 dark:text-violet-300 font-medium">
                        {rec.action} <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetShell>
            </div>

            {/* Fila secundaria: timeline + rankings + trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <WidgetShell title="Línea de Tiempo" icon={GitBranch} subtitle="Eventos recientes">
                <TimelineWidget
                  events={snapshot.timeline.slice(0, 30).map(t => ({
                    id: t.id,
                    type: t.type === 'mercaderia_ingresada' ? 'ingreso' as const
                       : t.type === 'nueva_exportacion' ? 'exportacion' as const
                       : t.type === 'cambio_deposito' ? 'transferencia' as const
                       : 'cambio_stock' as const,
                    description: t.description,
                    timestamp: t.timestamp,
                    entity: t.lotId ? { type: 'cote' as const, id: t.lotId, label: t.lotId } : undefined,
                  }))}
                  maxItems={15}
                />
              </WidgetShell>

              <WidgetShell title="Depósitos por Riesgo" icon={Shield}>
                <RankingWidget
                  items={rankingWarehousesByRisk}
                  formatValue={v => `${v.toFixed(0)}/100`}
                  barColor="bg-red-500"
                  maxItems={8}
                />
              </WidgetShell>

              <WidgetShell title="Depósitos a Saturarse" icon={Gauge} subtitle="Proyección a 6 meses">
                {rankingSaturacion.length > 0 ? (
                  <RankingWidget
                    items={rankingSaturacion}
                    formatValue={v => `${v.toFixed(0)} días`}
                    barColor="bg-amber-500"
                    maxItems={8}
                  />
                ) : (
                  <p className="text-xs text-center text-slate-500 py-6">Sin depósitos en riesgo de saturación.</p>
                )}
              </WidgetShell>
            </div>

            {/* Acciones rápidas */}
            <WidgetShell title="Acciones Rápidas" icon={Zap}>
              <QuickActionWidget actions={quickActions} columns={4} />
            </WidgetShell>
          </>
        )}

        {view === 'simulation' && (
          <SimulationLab snapshot={snapshot} />
        )}

        {view === 'graph' && (
          <OperationalMap snapshot={snapshot} />
        )}

        {view === 'predictions' && (
          <PredictionsView predictions={predictions} warehousePredictions={warehousePredictions} expTrend={expTrend} />
        )}

        {view === 'risks' && (
          <RisksView riskAssessments={riskAssessments} systemRisks={systemRisks} riskDist={riskDist} portfolioRisk={portfolioRisk} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-vistas
// ============================================================

function PredictionsView({ predictions, warehousePredictions, expTrend }: {
  predictions: import('@/digital-twin/types').Prediction[];
  warehousePredictions: import('@/prediction/engine').WarehousePrediction[];
  expTrend: TrendPoint[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WidgetShell title="Predicción de Exportaciones" icon={Ship} subtitle="Regresión lineal, 6 meses">
          {expTrend.length > 0 ? (
            <TrendWidget data={expTrend} color="#10b981" height={180} formatValue={v => `${(v / 1000).toFixed(1)} t`} />
          ) : (
            <p className="text-xs text-center text-slate-500 py-6">Datos insuficientes.</p>
          )}
        </WidgetShell>

        <WidgetShell title="Predicción de Ingresos" icon={Warehouse} subtitle="Regresión lineal, 6 meses">
          {(() => {
            const pred = predictions.find(p => p.metric === 'ingresos_pn');
            if (!pred) return <p className="text-xs text-center text-slate-500 py-6">Datos insuficientes.</p>;
            const data: TrendPoint[] = pred.values.map(v => ({ label: v.label, value: v.value }));
            return <TrendWidget data={data} color="#8b5cf6" height={180} formatValue={v => `${(v / 1000).toFixed(1)} t`} />;
          })()}
        </WidgetShell>
      </div>

      <WidgetShell title="Saturación Proyectada por Depósito" icon={Gauge} subtitle="6 meses">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2">Depósito</th>
                <th className="text-right">Stock actual (kg)</th>
                <th className="text-right">Stock predicho (kg)</th>
                <th className="text-right">Util. actual</th>
                <th className="text-right">Util. predicha</th>
                <th className="text-right">Días p/ saturación</th>
              </tr>
            </thead>
            <tbody>
              {warehousePredictions.map(w => (
                <tr key={w.warehouseId} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="py-2 font-medium text-slate-800 dark:text-slate-100">{w.warehouseName}</td>
                  <td className="text-right tabular-nums">{w.currentPn.toLocaleString('es-UY')}</td>
                  <td className="text-right tabular-nums">{w.predictedPn.toLocaleString('es-UY')}</td>
                  <td className="text-right tabular-nums">{w.utilizacionActual.toFixed(1)}%</td>
                  <td className="text-right tabular-nums">
                    <span className={cn(
                      'font-semibold',
                      w.utilizacionPredicha > 90 ? 'text-red-600' :
                      w.utilizacionPredicha > 75 ? 'text-amber-600' : 'text-emerald-600'
                    )}>
                      {w.utilizacionPredicha.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {w.diasParaSaturacion !== null ? (
                      <span className={w.diasParaSaturacion < 90 ? 'text-red-600 font-semibold' : ''}>
                        {w.diasParaSaturacion}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetShell>
    </div>
  );
}

function RisksView({ riskAssessments, systemRisks, riskDist, portfolioRisk }: {
  riskAssessments: any[];
  systemRisks: any[];
  riskDist: any;
  portfolioRisk: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase font-semibold text-slate-500">Risk Score Portfolio</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{portfolioRisk.toFixed(0)}</p>
          <p className="text-[10px] text-slate-400">/ 100</p>
        </Card>
        <Card className="p-3 bg-red-50/50 dark:bg-red-950/20">
          <p className="text-[10px] uppercase font-semibold text-red-600">Críticos</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{riskDist.critico}</p>
        </Card>
        <Card className="p-3 bg-orange-50/50 dark:bg-orange-950/20">
          <p className="text-[10px] uppercase font-semibold text-orange-600">Altos</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{riskDist.alto}</p>
        </Card>
        <Card className="p-3 bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-[10px] uppercase font-semibold text-amber-600">Medios</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{riskDist.medio}</p>
        </Card>
        <Card className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
          <p className="text-[10px] uppercase font-semibold text-emerald-600">Bajos</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{riskDist.bajo}</p>
        </Card>
      </div>

      <WidgetShell title="Riesgos Sistémicos" icon={Shield}>
        <div className="space-y-2">
          {systemRisks.map(r => (
            <div key={r.id} className={cn(
              'rounded-lg border p-3',
              r.severity === 'critico' && 'border-red-300 bg-red-50/50 dark:bg-red-950/20',
              r.severity === 'alto' && 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20',
              r.severity === 'medio' && 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20',
              r.severity === 'bajo' && 'border-slate-200 bg-slate-50/50 dark:bg-slate-900/30',
            )}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[9px] uppercase">{r.severity}</Badge>
                <Badge variant="secondary" className="text-[9px]">{r.category.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200">{r.description}</p>
              {r.affectedEntities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.affectedEntities.slice(0, 8).map((e: any) => (
                    <Badge key={e.id} variant="outline" className="text-[9px]">{e.name}</Badge>
                  ))}
                  {r.affectedEntities.length > 8 && (
                    <span className="text-[10px] text-slate-500">+{r.affectedEntities.length - 8} más</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </WidgetShell>

      <WidgetShell title="Top 20 Entidades por Riesgo" icon={AlertTriangle}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2">Entidad</th>
                <th>Tipo</th>
                <th className="text-right">Score</th>
                <th>Nivel</th>
                <th>Factores principales</th>
              </tr>
            </thead>
            <tbody>
              {riskAssessments.slice(0, 20).map(r => (
                <tr key={`${r.entityType}-${r.entityId}`} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="py-2 font-medium text-slate-800 dark:text-slate-100 truncate max-w-[200px]">{r.entityName}</td>
                  <td className="text-slate-500">{r.entityType}</td>
                  <td className="text-right tabular-nums font-semibold">{r.score.toFixed(0)}</td>
                  <td>
                    <Badge variant="outline" className={cn(
                      'text-[9px]',
                      r.level === 'critico' && 'border-red-300 text-red-700',
                      r.level === 'alto' && 'border-orange-300 text-orange-700',
                      r.level === 'medio' && 'border-amber-300 text-amber-700',
                      r.level === 'bajo' && 'border-emerald-300 text-emerald-700',
                    )}>{r.level}</Badge>
                  </td>
                  <td className="text-slate-500 truncate max-w-[280px]">
                    {r.factors.filter((f: any) => f.value > 30).map((f: any) => f.label).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetShell>
    </div>
  );
}
