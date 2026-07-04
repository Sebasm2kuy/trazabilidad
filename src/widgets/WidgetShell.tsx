'use client';

// ============================================================
// WidgetShell — Wrapper común: header con título + acciones
// ============================================================

import { cn } from '@/lib/utils';
import { LucideIcon, MoreVertical, X, GripVertical } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';

interface ShellProps {
  id?: string;
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  className?: string;
  bodyClassName?: string;
  actions?: ReactNode;
  onRemove?: () => void;
  /** Permite colapsar el widget. */
  collapsible?: boolean;
  children: ReactNode;
}

export function WidgetShell({
  id, title, icon: Icon, subtitle, className, bodyClassName,
  actions, onRemove, collapsible = true, children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <section
      id={id}
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-800',
        'bg-white dark:bg-slate-950',
        'shadow-sm hover:shadow-md transition-shadow',
        className,
      )}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-900">
        {Icon && <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
        </div>
        {actions}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
            aria-label="opciones"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1">
              {collapsible && (
                <button
                  onClick={() => { setCollapsed(v => !v); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  {collapsed ? 'Expandir' : 'Colapsar'}
                </button>
              )}
              {onRemove && (
                <button
                  onClick={() => { onRemove(); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 flex items-center gap-2"
                >
                  <X className="w-3 h-3" /> Ocultar widget
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      {!collapsed && (
        <div className={cn('p-4', bodyClassName)}>
          {children}
        </div>
      )}
    </section>
  );
}
