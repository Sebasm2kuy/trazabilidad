'use client';
// ============================================================
// Hallazgos — Motor de inteligencia de alto valor
// ------------------------------------------------------------
// NO lista cambios. EXPLICA por qué pasan, qué impacto tienen
// y qué debería hacer el gerente.
//
// Cada hallazgo tiene:
//   1. Título
//   2. Resumen ejecutivo
//   3. Evidencia (datos concretos)
//   4. Explicación (por qué pasó)
//   5. Impacto (Muy Alto/Alto/Medio/Bajo + toneladas + USD)
//   6. Nivel de prioridad
//   7. Recomendación accionable
// ============================================================

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Brain, Loader2, TrendingDown, TrendingUp, AlertTriangle, Target, Zap, Activity } from 'lucide-react';
import { loadNacionalRecords } from '@/lib/nacionalLoader';
import { NacionalUploadButton } from '@/components/nacional-upload/NacionalUploadButton';
import { generateDeepInsights, type DeepInsight, type ImpactLevel } from '@/intelligence-engine/deepInsights';
import { cn } from '@/lib/utils';
import type { MovRecord } from '@/intelligence/types';

const PERIOD_PRESETS = [
  { label: 'Q1 26 vs Q2 26', p1: { start: '2026-01-01', end: '2026-03-31' }, p2: { start: '2026-04-01', end: '2026-06-30' } },
  { label: '2025 vs 2026', p1: { start: '2025-01-01', end: '2025-12-31' }, p2: { start: '2026-01-01', end: '2026-12-31' } },
  { label: 'H1 26 vs H2 26', p1: { start: '2026-01-01', end: '2026-06-30' }, p2: { start: '2026-07-01', end: '2026-12-31' } },
];

