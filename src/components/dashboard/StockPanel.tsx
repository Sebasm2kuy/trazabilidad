'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Upload, Search, X, ChevronRight, ChevronDown } from 'lucide-react';
import { buildStockAggMap, SIN_CODIGO_KEY, type StockLoad, type StockCodigoAgg, type StockPallet } from '@/lib/parseStockXls';
import type { ExpRecord, Shipment } from '@/lib/types';
import { loadDepositos as loadDepCentral, loadExportaciones as loadExpCentral } from '@/lib/dataRepository';
import { fd, fmt } from '@/lib/utils';

// Aggregate ingreso by COTE
interface IngresoAgg {
  cote: string;
  tramite: number;
  fecha: string;
  producto: string;
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
    // Group ONLY by cote — all products/cortes unified
    const existing = map.get(cote);
    if (existing) {
      existing.envases += s.cantidadEnvases || 0;
      existing.pesoBruto += s.pesoBruto || 0;
      existing.pesoNeto += s.pesoNeto || 0;
      existing.lineCount += 1;
      if (s.corte && !existing.cortes.includes(s.corte)) existing.cortes.push(s.corte);
    } else {
      map.set(cote, {
        cote,
        tramite: s.nroTramite || 0,
        fecha: s.fechaTramite || '',
        producto: s.denominacionMercaderia || '',
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

// Match a stock product name to a deposit ingreso record by keywords
// Returns the matching IngresoAgg or null
// Special handling: if an ingreso has corte "Varios", it's a generic bucket that
// matches multiple stock products — we only match it if no specific match exists
function matchIngresoByProduct(
  ingresoMap: Map<string, IngresoAgg>,
  cote: string,
  stockProducto: string
): IngresoAgg | null {
  // Collect all ingreso candidates for this cote
  const candidates: IngresoAgg[] = [];
  for (const [k, v] of ingresoMap) {
    if (k.startsWith(`${cote}||`)) {
      candidates.push(v);
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Separate specific matches from generic "Varios" matches
  const specific = candidates.filter(c => {
    const corteUpper = c.cortes.join(' ').toUpperCase();
    return !['VARIOS', 'VARIOS', 'MIXTO', 'MIXTOS'].includes(corteUpper);
  });
  const generic = candidates.filter(c => {
    const corteUpper = c.cortes.join(' ').toUpperCase();
    return ['VARIOS', 'VARIOS', 'MIXTO', 'MIXTOS'].includes(corteUpper);
  });

  const stkUpper = stockProducto.toUpperCase();
  const stkWords = stkUpper.split(/[\s-]+/).filter(w => w.length > 2 && !['CNG','BLQ','IWP','VP','LP','BOV','OVI','ANGUS','VILA','CHINA','PLY','POLY','CL','GF','VL'].includes(w));

  // First try specific matches (non-"Varios")
  let bestMatch: IngresoAgg | null = null;
  let bestScore = 0;
  for (const ing of specific) {
    let score = 0;
    for (const corte of ing.cortes) {
      const corteUpper = corte.toUpperCase();
      if (stkUpper.includes(corteUpper)) score += 10;
      const corteWords = corteUpper.split(/[\s-]+/).filter(w => w.length > 2);
      for (const cw of corteWords) {
        if (stkWords.includes(cw)) score += 5;
      }
    }
    if (stkUpper.includes(ing.producto.toUpperCase())) score += 3;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ing;
    }
  }
  // If specific match found, use it
  if (bestScore > 0) return bestMatch;

  // No specific match — if stock product is "Varios" or generic, match with generic ingreso
  if (generic.length > 0) {
    // Only match generic if the stock product itself is generic
    // (otherwise we can't know which part of the generic ingreso belongs to this product)
    return null;
  }
  return null;
}

// Aggregate exportaciones cajas by referenced COTE
function aggregateExportCajasByCote(expRecords: ExpRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expRecords) {
    // Check observaciones for COTE references
    const obs = e.observaciones || '';
    const coteMatches = obs.match(/P\d{4,8}/gi) || [];
    for (const c of coteMatches) {
      const upper = c.toUpperCase();
      map.set(upper, (map.get(upper) || 0) + (e.cantidadEnvases || 0));
    }
  }
  return map;
}

async function loadExportaciones(): Promise<ExpRecord[]> {
  try { return await loadExpCentral(); } catch { return []; }
}

async function loadDepositos(): Promise<Shipment[]> {
  try { return await loadDepCentral(); } catch { return []; }
}

export default function StockPanel() {
  const [stockData, setStockData] = useState<StockLoad | null>(null);
  const [palletAssignments, setPalletAssignments] = useState<Record<string, { codigo: string; tipo: 'COTE' | 'PASE_SANITARIO'; cajas?: number }>>({});
  const [ingresoMap, setIngresoMap] = useState<Map<string, IngresoAgg>>(new Map());
  const [exportCajasMap, setExportCajasMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  // Load all data on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      // Supabase is the only operational source. The current snapshot query will
      // be enabled together with the transactional stock importer.
      setStockData(null);
      setPalletAssignments({});
      // Load depósitos + exportaciones
      const [deps, exps] = await Promise.all([loadDepositos(), loadExportaciones()]);
      setIngresoMap(aggregateIngresosByCote(deps));
      setExportCajasMap(aggregateExportCajasByCote(exps));
      setLoading(false);
    })();
  }, []);

  // Listen for Firebase data-ready
  useEffect(() => {
    const handler = () => setDataVersion(v => v + 1);
    window.addEventListener('trazabilidad-data-ready', handler);
    return () => window.removeEventListener('trazabilidad-data-ready', handler);
  }, []);

  // Reload Supabase movements when another screen reports a data change.
  useEffect(() => {
    if (dataVersion === 0) return;
    setStockData(null);
    setPalletAssignments({});
    // Reload depósitos/exportaciones
    (async () => {
      const [deps, exps] = await Promise.all([loadDepositos(), loadExportaciones()]);
      setIngresoMap(aggregateIngresosByCote(deps));
      setExportCajasMap(aggregateExportCajasByCote(exps));
    })();
  }, [dataVersion]);

  // Build stockAggMap with assignments applied
  const stockAggMap = useMemo(() => {
    if (!stockData) return new Map<string, StockCodigoAgg>();
    const modified: StockPallet[] = stockData.pallets.map(p => {
      const a = palletAssignments[p.id];
      if (a) {
        const cajasOverride = typeof a.cajas === 'number' && a.cajas > 0 ? a.cajas : p.cajas;
        return { ...p, codigo: a.codigo, codigoTipo: a.tipo, cajas: cajasOverride };
      }
      return p;
    });
    return buildStockAggMap(modified);
  }, [stockData, palletAssignments]);

  // Filter
  const regularAggMap = useMemo(() => {
    const m = new Map<string, StockCodigoAgg>();
    for (const [k, v] of stockAggMap) {
      if (k !== SIN_CODIGO_KEY) m.set(k, v);
    }
    return m;
  }, [stockAggMap]);

  const sinCodigoAgg = stockAggMap.get(SIN_CODIGO_KEY);

  const filteredItems = useMemo(() => {
    let items = [...regularAggMap.values()];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(a =>
        a.codigo.toLowerCase().includes(s) ||
        a.producto.toLowerCase().includes(s) ||
        a.contenedores.some(c => c.toLowerCase().includes(s))
      );
    }
    items.sort((a, b) => b.totalCajas - a.totalCajas);
    return items;
  }, [regularAggMap, search]);

