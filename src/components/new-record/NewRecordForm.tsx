'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function NewRecordForm() {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({
    nroTramite: '', fechaTramite: '', nroCote: '', denominacionMercaderia: '', corte: '',
    nombreEstablecimientoDestino: '', paisDestino: '', matriculaCamion: '', precinto1: '',
    pesoBruto: '', pesoNeto: '', cantidadEnvases: '', pallets: '',
    tipoTransporte: '', tipoMovimiento: '', observaciones: '',
    fechaInicioFaena: '', fechaFinFaena: '', fechaInicioProduccion: '', fechaFinProduccion: '',
    fechaInicioCongelacion: '', fechaFinCongelacion: '',
    tipo: 'ingreso',
  });

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nroTramite: Number(form.nroTramite) || 0,
          pesoBruto: Number(form.pesoBruto) || null,
          pesoNeto: Number(form.pesoNeto) || null,
          cantidadEnvases: Number(form.cantidadEnvases) || null,
          pallets: Number(form.pallets) || null,
        }),
      });
      if (!res.ok) throw new Error();
      setResult({ ok: true, msg: 'Registro guardado correctamente.' });
      setForm({
        nroTramite: '', fechaTramite: '', nroCote: '', denominacionMercaderia: '', corte: '',
        nombreEstablecimientoDestino: '', paisDestino: '', matriculaCamion: '', precinto1: '',
        pesoBruto: '', pesoNeto: '', cantidadEnvases: '', pallets: '',
        tipoTransporte: '', tipoMovimiento: '', observaciones: '',
        fechaInicioFaena: '', fechaFinFaena: '', fechaInicioProduccion: '', fechaFinProduccion: '',
        fechaInicioCongelacion: '', fechaFinCongelacion: '',
        tipo: 'ingreso',
      });
    } catch {
      setResult({ ok: false, msg: 'Error al guardar el registro.' });
    }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <h2 className="text-2xl font-bold text-slate-800">Nuevo Registro</h2>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Datos del Envío</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label className="text-xs">Tipo</Label>
                <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="egreso">Egreso / Exportación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Nro. Trámite</Label><Input value={form.nroTramite} onChange={e => set('nroTramite', e.target.value)} placeholder="447099" /></div>
              <div><Label className="text-xs">Fecha Trámite</Label><Input type="date" value={form.fechaTramite} onChange={e => set('fechaTramite', e.target.value)} /></div>
              <div><Label className="text-xs">Nro. COTE</Label><Input value={form.nroCote} onChange={e => set('nroCote', e.target.value)} placeholder="P10378" /></div>
              <div><Label className="text-xs">Destino</Label><Input value={form.nombreEstablecimientoDestino} onChange={e => set('nombreEstablecimientoDestino', e.target.value)} placeholder="Coltirey S.A." /></div>
              <div><Label className="text-xs">País Destino</Label><Input value={form.paisDestino} onChange={e => set('paisDestino', e.target.value)} placeholder="UNION EUROPEA" /></div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-600 mb-3">Producto y Cantidades</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2"><Label className="text-xs">Producto (Denominación)</Label><Input value={form.denominacionMercaderia} onChange={e => set('denominacionMercaderia', e.target.value)} placeholder="CARNE BOVINA DESOSADA" /></div>
                <div><Label className="text-xs">Corte</Label><Input value={form.corte} onChange={e => set('corte', e.target.value)} placeholder="Bife angosto" /></div>
                <div><Label className="text-xs">Peso Bruto (kg)</Label><Input type="number" value={form.pesoBruto} onChange={e => set('pesoBruto', e.target.value)} /></div>
                <div><Label className="text-xs">Peso Neto (kg)</Label><Input type="number" value={form.pesoNeto} onChange={e => set('pesoNeto', e.target.value)} /></div>
                <div><Label className="text-xs">Cantidad de Envases</Label><Input type="number" value={form.cantidadEnvases} onChange={e => set('cantidadEnvases', e.target.value)} /></div>
                <div><Label className="text-xs">Pallets</Label><Input type="number" value={form.pallets} onChange={e => set('pallets', e.target.value)} /></div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-600 mb-3">Transporte y Logística</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label className="text-xs">Tipo Transporte</Label><Input value={form.tipoTransporte} onChange={e => set('tipoTransporte', e.target.value)} placeholder="Camión" /></div>
                <div><Label className="text-xs">Matrícula Camión</Label><Input value={form.matriculaCamion} onChange={e => set('matriculaCamion', e.target.value)} placeholder="ABC 123" /></div>
                <div><Label className="text-xs">Precinto</Label><Input value={form.precinto1} onChange={e => set('precinto1', e.target.value)} placeholder="646090" /></div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-600 mb-3">Fechas de Proceso</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><Label className="text-xs">Inicio Faena</Label><Input type="date" value={form.fechaInicioFaena} onChange={e => set('fechaInicioFaena', e.target.value)} /></div>
                <div><Label className="text-xs">Fin Faena</Label><Input type="date" value={form.fechaFinFaena} onChange={e => set('fechaFinFaena', e.target.value)} /></div>
                <div><Label className="text-xs">Inicio Producción</Label><Input type="date" value={form.fechaInicioProduccion} onChange={e => set('fechaInicioProduccion', e.target.value)} /></div>
                <div><Label className="text-xs">Fin Producción</Label><Input type="date" value={form.fechaFinProduccion} onChange={e => set('fechaFinProduccion', e.target.value)} /></div>
                <div><Label className="text-xs">Inicio Congelación</Label><Input type="date" value={form.fechaInicioCongelacion} onChange={e => set('fechaInicioCongelacion', e.target.value)} /></div>
                <div><Label className="text-xs">Fin Congelación</Label><Input type="date" value={form.fechaFinCongelacion} onChange={e => set('fechaFinCongelacion', e.target.value)} /></div>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-xs">Observaciones</Label>
              <Textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Observaciones del envío..." rows={2} />
            </div>

            {result && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {result.ok ? <CheckCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                {result.msg}
              </div>
            )}

            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Guardar Registro
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}