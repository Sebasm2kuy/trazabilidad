'use client';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpDown, Download } from 'lucide-react';
import { fetchShipments } from '@/lib/staticData';
import type { Shipment } from '@/lib/types';

function fmt(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('es-UY');
}

export default function ProductoDestino() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchDest, setSearchDest] = useState('');
  const [searchProd, setSearchProd] = useState('');
  const [sortMode, setSortMode] = useState<'total' | 'name'>('total');
  const [topN, setTopN] = useState(30);

  useEffect(() => {
    (async () => {
      const all = await fetchShipments({ page: 1, limit: 99999 });
      setShipments(all.data);
      setLoading(false);
    })();
  }, []);

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

    // Sort destinations by total desc
    const dests = [...destTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);

    // Sort products
    const prods = [...prodTotals.entries()]
      .sort((a, b) => sortMode === 'total' ? b[1] - a[1] : a[0].localeCompare(b[0]))
      .map(([p]) => p);

    // Filter
    const sd = searchDest.toLowerCase();
    const sp = searchProd.toLowerCase();
    const filteredDests = sd ? dests.filter(d => d.toLowerCase().includes(sd)) : dests;
    const filteredProds = sp ? prods.filter(p => p.toLowerCase().includes(sp)) : prods.slice(0, topN);

    // Recompute prod totals for filtered
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

    // Find max cell value for heatmap
    let maxVal = 0;
    for (const prod of filteredProds) {
      const row = map.get(prod);
      if (!row) continue;
      for (const dest of filteredDests) {
        const v = row.get(dest) || 0;
        if (v > maxVal) maxVal = v;
      }
    }

    // Column totals for filtered view
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

  function heatColor(val: number, max: number) {
    if (val === 0) return 'bg-slate-50 text-slate-300';
    const ratio = val / max;
    if (ratio > 0.7) return 'bg-emerald-600 text-white';
    if (ratio > 0.4) return 'bg-emerald-400 text-white';
    if (ratio > 0.2) return 'bg-emerald-200 text-emerald-900';
    if (ratio > 0.05) return 'bg-emerald-100 text-emerald-800';
    return 'bg-emerald-50 text-emerald-700';
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-[1600px]">
        <h2 className="text-2xl font-bold text-slate-800">Comparativa Producto x Destino</h2>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1800px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Comparativa Producto x Destino</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const XLSX = require('xlsx');
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

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white sticky top-0">
                <th className="px-3 py-2.5 text-left sticky left-0 bg-slate-800 z-10 min-w-[180px]">Producto</th>
                {matrix.filteredDests.map(d => (
                  <th key={d} className="px-2 py-2.5 text-right whitespace-nowrap font-normal" title={d}>
                    {d.length > 18 ? d.substring(0, 16) + '…' : d}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right bg-emerald-700 font-bold sticky right-0 z-10 min-w-[80px]">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {matrix.filteredProds.map((prod, i) => {
                const row = matrix.map.get(prod);
                const rowTotal = matrix.filteredProdTotals.get(prod) || 0;
                return (
                  <tr key={prod} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-1.5 text-left font-medium text-slate-700 max-w-[220px] truncate sticky left-0 bg-inherit z-[5]" title={prod}>
                      {prod}
                    </td>
                    {matrix.filteredDests.map(dest => {
                      const val = row?.get(dest) || 0;
                      return (
                        <td key={dest} className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${heatColor(val, matrix.maxVal)}`}>
                          {val > 0 ? fmt(val) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-bold font-mono bg-slate-100 text-slate-800 sticky right-0 z-[5]">
                      {fmt(rowTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 font-bold text-slate-800">
                <td className="px-3 py-2 sticky left-0 bg-slate-200 z-[5]">TOTAL</td>
                {matrix.filteredDests.map(dest => (
                  <td key={dest} className="px-2 py-2 text-right font-mono">
                    {fmt(matrix.colTotals.get(dest) || 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono text-emerald-700 bg-emerald-100 sticky right-0 z-[5]">
                  {fmt(matrix.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}