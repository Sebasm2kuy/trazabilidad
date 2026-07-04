'use client';

// ============================================================
// useEntityDrawer — Controla el drawer de drill-down global
// ============================================================

import { create } from 'zustand';
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
  closeDrawer: () => set({ open: false }),
}));
