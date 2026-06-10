'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { fetchShipments, fetchAnalytics } from '@/lib/staticData';
import type { Shipment } from '@/lib/types';

function fd(d: string) { if (!d) return '-'; return new Date(d).toLocaleDateString('es-UY',{day:'2-digit',month:'2-digit',year:'numeric'}); }

export default function ShipmentTable() {
  const { search, setSearch, filters, setFilter, clearFilters } = useAppStore();
  const [data, setData] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [options, setOptions] = useState({ paises: [] as string[], productos: [] as string[], destinos: [] as string[] });
  const limit = 20;

  useEffect(() => {
    fetchAnalytics().then(a => {
      setOptions({
        paises: (a.byPais||[]).map((p:{pais:string})=>p.pais).filter(Boolean),
        productos: (a.byProducto||[]).map((p:{producto:string})=>p.producto).filter(Boolean),
        destinos: (a.byDestino||[]).map((d:{destino:string})=>d.destino).filter(Boolean),
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const j = await fetchShipments({ page, limit, search, ...filters });
      if (cancelled) return;
      setData(j.data); setTotal(j.total); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, search, filters, limit]);

  const handleFilterChange = () => { setPage(1); };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { handleFilterChange(); }, [search, filters]);

  const totalPages = Math.ceil(total / limit);
  const hasFilters = search || Object.values(filters).some(Boolean);

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <h2 className="text-2xl font-bold text-slate-800">Envíos</h2>
      <Card><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar trámite, COTE, destino..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-9" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1"/>Limpiar</Button>}
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={filters.pais} onValueChange={v=>setFilter('pais',v)}><SelectTrigger className="w-[200px]"><SelectValue placeholder="País Destino"/></SelectTrigger><SelectContent>{options.paises.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Select value={filters.producto} onValueChange={v=>setFilter('producto',v)}><SelectTrigger className="w-[220px]"><SelectValue placeholder="Producto"/></SelectTrigger><SelectContent>{options.productos.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Select value={filters.destino} onValueChange={v=>setFilter('destino',v)}><SelectTrigger className="w-[200px]"><SelectValue placeholder="Destino"/></SelectTrigger><SelectContent>{options.destinos.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
          <Input type="date" value={filters.fechaDesde} onChange={e=>setFilter('fechaDesde',e.target.value)} className="w-[160px]" />
          <Input type="date" value={filters.fechaHasta} onChange={e=>setFilter('fechaHasta',e.target.value)} className="w-[160px]" />
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <th className="px-3 py-3">Trámite</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">COTE</th>
              <th className="px-3 py-3">Destino</th><th className="px-3 py-3 hidden lg:table-cell">País</th>
              <th className="px-3 py-3 hidden md:table-cell">Producto</th><th className="px-3 py-3 hidden xl:table-cell">Corte</th>
              <th className="px-3 py-3 text-right">Envases</th><th className="px-3 py-3 text-right">Peso Neto</th>
              <th className="px-3 py-3 w-12"></th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({length:10}).map((_,i)=><tr key={i} className="border-b"><td colSpan={10}><Skeleton className="h-10 mx-3 my-1"/></td></tr>)
              : data.length===0 ? <tr><td colSpan={10} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
              : data.map(s=>(
                <tr key={s.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={()=>{setSelected(s);setDetailOpen(true);}}>
                  <td className="px-3 py-2.5 font-mono text-xs">{s.nroTramite}</td>
                  <td className="px-3 py-2.5 text-xs">{fd(s.fechaTramite)}</td>
                  <td className="px-3 py-2.5 text-xs font-medium text-emerald-700">{s.nroCote}</td>
                  <td className="px-3 py-2.5 text-xs">{s.nombreEstablecimientoDestino}</td>
                  <td className="px-3 py-2.5 text-xs hidden lg:table-cell">{s.paisDestino?.substring(0,30)}</td>
                  <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[180px] truncate">{s.denominacionMercaderia}</td>
                  <td className="px-3 py-2.5 text-xs hidden xl:table-cell">{s.corte}</td>
                  <td className="px-3 py-2.5 text-xs text-right font-mono">{s.cantidadEnvases??'-'}</td>
                  <td className="px-3 py-2.5 text-xs text-right font-mono">{s.pesoNeto?s.pesoNeto.toLocaleString('es-UY'):'-'}</td>
                  <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline"/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-slate-500">{total} registros — Página {page} de {totalPages||1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-4 w-4"/></Button>
            <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight className="h-4 w-4"/></Button>
          </div>
        </div>
      </CardContent></Card>
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (<><SheetHeader><SheetTitle>Detalle #{selected.nroTramite}</SheetTitle></SheetHeader>
            <div className="mt-6 space-y-3 text-sm">
              {[['Nro. Trámite',String(selected.nroTramite)],['Fecha',fd(selected.fechaTramite)],['COTE',selected.nroCote],['Destino',selected.nombreEstablecimientoDestino],['País',selected.paisDestino],['Producto',selected.denominacionMercaderia],['Corte',selected.corte],['Transporte',selected.tipoTransporte||'-'],['Matrícula',selected.matriculaCamion||'-'],['Precinto',selected.precinto1||'-'],['Veterinario',selected.nombreMedicoVeterinario||'-'],['Pallets',selected.pallets?String(selected.pallets):'-'],['Envases',selected.cantidadEnvases?String(selected.cantidadEnvases):'-'],['Peso Bruto',selected.pesoBruto?String(selected.pesoBruto):'-'],['Peso Neto',selected.pesoNeto?String(selected.pesoNeto):'-'],['COTE Emitido',fd(selected.fechaEmitidoCote||'')],['Inicio Faena',fd(selected.fechaInicioFaena||'')],['Inicio Producción',fd(selected.fechaInicioProduccion||'')],['Inicio Congelación',fd(selected.fechaInicioCongelacion||'')],['Tipo',selected.tipo]].map(([l,v])=>(
                <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 text-right font-medium break-all">{v}</span></div>
              ))}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
