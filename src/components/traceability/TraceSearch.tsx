'use client';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, Package, Truck, FileCheck, Thermometer, ArrowRight,
  Download, Eye, X, Filter, Clock, MapPin, Factory, ClipboardList,
  AlertTriangle, CheckCircle2, Circle, TrendingUp, ArrowDownUp,
  FileSpreadsheet, History, Route
} from 'lucide-react';
import { fetchShipments, getCotes } from '@/lib/staticData';
import type { Shipment } from '@/lib/types';

function fd(d: string | null | undefined) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return '-'; }
}
function fdt(d: string | null | undefined) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return '-'; }
}
function fmt(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('es-UY');
}

const STAGE_COLORS: Record<string, string> = {
  faena: 'bg-red-100 text-red-700 border-red-300',
  produccion: 'bg-amber-100 text-amber-700 border-amber-300',
  congelacion: 'bg-sky-100 text-sky-700 border-sky-300',
  cote: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  despacho: 'bg-violet-100 text-violet-700 border-violet-300',
};
const STAGE_ICONS: Record<string, typeof Package> = {
  faena: Package, produccion: Factory, congelacion: Thermometer, cote: FileCheck, despacho: Truck,
};
const ALL_STAGES = ['faena', 'produccion', 'congelacion', 'cote', 'despacho'] as const;
const STAGE_LABELS: Record<string, string> = {
  faena: 'Faena', produccion: 'Produccion', congelacion: 'Congelacion', cote: 'COTE Emitido', despacho: 'Despacho',
};

type SearchMode = 'trámite' | 'cote' | 'producto' | 'destino' | 'matricula' | 'precinto';

// --- CACHE para exportaciones ---
const expCache: { data: Shipment[]; loaded: boolean } = { data: [], loaded: false };
async function ensureExp() {
  if (!expCache.loaded) {
    const r = await fetch('data/exportaciones.json');
    expCache.data = await r.json();
    expCache.loaded = true;
  }
}

// --- CACHE para envases (New Record) ---
const newRecCache: { data: Shipment[]; loaded: boolean } = { data: [], loaded: false };
async function ensureNewRec() {
  if (!newRecCache.loaded) {
    try {
      const raw = localStorage.getItem('trazabilidad_new_records');
      if (raw) newRecCache.data = JSON.parse(raw);
    } catch { /* ignore */ }
    newRecCache.loaded = true;
  }
}

// --- CACHE para importaciones ---
const impCache: { data: Shipment[]; loaded: boolean } = { data: [], loaded: false };
async function ensureImp() {
  if (!impCache.loaded) {
    try {
      const raw = localStorage.getItem('trazabilidad_imported_batches');
      if (raw) {
        const batches = JSON.parse(raw) as Array<{ data: Shipment[] }>;
        impCache.data = batches.flatMap(b => b.data || []);
      }
    } catch { /* ignore */ }
    impCache.loaded = true;
  }
}

