// ============================================================
// PRESENTATION ENGINE — Sistema de visualización profesional
// ------------------------------------------------------------
// ETI-10: Consume resultados de los motores. Nunca calcula.
// Gestiona design system, filtros globales, navegación y estados.
// ============================================================

// --- Design Tokens ---

export const DesignTokens = {
  colors: {
    // Estados
    success: { light: '#10b981', dark: '#34d399' },
    warning: { light: '#f59e0b', dark: '#fbbf24' },
    danger: { light: '#ef4444', dark: '#f87171' },
    info: { light: '#3b82f6', dark: '#60a5fa' },
    neutral: { light: '#64748b', dark: '#94a3b8' },
    // Marca
    primary: { light: '#8b5cf6', dark: '#a78bfa' },
    secondary: { light: '#0ea5e9', dark: '#38bdf8' },
    // Riesgo
    riskMuyBajo: { light: '#10b981', dark: '#34d399' },
    riskBajo: { light: '#84cc16', dark: '#a3e635' },
    riskMedio: { light: '#f59e0b', dark: '#fbbf24' },
    riskAlto: { light: '#f97316', dark: '#fb923c' },
    riskCritico: { light: '#ef4444', dark: '#f87171' },
    // Integridad
    intExcellent: { light: '#10b981', dark: '#34d399' },
    intGood: { light: '#84cc16', dark: '#a3e635' },
    intAcceptable: { light: '#f59e0b', dark: '#fbbf24' },
    intPoor: { light: '#f97316', dark: '#fb923c' },
    intCritical: { light: '#ef4444', dark: '#f87171' },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 },
  radius: { sm: 4, md: 8, lg: 12, xl: 16 },
  typography: {
    xs: '10px', sm: '11px', base: '14px', lg: '18px', xl: '24px', '2xl': '32px', '3xl': '48px',
  },
} as const;

// --- Helpers de visualización ---

export function getRiskColor(score: number): string {
  if (score <= 20) return DesignTokens.colors.riskMuyBajo.light;
  if (score <= 40) return DesignTokens.colors.riskBajo.light;
  if (score <= 60) return DesignTokens.colors.riskMedio.light;
  if (score <= 80) return DesignTokens.colors.riskAlto.light;
  return DesignTokens.colors.riskCritico.light;
}

export function getRiskLabel(score: number): string {
  if (score <= 20) return 'MUY BAJO';
  if (score <= 40) return 'BAJO';
  if (score <= 60) return 'MEDIO';
  if (score <= 80) return 'ALTO';
  return 'CRÍTICO';
}

export function getIntegrityColor(score: number): string {
  if (score >= 95) return DesignTokens.colors.intExcellent.light;
  if (score >= 85) return DesignTokens.colors.intGood.light;
  if (score >= 70) return DesignTokens.colors.intAcceptable.light;
  if (score >= 40) return DesignTokens.colors.intPoor.light;
  return DesignTokens.colors.intCritical.light;
}

export function getIntegrityLabel(score: number): string {
  if (score >= 95) return 'Excelente';
  if (score >= 85) return 'Muy Buena';
  if (score >= 70) return 'Aceptable';
  if (score >= 40) return 'Problemas';
  return 'Crítica';
}

export function getEstadoColor(estado: string): string {
  const map: Record<string, string> = {
    'NUEVO': DesignTokens.colors.info.light,
    'EN_STOCK': DesignTokens.colors.success.light,
    'EXPORTADO_PARCIAL': DesignTokens.colors.warning.light,
    'EXPORTADO_TOTAL': DesignTokens.colors.neutral.light,
    'CON_DIFERENCIAS': DesignTokens.colors.warning.light,
    'HUERFANO': DesignTokens.colors.danger.light,
    'SOBREEXPORTADO': DesignTokens.colors.danger.light,
    'INCONSISTENTE': DesignTokens.colors.danger.light,
    'BLOQUEADO': DesignTokens.colors.danger.light,
    'ARCHIVADO': DesignTokens.colors.neutral.light,
    'ABIERTO': DesignTokens.colors.info.light,
    'CONCILIADO_PARCIAL': DesignTokens.colors.warning.light,
    'CONCILIADO_TOTAL': DesignTokens.colors.success.light,
  };
  return map[estado] || DesignTokens.colors.neutral.light;
}

// --- Tipos de componentes del Design System ---

export interface KPICardProps {
  id: string;
  label: string;
  value: number;
  unit: 'kg' | 'count' | 'percent' | 'days' | 'currency';
  trend?: number;
  trendLabel?: string;
  confidence?: number;
  lastUpdated?: string;
  onClick?: () => void;
  color?: string;
  icon?: string;
}

