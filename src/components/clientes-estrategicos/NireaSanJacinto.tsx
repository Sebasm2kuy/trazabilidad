'use client';

// ============================================================
// NireaSanJacinto — Análisis del Índice de Captura CALIRAL
// ------------------------------------------------------------
// Analiza TODAS las exportaciones de NIREA SAN JACINTO en el
// dataset nacional del MGAP y calcula qué % pasó por CALIRAL.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Target, Globe, Package, Users,
  Calendar, Building2, Lightbulb, AlertCircle, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { loadNacionalRecords } from '@/lib/nacionalLoader';
import { NacionalUploadButton } from '@/components/nacional-upload/NacionalUploadButton';
import {
  computeCapturaCaliral, generateCapturaInsights,
  CLIENTES_ESTRATEGICOS, CALIRAL_ID,
} from '@/intelligence-engine/capturaCaliral';

const NIREA_ALIASES = CLIENTES_ESTRATEGICOS.find(c => c.id === 'NIREA')!.aliases;
const NIREA_NAME = CLIENTES_ESTRATEGICOS.find(c => c.id === 'NIREA')!.name;

type View = 'resumen' | 'paises' | 'cortes' | 'mes' | 'certificadores';

export function NireaSanJacinto() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [view, setView] = useState<View>('resumen');

  useEffect(() => {
    let mounted = true;
    loadNacionalRecords()
      .then(recs => mounted && setRecords(recs))
      .catch(e => console.error('[nirea] carga falló:', e))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const result = useMemo(() => computeCapturaCaliral(records, NIREA_ALIASES), [records]);
  const insights = useMemo(() => generateCapturaInsights(result, NIREA_NAME), [result]);

  const fmt = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: 0 });
  const fmtT = (n: number) => `${(n / 1000).toFixed(1)} t`;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Activity className="w-6 h-6 animate-pulse text-violet-500" />
        <p className="ml-3 text-sm text-slate-500">Cargando 222K registros del MGAP…</p>
      </div>
    );
  }

  if (result.totalRegistros === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            No se encontraron exportaciones de {NIREA_NAME}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Verificá que el dataset nacional esté cargado o que el nombre del cliente sea correcto.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* HEADER */}
      <div className="px-8 pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-violet-600 dark:text-violet-400 font-semibold mb-1">
                Inteligencia Comercial · Cliente Estratégico
              </p>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">
                {NIREA_NAME}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Análisis de todas las exportaciones del cliente y participación de CALIRAL.
              </p>
            </div>
            <NacionalUploadButton />
          </div>
        </div>
      </div>

      {/* KPI PRINCIPAL — Índice de Captura */}
      <div className="px-8 pb-6">
        <div className="max-w-6xl mx-auto">
          <Card className="p-6 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-violet-200 dark:border-violet-900">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">
                  Índice de Captura CALIRAL
                </p>
                <p className="text-5xl font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                  {fmtPct(result.captureIndex)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                  CALIRAL gestionó <strong>{fmtT(result.caliralPn)}</strong> de <strong>{fmtT(result.totalClientePn)}</strong> exportados por {NIREA_NAME}.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Resto: <strong>{fmtT(result.otrosPn)}</strong> vía {result.competidores.length} certificador(es) competidor(es).
                </p>
              </div>
              <div className="hidden md:block w-32 h-32 relative">
                {/* Donut SVG simple */}
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="#8b5cf6" strokeWidth="10"
                    strokeDasharray={`${(result.captureIndex / 100) * 264} 264`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-violet-700 dark:text-violet-300">
                    {fmtPct(result.captureIndex)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* INSIGHTS automáticos */}
      {insights.length > 0 && (
        <div className="px-8 pb-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              Conclusiones automáticas
            </h2>
            <div className="space-y-2">
              {insights.map(ins => {
                const colorMap = {
                  positive: 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200',
                  negative: 'border-red-300 bg-red-50/50 dark:bg-red-950/20 text-red-800 dark:text-red-200',
                  warning: 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200',
                  opportunity: 'border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 text-violet-800 dark:text-violet-200',
                  neutral: 'border-slate-300 bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300',
                };
                return (
                  <div key={ins.id} className={cn('rounded-lg border p-3 text-sm flex items-start gap-2', colorMap[ins.severity])}>
                    <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="flex-1">{ins.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* NAVEGACIÓN de vistas */}
      <div className="px-8 pb-3">
        <div className="max-w-6xl mx-auto flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
          {([
            { id: 'resumen' as const, label: 'Resumen' },
            { id: 'paises' as const, label: 'Por país' },
            { id: 'cortes' as const, label: 'Por corte' },
            { id: 'mes' as const, label: 'Por mes' },
            { id: 'certificadores' as const, label: 'Certificadores' },
          ]).map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                view === v.id
                  ? 'border-violet-600 text-violet-700 dark:text-violet-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENIDO por vista */}
      <div className="px-8 pb-12">
        <div className="max-w-6xl mx-auto">
          {view === 'resumen' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard label="Total exportado" value={fmtT(result.totalClientePn)} subtitle={`${fmt(result.totalRegistros)} registros`} icon={Package} color="text-blue-600" />
              <StatCard label="Vía CALIRAL" value={fmtT(result.caliralPn)} subtitle={`${fmt(result.caliralRegistros)} registros`} icon={Target} color="text-violet-600" />
              <StatCard label="Vía terceros" value={fmtT(result.otrosPn)} subtitle={`${fmt(result.totalRegistros - result.caliralRegistros)} registros`} icon={Building2} color="text-amber-600" />
              <StatCard label="Países atendidos" value={String(result.byPais.length)} subtitle={`${result.paisesSinCaliral.length} sin CALIRAL`} icon={Globe} color="text-emerald-600" />
              <StatCard label="Cortes distintos" value={String(result.byCorte.length)} subtitle={`${result.cortesSinCaliral.length} sin CALIRAL`} icon={Package} color="text-slate-600" />
              <StatCard label="Competidores" value={String(result.competidores.length)} subtitle="certificadores alternativos" icon={Users} color="text-red-600" />
            </div>
          )}

          {view === 'paises' && (
            <BreakdownTable
              title="Captura por país"
              rows={result.byPais}
              fmt={fmt}
              fmtT={fmtT}
              fmtPct={fmtPct}
              highlightEmpty={result.paisesSinCaliral}
              emptyLabel="Países donde CALIRAL no participa"
            />
          )}

          {view === 'cortes' && (
            <BreakdownTable
              title="Captura por corte"
              rows={result.byCorte}
              fmt={fmt}
              fmtT={fmtT}
              fmtPct={fmtPct}
              highlightEmpty={result.cortesSinCaliral}
              emptyLabel="Cortes que no pasaron por CALIRAL"
            />
          )}

          {view === 'mes' && (
            <BreakdownTable
              title="Captura por mes"
              rows={result.byMes}
              fmt={fmt}
              fmtT={fmtT}
              fmtPct={fmtPct}
            />
          )}

          {view === 'certificadores' && (
            <BreakdownTable
              title="Certificadores utilizados"
              rows={result.byCertificador}
              fmt={fmt}
              fmtT={fmtT}
              fmtPct={fmtPct}
              highlightCaliral
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle, icon: Icon, color }: {
  label: string; value: string; subtitle: string; icon: any; color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
    </Card>
  );
}

function BreakdownTable({ title, rows, fmt, fmtT, fmtPct, highlightEmpty, emptyLabel, highlightCaliral }: {
  title: string;
  rows: { label: string; totalPn: number; caliralPn: number; captureIndex: number; registros: number }[];
  fmt: (n: number) => string;
  fmtT: (n: number) => string;
  fmtPct: (n: number) => string;
  highlightEmpty?: string[];
  emptyLabel?: string;
  highlightCaliral?: boolean;
}) {
  const maxPn = Math.max(...rows.map(r => r.totalPn), 1);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-900">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {rows.map(r => {
            const isCaliral = highlightCaliral && r.label.toUpperCase().includes('CALIRAL');
            const isEmpty = highlightEmpty?.includes(r.label);
            const pct = (r.totalPn / maxPn) * 100;
            return (
              <div key={r.label} className={cn(
                'px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors',
                isCaliral && 'bg-violet-50/50 dark:bg-violet-950/20',
              )}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 flex-1 truncate">
                    {r.label}
                    {isCaliral && <Badge variant="secondary" className="ml-2 text-[9px]">CALIRAL</Badge>}
                    {isEmpty && <Badge variant="outline" className="ml-2 text-[9px] text-amber-700">sin CALIRAL</Badge>}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">{fmt(r.registros)} reg</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200 w-24 text-right">{fmtT(r.totalPn)}</span>
                  <span className={cn(
                    'text-xs font-semibold tabular-nums w-16 text-right',
                    r.captureIndex > 50 ? 'text-emerald-600' :
                    r.captureIndex > 25 ? 'text-amber-600' :
                    r.captureIndex > 0 ? 'text-red-600' : 'text-slate-400',
                  )}>
                    {fmtPct(r.captureIndex)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="h-1 mt-0.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(r.caliralPn / maxPn) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {highlightEmpty && highlightEmpty.length > 0 && emptyLabel && (
        <Card className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
            {emptyLabel} ({highlightEmpty.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {highlightEmpty.map(e => (
              <Badge key={e} variant="outline" className="text-[10px] text-amber-700 border-amber-300">{e}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
