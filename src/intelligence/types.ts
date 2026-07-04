// ============================================================
// TYPES — Inteligencia del Mercado Cárnico Uruguayo
// ============================================================

export interface MovRecord {
  t: string; f: string; c: string; cf: string; p: string; np: string;
  ed: string; tm: string; pa: string; d: string; co: string;
  pa2: number; e: number; pb: number; pn: number; tt: string; sh: string;
  tpd?: string; tp?: number | null;
  isd?: boolean; dep?: string;
}

export interface DateRange {
  start: string | null; // YYYY-MM-DD or null = beginning
  end: string | null;   // YYYY-MM-DD or null = end
}

export interface FilterOptions {
  empresa?: string;
  pais?: string;
  corte?: string;
  producto?: string;
  tipoMov?: string;
  tipoProducto?: 'todos' | 'congelado' | 'fresco';
}

export interface MarketSummary {
  totalRegistros: number;
  totalCajas: number;
  totalPesoBruto: number;
  totalPesoNeto: number;
  empresasUnicas: number;
  paisesUnicos: number;
  cortesUnicos: number;
  productosUnicos: number;
  clientesUnicos: number;
  pesoPromedioPorEmbarque: number;
  envasesPromedioPorEmbarque: number;
}

export interface RankingEntry {
  name: string;
  registros: number;
  cajas: number;
  pesoNeto: number;
  share: number; // percentage
  crecimiento?: number; // percentage vs previous period
}

export interface TimeSeriesPoint {
  fecha: string;     // YYYY-MM
  registros: number;
  cajas: number;
  pesoNeto: number;
}

export interface GrowthResult {
  name: string;
  currentPn: number;
  previousPn: number;
  growthRate: number; // percentage
  absoluteChange: number;
}

export interface ConcentrationResult {
  name: string;       // empresa
  totalPn: number;
  topDestinoPn: number;
  topDestinoName: string;
  concentration: number; // 0-100, higher = more concentrated
  risk: 'alto' | 'medio' | 'bajo';
}

export interface Insight {
  id: string;
  type: 'growth' | 'decline' | 'new' | 'lost' | 'concentration' | 'opportunity' | 'milestone' | 'warning';
  icon: string;
  title: string;
  description: string;
  severity: 'positive' | 'negative' | 'neutral' | 'warning';
  value?: number;
  entity?: string;
}

export interface ComparisonResult {
  metric: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changeRate: number;
}