export interface SmartTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'badge' | 'percent' | 'kg';
  width?: number;
  align?: 'left' | 'right' | 'center';
  visible?: boolean;
  priority?: number;
  sortable?: boolean;
  filterable?: boolean;
}

export interface SmartTableProps<T> {
  columns: SmartTableColumn[];
  data: T[];
  virtualized?: boolean;
  pageSize?: number;
  searchable?: boolean;
  exportable?: boolean;
  selectable?: boolean;
  groupBy?: string;
  onRowClick?: (row: T) => void;
}

export interface TimelineEventProps {
  tipo: string;
  fecha: string;
  descripcion: string;
  peso?: number;
  cajas?: number;
  documento?: string;
  estado?: string;
}

export interface FilterPanelProps {
  empresa?: string;
  productor?: string;
  certificadora?: string;
  cliente?: string;
  pais?: string;
  deposito?: string;
  estado?: string;
  riesgo?: string;
  integridad?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  especie?: string;
  producto?: string;
  corte?: string;
}

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface NotificationItem {
  id: string;
  tipo: 'alerta' | 'conciliacion' | 'importacion' | 'cambio' | 'error';
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
  titulo: string;
  descripcion: string;
  timestamp: string;
  leida?: boolean;
}

// --- Estados de interfaz ---

export type ViewState = 'loading' | 'loaded' | 'empty' | 'error' | 'partial';

export interface ViewStatus {
  state: ViewState;
  message?: string;
  retryAction?: () => void;
}

// --- Filtros guardados ---

export interface SavedFilter {
  id: string;
  nombre: string;
  filtros: FilterPanelProps;
  createdAt: string;
}

// --- Layout config ---

export interface DashboardLayout {
  type: 'ejecutivo' | 'operativo' | 'auditoria' | 'logistico' | 'comercial';
  title: string;
  description: string;
  widgets: string[];
}

export const DASHBOARD_LAYOUTS: Record<string, DashboardLayout> = {
  ejecutivo: {
    type: 'ejecutivo',
    title: 'Dashboard Ejecutivo',
    description: 'Información crítica para dirección',
    widgets: ['integridad_score', 'riesgo_global', 'stock_actual', 'exportaciones_periodo',
              'empresas', 'productores', 'certificadoras', 'clientes', 'paises',
              'alertas_criticas', 'evolucion_semanal', 'tendencias', 'insights_automaticos'],
  },
  operativo: {
    type: 'operativo',
    title: 'Dashboard Operativo',
    description: 'Pendientes, alertas y movimientos',
    widgets: ['pendientes', 'alertas', 'conciliaciones', 'movimientos_recientes',
              'cotes_criticos', 'documentos_sin_resolver', 'acciones_recomendadas'],
  },
  auditoria: {
    type: 'auditoria',
    title: 'Dashboard de Auditoría',
    description: 'Integridad, errores y historial',
    widgets: ['integridad_score', 'errores', 'documentos', 'historial',
              'cambios_manuales', 'intervenciones', 'riesgo_documental'],
  },
  logistico: {
    type: 'logistico',
    title: 'Dashboard Logístico',
    description: 'Stock, rotación y depósitos',
    widgets: ['stock', 'rotacion', 'tiempo_promedio', 'pallets',
              'depositos', 'inmovilizado', 'capacidad'],
  },
  comercial: {
    type: 'comercial',
    title: 'Dashboard Comercial',
    description: 'Clientes, países y participación',
    widgets: ['clientes', 'paises', 'participacion', 'ranking',
              'crecimiento', 'comparativos'],
  },
};

// --- Design System Component Registry ---

export const ComponentRegistry = {
  KPICard: 'KPICard',
  RiskBadge: 'RiskBadge',
  IntegrityBadge: 'IntegrityBadge',
  Timeline: 'Timeline',
  TraceGraph: 'TraceGraph',
  SmartTable: 'SmartTable',
  InsightPanel: 'InsightPanel',
  DashboardWidget: 'DashboardWidget',
  FilterPanel: 'FilterPanel',
  SearchBox: 'SearchBox',
  NotificationCenter: 'NotificationCenter',
  Heatmap: 'Heatmap',
  Breadcrumb: 'Breadcrumb',
  EstadoBadge: 'EstadoBadge',
} as const;

// --- Performance targets ---

export const PERFORMANCE_TARGETS = {
  screenChangeMs: 300,
  globalSearchMs: 1000,
  tableRenderMs: 500,
  virtualizationThreshold: 100, // filas a partir de las cuales virtualizar
} as const;

// --- Export formats ---

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  filename: string;
  filters?: FilterPanelProps;
  includeTimestamp?: boolean;
}
