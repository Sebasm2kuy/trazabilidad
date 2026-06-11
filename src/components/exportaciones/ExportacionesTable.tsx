'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Search, X, ChevronLeft, ChevronRight, Eye, FileCheck, Download, Ship, Pencil, Save, RotateCcw, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Shipment } from '@/lib/types';

function fd(d: string | null | undefined) { if (!d) return '-'; try { return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return '-'; } }
function fdt(d: string | null | undefined) { if (!d) return '-'; try { return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '-'; } }
function fmt(n: number) { if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'; if (n >= 1000) return (n / 1000).toFixed(1) + 'K'; return Math.round(n).toLocaleString('es-UY'); }

const COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

// Extend Shipment with all exportacion-specific fields
interface ExpRecord extends Shipment {
  papelSeguridad?: string;
  recibidaFechaHora?: string;
  recepcionServicio?: string;
  inspeccionExteriorConforme?: string;
  contenedorSerieNro?: string;
  matriculaAvion?: string;
  precinto2?: string;
  precinto3?: string;
  precinto4?: string;
  precintoAgencia?: string;
  guiaINAC?: string;
  correspondeAbrirContenedor?: string;
  validezMercaderia?: string;
  recibidaTemperatura?: string | number;
  recepcionObservaciones?: string;
  recepcionUsuario?: string;
  obsInspeccionExterior?: string;
  contenedorInspeccion?: string;
  avionInspeccion?: string;
  camionInspeccion?: string;
  inspPrecinto1?: string;
  inspPrecinto2?: string;
  inspPrecinto3?: string;
  inspPrecinto4?: string;
}

const EXP_EDITS_KEY = 'trazabilidad_exp_edits';

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

function loadEdits(): Record<string, Partial<ExpRecord>> {
  try { const r = localStorage.getItem(EXP_EDITS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

function saveEdits(edits: Record<string, Partial<ExpRecord>>) {
  localStorage.setItem(EXP_EDITS_KEY, JSON.stringify(edits));
}

function applyEdits(data: ExpRecord[], edits: Record<string, Partial<ExpRecord>>): ExpRecord[] {
  if (Object.keys(edits).length === 0) return data;
  return data.map(s => edits[s.id] ? { ...s, ...edits[s.id] } : s);
}

// Field definitions for the edit form
type FieldType = 'text' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  step?: string;
}

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Datos del Embarque',
    fields: [
      { key: 'nroCote', label: 'COTE', type: 'text' },
      { key: 'paisDestino', label: 'País Destino', type: 'text' },
      { key: 'nombreEstablecimientoDestino', label: 'Establecimiento Destino', type: 'text' },
      { key: 'denominacionMercaderia', label: 'Producto / Denominación', type: 'text' },
      { key: 'corte', label: 'Corte', type: 'text' },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['EXPORTACION', 'INGRESO'] },
      { key: 'proceso', label: 'Proceso', type: 'text' },
    ],
  },
  {
    title: 'Logística y Transporte',
    fields: [
      { key: 'tipoTransporte', label: 'Tipo Transporte', type: 'text' },
      { key: 'contenedorSerieNro', label: 'Contenedor Serie/Nro', type: 'text' },
      { key: 'matriculaCamion', label: 'Matrícula Camión', type: 'text' },
      { key: 'matriculaAvion', label: 'Matrícula Avión', type: 'text' },
      { key: 'precinto1', label: 'Precinto 1', type: 'text' },
      { key: 'precinto2', label: 'Precinto 2', type: 'text' },
      { key: 'precinto3', label: 'Precinto 3', type: 'text' },
      { key: 'precinto4', label: 'Precinto 4', type: 'text' },
      { key: 'precintoAgencia', label: 'Precinto Agencia', type: 'text' },
      { key: 'guiaINAC', label: 'Guía INAC', type: 'text' },
      { key: 'nroCertificadoSanitario', label: 'Cert. Sanitario', type: 'text' },
      { key: 'papelSeguridad', label: 'Papel Seguridad', type: 'text' },
      { key: 'shipping', label: 'Shipping', type: 'text' },
    ],
  },
  {
    title: 'Pesos y Cantidades',
    fields: [
      { key: 'pallets', label: 'Pallets', type: 'number', step: '1' },
      { key: 'cantidadEnvases', label: 'Cantidad Envases', type: 'number', step: '1' },
      { key: 'pesoBruto', label: 'Peso Bruto (kg)', type: 'number', step: '0.01' },
      { key: 'pesoNeto', label: 'Peso Neto (kg)', type: 'number', step: '0.01' },
      { key: 'temperaturaC', label: 'Temperatura (°C)', type: 'number', step: '0.1' },
      { key: 'codigoEnvase', label: 'Código Envase', type: 'text' },
    ],
  },
  {
    title: 'Establecimientos y Personal',
    fields: [
      { key: 'nombreEstablecimientoProd', label: 'Estab. Productor', type: 'text' },
      { key: 'nroEstablecimientoProd', label: 'Nro Estab. Productor', type: 'text' },
      { key: 'nombreEstablecimientoCertif', label: 'Estab. Certificador', type: 'text' },
      { key: 'nombreMedicoVeterinario', label: 'Médico Veterinario', type: 'text' },
    ],
  },
  {
    title: 'Fechas del Proceso',
    fields: [
      { key: 'fechaTramite', label: 'Fecha Trámite', type: 'datetime-local' },
      { key: 'fechaEmitidoCote', label: 'COTE Emitido', type: 'datetime-local' },
      { key: 'fechaInicioFaena', label: 'Inicio Faena', type: 'datetime-local' },
      { key: 'fechaFinFaena', label: 'Fin Faena', type: 'datetime-local' },
      { key: 'fechaInicioProduccion', label: 'Inicio Producción', type: 'datetime-local' },
      { key: 'fechaFinProduccion', label: 'Fin Producción', type: 'datetime-local' },
      { key: 'fechaInicioCongelacion', label: 'Inicio Congelación', type: 'datetime-local' },
      { key: 'fechaFinCongelacion', label: 'Fin Congelación', type: 'datetime-local' },
    ],
  },
  {
    title: 'Recepción e Inspección',
    fields: [
      { key: 'recibidaFechaHora', label: 'Recibida Fecha/Hora', type: 'datetime-local' },
      { key: 'recibidaTemperatura', label: 'Recibida Temperatura (°C)', type: 'number', step: '0.1' },
      { key: 'recepcionServicio', label: 'Recepción Servicio', type: 'text' },
      { key: 'recepcionUsuario', label: 'Recepción Usuario', type: 'text' },
      { key: 'recepcionObservaciones', label: 'Obs. Recepción', type: 'textarea' },
      { key: 'inspeccionExteriorConforme', label: 'Insp. Ext. Conforme', type: 'select', options: ['SI', 'NO', ''] },
      { key: 'contenedorInspeccion', label: 'Contenedor Inspección', type: 'text' },
      { key: 'avionInspeccion', label: 'Avión Inspección', type: 'text' },
      { key: 'camionInspeccion', label: 'Camión Inspección', type: 'text' },
      { key: 'inspPrecinto1', label: 'Insp. Precinto 1', type: 'text' },
      { key: 'inspPrecinto2', label: 'Insp. Precinto 2', type: 'text' },
      { key: 'inspPrecinto3', label: 'Insp. Precinto 3', type: 'text' },
      { key: 'inspPrecinto4', label: 'Insp. Precinto 4', type: 'text' },
      { key: 'obsInspeccionExterior', label: 'Obs. Insp. Exterior', type: 'textarea' },
      { key: 'correspondeAbrirContenedor', label: 'Corresponde Abrir Cont.', type: 'select', options: ['SI', 'NO', ''] },
      { key: 'validezMercaderia', label: 'Validez Mercadería', type: 'text' },
    ],
  },
  {
    title: 'Otros',
    fields: [
      { key: 'loteUsaCanada', label: 'Lote USA/Canada', type: 'text' },
      { key: 'lotesChina', label: 'Lotes China', type: 'text' },
      { key: 'tipoMovimiento', label: 'Tipo Movimiento', type: 'text' },
      { key: 'baja', label: 'Baja', type: 'text' },
      { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
    ],
  },
];

function toInputDate(d: string | null | undefined): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 16);
  } catch { return ''; }
}

