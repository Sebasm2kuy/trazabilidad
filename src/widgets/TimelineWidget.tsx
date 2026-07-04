'use client';

// ============================================================
// TimelineWidget — Línea de tiempo de actividad
// ============================================================

import { cn } from '@/lib/utils';
import { ArrowDownToLine, ArrowUpFromLine, Pencil, FilePlus, Boxes, BellRing, ArrowLeftRight, type LucideIcon } from 'lucide-react';
import type { ActivityEvent } from '@/domain/types';

const TYPE_META: Record<ActivityEvent['type'], { icon: LucideIcon; color: string; bg: string; label: string }> = {
  ingreso:       { icon: ArrowDownToLine, color: 'text-blue-600',     bg: 'bg-blue-100 dark:bg-blue-900/40',     label: 'Ingreso' },
  exportacion:   { icon: ArrowUpFromLine,  color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40', label: 'Exportación' },
  transferencia: { icon: ArrowLeftRight,   color: 'text-violet-600',  bg: 'bg-violet-100 dark:bg-violet-900/40', label: 'Transferencia' },
  edicion:       { icon: Pencil,           color: 'text-amber-600',   bg: 'bg-amber-100 dark:bg-amber-900/40',   label: 'Edición' },
  nuevo_cote:    { icon: FilePlus,         color: 'text-sky-600',     bg: 'bg-sky-100 dark:bg-sky-900/40',       label: 'Nuevo COTE' },
  cambio_stock:  { icon: Boxes,            color: 'text-slate-600',   bg: 'bg-slate-100 dark:bg-slate-800',      label: 'Stock' },
  alerta:        { icon: BellRing,         color: 'text-red-600',     bg: 'bg-red-100 dark:bg-red-900/40',       label: 'Alerta' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
}

interface Props {
  events: ActivityEvent[];
  onSelect?: (e: ActivityEvent) => void;
  className?: string;
  maxItems?: number;
}

export function TimelineWidget({ events, onSelect, className, maxItems = 20 }: Props) {
  if (events.length === 0) {
    return (
      <div className={cn('text-center py-8 text-sm text-slate-500', className)}>
        Sin actividad reciente.
      </div>
    );
  }
  const items = events.slice(0, maxItems);
  return (
    <div className={cn('relative', className)}>
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
      <div className="space-y-2">
        {items.map(ev => {
          const meta = TYPE_META[ev.type] || TYPE_META.cambio_stock;
          const Icon = meta.icon;
          return (
            <button
              key={ev.id}
              onClick={() => onSelect?.(ev)}
              className="relative w-full flex items-start gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded-lg p-1.5 transition-colors"
            >
              <div className={cn('relative z-10 shrink-0 w-7 h-7 rounded-full flex items-center justify-center', meta.bg)}>
                <Icon className={cn('w-3.5 h-3.5', meta.color)} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">{ev.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-[9px] font-semibold uppercase', meta.color)}>{meta.label}</span>
                  <span className="text-[10px] text-slate-400">{timeAgo(ev.timestamp)}</span>
                  {ev.meta?.pn && (
                    <span className="text-[10px] text-slate-500">
                      {(ev.meta.pn as number).toLocaleString('es-UY')} kg
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