  // Totals
  const totalCajasStock = [...stockAggMap.values()].reduce((s, a) => s + a.totalCajas, 0);
  const totalKgStock = [...stockAggMap.values()].reduce((s, a) => s + a.totalKilos, 0);
  const totalPallets = stockData?.pallets.length || 0;
  const totalCodigos = stockAggMap.size;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-teal-500">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-teal-600" />
            <h2 className="text-xl font-bold text-slate-800">Stock Frimaral</h2>
            {stockData && (
              <span className="text-xs text-slate-500">
                al {stockData.fecha ? fd(stockData.fecha) : '-'} — {stockData.cliente}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 gap-1.5"
              disabled
            >
              <Upload className="h-4 w-4" />
              Importación en preparación
            </Button>
          </div>
        </div>

        {!stockData ? (
          <div className="text-center py-16 text-slate-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay datos de stock cargados.</p>
            <p className="text-xs mt-1">La base Supabase está vacía. La carga se habilitará con la importación transaccional.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mb-3 p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800">
              <div className="flex flex-wrap items-center gap-4">
                <span>Total códigos: <b>{totalCodigos}</b></span>
                <span>Total pallets: <b>{totalPallets}</b></span>
                <span>Cajas totales: <b>{totalCajasStock.toLocaleString('es-UY')}</b></span>
                <span>Kg totales: <b>{totalKgStock.toLocaleString('es-UY')}</b></span>
                {sinCodigoAgg && (
                  <span className="text-amber-700">S/PASE/COTE: <b>{sinCodigoAgg.totalPallets} pal.</b></span>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar código, producto, contenedor..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
                {search && (
                  <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer hover:text-red-500" onClick={() => setSearch('')} />
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                    <th className="px-3 py-2.5">Código</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5 hidden md:table-cell">Producto</th>
                    <th className="px-3 py-2.5 hidden xl:table-cell">Contenedores</th>
                    <th className="px-3 py-2.5 text-right">Pallets</th>
                    <th className="px-3 py-2.5 text-right">Cajas Stock</th>
                    <th className="px-3 py-2.5 text-right">Cajas Ingreso</th>
                    <th className="px-3 py-2.5 text-right">Cajas Export</th>
                    <th className="px-3 py-2.5 text-right">Diff</th>
                    <th className="px-3 py-2.5 text-right">Kg</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-8 text-slate-400">No se encontraron resultados</td></tr>
                  ) : (
                    filteredItems.map(agg => {
                      // Lookup ingreso by cote only (unified)
                      const ing = ingresoMap.get(agg.codigo);
                      const expCajas = exportCajasMap.get(agg.codigo) || 0;
                      const saldoTeorico = ing ? ing.envases - expCajas : null;
                      const diff = saldoTeorico !== null ? agg.totalCajas - saldoTeorico : null;
                      const isExpanded = expandedCode === (agg._groupKey || agg.codigo);
                      return (
                        <React.Fragment key={agg._groupKey || agg.codigo}>
                          <tr
                            className={`border-b hover:bg-teal-50/40 cursor-pointer ${isExpanded ? 'bg-teal-50/60' : ''}`}
                            onClick={() => setExpandedCode(isExpanded ? null : (agg._groupKey || agg.codigo))}
                          >
                            <td className="px-3 py-2 text-xs font-mono font-medium text-teal-700">{agg.codigo}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${agg.tipo === 'COTE' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                {agg.tipo === 'COTE' ? 'COTE' : 'PASE'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs hidden md:table-cell max-w-[200px] truncate" title={agg.productos.join(' | ')}>
                              {agg.productos.length > 1 ? `${agg.productos.length} productos` : agg.producto}
                            </td>
                            <td className="px-3 py-2 text-xs hidden xl:table-cell max-w-[120px] truncate">{agg.contenedores.join(', ') || '-'}</td>
                            <td className="px-3 py-2 text-xs text-right font-mono">{agg.totalPallets}</td>
                            <td className="px-3 py-2 text-xs text-right font-mono font-medium text-teal-700">{agg.totalCajas.toLocaleString('es-UY')}</td>
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {ing ? (
                                <span className="text-emerald-700">{ing.envases.toLocaleString('es-UY')}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {expCajas > 0 ? (
                                <span className="text-blue-700">{expCajas.toLocaleString('es-UY')}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {diff !== null ? (
                                <span className={diff < 0 ? 'text-red-600 font-medium' : diff > 0 ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                                  {diff > 0 ? '+' : ''}{diff.toLocaleString('es-UY')}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono text-slate-600">{agg.totalKilos.toLocaleString('es-UY')}</td>
                            <td className="px-3 py-2 text-center">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 inline" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={11} className="px-4 py-3">
                                <div className="text-xs space-y-2">
                                  <div className="font-semibold text-slate-600 mb-1">Pallets en stock ({agg.pallets.length})</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="text-slate-500 text-left">
                                          <th className="px-2 py-1">Contenedor</th>
                                          <th className="px-2 py-1">Contenido</th>
                                          <th className="px-2 py-1">Lote</th>
                                          <th className="px-2 py-1 text-right">Pallets</th>
                                          <th className="px-2 py-1 text-right">Cajas</th>
                                          <th className="px-2 py-1 text-right">Kg</th>
                                          <th className="px-2 py-1">Vencimiento</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {agg.pallets.map((p, i) => (
                                          <tr key={i} className="border-t">
                                            <td className="px-2 py-1 font-mono">{p.contenedor || '-'}</td>
                                            <td className="px-2 py-1 max-w-[250px] truncate" title={p.contenido}>{p.contenido}</td>
                                            <td className="px-2 py-1 font-mono">{p.nroLote || '-'}</td>
                                            <td className="px-2 py-1 text-right">{p.pallets}</td>
                                            <td className="px-2 py-1 text-right font-mono">{p.cajas.toLocaleString('es-UY')}</td>
                                            <td className="px-2 py-1 text-right font-mono">{p.kilos.toLocaleString('es-UY')}</td>
                                            <td className="px-2 py-1">{p.fechaVencimiento ? fd(p.fechaVencimiento) : '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {ing && (
                                    <div className="mt-2 p-2 bg-emerald-50 rounded text-[11px] text-emerald-800">
                                      <b>Ingreso en depósitos:</b> Trámite {ing.tramite} — {ing.envases.toLocaleString('es-UY')} cajas — {ing.pesoNeto.toLocaleString('es-UY')} kg neto — {ing.lineCount} línea(s) — {ing.cortes.join(', ')}
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
            <p className="text-xs text-slate-400 mt-2">{filteredItems.length} código(s) — Click en una fila para ver detalle de pallets</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import React from 'react';
