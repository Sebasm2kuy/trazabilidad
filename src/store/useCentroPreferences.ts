'use client';

// ============================================================
// useCentroPreferences — Estado de widgets del Centro de Inteligencia
// ------------------------------------------------------------
// Persiste en localStorage qué widgets están visibles y su orden.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === id ? { ...w, visible: !w.visible } : w
          ),
          lastUpdated: new Date().toISOString(),
        })),

      reorderWidget: (id, newOrder) =>
        set((s) => {
          const widgets = [...s.widgets];
          const idx = widgets.findIndex((w) => w.id === id);
          if (idx === -1) return s;
          const [moved] = widgets.splice(idx, 1);
          widgets.splice(newOrder, 0, moved);
          return {
            widgets: widgets.map((w, i) => ({ ...w, order: i })),
            lastUpdated: new Date().toISOString(),
          };
        }),

      moveWidget: (id, direction) =>
        set((s) => {
          const sorted = [...s.widgets].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex((w) => w.id === id);
          if (idx === -1) return s;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= sorted.length) return s;
          [sorted[idx], sorted[targetIdx]] = [sorted[targetIdx], sorted[idx]];
          return {
            widgets: sorted.map((w, i) => ({ ...w, order: i })),
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
