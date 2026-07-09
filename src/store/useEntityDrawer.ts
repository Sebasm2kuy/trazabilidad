'use client';

// ============================================================
// useEntityDrawer — Controla el drawer de drill-down global
// ------------------------------------------------------------
// REFACTOR (Staff Engineer audit):
//   - Añadidos selectors tipados para uso con useShallow
//   - closeDrawer ahora limpia entityType/entityId al cerrar
//     (antes dejaba referencias obsoletas a una entidad que
//      ya no estaba siendo mostrada)
//   - API pública 100% compatible
// ============================================================

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { EntityType, EntityId } from '@/domain/types';

interface DrawerState {
  open: boolean;
  entityType: EntityType | null;
  entityId: EntityId | null;
  openDrawer: (type: EntityType, id: EntityId) => void;
  closeDrawer: () => void;
}

export const useEntityDrawer = create<DrawerState>((set) => ({
  open: false,
  entityType: null,
  entityId: null,
  openDrawer: (type, id) => set({ open: true, entityType: type, entityId: id }),
  closeDrawer: () => set({ open: false, entityType: null, entityId: null }),
}));

// ============================================================
// SELECTORS
// ============================================================

/** Selector: todos los campos del drawer. Usar con useShallow. */
export const selectDrawerState = (s: DrawerState): {
  open: boolean;
  entityType: EntityType | null;
  entityId: EntityId | null;
  closeDrawer: () => void;
} => ({
  open: s.open,
  entityType: s.entityType,
  entityId: s.entityId,
  closeDrawer: s.closeDrawer,
});

// Re-export useShallow para conveniencia
export { useShallow };