export default function TraceSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('trámite');
  const [results, setResults] = useState<Shipment[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dataSource, setDataSource] = useState<'ingresos' | 'exportaciones' | 'todos'>('todos');
  const [allCotes, setAllCotes] = useState<string[]>([]);
  const [coteOpen, setCoteOpen] = useState(false);
  const [coteSearch, setCoteSearch] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [cruceData, setCruceData] = useState<{ ingreso: Shipment | null; exportacion: Shipment | null } | null>(null);
  const [cruceLoading, setCruceLoading] = useState(false);

  // Cargar COTEs recientes
  useEffect(() => {
    getCotes().then(cotes => setAllCotes(cotes));
    try {
      const saved = localStorage.getItem('trazabilidad_recent_searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const addRecentSearch = useCallback((q: string) => {
    const cleaned = q.trim();
    if (!cleaned) return;
    setRecentSearches(prev => {
      const updated = [cleaned, ...prev.filter(s => s !== cleaned)].slice(0, 10);
      localStorage.setItem('trazabilidad_recent_searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleSearch = async (searchQuery?: string) => {
    const q = (searchQuery || query).trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setCruceData(null);
    addRecentSearch(q);

    try {
      // Buscar en ingreso y/o exportaciones según data source
      let allResults: Shipment[] = [];

      if (dataSource === 'ingresos' || dataSource === 'todos') {
        let ingParams: Record<string, unknown> = { page: 1, limit: 99999 };
        if (mode === 'cote') ingParams.cote = q;
        else ingParams.search = q;
        const j = await fetchShipments(ingParams as Parameters<typeof fetchShipments>[0]);
        allResults.push(...j.data);
      }
      if (dataSource === 'exportaciones' || dataSource === 'todos') {
        await ensureExp();
        const expFiltered = filterByMode(expCache.data, q, mode);
        allResults.push(...expFiltered);
      }
      if (dataSource === 'todos') {
        await ensureNewRec();
        const nrFiltered = filterByMode(newRecCache.data, q, mode);
        allResults.push(...nrFiltered);
        await ensureImp();
        const impFiltered = filterByMode(impCache.data, q, mode);
        allResults.push(...impFiltered);
      }

      setResults(allResults);
    } catch (err) {
      console.error('Error searching:', err);
      setResults([]);
    }
    setLoading(false);
  };

  const filterByMode = (data: Shipment[], q: string, m: SearchMode): Shipment[] => {
    const s = q.toLowerCase();
    const num = Number(q);
    switch (m) {
      case 'trámite': return data.filter(sh => sh.nroTramite === num);
      case 'cote': return data.filter(sh => sh.nroCote?.toUpperCase() === q.toUpperCase());
      case 'producto': return data.filter(sh => sh.denominacionMercaderia?.toLowerCase().includes(s));
      case 'destino': return data.filter(sh => sh.nombreEstablecimientoDestino?.toLowerCase().includes(s));
      case 'matricula': return data.filter(sh => sh.matriculaCamion?.toLowerCase().includes(s));
      case 'precinto': return data.filter(sh => sh.precinto1?.toLowerCase().includes(s));
      default: return data.filter(sh => sh.nroTramite === num || sh.nroCote?.toUpperCase() === q.toUpperCase());
    }
  };

  // Buscar cruce ingreso→exportación para un COTE dado
  const buscarCruce = async (nroCote: string) => {
    setCruceLoading(true);
    try {
      const [ingRes, expRes] = await Promise.all([
        fetchShipments({ page: 1, limit: 99999, cote: nroCote }),
        (async () => { await ensureExp(); return expCache.data.filter(s => s.nroCote?.toUpperCase() === nroCote.toUpperCase()); })(),
      ]);
      setCruceData({
        ingreso: ingRes.data[0] || null,
        exportacion: expRes[0] || null,
      });
    } catch (err) {
      console.error('Error buscando cruce:', err);
    }
    setCruceLoading(false);
  };

  // Calcular duración de cada etapa
  const getStageDuration = (s: Shipment, stage: string): { start: string | null; end: string | null; days: number | null } => {
    let start: string | null = null, end: string | null = null;
    switch (stage) {
      case 'faena': start = s.fechaInicioFaena || null; end = s.fechaFinFaena || null; break;
      case 'produccion': start = s.fechaInicioProduccion || null; end = s.fechaFinProduccion || null; break;
      case 'congelacion': start = s.fechaInicioCongelacion || null; end = s.fechaFinCongelacion || null; break;
      case 'cote': start = s.fechaEmitidoCote || null; end = s.fechaEmitidoCote || null; break;
      case 'despacho': start = s.fechaTramite || null; end = null; break;
    }
    let days: number | null = null;
    if (start && end) {
      days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
    }
    return { start, end, days };
  };

  // Obtener estado de una etapa (completa, en progreso, sin fecha)
  const getStageStatus = (s: Shipment, stage: string): 'complete' | 'partial' | 'empty' => {
    const { start, end } = getStageDuration(s, stage);
    if (!start) return 'empty';
    if (stage === 'cote' || stage === 'despacho') return start ? 'complete' : 'empty';
    if (start && end) return 'complete';
    if (start && !end) return 'partial';
    return 'empty';
  };

  // Calcular duración total del proceso
  const getTotalDuration = (s: Shipment): number | null => {
    const first = s.fechaInicioFaena;
    const last = s.fechaTramite || s.fechaEmitidoCote;
    if (!first || !last) return null;
    return Math.round((new Date(last).getTime() - new Date(first).getTime()) / (1000 * 60 * 60 * 24));
  };

  // Exportar resultados
  const exportResults = async () => {
    const XLSX = await import('xlsx');
    const rows = results.map(s => ({
      'Trámite': s.nroTramite,
      'Fecha Trámite': s.fechaTramite ? s.fechaTramite.split('T')[0] : '',
      'COTE': s.nroCote,
      'País': s.paisDestino,
      'Destino': s.nombreEstablecimientoDestino,
      'Producto': s.denominacionMercaderia,
      'Corte': s.corte,
      'Envases': s.cantidadEnvases,
      'Peso Bruto': s.pesoBruto,
      'Peso Neto': s.pesoNeto,
      'Pallets': s.pallets,
      'Transporte': s.tipoTransporte,
      'Matrícula': s.matriculaCamion,
      'Contenedor': s.contenedorSerieNro,
      'Precinto': s.precinto1,
      'Temperatura': s.temperaturaC,
      'Veterinario': s.nombreMedicoVeterinario || '',
      'Estab. Productor': s.nombreEstablecimientoProd || '',
      'Estab. Destino': s.nombreEstablecimientoDestino,
      'Inicio Faena': s.fechaInicioFaena ? s.fechaInicioFaena.split('T')[0] : '',
      'Fin Faena': s.fechaFinFaena ? s.fechaFinFaena.split('T')[0] : '',
      'Inicio Prod.': s.fechaInicioProduccion ? s.fechaInicioProduccion.split('T')[0] : '',
      'Fin Prod.': s.fechaFinProduccion ? s.fechaFinProduccion.split('T')[0] : '',
      'Inicio Congel.': s.fechaInicioCongelacion ? s.fechaInicioCongelacion.split('T')[0] : '',
      'Fin Congel.': s.fechaFinCongelacion ? s.fechaFinCongelacion.split('T')[0] : '',
      'COTE Emitido': s.fechaEmitidoCote ? s.fechaEmitidoCote.split('T')[0] : '',
      'Tipo': s.tipo,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Trazabilidad');
    XLSX.writeFile(wb, `trazabilidad_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Exportar traza completa de un envío
  const exportTrace = async (s: Shipment) => {
    const XLSX = await import('xlsx');
    const stages = ALL_STAGES.map(stage => {
      const d = getStageDuration(s, stage);
      return {
        'Etapa': STAGE_LABELS[stage],
        'Inicio': d.start ? d.start.split('T')[0] : '-',
        'Fin': d.end ? d.end.split('T')[0] : '-',
        'Días': d.days ?? '-',
        'Estado': getStageStatus(s, stage) === 'complete' ? 'Completa' : getStageStatus(s, stage) === 'partial' ? 'En proceso' : 'Sin datos',
      };
    });
    const info = [
      { 'Campo': 'Trámite', 'Valor': String(s.nroTramite) },
      { 'Campo': 'COTE', 'Valor': s.nroCote },
      { 'Campo': 'Fecha', 'Valor': fd(s.fechaTramite) },
      { 'Campo': 'País', 'Valor': s.paisDestino },
      { 'Campo': 'Destino', 'Valor': s.nombreEstablecimientoDestino },
      { 'Campo': 'Producto', 'Valor': s.denominacionMercaderia },
      { 'Campo': 'Corte', 'Valor': s.corte },
      { 'Campo': 'Envases', 'Valor': String(s.cantidadEnvases ?? '-') },
      { 'Campo': 'Peso Neto', 'Valor': String(s.pesoNeto ?? '-') },
      { 'Campo': 'Peso Bruto', 'Valor': String(s.pesoBruto ?? '-') },
      { 'Campo': 'Transporte', 'Valor': s.tipoTransporte || '-' },
      { 'Campo': 'Matrícula', 'Valor': s.matriculaCamion || '-' },
      { 'Campo': 'Contenedor', 'Valor': s.contenedorSerieNro || '-' },
      { 'Campo': 'Precinto', 'Valor': s.precinto1 || '-' },
      { 'Campo': 'Veterinario', 'Valor': s.nombreMedicoVeterinario || '-' },
      { 'Campo': 'Estab. Productor', 'Valor': s.nombreEstablecimientoProd || '-' },
      { 'Campo': 'Duración Total (días)', 'Valor': getTotalDuration(s) ? String(getTotalDuration(s)) : '-' },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Datos Envío');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stages), 'Línea de Tiempo');
    XLSX.writeFile(wb, `traza_${s.nroCote}_${s.nroTramite}.xlsx`);
  };

  // Resumen agrupado de resultados
  const getResultsSummary = () => {
    if (results.length === 0) return null;
    const totalEnvases = results.reduce((a, s) => a + (s.cantidadEnvases || 0), 0);
    const totalPesoNeto = results.reduce((a, s) => a + (s.pesoNeto || 0), 0);
    const totalPesoBruto = results.reduce((a, s) => a + (s.pesoBruto || 0), 0);
    const cotes = [...new Set(results.map(s => s.nroCote).filter(Boolean) as string[])];
    const paises = [...new Set(results.map(s => s.paisDestino).filter(Boolean))];
    const productos = [...new Set(results.map(s => s.denominacionMercaderia).filter(Boolean))];
    const destinos = [...new Set(results.map(s => s.nombreEstablecimientoDestino).filter(Boolean))];
    const cortes = [...new Set(results.map(s => s.corte).filter(Boolean))];
    return { totalEnvases, totalPesoNeto, totalPesoBruto, cotes, paises, productos, destinos, cortes, count: results.length };
  };

  // Datos para línea de tiempo de resultado seleccionado
  const getTimeline = (s: Shipment) => ALL_STAGES.map(stage => {
    const d = getStageDuration(s, stage);
    const status = getStageStatus(s, stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      start: d.start,
      end: d.end,
      days: d.days,
      status,
      icon: STAGE_ICONS[stage],
      color: STAGE_COLORS[stage],
    };
  });

  const summary = getResultsSummary();
  const filteredCotes = coteSearch ? allCotes.filter(c => c.toLowerCase().includes(coteSearch.toLowerCase())) : allCotes;
  const first = results.length > 0 ? results[0] : null;

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Route className="h-6 w-6 text-emerald-600" />Trazabilidad
        </h2>
        {results.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportResults}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Exportar {results.length} resultados
            </Button>
          </div>
        )}
      </div>

      {/* ===== BÚSQUEDA PRINCIPAL ===== */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-3 flex-wrap">
            {/* Selector de modo */}
            <Select value={mode} onValueChange={v => setMode(v as SearchMode)}>
              <SelectTrigger className="w-[170px]">
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trámite">Nro. Trámite</SelectItem>
                <SelectItem value="cote">COTE</SelectItem>
                <SelectItem value="producto">Producto</SelectItem>
                <SelectItem value="destino">Destino</SelectItem>
                <SelectItem value="matricula">Matrícula</SelectItem>
                <SelectItem value="precinto">Precinto</SelectItem>
              </SelectContent>
            </Select>

            {/* Input de búsqueda */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={(() => {
                  switch (mode) {
                    case 'trámite': return 'Buscar por Nro. Trámite (ej: 447099)';
                    case 'cote': return 'Buscar por COTE (ej: P10378)';
                    case 'producto': return 'Buscar por producto (ej: Carne)';
                    case 'destino': return 'Buscar por destino (ej: Frigorífico)';
                    case 'matricula': return 'Buscar por matrícula de camión';
                    case 'precinto': return 'Buscar por precinto';
                    default: return 'Buscar...';
                  }
                })()}
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>

            <Button onClick={() => handleSearch()} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>

          {/* Fila de filtros rápidos */}
          <div className="flex gap-3 flex-wrap items-center">
            {/* Fuente de datos */}
            <Select value={dataSource} onValueChange={v => setDataSource(v as 'ingresos' | 'exportaciones' | 'todos')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los datos</SelectItem>
                <SelectItem value="ingresos">Solo Ingresos</SelectItem>
                <SelectItem value="exportaciones">Solo Exportaciones</SelectItem>
              </SelectContent>
            </Select>

            {/* Selector rápido de COTE */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setCoteOpen(!coteOpen); setCoteSearch(''); }}
                className="flex h-9 w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm whitespace-nowrap truncate text-muted-foreground hover:bg-accent"
              >
                <FileCheck className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                <span className="truncate">Seleccionar COTE</span>
              </button>
              {coteOpen && (
                <div className="absolute z-50 mt-1 w-[280px] rounded-md border bg-popover shadow-lg">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input placeholder="Buscar COTE..." value={coteSearch} onChange={e => setCoteSearch(e.target.value)} className="h-8 pl-8 text-sm" autoFocus />
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {filteredCotes.length === 0
                      ? <p className="text-sm text-slate-400 p-3 text-center">Sin resultados</p>
                      : filteredCotes.slice(0, 50).map(c => (
                        <button key={c} type="button"
                          onClick={() => { setQuery(c); setMode('cote'); setCoteOpen(false); setCoteSearch(''); handleSearch(c); }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent">{c}</button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Búsquedas recientes */}
          {recentSearches.length > 0 && !searched && (
            <div className="flex items-center gap-2 flex-wrap">
              <History className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">Recientes:</span>
              {recentSearches.slice(0, 8).map(rs => (
                <button key={rs} type="button"
                  onClick={() => { setQuery(rs); handleSearch(rs); }}
                  className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  {rs}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== SIN RESULTADOS ===== */}
      {searched && results.length === 0 && !loading && (
        <Card><CardContent className="p-8 text-center text-slate-400">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No se encontraron registros para &quot;{query}&quot;</p>
          <p className="text-sm mt-1">Intentá con otro término o cambiá la fuente de datos</p>
        </CardContent></Card>
      )}

      {/* ===== LOADING ===== */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
        </div>
      )}

      {/* ===== RESULTADOS ===== */}
      {!loading && results.length > 0 && summary && (
        <>
          {/* KPIs del resultado */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card><CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50"><ClipboardList className="h-4 w-4 text-emerald-600" /></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Registros</p><p className="text-lg font-bold">{summary.count}</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50"><FileCheck className="h-4 w-4 text-blue-600" /></div>
              <div><p className="text-[10px] text-slate-500 uppercase">COTEs</p><p className="text-lg font-bold">{summary.cotes.length}</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50"><Package className="h-4 w-4 text-amber-600" /></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Envases</p><p className="text-lg font-bold">{fmt(summary.totalEnvases)}</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-50"><TrendingUp className="h-4 w-4 text-rose-600" /></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Peso Neto</p><p className="text-lg font-bold">{fmt(summary.totalPesoNeto)} kg</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-50"><MapPin className="h-4 w-4 text-violet-600" /></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Países</p><p className="text-lg font-bold">{summary.paises.length}</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-50"><ArrowDownUp className="h-4 w-4 text-sky-600" /></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Productos</p><p className="text-lg font-bold">{summary.productos.length}</p></div>
            </CardContent></Card>
          </div>

          {/* Filtros/cruce rápidos */}
          {summary.cotes.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-500">COTEs encontrados:</span>
                  {summary.cotes.map(c => (
                    <button key={c} type="button"
                      onClick={() => buscarCruce(c)}
                      disabled={cruceLoading}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition-colors border border-emerald-200">
                      <FileCheck className="h-3 w-3" />
                      {c}
                      {cruceLoading && <span className="h-3 w-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CRUCE Ingreso → Exportación */}
          {cruceData && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDownUp className="h-4 w-4 text-blue-600" />
                  Cruce Ingreso → Exportación: {cruceData.ingreso?.nroCote || cruceData.exportacion?.nroCote}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Ingreso */}
                  <div className="space-y-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Ingreso</Badge>
                    {cruceData.ingreso ? (
                      <div className="text-sm space-y-1 bg-white rounded-lg p-3 border">
                        <p><span className="text-slate-500">Trámite:</span> <span className="font-mono font-medium">{cruceData.ingreso.nroTramite}</span></p>
                        <p><span className="text-slate-500">Fecha:</span> {fd(cruceData.ingreso.fechaTramite)}</p>
                        <p><span className="text-slate-500">Producto:</span> {cruceData.ingreso.denominacionMercaderia}</p>
                        <p><span className="text-slate-500">Corte:</span> {cruceData.ingreso.corte || '-'}</p>
                        <p><span className="text-slate-500">Peso Neto:</span> <span className="font-mono">{cruceData.ingreso.pesoNeto?.toLocaleString('es-UY') || '-'} kg</span></p>
                        <p><span className="text-slate-500">Estab. Productor:</span> {cruceData.ingreso.nombreEstablecimientoProd || '-'}</p>
                        <p><span className="text-slate-500">Veterinario:</span> {cruceData.ingreso.nombreMedicoVeterinario || '-'}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />Sin ingreso registrado para este COTE
                      </p>
                    )}
                  </div>
                  {/* Exportación */}
                  <div className="space-y-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Exportación</Badge>
                    {cruceData.exportacion ? (
                      <div className="text-sm space-y-1 bg-white rounded-lg p-3 border">
                        <p><span className="text-slate-500">Trámite:</span> <span className="font-mono font-medium">{cruceData.exportacion.nroTramite}</span></p>
                        <p><span className="text-slate-500">Fecha:</span> {fd(cruceData.exportacion.fechaTramite)}</p>
                        <p><span className="text-slate-500">País:</span> {cruceData.exportacion.paisDestino}</p>
                        <p><span className="text-slate-500">Destino:</span> {cruceData.exportacion.nombreEstablecimientoDestino}</p>
                        <p><span className="text-slate-500">Contenedor:</span> {cruceData.exportacion.contenedorSerieNro || '-'}</p>
                        <p><span className="text-slate-500">Precinto:</span> {cruceData.exportacion.precinto1 || '-'}</p>
                        <p><span className="text-slate-500">Papel Seguridad:</span> {(cruceData.exportacion as Record<string, unknown>).papelSeguridad || '-'}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />Sin exportación registrada para este COTE
                      </p>
                    )}
                  </div>
                </div>
                {cruceData.ingreso && cruceData.exportacion && (
                  <div className="mt-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm text-emerald-700 font-medium">Cruce completo: Ingreso y Exportación encontrados</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ===== TABS: Línea de Tiempo | Detalle | Tabla ===== */}
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="timeline" className="text-xs sm:text-sm">
                <Clock className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Línea de Tiempo
              </TabsTrigger>
              <TabsTrigger value="detalle" className="text-xs sm:text-sm">
                <Eye className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Detalle Completo
              </TabsTrigger>
              <TabsTrigger value="tabla" className="text-xs sm:text-sm">
                <ClipboardList className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />Tabla ({results.length})
              </TabsTrigger>
            </TabsList>

            {/* TAB: Línea de Tiempo */}
            <TabsContent value="timeline" className="space-y-4">
              {first && (
                <>
                  {/* Resumen del primer resultado */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Resumen del Envío</CardTitle>
                        <div className="flex gap-2">
                          <Badge variant={first.tipo === 'EXPORTACION' ? 'default' : 'secondary'} className="text-xs">
                            {first.tipo || 'INGRESO'}
                          </Badge>
                          {getTotalDuration(first) && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />{getTotalDuration(first)} días total
                            </Badge>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportTrace(first)}>
                            <Download className="h-3.5 w-3.5 mr-1" />Exportar traza
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-xs text-slate-500">Trámite</p><p className="font-bold font-mono">{first.nroTramite}</p></div>
                      <div><p className="text-xs text-slate-500">COTE</p><p className="font-bold text-emerald-700">{first.nroCote}</p></div>
                      <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium">{fd(first.fechaTramite)}</p></div>
                      <div><p className="text-xs text-slate-500">Destino</p><p className="font-medium">{first.nombreEstablecimientoDestino}</p></div>
                      <div><p className="text-xs text-slate-500">País</p><p className="font-medium">{first.paisDestino}</p></div>
                      <div><p className="text-xs text-slate-500">Transporte</p><p className="font-medium">{first.tipoTransporte || '-'} {first.matriculaCamion || ''}</p></div>
                      <div><p className="text-xs text-slate-500">Total Envases</p><p className="font-bold">{summary.totalEnvases.toLocaleString('es-UY')}</p></div>
                      <div><p className="text-xs text-slate-500">Peso Neto</p><p className="font-bold text-emerald-700">{summary.totalPesoNeto.toLocaleString('es-UY')} kg</p></div>
                    </CardContent>
                  </Card>

                  {/* Timeline visual */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Línea de Tiempo del Proceso</CardTitle></CardHeader>
                    <CardContent>
                      <div className="relative flex flex-col gap-0 ml-4">
                        <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-slate-200" />
                        {getTimeline(first).map((step) => {
                          const Icon = step.icon;
                          const d = step.start ? fd(step.start) : null;
                          const e = step.end ? fd(step.end) : null;
                          const StatusIcon = step.status === 'complete' ? CheckCircle2 : step.status === 'partial' ? Clock : Circle;
                          const statusColor = step.status === 'complete' ? 'text-emerald-500' : step.status === 'partial' ? 'text-amber-500' : 'text-slate-300';
                          return (
                            <div key={step.stage} className="flex items-center gap-4 py-3 relative">
                              <div className={`z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center ${step.color}`}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 flex items-center gap-3">
                                <span className="text-sm font-medium w-28">{step.label}</span>
                                {d ? (
                                  <span className="text-sm text-slate-600">
                                    {d}{e && e !== d ? <span> → {e}</span> : ''}
                                    {step.days !== null && step.days > 0 && (
                                      <Badge variant="outline" className="ml-2 text-xs font-mono px-1.5 py-0">
                                        {step.days} día{step.days !== 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-sm text-slate-400 italic">Sin fecha registrada</span>
                                )}
                              </div>
                              <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Si hay múltiples COTEs, selector para cambiar */}
                  {summary.cotes.length > 1 && (
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-xs text-slate-500 mb-2">Más COTEs en esta búsqueda (hacé click para ver su traza):</p>
                        <div className="flex flex-wrap gap-2">
                          {summary.cotes.slice(1).map(c => {
                            const shipment = results.find(s => s.nroCote === c);
                            if (!shipment) return null;
                            return (
                              <button key={c} type="button"
                                onClick={() => { setSelected(shipment); setDetailOpen(true); }}
                                className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50 transition-colors">
                                <span className="font-medium text-emerald-700">{c}</span>
                                <span className="text-slate-400 ml-1">({fd(shipment.fechaTramite)})</span>
                              </button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* TAB: Detalle Completo */}
            <TabsContent value="detalle">
              <Card>
                <CardContent className="p-4">
                  {first ? (
                    <div className="space-y-4 text-sm">
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Columna 1: Datos del embarque */}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Datos del Embarque</p>
                          {[
                            ['Nro. Trámite', String(first.nroTramite)],
                            ['COTE', first.nroCote],
                            ['Tipo', first.tipo || 'INGRESO'],
                            ['Fecha', fd(first.fechaTramite)],
                            ['País Destino', first.paisDestino],
                            ['Destino', first.nombreEstablecimientoDestino],
                            ['Producto', first.denominacionMercaderia],
                            ['Corte', first.corte || '-'],
                          ].map(([l, v]) => (
                            <div key={l} className="flex justify-between gap-4 border-b border-dashed border-slate-100 pb-1">
                              <span className="text-slate-500">{l}</span>
                              <span className="text-slate-800 text-right font-medium break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                        {/* Columna 2: Logística */}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Logística y Transporte</p>
                          {[
                            ['Transporte', first.tipoTransporte || '-'],
                            ['Matrícula', first.matriculaCamion || '-'],
                            ['Contenedor', first.contenedorSerieNro || '-'],
                            ['Precinto', first.precinto1 || '-'],
                            ['Cert. Sanitario', first.nroCertificadoSanitario || '-'],
                            ['Temperatura', first.temperaturaC ? String(first.temperaturaC) + ' °C' : '-'],
                          ].map(([l, v]) => (
                            <div key={l} className="flex justify-between gap-4 border-b border-dashed border-slate-100 pb-1">
                              <span className="text-slate-500">{l}</span>
                              <span className="text-slate-800 text-right font-medium">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-6 pt-2">
                        {/* Columna 3: Pesos y cantidades */}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Pesos y Cantidades</p>
                          {[
                            ['Pallets', first.pallets ? String(first.pallets) : '-'],
                            ['Envases', first.cantidadEnvases ? String(first.cantidadEnvases) : '-'],
                            ['Peso Bruto', first.pesoBruto ? String(first.pesoBruto) + ' kg' : '-'],
                            ['Peso Neto', first.pesoNeto ? String(first.pesoNeto) + ' kg' : '-'],
                          ].map(([l, v]) => (
                            <div key={l} className="flex justify-between gap-4 border-b border-dashed border-slate-100 pb-1">
                              <span className="text-slate-500">{l}</span>
                              <span className="text-slate-800 text-right font-medium font-mono">{v}</span>
                            </div>
                          ))}
                        </div>
                        {/* Columna 4: Establecimientos */}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Establecimientos y Personal</p>
                          {[
                            ['Estab. Productor', first.nombreEstablecimientoProd || '-'],
                            ['Estab. Certificador', first.nombreEstablecimientoCertif || '-'],
                            ['Estab. Destino', first.nombreEstablecimientoDestino],
                            ['Veterinario', first.nombreMedicoVeterinario || '-'],
                          ].map(([l, v]) => (
                            <div key={l} className="flex justify-between gap-4 border-b border-dashed border-slate-100 pb-1">
                              <span className="text-slate-500">{l}</span>
                              <span className="text-slate-800 text-right font-medium break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Calendario de fechas */}
                      <div className="pt-2">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-3">Calendario de Fechas del Proceso</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                          {[
                            ['Inicio Faena', first.fechaInicioFaena, 'faena'],
                            ['Fin Faena', first.fechaFinFaena, 'faena'],
                            ['Inicio Producción', first.fechaInicioProduccion, 'produccion'],
                            ['Fin Producción', first.fechaFinProduccion, 'produccion'],
                            ['Inicio Congelación', first.fechaInicioCongelacion, 'congelacion'],
                            ['Fin Congelación', first.fechaFinCongelacion, 'congelacion'],
                            ['COTE Emitido', first.fechaEmitidoCote, 'cote'],
                            ['Despacho', first.fechaTramite, 'despacho'],
                          ].map(([label, date, stage]) => {
                            const stageColor = STAGE_COLORS[stage as string] || 'bg-slate-100 text-slate-600';
                            return (
                              <div key={String(label)} className={`rounded-lg p-2.5 border ${stageColor}`}>
                                <p className="text-[10px] uppercase font-bold opacity-70">{String(label)}</p>
                                <p className="text-sm font-mono font-medium mt-0.5">{date ? fd(date) : '-'}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {first.observaciones && (
                        <div className="pt-2">
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-1">Observaciones</p>
                          <p className="text-slate-600 text-xs whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{first.observaciones}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-slate-400 py-8">Seleccioná un registro para ver el detalle</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: Tabla de resultados */}
            <TabsContent value="tabla">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                          <th className="px-3 py-3">#</th>
                          <th className="px-3 py-3">Trámite</th>
                          <th className="px-3 py-3">Fecha</th>
                          <th className="px-3 py-3">COTE</th>
                          <th className="px-3 py-3">País</th>
                          <th className="px-3 py-3 hidden md:table-cell">Producto</th>
                          <th className="px-3 py-3 hidden lg:table-cell">Corte</th>
                          <th className="px-3 py-3 text-right">Envases</th>
                          <th className="px-3 py-3 text-right">Peso Neto</th>
                          <th className="px-3 py-3 hidden lg:table-cell">Estado</th>
                          <th className="px-3 py-3 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map(s => {
                          const totalDuration = getTotalDuration(s);
                          return (
                            <tr key={s.id} className="border-b hover:bg-emerald-50/50 cursor-pointer" onClick={() => { setSelected(s); setDetailOpen(true); }}>
                              <td className="px-3 py-2.5 text-xs text-slate-400">{s.idLinea || '-'}</td>
                              <td className="px-3 py-2.5 font-mono text-xs">{s.nroTramite}</td>
                              <td className="px-3 py-2.5 text-xs">{fd(s.fechaTramite)}</td>
                              <td className="px-3 py-2.5 text-xs font-medium text-emerald-700">{s.nroCote}</td>
                              <td className="px-3 py-2.5 text-xs">{s.paisDestino}</td>
                              <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[180px] truncate">{s.denominacionMercaderia}</td>
                              <td className="px-3 py-2.5 text-xs hidden lg:table-cell">{s.corte || '-'}</td>
                              <td className="px-3 py-2.5 text-xs text-right font-mono">{s.cantidadEnvases ?? '-'}</td>
                              <td className="px-3 py-2.5 text-xs text-right font-mono">{s.pesoNeto ? s.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                              <td className="px-3 py-2.5 hidden lg:table-cell">
                                {totalDuration ? (
                                  <Badge variant="outline" className="text-xs font-mono">
                                    <Clock className="h-3 w-3 mr-1" />{totalDuration}d
                                  </Badge>
                                ) : <span className="text-xs text-slate-400">-</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <Eye className="h-4 w-4 text-slate-400 inline" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-50 font-medium text-xs">
                          <td className="px-3 py-2" colSpan={7}>TOTAL ({results.length} registros)</td>
                          <td className="px-3 py-2 text-right font-mono">{summary.totalEnvases.toLocaleString('es-UY')}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700">{summary.totalPesoNeto.toLocaleString('es-UY')} kg</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ===== SHEET DE DETALLE (click en fila de tabla) ===== */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (<>
            <SheetHeader><SheetTitle className="flex items-center gap-2">
              <Route className="h-5 w-5 text-emerald-600" />
              Trazabilidad #{selected.nroTramite}
              <Badge variant="outline" className="text-xs ml-auto">{selected.tipo || 'INGRESO'}</Badge>
            </SheetTitle></SheetHeader>
            <div className="mt-6 space-y-3 text-sm">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">Datos del Embarque</p>
              {[
                ['Nro. Trámite', String(selected.nroTramite)],
                ['COTE', selected.nroCote],
                ['Fecha', fd(selected.fechaTramite)],
                ['País', selected.paisDestino],
                ['Destino', selected.nombreEstablecimientoDestino],
                ['Producto', selected.denominacionMercaderia],
                ['Corte', selected.corte || '-'],
                ['Linea #', String(selected.idLinea || '-')],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium break-all">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mt-4 mb-2">Logística</p>
              {[
                ['Transporte', selected.tipoTransporte || '-'],
                ['Matrícula', selected.matriculaCamion || '-'],
                ['Contenedor', selected.contenedorSerieNro || '-'],
                ['Precinto', selected.precinto1 || '-'],
                ['Cert. Sanitario', selected.nroCertificadoSanitario || '-'],
                ['Temperatura', selected.temperaturaC ? String(selected.temperaturaC) + ' °C' : '-'],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mt-4 mb-2">Pesos y Cantidades</p>
              {[
                ['Pallets', selected.pallets ? String(selected.pallets) : '-'],
                ['Envases', selected.cantidadEnvases ? String(selected.cantidadEnvases) : '-'],
                ['Peso Bruto', selected.pesoBruto ? selected.pesoBruto.toLocaleString('es-UY') + ' kg' : '-'],
                ['Peso Neto', selected.pesoNeto ? selected.pesoNeto.toLocaleString('es-UY') + ' kg' : '-'],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium font-mono">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mt-4 mb-2">Establecimientos</p>
              {[
                ['Productor', selected.nombreEstablecimientoProd || '-'],
                ['Certificador', selected.nombreEstablecimientoCertif || '-'],
                ['Destino', selected.nombreEstablecimientoDestino],
                ['Veterinario', selected.nombreMedicoVeterinario || '-'],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium break-all">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mt-4 mb-2">Línea de Tiempo</p>
              <div className="space-y-2">
                {getTimeline(selected).map((step) => {
                  const Icon = step.icon;
                  const d = step.start ? fd(step.start) : null;
                  const e = step.end ? fd(step.end) : null;
                  return (
                    <div key={step.stage} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${step.color}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{step.label}</p>
                        <p className="text-xs text-slate-500">{d || 'Sin fecha'}{e && e !== d ? ` → ${e}` : ''}</p>
                      </div>
                      {step.days !== null && step.days > 0 && (
                        <Badge variant="outline" className="text-xs font-mono shrink-0">{step.days}d</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              {getTotalDuration(selected) && (
                <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                  <span className="text-xs text-emerald-700 font-medium">Duración total del proceso: {getTotalDuration(selected)} días</span>
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => exportTrace(selected)}>
                  <Download className="h-3.5 w-3.5 mr-1" />Exportar traza XLSX
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => buscarCruce(selected.nroCote)}>
                  <ArrowDownUp className="h-3.5 w-3.5 mr-1" />Ver cruce
                </Button>
              </div>
              {selected.observaciones && (
                <><p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mt-4 mb-1">Observaciones</p>
                <p className="text-slate-600 text-xs whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{selected.observaciones}</p></>
              )}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}