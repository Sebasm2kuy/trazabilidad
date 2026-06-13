'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LayoutDashboard, Warehouse, Ship, ArrowLeftRight, Search, GitCompare, BarChart3, Download, PlusCircle, Settings, Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isConfigured, getLastSync } from '@/lib/googleSheets';
import SettingsSheet from '@/components/SettingsSheet';

const tabs = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'depositos' as const, label: 'A Depósitos', icon: Warehouse },
  { id: 'exportaciones' as const, label: 'Exportaciones', icon: Ship },
  { id: 'cruce-caliral' as const, label: 'Cruce Caliral', icon: ArrowLeftRight },
  { id: 'trazabilidad' as const, label: 'Trazabilidad', icon: Search },
  { id: 'comparativa' as const, label: 'Comparativa', icon: GitCompare },
  { id: 'analiticas' as const, label: 'Analíticas', icon: BarChart3 },
  { id: 'importar' as const, label: 'Importar / Exportar', icon: Download },
  { id: 'nuevo' as const, label: 'Nuevo Registro', icon: PlusCircle },
];

export default function Sidebar() {
  const { activeTab, setActiveTab } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const configured = typeof window !== 'undefined' ? isConfigured() : false;
  const lastSync = typeof window !== 'undefined' ? getLastSync() : '';

  return (
    <>
      <aside className="w-[340px] bg-slate-900 text-white flex flex-col min-h-screen shrink-0">
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-emerald-400">Trazabilidad</h1>
            <p className="text-xs text-slate-400 mt-1">Frigorífico San Jacinto</p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              configured
                ? 'text-emerald-400 hover:bg-slate-800'
                : 'text-amber-400 hover:bg-slate-800'
            )}
            title={configured ? 'Sincronización configurada' : 'Configurar sincronización'}
          >
            {configured ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
          </button>
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
        <div className="p-4 border-t border-slate-700 space-y-1">
          {configured && lastSync && (
            <p className="text-[10px] text-slate-500">
              <Cloud className="h-3 w-3 inline mr-1" />
              Sync: {new Date(lastSync).toLocaleString('es-UY')}
            </p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500">v1.2 — Nirea S.A.</p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}