'use client';

// ============================================================
// InsightCard — Tarjeta de conclusión automática
// ============================================================

import { cn } from '@/lib/utils';
import {
  Activity, AlertTriangle, AlertOctagon, Award, Building2, Clock, Globe,
  Package, Ship, Truck, Users, Warehouse, UserMinus, Target,
  TrendingUp, TrendingDown, PauseCircle, type LucideIcon,
} from 'lucide-react';
import type { Insight } from '@/domain/types';

const ICONS: Record<string, LucideIcon> = {
  Activity, AlertTriangle, AlertOctagon, Award, Building2, Clock, Globe,
  Package, Ship, Truck, Users, Warehouse, UserMinus, Target,
  TrendingUp, TrendingDown, PauseCircle,
};

const STYLES: Record<Insight['severity'], { border: string; bg: string; iconBg: string; iconColor: string; title: string; desc: string }> = {
  positive:    { border: 'border-emerald-300 dark:border-emerald-800',  bg: 'bg-emerald-50/60 dark:bg-emerald-950/20',  iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400', title: 'text-emerald-900 dark:text-emerald-100', desc: 'text-emerald-800/80 dark:text-emerald-200/70' },
  negative:    { border: 'border-red-300 dark:border-red-800',           bg: 'bg-red-50/60 dark:bg-red-950/20',           iconBg: 'bg-red-100 dark:bg-red-900/40',         iconColor: 'text-red-600 dark:text-red-400',         title: 'text-red-900 dark:text-red-100',           desc: 'text-red-800/80 dark:text-red-200/70' },
  warning:     { border: 'border-amber-300 dark:border-amber-800',       bg: 'bg-amber-50/60 dark:bg-amber-950/20',       iconBg: 'bg-amber-100 dark:bg-amber-900/40',     iconColor: 'text-amber-600 dark:text-amber-400',     title: 'text-amber-900 dark:text-amber-100',       desc: 'text-amber-800/80 dark:text-amber-200/70' },
  opportunity: { border: 'border-violet-300 dark:border-violet-800',     bg: 'bg-violet-50/60 dark:bg-violet-950/20',     iconBg: 'bg-violet-100 dark:bg-violet-900/40',   iconColor: 'text-violet-600 dark:text-violet-400',   title: 'text-violet-900 dark:text-violet-100',     desc: 'text-violet-800/80 dark:text-violet-200/70' },
  neutral:     { border: 'border-slate-300 dark:border-slate-700',       bg: 'bg-slate-50/60 dark:bg-slate-900/30',       iconBg: 'bg-slate-100 dark:bg-slate-800',        iconColor: 'text-slate-600 dark:text-slate-300',     title: 'text-slate-900 dark:text-slate-100',       desc: 'text-slate-700 dark:text-slate-300' },
};

interface Props {
  insight: Insight;
  onClick?: () => void;
  className?: string;
}

export function InsightCard({ insight, onClick, className }: Props) {
  const Icon = ICONS[insight.icon] || Activity;
  const s = STYLES[insight.severity];
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 transition-all',
        s.border, s.bg,
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0 w-9 h-9 rounded-lg flex items-center justify-center', s.iconBg)}>
          <Icon className={cn('w-4 h-4', s.iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold leading-snug', s.title)}>{insight.title}</p>
          <p className={cn('text-xs mt-1 leading-relaxed whitespace-pre-line', s.desc)}>{insight.description}</p>
          {insight.entity && (
            <p className="text-[10px] mt-2 text-slate-500 truncate">Entidad: {insight.entity}</p>
          )}
        </div>
      </div>
    </div>
  );
}
