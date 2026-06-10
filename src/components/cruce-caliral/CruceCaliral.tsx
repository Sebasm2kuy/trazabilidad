'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, ChevronLeft, ChevronRight, Eye, Download, ArrowLeftRight, AlertTriangle, CheckCircle2, Link2, Unlink } from 'lucide-react';

function fd(d: string | null | undefined) { if (!d) return '-'; return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmt(n: number) { if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'; if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return Math.round(n).toLocaleString('es-UY'); }

// --- Types ---
interface IngresoLine {
  id: string;
  nroTramite: number;
  fechaTramite: string;
  nroCote: string;
  denominacionMercaderia: string;
  corte: string;
  pesoNeto: number | null;
  pesoBruto: number | null;
  cantidadEnvases: number | null;
  paisDestino: string;
}

interface IngresoAgg {
  cote: string;
  tramite: number;
  fecha: string;
  producto: string;
  cortes: string[];
  pesoNeto: number;
  pesoBruto: number;
  envases: number;
  lineCount: number;
  lines: IngresoLine[];
}

interface ExpRecord {
  id: string;
  nroTramite: number;
  fechaTramite: string;
  nroCote: string;
  paisDestino: string;
  denominacionMercaderia: string;
  corte: string;
  pesoNeto: number | null;
  pesoBruto: number | null;
  cantidadEnvases: number | null;
  contenedorSerieNro?: string | null;
  nroCertificadoSanitario?: string | null;
  observaciones?: string | null;
  tipoTransporte?: string | null;
  nombreEstablecimientoCertif?: string | null;
  precinto1?: string | null;
  matriculaCamion?: string | null;
  fechaEmitidoCote?: string | null;
  fechaInicioProduccion?: string | null;
  fechaFinProduccion?: string | null;
  fechaInicioCongelacion?: string | null;
  fechaFinCongelacion?: string | null;
  [key: string]: unknown;
}

interface CruceRow {
  exp: ExpRecord;
  ingresoCotes: string[];
  ingresoCotesNotFound: string[];
  ingresoAgg: IngresoAgg[];
  totalKgIngreso: number;
  diff: number;
  diffPct: number;
}

interface SinCruceRow {
  exp: ExpRecord;
  obsPreview: string;
}

interface IngresoPendienteRow {
  cote: string;
  tramite: number;
  fecha: string;
  producto: string;
  pesoNeto: number;
  envases: number;
  cortes: string[];
}

// --- Data loading ---
const cache: { shipments: IngresoLine[]; exports: ExpRecord[]; loaded: boolean } = { shipments: [], exports: [], loaded: false };

async function ensureData() {
  if (!cache.loaded) {
    const [sR, eR] = await Promise.all([
      fetch('data/shipments.json'),
      fetch('data/exportaciones.json'),
    ]);
    const allShipments: IngresoLine[] = await sR.json();
    const allExports: ExpRecord[] = await eR.json();
    // Filter shipments: only to Caliral
    cache.shipments = allShipments.filter(s => (s.nombreEstablecimientoDestino || '').toLowerCase().includes('caliral'));
    cache.exports = allExports;
    cache.loaded = true;
  }
}

// Parse observaciones to extract ingreso COTEs
function extractIngresoCotes(obs: string | null | undefined, exportCote: string): string[] {
  if (!obs) return [];
  const allP = obs.match(/P\d{4,6}/g) || [];
  // Remove the export COTE itself if it matches the pattern
  return allP.filter(c => c !== exportCote);
}

// Aggregate ingreso lines by COTE
function aggregateByCote(lines: IngresoLine[]): Map<string, IngresoAgg> {
  const map = new Map<string, IngresoAgg>();
  for (const l of lines) {
    const cote = l.nroCote?.trim();
    if (!cote) continue;
    if (!map.has(cote)) {
      map.set(cote, {
        cote, tramite: l.nroTramite, fecha: l.fechaTramite,
        producto: l.denominacionMercaderia, cortes: [],
        pesoNeto: 0, pesoBruto: 0, envases: 0, lineCount: 0, lines: [],
      });
    }
    const agg = map.get(cote)!;
    agg.lines.push(l);
    agg.lineCount++;
    agg.pesoNeto += l.pesoNeto || 0;
    agg.pesoBruto += l.pesoBruto || 0;
    agg.envases += l.cantidadEnvases || 0;
    if (!agg.cortes.includes(l.corte)) agg.cortes.push(l.corte);
  }
  return map;
}

// --- Component ---
export default function CruceCaliral() {
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'cruce' | 'sincruce' | 'pendientes'>('cruce');

  // Filters
  const [search, setSearch] = useState('');
  const [pais, setPais] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<CruceRow | SinCruceRow | IngresoPendienteRow | null>(null);

  // Options
  const [paises, setPaises] = useState<string[]>([]);

  // Computed data
  const [ingresoMap, setIngresoMap] = useState<Map<string, IngresoAgg>>(new Map());
  const [cruceRows, setCruceRows] = useState<CruceRow[]>([]);
  const [sinCruceRows, setSinCruceRows] = useState<SinCruceRow[]>([]);
  const [pendienteRows, setPendienteRows] = useState<IngresoPendienteRow[]>([]);

  // Load and process data
  useEffect(() => {
    (async () => {
      await ensureData();
      const iMap = aggregateByCote(cache.shipments);
      setIngresoMap(iMap);

      const cruces: CruceRow[] = [];
      const sinCruce: SinCruceRow[] = [];
      const referencedCotes = new Set<string>();

      for (const exp of cache.exports) {
        const obs = exp.observaciones || '';
        const refs = extractIngresoCotes(obs, exp.nroCote);
        const foundInCaliral = refs.filter(c => iMap.has(c));
        const notInCaliral = refs.filter(c => !iMap.has(c));

        if (foundInCaliral.length > 0) {
          const aggs = foundInCaliral.map(c => iMap.get(c)!);
          const totalKgIngreso = aggs.reduce((s, a) => s + a.pesoNeto, 0);
          const expKg = exp.pesoNeto || 0;
          cruces.push({
            exp,
            ingresoCotes: foundInCaliral,
            ingresoCotesNotFound: notInCaliral,
            ingresoAgg: aggs,
            totalKgIngreso,
            diff: expKg - totalKgIngreso,
            diffPct: totalKgIngreso > 0 ? ((expKg - totalKgIngreso) / totalKgIngreso) * 100 : 0,
          });
          foundInCaliral.forEach(c => referencedCotes.add(c));
        } else {
          const obsPreview = obs ? obs.substring(0, 120) : '';
          sinCruce.push({ exp, obsPreview });
        }
      }

      // Ingresos not referenced in any export
      const pendientes: IngresoPendienteRow[] = [];
      for (const [cote, agg] of iMap) {
        if (!referencedCotes.has(cote)) {
          pendientes.push({
            cote, tramite: agg.tramite, fecha: agg.fecha,
            producto: agg.producto, pesoNeto: agg.pesoNeto,
            envases: agg.envases, cortes: agg.cortes,
          });
        }
      }

      setCruceRows(cruces.sort((a, b) => b.exp.fechaTramite.localeCompare(a.exp.fechaTramite)));
      setSinCruceRows(sinCruce.sort((a, b) => b.exp.fechaTramite.localeCompare(a.exp.fechaTramite)));
      setPendienteRows(pendientes.sort((a, b) => b.fecha.localeCompare(a.fecha)));

      // Unique export países
      setPaises([...new Set(cache.exports.map(e => e.paisDestino).filter(Boolean))].sort());

      setLoading(false);
    })();
  }, []);

  // Filter + paginate
  const filteredData = useMemo(() => {
    let rows: (CruceRow | SinCruceRow | IngresoPendienteRow)[] = [];
    if (subTab === 'cruce') rows = cruceRows;
    else if (subTab === 'sincruce') rows = sinCruceRows;
    else rows = pendienteRows;

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r => {
        if ('exp' in r) {
          const e = (r as CruceRow | SinCruceRow).exp;
          return String(e.nroTramite).includes(s) ||
            e.nroCote?.toLowerCase().includes(s) ||
            e.paisDestino?.toLowerCase().includes(s) ||
            e.denominacionMercaderia?.toLowerCase().includes(s);
        }
        const p = r as IngresoPendienteRow;
        return p.cote.toLowerCase().includes(s) ||
          p.producto.toLowerCase().includes(s) ||
          String(p.tramite).includes(s);
      });
    }
    if (pais && subTab !== 'pendientes') {
      rows = rows.filter(r => 'exp' in r && ((r as CruceRow | SinCruceRow).exp.paisDestino || '').includes(pais));
    }
    if (fechaDesde) {
      rows = rows.filter(r => {
        const d = 'exp' in r ? (r as CruceRow | SinCruceRow).exp.fechaTramite : (r as IngresoPendienteRow).fecha;
        return d >= new Date(fechaDesde).toISOString();
      });
    }
    if (fechaHasta) {
      rows = rows.filter(r => {
        const d = 'exp' in r ? (r as CruceRow | SinCruceRow).exp.fechaTramite : (r as IngresoPendienteRow).fecha;
        return d <= new Date(fechaHasta + 'T23:59:59').toISOString();
      });
    }
    return rows;
  }, [cruceRows, sinCruceRows, pendienteRows, subTab, search, pais, fechaDesde, fechaHasta]);

  useEffect(() => { setPage(1); }, [subTab, search, pais, fechaDesde, fechaHasta]);

  const pageData = filteredData.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(filteredData.length / limit);

  // Summary stats
  const stats = useMemo(() => {
    const totalIngresoKg = [...ingresoMap.values()].reduce((s, a) => s + a.pesoNeto, 0);
    const totalCruceExportKg = cruceRows.reduce((s, r) => s + (r.exp.pesoNeto || 0), 0);
    const totalCruceIngresoKg = cruceRows.reduce((s, r) => s + r.totalKgIngreso, 0);
    const totalSinCruceKg = sinCruceRows.reduce((s, r) => s + (r.exp.pesoNeto || 0), 0);
    const pendienteKg = [...ingresoMap.values()]
      .filter((_, i) => {
        const cote = [...ingresoMap.keys()][i];
        const referenced = cruceRows.some(r => r.ingresoCotes.includes(cote));
        return !referenced;
      })
      .reduce((s, a) => s + a.pesoNeto, 0);
    return {
      totalIngresoKg,
      totalIngresos: ingresoMap.size,
      exportConCruce: cruceRows.length,
      exportSinCruce: sinCruceRows.length,
      totalCruceExportKg,
      totalCruceIngresoKg,
      totalSinCruceKg,
      pendienteCount: pendienteRows.length,
      pendienteKg,
      cotesVinculados: new Set(cruceRows.flatMap(r => r.ingresoCotes)).size,
    };
  }, [ingresoMap, cruceRows, sinCruceRows, pendienteRows]);

  const clearFilters = useCallback(() => { setSearch(''); setPais(''); setFechaDesde(''); setFechaHasta(''); }, []);
  const hasFilters = search || pais || fechaDesde || fechaHasta;

  // Detail type helper
  const detailType = detailRow ? ('exp' in detailRow ? ('ingresoCotes' in detailRow ? 'cruce' : 'sincruce') : 'pendiente') : null;

  // Excel export
  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Con cruce
    const cruceRows2 = cruceRows.map(r => ({
      'COTE Export': r.exp.nroCote,
      'Trámite Export': r.exp.nroTramite,
      'Fecha Export': r.exp.fechaTramite?.split('T')[0] || '',
      'País': r.exp.paisDestino,
      'Producto Export': r.exp.denominacionMercaderia,
      'Kg Exportados': r.exp.pesoNeto || 0,
      'COTEs de Ingreso': r.ingresoCotes.join(', '),
      'Trámites Ingreso': r.ingresoAgg.map(a => a.tramite).join(', '),
      'Cortes Ingreso': r.ingresoAgg.flatMap(a => a.cortes).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      'Kg Ingresados': r.totalKgIngreso,
      'Diferencia Kg': r.diff,
      'Diferencia %': r.diffPct.toFixed(1) + '%',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cruceRows2), 'Con Cruce');

    // Sheet 2: Sin cruce
    const sinRows = sinCruceRows.map(r => ({
      'COTE': r.exp.nroCote,
      'Trámite': r.exp.nroTramite,
      'Fecha': r.exp.fechaTramite?.split('T')[0] || '',
      'País': r.exp.paisDestino,
      'Producto': r.exp.denominacionMercaderia,
      'Kg': r.exp.pesoNeto || 0,
      'Observaciones': r.obsPreview,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sinRows), 'Sin Cruce');

    // Sheet 3: Pendientes
    const pendRows = pendienteRows.map(r => ({
      'COTE': r.cote,
      'Trámite': r.tramite,
      'Fecha': r.fecha?.split('T')[0] || '',
      'Producto': r.producto,
      'Kg': r.pesoNeto,
      'Envases': r.envases,
      'Cortes': r.cortes.join(', '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendRows), 'Pendientes');

    XLSX.writeFile(wb, `cruce_caliral_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Diff color
  function diffColor(diff: number) {
    const abs = Math.abs(diff);
    const pct = abs / 1000; // per 1000 kg
    if (pct < 5) return 'text-emerald-700 bg-emerald-50';
    if (pct < 20) return 'text-amber-700 bg-amber-50';
    return 'text-red-700 bg-red-50';
  }

  function diffBadge(diff: number) {
    if (diff === 0) return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />0</span>;
    const sign = diff > 0 ? '+' : '';
    const color = diffColor(diff);
    return <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{sign}{fmt(diff)} kg</span>;
  }

  if (loading) return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">Cruce Caliral</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-orange-600" />
          Cruce Caliral
          <span className="text-sm font-normal text-slate-400 ml-2">San Jacinto → Caliral → Exportación</span>
        </h2>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />Exportar Excel
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-50"><ArrowLeftRight className="h-5 w-5 text-emerald-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Ingresos Caliral</p><p className="text-lg font-bold">{stats.totalIngresos}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalIngresoKg)} kg</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-50"><Link2 className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">COTEs Vinculados</p><p className="text-lg font-bold">{stats.cotesVinculados}</p><p className="text-[10px] text-slate-400">de {stats.totalIngresos} ingresos</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-sky-50"><CheckCircle2 className="h-5 w-5 text-sky-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Exports con cruce</p><p className="text-lg font-bold">{stats.exportConCruce}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalCruceExportKg)} kg</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-50"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Exports sin COTE</p><p className="text-lg font-bold">{stats.exportSinCruce}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalSinCruceKg)} kg</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-50"><Unlink className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Ingresos pendientes</p><p className="text-lg font-bold">{stats.pendienteCount}</p><p className="text-[10px] text-slate-400">{fmt(stats.pendienteKg)} kg</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-50"><span className="text-sm font-bold text-violet-600">%</span></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Cobertura cruce</p><p className="text-lg font-bold">
            {stats.totalCruceIngresoKg > 0 ? ((stats.cotesVinculados / stats.totalIngresos) * 100).toFixed(0) : 0}%
          </p><p className="text-[10px] text-slate-400">COTEs vinculados</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className={`p-3 rounded-xl ${stats.totalCruceExportKg - stats.totalCruceIngresoKg < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <span className={`text-sm font-bold ${stats.totalCruceExportKg - stats.totalCruceIngresoKg < 0 ? 'text-red-600' : 'text-emerald-600'}`}>Δ</span>
          </div>
          <div><p className="text-[10px] text-slate-500 uppercase">Diferencia total</p>
            <p className={`text-lg font-bold ${stats.totalCruceExportKg - stats.totalCruceIngresoKg < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {stats.totalCruceExportKg - stats.totalCruceIngresoKg > 0 ? '+' : ''}{fmt(stats.totalCruceExportKg - stats.totalCruceIngresoKg)} kg
            </p>
            <p className="text-[10px] text-slate-400">Export vs Ingreso</p></div>
        </CardContent></Card>
      </div>

      {/* Sub-tabs + Filters */}
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant={subTab === 'cruce' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('cruce')}>
            <Link2 className="h-4 w-4 mr-1.5" />Con cruce ({cruceRows.length})
          </Button>
          <Button variant={subTab === 'sincruce' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('sincruce')}>
            <Unlink className="h-4 w-4 mr-1.5" />Sin COTE de ingreso ({sinCruceRows.length})
          </Button>
          <Button variant={subTab === 'pendientes' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('pendientes')}>
            <AlertTriangle className="h-4 w-4 mr-1.5" />Ingresos pendientes ({pendienteRows.length})
          </Button>
          <div className="flex-1" />
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1" />Limpiar</Button>}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={subTab === 'pendientes' ? 'Buscar COTE, trámite, producto...' : 'Buscar trámite, COTE, país, producto...'}
              value={search} onChange={e => setSearch(e.target.value)} className="pl-9"
            />
          </div>
          {subTab !== 'pendientes' && (
            <Select value={pais} onValueChange={v => setPais(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="País" /></SelectTrigger>
              <SelectContent>{paises.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-[150px]" />
          <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-[150px]" />
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          {subTab === 'cruce' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-3">COTE Exp.</th>
                  <th className="px-3 py-3">Trámite</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">País</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Producto</th>
                  <th className="px-3 py-3 text-right">Kg Export.</th>
                  <th className="px-3 py-3">COTEs de Ingreso</th>
                  <th className="px-3 py-3 text-right hidden md:table-cell">Kg Ingreso</th>
                  <th className="px-3 py-3 text-right">Diferencia</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as CruceRow[]).map(r => (
                  <tr key={r.exp.id} className="border-b hover:bg-orange-50/40 cursor-pointer" onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-blue-700">{r.exp.nroCote}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.exp.nroTramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.exp.fechaTramite)}</td>
                    <td className="px-3 py-2.5 text-xs">{r.exp.paisDestino}</td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{r.exp.denominacionMercaderia}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">{(r.exp.pesoNeto || 0).toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.ingresoCotes.map(c => (
                          <span key={c} className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-mono px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                        {r.ingresoCotesNotFound.map(c => (
                          <span key={c} title="No encontrado en ingresos Caliral" className="inline-block bg-red-100 text-red-700 text-[10px] font-mono px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono hidden md:table-cell">{r.totalKgIngreso.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-right">{diffBadge(r.diff)}</td>
                    <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'sincruce' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-3">COTE</th>
                  <th className="px-3 py-3">Trámite</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">País</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Producto</th>
                  <th className="px-3 py-3 text-right">Kg</th>
                  <th className="px-3 py-3 hidden md:table-cell">Observaciones</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as SinCruceRow[]).map(r => (
                  <tr key={r.exp.id} className="border-b hover:bg-amber-50/40 cursor-pointer" onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-amber-700">{r.exp.nroCote}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.exp.nroTramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.exp.fechaTramite)}</td>
                    <td className="px-3 py-2.5 text-xs">{r.exp.paisDestino}</td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{r.exp.denominacionMercaderia}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">{(r.exp.pesoNeto || 0).toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 hidden md:table-cell max-w-[250px] truncate">{r.obsPreview || '-'}</td>
                    <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'pendientes' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-3">COTE</th>
                  <th className="px-3 py-3">Trámite</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Producto</th>
                  <th className="px-3 py-3 hidden md:table-cell">Cortes</th>
                  <th className="px-3 py-3 text-right">Envases</th>
                  <th className="px-3 py-3 text-right">Kg</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as IngresoPendienteRow[]).map(r => (
                  <tr key={r.cote} className="border-b hover:bg-orange-50/40 cursor-pointer" onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-orange-700">{r.cote}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.tramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.fecha)}</td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{r.producto}</td>
                    <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[200px] truncate">{r.cortes.join(', ')}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">{r.envases.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">{r.pesoNeto.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-slate-500">{filteredData.length} registros — Página {page} de {totalPages || 1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent></Card>

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {detailRow && detailType === 'cruce' && (() => {
            const r = detailRow as CruceRow;
            return (<>
              <SheetHeader><SheetTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-orange-600" />Cruce — Exportación COTE {r.exp.nroCote}</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                {/* Export data */}
                <div>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Datos de la Exportación</p>
                  <div className="bg-blue-50/50 rounded-lg p-3 space-y-1">
                    {[
                      ['COTE Exportación', r.exp.nroCote],
                      ['Nro. Trámite', String(r.exp.nroTramite)],
                      ['Fecha', fd(r.exp.fechaTramite)],
                      ['País', r.exp.paisDestino],
                      ['Producto', r.exp.denominacionMercaderia],
                      ['Corte', r.exp.corte],
                      ['Transporte', r.exp.tipoTransporte || '-'],
                      ['Contenedor', (r.exp as Record<string, unknown>).contenedorSerieNro as string || '-'],
                      ['Precinto', r.exp.precinto1 || '-'],
                      ['Cert. Sanitario', r.exp.nroCertificadoSanitario || '-'],
                      ['Estab. Certificador', r.exp.nombreEstablecimientoCertif || '-'],
                      ['Envases', String(r.exp.cantidadEnvases ?? '-')],
                      ['Peso Bruto', r.exp.pesoBruto ? String(r.exp.pesoBruto) + ' kg' : '-'],
                      ['Peso Neto', r.exp.pesoNeto ? String(r.exp.pesoNeto) + ' kg' : '-'],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between gap-4"><span className="text-slate-500 text-xs">{l}</span><span className="text-slate-800 text-xs text-right font-medium break-all">{v}</span></div>
                    ))}
                  </div>
                </div>

                {/* Balance */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Balance</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-[10px] text-slate-400">Kg Ingresados</p><p className="text-lg font-bold text-emerald-700">{fmt(r.totalKgIngreso)}</p></div>
                    <div><p className="text-[10px] text-slate-400">Kg Exportados</p><p className="text-lg font-bold text-blue-700">{fmt(r.exp.pesoNeto || 0)}</p></div>
                    <div><p className="text-[10px] text-slate-400">Diferencia</p><div className="flex justify-center">{diffBadge(r.diff)}</div></div>
                  </div>
                  {r.diffPct !== 0 && (
                    <p className="text-center text-xs text-slate-500 mt-2">{r.diffPct > 0 ? 'Sobran' : 'Faltan'} {fmt(Math.abs(r.diff))} kg ({Math.abs(r.diffPct).toFixed(1)}%)</p>
                  )}
                </div>

                {/* Ingreso COTEs detail */}
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">COTEs de Ingreso ({r.ingresoCotes.length})</p>
                  <div className="space-y-2">
                    {r.ingresoAgg.map(agg => (
                      <div key={agg.cote} className="border rounded-lg p-3 bg-emerald-50/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-emerald-700 text-sm">{agg.cote}</span>
                          <span className="text-xs text-slate-500">Trámite {agg.tramite} — {fd(agg.fecha)}</span>
                        </div>
                        <div className="text-xs text-slate-600 space-y-0.5">
                          <p>Producto: {agg.producto}</p>
                          <p>Cortes: {agg.cortes.join(', ')}</p>
                          <p>Envases: {agg.envases.toLocaleString('es-UY')} — <span className="font-medium">Peso Neto: {agg.pesoNeto.toLocaleString('es-UY')} kg</span> ({agg.lineCount} líneas)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Not found */}
                {r.ingresoCotesNotFound.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">COTEs no encontrados en Caliral</p>
                    <div className="flex flex-wrap gap-1">
                      {r.ingresoCotesNotFound.map(c => (
                        <span key={c} className="inline-block bg-red-100 text-red-700 text-xs font-mono px-2 py-1 rounded">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observaciones */}
                {r.exp.observaciones && (
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Observaciones</p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{r.exp.observaciones}</p>
                  </div>
                )}
              </div>
            </>);
          })()}

          {detailRow && detailType === 'sincruce' && (() => {
            const r = detailRow as SinCruceRow;
            return (<>
              <SheetHeader><SheetTitle className="flex items-center gap-2"><Unlink className="h-5 w-5 text-amber-600" />Sin COTE de Ingreso — {r.exp.nroCote}</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
                  <p className="font-bold mb-1">Este registro de exportación no tiene COTE de ingreso referenciado en sus observaciones.</p>
                  <p>Para vincularlo, se necesita agregar los COTEs de ingreso correspondientes en el campo &quot;Observaciones&quot; del trámite de exportación.</p>
                </div>
                <div className="space-y-1">
                  {[
                    ['COTE', r.exp.nroCote],
                    ['Nro. Trámite', String(r.exp.nroTramite)],
                    ['Fecha', fd(r.exp.fechaTramite)],
                    ['País', r.exp.paisDestino],
                    ['Producto', r.exp.denominacionMercaderia],
                    ['Corte', r.exp.corte],
                    ['Contenedor', (r.exp as Record<string, unknown>).contenedorSerieNro as string || '-'],
                    ['Envases', String(r.exp.cantidadEnvases ?? '-')],
                    ['Peso Neto', r.exp.pesoNeto ? String(r.exp.pesoNeto) + ' kg' : '-'],
                    ['Estab. Certificador', r.exp.nombreEstablecimientoCertif || '-'],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-4"><span className="text-slate-500 text-xs">{l}</span><span className="text-slate-800 text-xs text-right font-medium break-all">{v}</span></div>
                  ))}
                </div>
                {r.exp.observaciones && (
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Observaciones actuales</p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{r.exp.observaciones}</p>
                  </div>
                )}
              </div>
            </>);
          })()}

          {detailRow && detailType === 'pendiente' && (() => {
            const r = detailRow as IngresoPendienteRow;
            const agg = ingresoMap.get(r.cote);
            return (<>
              <SheetHeader><SheetTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-600" />Ingreso Pendiente — {r.cote}</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="bg-orange-50 rounded-lg p-3 text-xs text-orange-800">
                  <p className="font-bold mb-1">Este ingreso a Caliral no está vinculado a ninguna exportación.</p>
                  <p>Esto puede deberse a que aún no se exportó la mercadería, o a que el COTE de ingreso no fue registrado en las observaciones del trámite de exportación.</p>
                </div>
                {agg && (
                  <div>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">Detalle del Ingreso</p>
                    <div className="space-y-1">
                      {[
                        ['COTE', agg.cote],
                        ['Nro. Trámite', String(agg.tramite)],
                        ['Fecha', fd(agg.fecha)],
                        ['Producto', agg.producto],
                        ['Cortes', agg.cortes.join(', ')],
                        ['Líneas', String(agg.lineCount)],
                        ['Envases', agg.envases.toLocaleString('es-UY')],
                        ['Peso Bruto', agg.pesoBruto.toLocaleString('es-UY') + ' kg'],
                        ['Peso Neto', agg.pesoNeto.toLocaleString('es-UY') + ' kg'],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between gap-4"><span className="text-slate-500 text-xs">{l}</span><span className="text-slate-800 text-xs text-right font-medium break-all">{v}</span></div>
                      ))}
                    </div>
                    {agg.lines.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Líneas del ingreso</p>
                        <div className="max-h-[300px] overflow-y-auto border rounded">
                          <table className="w-full text-[11px]">
                            <thead className="sticky top-0 bg-slate-100"><tr>
                              <th className="px-2 py-1 text-left">Línea</th>
                              <th className="px-2 py-1 text-left">Corte</th>
                              <th className="px-2 py-1 text-right">Envases</th>
                              <th className="px-2 py-1 text-right">Peso Neto</th>
                            </tr></thead>
                            <tbody>
                              {agg.lines.map((l, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-2 py-1">{l.idLinea ?? i + 1}</td>
                                  <td className="px-2 py-1">{l.corte}</td>
                                  <td className="px-2 py-1 text-right font-mono">{l.cantidadEnvases ?? '-'}</td>
                                  <td className="px-2 py-1 text-right font-mono">{l.pesoNeto ? l.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>);
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}