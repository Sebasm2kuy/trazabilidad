'use client';

// ============================================================
// useCentroPreferences — Estado de widgets del Centro de Inteligencia
// ------------------------------------------------------------
// Persiste en localStorage qué widgets están visibles y su orden.
//
// REFACTOR (Staff Engineer audit):
//   - Eliminadas mutaciones directas (splice, sort in-place, swap)
//     que violaban el principio de inmutabilidad de Zustand
//   - Los setters ahora devuelven `s` (sin cambio) cuando la
//     operación no tiene efecto, evitando re-renders espurios
//   - Añadidos selectors tipados para uso con useShallow
//   - API pública 100% compatible
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { WidgetPref } from '@/domain/types';

const DEFAULT_WIDGETS: WidgetPref[] = [
  { id: 'kpi-row',         visible: true, order: 0 },
  { id: 'alerts',          visible: true, order: 1 },
  { id: 'insights',        visible: true, order: 2 },
  { id: 'activity',        visible: true, order: 3 },
  { id: 'stock-rankings',  visible: true, order: 4 },
  { id: 'stock-by-empresa',visible: true, order: 5 },
  { id: 'trends',          visible: true, order: 6 },
  { id: 'quick-actions',   visible: true, order: 7 },
  { id: 'recommendations', visible: true, order: 8 },
];

interface CentroPreferencesState {
  widgets: WidgetPref[];
  lastUpdated: string;
  toggleWidget: (id: string) => void;
  reorderWidget: (id: string, newOrder: number) => void;
  moveWidget: (id: string, direction: 'up' | 'down') => void;
  reset: () => void;
  isWidgetVisible: (id: string) => boolean;
  getVisibleWidgets: () => WidgetPref[];
}

export const useCentroPreferences = create<CentroPreferencesState>()(
  persist(
    (set, get) => ({
      widgets: DEFAULT_WIDGETS,
      lastUpdated: new Date().toISOString(),

      toggleWidget: (id) =>
        set((s) => {
          // Si el widget no existe, no hay cambio.
          const exists = s.widgets.some((w) => w.id === id);
          if (!exists) return s;
          return {
            widgets: s.widgets.map((w) =>
              w.id === id ? { ...w, visible: !w.visible } : w
            ),
            lastUpdated: new Date().toISOString(),
          };
        }),

      reorderWidget: (id, newOrder) =>
        set((s) => {
          const idx = s.widgets.findIndex((w) => w.id === id);
          if (idx === -1) return s;
          // Inmutable: filter + insert en nueva posición (sin splice).
          const withoutMoved = s.widgets.filter((_, i) => i !== idx);
          const moved = s.widgets[idx];
          const next = [
            ...withoutMoved.slice(0, newOrder),
            moved,
            ...withoutMoved.slice(newOrder),
          ];
          return {
            widgets: next.map((w, i) => ({ ...w, order: i })),
            lastUpdated: new Date().toISOString(),
          };
        }),

      moveWidget: (id, direction) =>
        set((s) => {
          // Ordenar inmutablemente (no muta el array original).
          const sorted = [...s.widgets].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex((w) => w.id === id);
          if (idx === -1) return s;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= sorted.length) return s;
          // Swap inmutable: construir nuevo array sin mutar.
          const next = sorted.map((w, i) => {
            if (i === idx) return sorted[targetIdx];
            if (i === targetIdx) return sorted[idx];
            return w;
          });
          return {
            widgets: next.map((w, i) => ({ ...w, order: i })),
            lastUpdated: new Date().toISOString(),
          };
        }),

      reset: () =>
        set({
          widgets: DEFAULT_WIDGETS,
          lastUpdated: new Date().toISOString(),
        }),

      isWidgetVisible: (id) => {
        const w = get().widgets.find((w) => w.id === id);
        return w?.visible ?? false;
      },

      getVisibleWidgets: () =>
        get()
          .widgets.filter((w) => w.visible)
          .sort((a, b) => a.order - b.order),
    }),
    {
      name: 'trazabilidad_centro_prefs',
      version: 1,
    }
  )
);

// ============================================================
// SELECTORS — para uso en consumers
// ============================================================

/** Selector: widgets visibles ordenados. Usar con useShallow. */
export const selectVisibleWidgets = (s: CentroPreferencesState): WidgetPref[] =>
  s.widgets
    .filter((w) => w.visible)
    .sort((a, b) => a.order - b.order);

/** Selector: widgets + toggleWidget + moveWidget. Usar con useShallow. */
export const selectWidgetFields = (s: CentroPreferencesState): {
  widgets: WidgetPref[];
  toggleWidget: (id: string) => void;
  moveWidget: (id: string, direction: 'up' | 'down') => void;
} => ({
  widgets: s.widgets,
  toggleWidget: s.toggleWidget,
  moveWidget: s.moveWidget,
});

// Re-export useShallow para conveniencia
export { useShallow };
