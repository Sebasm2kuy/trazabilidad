'use client';

// ============================================================
// AlertWidget — Tarjeta de alerta con prioridad
// ============================================================

import { cn } from '@/lib/utils';
import { AlertOctagon, AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import type { Alert, AlertPriority } from '@/domain/types';

const PRIORITY: Record<AlertPriority, { label: string; bg: string; border: string; icon: typeof AlertOctagon; iconColor: string; labelColor: string }> = {
  critica: { label: 'CRÍTICA', bg: 'bg-red-50/80 dark:bg-red-950/30',       border: 'border-l-red-500',  icon: AlertOctagon,  iconColor: 'text-red-600',    labelColor: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  alta:    { label: 'ALTA',    bg: 'bg-orange-50/80 dark:bg-orange-950/30', border: 'border-l-orange-500', icon: AlertTriangle, iconColor: 'text-orange-600', labelColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
  media:   { label: 'MEDIA',   bg: 'bg-amber-50/80 dark:bg-amber-950/30',  border: 'border-l-amber-500', icon: AlertCircle,   iconColor: 'text-amber-600',  labelColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  baja:    { label: 'BAJA',    bg: 'bg-slate-50/80 dark:bg-slate-900/30',  border: 'border-l-slate-400', icon: Info,          iconColor: 'text-slate-600',  labelColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

interface Props {
  alert: Alert;
  onClick?: () => void;
  onDismiss?: () => void;
  className?: string;
  compact?: boolean;
}

export function AlertWidget({ alert, onClick, onDismiss, className, compact }: Props) {
  const p = PRIORITY[alert.priority];
  const Icon = p.icon;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-lg border border-l-4 p-3 transition-all',
        p.bg, p.border,
        onClick && 'cursor-pointer hover:shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', p.iconColor)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase', p.labelColor)}>{p.label}</span>
            {!compact && alert.entity && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {alert.entity.type}: {alert.entity.label}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1 leading-snug">
            {alert.title}
          </p>
          {!compact && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-2">
              {alert.description}
            </p>
          )}
          {!compact && alert.suggestedAction && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 italic line-clamp-1">
              → {alert.suggestedAction}
            </p>
          )}
        </div>
        {onClick && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0 mt-1" />}
      </div>
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="absolute top-1 right-1 w-5 h-5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 text-xs"
          aria-label="dismiss"
        >×</button>
      )}
    </div>
  );
}

/** Lista agrupada de alertas por prioridad. */
export function AlertList({ alerts, onSelect, maxPerPriority = 5 }: { alerts: Alert[]; onSelect?: (a: Alert) => void; maxPerPriority?: number }) {
  const groups: AlertPriority[] = ['critica', 'alta', 'media', 'baja'];
  return (
    <div className="space-y-3">
      {groups.map(priority => {
        const items = alerts.filter(a => a.priority === priority).slice(0, maxPerPriority);
        if (items.length === 0) return null;
        return (
          <div key={priority}>
            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
              {PRIORITY[priority].label} ({items.length})
            </p>
            <div className="space-y-1.5">
              {items.map(a => (
                <AlertWidget key={a.id} alert={a} onClick={() => onSelect?.(a)} compact />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
