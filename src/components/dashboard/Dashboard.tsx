/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Package, Weight, Box, Globe, Tag, CalendarDays,
  ArrowRight, TrendingUp, Ship, Warehouse, Clock,
  ArrowLeftRight, Link2, CheckCircle2, AlertTriangle, Unlink,
} from 'lucide-react';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import { fmt, fd } from '@/lib/utils';
import { useAppStore, type Tab } from '@/store/useAppStore';
import type { Shipment, ExpRecord } from '@/lib/types';
import StockPanel from './StockPanel';

// Emerald gradient stops for bar charts
const EMERALD_GRADIENT = [
  'bg-emerald-400',
  'bg-emerald-500',
  'bg-emerald-500',
  'bg-emerald-600',
  'bg-emerald-700',
];

const BLUE_GRADIENT = [
  'bg-sky-400',
  'bg-sky-500',
  'bg-sky-500',
  'bg-sky-600',
  'bg-sky-700',
];

// --- Compute analytics from raw data ---
interface Analytics {
  total: number;
  pesoNetoTotal: number;
  envasesTotal: number;
  uniquePaisCount: number;
  uniqueProductoCount: number;
  lastDate: string | null;
  byPais: { pais: string; pesoNeto: number; envios: number }[];
  byProducto: { producto: string; pesoNeto: number; envios: number }[];
  byDestino: { destino: string; pesoNeto: number; envios: number }[];
  byTipo: { tipo: string; pesoNeto: number; envios: number; envases: number }[];
  // Ingreso/Export split
  ingresoCount: number;
  ingresoKg: number;
  ingresoEnvases: number;
  exportCount: number;
  exportKg: number;
  exportEnvases: number;
  exportTopPais: string;
  exportTopProducto: string;
  // Cruce stats
  cruceCotesVinculados: number;
  cruceExportsConCruce: number;
  cruceExportsSinCruce: number;
  crucePendientes: number;
  cruceConDiferencia: number;
  cruceCobertura: number;
}

