'use client';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpDown, Download, Trophy, X } from 'lucide-react';
import { fetchShipments } from '@/lib/staticData';
import type { Shipment } from '@/lib/types';
import { fmt } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';

export default function ProductoDestino() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchDest, setSearchDest] = useState('');
  const [searchProd, setSearchProd] = useState('');
  const [sortMode, setSortMode] = useState<'total' | 'name'>('total');
  const [topN, setTopN] = useState(30);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; prod: string; dest: string; kg: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigateAndFilter = useAppStore(s => s.navigateAndFilter);

  useEffect(() => {
    (async () => {
      const all = await fetchShipments({ page: 1, limit: 99999 });
      setShipments(all.data);
      setLoading(false);
    })();
  }, []);

  const go = useCallback((producto?: string, destino?: string) => {
    const filters: { producto?: string; destino?: string } = {};
    if (producto) filters.producto = producto;
    if (destino) filters.destino = destino;
    navigateAndFilter('depositos', filters);
  }, [navigateAndFilter]);

  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    const destTotals = new Map<string, number>();
    const prodTotals = new Map<string, number>();

    for (const s of shipments) {
      const dest = s.nombreEstablecimientoDestino || 'Sin destino';
      const prod = s.denominacionMercaderia || 'Sin producto';
      const kg = s.pesoNeto || 0;

      if (!map.has(prod)) map.set(prod, new Map());
      const row = map.get(prod)!;
      row.set(dest, (row.get(dest) || 0) + kg);

      destTotals.set(dest, (destTotals.get(dest) || 0) + kg);
      prodTotals.set(prod, (prodTotals.get(prod) || 0) + kg);
    }

    const dests = [...destTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);

    const prods = [...prodTotals.entries()]
      .sort((a, b) => sortMode === 'total' ? b[1] - a[1] : a[0].localeCompare(b[0]))
      .map(([p]) => p);

    const sd = searchDest.toLowerCase();
    const sp = searchProd.toLowerCase();
    const filteredDests = sd ? dests.filter(d => d.toLowerCase().includes(sd)) : dests;
    const filteredProds = sp ? prods.filter(p => p.toLowerCase().includes(sp)) : prods.slice(0, topN);

    const filteredProdTotals = new Map<string, number>();
    for (const prod of filteredProds) {
      const row = map.get(prod);
      if (!row) continue;
      let sum = 0;
      for (const dest of filteredDests) {
        sum += row.get(dest) || 0;
      }
      filteredProdTotals.set(prod, sum);
    }

    let maxVal = 0;
    for (const prod of filteredProds) {
      const row = map.get(prod);
      if (!row) continue;
      for (const dest of filteredDests) {
        const v = row.get(dest) || 0;
        if (v > maxVal) maxVal = v;
      }
    }

    const colTotals = new Map<string, number>();
    for (const dest of filteredDests) {
      let sum = 0;
      for (const prod of filteredProds) {
        const row = map.get(prod);
        sum += row?.get(dest) || 0;
      }
      colTotals.set(dest, sum);
    }
    let grandTotal = 0;
    for (const v of colTotals.values()) grandTotal += v;

    return { map, filteredDests, filteredProds, filteredProdTotals, colTotals, grandTotal, maxVal };
  }, [shipments, searchDest, searchProd, sortMode, topN]);

  // Top 5 combinations
  const topCombinations = useMemo(() => {
    const combos: { prod: string; dest: string; kg: number }[] = [];
    for (const prod of matrix.filteredProds) {
      const row = matrix.map.get(prod);
      if (!row) continue;
      for (const dest of matrix.filteredDests) {
        const kg = row.get(dest) || 0;
        if (kg > 0) combos.push({ prod, dest, kg });
      }
    }
    combos.sort((a, b) => b.kg - a.kg);
    return combos.slice(0, 5);
  }, [matrix]);

  function heatColor(val: number, max: number) {
    if (val === 0) return 'bg-slate-50 text-slate-300';
    const ratio = val / max;
    if (ratio > 0.7) return 'bg-emerald-600 text-white';
    if (ratio > 0.4) return 'bg-emerald-400 text-white';
    if (ratio > 0.2) return 'bg-emerald-200 text-emerald-900';
    if (ratio > 0.05) return 'bg-emerald-100 text-emerald-800';
    return 'bg-emerald-50 text-emerald-700';
  }

  const handleCellHover = useCallback((e: React.MouseEvent, prod: string, dest: string, kg: number) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({ x: rect.right + 8, y: rect.top - 4, prod, dest, kg });
  }, []);

  const handleCellLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">Comparativa Producto x Destino</h2>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const colCount = matrix.filteredDests.length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Comparativa Producto x Destino</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const XLSX = await import('xlsx');
            const rows: Record<string, string | number>[] = [];
            for (const prod of matrix.filteredProds) {
              const row: Record<string, string | number> = { Producto: prod };
              for (const dest of matrix.filteredDests) {
                const v = matrix.map.get(prod)?.get(dest) || 0;
                row[dest] = Math.round(v);
              }
              row['TOTAL'] = Math.round(matrix.filteredProdTotals.get(prod) || 0);
              rows.push(row);
            }
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Comparativa');
            XLSX.writeFile(wb, `comparativa_${new Date().toISOString().split('T')[0]}.xlsx`);
          }}
        >
          <Download className="h-4 w-4 mr-2" />Exportar
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-500 mb-1 block">Buscar Producto</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Ej: NOVILLO, TERNERA..." value={searchProd} onChange={e => setSearchProd(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-500 mb-1 block">Buscar Destino</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Ej: Arbiza, Caliral, Dinolar..." value={searchDest} onChange={e => setSearchDest(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="w-[140px]">
              <label className="text-xs text-slate-500 mb-1 block">Productos</label>
              <Input type="number" min={5} max={200} value={topN} onChange={e => setTopN(Number(e.target.value))} />
            </div>
            <Button
              variant="outline"
              size="default"
              className="h-9"
              onClick={() => setSortMode(m => m === 'total' ? 'name' : 'total')}
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortMode === 'total' ? 'Por kg' : 'Alfabético'}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            {matrix.filteredProds.length} productos × {matrix.filteredDests.length} destinos — Total: <span className="font-bold text-emerald-700">{fmt(matrix.grandTotal)} kg</span>
          </p>
        </CardContent>
      </Card>

      {/* Top Combinaciones Summary Card */}
      {topCombinations.length > 0 && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-emerald-800">Top Combinaciones</h3>
              <span className="text-xs text-emerald-500 ml-1">— haz clic para filtrar en Depósitos</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topCombinations.map((c, i) => (
                <button
                  key={`${c.prod}-${c.dest}`}
                  onClick={() => go(c.prod, c.dest)}
                  className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow-md hover:scale-105 transition-all duration-150 cursor-pointer"
                >
                  <span className="bg-white/20 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="max-w-[160px] truncate">{c.prod}</span>
                  <X className="h-3 w-3 opacity-50" />
                  <span className="max-w-[120px] truncate">{c.dest}</span>
                  <span className="ml-1 bg-white/20 rounded px-1.5 py-0.5 text-[10px] font-bold">
                    {fmt(c.kg)} kg
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 border border-slate-700 max-w-[280px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-bold text-emerald-400 mb-0.5">Detalle</div>
          <div><span className="text-slate-400">Producto:</span> {tooltip.prod}</div>
          <div><span className="text-slate-400">Destino:</span> {tooltip.dest}</div>
          <div><span className="text-slate-400">Kg:</span> <span className="font-bold text-emerald-300">{fmt(tooltip.kg)} kg</span></div>
        </div>
      )}

      {/* Independent scroll container — breaks out of parent ScrollArea constraints */}
      <div
        ref={scrollRef}
        className="border rounded-lg bg-white shadow-sm overflow-auto"
        style={{ maxHeight: 'calc(100vh - 340px)' }}
      >
        <table
          className="text-xs border-collapse"
          style={{ minWidth: 200 + colCount * 90 + 100 }}
        >
          <thead>
            <tr className="bg-slate-800 text-white">
              <th
                className="px-3 py-2.5 text-left sticky left-0 bg-slate-800 z-20 border-r border-slate-600"
                style={{ minWidth: 200, maxWidth: 260 }}
              >
                Producto
              </th>
              {matrix.filteredDests.map(d => (
                <th
                  key={d}
                  className="px-2 py-2.5 text-right whitespace-nowrap font-normal cursor-pointer hover:underline hover:text-emerald-300 transition-colors"
                  style={{ minWidth: 80 }}
                  title={`Filtrar por destino: ${d}`}
                  onClick={() => go(undefined, d)}
                >
                  {d.length > 20 ? d.substring(0, 18) + '…' : d}
                </th>
              ))}
              <th
                className="px-3 py-2.5 text-right bg-emerald-700 font-bold sticky right-0 z-20 border-l border-emerald-800"
                style={{ minWidth: 100 }}
              >
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.filteredProds.map((prod, i) => {
              const row = matrix.map.get(prod);
              const rowTotal = matrix.filteredProdTotals.get(prod) || 0;
              const bg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';
              return (
                <tr key={prod} className={`${bg} hover:bg-emerald-50/50`}>
                  <td
                    className={`px-3 py-1.5 text-left font-medium text-slate-700 sticky left-0 z-10 border-r border-slate-200 ${bg} cursor-pointer hover:underline hover:text-emerald-700 transition-colors`}
                    style={{ minWidth: 200, maxWidth: 260 }}
                    title={`Filtrar por producto: ${prod}`}
                    onClick={() => go(prod)}
                  >
                    <span className="block truncate">{prod}</span>
                  </td>
                  {matrix.filteredDests.map(dest => {
                    const val = row?.get(dest) || 0;
                    const hasData = val > 0;
                    return (
                      <td
                        key={dest}
                        className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${heatColor(val, matrix.maxVal)} ${hasData ? 'cursor-pointer hover:ring-2 hover:ring-emerald-400 hover:scale-105 transition-all duration-100' : ''}`}
                        onClick={() => hasData && go(prod, dest)}
                        onMouseEnter={hasData ? (e) => handleCellHover(e, prod, dest, val) : undefined}
                        onMouseLeave={hasData ? handleCellLeave : undefined}
                      >
                        {val > 0 ? fmt(val) : <span className="text-slate-200">—</span>}
                      </td>
                    );
                  })}
                  <td
                    className="px-3 py-1.5 text-right font-bold font-mono bg-slate-100 text-slate-800 sticky right-0 z-10 border-l border-slate-300 cursor-pointer hover:underline hover:text-emerald-700 hover:bg-slate-200 transition-colors"
                    title={`Filtrar por producto: ${prod}`}
                    onClick={() => go(prod)}
                  >
                    {fmt(rowTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-200 font-bold text-slate-800">
              <td className="px-3 py-2 sticky left-0 bg-slate-200 z-10 border-r border-slate-300">TOTAL</td>
              {matrix.filteredDests.map(dest => (
                <td
                  key={dest}
                  className="px-2 py-2 text-right font-mono cursor-pointer hover:underline hover:text-emerald-700 transition-colors"
                  title={`Filtrar por destino: ${dest}`}
                  onClick={() => go(undefined, dest)}
                >
                  {fmt(matrix.colTotals.get(dest) || 0)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono text-emerald-700 bg-emerald-100 sticky right-0 z-10 border-l border-emerald-300">
                {fmt(matrix.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
