// ============================================================
// DATE RANGE PROVIDER — Filtro global de fechas
// ============================================================
// Un único filtro que afecta toda la aplicación.
// Usa Zustand para compartir el estado.
// ============================================================

import { create } from 'zustand';
import type { DateRange, FilterOptions } from '@/intelligence/types';

interface GlobalFilterState {
  range: DateRange;
  options: FilterOptions;
  setRange: (range: DateRange) => void;
  setStart: (start: string | null) => void;
  setEnd: (end: string | null) => void;
  setOption: (key: keyof FilterOptions, value: string) => void;
  clearOptions: () => void;
  reset: () => void;
}

const DEFAULT_RANGE: DateRange = { start: null, end: null };
const DEFAULT_OPTIONS: FilterOptions = { tipoProducto: 'todos' };

export const useGlobalFilter = create<GlobalFilterState>((set) => ({
  range: DEFAULT_RANGE,
  options: DEFAULT_OPTIONS,
  setRange: (range) => set({ range }),
  setStart: (start) => set((s) => ({ range: { ...s.range, start } })),
  setEnd: (end) => set((s) => ({ range: { ...s.range, end } })),
  setOption: (key, value) => set((s) => ({ options: { ...s.options, [key]: value } })),
  clearOptions: () => set({ options: DEFAULT_OPTIONS }),
  reset: () => set({ range: DEFAULT_RANGE, options: DEFAULT_OPTIONS }),
}));

// Presets
export const DATE_PRESETS = [
  { label: 'Todo', getRange: (): DateRange => ({ start: null, end: null }) },
  { label: 'Últimos 3 meses', getRange: (): DateRange => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 3, 1);
    return { start: start.toISOString().substring(0, 10), end: end.toISOString().substring(0, 10) };
  }},
  { label: 'Últimos 6 meses', getRange: (): DateRange => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 6, 1);
    return { start: start.toISOString().substring(0, 10), end: end.toISOString().substring(0, 10) };
  }},
  { label: 'Últimos 12 meses', getRange: (): DateRange => {
    const end = new Date();
    const start = new Date(end.getFullYear() - 1, end.getMonth(), 1);
    return { start: start.toISOString().substring(0, 10), end: end.toISOString().substring(0, 10) };
  }},
  { label: 'Este año', getRange: (): DateRange => {
    const now = new Date();
    return { start: `${now.getFullYear()}-01-01`, end: now.toISOString().substring(0, 10) };
  }},
  { label: 'Año anterior', getRange: (): DateRange => {
    const y = new Date().getFullYear() - 1;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }},
];
