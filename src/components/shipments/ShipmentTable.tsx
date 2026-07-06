'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Search, X, ChevronLeft, ChevronRight, Eye, FileCheck, Pencil, Save, RotateCcw, CheckCircle2, Plus, Trash2, Download, Upload, Loader2, Check, Globe, Sparkles, ClipboardPaste, Package, FileText } from 'lucide-react';
import { fetchShipments, fetchAnalytics, getCotes, dataUrl } from '@/lib/staticData';
import { parseEnviosExcel } from '@/lib/parseExcelRegistro';
import { parseCotePdf, coteToShipmentRecord } from '@/lib/parseCotePdf';
import type { Shipment } from '@/lib/types';
import { schedulePush } from '@/lib/googleSheets';
import { toast } from 'sonner';
import { fd, fdt } from '@/lib/utils';

function parseMgapContentLocal(raw: string) {
  const r: { cote?: string; tramite?: number; fecha?: string; producto?: string; cajas?: number; pesoNeto?: number; pesoBruto?: number; corte?: string; pais?: string } = {};
  try {
    const m = raw.match(/Nro[.\s]*COTE[:\s]*([A-Z]\d{4,})/i); if (m) r.cote = m[1];
    const t = raw.match(/Nro[.\s]*Tramite[:\s]*(\d+)/i); if (t) r.tramite = parseInt(t[1]);
    const f = raw.match(/(\d{2}\/\d{2}\/\d{4})/); if (f) r.fecha = f[1];
    const p = raw.match(/Denominacion[\s\S]*?:\s*([A-ZÑÁÉÍÓÚ\s]+?)(?:\n|$)/i); if (p) r.producto = p[1].trim();
    const c = raw.match(/Corte[:\s]*([A-ZÑÁÉÍÓÚ\s\/,]+?)(?:\n|$)/i); if (c) r.corte = c[1].trim();
    const pa = raw.match(/Pais[:\s]*([A-ZÑÁÉÍÓÚ\s]+?)(?:\n|$)/i); if (pa) r.pais = pa[1].trim();
    const ce = raw.match(/Cantidad[\s]*Envases[:\s]*([\d.]+)/i); if (ce) r.cajas = parseInt(ce[1].replace(/\./g, ''));
    const pn = raw.match(/Peso[\s]*Neto[:\s]*([\d.]+)/i); if (pn) r.pesoNeto = parseFloat(pn[1].replace(/\./g, '').replace(',', '.'));
    const pb = raw.match(/Peso[\s]*Bruto[:\s]*([\d.]+)/i); if (pb) r.pesoBruto = parseFloat(pb[1].replace(/\./g, '').replace(',', '.'));
  } catch { /* ignore */ }
  return r;
}

const DEP_EDITS_KEY = 'trazabilidad_dep_edits';
const DEP_NEW_KEY = 'trazabilidad_dep_new_records';
const DEP_DELETE_KEY = 'trazabilidad_dep_deleted';