function computeAnalytics(depositos: Shipment[], exportaciones: ExpRecord[]): Analytics {
  // Depositos stats
  let total = depositos.length;
  let pesoNetoTotal = 0;
  let envasesTotal = 0;
  const paises = new Set<string>();
  const productos = new Set<string>();
  let lastDate: string | null = null;
  const byPaisMap = new Map<string, { pesoNeto: number; envios: number }>();
  const byProductoMap = new Map<string, { pesoNeto: number; envios: number }>();
  const byDestinoMap = new Map<string, { pesoNeto: number; envios: number }>();
  const byTipoMap = new Map<string, { pesoNeto: number; envios: number; envases: number }>();

  for (const s of depositos) {
    pesoNetoTotal += s.pesoNeto || 0;
    envasesTotal += s.cantidadEnvases || 0;
    if (s.paisDestino) paises.add(s.paisDestino);
    if (s.denominacionMercaderia) productos.add(s.denominacionMercaderia);
    if (s.fechaTramite && (!lastDate || s.fechaTramite > lastDate)) lastDate = s.fechaTramite;

    // By pais
    if (s.paisDestino) {
      const cur = byPaisMap.get(s.paisDestino) || { pesoNeto: 0, envios: 0 };
      cur.pesoNeto += s.pesoNeto || 0;
      cur.envios += 1;
      byPaisMap.set(s.paisDestino, cur);
    }

    // By producto
    if (s.denominacionMercaderia) {
      const cur = byProductoMap.get(s.denominacionMercaderia) || { pesoNeto: 0, envios: 0 };
      cur.pesoNeto += s.pesoNeto || 0;
      cur.envios += 1;
      byProductoMap.set(s.denominacionMercaderia, cur);
    }

    // By destino
    if (s.nombreEstablecimientoDestino) {
      const cur = byDestinoMap.get(s.nombreEstablecimientoDestino) || { pesoNeto: 0, envios: 0 };
      cur.pesoNeto += s.pesoNeto || 0;
      cur.envios += 1;
      byDestinoMap.set(s.nombreEstablecimientoDestino, cur);
    }

    // By tipo
    const tipo = s.tipo || 'UNKNOWN';
    const curTipo = byTipoMap.get(tipo) || { pesoNeto: 0, envios: 0, envases: 0 };
    curTipo.pesoNeto += s.pesoNeto || 0;
    curTipo.envios += 1;
    curTipo.envases += s.cantidadEnvases || 0;
    byTipoMap.set(tipo, curTipo);
  }

  // Also add exportaciones to total counts
  total += exportaciones.length;
  for (const e of exportaciones) {
    pesoNetoTotal += e.pesoNeto || 0;
    envasesTotal += e.cantidadEnvases || 0;
    if (e.paisDestino) paises.add(e.paisDestino);
    if (e.denominacionMercaderia) productos.add(e.denominacionMercaderia);
    if (e.fechaTramite && (!lastDate || e.fechaTramite > lastDate)) lastDate = e.fechaTramite;

    if (e.paisDestino) {
      const cur = byPaisMap.get(e.paisDestino) || { pesoNeto: 0, envios: 0 };
      cur.pesoNeto += e.pesoNeto || 0;
      cur.envios += 1;
      byPaisMap.set(e.paisDestino, cur);
    }
    if (e.denominacionMercaderia) {
      const cur = byProductoMap.get(e.denominacionMercaderia) || { pesoNeto: 0, envios: 0 };
      cur.pesoNeto += e.pesoNeto || 0;
      cur.envios += 1;
      byProductoMap.set(e.denominacionMercaderia, cur);
    }
  }

  // Ingreso/Export split from byTipo
  let ingresoCount = 0, ingresoKg = 0, ingresoEnvases = 0;
  let exportCount = 0, exportKg = 0, exportEnvases = 0;
  let exportTopPais = '-';
  let exportTopProducto = '-';
  for (const [tipo, val] of byTipoMap) {
    const t = tipo.toUpperCase();
    if (t.includes('INGRESO') || t.includes('DEPOSITO')) {
      ingresoCount += val.envios;
      ingresoKg += val.pesoNeto;
      ingresoEnvases += val.envases;
    } else if (t.includes('EXPORT')) {
      exportCount += val.envios;
      exportKg += val.pesoNeto;
      exportEnvases += val.envases;
    }
  }
  // If byTipo is empty, use exportaciones data for export stats
  if (exportCount === 0 && exportaciones.length > 0) {
    exportCount = exportaciones.length;
    exportKg = exportaciones.reduce((s, e) => s + (e.pesoNeto || 0), 0);
    exportEnvases = exportaciones.reduce((s, e) => s + (e.cantidadEnvases || 0), 0);
  }
  if (ingresoCount === 0 && depositos.length > 0) {
    ingresoCount = depositos.length;
    ingresoKg = depositos.reduce((s, d) => s + (d.pesoNeto || 0), 0);
    ingresoEnvases = depositos.reduce((s, d) => s + (d.cantidadEnvases || 0), 0);
  }

  // Top pais/producto for exports
  const expByPais = new Map<string, number>();
  const expByProducto = new Map<string, number>();
  for (const e of exportaciones) {
    if (e.paisDestino) expByPais.set(e.paisDestino, (expByPais.get(e.paisDestino) || 0) + (e.pesoNeto || 0));
    if (e.denominacionMercaderia) expByProducto.set(e.denominacionMercaderia, (expByProducto.get(e.denominacionMercaderia) || 0) + (e.pesoNeto || 0));
  }
  const sortedExpPais = [...expByPais.entries()].sort((a, b) => b[1] - a[1]);
  const sortedExpProducto = [...expByProducto.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedExpPais.length > 0) exportTopPais = sortedExpPais[0][0];
  if (sortedExpProducto.length > 0) exportTopProducto = sortedExpProducto[0][0];

  // --- Cruces Frimaral stats ---
  // Get Caliral deposits (same logic as CruceCaliral component)
  const caliralDepositos = depositos.filter(s =>
    String(s.nombreEstablecimientoDestino || '').toLowerCase().includes('caliral')
  );
  // Aggregate by COTE
  const ingresoMap = new Map<string, { envases: number; pesoNeto: number; cortes: string[] }>();
  for (const d of caliralDepositos) {
    const cote = d.nroCote?.trim();
    if (!cote) continue;
    const cur = ingresoMap.get(cote) || { envases: 0, pesoNeto: 0, cortes: [] };
    cur.envases += d.cantidadEnvases || 0;
    cur.pesoNeto += d.pesoNeto || 0;
    if (d.corte && !cur.cortes.includes(d.corte)) cur.cortes.push(d.corte);
    ingresoMap.set(cote, cur);
  }

  // Extract COTEs from export observaciones
  const referencedCotes = new Set<string>();
  let exportsConCruce = 0;
  let exportsSinCruce = 0;
  let conDiferencia = 0;

  for (const e of exportaciones) {
    const obs = e.observaciones || '';
    const allP = obs.match(/P\d{4,8}/gi) || [];
    const allB = obs.match(/B\d{4,8}/gi) || [];
    const cotes = [...allP, ...allB].map(c => c.toUpperCase());
    // Remove self-reference
    const selfCote = (e.nroCote || '').toUpperCase();
    const ingresoCotes = cotes.filter(c => c !== selfCote);

    if (ingresoCotes.length > 0) {
      exportsConCruce++;
      for (const c of ingresoCotes) referencedCotes.add(c);
      // Check if diff < 0 (more export boxes than ingreso)
      const expEnvases = e.cantidadEnvases || 0;
      let totalIngresoEnvases = 0;
      for (const c of ingresoCotes) {
        totalIngresoEnvases += ingresoMap.get(c)?.envases || 0;
      }
      if (expEnvases > totalIngresoEnvases && totalIngresoEnvases > 0) {
        conDiferencia++;
      }
    } else {
      exportsSinCruce++;
    }
  }

  const cotesVinculados = referencedCotes.size;
  const pendientes = [...ingresoMap.keys()].filter(c => !referencedCotes.has(c)).length;
  const cobertura = ingresoMap.size > 0 ? Math.round((cotesVinculados / ingresoMap.size) * 100) : 0;

  // Sort maps by pesoNeto descending
  const byPais = [...byPaisMap.entries()]
    .sort((a, b) => b[1].pesoNeto - a[1].pesoNeto)
    .map(([pais, v]) => ({ pais, ...v }));
  const byProducto = [...byProductoMap.entries()]
    .sort((a, b) => b[1].pesoNeto - a[1].pesoNeto)
    .map(([producto, v]) => ({ producto, ...v }));
  const byDestino = [...byDestinoMap.entries()]
    .sort((a, b) => b[1].pesoNeto - a[1].pesoNeto)
    .map(([destino, v]) => ({ destino, ...v }));
  const byTipo = [...byTipoMap.entries()]
    .map(([tipo, v]) => ({ tipo, ...v }));

  return {
    total,
    pesoNetoTotal,
    envasesTotal,
    uniquePaisCount: paises.size,
    uniqueProductoCount: productos.size,
    lastDate,
    byPais,
    byProducto,
    byDestino,
    byTipo,
    ingresoCount,
    ingresoKg,
    ingresoEnvases,
    exportCount,
    exportKg,
    exportEnvases,
    exportTopPais,
    exportTopProducto,
    cruceCotesVinculados: cotesVinculados,
    cruceExportsConCruce: exportsConCruce,
    cruceExportsSinCruce: exportsSinCruce,
    crucePendientes: pendientes,
    cruceConDiferencia: conDiferencia,
    cruceCobertura: cobertura,
  };
}

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  const { navigateAndFilter, setCruceNav } = useAppStore();

  // Load data (reused on mount and after Firebase pull)
  const reloadData = useCallback(async () => {
    try {
      const [depositos, exportaciones] = await Promise.all([
        loadDepositos(),
        loadExportaciones(),
      ]);
      const computed = computeAnalytics(depositos, exportaciones);
      setAnalytics(computed);
      // Last 5 shipments (by date)
      const allSorted = [...depositos, ...exportaciones]
        .filter(s => s.fechaTramite)
        .sort((a, b) => b.fechaTramite.localeCompare(a.fechaTramite))
        .slice(0, 5);
      setRecentShipments(allSorted);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { reloadData(); }, [reloadData]);

  // Listen for Firebase data-ready event and reload
  useEffect(() => {
    const handler = () => setDataVersion(v => v + 1);
    window.addEventListener('trazabilidad-data-ready', handler);
    return () => window.removeEventListener('trazabilidad-data-ready', handler);
  }, []);

  // Reload when dataVersion changes (after Firebase pull)
  useEffect(() => {
    if (dataVersion === 0) return;
    reloadData();
  }, [dataVersion, reloadData]);

  // Top 5 destinos
  const topDestinos = useMemo(() => {
    if (!analytics) return [];
    const list = analytics.byDestino.slice(0, 5);
    const maxKg = list.length > 0 ? Math.max(...list.map(d => d.pesoNeto)) : 1;
    const totalKg = analytics.pesoNetoTotal || 1;
    return list.map(d => ({
      name: d.destino,
      kg: d.pesoNeto,
      count: d.envios,
      pct: (d.pesoNeto / totalKg * 100),
      width: Math.max((d.pesoNeto / maxKg) * 100, 8),
    }));
  }, [analytics]);

  // Top 5 productos
  const topProductos = useMemo(() => {
    if (!analytics) return [];
    const list = analytics.byProducto.slice(0, 5);
    const maxKg = list.length > 0 ? Math.max(...list.map(d => d.pesoNeto)) : 1;
    const totalKg = analytics.pesoNetoTotal || 1;
    return list.map(d => ({
      name: d.producto,
      kg: d.pesoNeto,
      count: d.envios,
      pct: (d.pesoNeto / totalKg * 100),
      width: Math.max((d.pesoNeto / maxKg) * 100, 8),
    }));
  }, [analytics]);

  if (loading || !analytics) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const d = analytics;

  // KPI cards config — all use navigateAndFilter for proper filter clearing
  const kpis = [
    { label: 'Total Envíos', value: fmt(d.total), icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950', tab: 'depositos' as Tab, filters: {} },
    { label: 'Peso Neto Total', value: fmt(d.pesoNetoTotal) + ' kg', icon: Weight, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950', tab: 'depositos' as Tab, filters: {} },
    { label: 'Total Envases', value: fmt(d.envasesTotal), icon: Box, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950', tab: 'depositos' as Tab, filters: {} },
    { label: 'Países Destino', value: String(d.uniquePaisCount), icon: Globe, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950', tab: 'comparativa' as Tab, filters: {} },
    { label: 'Productos Únicos', value: String(d.uniqueProductoCount), icon: Tag, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950', tab: 'comparativa' as Tab, filters: {} },
    { label: 'Último Envío', value: fd(d.lastDate), icon: CalendarDays, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950', tab: 'trazabilidad' as Tab, filters: {} },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900">
          <TrendingUp className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Resumen general de trazabilidad</p>
        </div>
      </div>

      {/* ─── 1. KPI CARDS ROW ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card
              key={k.label}
              className="cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200 group relative overflow-hidden"
              onClick={() => navigateAndFilter(k.tab, Object.keys(k.filters).length > 0 ? k.filters : undefined)}
            >
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${k.bg}`}>
                    <Icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">{k.label}</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{k.value}</p>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-medium">
                  Ver detalles →
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── 2. INGRESOS VS EXPORTACIONES SPLIT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Ingresos */}
        <Card
          className="cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all duration-200 group border-l-4 border-l-emerald-500"
          onClick={() => navigateAndFilter('depositos', { tipo: 'INGRESO' })}
        >
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-emerald-600" />
                Ingresos a Depósitos
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(d.ingresoCount)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Envíos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fmt(d.ingresoKg)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">kg neto</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{fmt(d.ingresoEnvases)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Envases</p>
              </div>
            </div>
            {d.ingresoCount > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{((d.ingresoCount / Math.max(d.total, 1)) * 100).toFixed(1)}% del total</span>
              </div>
            )}
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-medium mt-2 block">
              Ver todos los ingresos →
            </span>
          </CardContent>
        </Card>

        {/* Exportaciones */}
        <Card
          className="cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all duration-200 group border-l-4 border-l-sky-500"
          onClick={() => navigateAndFilter('exportaciones')}
        >
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Ship className="h-5 w-5 text-sky-600" />
                Exportaciones
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">{fmt(d.exportCount)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Envíos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fmt(d.exportKg)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">kg neto</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                <p className="text-[10px] text-slate-400 uppercase">Top País</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{d.exportTopPais}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                <p className="text-[10px] text-slate-400 uppercase">Top Producto</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{d.exportTopProducto}</p>
              </div>
            </div>
            <span className="text-[10px] text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-medium mt-2 block">
              Ver todas las exportaciones →
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ─── 2b. CRUCE CALIRAL QUICK ACCESS ─── */}
      <Card
        className="cursor-pointer hover:shadow-lg hover:scale-[1.005] transition-all duration-200 group border-l-4 border-l-orange-500"
        onClick={() => {
          setCruceNav({ subTab: 'cruce' });
          navigateAndFilter('cruce-caliral');
        }}
      >
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-orange-600" />
              Cruces Frimaral
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                <Link2 className="inline h-5 w-5 mr-1" />
                {d.cruceCotesVinculados}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">COTEs Vinculados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                <CheckCircle2 className="inline h-5 w-5 mr-1" />
                {d.cruceExportsConCruce}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Exports con cruce</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="inline h-5 w-5 mr-1" />
                {d.cruceExportsSinCruce}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sin COTE</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">
                <Unlink className="inline h-5 w-5 mr-1" />
                {d.crucePendientes}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pendientes</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            {d.cruceConDiferencia > 0 && (
              <span className="text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {d.cruceConDiferencia} con diferencia
              </span>
            )}
            <span className="text-xs font-medium text-violet-600 flex items-center gap-1">
              Cobertura: {d.cruceCobertura}%
            </span>
          </div>
          <span className="text-[10px] text-orange-600 dark:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-medium mt-2 block">
            Ver cruce completo →
          </span>
        </CardContent>
      </Card>

      {/* ─── STOCK FRIMARAL ─── */}
      <div className="lg:col-span-2">
        <StockPanel />
      </div>

      {/* ─── 3. TOP 5 DESTINOS ─── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-600" />
              Top 5 Destinos
            </CardTitle>
            {topDestinos.length > 0 && (
              <span className="text-xs text-slate-400">por peso neto</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {topDestinos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Globe className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Sin datos de destinos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topDestinos.map((dest, i) => (
                <Tooltip key={dest.name}>
                  <TooltipTrigger asChild>
                    <div
                      className="cursor-pointer group/bar hover:opacity-90 transition-all duration-200"
                      onClick={() => navigateAndFilter('depositos', { destino: dest.name })}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[60%] group-hover/bar:text-emerald-700 dark:group-hover/bar:text-emerald-400 transition-colors">
                          {dest.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{fmt(dest.kg)} kg</span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900 px-1.5 py-0.5 rounded">
                            {dest.pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-7 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
                        <div
                          className={`h-full ${EMERALD_GRADIENT[i] || 'bg-emerald-500'} rounded-md transition-all duration-500 flex items-center px-3 group-hover/bar:brightness-110`}
                          style={{ width: `${dest.width}%` }}
                        >
                          <span className="text-[10px] font-semibold text-white whitespace-nowrap drop-shadow-sm">
                            {dest.count} envíos
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold">{dest.name}</p>
                      <p>{fmt(dest.kg)} kg · {dest.count} envíos</p>
                      <p>{dest.pct.toFixed(1)}% del total</p>
                      <p className="text-emerald-300">Click para ver envíos →</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. TOP 5 PRODUCTOS ─── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-5 w-5 text-sky-600" />
              Top 5 Productos
            </CardTitle>
            {topProductos.length > 0 && (
              <span className="text-xs text-slate-400">por peso neto</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {topProductos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Tag className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Sin datos de productos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topProductos.map((prod, i) => (
                <Tooltip key={prod.name}>
                  <TooltipTrigger asChild>
                    <div
                      className="cursor-pointer group/bar hover:opacity-90 transition-all duration-200"
                      onClick={() => navigateAndFilter('comparativa', { producto: prod.name })}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[60%] group-hover/bar:text-sky-700 dark:group-hover/bar:text-sky-400 transition-colors">
                          {prod.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{fmt(prod.kg)} kg</span>
                          <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900 px-1.5 py-0.5 rounded">
                            {prod.pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-7 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
                        <div
                          className={`h-full ${BLUE_GRADIENT[i] || 'bg-sky-500'} rounded-md transition-all duration-500 flex items-center px-3 group-hover/bar:brightness-110`}
                          style={{ width: `${prod.width}%` }}
                        >
                          <span className="text-[10px] font-semibold text-white whitespace-nowrap drop-shadow-sm">
                            {prod.count} envíos
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold">{prod.name}</p>
                      <p>{fmt(prod.kg)} kg · {prod.count} envíos</p>
                      <p>{prod.pct.toFixed(1)}% del total</p>
                      <p className="text-sky-300">Click para comparar →</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 5. ACTIVIDAD RECIENTE ─── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Actividad Reciente
            </CardTitle>
            {recentShipments.length > 0 && (
              <span className="text-xs text-slate-400">últimos 5 envíos</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {recentShipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Clock className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Sin envíos recientes</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
              {recentShipments.map((s) => {
                const isExport = String(s.tipo || '').toUpperCase().includes('EXPORT');
                return (
                  <div
                    key={s.id || s.nroCote}
                    className="flex items-center gap-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded-lg transition-all duration-200 group/row"
                    onClick={() => navigateAndFilter('trazabilidad', undefined, s.nroCote || '')}
                  >
                    {/* Tipo badge */}
                    <Badge
                      className={`shrink-0 text-[10px] font-semibold ${
                        isExport
                          ? 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900 dark:text-sky-300 dark:border-sky-800'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800'
                      }`}
                    >
                      {isExport ? 'EXPORT' : 'INGRESO'}
                    </Badge>

                    {/* Date */}
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 w-20">
                      {fd(s.fechaTramite)}
                    </span>

                    {/* COTE */}
                    <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[100px]">
                      {s.nroCote || '-'}
                    </span>

                    {/* Product */}
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">
                      {s.denominacionMercaderia || '-'}
                    </span>

                    {/* Destino */}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[100px] hidden sm:inline">
                      {s.nombreEstablecimientoDestino || '-'}
                    </span>

                    {/* Weight */}
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                      {fmt(s.pesoNeto || 0)} kg
                    </span>

                    {/* Arrow on hover */}
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover/row:opacity-100 group-hover/row:translate-x-0.5 transition-all duration-200 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}

          {recentShipments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                onClick={() => navigateAndFilter('depositos')}
              >
                Ver todos los envíos
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
