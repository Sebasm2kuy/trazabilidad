'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Package, Truck, FileCheck, Clock, Thermometer, ArrowRight } from 'lucide-react';

interface ShipmentLine {
  id: string; nroTramite: number; fechaTramite: string; nroCote: string;
  nombreEstablecimientoDestino: string; paisDestino: string;
  denominacionMercaderia: string; corte: string; cantidadEnvases: number | null;
  pesoNeto: number | null; pesoBruto: number | null; pallets: number | null;
  matriculaCamion: string | null; precinto1: string | null;
  nombreMedicoVeterinario: string | null; tipoTransporte: string | null;
  observaciones: string | null; idLinea: number | null;
  fechaEmitidoCote: string | null;
  fechaInicioFaena: string | null; fechaFinFaena: string | null;
  fechaInicioProduccion: string | null; fechaFinProduccion: string | null;
  fechaInicioCongelacion: string | null; fechaFinCongelacion: string | null;
}

function fd(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Traceability() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShipmentLine[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const isNum = !isNaN(Number(query));
    const params = new URLSearchParams({ limit: '200' });
    if (isNum) params.set('search', query);
    else params.set('search', query);

    const r = await fetch(`/api/shipments?${params}`);
    const j = await r.json();

    if (isNum) {
      const tramNum = Number(query);
      const filtered = j.data.filter((s: ShipmentLine) => s.nroTramite === tramNum);
      setResults(filtered);
      if (filtered.length > 0) {
        setSummary({
          nroTramite: filtered[0].nroTramite,
          fechaTramite: filtered[0].fechaTramite,
          nroCote: filtered[0].nroCote,
          destino: filtered[0].nombreEstablecimientoDestino,
          pais: filtered[0].paisDestino,
          matricula: filtered[0].matriculaCamion,
          precinto: filtered[0].precinto1,
          vet: filtered[0].nombreMedicoVeterinario,
          transporte: filtered[0].tipoTransporte,
          totalEnvases: filtered.reduce((a: number, s: ShipmentLine) => a + (s.cantidadEnvases || 0), 0),
          totalPesoNeto: filtered.reduce((a: number, s: ShipmentLine) => a + (s.pesoNeto || 0), 0),
          totalPesoBruto: filtered.reduce((a: number, s: ShipmentLine) => a + (s.pesoBruto || 0), 0),
        });
      }
    } else {
      const filtered = j.data.filter((s: ShipmentLine) => s.nroCote?.toUpperCase() === query.toUpperCase());
      setResults(filtered);
      if (filtered.length > 0) {
        setSummary({
          nroTramite: filtered[0].nroTramite,
          fechaTramite: filtered[0].fechaTramite,
          nroCote: filtered[0].nroCote,
          destino: filtered[0].nombreEstablecimientoDestino,
          pais: filtered[0].paisDestino,
          matricula: filtered[0].matriculaCamion,
          precinto: filtered[0].precinto1,
          vet: filtered[0].nombreMedicoVeterinario,
          transporte: filtered[0].tipoTransporte,
          totalEnvases: filtered.reduce((a: number, s: ShipmentLine) => a + (s.cantidadEnvases || 0), 0),
          totalPesoNeto: filtered.reduce((a: number, s: ShipmentLine) => a + (s.pesoNeto || 0), 0),
          totalPesoBruto: filtered.reduce((a: number, s: ShipmentLine) => a + (s.pesoBruto || 0), 0),
        });
      }
    }
    setLoading(false);
  };

  const timeline = [
    { label: 'Faena', start: results[0]?.fechaInicioFaena, end: results[0]?.fechaFinFaena, icon: Package, color: 'bg-red-100 text-red-700 border-red-300' },
    { label: 'Producción', start: results[0]?.fechaInicioProduccion, end: results[0]?.fechaFinProduccion, icon: FileCheck, color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { label: 'Congelación', start: results[0]?.fechaInicioCongelacion, end: results[0]?.fechaFinCongelacion, icon: Thermometer, color: 'bg-sky-100 text-sky-700 border-sky-300' },
    { label: 'COTE Emitido', start: results[0]?.fechaEmitidoCote, end: null, icon: FileCheck, color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { label: 'Despacho', start: results[0]?.fechaTramite, end: null, icon: Truck, color: 'bg-violet-100 text-violet-700 border-violet-300' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <h2 className="text-2xl font-bold text-slate-800">Trazabilidad</h2>
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar por Nro. Trámite o COTE (ej: 447099 o P10378)" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            </div>
            <Button onClick={handleSearch} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {searched && results.length === 0 && (
        <Card><CardContent className="p-8 text-center text-slate-400">No se encontraron registros para &quot;{query}&quot;</CardContent></Card>
      )}

      {summary && results.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Resumen del Envío</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-slate-500">Trámite</p><p className="font-bold">{summary.nroTramite}</p></div>
              <div><p className="text-xs text-slate-500">COTE</p><p className="font-bold text-emerald-700">{summary.nroCote}</p></div>
              <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium">{fd(summary.fechaTramite as string)}</p></div>
              <div><p className="text-xs text-slate-500">Destino</p><p className="font-medium">{summary.destino as string}</p></div>
              <div><p className="text-xs text-slate-500">País</p><p className="font-medium">{summary.pais as string}</p></div>
              <div><p className="text-xs text-slate-500">Transporte</p><p className="font-medium">{(summary.transporte as string) || '-'} {(summary.matricula as string) || ''}</p></div>
              <div><p className="text-xs text-slate-500">Total Envases</p><p className="font-bold">{(summary.totalEnvases as number).toLocaleString('es-UY')}</p></div>
              <div><p className="text-xs text-slate-500">Peso Neto Total</p><p className="font-bold text-emerald-700">{(summary.totalPesoNeto as number).toLocaleString('es-UY')} kg</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Línea de Tiempo</CardTitle></CardHeader>
            <CardContent>
              <div className="relative flex flex-col gap-0 ml-4">
                <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-slate-200" />
                {timeline.map((step, i) => {
                  const Icon = step.icon;
                  const dateStr = step.start ? fd(step.start) : null;
                  const endStr = step.end ? fd(step.end) : null;
                  return (
                    <div key={i} className="flex items-center gap-4 py-3 relative">
                      <div className={`z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center ${step.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-sm font-medium w-28">{step.label}</span>
                        {dateStr ? (
                          <span className="text-sm text-slate-600">
                            {dateStr}
                            {endStr && endStr !== dateStr && <span> → {endStr}</span>}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">Sin fecha registrada</span>
                        )}
                      </div>
                      {i < timeline.length - 1 && dateStr && (
                        <ArrowRight className="h-4 w-4 text-slate-300 absolute -bottom-3 left-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Líneas del Envío ({results.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Producto</th>
                      <th className="px-3 py-3">Corte</th>
                      <th className="px-3 py-3 text-right">Envases</th>
                      <th className="px-3 py-3 text-right">Peso Bruto</th>
                      <th className="px-3 py-3 text-right">Peso Neto</th>
                      <th className="px-3 py-3">Faena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((s) => (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-400">{s.idLinea}</td>
                        <td className="px-3 py-2 text-xs">{s.denominacionMercaderia}</td>
                        <td className="px-3 py-2 text-xs">{s.corte || '-'}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{s.cantidadEnvases ?? '-'}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{s.pesoBruto ? s.pesoBruto.toLocaleString('es-UY') : '-'}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono font-medium">{s.pesoNeto ? s.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                        <td className="px-3 py-2 text-xs">{fd(s.fechaInicioFaena)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50 font-medium text-xs">
                      <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                      <td className="px-3 py-2 text-right font-mono">{results.reduce((a, s) => a + (s.cantidadEnvases || 0), 0).toLocaleString('es-UY')}</td>
                      <td className="px-3 py-2 text-right font-mono">{results.reduce((a, s) => a + (s.pesoBruto || 0), 0).toLocaleString('es-UY')}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">{results.reduce((a, s) => a + (s.pesoNeto || 0), 0).toLocaleString('es-UY')}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}