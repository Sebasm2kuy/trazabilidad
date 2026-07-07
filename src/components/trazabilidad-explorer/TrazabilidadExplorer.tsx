'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package, Search, X, ChevronRight, ChevronDown, FileCheck, ArrowLeftRight,
  Ship, Plus, AlertTriangle, CheckCircle2,
  ArrowRight, Calendar, Box, Weight, Hash, FileText, Upload, Loader2
} from 'lucide-react';
import { dataUrl } from '@/lib/staticData';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import type { Shipment, ExpRecord } from '@/lib/types';
import { fd } from '@/lib/utils';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import React from 'react';

interface StockPallet {
  id: string; contenedor: string; pallets: number; cajas: number; kilos: number;
  contenido: string; producto: string; nroLote: string; fechaVencimiento: string;
  fechaEntrega: string; codigo: string; codigoTipo: string; fechaComision?: string;
}

interface StockLoad {
  fecha: string;
  cliente: string;
  pallets: StockPallet[];
}

interface CoteTrazabilidad {
  cote: string; tipo: string; isRetorno: boolean; estado: string;
  stockPallets: number; stockCajas: number; stockKg: number;
  stockProductos: string[]; stockContenedores: string[];
  ingresoCajas: number; ingresoKg: number; ingresoFechas: string[];
  ingresoCortes: string[]; ingresoDenoms: string[]; ingresoTramites: number[];
  expRefCount: number; expRefCajas: number; expRefTramites: number[];
  expOwnCount: number; expOwnCajas: number;
  saldoTeorico: number; diff: number | null;
  causaDiff: string | null; causaDiffDesc: string;
}

interface TrazabilidadData {
  fecha: string; cliente: string; pallets: StockPallet[]; cotes: CoteTrazabilidad[];
}

const CAUSA_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
  A: { bg: 'bg-purple-100', text: 'text-purple-700', icon: <ArrowLeftRight className="h-3 w-3" />, label: 'Retorno' },
  B: { bg: 'bg-orange-100', text: 'text-orange-700', icon: <FileText className="h-3 w-3" />, label: 'Pase Sanit.' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <AlertTriangle className="h-3 w-3" />, label: 'Doble conteo' },
  D: { bg: 'bg-red-100', text: 'text-red-700', icon: <AlertTriangle className="h-3 w-3" />, label: 'Sin ref exp' },
  E: { bg: 'bg-slate-100', text: 'text-slate-600', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Ajuste menor' },
};

const ESTADO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  EN_STOCK: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'En Stock' },
  RETORNO: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Retorno' },
  SIN_INGRESO: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Sin Ingreso' },
  TOTALMENTE_EXPORTADO: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Exportado' },
};

