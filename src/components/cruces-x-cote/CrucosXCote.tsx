'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Search, X, ChevronRight, ChevronDown, FileCheck, ArrowLeftRight, Truck, Ship, Scale, Plus } from 'lucide-react';
import { buildStockAggMap, SIN_CODIGO_KEY, type StockLoad, type StockCodigoAgg, type StockPallet } from '@/lib/parseStockXls';
import { dataUrl } from '@/lib/staticData';
import type { Shipment, ExpRecord } from '@/lib/types';
import { fd, fmt } from '@/lib/utils';
import { toast } from 'sonner';
import { schedulePush } from '@/lib/googleSheets';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/store/useAppStore';
import React from 'react';

const STOCK_DATA_KEY = 'trazabilidad_stock_data';
const STOCK_ASSIGN_KEY = 'trazabilidad_stock_assignments';
const DEP_IMPORTED_KEY = 'trazabilidad_dep_imported';
const EXP_IMPORTED_KEY = 'trazabilidad_exp_imported';

interface IngresoAgg {
  cote: string;
  tramite: number;
  fecha: string;
  productos: string[];
  cortes: string[];
  lineCount: number;
  envases: number;
  pesoBruto: number;
  pesoNeto: number;
}

function aggregateIngresosByCote(shipments: Shipment[]): Map<string, IngresoAgg> {
  const map = new Map<string, IngresoAgg>();
  for (const s of shipments) {
    const cote = s.nroCote?.toUpperCase().trim();
    if (!cote) continue;
    const existing = map.get(cote);
    if (existing) {
      existing.envases += s.cantidadEnvases || 0;
      existing.pesoBruto += s.pesoBruto || 0;
      existing.pesoNeto += s.pesoNeto || 0;
      existing.lineCount += 1;
      if (s.corte && !existing.cortes.includes(s.corte)) existing.cortes.push(s.corte);
      if (s.denominacionMercaderia && !existing.productos.includes(s.denominacionMercaderia)) existing.productos.push(s.denominacionMercaderia);
    } else {
      map.set(cote, {
        cote,
        tramite: s.nroTramite || 0,
        fecha: s.fechaTramite || '',
        productos: s.denominacionMercaderia ? [s.denominacionMercaderia] : [],
        cortes: s.corte ? [s.corte] : [],
        lineCount: 1,
        envases: s.cantidadEnvases || 0,
        pesoBruto: s.pesoBruto || 0,
        pesoNeto: s.pesoNeto || 0,
      });
    }
  }
  return map;
}

function aggregateExportCajasByCote(expRecords: ExpRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expRecords) {
    const obs = e.observaciones || '';
    const coteMatches = obs.match(/P\d{4,8}/gi) || [];
    for (const c of coteMatches) {
      const upper = c.toUpperCase();
      map.set(upper, (map.get(upper) || 0) + (e.cantidadEnvases || 0));
    }
  }
  return map;
}

interface ExportRef {
  cote: string;
  expCote: string;
  tramite: number;
  fecha: string;
  pais: string;
  producto: string;
  cajas: number;
  kgNeto: number;
}

function getExportRefsByCote(expRecords: ExpRecord[]): Map<string, ExportRef[]> {
  const map = new Map<string, ExportRef[]>();
  for (const e of expRecords) {
    const obs = e.observaciones || '';
    const coteMatches = obs.match(/P\d{4,8}/gi) || [];
    for (const c of coteMatches) {
      const upper = c.toUpperCase();
      if (!map.has(upper)) map.set(upper, []);
      map.get(upper)!.push({
        cote: upper,
        expCote: e.nroCote || '',
        tramite: e.nroTramite || 0,
        fecha: e.fechaTramite || '',
        pais: e.paisDestino || '',
        producto: e.denominacionMercaderia || '',
        cajas: e.cantidadEnvases || 0,
        kgNeto: e.pesoNeto || 0,
      });
    }
  }
  return map;
}

