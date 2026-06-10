import { create } from 'zustand'

export type TabId = 'dashboard' | 'envios' | 'trazabilidad' | 'analiticas' | 'importar' | 'nuevo'

interface Filters {
  search: string
  paisDestino: string
  producto: string
  destino: string
  fechaDesde: string
  fechaHasta: string
  tipo: string
}

interface AppState {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void

  filters: Filters
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  resetFilters: () => void

  pagination: {
    page: number
    pageSize: number
  }
  setPage: (page: number) => void
  setPageSize: (size: number) => void

  selectedShipmentId: string | null
  setSelectedShipmentId: (id: string | null) => void

  traceSearch: string
  setTraceSearch: (val: string) => void
}

const defaultFilters: Filters = {
  search: '',
  paisDestino: '',
  producto: '',
  destino: '',
  fechaDesde: '',
  fechaHasta: '',
  tipo: '',
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  filters: { ...defaultFilters },
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      pagination: { ...state.pagination, page: 1 },
    })),
  resetFilters: () =>
    set({
      filters: { ...defaultFilters },
      pagination: { page: 1, pageSize: 20 },
    }),

  pagination: { page: 1, pageSize: 20 },
  setPage: (page) => set((state) => ({ pagination: { ...state.pagination, page } })),
  setPageSize: (pageSize) => set((state) => ({ pagination: { page: 1, pageSize } })),

  selectedShipmentId: null,
  setSelectedShipmentId: (id) => set({ selectedShipmentId: id }),

  traceSearch: '',
  setTraceSearch: (val) => set({ traceSearch: val }),
}))