export default function ExportacionesTable() {
  const { expFilters, setExpFilter, clearExpFilters } = useAppStore();
  const [data, setData] = useState<ExpRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ExpRecord | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Partial<ExpRecord>>>(loadEdits);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [options, setOptions] = useState({ paises: [] as string[], productos: [] as string[], destinos: [] as string[] });
  const [cotes, setCotes] = useState<string[]>([]);
  const [coteOpen, setCoteOpen] = useState(false);
  const [coteSearch, setCoteSearch] = useState('');
  const [showCharts, setShowCharts] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const limit = showAll ? 99999 : 20;

  useEffect(() => {
    (async () => {
      await ensureExp();
      const a = expCache.analytics!;
      setOptions({
        paises: (a.byPais || []).map((p: { pais: string }) => p.pais).filter(Boolean),
        productos: (a.byProducto || []).map((p: { producto: string }) => p.producto).filter(Boolean),
        destinos: (a.byDestino || []).map((d: { destino: string }) => d.destino).filter(Boolean),
      });
      // Apply edits to cache
      expCache.data = applyEdits(expCache.data, edits);
      setCotes([...new Set(expCache.data.map(s => s.nroCote).filter(Boolean) as string[])].sort());
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!expCache.loaded) return;
    let cancelled = false;
    (async () => {
      await ensureExp();
      if (cancelled) return;
      let filtered = applyEdits([...expCache.data], edits);
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
  }, [page, expFilters, limit, edits]);

  useEffect(() => { setPage(1); }, [expFilters]);

  const handleOpenDetail = useCallback((s: ExpRecord) => {
    setSelected(s);
    setEditMode(false);
    // Populate edit form with current data (with edits applied)
    const form: Record<string, string> = {};
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        const val = (s as Record<string, unknown>)[f.key];
        if (f.type === 'datetime-local') {
          form[f.key] = toInputDate(val as string | null | undefined);
        } else if (f.type === 'date') {
          form[f.key] = val ? String(val).split('T')[0] : '';
        } else {
          form[f.key] = val !== null && val !== undefined ? String(val) : '';
        }
      }
    }
    setEditForm(form);
    setDetailOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!selected) return;
    const changed: Partial<ExpRecord> = {};
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        const newVal = editForm[f.key];
        const origVal = (selected as Record<string, unknown>)[f.key];
        const origStr = origVal !== null && origVal !== undefined ? String(origVal) : '';
        if (newVal !== origStr) {
          if (f.type === 'number') {
            (changed as Record<string, unknown>)[f.key] = newVal !== '' ? Number(newVal) : null;
          } else {
            (changed as Record<string, unknown>)[f.key] = newVal || null;
          }
        }
      }
    }

    if (Object.keys(changed).length === 0) {
      setSaveMsg('Sin cambios');
      setTimeout(() => setSaveMsg(null), 2000);
      return;
    }

    const newEdits = { ...edits, [selected.id]: { ...edits[selected.id], ...changed } };
    setEdits(newEdits);
    saveEdits(newEdits);
    // Update cache
    expCache.data = applyEdits(expCache.data, newEdits);
    // Update selected
    const updated = { ...selected, ...changed };
    setSelected(updated);
    // Re-populate form with updated data
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        const val = (updated as Record<string, unknown>)[f.key];
        if (f.type === 'datetime-local') {
          editForm[f.key] = toInputDate(val as string | null | undefined);
        } else {
          editForm[f.key] = val !== null && val !== undefined ? String(val) : '';
        }
      }
    }
    setEditForm({ ...editForm });
    setSaveMsg('Guardado');
    setTimeout(() => setSaveMsg(null), 2000);
  }, [selected, editForm, edits]);

  const handleResetField = useCallback((key: string) => {
    if (!selected) return;
    const allEdits = { ...edits };
    if (allEdits[selected.id]) {
      const idEdits = { ...allEdits[selected.id] };
      delete idEdits[key as keyof ExpRecord];
      if (Object.keys(idEdits).length === 0) {
        delete allEdits[selected.id];
      } else {
        allEdits[selected.id] = idEdits;
      }
    }
    setEdits(allEdits);
    saveEdits(allEdits);
    expCache.data = applyEdits(expCache.data, allEdits);
    // Reset form field to original value
    const orig = expCache.data.find(s => s.id === selected.id);
    if (orig) {
      const val = (orig as Record<string, unknown>)[key];
      setEditForm(prev => ({ ...prev, [key]: val !== null && val !== undefined ? String(val) : '' }));
      setSelected({ ...selected, [key]: val });
    }
  }, [selected, edits]);

  const handleResetAll = useCallback(() => {
    if (!selected) return;
    const allEdits = { ...edits };
    delete allEdits[selected.id];
    setEdits(allEdits);
    saveEdits(allEdits);
    expCache.data = applyEdits(expCache.data, allEdits);
    const orig = expCache.data.find(s => s.id === selected.id);
    if (orig) {
      handleOpenDetail(orig);
    }
  }, [selected, edits, handleOpenDetail]);

  const isFieldEdited = useCallback((key: string) => {
    if (!selected || !edits[selected.id]) return false;
    return key in edits[selected.id]!;
  }, [selected, edits]);

  const editedCount = Object.keys(edits).length;

  const totalPages = Math.ceil(total / limit);
  const hasFilters = Object.values(expFilters).some(Boolean);
  const filteredCotes = coteSearch ? cotes.filter(c => c.toLowerCase().includes(coteSearch.toLowerCase())) : cotes;
  const a = expCache.analytics;

  if (loading) return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">Exportaciones</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Ship className="h-6 w-6 text-blue-600" />Exportaciones</h2>
          {editedCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <Pencil className="h-3 w-3 mr-1" />{editedCount} editado{editedCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {editedCount > 0 && (
            <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => {
              if (confirm('¿Eliminar todas las ediciones? Se restaurarán los valores originales.')) {
                setEdits({});
                saveEdits({});
                expCache.data = applyEdits(expCache.data, {});
                setCotes([...new Set(expCache.data.map(s => s.nroCote).filter(Boolean) as string[])].sort());
              }
            }}>
              <RotateCcw className="h-4 w-4 mr-1" />Limpiar ediciones
            </Button>
          )}
          <Button variant={!showAll ? 'default' : 'outline'} size="sm" onClick={() => { setShowAll(!showAll); setPage(1); }}>
            {showAll ? 'Paginar (20)' : 'Ver todos'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCharts(!showCharts)}>
            {showCharts ? 'Ocultar' : 'Ver'} Resumen
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const XLSX = await import('xlsx');
            const currentData = applyEdits(expCache.data, edits);
            const rows = currentData.map((s: ExpRecord) => ({
              'Trámite': s.nroTramite, 'Fecha': s.fechaTramite ? s.fechaTramite.split('T')[0] : '',
              'COTE': s.nroCote, 'País': s.paisDestino, 'Producto': s.denominacionMercaderia,
              'Corte': s.corte, 'Envases': s.cantidadEnvases, 'Peso Neto': s.pesoNeto,
              'Peso Bruto': s.pesoBruto, 'Contenedor': s.contenedorSerieNro, 'Precinto': s.precinto1,
              'Cert. Sanitario': s.nroCertificadoSanitario, 'Papel Seguridad': s.papelSeguridad,
              'Matrícula': s.matriculaCamion, 'Transporte': s.tipoTransporte,
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
            <div className="p-3 rounded-xl bg-blue-50"><Ship className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold">{a.total}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50"><span className="text-lg font-bold text-amber-600">kg</span></div>
            <div><p className="text-xs text-slate-500">Peso Neto</p><p className="text-xl font-bold">{fmt(a.pesoNetoTotal as number)}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-50"><span className="text-lg font-bold text-violet-600">🇺🇾</span></div>
            <div><p className="text-xs text-slate-500">Países</p><p className="text-xl font-bold">{a.uniquePaisCount}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-rose-50"><span className="text-lg font-bold text-rose-600">📦</span></div>
            <div><p className="text-xs text-slate-500">Envases</p><p className="text-xl font-bold">{fmt(a.envasesTotal as number)}</p></div>
          </CardContent></Card>
          <Card className="lg:col-span-2"><CardContent className="h-52 relative"><ResponsiveContainer width="100%" height={176}><PieChart><Pie data={(a.byPais as Array<Record<string, number>>).slice(0, 8)} dataKey="pesoNeto" nameKey="pais" cx="50%" cy="50%" outerRadius={80} label={({ pais, percent }) => `${(pais as string).substring(0, 15)} ${(percent * 100).toFixed(0)}%`}>{(a.byPais as Array<Record<string, number>>).slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => fmt(v) + ' kg'} /></PieChart></ResponsiveContainer></CardContent></Card>
          <Card className="lg:col-span-2"><CardContent className="h-52 relative"><ResponsiveContainer width="100%" height={176}><BarChart data={(a.byProducto as Array<Record<string, number>>).slice(0, 6)} layout="vertical" margin={{ left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmt(v as number)} /><YAxis type="category" dataKey="producto" width={160} tick={{ fontSize: 9 }} /><Tooltip formatter={(v: number) => fmt(v) + ' kg'} /><Bar dataKey="pesoNeto" fill="#3b82f6" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
      )}

      <Card><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar trámite, COTE, contenedor, país..." value={expFilters.search} onChange={e => setExpFilter('search', e.target.value)} className="pl-9" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearExpFilters}><X className="h-4 w-4 mr-1" />Limpiar</Button>}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <button type="button" onClick={() => { setCoteOpen(!coteOpen); setCoteSearch(''); }}
              className={`flex h-9 w-[200px] items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap truncate ${expFilters.cote ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-input bg-background text-muted-foreground'}`}>
              <span className="truncate">{expFilters.cote ? <span className="flex items-center gap-2"><FileCheck className="h-3.5 w-3.5 shrink-0" />{expFilters.cote}</span> : 'Filtrar por COTE'}</span>
              {expFilters.cote && <X className="h-3 w-3 ml-1 shrink-0" onClick={e => { e.stopPropagation(); setExpFilter('cote', ''); }} />}
            </button>
            {coteOpen && (
              <div className="absolute z-50 mt-1 w-[260px] rounded-md border bg-popover shadow-lg">
                <div className="p-2 border-b">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input placeholder="Buscar COTE..." value={coteSearch} onChange={e => setCoteSearch(e.target.value)} className="h-8 pl-8 text-sm" autoFocus /></div>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredCotes.length === 0 ? <p className="text-sm text-slate-400 p-3 text-center">Sin resultados</p>
                    : filteredCotes.map(c => (
                      <button key={c} type="button" onClick={() => { setExpFilter('cote', expFilters.cote === c ? '' : c); setCoteOpen(false); setCoteSearch(''); }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent ${expFilters.cote === c ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>{c}</button>
                    ))}
                </div>
              </div>
            )}
          </div>
          <Select value={expFilters.pais} onValueChange={v => setExpFilter('pais', v)}><SelectTrigger className="w-[180px]"><SelectValue placeholder="País" /></SelectTrigger><SelectContent>{options.paises.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Select value={expFilters.producto} onValueChange={v => setExpFilter('producto', v)}><SelectTrigger className="w-[220px]"><SelectValue placeholder="Producto" /></SelectTrigger><SelectContent>{options.productos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
          <Input type="date" value={expFilters.fechaDesde} onChange={e => setExpFilter('fechaDesde', e.target.value)} className="w-[150px]" />
          <Input type="date" value={expFilters.fechaHasta} onChange={e => setExpFilter('fechaHasta', e.target.value)} className="w-[150px]" />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3">Trámite</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">COTE</th>
              <th className="px-3 py-3">País</th><th className="px-3 py-3 hidden md:table-cell">Producto</th>
              <th className="px-3 py-3 hidden xl:table-cell">Corte</th>
              <th className="px-3 py-3 text-right">Envases</th><th className="px-3 py-3 text-right">Peso Neto</th>
              <th className="px-3 py-3 w-12"></th>
            </tr></thead>
            <tbody>
              {data.length === 0 ? <tr><td colSpan={10} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                : data.map(s => {
                  const isEdited = !!edits[s.id];
                  return (
                    <tr key={s.id} className={`border-b cursor-pointer ${isEdited ? 'bg-amber-50/60 hover:bg-amber-100/60' : 'hover:bg-blue-50/50'}`} onClick={() => handleOpenDetail(s)}>
                      <td className="px-3 py-2.5 text-center">{isEdited && <Pencil className="h-3 w-3 text-amber-600 inline" />}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{s.nroTramite}</td>
                      <td className="px-3 py-2.5 text-xs">{fd(s.fechaTramite)}</td>
                      <td className="px-3 py-2.5 text-xs font-medium text-blue-700">{s.nroCote}</td>
                      <td className="px-3 py-2.5 text-xs">{s.paisDestino}</td>
                      <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[180px] truncate">{s.denominacionMercaderia}</td>
                      <td className="px-3 py-2.5 text-xs hidden xl:table-cell">{s.corte}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-mono">{s.cantidadEnvases ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-mono">{s.pesoNeto ? s.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                      <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline" /></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!showAll && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-slate-500">{total} registros — Página {page} de {totalPages || 1}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent></Card>

      {/* ===== SHEET: DETALLE / EDICION ===== */}
      <Sheet open={detailOpen} onOpenChange={open => { setDetailOpen(open); if (!open) setEditMode(false); }}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selected && (<>
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2">
                  <Ship className="h-5 w-5 text-blue-600" />
                  {editMode ? 'Editar' : 'Exportación'} #{selected.nroTramite}
                </SheetTitle>
                <div className="flex items-center gap-2">
                  {editMode && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600 hover:text-amber-700" onClick={handleResetAll}>
                      <RotateCcw className="h-3 w-3 mr-1" />Restaurar
                    </Button>
                  )}
                  <Button
                    variant={editMode ? 'default' : 'outline'}
                    size="sm"
                    className={editMode ? 'bg-blue-600 hover:bg-blue-700 h-7' : 'h-7'}
                    onClick={() => {
                      if (editMode) {
                        handleSave();
                        setEditMode(false);
                      } else {
                        setEditMode(true);
                      }
                    }}
                  >
                    {editMode ? <><Save className="h-3.5 w-3.5 mr-1" />Guardar</> : <><Pencil className="h-3.5 w-3.5 mr-1" />Editar</>}
                  </Button>
                </div>
              </div>
              {saveMsg && (
                <div className="flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs text-emerald-600 font-medium">{saveMsg}</span>
                </div>
              )}
            </SheetHeader>

            <div className="mt-6 space-y-5 text-sm">
              {/* Trámite (read-only, as identifier) */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                <span className="text-xs text-slate-500 w-28 shrink-0">Nro. Trámite</span>
                <span className="font-mono font-bold text-slate-800">{selected.nroTramite}</span>
                <span className="text-xs text-slate-400 ml-auto">solo lectura</span>
              </div>

              {/* Editable sections */}
              {SECTIONS.map(section => (
                <div key={section.title}>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">{section.title}</p>
                  <div className="space-y-2">
                    {section.fields.map(field => {
                      const edited = isFieldEdited(field.key);
                      if (editMode) {
                        return (
                          <div key={field.key} className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <label className="text-xs text-slate-500 block mb-0.5">{field.label}</label>
                              {field.type === 'select' ? (
                                <Select value={editForm[field.key] || ''} onValueChange={v => setEditForm(prev => ({ ...prev, [field.key]: v }))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                  <SelectContent>
                                    {(field.options || []).map(o => <SelectItem key={o || '_empty'} value={o || ''}>{o || '(vacío)'}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : field.type === 'textarea' ? (
                                <Textarea
                                  value={editForm[field.key] || ''}
                                  onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  className="text-xs min-h-[60px]"
                                  rows={2}
                                />
                              ) : (
                                <Input
                                  type={field.type}
                                  step={field.step}
                                  value={editForm[field.key] || ''}
                                  onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  className="h-8 text-xs"
                                />
                              )}
                            </div>
                            {edited && (
                              <button type="button" title="Restaurar valor original" className="mt-5 shrink-0"
                                onClick={() => handleResetField(field.key)}>
                                <RotateCcw className="h-3.5 w-3.5 text-amber-500 hover:text-amber-700" />
                              </button>
                            )}
                          </div>
                        );
                      }
                      // Read-only mode
                      const val = (selected as Record<string, unknown>)[field.key];
                      let displayVal: string;
                      if (field.type === 'datetime-local') {
                        displayVal = fdt(val as string | null | undefined);
                      } else {
                        displayVal = val !== null && val !== undefined ? String(val) : '-';
                      }
                      return (
                        <div key={field.key} className={`flex justify-between gap-4 ${edited ? 'bg-amber-50/50 -mx-1 px-1 rounded' : ''}`}>
                          <span className="text-slate-500 shrink-0">{field.label}</span>
                          <span className={`text-right font-medium break-all ${edited ? 'text-amber-800' : 'text-slate-800'}`}>{displayVal}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}