async function loadExportaciones(): Promise<ExpRecord[]> {
  // Use ONLY pre-processed JSON from exportaciones MGAP file as base
  // (NOT trazabilidad_exp_imported because it has old/duplicate data)
  let baseRecords: ExpRecord[] = [];
  try {
    const r = await fetch(dataUrl('data/exportaciones_frimaral.json'));
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) baseRecords = data;
    }
  } catch { /* ignore */ }

  // Add ONLY NEW records created from "Exportaciones" (manual + PDF uploads)
  try {
    const newRecs = localStorage.getItem('trazabilidad_new_records');
    if (newRecs) {
      const parsed = JSON.parse(newRecs);
      if (Array.isArray(parsed)) {
        const existingIds = new Set(baseRecords.map((r: ExpRecord) => r.id));
        for (const r of parsed) {
          if (!existingIds.has(r.id)) baseRecords.push(r);
        }
      }
    }
  } catch { /* ignore */ }

  // Apply edits
  try {
    const editsRaw = localStorage.getItem('trazabilidad_exp_edits');
    if (editsRaw) {
      const edits = JSON.parse(editsRaw);
      for (const r of baseRecords) {
        if (edits[r.id]) {
          Object.assign(r, edits[r.id]);
        }
      }
    }
  } catch { /* ignore */ }

  return baseRecords;
}

async function loadDepositos(): Promise<Shipment[]> {
  // Use ONLY pre-processed JSON from ingresos MGAP file as base
  // (NOT trazabilidad_dep_imported because it has old/duplicate data)
  let baseRecords: Shipment[] = [];
  try {
    const r = await fetch(dataUrl('data/ingresos_frimaral.json'));
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) baseRecords = data;
    }
  } catch { /* ignore */ }

  // Add ONLY NEW records created from "A Depósitos" (manual + PDF uploads)
  // These have ids starting with 'new_' or 'manual_' or 'pdf_'
  try {
    const newRecs = localStorage.getItem('trazabilidad_dep_new_records');
    if (newRecs) {
      const parsed = JSON.parse(newRecs);
      if (Array.isArray(parsed)) {
        const existingIds = new Set(baseRecords.map((r: Shipment) => r.id));
        for (const r of parsed) {
          if (!existingIds.has(r.id)) baseRecords.push(r);
        }
      }
    }
  } catch { /* ignore */ }

  // Apply edits (override fields) - only for records that exist in baseRecords
  try {
    const editsRaw = localStorage.getItem('trazabilidad_dep_edits');
    if (editsRaw) {
      const edits = JSON.parse(editsRaw);
      for (const r of baseRecords) {
        if (edits[r.id]) {
          Object.assign(r, edits[r.id]);
        }
      }
    }
  } catch { /* ignore */ }

  return baseRecords;
}

