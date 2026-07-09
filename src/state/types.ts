// ============================================================
// STATE — Estado global de la aplicación
// ============================================================

export interface AppState {
  activeTab: string;
  search: string;
}

export interface ImportState {
  loading: boolean;
  progress: { phase: string; current: number; total: number; message: string } | null;
  lastSession: { fecha: string; archivos: string[]; totalRegistros: number } | null;
}

export interface FilterState {
  fechaDesde: string;
  fechaHasta: string;
  tipoProducto: 'todos' | 'congelado' | 'fresco';
  empresa: string;
  pais: string;
}

export interface SettingsState {
  firebaseUrl: string;
  syncEnabled: boolean;
  lastSync: string | null;
  darkMode: boolean;
}

export interface DashboardState {
  widgets: { id: string; visible: boolean; order: number }[];
}