function loadEdits(): Record<string, Partial<Shipment>> {
  try { const r = localStorage.getItem(DEP_EDITS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveEdits(edits: Record<string, Partial<Shipment>>) {
  localStorage.setItem(DEP_EDITS_KEY, JSON.stringify(edits));
  schedulePush();
}
function loadNewRecords(): Shipment[] {
  try { const r = localStorage.getItem(DEP_NEW_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveNewRecords(records: Shipment[]) {
  localStorage.setItem(DEP_NEW_KEY, JSON.stringify(records));
  schedulePush();
}
function loadDeleted(): Set<string> {
  try { const r = localStorage.getItem(DEP_DELETE_KEY); return new Set(r ? JSON.parse(r) : []); } catch { return new Set(); }
}
function saveDeleted(ids: Set<string>) {
  localStorage.setItem(DEP_DELETE_KEY, JSON.stringify([...ids]));
  schedulePush();
}

function applyEdits(data: Shipment[], edits: Record<string, Partial<Shipment>>): Shipment[] {
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

interface ProductoCorteLine {
  id: string;
  producto: string;
  corte: string;
  cajas: number | '';
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
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['DEPOSITO', 'INGRESO', 'EXPORTACION'] },
      { key: 'proceso', label: 'Proceso', type: 'text' },
      { key: 'tipoMovimiento', label: 'Tipo Movimiento', type: 'text' },
    ],
  },
  {
    title: 'Logística y Transporte',
    fields: [
      { key: 'tipoTransporte', label: 'Tipo Transporte', type: 'text' },
      { key: 'contenedorSerieNro', label: 'Contenedor Serie/Nro', type: 'text' },
      { key: 'matriculaCamion', label: 'Matrícula Camión', type: 'text' },
      { key: 'precinto1', label: 'Precinto 1', type: 'text' },
      { key: 'nroCertificadoSanitario', label: 'Cert. Sanitario', type: 'text' },
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
    title: 'Otros',
    fields: [
      { key: 'loteUsaCanada', label: 'Lote USA/Canada', type: 'text' },
      { key: 'lotesChina', label: 'Lotes China', type: 'text' },
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

// Cache for raw data from shipments.json
const depCache: { data: Shipment[]; loaded: boolean } = { data: [], loaded: false };

const DEP_IMPORTED_KEY = 'trazabilidad_dep_imported';

async function ensureDep() {
  // Always reload if empty
  if (!depCache.loaded || depCache.data.length === 0) {
    depCache.loaded = false;
    depCache.data = [];

    // Try localStorage first
    const imported = localStorage.getItem(DEP_IMPORTED_KEY);
    if (imported) {
      try {
        const parsed = JSON.parse(imported);
        if (Array.isArray(parsed) && parsed.length > 0) {
          depCache.data = parsed;
        }
      } catch { /* ignore */ }
    }

    // If no local data, load from pre-processed JSON
    if (depCache.data.length === 0) {
      try {
        const r = await fetch(dataUrl('data/ingresos_frimaral.json'));
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length > 0) {
            depCache.data = data;
          }
        }
      } catch { /* ignore */ }
    }

    // Also merge new_records (manual/PDF)
    try {
      const newRecs = JSON.parse(localStorage.getItem('trazabilidad_dep_new_records') || '[]');
      if (Array.isArray(newRecs) && newRecs.length > 0) {
        const existingIds = new Set(depCache.data.map((r: Shipment) => r.id));
        for (const r of newRecs) {
          if (!existingIds.has(r.id)) depCache.data.push(r);
        }
      }
    } catch { /* ignore */ }

    // Also merge edits (for new_dep_ records that were edited)
    try {
      const edits = JSON.parse(localStorage.getItem('trazabilidad_dep_edits') || '{}');
      for (const r of depCache.data) {
        if (edits[r.id]) Object.assign(r, edits[r.id]);
      }
    } catch { /* ignore */ }

    depCache.loaded = true;
  }
}

/** Force-reload depCache from localStorage (called after Firebase pull) */
function invalidateDepCache() {
  depCache.loaded = false;
  depCache.data = [];
}

export default function ShipmentTable() {
  const { search, setSearch, filters, setFilter, clearFilters } = useAppStore();
  const [data, setData] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedState = useState<Shipment | null>(null);
  const selected = selectedState[0];
  const setSelected = selectedState[1];
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Shipment>>>(loadEdits);
  const [newRecords, setNewRecords] = useState<Shipment[]>(loadNewRecords);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(loadDeleted);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [options, setOptions] = useState({ paises: [] as string[], productos: [] as string[], destinos: [] as string[] });
  const [cotes, setCotes] = useState<string[]>([]);
  const [coteOpen, setCoteOpen] = useState(false);
  const [coteSearch, setCoteSearch] = useState('');
  const [paisOpen, setPaisOpen] = useState(false);
  const [paisSearch, setPaisSearch] = useState('');
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoSearch, setProductoSearch] = useState('');
  const [destinoOpen, setDestinoOpen] = useState(false);
  const [destinoSearch, setDestinoSearch] = useState('');
  const coteInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 20;
  const [detailLineas, setDetailLineas] = useState<ProductoCorteLine[]>([]);
  const addDetailLinea = () => setDetailLineas(prev => [...prev, { id: String(Date.now()), producto: '', corte: '', cajas: '' }]);
  const removeDetailLinea = (id: string) => setDetailLineas(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  const updateDetailLinea = (id: string, field: 'producto' | 'corte' | 'cajas', value: string) => {
    setDetailLineas(prev => prev.map(l => l.id === id ? { ...l, [field]: field === 'cajas' ? (value === '' ? '' : parseInt(value) || 0) : value } : l));
  };

  // Refresh filter options from actual data (not just analytics.json)
  const refreshOptions = useCallback(() => {
    const allData = applyEdits([...depCache.data, ...newRecords], edits).filter(s => !deletedIds.has(s.id));
    const paises = [...new Set(allData.map(s => s.paisDestino).filter(Boolean) as string[])].sort();
    const productos = [...new Set(allData.map(s => s.denominacionMercaderia).filter(Boolean) as string[])].sort();
    const destinos = [...new Set(allData.map(s => s.nombreEstablecimientoDestino).filter(Boolean) as string[])].sort();
    const coteList = [...new Set(allData.map(s => s.nroCote).filter(Boolean) as string[])].sort();
    setOptions({ paises, productos, destinos });
    setCotes(coteList);
  }, [edits, newRecords, deletedIds]);

  useEffect(() => {
    // First try analytics.json, then override with real data
    (async () => {
      try {
        const a = await fetchAnalytics();
        setOptions({
          paises: (a.byPais || []).map((p: { pais: string }) => p.pais).filter(Boolean),
          productos: (a.byProducto || []).map((p: { producto: string }) => p.producto).filter(Boolean),
          destinos: (a.byDestino || []).map((d: { destino: string }) => d.destino).filter(Boolean),
        });
        const c = await getCotes();
        setCotes(c);
      } catch { /* ignore */ }
    })();
  }, []);

  // Listen for Firebase data-ready event and refresh cache + options
  useEffect(() => {
    const handler = () => {
      invalidateDepCache();
      setDataVersion(v => v + 1);
    };
    window.addEventListener('trazabilidad-data-ready', handler);
    return () => window.removeEventListener('trazabilidad-data-ready', handler);
  }, []);

  // Refresh options whenever data changes
  useEffect(() => {
    if (depCache.loaded) refreshOptions();
  }, [depCache.loaded, refreshOptions, dataVersion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await ensureDep();
      if (cancelled) return;

      // Start with raw data + new records, apply edits, remove deleted
      let allData = applyEdits([...depCache.data, ...newRecords], edits);
      allData = allData.filter(s => !deletedIds.has(s.id));

      // Apply filters
      const { pais, producto, destino, tipo, cote, fechaDesde, fechaHasta } = filters;
      if (search) {
        const s = search.toLowerCase();
        const num = Number(search);
        allData = allData.filter(sh =>
          sh.nroTramite === num ||
          sh.nroCote?.toLowerCase().includes(s) ||
          sh.nombreEstablecimientoDestino?.toLowerCase().includes(s) ||
          sh.denominacionMercaderia?.toLowerCase().includes(s) ||
          sh.paisDestino?.toLowerCase().includes(s) ||
          sh.matriculaCamion?.toLowerCase().includes(s) ||
          sh.precinto1?.toLowerCase().includes(s)
        );
      }
      if (pais) allData = allData.filter(sh => sh.paisDestino?.includes(pais));
      if (producto) allData = allData.filter(sh => sh.denominacionMercaderia?.includes(producto));
      if (destino) allData = allData.filter(sh => sh.nombreEstablecimientoDestino?.includes(destino));
      if (tipo) allData = allData.filter(sh => sh.tipo === tipo);
      if (cote) allData = allData.filter(sh => sh.nroCote === cote);
      if (fechaDesde) allData = allData.filter(sh => sh.fechaTramite >= new Date(fechaDesde).toISOString());
      if (fechaHasta) allData = allData.filter(sh => sh.fechaTramite <= new Date(fechaHasta + 'T23:59:59').toISOString());

      // Sort by date desc
      allData.sort((a, b) => b.fechaTramite.localeCompare(a.fechaTramite));

      const t = allData.length;
      setData(allData.slice((page - 1) * limit, page * limit));
      setTotal(t);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, search, filters, limit, edits, newRecords, deletedIds, dataVersion]);

  useEffect(() => { setPage(1); }, [search, filters]);

  const handleOpenDetail = useCallback((s: Shipment) => {
    setSelected(s);
    setEditMode(false);
    const form: Record<string, string> = {};
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        const val = (s as unknown as Record<string, unknown>)[f.key];
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
    const changed: Partial<Shipment> = {};
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        const newVal = editForm[f.key];
        const origVal = (selected as unknown as Record<string, unknown>)[f.key];
        const origStr = origVal !== null && origVal !== undefined ? String(origVal) : '';
        if (newVal !== origStr) {
          if (f.type === 'number') {
            (changed as unknown as Record<string, unknown>)[f.key] = newVal !== '' ? Number(newVal) : null;
          } else {
            (changed as unknown as Record<string, unknown>)[f.key] = newVal || null;
          }
        }
      }
    }
    // Handle lineas: compute totals and store
    const filledLineas = detailLineas.filter(l => l.producto.trim() || l.corte.trim());
    if (filledLineas.length > 0) {
      const productoFromLineas = filledLineas.map(l => l.producto).filter(Boolean).join(', ');
      const corteFromLineas = filledLineas.map(l => l.corte).filter(Boolean).join(', ');
      const cajasFromLineas = filledLineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0);
      (changed as unknown as Record<string, unknown>).denominacionMercaderia = productoFromLineas || null;
      (changed as unknown as Record<string, unknown>).corte = corteFromLineas || null;
      (changed as unknown as Record<string, unknown>).cantidadEnvases = cajasFromLineas || null;
      (changed as unknown as Record<string, unknown>).lineas = filledLineas;
    }
    if (Object.keys(changed).length === 0) {
      setSaveMsg('Sin cambios');
      setTimeout(() => setSaveMsg(null), 2000);
      return;
    }
    const newEdits = { ...edits, [selected.id]: { ...edits[selected.id], ...changed } };
    setEdits(newEdits);
    saveEdits(newEdits);
    const updated = { ...selected, ...changed };
    setSelected(updated);
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        const val = (updated as unknown as Record<string, unknown>)[f.key];
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
  }, [selected, editForm, edits, detailLineas]);

  const handleResetField = useCallback((key: string) => {
    if (!selected) return;
    const allEdits = { ...edits };
    if (allEdits[selected.id]) {
      const idEdits = { ...allEdits[selected.id] };
      delete idEdits[key as keyof Shipment];
      if (Object.keys(idEdits).length === 0) {
        delete allEdits[selected.id];
      } else {
        allEdits[selected.id] = idEdits;
      }
    }
    setEdits(allEdits);
    saveEdits(allEdits);
    // Find original value
    const origFromNew = newRecords.find(s => s.id === selected.id);
    const origFromCache = depCache.data.find(s => s.id === selected.id);
    const orig = origFromNew || origFromCache;
    if (orig) {
      const val = (orig as unknown as Record<string, unknown>)[key];
      setEditForm(prev => ({ ...prev, [key]: val !== null && val !== undefined ? String(val) : '' }));
      setSelected({ ...selected, [key]: val });
    }
  }, [selected, edits, newRecords]);

  const handleResetAll = useCallback(() => {
    if (!selected) return;
    const allEdits = { ...edits };
    delete allEdits[selected.id];
    setEdits(allEdits);
    saveEdits(allEdits);
    const allData = applyEdits([...depCache.data, ...newRecords], allEdits);
    const orig = allData.find(s => s.id === selected.id);
    if (orig) handleOpenDetail(orig);
  }, [selected, edits, newRecords, handleOpenDetail]);

  const handleDelete = useCallback((s: Shipment) => {
    if (!confirm(`¿Eliminar registro #${s.nroTramite} (${s.nroCote})?`)) return;
    const newDeleted = new Set(deletedIds);
    newDeleted.add(s.id);
    setDeletedIds(newDeleted);
    saveDeleted(newDeleted);
    // If it was a new record, also remove from newRecords
    if (s.id.startsWith('new_') || s.id.startsWith('manual_')) {
      const updated = newRecords.filter(r => r.id !== s.id);
      setNewRecords(updated);
      saveNewRecords(updated);
    }
    // Remove any edits for this record
    const allEdits = { ...edits };
    delete allEdits[s.id];
    setEdits(allEdits);
    saveEdits(allEdits);
    setDetailOpen(false);
    setSelected(null);
  }, [deletedIds, newRecords, edits]);

  // Inline edit for cajas / kilos in table
  const handleInlineEdit = useCallback((id: string, field: 'cantidadEnvases' | 'pesoNeto', value: string) => {
    const numVal = value !== '' ? Number(value) : null;
    const newEdits = { ...edits, [id]: { ...edits[id], [field]: numVal } };
    setEdits(newEdits);
    saveEdits(newEdits);
  }, [edits]);

  // MGAP import state
  const [mgapPaste, setMgapPaste] = useState('');
  const [showMgap, setShowMgap] = useState(false);

  // Process MGAP paste → fill new record form
  const processMgap = () => {
    const parsed = parseMgapContentLocal(mgapPaste);
    if (!parsed.cote && !parsed.tramite) {
      toast.error('No se pudieron extraer datos del contenido pegado.');
      return;
    }
    const newRecord: Shipment = {
      id: `new_dep_${Date.now()}`,
      nroTramite: parsed.tramite || 0,
      fechaTramite: parsed.fecha ? new Date(parsed.fecha).toISOString() : new Date().toISOString(),
      nroCote: parsed.cote || '',
      nombreEstablecimientoDestino: '',
      paisDestino: parsed.pais || '',
      denominacionMercaderia: parsed.producto || '',
      corte: parsed.corte || '',
      tipo: 'DEPOSITO',
      cantidadEnvases: parsed.cajas || null,
      pesoNeto: parsed.pesoNeto || null,
      pesoBruto: parsed.pesoBruto || null,
    };
    const updated = [...newRecords, newRecord];
    setNewRecords(updated);
    saveNewRecords(updated);
    setMgapPaste('');
    setShowMgap(false);
    handleOpenDetail(newRecord);
    setEditMode(true);
    const filled = [parsed.cote && 'COTE', parsed.tramite && 'Tramite', parsed.fecha && 'Fecha', parsed.producto && 'Producto', parsed.cajas && 'Cajas', parsed.pesoNeto && 'Kg'].filter(Boolean);
    toast.success(`MGAP: campos completados (${filled.join(', ')})`);
  };

  // Add a new line (shipment) to the same tramite
  const handleAddLine = useCallback(() => {
    if (!selected) return;
    const newLine: Shipment = {
      id: `new_dep_${Date.now()}`,
      nroTramite: selected.nroTramite,
      fechaTramite: selected.fechaTramite,
      nroCote: selected.nroCote,
      nombreEstablecimientoDestino: selected.nombreEstablecimientoDestino,
      paisDestino: selected.paisDestino,
      tipo: selected.tipo,
      denominacionMercaderia: '',
      corte: '',
      cantidadEnvases: null,
      pesoNeto: null,
    };
    const updated = [...newRecords, newLine];
    setNewRecords(updated);
    saveNewRecords(updated);
    // Switch to editing the new line
    setDetailOpen(false);
    setTimeout(() => {
      handleOpenDetail(newLine);
      setEditMode(true);
    }, 100);
  }, [selected, newRecords, handleOpenDetail]);

  // Get sibling lines (same tramite)
  const siblingLines = selected
    ? applyEdits([...depCache.data, ...newRecords], edits)
        .filter(s => s.nroTramite === selected.nroTramite && s.id !== selected.id)
    : [];

  const handleCreate = useCallback(() => {
    const newRecord: Shipment = {
      id: `new_dep_${Date.now()}`,
      nroTramite: 0,
      fechaTramite: new Date().toISOString(),
      nroCote: '',
      nombreEstablecimientoDestino: '',
      paisDestino: '',
      denominacionMercaderia: '',
      corte: '',
      tipo: 'DEPOSITO',
    };
    const updated = [...newRecords, newRecord];
    setNewRecords(updated);
    saveNewRecords(updated);
    // Open in edit mode
    handleOpenDetail(newRecord);
    setEditMode(true);
  }, [newRecords, handleOpenDetail]);

  // PDF Upload handler
  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const parsed = await parseCotePdf(file);
      const newRecord = coteToShipmentRecord(parsed);

      // Check if COTE already exists in cache
      const existing = depCache.data.find(s => s.nroCote === newRecord.nroCote);
      if (existing) {
        // Open existing record in edit mode, also load ingreso COTEs from PDF
        const withEdits = applyEdits([...depCache.data, ...newRecords], edits).find(s => s.nroCote === newRecord.nroCote);
        if (withEdits) {
          handleOpenDetail(withEdits);
          if (withEdits.denominacionMercaderia || withEdits.corte) {
            setDetailLineas([{
              id: '1',
              producto: withEdits.denominacionMercaderia || '',
              corte: withEdits.corte || '',
              cajas: withEdits.cantidadEnvases != null ? withEdits.cantidadEnvases : '',
            }]);
          }
          setEditMode(true);
          setPdfError(null);
        }
        setPdfLoading(false);
        if (pdfInputRef.current) pdfInputRef.current.value = '';
        return;
      }

      // Add to new records
      const updated = [...newRecords, newRecord];
      setNewRecords(updated);
      saveNewRecords(updated);

      // Add to depCache and edits so it shows immediately
      depCache.data = [...depCache.data, newRecord];
      const newEdits = { ...edits, [newRecord.id]: newRecord as Partial<Shipment> };
      setEdits(newEdits);
      saveEdits(newEdits);

      // Update COTEs list
      const allData = applyEdits([...depCache.data, ...updated], newEdits);
      setCotes([...new Set(allData.map(s => s.nroCote).filter(Boolean) as string[])].sort());

      // Open in edit mode
      handleOpenDetail(newRecord);
      setDetailLineas([{
        id: '1',
        producto: newRecord.denominacionMercaderia || '',
        corte: newRecord.corte || '',
        cajas: newRecord.cantidadEnvases != null ? newRecord.cantidadEnvases : '',
      }]);
      setEditMode(true);

      toast.success(`COTE ${newRecord.nroCote} cargado desde PDF`);
    } catch (err) {
      console.error('Error parsing PDF:', err);
      setPdfError('Error al procesar el PDF. Verificá que sea un COTE válido.');
    }
    setPdfLoading(false);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  }, [edits, newRecords, handleOpenDetail]);

  const isFieldEdited = useCallback((key: string) => {
    if (!selected || !edits[selected.id]) return false;
    return key in edits[selected.id]!;
  }, [selected, edits]);

  const totalPages = Math.ceil(total / limit);
  const hasFilters = search || Object.values(filters).some(Boolean);
  const filteredCotes = coteSearch
    ? cotes.filter(c => c.toLowerCase().includes(coteSearch.toLowerCase()))
    : cotes;
  const editedCount = Object.keys(edits).length;

  const handleCoteSelect = (cote: string) => {
    setFilter('cote', filters.cote === cote ? '' : cote);
    setCoteOpen(false);
    setCoteSearch('');
  };

  const handleExportXlsx = async () => {
    const XLSX = await import('xlsx');
    const allData = applyEdits([...depCache.data, ...newRecords], edits).filter(s => !deletedIds.has(s.id));
    const rows = allData.map((s) => ({
      'Trámite': s.nroTramite, 'Fecha': s.fechaTramite ? s.fechaTramite.split('T')[0] : '',
      'COTE': s.nroCote, 'País': s.paisDestino, 'Destino': s.nombreEstablecimientoDestino,
      'Producto': s.denominacionMercaderia, 'Corte': s.corte, 'Tipo': s.tipo,
      'Envases': s.cantidadEnvases, 'Peso Neto': s.pesoNeto, 'Peso Bruto': s.pesoBruto,
      'Pallets': s.pallets, 'Contenedor': s.contenedorSerieNro, 'Precinto': s.precinto1,
      'Matrícula': s.matriculaCamion, 'Transporte': s.tipoTransporte,
      'Veterinario': s.nombreMedicoVeterinario, 'Estab. Prod.': s.nombreEstablecimientoProd,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'A Depósitos');
    XLSX.writeFile(wb, `depositos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const newRecords = await parseEnviosExcel(file);

      // MERGE: append new records, don't replace existing ones
      // Build a key set from existing data to deduplicate
      const existingKeys = new Set(
        depCache.data.map(r => `${r.nroTramite}_${r.nroCote}_${r.idLinea ?? ''}`)
      );
      const trulyNew = newRecords.filter(r => {
        const key = `${r.nroTramite}_${r.nroCote}_${r.idLinea ?? ''}`;
        return !existingKeys.has(key);
      });

      if (trulyNew.length === 0) {
        toast.info('Todos los registros del Excel ya existen. No se agregaron nuevos.');
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const merged = [...depCache.data, ...trulyNew];
      depCache.data = merged;
      depCache.loaded = true;
      localStorage.setItem(DEP_IMPORTED_KEY, JSON.stringify(merged));
      schedulePush();

      const dupCount = newRecords.length - trulyNew.length;
      const msg = dupCount > 0
        ? `${trulyNew.length} registros nuevos agregados (${dupCount} duplicados omitidos)`
        : `${trulyNew.length} registros nuevos agregados`;
      toast.success(msg);
      setPage(1);
      // Re-trigger data loading
      setLoading(true);
      setTimeout(() => setLoading(false), 100);
    } catch (err) {
      toast.error('Error al importar: ' + (err as Error).message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">A Depósitos</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800">A Depósitos</h2>
          {editedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              <Pencil className="h-3 w-3" />{editedCount} editado{editedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {importing ? 'Importando...' : 'Importar Excel'}
          </Button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handlePdfUpload}
          />
          <Button
            variant="default"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
            disabled={pdfLoading}
            onClick={() => pdfInputRef.current?.click()}
          >
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {pdfLoading ? 'Procesando...' : 'Cargar PDF'}
          </Button>
          {pdfError && <span className="text-xs text-red-500">{pdfError}</span>}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-4 w-4" />Nuevo
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportXlsx}>
            <Download className="h-4 w-4 mr-2" />Exportar
          </Button>
        </div>
      </div>

      <Card><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar trámite, COTE, destino..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1" />Limpiar</Button>}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => { setCoteOpen(!coteOpen); setCoteSearch(''); }}
              className={`flex h-9 w-[220px] items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap truncate ${filters.cote ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium' : 'border-input bg-background text-muted-foreground'}`}
            >
              <span className="truncate">
                {filters.cote ? (
                  <span className="flex items-center gap-2">
                    <FileCheck className="h-3.5 w-3.5 shrink-0" />
                    {filters.cote}
                  </span>
                ) : 'Filtrar por COTE'}
              </span>
              {filters.cote && <X className="h-3 w-3 ml-1 shrink-0" onClick={e => { e.stopPropagation(); setFilter('cote', ''); }} />}
            </button>
            {coteOpen && (
              <div className="absolute z-50 mt-1 w-[280px] rounded-md border bg-popover shadow-lg">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input ref={coteInputRef} placeholder="Buscar COTE..." value={coteSearch} onChange={e => setCoteSearch(e.target.value)} className="h-8 pl-8 text-sm" autoFocus />
                  </div>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  {filteredCotes.length === 0 ? (
                    <p className="text-sm text-slate-400 p-3 text-center">Sin resultados</p>
                  ) : (
                    filteredCotes.map(c => (
                      <button key={c} type="button" onClick={() => handleCoteSelect(c)}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${filters.cote === c ? 'bg-emerald-50 text-emerald-700 font-medium' : ''}`}>
                        {c}
                      </button>
                    ))
                  )}
                </div>
                {filteredCotes.length > 0 && (
                  <div className="p-2 border-t text-xs text-slate-400 text-center">
                    {filteredCotes.length} COTE{filteredCotes.length !== 1 ? 's' : ''} encontrado{filteredCotes.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setPaisOpen(!paisOpen); setPaisSearch(''); }}
              className={`flex h-9 w-[200px] items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap truncate ${filters.pais ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium' : 'border-input bg-background text-muted-foreground'}`}
            >
              <span className="truncate">{filters.pais || 'País Destino'}</span>
              <X className={`h-3.5 w-3.5 shrink-0 ml-1 ${filters.pais ? 'text-emerald-600 hover:text-red-500' : 'text-slate-400'}`} onClick={e => { e.stopPropagation(); setFilter('pais', ''); setPaisOpen(false); }} />
            </button>
            {paisOpen && (
              <div className="absolute z-50 top-[100%] left-0 mt-1 w-[240px] bg-white border rounded-lg shadow-xl">
                <div className="p-2 border-b">
                  <input type="text" placeholder="Buscar país..." value={paisSearch} onChange={e => setPaisSearch(e.target.value)}
                    className="w-full h-8 text-sm border rounded px-2 focus:outline-none focus:ring-1 focus:ring-emerald-500" autoFocus />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {options.paises.filter(p => !paisSearch || p.toLowerCase().includes(paisSearch.toLowerCase())).map(p => (
                    <button key={p} type="button" onClick={() => { setFilter('pais', filters.pais === p ? '' : p); setPaisOpen(false); setPaisSearch(''); }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${filters.pais === p ? 'bg-emerald-50 text-emerald-700 font-medium' : ''}`}>{p}</button>
                  ))}
                  {paisSearch && !options.paises.some(p => p.toLowerCase().includes(paisSearch.toLowerCase())) && (
                    <button type="button" onClick={() => { setFilter('pais', paisSearch); setPaisOpen(false); setPaisSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-blue-600">Usar: "{paisSearch}"</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setProductoOpen(!productoOpen); setProductoSearch(''); }}
              className={`flex h-9 w-[220px] items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap truncate ${filters.producto ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium' : 'border-input bg-background text-muted-foreground'}`}
            >
              <span className="truncate">{filters.producto || 'Producto'}</span>
              <X className={`h-3.5 w-3.5 shrink-0 ml-1 ${filters.producto ? 'text-emerald-600 hover:text-red-500' : 'text-slate-400'}`} onClick={e => { e.stopPropagation(); setFilter('producto', ''); setProductoOpen(false); }} />
            </button>
            {productoOpen && (
              <div className="absolute z-50 top-[100%] left-0 mt-1 w-[260px] bg-white border rounded-lg shadow-xl">
                <div className="p-2 border-b">
                  <input type="text" placeholder="Buscar producto..." value={productoSearch} onChange={e => setProductoSearch(e.target.value)}
                    className="w-full h-8 text-sm border rounded px-2 focus:outline-none focus:ring-1 focus:ring-emerald-500" autoFocus />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {options.productos.filter(p => !productoSearch || p.toLowerCase().includes(productoSearch.toLowerCase())).map(p => (
                    <button key={p} type="button" onClick={() => { setFilter('producto', filters.producto === p ? '' : p); setProductoOpen(false); setProductoSearch(''); }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors truncate ${filters.producto === p ? 'bg-emerald-50 text-emerald-700 font-medium' : ''}`}>{p}</button>
                  ))}
                  {productoSearch && !options.productos.some(p => p.toLowerCase().includes(productoSearch.toLowerCase())) && (
                    <button type="button" onClick={() => { setFilter('producto', productoSearch); setProductoOpen(false); setProductoSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-blue-600">Usar: "{productoSearch}"</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setDestinoOpen(!destinoOpen); setDestinoSearch(''); }}
              className={`flex h-9 w-[200px] items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap truncate ${filters.destino ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium' : 'border-input bg-background text-muted-foreground'}`}
            >
              <span className="truncate">{filters.destino || 'Destino'}</span>
              <X className={`h-3.5 w-3.5 shrink-0 ml-1 ${filters.destino ? 'text-emerald-600 hover:text-red-500' : 'text-slate-400'}`} onClick={e => { e.stopPropagation(); setFilter('destino', ''); setDestinoOpen(false); }} />
            </button>
            {destinoOpen && (
              <div className="absolute z-50 top-[100%] left-0 mt-1 w-[240px] bg-white border rounded-lg shadow-xl">
                <div className="p-2 border-b">
                  <input type="text" placeholder="Buscar destino..." value={destinoSearch} onChange={e => setDestinoSearch(e.target.value)}
                    className="w-full h-8 text-sm border rounded px-2 focus:outline-none focus:ring-1 focus:ring-emerald-500" autoFocus />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {options.destinos.filter(d => !destinoSearch || d.toLowerCase().includes(destinoSearch.toLowerCase())).map(d => (
                    <button key={d} type="button" onClick={() => { setFilter('destino', filters.destino === d ? '' : d); setDestinoOpen(false); setDestinoSearch(''); }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${filters.destino === d ? 'bg-emerald-50 text-emerald-700 font-medium' : ''}`}>{d}</button>
                  ))}
                  {destinoSearch && !options.destinos.some(d => d.toLowerCase().includes(destinoSearch.toLowerCase())) && (
                    <button type="button" onClick={() => { setFilter('destino', destinoSearch); setDestinoOpen(false); setDestinoSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-blue-600">Usar: "{destinoSearch}"</button>
                  )}
                </div>
              </div>
            )}
          </div>
          <Input type="date" value={filters.fechaDesde} onChange={e => setFilter('fechaDesde', e.target.value)} className="w-[160px]" />
          <Input type="date" value={filters.fechaHasta} onChange={e => setFilter('fechaHasta', e.target.value)} className="w-[160px]" />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3">Trámite</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">COTE</th>
              <th className="px-3 py-3 hidden xl:table-cell">Estab. Certificador</th>
              <th className="px-3 py-3">Destino</th><th className="px-3 py-3 hidden lg:table-cell">País</th>
              <th className="px-3 py-3 hidden md:table-cell">Producto</th><th className="px-3 py-3 hidden xl:table-cell">Corte</th>
              <th className="px-3 py-3 text-right">Envases</th><th className="px-3 py-3 text-right">Peso Neto</th>
              <th className="px-3 py-3 w-12"></th>
            </tr></thead>
            <tbody>
              {data.length === 0 ? <tr><td colSpan={12} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                : data.map(s => {
                  const isEdited = !!edits[s.id];
                  const isNew = s.id.startsWith('new_') || s.id.startsWith('manual_');
                  return (
                    <tr key={s.id} className={`border-b cursor-pointer ${isEdited ? 'bg-amber-50/60 hover:bg-amber-100/60' : isNew ? 'bg-emerald-50/60 hover:bg-emerald-100/60' : 'hover:bg-slate-50'}`}
                      onClick={() => handleOpenDetail(s)}>
                      <td className="px-3 py-2.5 text-center">
                        {isEdited && <Pencil className="h-3 w-3 text-amber-600 inline" />}
                        {isNew && !isEdited && <Plus className="h-3 w-3 text-emerald-600 inline" />}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{s.nroTramite}</td>
                      <td className="px-3 py-2.5 text-xs">{fd(s.fechaTramite)}</td>
                      <td className="px-3 py-2.5 text-xs font-medium text-emerald-700">{s.nroCote || '-'}</td>
                      <td className="px-3 py-2.5 text-xs hidden xl:table-cell max-w-[180px] truncate" title={s.nombreEstablecimientoCertif || ''}>{s.nombreEstablecimientoCertif || '-'}</td>
                      <td className="px-3 py-2.5 text-xs">{s.nombreEstablecimientoDestino || '-'}</td>
                      <td className="px-3 py-2.5 text-xs hidden lg:table-cell">{s.paisDestino?.substring(0, 30) || '-'}</td>
                      <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[180px] truncate">{s.denominacionMercaderia || '-'}</td>
                      <td className="px-3 py-2.5 text-xs hidden xl:table-cell">{s.corte || '-'}</td>
                      <td className="px-1 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                        <input type="number" min="0" step="1"
                          className="w-[72px] h-7 text-xs text-right font-mono bg-transparent border border-transparent hover:border-slate-300 focus:border-emerald-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
                          defaultValue={s.cantidadEnvases ?? ''}
                          onBlur={e => { const v = e.target.value; if (v !== String(s.cantidadEnvases ?? '')) handleInlineEdit(s.id, 'cantidadEnvases', v); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                        <input type="number" min="0" step="0.01"
                          className="w-[88px] h-7 text-xs text-right font-mono bg-transparent border border-transparent hover:border-slate-300 focus:border-emerald-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
                          defaultValue={s.pesoNeto ?? ''}
                          onBlur={e => { const v = e.target.value; if (v !== String(s.pesoNeto ?? '')) handleInlineEdit(s.id, 'pesoNeto', v); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center"><Eye className="h-4 w-4 text-slate-400 inline" /></td>
                    </tr>
                  );
                })}
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

      {/* ===== SHEET: DETALLE / EDICION ===== */}
      <Sheet open={detailOpen} onOpenChange={open => { setDetailOpen(open); if (!open) { setEditMode(false); setDetailLineas([]); } }}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selected && (<>
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2">
                  A Depósitos #{selected.nroTramite}
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
                        // Initialize lineas from existing record
                        const existingLineas = (selected as any).lineas as ProductoCorteLine[] | undefined;
                        if (existingLineas && existingLineas.length > 0) {
                          setDetailLineas(existingLineas);
                        } else {
                          setDetailLineas([{
                            id: '1',
                            producto: selected.denominacionMercaderia || '',
                            corte: selected.corte || '',
                            cajas: selected.cantidadEnvases != null ? selected.cantidadEnvases : '',
                          }]);
                        }
                        setEditMode(true);
                      }
                    }}
                  >
                    {editMode ? <><Save className="h-3.5 w-3.5 mr-1" />Guardar</> : <><Pencil className="h-3.5 w-3.5 mr-1" />Editar</>}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(selected)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
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
              {/* Trámite (read-only in edit mode too) */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                <span className="text-xs text-slate-500 w-28 shrink-0">Nro. Trámite</span>
                {editMode ? (
                  <Input type="number" value={editForm['nroTramite'] || ''} onChange={e => setEditForm(prev => ({ ...prev, nroTramite: e.target.value }))} className="h-8 text-xs font-mono" />
                ) : (
                  <span className="font-mono font-bold text-slate-800">{selected.nroTramite}</span>
                )}
              </div>

              {/* Editable sections */}
              {SECTIONS.map((section, sIdx) => (
                <div key={section.title}>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">{section.title}</p>
                  <div className="space-y-2">
                    {section.fields.map(field => {
                      // Skip producto/corte in edit mode for first section - shown in multi-line area below
                      if (editMode && sIdx === 0 && (field.key === 'denominacionMercaderia' || field.key === 'corte')) return null;

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
                                    {(field.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : field.type === 'textarea' ? (
                                <Textarea value={editForm[field.key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))} className="text-xs min-h-[60px]" rows={2} />
                              ) : (
                                <Input type={field.type} step={field.step} value={editForm[field.key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))} className="h-8 text-xs" />
                              )}
                            </div>
                            {edited && (
                              <button type="button" title="Restaurar valor original" className="mt-5 shrink-0" onClick={() => handleResetField(field.key)}>
                                <RotateCcw className="h-3.5 w-3.5 text-amber-500 hover:text-amber-700" />
                              </button>
                            )}
                          </div>
                        );
                      }
                      // Read-only mode
                      const val = (selected as unknown as Record<string, unknown>)[field.key];
                      let displayVal: string;
                      if (field.type === 'datetime-local') {
                        displayVal = fdt(val as string | null | undefined);
                      } else {
                        displayVal = val !== null && val !== undefined ? String(val) : '-';
                      }
                      return (
                        <div key={field.key} className="flex justify-between gap-4 py-1">
                          <span className="text-slate-500 text-xs shrink-0">{field.label}</span>
                          <span className={`text-right text-xs font-medium break-all ${edited ? 'text-amber-700' : 'text-slate-800'}`}>{displayVal}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Multi-line Productos y Corte section after first section in edit mode */}
                  {editMode && sIdx === 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />Productos y Corte
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={addDetailLinea}
                        >
                          <Plus className="h-3 w-3" />Agregar linea
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {detailLineas.map((linea, idx) => (
                          <div key={linea.id} className="flex items-center gap-2 p-2 bg-emerald-50/60 border border-emerald-200/60 rounded-lg">
                            <span className="text-[10px] text-slate-400 w-4 shrink-0 text-center font-mono">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] text-slate-400 block mb-0.5">Producto</label>
                              <Input value={linea.producto} onChange={e => updateDetailLinea(linea.id, 'producto', e.target.value)} placeholder="Producto..." className="h-7 text-xs" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] text-slate-400 block mb-0.5">Corte</label>
                              <Input value={linea.corte} onChange={e => updateDetailLinea(linea.id, 'corte', e.target.value)} placeholder="Corte..." className="h-7 text-xs" />
                            </div>
                            <div className="w-20 shrink-0">
                              <label className="text-[10px] text-slate-400 block mb-0.5">Cajas</label>
                              <Input type="number" min="0" value={linea.cajas === '' ? '' : linea.cajas} onChange={e => updateDetailLinea(linea.id, 'cajas', e.target.value)} placeholder="0" className="h-7 text-xs text-right font-mono" />
                            </div>
                            {detailLineas.length > 1 && (
                              <button type="button" className="mt-4 shrink-0 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" onClick={() => removeDetailLinea(linea.id)} title="Quitar linea">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {detailLineas.length > 1 && (
                          <div className="flex justify-end pt-1 pr-1">
                            <span className="text-xs font-medium text-emerald-700">
                              Total cajas: {detailLineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0).toLocaleString('es-UY')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Read-only: show lineas if they exist */}
                  {!editMode && sIdx === 0 && (selected as any).lineas && ((selected as any).lineas as ProductoCorteLine[]).length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Productos y Corte</p>
                      {((selected as any).lineas as ProductoCorteLine[]).map((l, i) => (
                        <div key={l.id || i} className="flex items-center gap-3 py-1 text-xs">
                          <span className="text-slate-400 font-mono w-4 text-center">{i + 1}</span>
                          <span className="flex-1 text-slate-800">{l.producto || '-'}</span>
                          <span className="text-slate-600">{l.corte || '-'}</span>
                          <span className="font-mono text-emerald-700 w-16 text-right">{typeof l.cajas === 'number' ? l.cajas.toLocaleString('es-UY') : '-'}</span>
                          <span className="text-slate-400 text-[10px]">cajas</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}