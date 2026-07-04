import { create } from 'zustand';

export type Tab = 'dashboard' | 'depositos' | 'exportaciones' | 'cruce-caliral' | 'cruces-x-cote' | 'mercado-nacional' | 'hallazgos' | 'trazabilidad-explorer' | 'trazabilidad' | 'comparativa' | 'analiticas' | 'importar' | 'nuevo';

interface Filters {
  pais: string;
  producto: string;
  destino: string;
  tipo: string;
  cote: string;
  fechaDesde: string;
  fechaHasta: string;
}

interface ExpFilters {
  pais: string;
  producto: string;
  destino: string;
  cote: string;
  fechaDesde: string;
  fechaHasta: string;
  search: string;
}

const emptyFilters: Filters = { pais: '', producto: '', destino: '', tipo: '', cote: '', fechaDesde: '', fechaHasta: '' };
const emptyExpFilters: ExpFilters = { pais: '', producto: '', destino: '', cote: '', fechaDesde: '', fechaHasta: '', search: '' };

export type CruceSubTab = 'cruce' | 'sincruce' | 'pendientes' | 'stock';

interface CruceCaliralNav {
  subTab: CruceSubTab;
  search: string;
}

const emptyCruceNav: CruceCaliralNav = { subTab: 'cruce', search: '' };

interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  search: string;
  setSearch: (s: string) => void;
  filters: Filters;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  expFilters: ExpFilters;
  setExpFilter: (key: string, value: string) => void;
  clearExpFilters: () => void;
  selectedShipmentId: string | null;
  setSelectedShipmentId: (id: string | null) => void;
  navigateAndFilter: (tab: Tab, filters?: Partial<Filters & ExpFilters>, search?: string) => void;
  recentCotes: string[];
  addRecentCote: (cote: string) => void;
  cruceNav: CruceCaliralNav;
  setCruceNav: (nav: Partial<CruceCaliralNav>) => void;
  consumeCruceNav: () => CruceCaliralNav;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  search: '',
  setSearch: (search) => set({ search }),
  filters: { ...emptyFilters },
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: { ...emptyFilters }, search: '' }),
  expFilters: { ...emptyExpFilters },
  setExpFilter: (key, value) => set((s) => ({ expFilters: { ...s.expFilters, [key]: value } })),
  clearExpFilters: () => set({ expFilters: { ...emptyExpFilters } }),
  selectedShipmentId: null,
  setSelectedShipmentId: (id) => set({ selectedShipmentId: id }),
  navigateAndFilter: (tab, filters, search) => {
    const state: Partial<AppState> = { activeTab: tab };
    if (search !== undefined && tab !== 'exportaciones') state.search = search;
    // Clear filters for the target tab, then apply new ones
    if (tab === 'exportaciones') {
      state.expFilters = { ...emptyExpFilters };
      const newExpFilters = { ...emptyExpFilters };
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (k in newExpFilters) (newExpFilters as any)[k] = v;
        });
      }
      // Apply search to expFilters.search
      if (search !== undefined) newExpFilters.search = search;
      state.expFilters = newExpFilters;
    } else if (tab === 'depositos' || tab === 'trazabilidad') {
      state.filters = { ...emptyFilters };
      if (filters) {
        const newFilters = { ...emptyFilters };
        Object.entries(filters).forEach(([k, v]) => {
          if (k in newFilters) (newFilters as any)[k] = v;
        });
        state.filters = newFilters;
      }
    }
    set(state);
  },
  recentCotes: [],
  addRecentCote: (cote) =>
    set((s) => {
      const filtered = s.recentCotes.filter((c) => c !== cote);
      return { recentCotes: [cote, ...filtered].slice(0, 20) };
    }),
  cruceNav: { ...emptyCruceNav },
  setCruceNav: (nav) => set((s) => ({ cruceNav: { ...s.cruceNav, ...nav } })),
  consumeCruceNav: () => {
    const current = { ...get().cruceNav };
    set({ cruceNav: { ...emptyCruceNav } });
    return current;
  },
}));
