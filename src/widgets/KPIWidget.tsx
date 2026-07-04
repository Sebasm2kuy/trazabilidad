'use client';

// ============================================================
// KPIWidget — Tarjeta de KPI reutilizable
// ============================================================

import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, Award, Building2, Globe, Package, Ship,
  Truck, Users, Warehouse, UserMinus, Clock, AlertOctagon,
  Target, TrendingUp, TrendingDown, type LucideIcon,
} from 'lucide-react';
import type { KPI } from '@/domain/types';

const ICONS: Record<string, LucideIcon> = {
  Activity, AlertTriangle, Award, Building2, Globe, Package, Ship,
  Truck, Users, Warehouse, UserMinus, Clock, AlertOctagon, Target,
};

const COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/30',    text: 'text-blue-700 dark:text-blue-300',    border: 'border-blue-200 dark:border-blue-900',    accent: 'bg-blue-500' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-900', accent: 'bg-emerald-500' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-950/30',  text: 'text-violet-700 dark:text-violet-300',  border: 'border-violet-200 dark:border-violet-900',  accent: 'bg-violet-500' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/30',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-900',   accent: 'bg-amber-500' },
  red:     { bg: 'bg-red-50 dark:bg-red-950/30',       text: 'text-red-700 dark:text-red-300',       border: 'border-red-200 dark:border-red-900',       accent: 'bg-red-500' },
  slate:   { bg: 'bg-slate-50 dark:bg-slate-900/40',   text: 'text-slate-700 dark:text-slate-300',   border: 'border-slate-200 dark:border-slate-800',   accent: 'bg-slate-500' },
};

function formatValue(value: number, unit: KPI['unit']): string {
  switch (unit) {
    case 'kg': return `${(value / 1000).toLocaleString('es-UY', { maximumFractionDigits: 1 })} t`;
    case 'count': return value.toLocaleString('es-UY');
    case 'percent': return `${value.toFixed(1)}%`;
    case 'currency': return `$${value.toLocaleString('es-UY')}`;
    case 'days': return `${value} d`;
    default: return String(value);
  }
}

interface Props {
  kpi: KPI;
  onClick?: () => void;
  className?: string;
  compact?: boolean;
}

export function KPIWidget({ kpi, onClick, className, compact }: Props) {
  const color = COLORS[kpi.color || 'slate'];
  const Icon = kpi.icon ? ICONS[kpi.icon] : null;
  const trendUp = kpi.trend !== undefined && kpi.trend > 0;
  const trendDown = kpi.trend !== undefined && kpi.trend < 0;
  const clickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-xl border p-4 transition-all',
        color.bg, color.border,
        clickable && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400 truncate">
            {kpi.label}
          </p>
          {!compact && (
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', color.text)}>
              {formatValue(kpi.value, kpi.unit)}
            </p>
          )}
          {compact && (
            <p className={cn('mt-0.5 text-lg font-bold tabular-nums', color.text)}>
              {formatValue(kpi.value, kpi.unit)}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('shrink-0 w-9 h-9 rounded-lg flex items-center justify-center', color.accent, 'bg-opacity-15')}>
            <Icon className={cn('w-4 h-4', color.text)} />
          </div>
        )}
      </div>
      {kpi.trend !== undefined && (
        <div className="mt-2 flex items-center gap-1 text-[11px]">
          {trendUp && <TrendingUp className="w-3 h-3 text-emerald-600" />}
          {trendDown && <TrendingDown className="w-3 h-3 text-red-600" />}
          {!trendUp && !trendDown && <span className="w-3 h-3 inline-block" />}
          <span className={cn('font-medium', trendUp ? 'text-emerald-600' : trendDown ? 'text-red-600' : 'text-slate-500')}>
            {kpi.trend > 0 ? '+' : ''}{kpi.trend.toFixed(1)}%
          </span>
          {kpi.trendLabel && <span className="text-slate-400 truncate">{kpi.trendLabel}</span>}
        </div>
      )}
      {clickable && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className={cn('text-[10px] font-medium', color.text)}>→</span>
        </div>
      )}
    </div>
  );
}