export default function CrucosXCote() {
  const navigateAndFilter = useAppStore(s => s.navigateAndFilter);
  const [stockData, setStockData] = useState<StockLoad | null>(null);
  const [palletAssignments, setPalletAssignments] = useState<Record<string, { codigo: string; tipo: 'COTE' | 'PASE_SANITARIO' }>>({});
  const [ingresoMap, setIngresoMap] = useState<Map<string, IngresoAgg>>(new Map());
  const [exportCajasMap, setExportCajasMap] = useState<Map<string, number>>(new Map());
  const [exportRefsMap, setExportRefsMap] = useState<Map<string, ExportRef[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [filter, setFilter] = useState<'all' | 'con_diff' | 'sin_stock' | 'sin_ingreso'>('all');
  const [addIngresoOpen, setAddIngresoOpen] = useState(false);
  const [addIngresoCote, setAddIngresoCote] = useState<string>('');
  const [addIngresoCajas, setAddIngresoCajas] = useState('');
  const [addIngresoKg, setAddIngresoKg] = useState('');
  const [addIngresoTramite, setAddIngresoTramite] = useState('');
  const [addIngresoFecha, setAddIngresoFecha] = useState('');
  const [addIngresoProducto, setAddIngresoProducto] = useState('');
  const [addIngresoCorte, setAddIngresoCorte] = useState('');

  const reloadData = useCallback(async () => {
    try {
      const saved = localStorage.getItem(STOCK_DATA_KEY);
      if (saved) setStockData(JSON.parse(saved));
      else setStockData(null);
      const savedAssign = localStorage.getItem(STOCK_ASSIGN_KEY);
      if (savedAssign) setPalletAssignments(JSON.parse(savedAssign));
      else setPalletAssignments({});
      const [deps, exps] = await Promise.all([loadDepositos(), loadExportaciones()]);
      setIngresoMap(aggregateIngresosByCote(deps));
      setExportCajasMap(aggregateExportCajasByCote(exps));
      setExportRefsMap(getExportRefsByCote(exps));
    } catch (err) {
      console.error('Error loading data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { reloadData(); }, [reloadData]);

  useEffect(() => {
    const handler = () => setDataVersion(v => v + 1);
    window.addEventListener('trazabilidad-data-ready', handler);
    return () => window.removeEventListener('trazabilidad-data-ready', handler);
  }, []);

  useEffect(() => {
    if (dataVersion === 0) return;
    reloadData();
  }, [dataVersion, reloadData]);

  // Open add ingreso dialog for a COTE
  const openAddIngreso = (cote: string, stockCajas: number, stockProductos: string[]) => {
    setAddIngresoCote(cote);
    setAddIngresoCajas(String(stockCajas)); // Pre-fill with stock cajas
    setAddIngresoKg('');
    setAddIngresoTramite('');
    setAddIngresoFecha(new Date().toISOString().split('T')[0]);
    setAddIngresoProducto(stockProductos[0] || '');
    setAddIngresoCorte('');
    setAddIngresoOpen(true);
  };

  // Save ingreso to localStorage
  const saveIngreso = () => {
    if (!addIngresoCote || !addIngresoCajas) {
      toast.error('COTE y Cajas son obligatorios');
      return;
    }
    const newRecord: Shipment = {
      id: `manual_ing_${Date.now()}_${addIngresoCote}`,
      nroTramite: parseInt(addIngresoTramite) || 0,
      fechaTramite: addIngresoFecha ? new Date(addIngresoFecha).toISOString() : new Date().toISOString(),
      nroCote: addIngresoCote,
      nombreEstablecimientoDestino: 'CALIRAL S.A.',
      paisDestino: 'URUGUAY',
      denominacionMercaderia: addIngresoProducto,
      corte: addIngresoCorte,
      tipo: 'INGRESO',
      cantidadEnvases: parseInt(addIngresoCajas) || 0,
      pesoNeto: parseFloat(addIngresoKg) || 0,
      pesoBruto: parseFloat(addIngresoKg) || 0,
      fechaEmitidoCote: addIngresoFecha ? new Date(addIngresoFecha).toISOString() : null,
    };
    // Save to trazabilidad_dep_new_records
    try {
      const existing = JSON.parse(localStorage.getItem('trazabilidad_dep_new_records') || '[]');
      existing.push(newRecord);
      localStorage.setItem('trazabilidad_dep_new_records', JSON.stringify(existing));
      // Also push to Firebase
      schedulePush();
      toast.success(`Ingreso añadido: ${addIngresoCote} - ${addIngresoCajas} cajas`);
      setAddIngresoOpen(false);
      setDataVersion(v => v + 1); // Trigger reload
    } catch (err) {
      toast.error('Error al guardar ingreso');
    }
  };

  const stockAggMap = useMemo(() => {
    if (!stockData) return new Map<string, StockCodigoAgg>();
    const modified: StockPallet[] = stockData.pallets.map(p => {
      const a = palletAssignments[p.id];
      if (a) return { ...p, codigo: a.codigo, codigoTipo: a.tipo };
      return p;
    });
    return buildStockAggMap(modified);
  }, [stockData, palletAssignments]);

  interface CoteRow {
    cote: string;
    tipo: string;
    stockPallets: number;
    stockCajas: number;
    stockKg: number;
    stockProductos: string[];
    stockContenedores: string[];
    stockPalletsList: StockPallet[];
    ingresoCajas: number;
    ingresoKg: number;
    ingresoTramite: number;
    ingresoFecha: string;
    ingresoProductos: string[];
    ingresoCortes: string[];
    exportCajas: number;
    exportRefs: ExportRef[];
    diff: number | null;
    saldoTeorico: number | null;
  }

  const unifiedRows = useMemo(() => {
    const rows = new Map<string, CoteRow>();
    for (const [key, agg] of stockAggMap) {
      if (key === SIN_CODIGO_KEY) continue;
      rows.set(agg.codigo, {
        cote: agg.codigo,
        tipo: agg.tipo,
        stockPallets: agg.totalPallets,
        stockCajas: agg.totalCajas,
        stockKg: agg.totalKilos,
        stockProductos: agg.productos,
        stockContenedores: agg.contenedores,
        stockPalletsList: agg.pallets,
        ingresoCajas: 0,
        ingresoKg: 0,
        ingresoTramite: 0,
        ingresoFecha: '',
        ingresoProductos: [],
        ingresoCortes: [],
        exportCajas: 0,
        exportRefs: [],
        diff: null,
        saldoTeorico: null,
      });
    }
    for (const [cote, ing] of ingresoMap) {
      const existing = rows.get(cote);
      if (existing) {
        existing.ingresoCajas = ing.envases;
        existing.ingresoKg = ing.pesoNeto;
        existing.ingresoTramite = ing.tramite;
        existing.ingresoFecha = ing.fecha;
        existing.ingresoProductos = ing.productos;
        existing.ingresoCortes = ing.cortes;
      }
      // Do NOT add rows for COTEs that have no stock - only show COTEs that are in stock
    }
    for (const [cote, expCajas] of exportCajasMap) {
      const existing = rows.get(cote);
      if (existing) {
        existing.exportCajas = expCajas;
        existing.exportRefs = exportRefsMap.get(cote) || [];
      }
      // Do NOT add rows for COTEs that have no stock
    }
    for (const row of rows.values()) {
      if (row.ingresoCajas > 0 || row.stockCajas > 0) {
        row.saldoTeorico = row.ingresoCajas - row.exportCajas;
        row.diff = row.stockCajas - row.saldoTeorico;
      }
    }
    return rows;
  }, [stockAggMap, ingresoMap, exportCajasMap, exportRefsMap]);

  const filteredRows = useMemo(() => {
    let items = [...unifiedRows.values()];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(r =>
        r.cote.toLowerCase().includes(s) ||
        r.stockProductos.some(p => p.toLowerCase().includes(s)) ||
        r.ingresoProductos.some(p => p.toLowerCase().includes(s)) ||
        r.stockContenedores.some(c => c.toLowerCase().includes(s))
      );
    }
    if (filter === 'con_diff') {
      items = items.filter(r => r.diff !== null && r.diff !== 0);
    } else if (filter === 'sin_stock') {
      items = items.filter(r => r.stockCajas === 0);
    } else if (filter === 'sin_ingreso') {
      items = items.filter(r => r.ingresoCajas === 0 && r.stockCajas > 0);
    }
    items.sort((a, b) => (b.stockCajas + b.ingresoCajas) - (a.stockCajas + a.ingresoCajas));
    return items;
  }, [unifiedRows, search, filter]);

  const totalStockCajas = [...unifiedRows.values()].reduce((s, r) => s + r.stockCajas, 0);
  const totalIngresoCajas = [...unifiedRows.values()].reduce((s, r) => s + r.ingresoCajas, 0);
  const totalExportCajas = [...unifiedRows.values()].reduce((s, r) => s + r.exportCajas, 0);
  const totalDiff = totalStockCajas - (totalIngresoCajas - totalExportCajas);
  const totalCotes = unifiedRows.size;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">Cruces X COTE</h2>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800">Cruces X COTE</h2>
          <span className="text-xs text-slate-500">{totalCotes} COTEs unificados</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-teal-700">
              <Package className="h-4 w-4" />
              <span className="text-[10px] uppercase font-semibold">Stock</span>
            </div>
            <p className="text-xl font-bold text-teal-700 mt-1">{totalStockCajas.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">cajas totales</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <FileCheck className="h-4 w-4" />
              <span className="text-[10px] uppercase font-semibold">Ingreso</span>
            </div>
            <p className="text-xl font-bold text-emerald-700 mt-1">{totalIngresoCajas.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">cajas en depósitos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-700">
              <Ship className="h-4 w-4" />
              <span className="text-[10px] uppercase font-semibold">Export</span>
            </div>
            <p className="text-xl font-bold text-blue-700 mt-1">{totalExportCajas.toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">cajas exportadas</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-violet-700">
              <Scale className="h-4 w-4" />
              <span className="text-[10px] uppercase font-semibold">Saldo Teórico</span>
            </div>
            <p className="text-xl font-bold text-violet-700 mt-1">{(totalIngresoCajas - totalExportCajas).toLocaleString('es-UY')}</p>
            <p className="text-[10px] text-slate-400">ingreso - export</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${totalDiff < 0 ? 'border-l-red-500' : totalDiff > 0 ? 'border-l-amber-500' : 'border-l-slate-400'}`}>
          <CardContent className="p-3">
            <div className={`flex items-center gap-2 ${totalDiff < 0 ? 'text-red-700' : totalDiff > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
              <ArrowLeftRight className="h-4 w-4" />
              <span className="text-[10px] uppercase font-semibold">Diff Total</span>
            </div>
            <p className={`text-xl font-bold mt-1 ${totalDiff < 0 ? 'text-red-700' : totalDiff > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
              {totalDiff > 0 ? '+' : ''}{totalDiff.toLocaleString('es-UY')}
            </p>
            <p className="text-[10px] text-slate-400">stock - saldo teórico</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-slate-700">
              <FileCheck className="h-4 w-4" />
              <span className="text-[10px] uppercase font-semibold">COTEs</span>
            </div>
            <p className="text-xl font-bold text-slate-700 mt-1">{totalCotes}</p>
            <p className="text-[10px] text-slate-400">total unificados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar COTE, producto, contenedor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
              {search && (
                <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer hover:text-red-500" onClick={() => setSearch('')} />
              )}
            </div>
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>Todos</Button>
            <Button variant={filter === 'con_diff' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('con_diff')}>Con Diff</Button>
            <Button variant={filter === 'sin_stock' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('sin_stock')}>Sin Stock</Button>
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
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5 hidden md:table-cell">Productos (Stock)</th>
                  <th className="px-3 py-2.5 text-right">Pallets</th>
                  <th className="px-3 py-2.5 text-right">Stock Cajas</th>
                  <th className="px-3 py-2.5 text-right">Ingreso Cajas</th>
                  <th className="px-3 py-2.5 text-right">Export Cajas</th>
                  <th className="px-3 py-2.5 text-right">Saldo Teór.</th>
                  <th className="px-3 py-2.5 text-right">Diff</th>
                  <th className="px-3 py-2.5 text-right hidden lg:table-cell">Stock Kg</th>
                  <th className="px-3 py-2.5 text-right hidden lg:table-cell">Ingreso Kg</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-10 text-slate-400">No se encontraron COTEs</td></tr>
                ) : (
                  filteredRows.map(row => {
                    const isExpanded = expandedCode === row.cote;
                    const hasData = row.stockPalletsList.length > 0 || row.ingresoCajas > 0 || row.exportRefs.length > 0;
                    return (
                      <React.Fragment key={row.cote}>
                        <tr
                          className={`border-b hover:bg-blue-50/40 cursor-pointer ${isExpanded ? 'bg-blue-50/60' : ''}`}
                          onClick={() => setExpandedCode(isExpanded ? null : row.cote)}
                        >
                          <td className="px-3 py-2 text-xs font-mono font-medium text-teal-700">{row.cote}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${row.tipo === 'COTE' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                              {row.tipo === 'COTE' ? 'COTE' : 'PASE'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs hidden md:table-cell max-w-[200px] truncate" title={row.stockProductos.join(' | ')}>
                            {row.stockProductos.length === 0 ? (
                              <span className="text-slate-300">—</span>
                            ) : row.stockProductos.length === 1 ? (
                              row.stockProductos[0]
                            ) : (
                              <span className="text-slate-600">{row.stockProductos.length} productos</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">{row.stockPallets || '—'}</td>
                          <td className="px-3 py-2 text-xs text-right font-mono font-medium text-teal-700">
                            {row.stockCajas > 0 ? row.stockCajas.toLocaleString('es-UY') : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {row.ingresoCajas > 0 ? (
                              <span className="text-emerald-700">{row.ingresoCajas.toLocaleString('es-UY')}</span>
                            ) : (
                              <button
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAddIngreso(row.cote, row.stockCajas, row.stockProductos);
                                }}
                                title="Añadir ingreso para este COTE"
                              >
                                <Plus className="h-3 w-3" />
                                +{row.stockCajas.toLocaleString('es-UY')}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {row.exportCajas > 0 ? (
                              <button
                                className="text-blue-700 hover:text-blue-900 hover:underline font-medium cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateAndFilter('exportaciones', undefined, row.cote);
                                }}
                                title={`Ver exportaciones que referencian ${row.cote}`}
                              >
                                {row.exportCajas.toLocaleString('es-UY')}
                              </button>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {row.saldoTeorico !== null ? (
                              <span className="text-violet-700 font-medium">{row.saldoTeorico.toLocaleString('es-UY')}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">
                            {row.diff !== null ? (
                              <span className={row.diff < 0 ? 'text-red-600 font-medium' : row.diff > 0 ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                                {row.diff > 0 ? '+' : ''}{row.diff.toLocaleString('es-UY')}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono text-slate-600 hidden lg:table-cell">
                            {row.stockKg > 0 ? row.stockKg.toLocaleString('es-UY') : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono text-slate-600 hidden lg:table-cell">
                            {row.ingresoKg > 0 ? row.ingresoKg.toLocaleString('es-UY') : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {hasData && (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 inline" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" />)}
                          </td>
                        </tr>
                        {isExpanded && hasData && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={12} className="px-4 py-3">
                              <div className="space-y-4 text-xs">
                                {/* Stock pallets */}
                                {row.stockPalletsList.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                                      Pallets en Stock ({row.stockPalletsList.length}) — Contenedores: {row.stockContenedores.join(', ')}
                                    </p>
                                    <div className="overflow-x-auto border rounded">
                                      <table className="w-full text-[11px]">
                                        <thead className="bg-slate-100">
                                          <tr>
                                            <th className="px-2 py-1 text-left">Contenedor</th>
                                            <th className="px-2 py-1 text-left">Contenido</th>
                                            <th className="px-2 py-1 text-right">Cajas</th>
                                            <th className="px-2 py-1 text-right">Kg</th>
                                            <th className="px-2 py-1 text-left">Lote</th>
                                            <th className="px-2 py-1 text-left">Venc.</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {row.stockPalletsList.map((p, i) => (
                                            <tr key={i} className="border-t">
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

                                {/* Ingreso details */}
                                {row.ingresoCajas > 0 && (
                                  <div className="bg-emerald-50 rounded p-3 border border-emerald-200">
                                    <p className="text-[10px] text-emerald-700 uppercase font-bold mb-1">Ingreso en Depósitos</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                      <div><span className="text-slate-500">Trámite:</span> <b>{row.ingresoTramite}</b></div>
                                      <div><span className="text-slate-500">Fecha:</span> <b>{row.ingresoFecha ? fd(row.ingresoFecha) : '-'}</b></div>
                                      <div><span className="text-slate-500">Cajas:</span> <b className="text-emerald-700">{row.ingresoCajas.toLocaleString('es-UY')}</b></div>
                                      <div><span className="text-slate-500">Kg Neto:</span> <b>{row.ingresoKg.toLocaleString('es-UY')}</b></div>
                                    </div>
                                    {row.ingresoProductos.length > 0 && (
                                      <div className="mt-1 text-[11px]"><span className="text-slate-500">Productos:</span> {row.ingresoProductos.join(' | ')}</div>
                                    )}
                                    {row.ingresoCortes.length > 0 && (
                                      <div className="mt-1 text-[11px]"><span className="text-slate-500">Cortes:</span> {row.ingresoCortes.join(', ')}</div>
                                    )}
                                  </div>
                                )}

                                {/* Export refs */}
                                {row.exportRefs.length > 0 && (
                                  <div>
                                    <p className="text-[10px] text-blue-700 uppercase font-bold mb-1">
                                      Exportaciones que referencian {row.cote} ({row.exportRefs.length})
                                    </p>
                                    <div className="overflow-x-auto border rounded">
                                      <table className="w-full text-[11px]">
                                        <thead className="bg-slate-100">
                                          <tr>
                                            <th className="px-2 py-1 text-left">COTE Export</th>
                                            <th className="px-2 py-1 text-left">Trámite</th>
                                            <th className="px-2 py-1 text-left">Fecha</th>
                                            <th className="px-2 py-1 text-left">País</th>
                                            <th className="px-2 py-1 text-left">Producto</th>
                                            <th className="px-2 py-1 text-right">Cajas</th>
                                            <th className="px-2 py-1 text-right">Kg Neto</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {row.exportRefs.map((e, i) => (
                                            <tr key={i} className="border-t">
                                              <td className="px-2 py-1 font-mono text-blue-700">{e.expCote}</td>
                                              <td className="px-2 py-1 font-mono">{e.tramite}</td>
                                              <td className="px-2 py-1">{e.fecha ? fd(e.fecha) : '-'}</td>
                                              <td className="px-2 py-1">{e.pais}</td>
                                              <td className="px-2 py-1 max-w-[200px] truncate" title={e.producto}>{e.producto}</td>
                                              <td className="px-2 py-1 text-right font-mono">{e.cajas.toLocaleString('es-UY')}</td>
                                              <td className="px-2 py-1 text-right font-mono">{e.kgNeto.toLocaleString('es-UY')}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
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
      <p className="text-xs text-slate-400">{filteredRows.length} COTE(s) — Click en una fila para ver detalle completo (stock, ingreso, exportaciones)</p>

      {/* Add Ingreso Dialog */}
      <Dialog open={addIngresoOpen} onOpenChange={setAddIngresoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir Ingreso - COTE {addIngresoCote}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800">
              <b>COTE:</b> {addIngresoCote} — Este COTE tiene stock pero no tiene ingreso registrado en depósitos.
              Completá los datos del ingreso para vincularlo.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ing-cajas" className="text-xs">Cajas (envases) *</Label>
                <Input id="ing-cajas" type="number" value={addIngresoCajas} onChange={e => setAddIngresoCajas(e.target.value)} placeholder="1888" />
              </div>
              <div>
                <Label htmlFor="ing-kg" className="text-xs">Peso Neto (kg)</Label>
                <Input id="ing-kg" type="number" step="0.01" value={addIngresoKg} onChange={e => setAddIngresoKg(e.target.value)} placeholder="28032" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ing-tramite" className="text-xs">Nro. Trámite</Label>
                <Input id="ing-tramite" type="number" value={addIngresoTramite} onChange={e => setAddIngresoTramite(e.target.value)} placeholder="500000" />
              </div>
              <div>
                <Label htmlFor="ing-fecha" className="text-xs">Fecha</Label>
                <Input id="ing-fecha" type="date" value={addIngresoFecha} onChange={e => setAddIngresoFecha(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="ing-producto" className="text-xs">Producto / Denominación</Label>
              <Input id="ing-producto" value={addIngresoProducto} onChange={e => setAddIngresoProducto(e.target.value)} placeholder="CARNE BOVINA SIN HUESO CONGELADA" />
            </div>
            <div>
              <Label htmlFor="ing-corte" className="text-xs">Corte</Label>
              <Input id="ing-corte" value={addIngresoCorte} onChange={e => setAddIngresoCorte(e.target.value)} placeholder="Varios" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIngresoOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveIngreso}>
              <Plus className="h-4 w-4 mr-1" /> Añadir Ingreso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
