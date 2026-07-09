// ============================================================
// useAppStore — Store global de la aplicación (Zustand)
// ------------------------------------------------------------
// REFACTOR (Staff Engineer audit):
//   - Eliminado `any` en navigateAndFilter (tipado estricto vía keyof)
//   - Añadidos selectors tipados para consumers
//   - useShallow para evitar re-renders cuando se suscriben a
//     múltiples campos primitivos
//   - selectFilters / selectExpFilters / selectCruceNav para
//     encapsular acceso y permitir memoización futura
//   - API pública 100% compatible
// ============================================================

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type Tab = 'operacion' | 'copilot' | 'nirea' | 'centro' | 'centro-datos' | 'depositos' | 'exportaciones' | 'cruce-caliral' | 'cruces-x-cote' | 'mercado-nacional' | 'hallazgos' | 'trazabilidad-explorer' | 'trazabilidad' | 'importar' | 'nuevo';

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
  setFilter: (key: keyof Filters, value: string) => void;
  clearFilters: () => void;
  expFilters: ExpFilters;
  setExpFilter: (key: keyof ExpFilters, value: string) => void;
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
  activeTab: 'operacion',
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
      const newExpFilters: ExpFilters = { ...emptyExpFilters };
      if (filters) {
        (Object.keys(filters) as Array<keyof ExpFilters>).forEach((k) => {
          const v = filters[k];
          if (v !== undefined) newExpFilters[k] = v;
        });
      }
      // Apply search to expFilters.search
      if (search !== undefined) newExpFilters.search = search;
      state.expFilters = newExpFilters;
    } else if (tab === 'depositos' || tab === 'trazabilidad') {
      if (filters) {
        const newFilters: Filters = { ...emptyFilters };
        (Object.keys(filters) as Array<keyof Filters>).forEach((k) => {
          const v = filters[k];
          if (v !== undefined) newFilters[k] = v;
        });
        state.filters = newFilters;
      } else {
        state.filters = { ...emptyFilters };
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

// ============================================================
// SELECTORS — para uso en consumers
// ============================================================
// Estos selectors permiten a los componentes suscribirse a
// slices específicos del store sin re-renderizarse cuando
// cambian campos no relacionados.
//
// Uso con useShallow (campos múltiples primitivos):
//   const { activeTab, search } = useAppStore(useShallow(selectActiveTabAndSearch));
//
// Uso sin useShallow (campo único primitivo):
//   const activeTab = useAppStore(s => s.activeTab);
//
// Uso con selector de objeto (REQUIERE useShallow):
//   const filters = useAppStore(useShallow(selectFilters));
// ============================================================

/** Selector: filters completo. Usar con useShallow. */
export const selectFilters = (s: AppState): Filters => s.filters;

/** Selector: expFilters completo. Usar con useShallow. */
export const selectExpFilters = (s: AppState): ExpFilters => s.expFilters;

/** Selector: cruceNav completo. Usar con useShallow. */
export const selectCruceNav = (s: AppState): CruceCaliralNav => s.cruceNav;

/** Selector: activeTab + search. Usar con useShallow. */
export const selectActiveTabAndSearch = (s: AppState): { activeTab: Tab; search: string } => ({
  activeTab: s.activeTab,
  search: s.search,
});

/** Selector: campos de búsqueda + filtros para ShipmentTable. Usar con useShallow. */
export const selectSearchAndFilters = (s: AppState): {
  search: string;
  setSearch: (s: string) => void;
  filters: Filters;
  setFilter: (key: keyof Filters, value: string) => void;
  clearFilters: () => void;
} => ({
  search: s.search,
  setSearch: s.setSearch,
  filters: s.filters,
  setFilter: s.setFilter,
  clearFilters: s.clearFilters,
});

/** Selector: campos de expFilters para ExportacionesTable. Usar con useShallow. */
export const selectExpFiltersActions = (s: AppState): {
  expFilters: ExpFilters;
  setExpFilter: (key: keyof ExpFilters, value: string) => void;
  clearExpFilters: () => void;
} => ({
  expFilters: s.expFilters,
  setExpFilter: s.setExpFilter,
  clearExpFilters: s.clearExpFilters,
});

/** Selector: navigateAndFilter + setCruceNav. Usar con useShallow. */
export const selectNavActions = (s: AppState): {
  navigateAndFilter: AppState['navigateAndFilter'];
  setCruceNav: AppState['setCruceNav'];
} => ({
  navigateAndFilter: s.navigateAndFilter,
  setCruceNav: s.setCruceNav,
});

/** Selector: campos de CruceCaliral. Usar con useShallow. */
export const selectCruceCaliralFields = (s: AppState): {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  setCruceNav: AppState['setCruceNav'];
  consumeCruceNav: AppState['consumeCruceNav'];
} => ({
  activeTab: s.activeTab,
  setActiveTab: s.setActiveTab,
  setCruceNav: s.setCruceNav,
  consumeCruceNav: s.consumeCruceNav,
});

/** Selector: campos de Sidebar. Usar con useShallow. */
export const selectSidebarFields = (s: AppState): {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  navigateAndFilter: AppState['navigateAndFilter'];
  search: string;
  setSearch: (s: string) => void;
} => ({
  activeTab: s.activeTab,
  setActiveTab: s.setActiveTab,
  navigateAndFilter: s.navigateAndFilter,
  search: s.search,
  setSearch: s.setSearch,
});

// Re-export useShallow para conveniencia de consumers
export { useShallow };