export default function TrazabilidadExplorer() {
  const { navigateAndFilter } = useAppStore();
  const [data, setData] = useState<TrazabilidadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCote, setExpandedCote] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'con_diff' | 'sin_ingreso' | 'retorno' | 'diff_zero'>('all');
  const [dataVersion, setDataVersion] = useState(0);
  const [addIngresoOpen, setAddIngresoOpen] = useState(false);
  const [addIngresoCote, setAddIngresoCote] = useState('');
  const [addIngresoCajas, setAddIngresoCajas] = useState('');
  const [addIngresoTramite, setAddIngresoTramite] = useState('');
  const [addIngresoProducto, setAddIngresoProducto] = useState('');
  const [stockUploading, setStockUploading] = useState(false);
  const stockInputRef = useRef<HTMLInputElement>(null);

  const handleStockUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStockUploading(true);
    try {
      const { parseStockXls } = await import('@/lib/parseStockXls');
      const load = await parseStockXls(file);
      localStorage.setItem('trazabilidad_stock_data', JSON.stringify(load));
      toast.success(`Stock cargado: ${load.pallets.length} pallets`);
      setDataVersion(v => v + 1);
    } catch (err) {
      console.error('Error cargando stock:', err);
      toast.error('Error al cargar el archivo de stock');
    } finally {
      setStockUploading(false);
      if (stockInputRef.current) stockInputRef.current.value = '';
    }
  }, []);

  const reloadData = useCallback(async () => {
    try {
      // Cargar stock de pallets desde localStorage (mismo lugar que Cruces Frimaral)
      let palletsData: StockPallet[] = [];
      try {
        const raw = localStorage.getItem('trazabilidad_stock_data');
        if (raw) {
          const load: StockLoad = JSON.parse(raw);
          palletsData = load.pallets || [];
        }
      } catch { /* noop */ }

      // Fallback: stock_trazabilidad.json estático (puede estar vacío)
      if (palletsData.length === 0) {
        try {
          const r = await fetch(dataUrl('data/stock_trazabilidad.json'));
          if (r.ok) {
            const raw = await r.json();
            if (raw && Array.isArray(raw.pallets)) {
              palletsData = raw.pallets;
            }
          }
        } catch { /* noop */ }
      }

      // Cargar depósitos y exportaciones para cruzar con stock
      const [depositos, exportaciones] = await Promise.all([
        loadDepositos(),
        loadExportaciones(),
      ]);

      // Indexar exportaciones por COTE para referencias cruzadas
      const expByCote = new Map<string, ExpRecord[]>();
      for (const e of exportaciones) {
        if (!e.nroCote) continue;
        if (!expByCote.has(e.nroCote)) expByCote.set(e.nroCote, []);
        expByCote.get(e.nroCote)!.push(e);
      }

      // Indexar depósitos por COTE
      const depByCote = new Map<string, Shipment[]>();
      for (const d of depositos) {
        if (!d.nroCote) continue;
        if (!depByCote.has(d.nroCote)) depByCote.set(d.nroCote, []);
        depByCote.get(d.nroCote)!.push(d);
      }

      // Indexar pallets por COTE/código
      const palletsByCote = new Map<string, StockPallet[]>();
      for (const p of palletsData) {
        // Usar p.codigo si ya viene parseado, sino extraer del contenido
        let cote = p.codigo;
        if (!cote && p.contenido) {
          const match = p.contenido.match(/COTE\s*(P\d{4,8})/i) || p.contenido.match(/(P\d{4,8})/i);
          cote = match?.[1]?.toUpperCase() || '';
        }
        if (!cote) continue;
        if (!palletsByCote.has(cote)) palletsByCote.set(cote, []);
        palletsByCote.get(cote)!.push(p);
      }

      // Construir mapa de COTEs desde TODAS las fuentes:
      // 1. Stock de pallets (prioridad — es el stock real)
      // 2. Depósitos (ingresos)
      // 3. Exportaciones (para COTEs que solo tienen exportación)
      const cotesMap = new Map<string, CoteTrazabilidad>();

      // 1. Crear COTEs desde stock de pallets
      for (const [cote, pallets] of palletsByCote) {
        const stockCajas = pallets.reduce((s, p) => s + (p.cajas || 0), 0);
        const stockKg = pallets.reduce((s, p) => s + (p.kilos || 0), 0);
        const stockProductos = [...new Set(pallets.map(p => p.producto || p.contenido?.substring(0, 40)).filter(Boolean))];
        const stockContenedores = [...new Set(pallets.map(p => p.contenedor).filter(Boolean))];

        const exps = expByCote.get(cote) || [];
        const deps = depByCote.get(cote) || [];
        const expRefCajas = exps.reduce((s, e) => s + (e.cantidadEnvases || 0), 0);
        const expRefTramites = exps.map(e => e.nroTramite).filter(Boolean) as number[];

        const ingresoCajas = deps.reduce((s, d) => s + (d.cantidadEnvases || 0), 0);
        const ingresoKg = deps.reduce((s, d) => s + (d.pesoNeto || 0), 0);
        const ingresoFechas = deps.map(d => d.fechaEmitidoCote || d.fechaTramite).filter(Boolean);
        const ingresoCortes = [...new Set(deps.map(d => d.corte).filter(Boolean))];
        const ingresoDenoms = [...new Set(deps.map(d => d.denominacionMercaderia).filter(Boolean))];
        const ingresoTramites = deps.map(d => d.nroTramite).filter(Boolean) as number[];

        const saldoTeorico = ingresoCajas - expRefCajas;
        const diff = stockCajas - saldoTeorico;

        let estado = 'EN_STOCK';
        let causaDiff: string | null = null;
        let causaDiffDesc = '';
        if (diff !== 0) {
          if (exps.length > 0 && diff > 0) {
            causaDiff = 'A'; causaDiffDesc = 'Retorno (mercadería reingresada)';
          } else if (diff < 0 && exps.length === 0) {
            estado = 'SIN_REF_EXP'; causaDiff = 'D'; causaDiffDesc = 'Sin exportación de referencia';
          } else if (Math.abs(diff) <= 2) {
            causaDiff = 'E'; causaDiffDesc = 'Ajuste menor (±2 cajas)';
          } else {
            causaDiff = 'C'; causaDiffDesc = 'Diferencia significativa';
          }
        }
        if (ingresoCajas === 0 && deps.length === 0) {
          estado = 'SIN_INGRESO';
        }

        cotesMap.set(cote, {
          cote, tipo: 'STOCK', isRetorno: exps.length > 0, estado,
          stockPallets: pallets.length, stockCajas, stockKg, stockProductos, stockContenedores,
          ingresoCajas, ingresoKg, ingresoFechas, ingresoCortes, ingresoDenoms, ingresoTramites,
          expRefCount: exps.length, expRefCajas, expRefTramites,
          expOwnCount: 0, expOwnCajas: 0,
          saldoTeorico, diff, causaDiff, causaDiffDesc,
        });
      }

      // 2. Agregar COTEs desde depósitos que no están en stock
      for (const dep of depositos) {
        const cote = dep.nroCote;
        if (!cote || cotesMap.has(cote)) continue;

        const exps = expByCote.get(cote) || [];
        const pallets = palletsByCote.get(cote) || [];
        const stockCajas = pallets.reduce((s, p) => s + (p.cajas || 0), 0);
        const stockKg = pallets.reduce((s, p) => s + (p.kilos || 0), 0);
        const expRefCajas = exps.reduce((s, e) => s + (e.cantidadEnvases || 0), 0);
        const expRefTramites = exps.map(e => e.nroTramite).filter(Boolean) as number[];
        const ingresoCajas = dep.cantidadEnvases || 0;
        const ingresoKg = dep.pesoNeto || 0;
        const saldoTeorico = ingresoCajas - expRefCajas;
        const diff = stockCajas > 0 ? stockCajas - saldoTeorico : null;

        let estado = 'EN_STOCK';
        let causaDiff: string | null = null;
        let causaDiffDesc = '';
        if (diff !== null && diff !== 0) {
          if (exps.length > 0 && diff > 0) { causaDiff = 'A'; causaDiffDesc = 'Retorno'; }
          else if (diff < 0 && exps.length === 0) { estado = 'SIN_REF_EXP'; causaDiff = 'D'; causaDiffDesc = 'Sin exportación de referencia'; }
          else if (Math.abs(diff) <= 2) { causaDiff = 'E'; causaDiffDesc = 'Ajuste menor'; }
          else { causaDiff = 'C'; causaDiffDesc = 'Diferencia significativa'; }
        }

        cotesMap.set(cote, {
          cote, tipo: 'DEP', isRetorno: exps.length > 0, estado,
          stockPallets: pallets.length, stockCajas, stockKg,
          stockProductos: [], stockContenedores: [],
          ingresoCajas, ingresoKg,
          ingresoFechas: dep.fechaEmitidoCote ? [dep.fechaEmitidoCote] : (dep.fechaTramite ? [dep.fechaTramite] : []),
          ingresoCortes: dep.corte ? [dep.corte] : [],
          ingresoDenoms: dep.denominacionMercaderia ? [dep.denominacionMercaderia] : [],
          ingresoTramites: dep.nroTramite ? [dep.nroTramite] : [],
          expRefCount: exps.length, expRefCajas, expRefTramites,
          expOwnCount: 0, expOwnCajas: 0,
          saldoTeorico, diff, causaDiff, causaDiffDesc,
        });
      }

      // 3. Agregar COTEs desde exportaciones que no están en stock ni depósitos
      for (const [cote, exps] of expByCote) {
        if (cotesMap.has(cote)) continue;
        const expRefCajas = exps.reduce((s, e) => s + (e.cantidadEnvases || 0), 0);
        cotesMap.set(cote, {
          cote, tipo: 'EXP', isRetorno: false, estado: 'SIN_INGRESO',
          stockPallets: 0, stockCajas: 0, stockKg: 0, stockProductos: [], stockContenedores: [],
          ingresoCajas: 0, ingresoKg: 0, ingresoFechas: [], ingresoCortes: [], ingresoDenoms: [], ingresoTramites: [],
          expRefCount: exps.length, expRefCajas,
          expRefTramites: exps.map(e => e.nroTramite).filter(Boolean) as number[],
          expOwnCount: 0, expOwnCajas: 0,
          saldoTeorico: -expRefCajas, diff: null, causaDiff: 'D', causaDiffDesc: 'Sin ingreso a depósito',
        });
      }

      const d: TrazabilidadData = {
        fecha: new Date().toISOString(),
        cliente: 'CALIRAL',
        pallets: palletsData,
        cotes: Array.from(cotesMap.values()).sort((a, b) => a.cote.localeCompare(b.cote)),
      };
      setData(d);
    } catch (err) { console.error('Error loading data:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { reloadData(); }, [reloadData]);
  useEffect(() => {
    const handler = () => setDataVersion(v => v + 1);
    window.addEventListener('trazabilidad-data-ready', handler);
    return () => window.removeEventListener('trazabilidad-data-ready', handler);
  }, []);
  useEffect(() => { if (dataVersion === 0) return; reloadData(); }, [dataVersion, reloadData]);

  const filteredCotes = useMemo(() => {
    if (!data) return [];
    let items = [...data.cotes];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(c =>
        c.cote.toLowerCase().includes(s) ||
        c.stockProductos.some(p => p.toLowerCase().includes(s)) ||
        c.ingresoCortes.some(c2 => c2.toLowerCase().includes(s)) ||
        c.ingresoDenoms.some(d => d.toLowerCase().includes(s)) ||
        c.stockContenedores.some(c2 => c2.toLowerCase().includes(s)) ||
        c.ingresoTramites.some(t => String(t).includes(s))
      );
    }
    if (filter === 'con_diff') items = items.filter(c => c.diff !== null && c.diff !== 0);
    else if (filter === 'sin_ingreso') items = items.filter(c => c.ingresoCajas === 0);
    else if (filter === 'retorno') items = items.filter(c => c.isRetorno);
    else if (filter === 'diff_zero') items = items.filter(c => c.diff === 0);
    return items;
  }, [data, search, filter]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, stock: 0, ingreso: 0, export: 0, diffTotal: 0, conDiff: 0, diffZero: 0 };
    const cotes = data.cotes;
    return {
      total: cotes.length,
      stock: cotes.reduce((s, c) => s + c.stockCajas, 0),
      ingreso: cotes.reduce((s, c) => s + c.ingresoCajas, 0),
      export: cotes.reduce((s, c) => s + c.expRefCajas, 0),
      diffTotal: cotes.reduce((s, c) => s + (c.diff || 0), 0),
      conDiff: cotes.filter(c => c.diff !== null && c.diff !== 0).length,
      diffZero: cotes.filter(c => c.diff === 0).length,
    };
  }, [data]);

  const getPallets = (cote: string): StockPallet[] => {
    if (!data) return [];
    return data.pallets.filter(p => p.codigo === cote);
  };

  const getIngresos = (cote: string): Shipment[] => {
    const newRecs = JSON.parse(localStorage.getItem('trazabilidad_dep_new_records') || '[]');
    return newRecs.filter((r: Shipment) => r.nroCote === cote);
  };

  const openAddIngreso = (cote: string, stockCajas: number, productos: string[]) => {
    setAddIngresoCote(cote);
    setAddIngresoCajas(String(stockCajas));
    setAddIngresoTramite('');
    setAddIngresoProducto(productos[0] || '');
    setAddIngresoOpen(true);
  };

  const saveIngreso = () => {
    if (!addIngresoCote || !addIngresoCajas) { toast.error('COTE y Cajas son obligatorios'); return; }
    const newRecord: Shipment = {
      id: `manual_ing_${Date.now()}_${addIngresoCote}`,
      nroTramite: parseInt(addIngresoTramite) || 0,
      fechaTramite: new Date().toISOString(),
      nroCote: addIngresoCote,
      nombreEstablecimientoDestino: 'CALIRAL S.A.',
      paisDestino: 'URUGUAY',
      denominacionMercaderia: addIngresoProducto,
      corte: 'Varios',
      tipo: 'INGRESO',
      cantidadEnvases: parseInt(addIngresoCajas) || 0,
      pesoNeto: 0, pesoBruto: 0,
      fechaEmitidoCote: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(localStorage.getItem('trazabilidad_dep_new_records') || '[]');
      existing.push(newRecord);
      localStorage.setItem('trazabilidad_dep_new_records', JSON.stringify(existing));
      toast.success(`Ingreso añadido: ${addIngresoCote} - ${addIngresoCajas} cajas`);
      setAddIngresoOpen(false);
      setDataVersion(v => v + 1);
    } catch { toast.error('Error al guardar ingreso'); }
  };


  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">Trazabilidad Explorer</h2>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800">Trazabilidad Explorer</h2>
          <span className="text-xs text-slate-500">{data?.fecha} — {stats.total} COTEs</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={stockInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleStockUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => stockInputRef.current?.click()}
            disabled={stockUploading}
            className="gap-1.5"
          >
            {stockUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {stockUploading ? 'Cargando…' : 'Cargar Stock'}
          </Button>
        </div>
      </div>

      {/* KPIs clickeables */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="border-l-4 border-l-teal-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('all')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-teal-700"><Package className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">Stock</span></div>
            <p className="text-xl font-bold text-teal-700 mt-1">{stats.stock.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">cajas</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-emerald-700"><FileCheck className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">Ingreso</span></div>
            <p className="text-xl font-bold text-emerald-700 mt-1">{stats.ingreso.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">cajas</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-700"><Ship className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">Export Ref</span></div>
            <p className="text-xl font-bold text-blue-700 mt-1">{stats.export.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">cajas</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${stats.diffTotal < 0 ? 'border-l-red-500' : 'border-l-amber-500'} cursor-pointer hover:shadow-md transition-shadow`} onClick={() => setFilter('con_diff')}>
          <CardContent className="p-3">
            <div className={`flex items-center gap-2 ${stats.diffTotal < 0 ? 'text-red-700' : 'text-amber-700'}`}><ArrowLeftRight className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">Diff Total</span></div>
            <p className={`text-xl font-bold mt-1 ${stats.diffTotal < 0 ? 'text-red-700' : 'text-amber-700'}`}>{stats.diffTotal > 0 ? '+' : ''}{stats.diffTotal.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">{stats.conDiff} COTEs con diff</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('diff_zero')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">OK</span></div>
            <p className="text-xl font-bold text-emerald-700 mt-1">{stats.diffZero}</p>
            <p className="text-[10px] text-slate-400">COTEs diff=0</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('retorno')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-purple-700"><ArrowLeftRight className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">Retornos</span></div>
            <p className="text-xl font-bold text-purple-700 mt-1">{data?.cotes.filter(c => c.isRetorno).length || 0}</p>
            <p className="text-[10px] text-slate-400">COTEs retorno</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('sin_ingreso')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" /><span className="text-[10px] uppercase font-semibold">Sin Ingreso</span></div>
            <p className="text-xl font-bold text-amber-700 mt-1">{data?.cotes.filter(c => c.ingresoCajas === 0).length || 0}</p>
            <p className="text-[10px] text-slate-400">COTEs sin ingreso</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar COTE, producto, contenedor, trámite..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer hover:text-red-500" onClick={() => setSearch('')} />}
            </div>
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>Todos</Button>
            <Button variant={filter === 'con_diff' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('con_diff')}>Con Diff</Button>
            <Button variant={filter === 'diff_zero' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('diff_zero')}>OK (diff=0)</Button>
            <Button variant={filter === 'retorno' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('retorno')}>Retornos</Button>
            <Button variant={filter === 'sin_ingreso' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('sin_ingreso')}>Sin Ingreso</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-2.5">COTE</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 hidden md:table-cell">Productos</th>
                  <th className="px-3 py-2.5 text-right">Pallets</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-3 py-2.5 text-right">Ingreso</th>
                  <th className="px-3 py-2.5 text-right">Export</th>
                  <th className="px-3 py-2.5 text-right">Saldo</th>
                  <th className="px-3 py-2.5 text-right">Diff</th>
                  <th className="px-3 py-2.5">Causa</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCotes.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-slate-400">No se encontraron COTEs</td></tr>
                ) : (
                  filteredCotes.map(cote => {
                    const isExpanded = expandedCote === cote.cote;
                    const pallets = getPallets(cote.cote);
                    const manualIngresos = getIngresos(cote.cote);
                    const hasData = pallets.length > 0 || cote.ingresoCajas > 0 || cote.expRefCount > 0;
                    const causaInfo = cote.causaDiff ? CAUSA_COLORS[cote.causaDiff] : null;
                    const estadoInfo = ESTADO_COLORS[cote.estado] || ESTADO_COLORS.EN_STOCK;
                    return (
                      <React.Fragment key={cote.cote}>
                        <tr className={`border-b hover:bg-blue-50/40 cursor-pointer ${isExpanded ? 'bg-blue-50/60' : ''}`} onClick={() => setExpandedCote(isExpanded ? null : cote.cote)}>
                          <td className="px-3 py-2 text-xs font-mono font-medium text-teal-700">{cote.cote}</td>
                          <td className="px-3 py-2"><span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${estadoInfo.bg} ${estadoInfo.text}`}>{estadoInfo.label}</span></td>
                          <td className="px-3 py-2 text-xs hidden md:table-cell max-w-[180px] truncate" title={cote.stockProductos.join(' | ')}>
                            {cote.stockProductos.length === 0 ? <span className="text-slate-300">—</span> : cote.stockProductos.length === 1 ? cote.stockProductos[0] : <span className="text-slate-600">{cote.stockProductos.length} productos</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">{cote.stockPallets || '—'}</td>
                          <td className="px-3 py-2 text-xs text-right font-mono font-medium text-teal-700">{cote.stockCajas > 0 ? cote.stockCajas.toLocaleString('es-UY') : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {cote.ingresoCajas > 0 ? (
                              <span className="text-emerald-700">{cote.ingresoCajas.toLocaleString('es-UY')}</span>
                            ) : (
                              <button className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors" onClick={(e) => { e.stopPropagation(); openAddIngreso(cote.cote, cote.stockCajas, cote.stockProductos); }} title="Añadir ingreso">
                                <Plus className="h-3 w-3" />+{cote.stockCajas.toLocaleString('es-UY')}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {cote.expRefCajas > 0 ? (
                              <button className="text-blue-700 hover:text-blue-900 hover:underline font-medium cursor-pointer" onClick={(e) => { e.stopPropagation(); navigateAndFilter('exportaciones', undefined, cote.cote); }} title={`Ver ${cote.expRefCount} exportación(es)`}>
                                {cote.expRefCajas.toLocaleString('es-UY')}
                              </button>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {cote.saldoTeorico !== 0 || cote.ingresoCajas > 0 ? <span className="text-violet-700 font-medium">{cote.saldoTeorico.toLocaleString('es-UY')}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {cote.diff !== null ? (
                              <span className={cote.diff < 0 ? 'text-red-600 font-medium' : cote.diff > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                                {cote.diff > 0 ? '+' : ''}{cote.diff.toLocaleString('es-UY')}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            {causaInfo ? <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${causaInfo.bg} ${causaInfo.text}`} title={cote.causaDiffDesc}>{causaInfo.icon}{cote.causaDiff}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">{hasData && (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 inline" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" />)}</td>
                        </tr>
                        {isExpanded && hasData && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={11} className="px-4 py-3">
                              <div className="space-y-3 text-xs">
                                {/* Timeline */}
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold flex-wrap">
                                  <Calendar className="h-3 w-3" /> Trazabilidad:
                                  <span className="text-emerald-600">Ingreso</span>
                                  <ArrowRight className="h-3 w-3" />
                                  <span className="text-teal-600">Stock ({cote.stockCajas} cajas)</span>
                                  {cote.expRefCount > 0 && <><ArrowRight className="h-3 w-3" /><span className="text-blue-600">Export ({cote.expRefCajas} cajas)</span></>}
                                  {cote.isRetorno && <><ArrowRight className="h-3 w-3" /><span className="text-purple-600">Retorno</span></>}
                                </div>

                                {/* Ingreso details */}
                                {cote.ingresoCajas > 0 && (
                                  <div className="bg-emerald-50 rounded p-3 border border-emerald-200">
                                    <p className="text-[10px] text-emerald-700 uppercase font-bold mb-1 flex items-center gap-1"><FileCheck className="h-3 w-3" /> Ingreso en Depósitos</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                      <div className="flex items-center gap-1"><Hash className="h-3 w-3 text-slate-400" /><span className="text-slate-500">Trámite:</span> <b>{cote.ingresoTramites.join(', ')}</b></div>
                                      <div className="flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-400" /><span className="text-slate-500">Fecha:</span> <b>{cote.ingresoFechas.map(f => fd(f)).join(', ')}</b></div>
                                      <div className="flex items-center gap-1"><Box className="h-3 w-3 text-slate-400" /><span className="text-slate-500">Cajas:</span> <b className="text-emerald-700">{cote.ingresoCajas.toLocaleString('es-UY')}</b></div>
                                      <div className="flex items-center gap-1"><Weight className="h-3 w-3 text-slate-400" /><span className="text-slate-500">Kg:</span> <b>{cote.ingresoKg.toLocaleString('es-UY')}</b></div>
                                    </div>
                                    {cote.ingresoDenoms.length > 0 && <div className="mt-1 text-[11px] flex items-start gap-1"><FileText className="h-3 w-3 text-slate-400 mt-0.5" /><span className="text-slate-500">Denom:</span> {cote.ingresoDenoms.join(' | ')}</div>}
                                    {cote.ingresoCortes.length > 0 && <div className="mt-1 text-[11px]"><span className="text-slate-500">Cortes:</span> {cote.ingresoCortes.join(', ')}</div>}
                                  </div>
                                )}
                                {manualIngresos.length > 0 && (
                                  <div className="bg-emerald-50 rounded p-2 border border-emerald-200 text-[11px]">
                                    <b className="text-emerald-700">Ingreso manual:</b> {manualIngresos.length} registro(s) - {manualIngresos.reduce((s,r) => s + (r.cantidadEnvases||0), 0).toLocaleString('es-UY')} cajas
                                  </div>
                                )}

                                {/* Stock pallets */}
                                {pallets.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center gap-1"><Package className="h-3 w-3" /> Pallets en Stock ({pallets.length}) — Contenedores: {cote.stockContenedores.join(', ')}</p>
                                    <div className="overflow-x-auto border rounded max-h-64">
                                      <table className="w-full text-[11px]">
                                        <thead className="bg-slate-100 sticky top-0"><tr><th className="px-2 py-1 text-left">Contenedor</th><th className="px-2 py-1 text-left">Contenido</th><th className="px-2 py-1 text-right">Cajas</th><th className="px-2 py-1 text-right">Kg</th><th className="px-2 py-1 text-left">Lote</th><th className="px-2 py-1 text-left">Venc.</th></tr></thead>
                                        <tbody>
                                          {pallets.map((p, i) => (
                                            <tr key={i} className="border-t hover:bg-white/50">
                                              <td className="px-2 py-1 font-mono">{p.contenedor || '-'}</td>
                                              <td className="px-2 py-1 max-w-[300px] truncate" title={p.contenido}>{p.contenido}</td>
                                              <td className="px-2 py-1 text-right font-mono">{p.cajas.toLocaleString('es-UY')}</td>
                                              <td className="px-2 py-1 text-right font-mono">{p.kilos.toLocaleString('es-UY')}</td>
                                              <td className="px-2 py-1 font-mono">{p.nroLote || '-'}</td>
                                              <td className="px-2 py-1">{p.fechaVencimiento ? fd(p.fechaVencimiento) : '-'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Export refs */}
                                {cote.expRefCount > 0 && (
                                  <div className="bg-blue-50 rounded p-2 border border-blue-200">
                                    <p className="text-[10px] text-blue-700 uppercase font-bold mb-1 flex items-center gap-1"><Ship className="h-3 w-3" /> Exportaciones que referencian {cote.cote} ({cote.expRefCount})</p>
                                    <p className="text-[11px]">Trámites: {cote.expRefTramites.join(', ')} — Total: {cote.expRefCajas.toLocaleString('es-UY')} cajas</p>
                                    <Button variant="outline" size="sm" className="mt-1 h-6 text-[10px]" onClick={() => navigateAndFilter('exportaciones', undefined, cote.cote)}>Ver en Exportaciones →</Button>
                                  </div>
                                )}

                                {/* Causa diff */}
                                {cote.causaDiff && (
                                  <div className={`rounded p-2 border text-[11px] ${causaInfo?.bg || 'bg-slate-100'} ${causaInfo?.text || 'text-slate-600'}`}>
                                    <b>Causa del diff ({cote.causaDiff}):</b> {cote.causaDiffDesc}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-slate-400">{filteredCotes.length} COTE(s) — Click en fila para ver trazabilidad. Click en Export (azul) para ir a Exportaciones.</p>

      {/* Add Ingreso Dialog */}
      <Dialog open={addIngresoOpen} onOpenChange={setAddIngresoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Añadir Ingreso - COTE {addIngresoCote}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800"><b>COTE:</b> {addIngresoCote} — Completá los datos del ingreso.</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Cajas *</Label><Input type="number" value={addIngresoCajas} onChange={e => setAddIngresoCajas(e.target.value)} /></div>
              <div><Label className="text-xs">Nro. Trámite</Label><Input type="number" value={addIngresoTramite} onChange={e => setAddIngresoTramite(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Producto</Label><Input value={addIngresoProducto} onChange={e => setAddIngresoProducto(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIngresoOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveIngreso}><Plus className="h-4 w-4 mr-1" /> Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
