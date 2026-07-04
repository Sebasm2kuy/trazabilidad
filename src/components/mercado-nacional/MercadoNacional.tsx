'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Globe, TrendingUp, Package, Weight, Ship, MapPin, Calendar,
  Download, Loader2, BarChart3, Users, Award, Target, Lightbulb,
  Crown, AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Building2, PieChart as PieIcon, Layers, Sparkles,
  Warehouse, Boxes, Network, MessageSquare, Send, Upload,
} from 'lucide-react';
import { dataUrl } from '@/lib/staticData';
import { fmt } from '@/lib/utils';
import { toast } from 'sonner';

// ============================================================
// TYPES
// ============================================================

interface MovRecord {
  t: string; f: string; c: string; cf: string; p: string; np: string;
  ed: string; tm: string; pa: string; d: string; co: string;
  pa2: number; e: number; pb: number; pn: number; tt: string; sh: string;
  tpd?: string; tp?: number | null;
  isd?: boolean; // is deposito (productor != certificador)
  dep?: string;  // deposito name (= certificador when isd=true)
}

interface Analytics {
  total: number;
  totalCajas: number;
  totalPeso: number;
  paises: [string, number][];
  productores: [string, number][];
  certificadores: [string, number][];
  tiposMov: [string, number][];
  denoms: [string, number][];
  meses: Record<string, number>;
}

type Tab = 'dashboard' | 'competencia' | 'clientes' | 'cortes' | 'insights' | 'depositos';
type TipoProductoFilter = 'todos' | 'congelado' | 'fresco';

interface Insight {
  type: 'positive' | 'warning' | 'info' | 'opportunity';
  icon: typeof Lightbulb;
  title: string;
  detail: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_COMPANY = 'Caliral S. A.';
const COMPANY_DISPLAY_NAME = 'Calirar (Frimaral)';

/** Tailwind-friendly hex palette (emerald, blue, amber, violet, rose, cyan, orange) */
const PALETTE_HEX = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6',
  '#f43f5e', '#06b6d4', '#f97316',
];

const COMPANY_COLOR = '#10b981'; // emerald — highlight for selected company / Caliral
const COMPETITOR_COLOR = '#3b82f6'; // blue — competitors
const DEPOSIT_OTHER_COLOR = '#8b5cf6'; // violet — other deposits
const OPPORTUNITY_COLOR = '#f59e0b'; // amber — opportunities

/** Logistics nodes excluded from "real client" analysis */
function isLogisticsEd(ed: string): boolean {
  if (!ed) return true;
  const e = ed.trim();
  if (e === 'Puerto de Montevideo') return true;
  if (e.startsWith('Aeropuerto')) return true;
  if (e.startsWith('P. F.')) return true;
  if (e === 'Puerto de la Paloma') return true;
  return false;
}

/** Check if a record uses a deposito (productor != certificador) */
function isDepositoRecord(r: MovRecord): boolean {
  return r.isd === true;
}

// ============================================================
// HELPERS
// ============================================================

const fmtKg = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M kg';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K kg';
  return fmt(n) + ' kg';
};

const fmtNum = (n: number): string => fmt(n);

const fmtPct = (n: number): string => n.toFixed(2) + '%';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function isCaliralName(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes('caliral') || normalized.includes('calirar') || normalized.includes('frimaral');
}

function displayCompanyName(name: string): string {
  return isCaliralName(name) ? COMPANY_DISPLAY_NAME : name;
}

function getEntityRole(name: string, productores: Set<string>): 'mi_empresa' | 'productor' | 'deposito_competencia' | 'competencia' {
  if (isCaliralName(name)) return 'mi_empresa';
  if (productores.has(name)) return 'productor';
  return 'deposito_competencia';
}