const IMPACT_CONFIG: Record<ImpactLevel, { color: string; bg: string; border: string; label: string }> = {
  muy_alto: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-300 dark:border-red-900', label: 'Muy Alto' },
  alto: { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-300 dark:border-amber-900', label: 'Alto' },
  medio: { color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-300 dark:border-blue-900', label: 'Medio' },
  bajo: { color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900/30', border: 'border-slate-300 dark:border-slate-700', label: 'Bajo' },
};

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  concentracion_perdida: TrendingDown,
  concentracion_crecimiento: TrendingUp,
  cambio_estructural: Activity,
  causa_efecto: Brain,
  dependencia: AlertTriangle,
  oportunidad: Target,
  anomalia: AlertTriangle,
  predictivo: Zap,
  comparativo: Activity,
};

export default function Hallazgos() {
  const [records, setRecords] = useState<MovRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [period1, setPeriod1] = useState({ start: '2026-01-01', end: '2026-03-31' });
  const [period2, setPeriod2] = useState({ start: '2026-04-01', end: '2026-06-30' });
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'congelado' | 'fresco'>('todos');

  const loadRecords = useCallback(async () => {
    if (recordsLoaded) return;
    try {
      const recs = await loadNacionalRecords();
      setRecords(recs);
      setRecordsLoaded(true);
    } catch (err) { console.error('Error loading records:', err); }
    setLoading(false);
  }, [recordsLoaded]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const filterByPeriod = useCallback((recs: MovRecord[], start: string, end: string) => {
    return recs.filter(r => {
      if (r.f < start || r.f > end) return false;
      if (tipoFilter !== 'todos') {
        const target = tipoFilter === 'congelado' ? 'Congelado' : 'Fresco';
        if (r.tpd !== target) return false;
      }
      return true;
    });
  }, [tipoFilter]);

  const p1Records = useMemo(() => filterByPeriod(records, period1.start, period1.end), [records, period1, filterByPeriod]);
  const p2Records = useMemo(() => filterByPeriod(records, period2.start, period2.end), [records, period2, filterByPeriod]);

  const result = useMemo(() => {
    if (p1Records.length === 0 && p2Records.length === 0) return null;
    const p1Label = `${period1.start} → ${period1.end}`;
    const p2Label = `${period2.start} → ${period2.end}`;
    return generateDeepInsights(p1Records, p2Records, p1Label, p2Label);
  }, [p1Records, p2Records, period1, period2]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">🧠 Hallazgos</h2>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-violet-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Hallazgos</h2>
            <p className="text-xs text-slate-500">Inteligencia de alto valor — explica, no describe</p>
          </div>
        </div>
        <NacionalUploadButton />
      </div>

      {/* Filtros de período */}
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Período 1 (base)</span>
            <input type="date" name="hallazgos-p1-start" value={period1.start} onChange={e => setPeriod1(prev => ({ ...prev, start: e.target.value }))} className="text-xs border rounded px-2 py-1" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" name="hallazgos-p1-end" value={period1.end} onChange={e => setPeriod1(prev => ({ ...prev, end: e.target.value }))} className="text-xs border rounded px-2 py-1" />
            <span className="text-xs text-slate-400 ml-2">vs</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 ml-1">Período 2 (actual)</span>
            <input type="date" name="hallazgos-p2-start" value={period2.start} onChange={e => setPeriod2(prev => ({ ...prev, start: e.target.value }))} className="text-xs border rounded px-2 py-1" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" name="hallazgos-p2-end" value={period2.end} onChange={e => setPeriod2(prev => ({ ...prev, end: e.target.value }))} className="text-xs border rounded px-2 py-1" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_PRESETS.map(preset => (
              <button key={preset.label}
                onClick={() => { setPeriod1(preset.p1); setPeriod2(preset.p2); }}
                className="text-[10px] px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors">
                {preset.label}
              </button>
            ))}
            <span className="text-[10px] text-slate-400 ml-2">Tipo:</span>
            {['todos', 'congelado', 'fresco'].map(t => (
              <button key={t}
                className={cn('text-[10px] px-2 py-1 rounded-full transition-colors', tipoFilter === t ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')}
                onClick={() => setTipoFilter(t as 'todos' | 'congelado' | 'fresco')}>
                {t === 'todos' ? 'Todos' : t === 'congelado' ? 'Congelado' : 'Fresco'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {!recordsLoaded && (
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <span className="text-sm text-slate-500">Cargando registros para análisis…</span>
        </CardContent></Card>
      )}

      {/* HALLAZGOS */}
      {recordsLoaded && result && result.insights.length > 0 && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {result.insights.length} hallazgos de alto valor
            </h3>
            <span className="text-xs text-slate-500">
              {result.totalDetected} detectados · top {result.insights.length} por prioridad
            </span>
          </div>

          {/* Tarjetas de hallazgos */}
          <div className="space-y-3">
            {result.insights.map((insight, idx) => (
              <InsightCard key={insight.id} insight={insight} rank={idx + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Sin hallazgos */}
      {recordsLoaded && result && result.insights.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-400">
          <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No se detectaron hallazgos de alto valor para este período.</p>
          <p className="text-xs mt-1">Probá otro rango de fechas o ajustá los filtros.</p>
        </CardContent></Card>
      )}

      {/* Sin datos */}
      {recordsLoaded && records.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-400">
          <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin datos del mercado. Subí el Excel MGAP desde el botón "Subir Excel MGAP".</p>
        </CardContent></Card>
      )}
    </div>
  );
}

// ============================================================
// InsightCard — Tarjeta de hallazgo estructurada
// ============================================================

function InsightCard({ insight, rank }: { insight: DeepInsight; rank: number }) {
  const Icon = CATEGORY_ICONS[insight.category] || Brain;
  const impactCfg = IMPACT_CONFIG[insight.impact];

  return (
    <Card className={cn('border-l-4', impactCfg.border)}>
      <CardContent className="p-5">
        {/* Header: rank + título + impacto */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', impactCfg.bg)}>
            <Icon className={cn('w-4 h-4', impactCfg.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-slate-400">#{rank}</span>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{insight.title}</h4>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{insight.summary}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', impactCfg.bg, impactCfg.color)}>
              {impactCfg.label}
            </span>
            <span className="text-[9px] text-slate-400">Confianza {insight.confidence}%</span>
          </div>
        </div>

        {/* Evidencia */}
        {insight.evidence.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {insight.evidence.map((e, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2">
                <p className="text-[10px] text-slate-500 uppercase truncate">{e.label}</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{e.value}</p>
                {e.pct !== undefined && (
                  <p className="text-[10px] text-slate-400">{e.pct.toFixed(1)}%</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Explicación */}
        <div className="bg-blue-50/50 dark:bg-blue-950/10 rounded-lg p-3 mb-3">
          <p className="text-[10px] uppercase font-semibold text-blue-700 dark:text-blue-300 mb-1">¿Por qué pasó?</p>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{insight.explanation}</p>
        </div>

        {/* Impacto económico */}
        <div className="flex items-center gap-4 mb-3 text-xs">
          <div>
            <span className="text-slate-500">Toneladas afectadas: </span>
            <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{insight.impactTons.toFixed(0)} t</span>
          </div>
          <div>
            <span className="text-slate-500">Impacto económico: </span>
            <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">USD {insight.impactUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Acción recomendada */}
        <div className={cn('rounded-lg p-3 border', impactCfg.bg, impactCfg.border)}>
          <p className={cn('text-[10px] uppercase font-semibold mb-1', impactCfg.color)}>¿Qué hacer?</p>
          <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{insight.action}</p>
        </div>
      </CardContent>
    </Card>
  );
}
