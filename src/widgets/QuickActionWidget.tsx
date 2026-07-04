'use client';

// ============================================================
// QuickActionWidget — Acciones rápidas accesibles
// ============================================================

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  color?: string;
  onClick?: () => void;
}

interface Props {
  actions: QuickAction[];
  className?: string;
  columns?: number;
}

export function QuickActionWidget({ actions, className, columns = 4 }: Props) {
  return (
    <div
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            className={cn(
              'group flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800',
              'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all',
              'hover:shadow-sm hover:-translate-y-0.5',
              action.color || 'text-slate-700 dark:text-slate-200',
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-medium text-center leading-tight">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
