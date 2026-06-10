'use client';

import { useAppStore } from '@/store/useAppStore';
import { LayoutDashboard, Warehouse, Ship, Search, GitCompare, BarChart3, Download, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'depositos' as const, label: 'A Depósitos', icon: Warehouse },
  { id: 'exportaciones' as const, label: 'Exportaciones', icon: Ship },
  { id: 'trazabilidad' as const, label: 'Trazabilidad', icon: Search },
  { id: 'comparativa' as const, label: 'Comparativa', icon: GitCompare },
  { id: 'analiticas' as const, label: 'Analíticas', icon: BarChart3 },
  { id: 'importar' as const, label: 'Importar / Exportar', icon: Download },
  { id: 'nuevo' as const, label: 'Nuevo Registro', icon: PlusCircle },
];

export default function Sidebar() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen shrink-0">
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-emerald-400">Trazabilidad</h1>
        <p className="text-xs text-slate-400 mt-1">Frigorífico San Jacinto</p>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-[10px] text-slate-500">v1.1 — Nirea S.A.</p>
      </div>
    </aside>
  );
}