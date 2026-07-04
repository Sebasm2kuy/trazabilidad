'use client';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Sparkles } from 'lucide-react';
import { dataUrl } from '@/lib/staticData';
import { useGlobalFilter, DATE_PRESETS } from '@/providers/useGlobalFilter';
import { filterRecords, getPreviousRange, comparePeriods, getMarketSummary } from '@/intelligence/aggregation';
import { generateInsights } from '@/intelligence/insights';
import type { MovRecord } from '@/intelligence/types';
import React from 'react';

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  positive: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  negative: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  neutral: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
};

export default function Hallazgos() {
  const { range, options, setRange, setOption } = useGlobalFilter();
  const [records, setRecords] = useState<MovRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(dataUrl('data/nacional_mgmp.json'));
        if (r.ok) setRecords(await r.json());
      } catch (err) { console.error('Error loading:', err); }
      setLoading(false);
    })();
  }, []);

  const currentRecords = useMemo(() => filterRecords(records, range, options), [records, range, options]);
  const previousRange = useMemo(() => getPreviousRange(range, records), [range, records]);
  const previousRecords = useMemo(() => filterRecords(records, previousRange, options), [records, previousRange, options]);
  const insights = useMemo(() => generateInsights(currentRecords, previousRecords), [currentRecords, previousRecords]);
  const comparisons = useMemo(() => comparePeriods(currentRecords, previousRecords), [currentRecords, previousRecords]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">🔎 Hallazgos</h2>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center gap-3">
        <Sparkles className="h-7 w-7 text-violet-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Hallazgos</h2>
          <p className="text-xs text-slate-500">Descubridor automático de patrones y cambios</p>
        </div>
      </div>

      {/* Global filter */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Calendar className="h-4 w-4 text-slate-400" />
            {DATE_PRESETS.map(preset => (
              <button key={preset.label}
                className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700 transition-colors"
                onClick={() => setRange(preset.getRange())}>{preset.label}</button>
            ))}
            <span className="text-[10px] text-slate-400 ml-2">Tipo:</span>
            {['todos', 'congelado', 'fresco'].map(t => (
              <button key={t}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${options.tipoProducto === t ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setOption('tipoProducto', t)}>
                {t === 'todos' ? 'Todos' : t === 'congelado' ? 'Congelado' : 'Fresco'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPIs comparativos */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {comparisons.map((c, i) => {
          const isPositive = c.change > 0;
          return (
            <Card key={i} className={`border-l-4 ${isPositive ? 'border-l-emerald-500' : c.change < 0 ? 'border-l-red-500' : 'border-l-slate-400'}`}>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase font-semibold text-slate-500">{c.metric}</p>
                <p className="text-lg font-bold text-slate-800 mt-1">{c.currentValue.toLocaleString()}</p>
                {c.changeRate !== 0 && (
                  <p className={`text-[10px] mt-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isPositive ? '▲' : '▼'} {Math.abs(c.changeRate).toFixed(1)}% ({c.change > 0 ? '+' : ''}{c.change.toLocaleString()})
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Insights */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">{insights.length} hallazgo{insights.length !== 1 ? 's' : ''} detectado{insights.length !== 1 ? 's' : ''}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map(insight => {
            const colors = SEVERITY_COLORS[insight.severity] || SEVERITY_COLORS.neutral;
            return (
              <Card key={insight.id} className={`${colors.bg} ${colors.border} border`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{insight.icon}</span>
                    <div className="flex-1">
                      <h4 className={`text-sm font-bold ${colors.text}`}>{insight.title}</h4>
                      <p className="text-xs text-slate-600 mt-1">{insight.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {insights.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-400">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No se detectaron cambios significativos. Probá otro rango de fechas.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