function sortEntries(obj: Record<string, number>): [string, number][] {
  return Object.entries(obj).sort(([, a], [, b]) => b - a);
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${names[parseInt(mo, 10) - 1] || mo} ${y.slice(2)}`;
}

// ============================================================
// CSS-PURE CHART COMPONENTS
// ============================================================

/** Function that formats a numeric value into a display string */
type ValueFormatter = (value: number) => string;

/** Horizontal bar with label + value */
function HBar({
  label, value, max, color = COMPANY_COLOR, format = fmtNum, highlight = false,
}: {
  label: string; value: number; max: number; color?: string;
  format?: ValueFormatter; highlight?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span
        className={`text-xs truncate w-28 sm:w-36 shrink-0 ${highlight ? 'font-semibold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden relative min-w-[40px]">
        <div
          className="h-full rounded transition-all duration-500 flex items-center justify-end px-1.5"
          style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%`, backgroundColor: color }}
        >
          {pct > 18 && (
            <span className="text-[9px] font-bold text-white whitespace-nowrap">{format(value)}</span>
          )}
        </div>
      </div>
      {pct <= 18 && (
        <span className="text-xs font-mono text-slate-500 w-20 text-right shrink-0">{format(value)}</span>
      )}
    </div>
  );
}

/** Vertical bar chart for monthly evolution */
function VBarChart({
  data, color = COMPANY_COLOR, compareTo,
}: {
  data: { label: string; value: number }[];
  color?: string;
  compareTo?: { label: string; value: number }[];
}) {
  const max = Math.max(...data.map(d => d.value), ...(compareTo?.map(d => d.value) || [0]), 1);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5 sm:gap-2 h-40 sm:h-52">
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          const compVal = compareTo?.[i]?.value || 0;
          const compH = (compVal / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group min-w-0">
              <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {fmt(d.value)}
              </span>
              <div className="w-full flex-1 flex items-end gap-0.5 justify-center">
                {compareTo && (
                  <div
                    className="w-1.5 sm:w-2 rounded-t transition-all duration-500"
                    style={{ height: `${Math.max(compH, compVal > 0 ? 2 : 0)}%`, backgroundColor: '#cbd5e1' }}
                    title={`Mercado total: ${fmt(compVal)}`}
                  />
                )}
                <div
                  className="w-3 sm:w-4 rounded-t transition-all duration-500 hover:opacity-80"
                  style={{ height: `${Math.max(h, d.value > 0 ? 2 : 0)}%`, backgroundColor: color }}
                  title={`${d.label}: ${fmt(d.value)}`}
                />
              </div>
              <span className="text-[9px] text-slate-500 truncate w-full text-center">{d.label}</span>
            </div>
          );
        })}
      </div>
      {compareTo && (
        <div className="flex gap-4 justify-center">
          <span className="text-[10px] flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: color }} /> Empresa
          </span>
          <span className="text-[10px] flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-slate-300" /> Mercado total
          </span>
        </div>
      )}
    </div>
  );
}

/** Compute conic-gradient stops for a pie chart (pure, no render-scope mutation) */
function computeConicStops(
  slices: { value: number; color: string }[],
  total: number,
): string {
  const parts: string[] = [];
  let acc = 0;
  for (const d of slices) {
    const start = (acc / total) * 360;
    acc += d.value;
    const end = (acc / total) * 360;
    parts.push(`${d.color} ${start}deg ${end}deg`);
  }
  return parts.join(', ');
}

/** CSS conic-gradient pie chart */
function PieChart({
  data, size = 170,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const slices = data.filter(d => d.value > 0);
  const stops = computeConicStops(slices, total);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(${stops || '#e2e8f0 0deg 360deg'})` }}
        />
        <div
          className="absolute rounded-full flex flex-col items-center justify-center bg-white dark:bg-slate-900"
          style={{
            width: size * 0.58, height: size * 0.58,
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="text-[10px] text-slate-500">Total</span>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{fmt(total)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-1 w-full min-w-0 max-h-48 overflow-y-auto pr-1">
        {slices.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-slate-700 dark:text-slate-300 flex-1 truncate" title={d.label}>{d.label}</span>
            <span className="font-mono text-slate-500 w-14 text-right">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Heatmap cell */
function HeatCell({ value, max, color = COMPANY_COLOR }: { value: number; max: number; color?: string }) {
  if (value === 0) {
    return <td className="px-1 py-1 text-center text-[9px] text-slate-300 dark:text-slate-700">·</td>;
  }
  const intensity = max > 0 ? value / max : 0;
  const alpha = 0.18 + intensity * 0.82;
  return (
    <td
      className="px-1 py-1 text-center text-[9px] font-mono text-slate-700 dark:text-slate-200"
      style={{ backgroundColor: hexToRgba(color, alpha) }}
      title={fmt(value)}
    >
      {value >= 1000 ? (value / 1000).toFixed(0) + 'K' : value > 0 ? fmt(value) : ''}
    </td>
  );
}

// ============================================================
// SMALL UI COMPONENTS
// ============================================================

function KpiCard({
  icon: Icon, label, value, sublabel, color,
}: {
  icon: typeof Weight; label: string; value: string; sublabel?: string; color: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: hexToRgba(color, 0.14) }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 truncate">{label}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">{value}</p>
            {sublabel && <p className="text-[10px] text-slate-400 truncate">{sublabel}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, action }: {
  icon: typeof BarChart3; title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-slate-400 text-sm">
      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
      {message}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function MercadoNacional() {
  // --- State ---
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [records, setRecords] = useState<MovRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadProgress, setLoadProgress] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(DEFAULT_COMPANY);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [topN, setTopN] = useState<5 | 10 | 20>(10);
  const [tipoProductoFilter, setTipoProductoFilter] = useState<TipoProductoFilter>('todos');
  const [depositSortKey, setDepositSortKey] = useState<'pn' | 'regs' | 'paises' | 'clientes' | 'embarques'>('pn');
  const [depositSortDir, setDepositSortDir] = useState<'asc' | 'desc'>('desc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

  // --- Load analytics (fast) + records (heavy) on mount ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadProgress('Cargando métricas…');
        const ra = await fetch(dataUrl('data/nacional_analytics.json'));
        if (ra.ok && !cancelled) setAnalytics(await ra.json());

        setLoadProgress('Cargando registros (comprimido 5MB)…');
        // Load gzipped JSON and decompress in browser
        const rr = await fetch(dataUrl('data/nacional_mgmp.json.gz'));
        if (rr.ok && !cancelled) {
          // Try native DecompressionStream (modern browsers)
          if (rr.body && typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('gzip');
            const decompressed = rr.body.pipeThrough(ds);
            const text = await new Response(decompressed).text();
            const data: MovRecord[] = JSON.parse(text);
            setRecords(data);
          } else {
            // Fallback: use pako for decompression
            const buf = await rr.arrayBuffer();
            const pako = await import('pako');
            const text = pako.inflate(buf, { to: 'string' });
            const data: MovRecord[] = JSON.parse(text);
            setRecords(data);
          }
        }
      } catch (err) {
        console.error('Error loading data:', err);
        toast.error('Error al cargar los datos del mercado');
      } finally {
        if (!cancelled) {
          setLoadingRecords(false);
          setLoadProgress('');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- Company list (union of productores + certificadores) ---
  const companyList = useMemo<string[]>(() => {
    if (!analytics) return [DEFAULT_COMPANY];
    const set = new Set<string>();
    analytics.certificadores.forEach(([n]) => set.add(n));
    analytics.productores.forEach(([n]) => set.add(n));
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [analytics]);

  // ============================================================
  // GLOBAL TipoProducto FILTER — applied to ALL downstream memos
  // ============================================================

  const filteredRecords = useMemo<MovRecord[]>(() => {
    if (!records.length) return [];
    if (tipoProductoFilter === 'todos') return records;
    const target = tipoProductoFilter === 'congelado' ? 'Congelado' : 'Fresco';
    return records.filter(r => r.tpd === target);
  }, [records, tipoProductoFilter]);

  // --- Total market peso neto (filtered) ---
  const totalMarketPn = useMemo(() => {
    if (filteredRecords.length) return filteredRecords.reduce((s, r) => s + (r.pn || 0), 0);
    return analytics?.totalPeso || 0;
  }, [filteredRecords, analytics]);

  // ============================================================
  // COMPUTATION: selected company's records + stats
  // ============================================================

  const companyRecords = useMemo<MovRecord[]>(() => {
    if (!filteredRecords.length) return [];
    // Prefer cf (certifier) match; fallback to p (productor) if no cf records
    const byCf = filteredRecords.filter(r => r.cf === selectedCompany);
    if (byCf.length > 0) return byCf;
    return filteredRecords.filter(r => r.p === selectedCompany);
  }, [filteredRecords, selectedCompany]);

  const companyStats = useMemo(() => {
    const paises: Record<string, number> = {};
    const cortes: Record<string, number> = {};
    const denoms: Record<string, number> = {};
    const tipos: Record<string, number> = {};
    const clientes: Record<string, number> = {};
    const meses: Record<string, number> = {};
    let totalCajas = 0, totalPn = 0;

    for (const r of companyRecords) {
      if (r.pa) paises[r.pa] = (paises[r.pa] || 0) + (r.pn || 0);
      if (r.co) cortes[r.co] = (cortes[r.co] || 0) + (r.pn || 0);
      if (r.d) denoms[r.d] = (denoms[r.d] || 0) + 1;
      if (r.tm) tipos[r.tm] = (tipos[r.tm] || 0) + 1;
      if (r.ed && !isLogisticsEd(r.ed)) clientes[r.ed] = (clientes[r.ed] || 0) + (r.pn || 0);
      if (r.f) { const m = r.f.substring(0, 7); meses[m] = (meses[m] || 0) + (r.pn || 0); }
      totalCajas += r.e || 0;
      totalPn += r.pn || 0;
    }

    return {
      total: companyRecords.length,
      totalCajas,
      totalPn,
      paises: sortEntries(paises),
      cortes: sortEntries(cortes),
      denoms: sortEntries(denoms),
      tipos: sortEntries(tipos),
      clientes: sortEntries(clientes),
      meses: Object.entries(meses).sort(([a], [b]) => a.localeCompare(b)),
      uniqueClientes: Object.keys(clientes).length,
      uniqueCortes: Object.keys(cortes).length,
      uniquePaises: Object.keys(paises).length,
      marketShare: totalMarketPn > 0 ? (totalPn / totalMarketPn) * 100 : 0,
    };
  }, [companyRecords, totalMarketPn]);

  // ============================================================
  // COMPUTATION: competition ranking (all certificadores by pn)
  // ============================================================

  interface CompetitorRow {
    name: string; regs: number; cajas: number; pn: number;
    paises: number; cortes: number; share: number;
  }

  const competitionRanking = useMemo<CompetitorRow[]>(() => {
    if (!filteredRecords.length) return [];
    const map: Record<string, { regs: number; cajas: number; pn: number; paises: Set<string>; cortes: Set<string> }> = {};
    for (const r of filteredRecords) {
      const cf = r.cf;
      if (!cf) continue;
      if (!map[cf]) map[cf] = { regs: 0, cajas: 0, pn: 0, paises: new Set(), cortes: new Set() };
      map[cf].regs++;
      map[cf].cajas += r.e || 0;
      map[cf].pn += r.pn || 0;
      if (r.pa) map[cf].paises.add(r.pa);
      if (r.co) map[cf].cortes.add(r.co);
    }
    const totalPn = Object.values(map).reduce((s, v) => s + v.pn, 0) || 1;
    return Object.entries(map)
      .map(([name, v]) => ({
        name, regs: v.regs, cajas: v.cajas, pn: v.pn,
        paises: v.paises.size, cortes: v.cortes.size,
        share: (v.pn / totalPn) * 100,
      }))
      .sort((a, b) => b.pn - a.pn);
  }, [filteredRecords]);

  // ============================================================
  // COMPUTATION: monthly evolution (company + market total)
  // ============================================================

  const monthlyEvolution = useMemo(() => {
    const companyMonths: Record<string, number> = {};
    const marketMonths: Record<string, number> = {};
    for (const r of companyRecords) {
      if (r.f) { const m = r.f.substring(0, 7); companyMonths[m] = (companyMonths[m] || 0) + (r.pn || 0); }
    }
    for (const r of filteredRecords) {
      if (r.f) { const m = r.f.substring(0, 7); marketMonths[m] = (marketMonths[m] || 0) + (r.pn || 0); }
    }
    const allMonths = [...new Set([...Object.keys(companyMonths), ...Object.keys(marketMonths)])].sort();
    return allMonths.map(m => ({
      label: monthLabel(m),
      value: companyMonths[m] || 0,
      marketValue: marketMonths[m] || 0,
    }));
  }, [companyRecords, filteredRecords]);

  // ============================================================
  // COMPUTATION: client analysis (exclusive / shared)
  // ============================================================

  const clientAnalysis = useMemo(() => {
    if (!filteredRecords.length) return { topClients: [], exclusive: [], shared: [] };

    // Map: ed -> Set of certifiers that ship there
    const edCertifiers: Record<string, Set<string>> = {};
    const edPn: Record<string, number> = {};
    for (const r of filteredRecords) {
      if (!r.ed || isLogisticsEd(r.ed)) continue;
      if (!edCertifiers[r.ed]) { edCertifiers[r.ed] = new Set(); edPn[r.ed] = 0; }
      if (r.cf) edCertifiers[r.ed].add(r.cf);
      edPn[r.ed] += r.pn || 0;
    }

    // Company's clients (ed values in company's records, excluding logistics)
    const companyClientMap: Record<string, number> = {};
    for (const r of companyRecords) {
      if (!r.ed || isLogisticsEd(r.ed)) continue;
      companyClientMap[r.ed] = (companyClientMap[r.ed] || 0) + (r.pn || 0);
    }

    const companyClientNames = Object.keys(companyClientMap);
    const exclusive: { name: string; pn: number }[] = [];
    const shared: { name: string; pn: number; competitors: number }[] = [];

    for (const name of companyClientNames) {
      const certifiers = edCertifiers[name] || new Set();
      const pn = companyClientMap[name];
      if (certifiers.size <= 1) {
        exclusive.push({ name, pn });
      } else {
        shared.push({ name, pn, competitors: certifiers.size });
      }
    }

    exclusive.sort((a, b) => b.pn - a.pn);
    shared.sort((a, b) => b.pn - a.pn);

    const topClients = companyClientNames
      .map(name => ({ name, pn: companyClientMap[name] }))
      .sort((a, b) => b.pn - a.pn);

    return { topClients, exclusive, shared };
  }, [filteredRecords, companyRecords]);

  // ============================================================
  // COMPUTATION: corte × pais heatmap (selected company)
  // ============================================================

  const heatmapData = useMemo(() => {
    const topCortes = companyStats.cortes.slice(0, 10).map(([n]) => n);
    const topPaises = companyStats.paises.slice(0, 8).map(([n]) => n);

    // If company has very few cortes, fill from overall top cortes
    let finalCortes = topCortes;
    if (finalCortes.length < 6 && filteredRecords.length) {
      const allCortes: Record<string, number> = {};
      for (const r of filteredRecords) { if (r.co) allCortes[r.co] = (allCortes[r.co] || 0) + (r.pn || 0); }
      const extra = sortEntries(allCortes).map(([n]) => n).filter(n => !finalCortes.includes(n));
      finalCortes = [...finalCortes, ...extra].slice(0, 10);
    }

    const matrix: Record<string, Record<string, number>> = {};
    let maxVal = 0;
    for (const r of companyRecords) {
      if (!r.co || !r.pa) continue;
      if (!finalCortes.includes(r.co)) continue;
      if (!topPaises.includes(r.pa)) continue;
      if (!matrix[r.co]) matrix[r.co] = {};
      matrix[r.co][r.pa] = (matrix[r.co][r.pa] || 0) + (r.pn || 0);
      if (matrix[r.co][r.pa] > maxVal) maxVal = matrix[r.co][r.pa];
    }

    return { cortes: finalCortes, paises: topPaises, matrix, maxVal };
  }, [companyStats, companyRecords, filteredRecords]);

  // ============================================================
  // COMPUTATION: automatic insights
  // ============================================================

  const insights = useMemo<Insight[]>(() => {
    if (!filteredRecords.length || !competitionRanking.length) return [];
    const out: Insight[] = [];
    const company = selectedCompany;
    const myPn = companyStats.totalPn;
    const myShare = companyStats.marketShare;
    const ranking = competitionRanking;
    const myRankIdx = ranking.findIndex(r => r.name === company);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : ranking.length;

    // 1. Market share
    out.push({
      type: myShare >= 5 ? 'positive' : myShare >= 1 ? 'info' : 'warning',
      icon: Award,
      title: `${company} certifica ${fmtPct(myShare)} del mercado total`,
      detail: `${fmtKg(myPn)} de ${fmtKg(totalMarketPn)} — puesto #${myRank} de ${ranking.length} certificadores.`,
    });

    // 2. Top competitor
    const leader = ranking[0];
    if (leader && leader.name !== company) {
      out.push({
        type: 'info',
        icon: Crown,
        title: `Top competidor: ${leader.name}`,
        detail: `Lidera con ${fmtPct(leader.share)} de mercado (${fmtKg(leader.pn)}), ${leader.paises} países y ${leader.cortes} cortes.`,
      });
    }

    // 3. Gap to leader
    if (leader && leader.name !== company && myPn > 0) {
      const ratio = leader.pn / myPn;
      out.push({
        type: ratio > 5 ? 'warning' : 'info',
        icon: TrendingUp,
        title: `Brecha con el líder: ${ratio.toFixed(1)}×`,
        detail: `${leader.name} certifica ${ratio.toFixed(1)}× más peso neto que ${company}.`,
      });
    }

    // 4. Country opportunities
    const myPaises = new Set(companyStats.paises.map(([n]) => n));
    const allPaisesPn: Record<string, number> = {};
    for (const r of filteredRecords) {
      if (r.pa && r.cf !== company) allPaisesPn[r.pa] = (allPaisesPn[r.pa] || 0) + (r.pn || 0);
    }
    const oppPaises = Object.entries(allPaisesPn)
      .filter(([pa]) => !myPaises.has(pa))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    if (oppPaises.length) {
      const list = oppPaises.slice(0, 3).map(([pa, pn]) => `${pa} (${fmtKg(pn)})`).join(', ');
      out.push({
        type: 'opportunity',
        icon: Globe,
        title: `${company} no certifica envíos a ${oppPaises.length} mercados atendidos por la competencia`,
        detail: `Top oportunidades: ${list}.`,
      });
    }

    // 5. Competitor growth (last full month vs previous)
    const monthTotals: Record<string, number> = {};
    for (const r of filteredRecords) { if (r.f) { const m = r.f.substring(0, 7); monthTotals[m] = (monthTotals[m] || 0) + 1; } }
    const sortedMonths = Object.keys(monthTotals).sort();
    // Use last two months where the earlier has >= 500 records (full month)
    let prevMonth = '', latestMonth = '';
    for (let i = sortedMonths.length - 1; i >= 1; i--) {
      if (monthTotals[sortedMonths[i - 1]] >= 500) {
        latestMonth = sortedMonths[i];
        prevMonth = sortedMonths[i - 1];
        break;
      }
    }
    if (latestMonth && prevMonth) {
      const compGrowth: { name: string; growth: number; prevPn: number; latestPn: number }[] = [];
      for (const comp of ranking.slice(0, 10)) {
        let prevPn = 0, latestPn = 0;
        for (const r of filteredRecords) {
          if (r.cf !== comp.name || !r.f) continue;
          const m = r.f.substring(0, 7);
          if (m === prevMonth) prevPn += r.pn || 0;
          if (m === latestMonth) latestPn += r.pn || 0;
        }
        if (prevPn > 0) {
          compGrowth.push({ name: comp.name, growth: ((latestPn - prevPn) / prevPn) * 100, prevPn, latestPn });
        }
      }
      const growers = compGrowth.filter(g => g.growth > 0).sort((a, b) => b.growth - a.growth);
      if (growers.length) {
        const top = growers[0];
        out.push({
          type: 'warning',
          icon: ArrowUpRight,
          title: `${top.name} creció ${fmtPct(top.growth)} en el último mes`,
          detail: `De ${fmtKg(top.prevPn)} (${monthLabel(prevMonth)}) a ${fmtKg(top.latestPn)} (${monthLabel(latestMonth)}).`,
        });
      }
      const decliners = compGrowth.filter(g => g.growth < 0).sort((a, b) => a.growth - b.growth);
      if (decliners.length) {
        const top = decliners[0];
        out.push({
          type: 'info',
          icon: ArrowDownRight,
          title: `${top.name} cayó ${fmtPct(Math.abs(top.growth))} en el último mes`,
          detail: `De ${fmtKg(top.prevPn)} a ${fmtKg(top.latestPn)}.`,
        });
      }
    }

    // 6. Cuts gap
    const myCortes = new Set(companyStats.cortes.map(([n]) => n));
    const allCortesPn: Record<string, number> = {};
    for (const r of filteredRecords) {
      if (r.co && r.cf !== company) allCortesPn[r.co] = (allCortesPn[r.co] || 0) + (r.pn || 0);
    }
    const oppCortes = Object.entries(allCortesPn)
      .filter(([co]) => !myCortes.has(co))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (oppCortes.length) {
      const list = oppCortes.slice(0, 5).map(([co, pn]) => `${co} (${fmtKg(pn)})`).join(', ');
      out.push({
        type: 'opportunity',
        icon: Package,
        title: `${company} no certifica ${oppCortes.length} cortes con demanda en la competencia`,
        detail: `Top: ${list}.`,
      });
    }

    // 7. Exclusive clients
    if (clientAnalysis.exclusive.length) {
      out.push({
        type: 'positive',
        icon: CheckCircle2,
        title: `${company} tiene ${clientAnalysis.exclusive.length} cliente(s) exclusivo(s)`,
        detail: `Ningún otro certificador abastece a: ${clientAnalysis.exclusive.slice(0, 4).map(c => c.name).join(', ')}.`,
      });
    }

    // 8. Cut diversity comparison
    const leader2 = ranking[0];
    if (leader2) {
      out.push({
        type: companyStats.uniqueCortes >= leader2.cortes * 0.5 ? 'positive' : 'info',
        icon: Layers,
        title: `Diversidad de cortes: ${companyStats.uniqueCortes} únicos`,
        detail: `El líder (${leader2.name}) certifica ${leader2.cortes} cortes — ${company} cubre ${leader2.cortes > 0 ? fmtPct((companyStats.uniqueCortes / leader2.cortes) * 100) : 'N/A'} del leader.`,
      });
    }

    // 9. Country reach
    if (leader2) {
      out.push({
        type: companyStats.uniquePaises >= leader2.paises * 0.5 ? 'positive' : 'info',
        icon: MapPin,
        title: `Alcance geográfico: ${companyStats.uniquePaises} países`,
        detail: `El líder reacha ${leader2.paises} países — ${company} está presente en ${leader2.paises > 0 ? fmtPct((companyStats.uniquePaises / leader2.paises) * 100) : 'N/A'} de ese alcance.`,
      });
    }

    // 10. Caliral-specific note
    if (company === DEFAULT_COMPANY) {
      out.push({
        type: 'info',
        icon: Building2,
        title: `${company} opera como certificadora y depósito`,
        detail: `No es productora — certifica envíos mayormente de Frigorífico San Jacinto (Nirea S.A.). Los registros donde aparece como destino (ed) corresponden a ingresos a depósito.`,
      });
    }

    return out;
  }, [filteredRecords, competitionRanking, companyStats, clientAnalysis, selectedCompany, totalMarketPn]);

  // ============================================================
  // DEPÓSITOS TAB — COMPUTATIONS (all filtered by tipoProductoFilter)
  // ============================================================

  /** Definitive list of PRODUCERS (from user). Any certificador NOT in this list = deposit. */
  const PRODUCTORES_SET = useMemo(() => new Set([
    'Frigorífico Las Piedras S.A.', 'Frigorífico La Caballada (Cledinor S.A.)',
    'Yarus S.A.', 'Frigosalto (Somicar S.A.)', 'Frigoyí (Bilacor S.A.)',
    'Frigorífico Sirsil S.A. (Sirsil S.A.)', 'Frigorífico Pul (Pulsa S.A.)',
    'Frigorífico El Amanecer (Agroindustrial Del Este S.A.)', 'Breeders & Packers Uruguay S.A.',
    'Frigorífico San Jacinto (Nirea S.A.)', 'Frigorífico Matadero Pando (Ontilcor S.A.)',
    'Solís Meat Uruguay (Ersinal S.A.)', 'Frigorífico Casa Blanca', 'Copayan S.A.',
    'Frigorífico Tacuarembó S.A.', 'Establecimientos Colonia S.A.', 'Frigorífico Canelones S.A.',
    'Frigorífico Clay S.A.', 'Frigorífico Las Moras (Chiadel S.A.)', 'Frigorífico Sarel S.A.',
    'Inaler S.A.', 'Berdick S.A.', 'Despro S.A.', 'Frigorífico Durazno (Frigocerro S.A.)',
    'Frigorífico La Trinidad (Oferan S.A.)', 'Coltirey S.A.', 'Zutfray S.A.', 'Cardama S.A.',
    'Establecimientos Juan Sarubbi S.A.', 'Granja Tres Arroyos Uruguay S.A.', 'Grinsol S.A.',
    'Artica Biotech', 'Tecnoblen S.A.', 'Montesera S.A.', 'Mvdmart S.A.',
    'LONSA SCIENCE S.R.L.', 'Frigorífico Carrasco S.A.', 'Probiomont S.A.', 'Fanaphru S.A.',
  ]), []);

  /** A record is a deposit record when certificador is NOT a producer */
  const depositRecords = useMemo<MovRecord[]>(() => {
    return filteredRecords.filter(r => {
      if (!r.cf) return false;
      // Deposit = certificador is NOT in the producer list
      if (PRODUCTORES_SET.has(r.cf)) return false;
      return true;
    });
  }, [filteredRecords, PRODUCTORES_SET]);

  /** Total peso neto of the deposit market (filtered). */
  const totalDepositPn = useMemo(() => {
    return depositRecords.reduce((s, r) => s + (r.pn || 0), 0);
  }, [depositRecords]);

  // ---------- Section A: Caliral as deposit ----------

  const caliralDepositoStats = useMemo(() => {
    const caliralRecs = depositRecords.filter(r => r.cf === DEFAULT_COMPANY);
    const productoresSet = new Set<string>();
    const meses: Record<string, number> = {};
    const productoresPn: Record<string, number> = {};
    const productoresRegs: Record<string, number> = {};
    let totalPn = 0;

    for (const r of caliralRecs) {
      if (r.p) {
        productoresSet.add(r.p);
        productoresPn[r.p] = (productoresPn[r.p] || 0) + (r.pn || 0);
        productoresRegs[r.p] = (productoresRegs[r.p] || 0) + 1;
      }
      totalPn += r.pn || 0;
      if (r.f) { const m = r.f.substring(0, 7); meses[m] = (meses[m] || 0) + (r.pn || 0); }
    }

    const productoresRanking = Object.entries(productoresPn)
      .map(([name, pn]) => ({ name, pn, regs: productoresRegs[name] || 0 }))
      .sort((a, b) => b.pn - a.pn);

    return {
      productoresCount: productoresSet.size,
      totalPn,
      embarques: caliralRecs.length,
      share: totalDepositPn > 0 ? (totalPn / totalDepositPn) * 100 : 0,
      meses: Object.entries(meses).sort(([a], [b]) => a.localeCompare(b)),
      productoresRanking,
    };
  }, [depositRecords, totalDepositPn]);

  // ---------- Section B: Ranking de Depósitos ----------

  interface DepositoRow {
    name: string; regs: number; pn: number;
    productores: number; clientes: number; share: number;
  }

  const depositosRanking = useMemo<DepositoRow[]>(() => {
    const map: Record<string, {
      regs: number; pn: number;
      productores: Set<string>; clientes: Set<string>;
    }> = {};
    for (const r of depositRecords) {
      const dep = r.cf || '';
      if (!dep) continue;
      if (!map[dep]) map[dep] = { regs: 0, pn: 0, productores: new Set(), clientes: new Set() };
      map[dep].regs++;
      map[dep].pn += r.pn || 0;
      if (r.p) map[dep].productores.add(r.p);
    }
    const totalPn = Object.values(map).reduce((s, v) => s + v.pn, 0) || 1;
    return Object.entries(map)
      .map(([name, v]) => ({
        name, regs: v.regs, pn: v.pn,
        productores: v.productores.size,
        clientes: v.clientes.size,
        share: (v.pn / totalPn) * 100,
      }))
      .sort((a, b) => b.pn - a.pn);
  }, [depositRecords]);

  // ---------- Section C: Mercados / cortes que Caliral NO trabaja ----------

  const caliralNoMercados = useMemo(() => {
    const caliralPaises = new Set<string>();
    const caliralCortes = new Set<string>();
    const otrosPaisesPn: Record<string, number> = {};
    const otrosCortesPn: Record<string, number> = {};

    for (const r of depositRecords) {
      if (r.cf === DEFAULT_COMPANY) {
        if (r.pa) caliralPaises.add(r.pa);
        if (r.co) caliralCortes.add(r.co);
      } else {
        if (r.pa) otrosPaisesPn[r.pa] = (otrosPaisesPn[r.pa] || 0) + (r.pn || 0);
        if (r.co) otrosCortesPn[r.co] = (otrosCortesPn[r.co] || 0) + (r.pn || 0);
      }
    }

    const paisesOportunidad = Object.entries(otrosPaisesPn)
      .filter(([pa]) => !caliralPaises.has(pa))
      .sort(([, a], [, b]) => b - a)
      .map(([pa, pn]) => ({ name: pa, pn }));

    const cortesOportunidad = Object.entries(otrosCortesPn)
      .filter(([co]) => !caliralCortes.has(co))
      .sort(([, a], [, b]) => b - a)
      .map(([co, pn]) => ({ name: co, pn }));

    return { paisesOportunidad, cortesOportunidad };
  }, [depositRecords]);

  // ---------- Section D: Productores que NO usan Caliral ----------

  interface ProductorNoCaliral {
    name: string; mainDeposito: string; pn: number; regs: number;
    paises: number; clientes: number; embarques: number;
    paisesList: string[]; clientesList: string[];
  }

  const productoresNoCaliralRaw = useMemo<ProductorNoCaliral[]>(() => {
    // Find producers who DO use Caliral as a deposit
    const caliralProductores = new Set<string>();
    for (const r of depositRecords) {
      if (r.cf === DEFAULT_COMPANY && r.p) caliralProductores.add(r.p);
    }

    const map: Record<string, {
      pn: number; regs: number;
      paises: Set<string>; clientes: Set<string>;
      depositos: Record<string, number>; embarques: number;
    }> = {};

    for (const r of depositRecords) {
      if (!r.p) continue;
      if (caliralProductores.has(r.p)) continue; // skip producers who use Caliral
      if (!map[r.p]) map[r.p] = {
        pn: 0, regs: 0, paises: new Set(), clientes: new Set(),
        depositos: {}, embarques: 0,
      };
      const agg = map[r.p];
      agg.pn += r.pn || 0;
      agg.regs++;
      if (r.pa) agg.paises.add(r.pa);
      if (r.ed) agg.clientes.add(r.ed);
      const dep = r.cf || '';
      if (dep) agg.depositos[dep] = (agg.depositos[dep] || 0) + (r.pn || 0);
      agg.embarques++;
    }

    return Object.entries(map).map(([name, agg]) => {
      const mainDeposito = sortEntries(agg.depositos)[0]?.[0] || '—';
      return {
        name,
        mainDeposito,
        pn: agg.pn,
        regs: agg.regs,
        paises: agg.paises.size,
        clientes: agg.clientes.size,
        embarques: agg.embarques,
        paisesList: [...agg.paises],
        clientesList: [...agg.clientes],
      };
    });
  }, [depositRecords]);

  // Sorted view of section D (controlled by depositSortKey / depositSortDir)
  const productoresNoCaliral = useMemo<ProductorNoCaliral[]>(() => {
    const arr = [...productoresNoCaliralRaw];
    const dir = depositSortDir === 'asc' ? 1 : -1;
    arr.sort((a: any, b: any) => {
      const av = a[depositSortKey];
      const bv = b[depositSortKey];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return arr;
  }, [productoresNoCaliralRaw, depositSortKey, depositSortDir]);

  // ---------- Section E: Índice de Oportunidad Comercial ----------

  interface OportunidadRow {
    name: string; deposito: string; pn: number;
    growth: number; paises: number; clientes: number; denoms: number;
    score: number; potencial: 'Muy Alto' | 'Alto' | 'Medio' | 'Bajo';
  }

  const oportunidadComercial = useMemo<OportunidadRow[]>(() => {
    if (!depositRecords.length) return [];

    // Identify months for growth windows (last 3 vs previous 3)
    const monthSet = new Set<string>();
    for (const r of depositRecords) {
      if (r.f) monthSet.add(r.f.substring(0, 7));
    }
    const allMonths = [...monthSet].sort();
    const last3 = new Set(allMonths.slice(-3));
    const prev3 = new Set(allMonths.slice(-6, -3));

    // Producers using Caliral — excluded from opportunity index
    const caliralProductores = new Set<string>();
    for (const r of depositRecords) {
      if (r.cf === DEFAULT_COMPANY && r.p) caliralProductores.add(r.p);
    }

    interface ProdAgg {
      pn: number;
      paises: Set<string>;
      clientes: Set<string>; // unique ed (deposits)
      denoms: Set<string>;
      depositoPn: Record<string, number>;
      recentPn: number;
      prevPn: number;
    }
    const aggs: Record<string, ProdAgg> = {};

    for (const r of depositRecords) {
      if (!r.p) continue;
      if (caliralProductores.has(r.p)) continue;
      if (!aggs[r.p]) aggs[r.p] = {
        pn: 0, paises: new Set(), clientes: new Set(), denoms: new Set(),
        depositoPn: {}, recentPn: 0, prevPn: 0,
      };
      const agg = aggs[r.p];
      agg.pn += r.pn || 0;
      if (r.pa) agg.paises.add(r.pa);
      if (r.ed) agg.clientes.add(r.ed);
      if (r.d) agg.denoms.add(r.d);
      const depKey = r.cf || '';
      if (depKey) agg.depositoPn[depKey] = (agg.depositoPn[depKey] || 0) + (r.pn || 0);
      if (r.f) {
        const m = r.f.substring(0, 7);
        if (last3.has(m)) agg.recentPn += r.pn || 0;
        if (prev3.has(m)) agg.prevPn += r.pn || 0;
      }
    }

    const rows = Object.entries(aggs).map(([name, agg]) => {
      const deposito = sortEntries(agg.depositoPn)[0]?.[0] || '—';
      const rawGrowth = agg.prevPn > 0
        ? ((agg.recentPn - agg.prevPn) / agg.prevPn) * 100
        : (agg.recentPn > 0 ? 100 : 0);
      return {
        name,
        deposito,
        pn: agg.pn,
        growth: Math.max(-100, Math.min(200, rawGrowth)),
        paises: agg.paises.size,
        clientes: agg.clientes.size,
        denoms: agg.denoms.size,
      };
    });

    if (!rows.length) return [];

    // Normalize each component to 0-100
    const maxPn = Math.max(...rows.map(r => r.pn), 1);
    const maxPaises = Math.max(...rows.map(r => r.paises), 1);
    const maxClientes = Math.max(...rows.map(r => r.clientes), 1);
    const maxDenoms = Math.max(...rows.map(r => r.denoms), 1);
    const positiveGrowths = rows.map(r => r.growth).filter(g => g > 0);
    const maxGrowth = positiveGrowths.length ? Math.max(...positiveGrowths) : 1;

    const scored = rows.map(r => {
      const volScore = (r.pn / maxPn) * 100;
      const growthScore = r.growth > 0
        ? Math.min(100, (r.growth / maxGrowth) * 100)
        : 0;
      const mercadosScore = (r.paises / maxPaises) * 100;
      const clientesScore = (r.clientes / maxClientes) * 100;
      const divScore = (r.denoms / maxDenoms) * 100;
      const score =
        volScore * 0.30 +
        growthScore * 0.20 +
        mercadosScore * 0.20 +
        clientesScore * 0.15 +
        divScore * 0.15;
      const potencial: OportunidadRow['potencial'] =
        score > 80 ? 'Muy Alto' : score > 60 ? 'Alto' : score > 40 ? 'Medio' : 'Bajo';
      return { ...r, score, potencial };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [depositRecords]);

  // ---------- Section F: Productores con múltiples depósitos (incl. Caliral) ----------

  interface MultiDepositoRow {
    name: string; caliralPn: number; otrosPn: number; total: number;
    caliralPct: number; otrosPct: number; otrosDepositos: [string, number][];
  }

  const multiDepositoCaliral = useMemo<MultiDepositoRow[]>(() => {
    // First pass: collect Caliral weights per producer
    const prodMap: Record<string, {
      caliralPn: number; otrosPn: number; total: number;
      otrosDepositos: Record<string, number>;
    }> = {};

    for (const r of depositRecords) {
      if (!r.p) continue;
      if (!prodMap[r.p]) prodMap[r.p] = { caliralPn: 0, otrosPn: 0, total: 0, otrosDepositos: {} };
      const agg = prodMap[r.p];
      agg.total += r.pn || 0;
      if (r.cf === DEFAULT_COMPANY) {
        agg.caliralPn += r.pn || 0;
      } else {
        agg.otrosPn += r.pn || 0;
        const od = r.cf || '';
        if (od) agg.otrosDepositos[od] = (agg.otrosDepositos[od] || 0) + (r.pn || 0);
      }
    }

    return Object.entries(prodMap)
      .filter(([, v]) => v.caliralPn > 0 && v.otrosPn > 0) // uses Caliral AND others
      .map(([name, v]) => ({
        name,
        caliralPn: v.caliralPn,
        otrosPn: v.otrosPn,
        total: v.total,
        caliralPct: v.total > 0 ? (v.caliralPn / v.total) * 100 : 0,
        otrosPct: v.total > 0 ? (v.otrosPn / v.total) * 100 : 0,
        otrosDepositos: sortEntries(v.otrosDepositos),
      }))
      .sort((a, b) => b.total - a.total);
  }, [depositRecords]);

  // ---------- Section G: Insights automáticos de depósitos ----------

  const depositosInsights = useMemo<Insight[]>(() => {
    if (!depositRecords.length) return [];
    const out: Insight[] = [];

    // Producer counts
    const totalProductores = new Set<string>();
    const caliralProductores = new Set<string>();
    for (const r of depositRecords) {
      if (r.p) totalProductores.add(r.p);
      if (r.cf === DEFAULT_COMPANY && r.p) caliralProductores.add(r.p);
    }
    const pctProductores = totalProductores.size > 0
      ? (caliralProductores.size / totalProductores.size) * 100
      : 0;

    // 1. Caliral coverage of producers
    out.push({
      type: pctProductores > 30 ? 'positive' : pctProductores > 10 ? 'info' : 'warning',
      icon: Users,
      title: `${DEFAULT_COMPANY} atiende a ${caliralProductores.size} productores de ${totalProductores.size} totales (${pctProductores.toFixed(1)}%)`,
      detail: `Captación de productores como depósito en el mercado.`,
    });

    // 2. Top competitor as deposit
    const rankingSinCaliral = depositosRanking.filter(r => r.name !== DEFAULT_COMPANY);
    const topComp = rankingSinCaliral[0];
    if (topComp) {
      out.push({
        type: 'info',
        icon: Crown,
        title: `Top competidor como depósito: ${topComp.name}`,
        detail: `Con ${topComp.share.toFixed(2)}% de mercado (${fmtKg(topComp.pn)}), ${topComp.productores} productores y ${topComp.clientes} clientes.`,
      });
    }

    // 3. Producers not using Caliral (top 3 by volumen)
    for (const p of productoresNoCaliralRaw.slice(0, 3)) {
      out.push({
        type: 'opportunity',
        icon: Target,
        title: `${p.name} utiliza ${p.mainDeposito} pero nunca ${DEFAULT_COMPANY}`,
        detail: `Potencial: ${fmtKg(p.pn)} en ${p.embarques} embarques a ${p.paises} país(es).`,
      });
    }

    // 4. Multi-deposit producers (top 3)
    for (const p of multiDepositoCaliral.slice(0, 3)) {
      out.push({
        type: 'info',
        icon: Network,
        title: `${p.name} envía ${p.caliralPct.toFixed(1)}% por ${DEFAULT_COMPANY} y ${p.otrosPct.toFixed(1)}% por otros depósitos`,
        detail: `${DEFAULT_COMPANY}: ${fmtKg(p.caliralPn)} · Otros: ${fmtKg(p.otrosPn)} · Total: ${fmtKg(p.total)}.`,
      });
    }

    // 5. Countries Caliral doesn't serve (top 3 opportunities)
    for (const { name, pn } of caliralNoMercados.paisesOportunidad.slice(0, 3)) {
      out.push({
        type: 'opportunity',
        icon: Globe,
        title: `${DEFAULT_COMPANY} no atiende envíos a ${name}`,
        detail: `Oportunidad de ${fmtKg(pn)} atendida por otros depósitos.`,
      });
    }

    // 6. Cuts Caliral doesn't ship (top 3)
    for (const { name, pn } of caliralNoMercados.cortesOportunidad.slice(0, 3)) {
      out.push({
        type: 'opportunity',
        icon: Package,
        title: `${DEFAULT_COMPANY} no procesa el corte ${name}`,
        detail: `Demanda potencial de ${fmtKg(pn)} en otros depósitos.`,
      });
    }

    return out;
  }, [depositRecords, depositosRanking, productoresNoCaliralRaw, multiDepositoCaliral, caliralNoMercados]);


  // ============================================================
  // MERCADO ASSISTANT + EXCEL IMPORT
  // ============================================================

  const entityRoleSummary = useMemo(() => {
    const productores = new Set<string>();
    const depositos = new Set<string>();
    const competencia = new Set<string>();
    for (const r of filteredRecords) {
      if (r.p && PRODUCTORES_SET.has(r.p)) productores.add(r.p);
      if (r.cf) {
        const role = getEntityRole(r.cf, PRODUCTORES_SET);
        if (role === 'mi_empresa') continue;
        if (role === 'productor') competencia.add(r.cf);
        if (role === 'deposito_competencia') depositos.add(r.cf);
      }
    }
    return { productores: productores.size, depositos: depositos.size, competencia: competencia.size };
  }, [filteredRecords, PRODUCTORES_SET]);

  const mercadoAssistantContext = useMemo(() => {
    const topCompetidor = competitionRanking.find(r => !isCaliralName(r.name));
    const topDeposito = depositosRanking.find(r => !isCaliralName(r.name));
    const topProductorSinCaliral = productoresNoCaliralRaw[0];
    const topOportunidad = oportunidadComercial[0];
    const topCaliralProductor = caliralDepositoStats.productoresRanking[0];
    return [
      `Empresa propia: ${COMPANY_DISPLAY_NAME}. En la base puede figurar como ${DEFAULT_COMPANY}; cualquier Caliral/Calirar/Frimaral se interpreta como empresa propia.`,
      `Regla de clasificación: productores = lista PRODUCTORES_SET; depósitos = certificadores que NO están en PRODUCTORES_SET; competencia = todo certificador/productor que no sea ${COMPANY_DISPLAY_NAME}.`,
      `Filtro actual: ${tipoProductoFilter}. Registros filtrados: ${fmt(filteredRecords.length)}. Peso mercado: ${fmtKg(totalMarketPn)}.`,
      `${COMPANY_DISPLAY_NAME} como certificador/deposito: ${fmtKg(companyStats.totalPn)}, ${fmtPct(companyStats.marketShare)} del mercado general; como depósito: ${fmtKg(caliralDepositoStats.totalPn)}, ${fmtPct(caliralDepositoStats.share)} del mercado de depósitos.`,
      `Entidades detectadas: ${entityRoleSummary.productores} productores, ${entityRoleSummary.depositos} depósitos/competidores logísticos y ${entityRoleSummary.competencia} productores competidores.`,
      topCompetidor ? `Principal competidor general: ${topCompetidor.name} (${fmtKg(topCompetidor.pn)}, ${fmtPct(topCompetidor.share)}).` : '',
      topDeposito ? `Principal depósito competidor: ${topDeposito.name} (${fmtKg(topDeposito.pn)}, ${fmtPct(topDeposito.share)} del mercado depósitos).` : '',
      topCaliralProductor ? `Principal productor que usa ${COMPANY_DISPLAY_NAME}: ${topCaliralProductor.name} (${fmtKg(topCaliralProductor.pn)}).` : '',
      topProductorSinCaliral ? `Mayor productor que NO usa ${COMPANY_DISPLAY_NAME}: ${topProductorSinCaliral.name}; usa ${topProductorSinCaliral.mainDeposito}; volumen ${fmtKg(topProductorSinCaliral.pn)}.` : '',
      topOportunidad ? `Mejor oportunidad comercial: ${topOportunidad.name}; depósito actual ${topOportunidad.deposito}; score ${topOportunidad.score.toFixed(1)}; potencial ${topOportunidad.potencial}.` : '',
      `Países que ${COMPANY_DISPLAY_NAME} no atiende como depósito: ${caliralNoMercados.paisesOportunidad.slice(0, 5).map(p => `${p.name} ${fmtKg(p.pn)}`).join(', ') || 'sin brechas detectadas'}.`,
      `Cortes que ${COMPANY_DISPLAY_NAME} no procesa como depósito: ${caliralNoMercados.cortesOportunidad.slice(0, 5).map(c => `${c.name} ${fmtKg(c.pn)}`).join(', ') || 'sin brechas detectadas'}.`,
    ].filter(Boolean).join('\n');
  }, [competitionRanking, depositosRanking, productoresNoCaliralRaw, oportunidadComercial, caliralDepositoStats, companyStats, tipoProductoFilter, filteredRecords, totalMarketPn, entityRoleSummary, caliralNoMercados]);

  const answerMercadoQuestion = useCallback((question: string): string => {
    const q = question.toLowerCase();
    if (!question.trim()) return 'Escribí una pregunta sobre mercado nacional, depósitos, productores, competencia, cortes, países u oportunidades.';

    if (q.includes('regla') || q.includes('diferenci') || q.includes('deposit') || q.includes('productor')) {
      return `Regla usada: ${COMPANY_DISPLAY_NAME} es tu empresa. Los productores salen de una lista cerrada de plantas/productores conocidos. Todo certificador que NO está en esa lista se clasifica como depósito; si además no es ${COMPANY_DISPLAY_NAME}, es competencia logística/de depósito. Por eso no todo lo que aparece como certificador es productor.`;
    }
    if (q.includes('compet')) {
      const rows = competitionRanking.filter(r => !isCaliralName(r.name)).slice(0, 5);
      return `Top competencia general por peso neto:\n${rows.map((r, i) => `${i + 1}. ${r.name}: ${fmtKg(r.pn)} (${fmtPct(r.share)})`).join('\n')}`;
    }
    if (q.includes('oportun')) {
      return `Principales oportunidades para ${COMPANY_DISPLAY_NAME}:\n${oportunidadComercial.slice(0, 5).map((r, i) => `${i + 1}. ${r.name}: score ${r.score.toFixed(1)} (${r.potencial}), hoy usa ${r.deposito}, volumen ${fmtKg(r.pn)}`).join('\n') || 'No hay oportunidades detectadas con el filtro actual.'}`;
    }
    if (q.includes('pais') || q.includes('país') || q.includes('mercado')) {
      return `Países/destinos que ${COMPANY_DISPLAY_NAME} no atiende como depósito y otros sí:\n${caliralNoMercados.paisesOportunidad.slice(0, 8).map((p, i) => `${i + 1}. ${p.name}: ${fmtKg(p.pn)}`).join('\n') || 'No hay brechas de países con el filtro actual.'}`;
    }
    if (q.includes('corte') || q.includes('producto')) {
      return `Cortes que ${COMPANY_DISPLAY_NAME} no procesa como depósito y otros sí:\n${caliralNoMercados.cortesOportunidad.slice(0, 8).map((c, i) => `${i + 1}. ${c.name}: ${fmtKg(c.pn)}`).join('\n') || 'No hay brechas de cortes con el filtro actual.'}`;
    }
    if (q.includes('calirar') || q.includes('caliral') || q.includes('frimaral')) {
      return `${COMPANY_DISPLAY_NAME}: ${fmtKg(caliralDepositoStats.totalPn)} como depósito, ${fmt(caliralDepositoStats.embarques)} embarques, ${caliralDepositoStats.productoresCount} productores y ${fmtPct(caliralDepositoStats.share)} del mercado de depósitos. Principal productor: ${caliralDepositoStats.productoresRanking[0]?.name || 'sin datos'}.`;
    }

    return `${mercadoAssistantContext}\n\nSi querés, preguntame por: “top competencia”, “oportunidades”, “productores que no usan Calirar”, “países que no atiendo”, “cortes que no proceso” o “regla depósitos vs productores”.`;
  }, [competitionRanking, oportunidadComercial, caliralNoMercados, caliralDepositoStats, mercadoAssistantContext]);

  const handleAssistantAsk = useCallback(async (preset?: string) => {
    const question = (preset || assistantQuestion).trim();
    if (!question) return;
    setAssistantLoading(true);
    try {
      const localAnswer = answerMercadoQuestion(question);
      const puter = (window as unknown as { puter?: { ai?: { chat?: (messages: unknown, options?: unknown) => Promise<unknown> } } }).puter;
      if (puter?.ai?.chat) {
        const response = await Promise.race([
          puter.ai.chat([
            { role: 'system', content: `Sos asistente experto de Mercado Nacional para ${COMPANY_DISPLAY_NAME}. Respondé en español, con números concretos, y recordá que Calirar/Frimaral/Caliral es la empresa propia; lo demás es competencia. No confundas productores con depósitos: ${mercadoAssistantContext}` },
            { role: 'user', content: question },
          ], { model: 'gpt-5.4-nano' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
        ]);
        setAssistantAnswer(String(response || localAnswer));
      } else {
        setAssistantAnswer(localAnswer);
      }
    } catch {
      setAssistantAnswer(answerMercadoQuestion(question));
    } finally {
      setAssistantLoading(false);
    }
  }, [assistantQuestion, answerMercadoQuestion, mercadoAssistantContext]);

  function mapExcelRow(row: Record<string, unknown>, idx: number): MovRecord | null {
    const pick = (...keys: string[]) => keys.map(k => row[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
    const cf = String(pick('Certificador', 'Establecimiento Certificador', 'Nombre del Establecimiento Certificador', 'cf') || '').trim();
    const p = String(pick('Productor', 'Nombre Establecimiento Productor', 'Establecimiento Productor', 'p') || '').trim();
    const cote = String(pick('COTE', 'Nro. de C.O.T.E.', 'Nro COTE', 'c') || '').trim();
    const tramite = String(pick('Nro. Trámite', 'Trámite', 't') || '').trim();
    if (!cf && !p && !cote && !tramite) return null;
    const fechaRaw = pick('Fecha', 'Fecha del Trámite', 'f');
    // Handle Date objects, Excel serial numbers, and strings
    let fecha: string;
    if (fechaRaw instanceof Date) {
      fecha = fechaRaw.toISOString();
    } else if (typeof fechaRaw === 'number') {
      // Excel serial date (days since 1899-12-30)
      const dt = new Date((fechaRaw - 25569) * 86400 * 1000);
      fecha = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
    } else if (fechaRaw) {
      const dt = new Date(String(fechaRaw));
      fecha = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
    } else {
      fecha = new Date().toISOString();
    }
    return {
      t: tramite || `imp-${Date.now()}-${idx}`,
      f: fecha.substring(0, 10),
      c: cote,
      cf,
      p,
      np: String(pick('Nro. Establecimiento Productor', 'np') || ''),
      ed: String(pick('Destino', 'Nombre Establecimiento Destino', 'ed') || ''),
      tm: String(pick('Tipo de Movimiento', 'Movimiento', 'tm') || ''),
      pa: String(pick('País', 'Pais', 'País de Destino', 'pa') || ''),
      d: String(pick('Denominación de Mercadería', 'Producto', 'd') || ''),
      co: String(pick('Corte', 'co') || ''),
      pa2: Number(pick('Pallets', 'pa2') || 0) || 0,
      e: Number(pick('Cantidad de Envases', 'Envases', 'e') || 0) || 0,
      pb: Number(pick('Peso Bruto', 'pb') || 0) || 0,
      pn: Number(pick('Peso Neto', 'pn') || 0) || 0,
      tt: String(pick('Tipo de Transporte', 'Transporte', 'tt') || ''),
      sh: String(pick('Shipping', 'sh') || ''),
      tpd: String(pick('Tipo Producto', 'tpd') || '').includes('Fresco') ? 'Fresco' : String(pick('Tipo Producto', 'tpd') || '').includes('Congelado') ? 'Congelado' : undefined,
      isd: Boolean(cf && p && cf !== p && !PRODUCTORES_SET.has(cf)),
      dep: cf && !PRODUCTORES_SET.has(cf) ? cf : undefined,
    };
  }

  const handleExcelUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingExcel(true);
    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();

      // For large files (>20MB), use sheet_to_json with raw:true to avoid slow date parsing
      const isLargeFile = file.size > 20 * 1024 * 1024;
      const wb = XLSX.read(ab, { type: 'array', cellDates: !isLargeFile, raw: isLargeFile });
      
      // Process first sheet only
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      
      // For large files, read in chunks using sheet_to_json with header:1 (array of arrays, faster)
      let rows: Record<string, unknown>[];
      if (isLargeFile) {
        // Read as array of arrays first (much faster for large files)
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
        if (rawRows.length < 16) {
          toast.error('El archivo no tiene suficientes filas.');
          return;
        }
        // Find header row (row with 'Nro. Trámite' or similar)
        let headerIdx = 0;
        for (let i = 0; i < Math.min(20, rawRows.length); i++) {
          if (rawRows[i] && rawRows[i].some((c: unknown) => String(c || '').includes('Trámite') || String(c || '').includes('tramite'))) {
            headerIdx = i;
            break;
          }
        }
        const headers = (rawRows[headerIdx] as unknown[]).map((h: unknown) => String(h || ''));
        // Map to objects
        rows = rawRows.slice(headerIdx + 1).map((rawRow: unknown[]) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((h: string, i: number) => {
            obj[h] = rawRow[i] ?? '';
          });
          return obj;
        });
      } else {
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      }

      // Free memory from the workbook
      delete wb.Sheets[sheetName];

      const mapped = rows.map(mapExcelRow).filter((r): r is MovRecord => Boolean(r));
      // Free rows memory
      rows.length = 0;

      if (!mapped.length) {
        toast.error('No pude reconocer registros. Revisá encabezados como Certificador, Productor, COTE, País, Corte, Peso Neto.');
        return;
      }
      setRecords(mapped);
      setSelectedCompany(DEFAULT_COMPANY);
      toast.success(`Excel cargado: ${fmt(mapped.length)} registros.`);
    } catch (err) {
      console.error('Mercado import error:', err);
      const msg = file.size > 50 * 1024 * 1024
        ? `El archivo es muy grande (${(file.size / 1024 / 1024).toFixed(0)}MB). Probá exportarlo como CSV desde Excel (pesa 80% menos) y subirlo.`
        : 'Error al leer el Excel. Si pesa más de 50MB, exportalo como CSV.';
      toast.error(msg);
    } finally {
      setImportingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [PRODUCTORES_SET]);

  // ============================================================
  // EXPORT TO EXCEL
  // ============================================================

  const handleExport = useCallback(async () => {
    if (!records.length) {
      toast.error('Los datos aún están cargando');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const stamp = new Date().toISOString().split('T')[0];
      const filterLabel = tipoProductoFilter === 'todos' ? 'Todos' : (tipoProductoFilter === 'congelado' ? 'Congelado' : 'Fresco');

      // Sheet 1: Company KPIs
      const kpiSheet = [
        { Métrica: 'Empresa', Valor: selectedCompany },
        { Métrica: 'Filtro TipoProducto', Valor: filterLabel },
        { Métrica: 'Registros', Valor: companyStats.total },
        { Métrica: 'Cajas', Valor: companyStats.totalCajas },
        { Métrica: 'Peso Neto (kg)', Valor: companyStats.totalPn },
        { Métrica: 'Clientes únicos', Valor: companyStats.uniqueClientes },
        { Métrica: 'Cortes únicos', Valor: companyStats.uniqueCortes },
        { Métrica: 'Países', Valor: companyStats.uniquePaises },
        { Métrica: 'Participación de mercado %', Valor: companyStats.marketShare.toFixed(2) },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiSheet), 'KPIs');

      // Sheet 2: Competition ranking
      const compSheet = competitionRanking.map((r, i) => ({
        '#': i + 1,
        Empresa: r.name,
        Registros: r.regs,
        Cajas: r.cajas,
        'Peso Neto (kg)': r.pn,
        Países: r.paises,
        Cortes: r.cortes,
        '% Mercado': r.share.toFixed(2),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compSheet), 'Competencia');

      // Sheet 3: Clients
      const clientSheet = clientAnalysis.topClients.map((c, i) => ({
        '#': i + 1,
        Cliente: c.name,
        'Peso Neto (kg)': c.pn,
        Tipo: clientAnalysis.exclusive.some(e => e.name === c.name) ? 'Exclusivo' : 'Compartido',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientSheet), 'Clientes');

      // Sheet 4: Cortes ranking
      const cortesSheet = companyStats.cortes.map(([co, pn], i) => ({
        '#': i + 1, Corte: co, 'Peso Neto (kg)': pn,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cortesSheet), 'Cortes');

      // Sheet 5: Paises ranking
      const paisesSheet = companyStats.paises.map(([pa, pn], i) => ({
        '#': i + 1, País: pa, 'Peso Neto (kg)': pn,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paisesSheet), 'Paises');

      // Sheet 6: Insights
      const insSheet = insights.map(ins => ({
        Tipo: ins.type, Título: ins.title, Detalle: ins.detail,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(insSheet), 'Insights');

      // Sheet 7: Depósitos ranking
      const depSheet = depositosRanking.map((r, i) => ({
        '#': i + 1,
        Depósito: r.name,
        Registros: r.regs,
        'Peso Neto (kg)': r.pn,
        'Productores únicos': r.productores,
        'Clientes únicos': r.clientes,
        '% Mercado': r.share.toFixed(2),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(depSheet), 'Depositos');

      // Sheet 8: Oportunidad comercial
      const opSheet = oportunidadComercial.map((r, i) => ({
        '#': i + 1,
        Productor: r.name,
        'Depósito actual': r.deposito,
        'Volumen (kg)': r.pn,
        'Crecimiento %': r.growth.toFixed(2),
        Países: r.paises,
        Clientes: r.clientes,
        Denominaciones: r.denoms,
        Score: r.score.toFixed(2),
        Potencial: r.potencial,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(opSheet), 'Oportunidad');

      XLSX.writeFile(wb, `mercado_nacional_${selectedCompany.replace(/[^a-zA-Z0-9]/g, '_')}_${stamp}.xlsx`);
      toast.success('Excel exportado correctamente');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Error al exportar Excel');
    }
  }, [records, tipoProductoFilter, selectedCompany, companyStats, competitionRanking, clientAnalysis, insights, depositosRanking, oportunidadComercial]);

  // ============================================================
  // TABS DEFINITION
  // ============================================================

  const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'competencia', label: 'Competencia', icon: Crown },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'cortes', label: 'Cortes & Destinos', icon: Package },
    { id: 'depositos', label: 'Depósitos', icon: Warehouse },
    { id: 'insights', label: 'Insights', icon: Lightbulb },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  if (!analytics && loadingRecords) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="text-sm font-medium text-slate-600">{loadProgress || 'Cargando datos…'}</p>
            <p className="text-xs text-slate-400">Mercado Nacional · Business Intelligence</p>
          </CardContent>
        </Card>
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ===== HEADER ===== */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">Mercado Nacional · BI</h2>
                <p className="text-[11px] text-slate-500">Análisis competitivo · {fmt(records.length)} registros · {analytics ? `${analytics.totalPeso.toLocaleString('es')} kg total mercado` : ''}</p>
              </div>
            </div>
            <div className="flex gap-2 items-center w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial min-w-0">
                <label className="text-[10px] font-medium text-slate-500 uppercase block sm:hidden">Empresa</label>
                <select
                  value={selectedCompany}
                  onChange={e => setSelectedCompany(e.target.value)}
                  className="w-full sm:w-auto max-w-[220px] sm:max-w-[280px] text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 truncate"
                  disabled={loadingRecords}
                >
                  {companyList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.xlsb" className="hidden" onChange={handleExcelUpload} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importingExcel}
                className="shrink-0"
              >
                {importingExcel ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />} Cargar Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loadingRecords || !records.length}
                className="shrink-0"
              >
                <Download className="w-4 h-4 mr-1.5" /> Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== GLOBAL TipoProducto FILTER (affects ALL tabs) ===== */}
      <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-900/10">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <Boxes className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Tipo de Producto</span>
            </div>
            {([
              { id: 'todos', label: 'Todos', short: 'Todos' },
              { id: 'congelado', label: 'Congelado', short: 'Congelado' },
              { id: 'fresco', label: 'Refrigerado/Fresco', short: 'Fresco' },
            ] as { id: TipoProductoFilter; label: string; short: string }[]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setTipoProductoFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                  tipoProductoFilter === opt.id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-400'
                }`}
              >
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.short}</span>
              </button>
            ))}
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {fmt(filteredRecords.length)} registros · {fmtKg(totalMarketPn)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ===== ASISTENTE MERCADO ===== */}
      <Card className="border-violet-200 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-900/10">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-violet-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Asistente de Mercado Nacional</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Entiende que <strong>{COMPANY_DISPLAY_NAME}</strong> es tu empresa; todo lo demás es competencia. Diferencia productores vs depósitos con la regla de productores conocidos: si un certificador no está en esa lista, se analiza como depósito.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['¿Cuál es la regla depósitos vs productores?', 'Top competencia', 'Oportunidades para Calirar', 'Productores que no usan Calirar', 'Países que no atiendo', 'Cortes que no proceso'].map(q => (
              <button key={q} onClick={() => handleAssistantAsk(q)} className="text-[10px] px-2 py-1 rounded-full bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40">
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={assistantQuestion}
              onChange={e => setAssistantQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAssistantAsk(); }}
              placeholder="Preguntá por competencia, productores, depósitos, países, cortes u oportunidades…"
              className="text-sm"
            />
            <Button onClick={() => handleAssistantAsk()} disabled={assistantLoading || !assistantQuestion.trim()} className="bg-violet-600 hover:bg-violet-700">
              {assistantLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          {assistantAnswer && (
            <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-white/80 dark:bg-slate-950/60 p-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {assistantAnswer}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== TABS ===== */}
      <div className="flex gap-0.5 overflow-x-auto border-b border-slate-200 dark:border-slate-700 -mb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* ===== LOADING RECORDS BANNER ===== */}
      {loadingRecords && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="p-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{loadProgress || 'Cargando registros…'}</p>
          </CardContent>
        </Card>
      )}

      {/* ===== TAB CONTENT ===== */}
      {!loadingRecords && records.length > 0 && (
        <>
          {/* ============ DASHBOARD TAB ============ */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard icon={Weight} label="Peso Neto" value={fmtKg(companyStats.totalPn)} sublabel={`${fmt(companyStats.totalCajas)} cajas`} color={PALETTE_HEX[0]} />
                <KpiCard icon={Ship} label="Embarques" value={fmt(companyStats.total)} sublabel="registros" color={PALETTE_HEX[1]} />
                <KpiCard icon={Users} label="Clientes" value={fmt(companyStats.uniqueClientes)} sublabel="únicos" color={PALETTE_HEX[2]} />
                <KpiCard icon={Package} label="Cortes" value={fmt(companyStats.uniqueCortes)} sublabel="únicos" color={PALETTE_HEX[3]} />
                <KpiCard icon={Globe} label="Países" value={fmt(companyStats.uniquePaises)} sublabel="destinos" color={PALETTE_HEX[5]} />
                <KpiCard icon={Award} label="Participación" value={fmtPct(companyStats.marketShare)} sublabel="del mercado" color={PALETTE_HEX[4]} />
              </div>

              {/* Monthly evolution */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionTitle
                    icon={Calendar}
                    title="Evolución mensual"
                    subtitle={`Peso neto por mes — ${selectedCompany}`}
                  />
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  {monthlyEvolution.length > 0 ? (
                    <VBarChart
                      data={monthlyEvolution.map(m => ({ label: m.label, value: m.value }))}
                      compareTo={monthlyEvolution.map(m => ({ label: m.label, value: m.marketValue }))}
                    />
                  ) : (
                    <EmptyState message="Sin datos de evolución temporal" />
                  )}
                </CardContent>
              </Card>

              {/* Top paises + Top cortes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Globe} title="Top 5 países" subtitle="Por peso neto" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {companyStats.paises.length > 0 ? (
                      <div className="space-y-2">
                        {companyStats.paises.slice(0, 5).map(([pa, pn], i) => (
                          <HBar key={pa} label={pa} value={pn} max={companyStats.paises[0][1]} color={PALETTE_HEX[i % PALETTE_HEX.length]} format={fmtKg} />
                        ))}
                      </div>
                    ) : <EmptyState message="Sin datos de países" />}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Package} title="Top 5 cortes" subtitle="Por peso neto" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {companyStats.cortes.length > 0 ? (
                      <div className="space-y-2">
                        {companyStats.cortes.slice(0, 5).map(([co, pn], i) => (
                          <HBar key={co} label={co} value={pn} max={companyStats.cortes[0][1]} color={PALETTE_HEX[(i + 2) % PALETTE_HEX.length]} format={fmtKg} />
                        ))}
                      </div>
                    ) : <EmptyState message="Sin datos de cortes" />}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ============ COMPETENCIA TAB ============ */}
          {activeTab === 'competencia' && (
            <div className="space-y-4">
              {/* Top N selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500">Mostrar top:</span>
                {[5, 10, 20].map(n => (
                  <button
                    key={n}
                    onClick={() => setTopN(n as 5 | 10 | 20)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      topN === n
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {competitionRanking.length} certificadores totales
                </Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Ranking bar chart */}
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={BarChart3} title="Ranking de frigoríficos" subtitle={`Top ${topN} por peso neto · verde = ${selectedCompany}`} />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-2">
                      {competitionRanking.slice(0, topN).map((row, i) => {
                        const isMe = row.name === selectedCompany;
                        return (
                          <HBar
                            key={row.name}
                            label={`${i + 1}. ${row.name.substring(0, 28)}`}
                            value={row.pn}
                            max={competitionRanking[0].pn}
                            color={isMe ? COMPANY_COLOR : COMPETITOR_COLOR}
                            format={fmtKg}
                            highlight={isMe}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Market share pie */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={PieIcon} title="Participación de mercado" subtitle={`Top ${topN} + Otros`} />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <PieChart
                      data={[
                        ...competitionRanking.slice(0, topN).map((r, i) => ({
                          label: r.name,
                          value: r.pn,
                          color: r.name === selectedCompany ? COMPANY_COLOR : PALETTE_HEX[i % PALETTE_HEX.length],
                        })),
                        {
                          label: 'Otros',
                          value: competitionRanking.slice(topN).reduce((s, r) => s + r.pn, 0),
                          color: '#cbd5e1',
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Full ranking table */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionTitle icon={Layers} title="Tabla completa de competencia" subtitle={`${competitionRanking.length} certificadores ordenados por peso neto`} />
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                        <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                          <th className="px-3 py-2 font-semibold">#</th>
                          <th className="px-3 py-2 font-semibold">Empresa</th>
                          <th className="px-3 py-2 font-semibold text-right">Registros</th>
                          <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">Cajas</th>
                          <th className="px-3 py-2 font-semibold text-right">Peso Neto</th>
                          <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Países</th>
                          <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Cortes</th>
                          <th className="px-3 py-2 font-semibold text-right">% Mercado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {competitionRanking.map((row, i) => {
                          const isMe = row.name === selectedCompany;
                          return (
                            <tr
                              key={row.name}
                              className={`border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isMe ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''}`}
                            >
                              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={row.name}>
                                {isMe && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />}
                                {row.name}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(row.regs)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden sm:table-cell">{fmt(row.cajas)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(row.pn)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">{row.paises}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">{row.cortes}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                <span className={isMe ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                                  {row.share.toFixed(2)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ============ CLIENTES TAB ============ */}
          {activeTab === 'clientes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Top clients */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Users} title="Top clientes por peso" subtitle={`Destinos de ${selectedCompany} (excluye puertos y aeropuertos)`} />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {clientAnalysis.topClients.length > 0 ? (
                      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-2">
                        {clientAnalysis.topClients.map((c, i) => (
                          <HBar
                            key={c.name}
                            label={c.name.substring(0, 28)}
                            value={c.pn}
                            max={clientAnalysis.topClients[0].pn}
                            color={PALETTE_HEX[i % PALETTE_HEX.length]}
                            format={fmtKg}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="La empresa no tiene clientes directos (solo envíos a puertos)" />
                    )}
                  </CardContent>
                </Card>

                {/* Exclusive vs shared summary */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Target} title="Exclusividad" subtitle="Resumen de clientes" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4 space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{clientAnalysis.exclusive.length}</p>
                        <p className="text-[10px] text-slate-500">Clientes exclusivos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{clientAnalysis.shared.length}</p>
                        <p className="text-[10px] text-slate-500">Clientes compartidos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{clientAnalysis.topClients.length}</p>
                        <p className="text-[10px] text-slate-500">Clientes totales</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Exclusive + shared lists */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={CheckCircle2} title="Clientes exclusivos" subtitle="Solo abastecidos por la empresa seleccionada" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {clientAnalysis.exclusive.length > 0 ? (
                      <div className="space-y-1 max-h-72 overflow-y-auto pr-2">
                        {clientAnalysis.exclusive.map(c => (
                          <div key={c.name} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                            <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate" title={c.name}>{c.name}</span>
                            <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700 dark:text-emerald-400">Exclusivo</Badge>
                            <span className="text-xs font-mono text-slate-500 w-20 text-right">{fmtKg(c.pn)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="Sin clientes exclusivos" />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Users} title="Clientes compartidos" subtitle="Atendidos también por otros certificadores" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {clientAnalysis.shared.length > 0 ? (
                      <div className="space-y-1 max-h-72 overflow-y-auto pr-2">
                        {clientAnalysis.shared.map(c => (
                          <div key={c.name} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20">
                            <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate" title={c.name}>{c.name}</span>
                            <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700 dark:text-blue-400">{c.competitors} cert.</Badge>
                            <span className="text-xs font-mono text-slate-500 w-20 text-right">{fmtKg(c.pn)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="Sin clientes compartidos" />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ============ CORTES & DESTINOS TAB ============ */}
          {activeTab === 'cortes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Cortes ranking */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Package} title="Ranking de cortes" subtitle={`Top 15 por peso neto — ${selectedCompany}`} />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {companyStats.cortes.length > 0 ? (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-2">
                        {companyStats.cortes.slice(0, 15).map(([co, pn], i) => (
                          <HBar key={co} label={co.substring(0, 24)} value={pn} max={companyStats.cortes[0][1]} color={PALETTE_HEX[i % PALETTE_HEX.length]} format={fmtKg} />
                        ))}
                      </div>
                    ) : <EmptyState message="Sin datos de cortes" />}
                  </CardContent>
                </Card>

                {/* Paises ranking */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Globe} title="Ranking de destinos" subtitle={`Top 15 países por peso neto — ${selectedCompany}`} />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {companyStats.paises.length > 0 ? (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-2">
                        {companyStats.paises.slice(0, 15).map(([pa, pn], i) => (
                          <HBar key={pa} label={pa.substring(0, 24)} value={pn} max={companyStats.paises[0][1]} color={PALETTE_HEX[(i + 1) % PALETTE_HEX.length]} format={fmtKg} />
                        ))}
                      </div>
                    ) : <EmptyState message="Sin datos de países" />}
                  </CardContent>
                </Card>
              </div>

              {/* Heatmap cortes × paises */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionTitle icon={Layers} title="Heatmap: cortes × destinos" subtitle={`Distribución de peso neto — ${selectedCompany}`} />
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  {heatmapData.cortes.length > 0 && heatmapData.paises.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase sticky left-0 bg-white dark:bg-slate-900">Corte \ País</th>
                            {heatmapData.paises.map(pa => (
                              <th key={pa} className="px-1 py-2 text-center text-[9px] font-medium text-slate-500 min-w-[50px]" title={pa}>
                                <div className="rotate-0 truncate max-w-[60px]">{pa.substring(0, 8)}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {heatmapData.cortes.map(co => (
                            <tr key={co} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 truncate max-w-[140px] sticky left-0 bg-white dark:bg-slate-900" title={co}>
                                {co}
                              </td>
                              {heatmapData.paises.map(pa => (
                                <HeatCell key={pa} value={heatmapData.matrix[co]?.[pa] || 0} max={heatmapData.maxVal} color={COMPANY_COLOR} />
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState message="Datos insuficientes para el heatmap" />
                  )}
                  <p className="text-[10px] text-slate-400 mt-2">Intensidad de color proporcional al peso neto. Valores en kg (K = miles).</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ============ DEPÓSITOS TAB ============ */}
          {activeTab === 'depositos' && (
            <div className="space-y-4">
              {/* ===== Section A: Posicionamiento de Caliral como Depósito ===== */}
              <div className="flex items-center gap-2 pt-1">
                <Warehouse className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">A · Posicionamiento de {DEFAULT_COMPANY} como Depósito</h3>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon={Users} label="Productores" value={fmt(caliralDepositoStats.productoresCount)} sublabel="usan Caliral" color={PALETTE_HEX[0]} />
                <KpiCard icon={Weight} label="Peso Neto" value={fmtKg(caliralDepositoStats.totalPn)} sublabel="en Caliral" color={PALETTE_HEX[1]} />
                <KpiCard icon={Ship} label="Embarques" value={fmt(caliralDepositoStats.embarques)} sublabel="registros a depósito" color={PALETTE_HEX[2]} />
                <KpiCard icon={Award} label="Participación" value={fmtPct(caliralDepositoStats.share)} sublabel="mercado de depósitos" color={PALETTE_HEX[3]} />
              </div>

              {/* Monthly evolution + Productores ranking */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Calendar} title="Evolución mensual" subtitle={`Peso neto por mes — ${DEFAULT_COMPANY} como depósito`} />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {caliralDepositoStats.meses.length > 0 ? (
                      <VBarChart
                        data={caliralDepositoStats.meses.map(([m, v]) => ({ label: monthLabel(m), value: v }))}
                        color={COMPANY_COLOR}
                      />
                    ) : (
                      <EmptyState message="Sin datos de evolución temporal" />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Users} title="Ranking de productores" subtitle={`Que usan ${DEFAULT_COMPANY} como depósito`} />
                  </CardHeader>
                  <CardContent className="p-0">
                    {caliralDepositoStats.productoresRanking.length > 0 ? (
                      <div className="overflow-y-auto max-h-72">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                            <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                              <th className="px-3 py-2 font-semibold">#</th>
                              <th className="px-3 py-2 font-semibold">Productor</th>
                              <th className="px-3 py-2 font-semibold text-right">Registros</th>
                              <th className="px-3 py-2 font-semibold text-right">Peso Neto</th>
                              <th className="px-3 py-2 font-semibold text-right">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {caliralDepositoStats.productoresRanking.map((p, i) => {
                              const pct = caliralDepositoStats.totalPn > 0 ? (p.pn / caliralDepositoStats.totalPn) * 100 : 0;
                              return (
                                <tr key={p.name} className="border-b hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[180px] truncate" title={p.name}>{p.name}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(p.regs)}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(p.pn)}</td>
                                  <td className="px-3 py-2 text-right font-mono text-emerald-600 font-semibold">{pct.toFixed(2)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-5 py-4"><EmptyState message="Sin productores que usen Caliral como depósito" /></div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ===== Section B: Ranking de Depósitos ===== */}
              <div className="flex items-center gap-2 pt-2">
                <BarChart3 className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">B · Ranking de Depósitos</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={BarChart3} title="Top 10 depósitos" subtitle="Por peso neto · esmeralda = Caliral" />
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {depositosRanking.length > 0 ? (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-2">
                        {depositosRanking.slice(0, 10).map((row, i) => {
                          const isCaliral = row.name === DEFAULT_COMPANY;
                          return (
                            <HBar
                              key={row.name}
                              label={`${i + 1}. ${row.name.substring(0, 26)}`}
                              value={row.pn}
                              max={depositosRanking[0].pn}
                              color={isCaliral ? COMPANY_COLOR : DEPOSIT_OTHER_COLOR}
                              format={fmtKg}
                              highlight={isCaliral}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState message="Sin datos de depósitos" />
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Layers} title="Tabla completa de depósitos" subtitle={`${depositosRanking.length} depósitos (excluye puertos y pasos fronterizos)`} />
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                          <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Depósito</th>
                            <th className="px-3 py-2 font-semibold text-right">Registros</th>
                            <th className="px-3 py-2 font-semibold text-right">Peso Neto</th>
                            <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">Productores</th>
                            <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">Clientes</th>
                            <th className="px-3 py-2 font-semibold text-right">% Mercado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {depositosRanking.map((row, i) => {
                            const isCaliral = row.name === DEFAULT_COMPANY;
                            return (
                              <tr
                                key={row.name}
                                className={`border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isCaliral ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' : ''}`}
                              >
                                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={row.name}>
                                  {isCaliral && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />}
                                  {row.name}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(row.regs)}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(row.pn)}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-500 hidden sm:table-cell">{row.productores}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-500 hidden sm:table-cell">{row.clientes}</td>
                                <td className="px-3 py-2 text-right font-mono">
                                  <span className={isCaliral ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                                    {row.share.toFixed(2)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ===== Section C: Mercados que Caliral NO trabaja ===== */}
              <div className="flex items-center gap-2 pt-2">
                <Globe className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">C · Mercados que {DEFAULT_COMPANY} NO trabaja</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Globe} title="Países no atendidos" subtitle="Otros depósitos sí envían — oportunidades" />
                  </CardHeader>
                  <CardContent className="p-0">
                    {caliralNoMercados.paisesOportunidad.length > 0 ? (
                      <div className="overflow-y-auto max-h-72">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                            <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                              <th className="px-3 py-2 font-semibold">#</th>
                              <th className="px-3 py-2 font-semibold">País</th>
                              <th className="px-3 py-2 font-semibold text-right">Volumen potencial</th>
                            </tr>
                          </thead>
                          <tbody>
                            {caliralNoMercados.paisesOportunidad.map((p, i) => (
                              <tr key={p.name} className="border-b hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.name}</td>
                                <td className="px-3 py-2 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold">{fmtKg(p.pn)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-5 py-4"><EmptyState message="Caliral atiende todos los países del mercado de depósitos" /></div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <SectionTitle icon={Package} title="Cortes no procesados" subtitle="Otros depósitos sí los procesan — oportunidades" />
                  </CardHeader>
                  <CardContent className="p-0">
                    {caliralNoMercados.cortesOportunidad.length > 0 ? (
                      <div className="overflow-y-auto max-h-72">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                            <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                              <th className="px-3 py-2 font-semibold">#</th>
                              <th className="px-3 py-2 font-semibold">Corte</th>
                              <th className="px-3 py-2 font-semibold text-right">Volumen potencial</th>
                            </tr>
                          </thead>
                          <tbody>
                            {caliralNoMercados.cortesOportunidad.map((c, i) => (
                              <tr key={c.name} className="border-b hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={c.name}>{c.name}</td>
                                <td className="px-3 py-2 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold">{fmtKg(c.pn)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-5 py-4"><EmptyState message="Caliral procesa todos los cortes del mercado de depósitos" /></div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ===== Section D: Productores que NO usan Caliral ===== */}
              <div className="flex items-center gap-2 pt-2">
                <Users className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">D · Productores que NO usan {DEFAULT_COMPANY}</h3>
              </div>

              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionTitle
                    icon={Users}
                    title={`Productores sin ${DEFAULT_COMPANY}`}
                    subtitle={`${productoresNoCaliralRaw.length} productores (ordenables por columna)`}
                    action={
                      <Badge variant="secondary" className="text-[10px]">
                        Click en cabecera para ordenar
                      </Badge>
                    }
                  />
                </CardHeader>
                <CardContent className="p-0">
                  {productoresNoCaliralRaw.length > 0 ? (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                          <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Productor</th>
                            <th className="px-3 py-2 font-semibold">Depósito principal</th>
                            <SortHeader label="Volumen (kg)" k="pn" cur={depositSortKey} dir={depositSortDir} onSort={(k) => { if (k === depositSortKey) setDepositSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDepositSortKey(k); setDepositSortDir('desc'); } }} />
                            <SortHeader label="Clientes" k="clientes" cur={depositSortKey} dir={depositSortDir} onSort={(k) => { if (k === depositSortKey) setDepositSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDepositSortKey(k); setDepositSortDir('desc'); } }} hidden="md" />
                            <SortHeader label="Países" k="paises" cur={depositSortKey} dir={depositSortDir} onSort={(k) => { if (k === depositSortKey) setDepositSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDepositSortKey(k); setDepositSortDir('desc'); } }} hidden="md" />
                            <SortHeader label="Embarques" k="embarques" cur={depositSortKey} dir={depositSortDir} onSort={(k) => { if (k === depositSortKey) setDepositSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setDepositSortKey(k); setDepositSortDir('desc'); } }} hidden="sm" />
                          </tr>
                        </thead>
                        <tbody>
                          {productoresNoCaliral.map((p, i) => (
                            <tr key={p.name} className="border-b hover:bg-rose-50 dark:hover:bg-rose-900/10">
                              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[180px] truncate" title={p.name}>{p.name}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[160px] truncate" title={p.mainDeposito}>{p.mainDeposito}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(p.pn)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">{p.clientes}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">{p.paises}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden sm:table-cell">{p.embarques}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-5 py-4"><EmptyState message="Todos los productores usan Caliral como depósito" /></div>
                  )}
                </CardContent>
              </Card>

              {/* ===== Section E: Índice de Oportunidad Comercial ===== */}
              <div className="flex items-center gap-2 pt-2">
                <Target className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">E · Índice de Oportunidad Comercial</h3>
              </div>

              <Card className="border-violet-200 dark:border-violet-900/40">
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Score compuesto por: <strong>30%</strong> volumen · <strong>20%</strong> crecimiento (últimos 3 meses vs anteriores) · <strong>20%</strong> mercados · <strong>15%</strong> clientes (depósitos) · <strong>15%</strong> diversificación de productos. Cada componente normalizado a 0–100.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  {oportunidadComercial.length > 0 ? (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                          <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Productor</th>
                            <th className="px-3 py-2 font-semibold hidden sm:table-cell">Depósito actual</th>
                            <th className="px-3 py-2 font-semibold text-right">Volumen</th>
                            <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Crecim.</th>
                            <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Mercados</th>
                            <th className="px-3 py-2 font-semibold text-right">Score</th>
                            <th className="px-3 py-2 font-semibold text-center">Potencial</th>
                          </tr>
                        </thead>
                        <tbody>
                          {oportunidadComercial.map((r, i) => (
                            <tr key={r.name} className="border-b hover:bg-violet-50 dark:hover:bg-violet-900/10">
                              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[160px] truncate" title={r.name}>{r.name}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[140px] truncate hidden sm:table-cell" title={r.deposito}>{r.deposito}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmtKg(r.pn)}</td>
                              <td className="px-3 py-2 text-right font-mono hidden md:table-cell">
                                <span className={r.growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                  {r.growth >= 0 ? '+' : ''}{r.growth.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500 hidden md:table-cell">{r.paises}</td>
                              <td className="px-3 py-2 text-right">
                                <span className="inline-block w-12 text-center font-mono font-bold rounded py-0.5"
                                  style={{
                                    backgroundColor: hexToRgba(r.score > 60 ? COMPANY_COLOR : r.score > 40 ? OPPORTUNITY_COLOR : '#94a3b8', 0.15),
                                    color: r.score > 60 ? '#059669' : r.score > 40 ? '#d97706' : '#64748b',
                                  }}
                                >
                                  {r.score.toFixed(1)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <PotencialBadge nivel={r.potencial} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-5 py-4"><EmptyState message="No hay productores sin Caliral para evaluar" /></div>
                  )}
                </CardContent>
              </Card>

              {/* ===== Section F: Productores con múltiples depósitos (incl. Caliral) ===== */}
              <div className="flex items-center gap-2 pt-2">
                <Network className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">F · Productores con múltiples depósitos (incl. {DEFAULT_COMPANY})</h3>
              </div>

              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionTitle icon={Network} title="Reparto entre Caliral y otros depósitos" subtitle={`${multiDepositoCaliral.length} productores que usan Caliral Y otros depósitos`} />
                </CardHeader>
                <CardContent className="p-0">
                  {multiDepositoCaliral.length > 0 ? (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                          <tr className="border-b text-left text-slate-500 dark:text-slate-400 uppercase">
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Productor</th>
                            <th className="px-3 py-2 font-semibold text-right">Caliral (kg)</th>
                            <th className="px-3 py-2 font-semibold text-right">Caliral %</th>
                            <th className="px-3 py-2 font-semibold text-right">Otros (kg)</th>
                            <th className="px-3 py-2 font-semibold text-right">Otros %</th>
                            <th className="px-3 py-2 font-semibold text-right">Total</th>
                            <th className="px-3 py-2 font-semibold hidden lg:table-cell">Reparto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {multiDepositoCaliral.map((p, i) => (
                            <tr key={p.name} className="border-b hover:bg-blue-50 dark:hover:bg-blue-900/10">
                              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[160px] truncate" title={p.name}>{p.name}</td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">{fmt(p.caliralPn)}</td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-600 font-semibold">{p.caliralPct.toFixed(1)}%</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(p.otrosPn)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500">{p.otrosPct.toFixed(1)}%</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300 font-semibold">{fmt(p.total)}</td>
                              <td className="px-3 py-2 hidden lg:table-cell">
                                <div className="flex h-3 w-32 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                                  <div className="h-full" style={{ width: `${p.caliralPct}%`, backgroundColor: COMPANY_COLOR }} title={`Caliral: ${p.caliralPct.toFixed(1)}%`} />
                                  <div className="h-full" style={{ width: `${p.otrosPct}%`, backgroundColor: COMPETITOR_COLOR }} title={`Otros: ${p.otrosPct.toFixed(1)}%`} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-5 py-4"><EmptyState message="Ningún productor usa Caliral junto a otros depósitos" /></div>
                  )}
                </CardContent>
              </Card>

              {/* ===== Section G: Insights automáticos de depósitos ===== */}
              <div className="flex items-center gap-2 pt-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">G · Insights automáticos de depósitos</h3>
              </div>

              {depositosInsights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {depositosInsights.map((ins, i) => {
                    const colorMap = {
                      positive: { border: 'border-emerald-300', bg: 'bg-emerald-50/60 dark:bg-emerald-900/15', icon: 'text-emerald-600', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40' },
                      warning: { border: 'border-amber-300', bg: 'bg-amber-50/60 dark:bg-amber-900/15', icon: 'text-amber-600', iconBg: 'bg-amber-100 dark:bg-amber-900/40' },
                      info: { border: 'border-blue-300', bg: 'bg-blue-50/60 dark:bg-blue-900/15', icon: 'text-blue-600', iconBg: 'bg-blue-100 dark:bg-blue-900/40' },
                      opportunity: { border: 'border-violet-300', bg: 'bg-violet-50/60 dark:bg-violet-900/15', icon: 'text-violet-600', iconBg: 'bg-violet-100 dark:bg-violet-900/40' },
                    };
                    const c = colorMap[ins.type];
                    return (
                      <Card key={i} className={`border-l-4 ${c.border} ${c.bg}`}>
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
                            <ins.icon className={`w-4 h-4 ${c.icon}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{ins.title}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{ins.detail}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card><CardContent className="p-4"><EmptyState message="Sin insights disponibles para depósitos" /></CardContent></Card>
              )}
            </div>
          )}

          {/* ============ INSIGHTS TAB ============ */}
          {activeTab === 'insights' && (
            <div className="space-y-4">
              {/* Header card */}
              <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-slate-50 dark:from-violet-900/20 dark:to-slate-900">
                <CardContent className="p-5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Inteligencia comercial automática</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Análisis generado a partir de {fmt(filteredRecords.length)} registros del mercado. Empresa analizada: <strong className="text-violet-700 dark:text-violet-400">{selectedCompany}</strong>.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Insight cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.map((ins, i) => {
                  const colorMap = {
                    positive: { border: 'border-emerald-300', bg: 'bg-emerald-50/60 dark:bg-emerald-900/15', icon: 'text-emerald-600', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40' },
                    warning: { border: 'border-amber-300', bg: 'bg-amber-50/60 dark:bg-amber-900/15', icon: 'text-amber-600', iconBg: 'bg-amber-100 dark:bg-amber-900/40' },
                    info: { border: 'border-blue-300', bg: 'bg-blue-50/60 dark:bg-blue-900/15', icon: 'text-blue-600', iconBg: 'bg-blue-100 dark:bg-blue-900/40' },
                    opportunity: { border: 'border-violet-300', bg: 'bg-violet-50/60 dark:bg-violet-900/15', icon: 'text-violet-600', iconBg: 'bg-violet-100 dark:bg-violet-900/40' },
                  };
                  const c = colorMap[ins.type];
                  return (
                    <Card key={i} className={`border-l-4 ${c.border} ${c.bg}`}>
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
                          <ins.icon className={`w-4 h-4 ${c.icon}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{ins.title}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{ins.detail}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// INLINE HELPERS FOR DEPÓSITOS TAB (rendered inside main component)
// ============================================================

/** Sortable table header button */
function SortHeader({
  label, k, cur, dir, onSort, hidden,
}: {
  label: string;
  k: 'pn' | 'regs' | 'paises' | 'clientes' | 'embarques';
  cur: string;
  dir: 'asc' | 'desc';
  onSort: (k: 'pn' | 'regs' | 'paises' | 'clientes' | 'embarques') => void;
  hidden?: 'sm' | 'md';
}) {
  const active = cur === k;
  const hiddenCls = hidden === 'sm' ? 'hidden sm:table-cell' : hidden === 'md' ? 'hidden md:table-cell' : '';
  return (
    <th className={`px-3 py-2 font-semibold text-right ${hiddenCls}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-emerald-600 transition-colors ${active ? 'text-emerald-600' : ''}`}
      >
        {label}
        {active && (
          <span className="text-[8px]">{dir === 'asc' ? '▲' : '▼'}</span>
        )}
      </button>
    </th>
  );
}

/** Potencial badge for the opportunity index */
function PotencialBadge({ nivel }: { nivel: 'Muy Alto' | 'Alto' | 'Medio' | 'Bajo' }) {
  const map: Record<string, { cls: string; dot: string }> = {
    'Muy Alto': { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
    'Alto': { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
    'Medio': { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600', dot: 'bg-slate-400' },
    'Bajo': { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-700', dot: 'bg-rose-500' },
  };
  const c = map[nivel];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {nivel}
    </span>
  );
}
