import { create } from 'zustand';

type Tab = 'dashboard' | 'envios' | 'trazabilidad' | 'analiticas' | 'importar' | 'nuevo';

interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  search: string;
  setSearch: (s: string) => void;
  filters: {
    pais: string;
    producto: string;
    destino: string;
    tipo: string;
    fechaDesde: string;
    fechaHasta: string;
  };
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  selectedShipmentId: string | null;
  setSelectedShipmentId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  search: '',
  setSearch: (search) => set({ search }),
  filters: { pais: '', producto: '', destino: '', tipo: '', fechaDesde: '', fechaHasta: '' },
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: { pais: '', producto: '', destino: '', tipo: '', fechaDesde: '', fechaHasta: '' }, search: '' }),
  selectedShipmentId: null,
  setSelectedShipmentId: (id) => set({ selectedShipmentId: id }),
}));