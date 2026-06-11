import { create } from 'zustand';

type Tab = 'dashboard' | 'depositos' | 'exportaciones' | 'cruce-caliral' | 'trazabilidad' | 'comparativa' | 'analiticas' | 'importar' | 'nuevo';

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
}

export const useAppStore = create<AppState>((set) => ({
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
}));