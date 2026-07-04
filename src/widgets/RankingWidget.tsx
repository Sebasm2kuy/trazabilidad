'use client';

// ============================================================
// RankingWidget — Lista rankeada con barras horizontales
// ============================================================

import { cn } from '@/lib/utils';

export interface RankingItem {
  id: string;
  label: string;
  value: number;
  subtitle?: string;
  share?: number; // 0-100
  trend?: number; // % vs período anterior
}

interface Props {
  items: RankingItem[];
  onSelect?: (item: RankingItem) => void;
  className?: string;
  /** Función de formato del valor. Default: locale string. */
  formatValue?: (v: number) => string;
  /** Color de la barra. Default: violet. */
  barColor?: string;
  emptyLabel?: string;
  maxItems?: number;
}

export function RankingWidget({
  items,
  onSelect,
  className,
  formatValue = (v) => v.toLocaleString('es-UY'),
  barColor = 'bg-violet-500',
  emptyLabel = 'Sin datos',
  maxItems = 10,
}: Props) {
  if (items.length === 0) {
    return <div className={cn('text-center py-6 text-sm text-slate-500', className)}>{emptyLabel}</div>;
  }
  const max = Math.max(...items.slice(0, maxItems).map(i => i.value), 1);
  return (
    <div className={cn('space-y-1.5', className)}>
      {items.slice(0, maxItems).map((item, idx) => {
        const pct = (item.value / max) * 100;
        return (
          <button
            key={item.id}
            onClick={() => onSelect?.(item)}
            disabled={!onSelect}
            className={cn(
              'w-full text-left group',
              onSelect && 'cursor-pointer',
            )}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono text-slate-400 w-5 shrink-0">{idx + 1}.</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate flex-1">
                {item.label}
              </span>
              {item.trend !== undefined && (
                <span className={cn('text-[10px] font-semibold', item.trend > 0 ? 'text-emerald-600' : item.trend < 0 ? 'text-red-600' : 'text-slate-400')}>
                  {item.trend > 0 ? '+' : ''}{item.trend.toFixed(1)}%
                </span>
              )}
              <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                {formatValue(item.value)}
              </span>
            </div>
            <div className="ml-7 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', barColor, onSelect && 'group-hover:opacity-80')}
                style={{ width: `${pct}%` }}
              />
            </div>
            {item.subtitle && (
              <p className="ml-7 text-[10px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
