'use client';
import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, ChevronLeft, ChevronRight, Eye, FileCheck, Download, Ship } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Shipment } from '@/lib/types';

function fd(d: string | null | undefined) { if (!d) return '-'; return new Date(d).toLocaleDateString('es-UY',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function fmt(n: number) { if(n>=1000000) return (n/1000000).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return Math.round(n).toLocaleString('es-UY'); }

const COLORS = ['#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];

interface ExpRecord extends Shipment {
  papelSeguridad?: string;
  recibidaFechaHora?: string;
  recepcionServicio?: string;
  inspeccionExteriorConforme?: string;
  contenedorSerieNro?: string;
}

const expCache: { data: ExpRecord[]; loaded: boolean; analytics: Record<string, unknown> | null } = { data: [], loaded: false, analytics: null };

async function ensureExp() {
  if (!expCache.loaded) {
    const [expR, anaR] = await Promise.all([
      fetch('data/exportaciones.json'),
      fetch('data/exportaciones-analytics.json'),
    ]);
    expCache.data = await expR.json();
    expCache.analytics = await anaR.json();
    expCache.loaded = true;
  }
}

export default function ExportacionesTable() {
  const { expFilters, setExpFilter, clearExpFilters } = useAppStore();
  const [data, setData] = useState<ExpRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ExpRecord | null>(null);
  const [options, setOptions] = useState({ paises: [] as string[], productos: [] as string[], destinos: [] as string[] });
  const [cotes, setCotes] = useState<string[]>([]);
  const [coteOpen, setCoteOpen] = useState(false);
  const [coteSearch, setCoteSearch] = useState('');
  const [showCharts, setShowCharts] = useState(true);
  const limit = 20;

  useEffect(() => {
    (async () => {
      await ensureExp();
      const a = expCache.analytics!;
      setOptions({
        paises: (a.byPais||[]).map((p:{pais:string})=>p.pais).filter(Boolean),
        productos: (a.byProducto||[]).map((p:{producto:string})=>p.producto).filter(Boolean),
        destinos: (a.byDestino||[]).map((d:{destino:string})=>d.destino).filter(Boolean),
      });
      setCotes([...new Set(expCache.data.map(s=>s.nroCote).filter(Boolean) as string[])].sort());
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!expCache.loaded) return;
    let cancelled = false;
    (async () => {
      await ensureExp();
      if (cancelled) return;
      let filtered = [...expCache.data];
      const { search, pais, producto, destino, cote, fechaDesde, fechaHasta } = expFilters;

      if (search) {
        const s = search.toLowerCase();
        const num = Number(search);
        filtered = filtered.filter(sh =>
          sh.nroTramite === num ||
          sh.nroCote?.toLowerCase().includes(s) ||
          sh.nombreEstablecimientoDestino?.toLowerCase().includes(s) ||
          sh.denominacionMercaderia?.toLowerCase().includes(s) ||
          sh.paisDestino?.toLowerCase().includes(s) ||
          sh.contenedorSerieNro?.toLowerCase().includes(s)
        );
      }
      if (pais) filtered = filtered.filter(sh => sh.paisDestino?.includes(pais));
      if (producto) filtered = filtered.filter(sh => sh.denominacionMercaderia?.includes(producto));
      if (destino) filtered = filtered.filter(sh => sh.nombreEstablecimientoDestino?.includes(destino));
      if (cote) filtered = filtered.filter(sh => sh.nroCote === cote);
      if (fechaDesde) filtered = filtered.filter(sh => sh.fechaTramite >= new Date(fechaDesde).toISOString());
      if (fechaHasta) filtered = filtered.filter(sh => sh.fechaTramite <= new Date(fechaHasta + 'T23:59:59').toISOString());

      const t = filtered.length;
      setData(filtered.slice((page - 1) * limit, page * limit));
      setTotal(t);
    })();
    return () => { cancelled = true; };
  }, [page, expFilters, limit]);

  useEffect(() => { setPage(1); }, [expFilters]);

  const totalPages = Math.ceil(total / limit);
  const hasFilters = Object.values(expFilters).some(Boolean);
  const filteredCotes = coteSearch ? cotes.filter(c => c.toLowerCase().includes(coteSearch.toLowerCase())) : cotes;
  const a = expCache.analytics;

  if (loading) return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">Exportaciones</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Ship className="h-6 w-6 text-blue-600" />Exportaciones</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCharts(!showCharts)}>
            {showCharts ? 'Ocultar' : 'Ver'} Resumen
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const XLSX = await import('xlsx');
            const rows = expCache.data.map((s: ExpRecord) => ({
              'Trámite': s.nroTramite, 'Fecha': s.fechaTramite ? s.fechaTramite.split('T')[0] : '',
              'COTE': s.nroCote, 'País': s.paisDestino, 'Producto': s.denominacionMercaderia,
              'Corte': s.corte, 'Envases': s.cantidadEnvases, 'Peso Neto': s.pesoNeto,
              'Contenedor': s.contenedorSerieNro, 'Precinto': s.precinto1,
              'Cert. Sanitario': s.nroCertificadoSanitario, 'Papel Seguridad': s.papelSeguridad,
            }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Exportaciones');
            XLSX.writeFile(wb, `exportaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
          }}><Download className="h-4 w-4 mr-2" />Exportar</Button>
        </div>
      </div>

      {showCharts && a && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50"><Ship className="h-5 w-5 text-blue-600"/></div>
            <div><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold">{a.total}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50"><span className="text-lg font-bold text-amber-600">kg</span></div>
            <div><p className="text-xs text-slate-500">Peso Neto</p><p className="text-xl font-bold">{fmt(a.pesoNetoTotal as number)}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-50"><span className="text-lg font-bold text-violet-600">🌍</span></div>
            <div><p className="text-xs text-slate-500">Países</p><p className="text-xl font-bold">{a.uniquePaisCount}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-rose-50"><span className="text-lg font-bold text-rose-600">📦</span></div>
            <div><p className="text-xs text-slate-500">Envases</p><p className="text-xl font-bold">{fmt(a.envasesTotal as number)}</p></div>
          </CardContent></Card>
          <Card className="lg:col-span-2"><CardContent className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={(a.byPais as Array<Record<string,number>>).slice(0,8)} dataKey="pesoNeto" nameKey="pais" cx="50%" cy="50%" outerRadius={80} label={({pais,percent})=>`${(pais as string).substring(0,15)} ${(percent*100).toFixed(0)}%`}>{(a.byPais as Array<Record<string,number>>).slice(0,8).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={(v:number)=>fmt(v)+' kg'}/></PieChart></ResponsiveContainer></CardContent></Card>
          <Card className="lg:col-span-2"><CardContent className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={(a.byProducto as Array<Record<string,number>>).slice(0,6)} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>fmt(v as number)}/><YAxis type="category" dataKey="producto" width={160} tick={{fontSize:9}}/><Tooltip formatter={(v:number)=>fmt(v)+' kg'}/><Bar dataKey="pesoNeto" fill="#3b82f6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
      )}

      <Card><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar trámite, COTE, contenedor, país..." value={expFilters.search} onChange={e=>setExpFilter('search',e.target.value)} className="pl-9" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearExpFilters}><X className="h-4 w-4 mr-1"/>Limpiar</Button>}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <button type="button" onClick={() => { setCoteOpen(!coteOpen); setCoteSearch(''); }}
              className={`flex h-9 w-[200px] items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap truncate ${expFilters.cote ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-input bg-background text-muted-foreground'}`}>
              <span className="truncate">{expFilters.cote ? <span className="flex items-center gap-2"><FileCheck className="h-3.5 w-3.5 shrink-0"/>{expFilters.cote}</span> : 'Filtrar por COTE'}</span>
              {expFilters.cote && <X className="h-3 w-3 ml-1 shrink-0" onClick={e => { e.stopPropagation(); setExpFilter('cote', ''); }} />}
            </button>
            {coteOpen && (
              <div className="absolute z-50 mt-1 w-[260px] rounded-md border bg-popover shadow-lg">
                <div className="p-2 border-b">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Buscar COTE..." value={coteSearch} onChange={e => setCoteSearch(e.target.value)} className="h-8 pl-8 text-sm" autoFocus /></div>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredCotes.length === 0 ? <p className="text-sm text-slate-400 p-3 text-center">Sin resultados</p> :
                  filteredCotes.map(c => (
                    <button key={c} type="button" onClick={() => { setExpFilter('cote', expFilters.cote === c ? '' : c); setCoteOpen(false); setCoteSearch(''); }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent ${expFilters.cote === c ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>{c}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Select value={expFilters.pais} onValueChange={v=>setExpFilter('pais',v)}><SelectTrigger className="w-[180px]"><SelectValue placeholder="País"/></SelectTrigger><SelectContent>{options.paises.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Select value={expFilters.producto} onValueChange={v=>setExpFilter('producto',v)}><SelectTrigger className="w-[220px]"><SelectValue placeholder="Producto"/></SelectTrigger><SelectContent>{options.productos.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Input type="date" value={expFilters.fechaDesde} onChange={e=>setExpFilter('fechaDesde',e.target.value)} className="w-[150px]" />
          <Input type="date" value={expFilters.fechaHasta} onChange={e=>setExpFilter('fechaHasta',e.target.value)} className="w-[150px]" />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <th className="px-3 py-3">Trámite</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">COTE</th>
              <th className="px-3 py-3">País</th><th className="px-3 py-3 hidden md:table-cell">Producto</th>
              <th className="px-3 py-3 hidden lg:table-cell">Contenedor</th>
              <th className="px-3 py-3 text-right">Envases</th><th className="px-3 py-3 text-right">Peso Neto</th>
              <th className="px-3 py-3 w-12"></th>
            </tr></thead>
            <tbody>
              {data.length === 0 ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
              : data.map(s => (
                <tr key={s.id} className="border-b hover:bg-blue-50/50 cursor-pointer" onClick={() => { setSelected(s); setDetailOpen(true); }}>
                  <td className="px-3 py-2.5 font-mono text-xs">{s.nroTramite}</td>
                  <td className="px-3 py-2.5 text-xs">{fd(s.fechaTramite)}</td>
                  <td className="px-3 py-2.5 text-xs font-medium text-blue-700">{s.nroCote}</td>
                  <td className="px-3 py-2.5 text-xs">{s.paisDestino}</td>
                  <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[180px] truncate">{s.denominacionMercaderia}</td>
                  <td className="px-3 py-2.5 text-xs hidden lg:table-cell font-mono">{s.contenedorSerieNro || '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-right font-mono">{s.cantidadEnvases ?? '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-right font-mono">{s.pesoNeto ? s.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                  <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-slate-500">{total} registros — Página {page} de {totalPages || 1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent></Card>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (<><SheetHeader><SheetTitle className="flex items-center gap-2"><Ship className="h-5 w-5 text-blue-600" />Exportación #{selected.nroTramite}</SheetTitle></SheetHeader>
            <div className="mt-6 space-y-3 text-sm">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Datos del Embarque</p>
              {[['Nro. Trámite', String(selected.nroTramite)],['Fecha', fd(selected.fechaTramite)],['COTE', selected.nroCote],['País', selected.paisDestino],['Destino', selected.nombreEstablecimientoDestino],['Producto', selected.denominacionMercaderia],['Corte', selected.corte],['Transporte', selected.tipoTransporte || '-'],['Contenedor', selected.contenedorSerieNro || '-'],['Matrícula Camión', selected.matriculaCamion || '-'],['Precinto', selected.precinto1 || '-'],['Cert. Sanitario', selected.nroCertificadoSanitario || '-'],['Papel Seguridad', selected.papelSeguridad || '-'],['Estab. Certificador', selected.nombreEstablecimientoCertif || '-'],['Estab. Productor', selected.nombreEstablecimientoProd || '-'],['Veterinario', selected.nombreMedicoVeterinario || '-']].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium break-all">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-4 mb-2">Pesos y Cantidades</p>
              {[['Pallets', selected.pallets ? String(selected.pallets) : '-'],['Envases', selected.cantidadEnvases ? String(selected.cantidadEnvases) : '-'],['Peso Bruto', selected.pesoBruto ? String(selected.pesoBruto) : '-'],['Peso Neto', selected.pesoNeto ? String(selected.pesoNeto) : '-'],['Temperatura', selected.temperaturaC ? String(selected.temperaturaC) + ' °C' : '-']].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-4 mb-2">Fechas</p>
              {[['COTE Emitido', fd(selected.fechaEmitidoCote || '')],['Inicio Faena', fd(selected.fechaInicioFaena || '')],['Fin Faena', fd(selected.fechaFinFaena || '')],['Inicio Producción', fd(selected.fechaInicioProduccion || '')],['Fin Producción', fd(selected.fechaFinProduccion || '')],['Inicio Congelación', fd(selected.fechaInicioCongelacion || '')],['Fin Congelación', fd(selected.fechaFinCongelacion || '')]].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium">{v}</span></div>
              ))}
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-4 mb-2">Inspección / Recepción</p>
              {[['Recibida', fd(selected.recibidaFechaHora || '')],['Servicio Insp.', selected.recepcionServicio || '-'],['Insp. Exterior Conforme', selected.inspeccionExteriorConforme || '-'],['Recibida Temp.', selected.recibidaTemperatura ? String(selected.recibidaTemperatura) + ' °C' : '-'],['Recibida Usuario', selected.recepcionUsuario || '-'],['Obs. Recepción', selected.recepcionObservaciones || '-'],['Obs. Insp. Exterior', selected.obsInspeccionExterior || '-']].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium break-all">{v}</span></div>
              ))}
              {selected.observaciones && (
                <><p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-4 mb-2">Observaciones</p>
                <p className="text-slate-600 text-xs whitespace-pre-wrap">{selected.observaciones}</p></>
              )}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}