'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  LayoutDashboard, Warehouse, Ship, ArrowLeftRight, Search, GitCompare, BarChart3,
  Download, PlusCircle, Settings, Cloud, CloudOff, Menu, Globe, Sparkles, Activity,
  Radio, Home, Briefcase, Wrench, FileText, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isConfigured, getLastSync } from '@/lib/googleSheets';
import SettingsSheet from '@/components/SettingsSheet';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

type TabId =
  | 'operacion' | 'command-center' | 'nirea' | 'centro'
  | 'dashboard' | 'depositos' | 'exportaciones' | 'cruce-caliral' | 'cruces-x-cote'
  | 'mercado-nacional' | 'hallazgos' | 'trazabilidad-explorer' | 'trazabilidad'
  | 'comparativa' | 'analiticas' | 'importar' | 'nuevo';

interface NavItem {
  id: TabId;
  label: string;
  icon: any;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operación CALIRAL',
    items: [
      { id: 'operacion', label: 'Inicio', icon: Home },
      { id: 'command-center', label: 'Digital Twin', icon: Radio },
      { id: 'trazabilidad-explorer', label: 'Trazabilidad', icon: Search },
      { id: 'trazabilidad', label: 'Búsqueda COTE', icon: Search },
    ],
  },
  {
    title: 'Inteligencia Comercial',
    items: [
      { id: 'nirea', label: 'Clientes Estratégicos', icon: Briefcase },
      { id: 'mercado-nacional', label: 'Mercado Nacional', icon: Globe },
      { id: 'hallazgos', label: 'Hallazgos', icon: Sparkles },
      { id: 'comparativa', label: 'Comparativa', icon: GitCompare },
    ],
  },
  {
    title: 'Administración',
    items: [
      { id: 'depositos', label: 'A Depósitos', icon: Warehouse },
      { id: 'exportaciones', label: 'Exportaciones', icon: Ship },
      { id: 'cruce-caliral', label: 'Cruces Frimaral', icon: ArrowLeftRight },
      { id: 'cruces-x-cote', label: 'Cruces X COTE', icon: GitCompare },
      { id: 'nuevo', label: 'Nuevo Registro', icon: PlusCircle },
      { id: 'importar', label: 'Importar / Exportar', icon: Download },
    ],
  },
  {
    title: 'Avanzado',
    items: [
      { id: 'centro', label: 'Centro de Inteligencia', icon: Activity },
      { id: 'dashboard', label: 'Dashboard legacy', icon: LayoutDashboard },
      { id: 'analiticas', label: 'Analíticas', icon: BarChart3 },
    ],
  },
];

// Flat list for keyboard shortcut compat
const tabs = NAV_SECTIONS.flatMap(s => s.items);

function SidebarContent({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { activeTab, setActiveTab, navigateAndFilter, search, setSearch } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [quickSearch, setQuickSearch] = useState('');

  useEffect(() => {
    setConfigured(isConfigured());
    setLastSync(getLastSync());
    const handler = () => {
      setConfigured(isConfigured());
      setLastSync(getLastSync());
    };
    window.addEventListener('sheets-sync', handler);
    return () => window.removeEventListener('sheets-sync', handler);
  }, []);

  // Sync quick search with store search on mount
  useEffect(() => {
    setQuickSearch(search);
  }, [search]);

  const handleTabClick = (tabId: typeof activeTab) => {
    setActiveTab(tabId);
    onNavigate?.();
  };

  const handleQuickSearch = useCallback(
    (value: string) => {
      setQuickSearch(value);
      setSearch(value);
      navigateAndFilter('trazabilidad', undefined, value);
      onNavigate?.();
    },
    [navigateAndFilter, setSearch, onNavigate]
  );

  // Keyboard shortcuts: ⌘1-9 to switch tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        if (index < tabs.length) {
          e.preventDefault();
          setActiveTab(tabs[index].id);
          onNavigate?.();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab, onNavigate]);

  return (
    <>
      <div className="p-5 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-emerald-400">Trazabilidad Frimaral</h1>
          <p className="text-xs text-slate-400 mt-1">Caliral S.A.</p>
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
          aria-label={configured ? 'Sincronización configurada' : 'Configurar sincronización'}
        >
          {configured ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
        </button>
      </div>

      {/* Quick Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => handleQuickSearch(e.target.value)}
            placeholder="Buscar COTE, trámite..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors"
            aria-label="Búsqueda rápida"
          />
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={section.title}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 px-3 mb-1 mt-1">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const isHovered = hoveredTab === tab.id;
                // Global index for keyboard shortcut
                const globalIdx = tabs.findIndex(t => t.id === tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    onMouseEnter={() => setHoveredTab(tab.id)}
                    onMouseLeave={() => setHoveredTab(null)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative',
                      active
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[1px] w-[3px] h-5 bg-emerald-300 rounded-r-full" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{tab.label}</span>
                    {globalIdx < 9 && (
                      <span
                        className={cn(
                          'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors',
                          active
                            ? 'text-emerald-200 bg-emerald-700/50'
                            : 'text-slate-500 bg-slate-800'
                        )}
                      >
                        {globalIdx + 1}
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-xs transition-opacity duration-150',
                        isHovered && !active ? 'opacity-100 text-slate-400' : 'opacity-0'
                      )}
                    >→</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700 space-y-1">
        {configured && lastSync && (
          <p className="text-[10px] text-slate-500">
            <Cloud className="h-3 w-3 inline mr-1" />
            Sync: {new Date(lastSync).toLocaleString('es-UY')}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-500">v1.2 — Caliral S.A.</p>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Configuración"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

export default function Sidebar() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sheet on route/tab change
  const handleMobileNavigate = () => {
    setMobileOpen(false);
  };

  if (isMobile) {
    return (
      <>
        {/* Mobile hamburger button */}
        <div className="fixed top-0 left-0 right-0 z-40 bg-slate-900 p-3 flex items-center md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label="Abrir menú de navegación"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-slate-900 text-white border-slate-700 p-0 w-[300px] sm:max-w-[300px]">
              <div className="flex flex-col h-full">
                <SidebarContent onNavigate={handleMobileNavigate} />
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="text-lg font-bold text-emerald-400 ml-3">Trazabilidad Frimaral</h1>
        </div>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside className="w-[340px] bg-slate-900 text-white flex flex-col min-h-screen shrink-0">
      <SidebarContent />
    </aside>
  );
}
