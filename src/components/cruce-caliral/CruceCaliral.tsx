'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, ChevronLeft, ChevronRight, Eye, Download, ArrowLeftRight, AlertTriangle, CheckCircle2, Link2, Unlink, PackageMinus, Pencil, Save, Plus, Trash2, RotateCcw } from 'lucide-react';

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
  [key: string]: unknown;
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
  totalEnvasesIngreso: number;
  totalKgIngreso: number;
  envasesExp: number;
  kgExp: number;
  diffEnvases: number;
  isManualLink?: boolean;
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
  pesoBruto: number;
  envases: number;
  cortes: string[];
}

// --- Edit types ---
interface ManualCoteLink { cote: string; cajas: number; }

interface ExportEdit {
  nroCote?: string;
  nroTramite?: number;
  fechaTramite?: string;
  paisDestino?: string;
  denominacionMercaderia?: string;
  corte?: string;
  pesoNeto?: number | null;
  pesoBruto?: number | null;
  cantidadEnvases?: number | null;
  contenedorSerieNro?: string;
  nroCertificadoSanitario?: string;
  observaciones?: string;
  tipoTransporte?: string;
  nombreEstablecimientoCertif?: string;
  precinto1?: string;
  matriculaCamion?: string;
  manualCotes?: ManualCoteLink[];
}

interface IngresoEdit {
  envases?: number;
  pesoNeto?: number;
  pesoBruto?: number;
  producto?: string;
}

interface ManualIngreso {
  cote: string;
  tramite: number;
  fecha: string;
  producto: string;
  cortes: string[];
  pesoNeto: number;
  pesoBruto: number;
  envases: number;
}

interface ManualExportacion {
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
  observaciones: string | null;
}

interface EditsStore {
  exports: Record<string, ExportEdit>;
  ingresos: Record<string, IngresoEdit>;
  ingresosManuales: ManualIngreso[];
  exportacionesManuales: ManualExportacion[];
}

const EDITS_KEY = 'cruce_caliral_edits';

function loadEdits(): EditsStore {
  const def: EditsStore = { exports: {}, ingresos: {}, ingresosManuales: [], exportacionesManuales: [] };
  if (typeof window === 'undefined') return def;
  try {
    const raw = localStorage.getItem(EDITS_KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return def;
}

function saveEdits(edits: EditsStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
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
    cache.shipments = allShipments.filter(s => (s.nombreEstablecimientoDestino || '').toLowerCase().includes('caliral'));
    cache.exports = allExports;
    cache.loaded = true;
  }
}

function extractIngresoCotes(obs: string | null | undefined, exportCote: string): string[] {
  if (!obs) return [];
  const allP = obs.match(/P\d{4,6}/g) || [];
  return allP.filter(c => c !== exportCote);
}

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

// Apply edits to raw data
function applyExportEdit(exp: ExpRecord, edit: ExportEdit): ExpRecord {
  const e = { ...exp };
  if (edit.nroCote !== undefined) e.nroCote = edit.nroCote;
  if (edit.nroTramite !== undefined) e.nroTramite = edit.nroTramite;
  if (edit.fechaTramite !== undefined) e.fechaTramite = edit.fechaTramite;
  if (edit.paisDestino !== undefined) e.paisDestino = edit.paisDestino;
  if (edit.denominacionMercaderia !== undefined) e.denominacionMercaderia = edit.denominacionMercaderia;
  if (edit.corte !== undefined) e.corte = edit.corte;
  if (edit.pesoNeto !== undefined) e.pesoNeto = edit.pesoNeto;
  if (edit.pesoBruto !== undefined) e.pesoBruto = edit.pesoBruto;
  if (edit.cantidadEnvases !== undefined) e.cantidadEnvases = edit.cantidadEnvases;
  if (edit.contenedorSerieNro !== undefined) e.contenedorSerieNro = edit.contenedorSerieNro;
  if (edit.nroCertificadoSanitario !== undefined) e.nroCertificadoSanitario = edit.nroCertificadoSanitario;
  if (edit.observaciones !== undefined) e.observaciones = edit.observaciones;
  if (edit.tipoTransporte !== undefined) e.tipoTransporte = edit.tipoTransporte;
  if (edit.nombreEstablecimientoCertif !== undefined) e.nombreEstablecimientoCertif = edit.nombreEstablecimientoCertif;
  if (edit.precinto1 !== undefined) e.precinto1 = edit.precinto1;
  if (edit.matriculaCamion !== undefined) e.matriculaCamion = edit.matriculaCamion;
  return e;
}

function applyIngresoEdit(agg: IngresoAgg, edit: IngresoEdit): IngresoAgg {
  const a = { ...agg };
  if (edit.envases !== undefined) a.envases = edit.envases;
  if (edit.pesoNeto !== undefined) a.pesoNeto = edit.pesoNeto;
  if (edit.pesoBruto !== undefined) a.pesoBruto = edit.pesoBruto;
  if (edit.producto !== undefined) a.producto = edit.producto;
  return a;
}

// --- Label component for edit form ---
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{children}</label>;
}

// --- Inline row for SinCruce with quick COTE linking ---
function SinCruceInlineRow({ row, ingresoMap, edits, onSaved, onEditFull, isEditedFlag }: {
  row: SinCruceRow;
  ingresoMap: Map<string, IngresoAgg>;
  edits: EditsStore;
  onSaved: (edits: EditsStore) => void;
  onEditFull: () => void;
  isEditedFlag: boolean;
}) {
  const [expanding, setExpanding] = useState(false);
  const [newCote, setNewCote] = useState('');
  const [newCajas, setNewCajas] = useState('');

  const currentManualCotes = edits.exports[row.exp.id]?.manualCotes || [];

  const existingCotesInCaliral = [...ingresoMap.keys()].sort();

  const handleQuickAdd = () => {
    const cote = newCote.trim().toUpperCase();
    const cajas = parseInt(newCajas) || 0;
    if (!cote || cajas <= 0) return;
    if (currentManualCotes.some(c => c.cote === cote)) return;

    const updated = [...currentManualCotes, { cote, cajas }];
    const newEdits: EditsStore = {
      ...edits,
      exports: {
        ...edits.exports,
        [row.exp.id]: { ...edits.exports[row.exp.id], manualCotes: updated },
      },
    };
    onSaved(newEdits);
    setNewCote('');
    setNewCajas('');
  };

  const handleRemoveCote = (cote: string) => {
    const updated = currentManualCotes.filter(c => c.cote !== cote);
    const newEdits: EditsStore = { ...edits };
    if (updated.length > 0) {
      newEdits.exports = { ...newEdits.exports, [row.exp.id]: { ...newEdits.exports[row.exp.id], manualCotes: updated } };
    } else {
      const existing = { ...newEdits.exports[row.exp.id] };
      delete existing.manualCotes;
      if (Object.keys(existing).length > 0) {
        newEdits.exports = { ...newEdits.exports, [row.exp.id]: existing };
      } else {
        const { [row.exp.id]: _, ...rest } = newEdits.exports;
        newEdits.exports = rest;
      }
    }
    onSaved(newEdits);
  };

  return (
    <>
      <tr className={`border-b hover:bg-amber-50/40 ${isEditedFlag ? 'bg-violet-50/30' : ''}`}>
        <td className="px-3 py-2.5 text-xs font-mono font-medium text-amber-700">{row.exp.nroCote}</td>
        <td className="px-3 py-2.5 text-xs font-mono">{row.exp.nroTramite}</td>
        <td className="px-3 py-2.5 text-xs">{fd(row.exp.fechaTramite)}</td>
        <td className="px-3 py-2.5 text-xs">{row.exp.paisDestino}</td>
        <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{row.exp.denominacionMercaderia}</td>
        <td className="px-3 py-2.5 text-xs text-right font-mono font-medium">{(row.exp.cantidadEnvases || 0).toLocaleString('es-UY')}</td>
        <td className="px-3 py-2.5 text-xs text-right font-mono hidden md:table-cell">{(row.exp.pesoNeto || 0).toLocaleString('es-UY')}</td>
        <td className="px-3 py-2.5 text-center">
          {currentManualCotes.length > 0 ? (
            <div className="flex flex-wrap gap-1 justify-center">
              {currentManualCotes.map(mc => {
                const found = ingresoMap.get(mc.cote);
                return (
                  <span key={mc.cote} className={`inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded ${found ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                    {mc.cote} <span className="opacity-60">({mc.cajas})</span>
                    <button className="ml-0.5 hover:text-red-600" onClick={() => handleRemoveCote(mc.cote)}><X className="h-2.5 w-2.5" /></button>
                  </span>
                );
              })}
              <button className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1" onClick={() => setExpanding(!expanding)}>
                {expanding ? 'cerrar' : '+ mas'}
              </button>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2.5 py-1 rounded-md transition-colors"
              onClick={() => setExpanding(!expanding)}
            >
              <Plus className="h-3 w-3" />Vincular COTE
            </button>
          )}
        </td>
      </tr>
      {expanding && (
        <tr className="border-b bg-violet-50/50">
          <td colSpan={8} className="px-3 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[140px]">
                <FieldLabel>COTE de Ingreso</FieldLabel>
                <Input
                  placeholder="Ej: P12345"
                  value={newCote}
                  onChange={e => setNewCote(e.target.value.toUpperCase())}
                  className="h-8 text-xs font-mono"
                  list={`cote-sug-${row.exp.id}`}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(); } }}
                />
                <datalist id={`cote-sug-${row.exp.id}`}>
                  {existingCotesInCaliral.filter(c => !currentManualCotes.some(mc => mc.cote === c)).map(c => (
                    <option key={c} value={c}>{c} — {ingresoMap.get(c)?.producto || ''} ({ingresoMap.get(c)?.envases || 0} cajas)</option>
                  ))}
                </datalist>
              </div>
              <div className="w-[90px]">
                <FieldLabel>Cajas</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={newCajas}
                  onChange={e => setNewCajas(e.target.value)}
                  className="h-8 text-xs font-mono"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(); } }}
                />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={handleQuickAdd} disabled={!newCote.trim() || !(parseInt(newCajas) > 0)}>
                <Plus className="h-3 w-3 mr-1" />Agregar
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onEditFull}>
                <Pencil className="h-3 w-3 mr-1" />Editar todo
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setExpanding(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {currentManualCotes.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                <span>Total vinculacion manual: <b>{currentManualCotes.reduce((s, c) => s + c.cajas, 0)}</b> cajas ingreso</span>
                <span className="text-slate-300">|</span>
                <span>Cajas exp.: <b>{row.exp.cantidadEnvases || 0}</b></span>
                <span className="text-slate-300">|</span>
                <span>Diff: <b className={currentManualCotes.reduce((s, c) => s + c.cajas, 0) - (row.exp.cantidadEnvases || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}>{(currentManualCotes.reduce((s, c) => s + c.cajas, 0) - (row.exp.cantidadEnvases || 0)).toLocaleString('es-UY')}</b></span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// --- Component ---
export default function CruceCaliral() {
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'cruce' | 'sincruce' | 'pendientes'>('cruce');

  const [search, setSearch] = useState('');
  const [pais, setPais] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [page, setPage] = useState(1);
  const limit = 20;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<CruceRow | SinCruceRow | IngresoPendienteRow | null>(null);

  const [paises, setPaises] = useState<string[]>([]);

  const [ingresoMap, setIngresoMap] = useState<Map<string, IngresoAgg>>(new Map());
  const [cruceRows, setCruceRows] = useState<CruceRow[]>([]);
  const [sinCruceRows, setSinCruceRows] = useState<SinCruceRow[]>([]);
  const [pendienteRows, setPendienteRows] = useState<IngresoPendienteRow[]>([]);

  // --- Edit state ---
  const [edits, setEdits] = useState<EditsStore>({ exports: {}, ingresos: {}, ingresosManuales: [], exportacionesManuales: [] });
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ type: 'export' | 'ingreso'; id: string; row?: CruceRow | SinCruceRow | IngresoPendienteRow } | null>(null);

  // Export edit form state
  const [ef_nroCote, setEf_nroCote] = useState('');
  const [ef_nroTramite, setEf_nroTramite] = useState('');
  const [ef_pais, setEf_pais] = useState('');
  const [ef_producto, setEf_producto] = useState('');
  const [ef_corte, setEf_corte] = useState('');
  const [ef_cajas, setEf_cajas] = useState('');
  const [ef_pesoNeto, setEf_pesoNeto] = useState('');
  const [ef_pesoBruto, setEf_pesoBruto] = useState('');
  const [ef_contenedor, setEf_contenedor] = useState('');
  const [ef_certSanitario, setEf_certSanitario] = useState('');
  const [ef_observaciones, setEf_observaciones] = useState('');
  const [ef_transporte, setEf_transporte] = useState('');
  const [ef_estabCertif, setEf_estabCertif] = useState('');
  const [ef_precinto, setEf_precinto] = useState('');
  const [ef_matricula, setEf_matricula] = useState('');
  const [ef_manualCotes, setEf_manualCotes] = useState<ManualCoteLink[]>([]);
  const [ef_newCote, setEf_newCote] = useState('');
  const [ef_newCoteCajas, setEf_newCoteCajas] = useState('');

  // Ingreso edit form state
  const [ei_cajas, setEi_cajas] = useState('');
  const [ei_pesoNeto, setEi_pesoNeto] = useState('');
  const [ei_pesoBruto, setEi_pesoBruto] = useState('');
  const [ei_producto, setEi_producto] = useState('');

  // New manual ingreso form state
  const [addIngresoOpen, setAddIngresoOpen] = useState(false);
  const [ni_cote, setNi_cote] = useState('');
  const [ni_tramite, setNi_tramite] = useState('');
  const [ni_fecha, setNi_fecha] = useState('');
  const [ni_producto, setNi_producto] = useState('');
  const [ni_cajas, setNi_cajas] = useState('');
  const [ni_pesoNeto, setNi_pesoNeto] = useState('');
  const [ni_pesoBruto, setNi_pesoBruto] = useState('');

  // New manual export form state
  const [addExpOpen, setAddExpOpen] = useState(false);
  const [ne_nroCote, setNe_nroCote] = useState('');
  const [ne_nroTramite, setNe_nroTramite] = useState('');
  const [ne_fecha, setNe_fecha] = useState('');
  const [ne_pais, setNe_pais] = useState('');
  const [ne_producto, setNe_producto] = useState('');
  const [ne_corte, setNe_corte] = useState('');
  const [ne_cajas, setNe_cajas] = useState('');
  const [ne_pesoNeto, setNe_pesoNeto] = useState('');

  // Recompute cruce when edits change
  const recomputeCruce = useCallback((editsData: EditsStore) => {
    if (!cache.loaded) return;
    const iMap = aggregateByCote(cache.shipments);
    // Apply ingreso edits
    for (const [cote, edit] of Object.entries(editsData.ingresos)) {
      const agg = iMap.get(cote);
      if (agg) iMap.set(cote, applyIngresoEdit(agg, edit));
    }
    // Add manual ingresos
    for (const mi of editsData.ingresosManuales || []) {
      if (!iMap.has(mi.cote)) {
        iMap.set(mi.cote, {
          cote: mi.cote, tramite: mi.tramite, fecha: mi.fecha,
          producto: mi.producto, cortes: mi.cortes || [],
          pesoNeto: mi.pesoNeto, pesoBruto: mi.pesoBruto, envases: mi.envases,
          lineCount: 1, lines: [],
        });
      }
    }
    setIngresoMap(iMap);

    // Apply export edits to cache exports + manual exportaciones
    const manualExps = (editsData.exportacionesManuales || []).map(me => ({
      ...me,
      id: me.id || `manual-${me.nroCote}`,
      tipoTransporte: null, contenedorSerieNro: null, nroCertificadoSanitario: null,
      nombreEstablecimientoCertif: null, precinto1: null, matriculaCamion: null,
      fechaEmitidoCote: null, fechaInicioProduccion: null, fechaFinProduccion: null,
      fechaInicioCongelacion: null, fechaFinCongelacion: null,
    }));
    const editedExports = [...cache.exports.map(e => {
      const edit = editsData.exports[e.id];
      return edit ? applyExportEdit(e, edit) : e;
    }), ...manualExps];

    const cruces: CruceRow[] = [];
    const sinCruce: SinCruceRow[] = [];
    const referencedCotes = new Set<string>();

    for (const exp of editedExports) {
      const exportEdit = editsData.exports[exp.id];
      const obs = exp.observaciones || '';

      // Determine ingreso COTEs: manual links override observaciones extraction
      let cotesWithCajas: ManualCoteLink[] = [];
      let isManual = false;

      if (exportEdit?.manualCotes && exportEdit.manualCotes.length > 0) {
        cotesWithCajas = exportEdit.manualCotes;
        isManual = true;
      } else {
        const refs = extractIngresoCotes(obs, exp.nroCote);
        cotesWithCajas = refs.map(c => ({ cote: c, cajas: 0 })); // cajas=0 means use aggregate
      }

      const foundInCaliral = cotesWithCajas.filter(c => iMap.has(c.cote));
      const notInCaliral = cotesWithCajas.filter(c => !iMap.has(c.cote));

      if (foundInCaliral.length > 0) {
        const aggs = foundInCaliral.map(c => iMap.get(c.cote)!);
        const totalEnvasesIngreso = isManual
          ? foundInCaliral.reduce((s, c) => s + c.cajas, 0)
          : aggs.reduce((s, a) => s + a.envases, 0);
        const totalKgIngreso = aggs.reduce((s, a) => s + a.pesoNeto, 0);
        const envasesExp = exp.cantidadEnvases || 0;
        const kgExp = exp.pesoNeto || 0;
        cruces.push({
          exp,
          ingresoCotes: foundInCaliral.map(c => c.cote),
          ingresoCotesNotFound: notInCaliral.map(c => c.cote),
          ingresoAgg: aggs,
          totalEnvasesIngreso,
          totalKgIngreso,
          envasesExp,
          kgExp,
          diffEnvases: totalEnvasesIngreso - envasesExp,
          isManualLink: isManual,
        });
        foundInCaliral.forEach(c => referencedCotes.add(c.cote));
      } else {
        const obsPreview = obs ? obs.substring(0, 120) : '';
        sinCruce.push({ exp, obsPreview });
      }
    }

    const pendientes: IngresoPendienteRow[] = [];
    for (const [cote, agg] of iMap) {
      if (!referencedCotes.has(cote)) {
        pendientes.push({
          cote, tramite: agg.tramite, fecha: agg.fecha,
          producto: agg.producto, pesoNeto: agg.pesoNeto,
          pesoBruto: agg.pesoBruto, envases: agg.envases, cortes: agg.cortes,
        });
      }
    }

    setCruceRows(cruces.sort((a, b) => b.exp.fechaTramite.localeCompare(a.exp.fechaTramite)));
    setSinCruceRows(sinCruce.sort((a, b) => b.exp.fechaTramite.localeCompare(a.exp.fechaTramite)));
    setPendienteRows(pendientes.sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setPaises([...new Set(editedExports.map(e => e.paisDestino).filter(Boolean))].sort());
  }, []);

  useEffect(() => {
    (async () => {
      await ensureData();
      const loadedEdits = loadEdits();
      setEdits(loadedEdits);
      recomputeCruce(loadedEdits);
      setLoading(false);
    })();
  }, [recomputeCruce]);

  // --- Edit handlers ---
  const openExportEdit = (row: CruceRow | SinCruceRow) => {
    const exp = row.exp;
    const edit = edits.exports[exp.id];
    setEditTarget({ type: 'export', id: exp.id, row });
    setEf_nroCote(exp.nroCote || '');
    setEf_nroTramite(String(exp.nroTramite || ''));
    setEf_pais(exp.paisDestino || '');
    setEf_producto(exp.denominacionMercaderia || '');
    setEf_corte(exp.corte || '');
    setEf_cajas(exp.cantidadEnvases != null ? String(exp.cantidadEnvases) : '');
    setEf_pesoNeto(exp.pesoNeto != null ? String(exp.pesoNeto) : '');
    setEf_pesoBruto(exp.pesoBruto != null ? String(exp.pesoBruto) : '');
    setEf_contenedor(exp.contenedorSerieNro || '');
    setEf_certSanitario(exp.nroCertificadoSanitario || '');
    setEf_observaciones(exp.observaciones || '');
    setEf_transporte(exp.tipoTransporte || '');
    setEf_estabCertif(exp.nombreEstablecimientoCertif || '');
    setEf_precinto(exp.precinto1 || '');
    setEf_matricula(exp.matriculaCamion || '');
    setEf_newCote('');
    setEf_newCoteCajas('');

    if (edit?.manualCotes && edit.manualCotes.length > 0) {
      setEf_manualCotes([...edit.manualCotes]);
    } else {
      setEf_manualCotes([]);
    }
    setEditOpen(true);
  };

  const openIngresoEdit = (row: IngresoPendienteRow) => {
    const edit = edits.ingresos[row.cote];
    setEditTarget({ type: 'ingreso', id: row.cote, row });
    setEi_cajas(edit?.envases !== undefined ? String(edit.envases) : String(row.envases));
    setEi_pesoNeto(edit?.pesoNeto !== undefined ? String(edit.pesoNeto) : String(row.pesoNeto));
    setEi_pesoBruto(edit?.pesoBruto !== undefined ? String(edit.pesoBruto) : String(row.pesoBruto));
    setEi_producto(edit?.producto !== undefined ? edit.producto : row.producto);
    setEditOpen(true);
  };

  const addManualCote = () => {
    const cote = ef_newCote.trim().toUpperCase();
    const cajas = parseInt(ef_newCoteCajas) || 0;
    if (!cote || cajas <= 0) return;
    if (ef_manualCotes.some(c => c.cote === cote)) return;
    setEf_manualCotes(prev => [...prev, { cote, cajas }]);
    setEf_newCote('');
    setEf_newCoteCajas('');
  };

  const removeManualCote = (cote: string) => {
    setEf_manualCotes(prev => prev.filter(c => c.cote !== cote));
  };

  const saveExportEdit = () => {
    if (!editTarget || editTarget.type !== 'export') return;
    const exp = (editTarget.row as CruceRow | SinCruceRow).exp;
    const newEdit: ExportEdit = {};
    // Only save fields that differ from original
    if (ef_nroCote !== exp.nroCote) newEdit.nroCote = ef_nroCote;
    if (parseInt(ef_nroTramite) !== exp.nroTramite) newEdit.nroTramite = parseInt(ef_nroTramite) || exp.nroTramite;
    if (ef_pais !== exp.paisDestino) newEdit.paisDestino = ef_pais;
    if (ef_producto !== exp.denominacionMercaderia) newEdit.denominacionMercaderia = ef_producto;
    if (ef_corte !== exp.corte) newEdit.corte = ef_corte;
    const cajasVal = ef_cajas ? parseInt(ef_cajas) : null;
    if (cajasVal !== exp.cantidadEnvases) newEdit.cantidadEnvases = cajasVal;
    const pnVal = ef_pesoNeto ? parseFloat(ef_pesoNeto) : null;
    if (pnVal !== exp.pesoNeto) newEdit.pesoNeto = pnVal;
    const pbVal = ef_pesoBruto ? parseFloat(ef_pesoBruto) : null;
    if (pbVal !== exp.pesoBruto) newEdit.pesoBruto = pbVal;
    if (ef_contenedor !== (exp.contenedorSerieNro || '')) newEdit.contenedorSerieNro = ef_contenedor;
    if (ef_certSanitario !== (exp.nroCertificadoSanitario || '')) newEdit.nroCertificadoSanitario = ef_certSanitario;
    if (ef_observaciones !== (exp.observaciones || '')) newEdit.observaciones = ef_observaciones;
    if (ef_transporte !== (exp.tipoTransporte || '')) newEdit.tipoTransporte = ef_transporte;
    if (ef_estabCertif !== (exp.nombreEstablecimientoCertif || '')) newEdit.nombreEstablecimientoCertif = ef_estabCertif;
    if (ef_precinto !== (exp.precinto1 || '')) newEdit.precinto1 = ef_precinto;
    if (ef_matricula !== (exp.matriculaCamion || '')) newEdit.matriculaCamion = ef_matricula;
    if (ef_manualCotes.length > 0) newEdit.manualCotes = ef_manualCotes;

    const newEdits = { ...edits };
    if (Object.keys(newEdit).length > 0) {
      newEdits.exports = { ...newEdits.exports, [exp.id]: newEdit };
    } else {
      const { [exp.id]: _, ...rest } = newEdits.exports;
      newEdits.exports = rest;
    }
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    setEditOpen(false);
  };

  const saveIngresoEdit = () => {
    if (!editTarget || editTarget.type !== 'ingreso') return;
    const row = editTarget.row as IngresoPendienteRow;
    const agg = ingresoMap.get(row.cote);
    if (!agg) return;
    const newEdit: IngresoEdit = {};
    const cajasVal = parseInt(ei_cajas) || 0;
    if (cajasVal !== agg.envases) newEdit.envases = cajasVal;
    const pnVal = parseFloat(ei_pesoNeto) || 0;
    if (pnVal !== agg.pesoNeto) newEdit.pesoNeto = pnVal;
    const pbVal = parseFloat(ei_pesoBruto) || 0;
    if (pbVal !== agg.pesoBruto) newEdit.pesoBruto = pbVal;
    if (ei_producto !== agg.producto) newEdit.producto = ei_producto;

    const newEdits = { ...edits };
    if (Object.keys(newEdit).length > 0) {
      newEdits.ingresos = { ...newEdits.ingresos, [row.cote]: newEdit };
    } else {
      const { [row.cote]: _, ...rest } = newEdits.ingresos;
      newEdits.ingresos = rest;
    }
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    setEditOpen(false);
  };

  const clearExportEdit = () => {
    if (!editTarget || editTarget.type !== 'export') return;
    const exp = (editTarget.row as CruceRow | SinCruceRow).exp;
    const newEdits = { ...edits };
    const { [exp.id]: _, ...rest } = newEdits.exports;
    newEdits.exports = rest;
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    setEditOpen(false);
  };

  const clearIngresoEdit = () => {
    if (!editTarget || editTarget.type !== 'ingreso') return;
    const cote = editTarget.id;
    const newEdits = { ...edits };
    const { [cote]: _, ...rest } = newEdits.ingresos;
    newEdits.ingresos = rest;
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    setEditOpen(false);
  };

  const saveNewIngreso = () => {
    const cote = ni_cote.trim().toUpperCase();
    if (!cote) return;
    const newIngreso: ManualIngreso = {
      cote,
      tramite: parseInt(ni_tramite) || 0,
      fecha: ni_fecha ? new Date(ni_fecha).toISOString() : new Date().toISOString(),
      producto: ni_producto,
      cortes: [],
      envases: parseInt(ni_cajas) || 0,
      pesoNeto: parseFloat(ni_pesoNeto) || 0,
      pesoBruto: parseFloat(ni_pesoBruto) || 0,
    };
    const newEdits: EditsStore = {
      ...edits,
      ingresosManuales: [...(edits.ingresosManuales || []), newIngreso],
    };
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    setAddIngresoOpen(false);
    setNi_cote(''); setNi_tramite(''); setNi_fecha('');
    setNi_producto(''); setNi_cajas(''); setNi_pesoNeto(''); setNi_pesoBruto('');
  };

  const saveNewExp = () => {
    const cote = ne_nroCote.trim().toUpperCase();
    if (!cote) return;
    const newExp: ManualExportacion = {
      id: `manual-${cote}-${Date.now()}`,
      nroTramite: parseInt(ne_nroTramite) || 0,
      fechaTramite: ne_fecha ? new Date(ne_fecha).toISOString() : new Date().toISOString(),
      nroCote: cote,
      paisDestino: ne_pais,
      denominacionMercaderia: ne_producto,
      corte: ne_corte,
      pesoNeto: ne_pesoNeto ? parseFloat(ne_pesoNeto) : null,
      pesoBruto: null,
      cantidadEnvases: ne_cajas ? parseInt(ne_cajas) : null,
      observaciones: null,
    };
    const newEdits: EditsStore = {
      ...edits,
      exportacionesManuales: [...(edits.exportacionesManuales || []), newExp],
    };
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    setAddExpOpen(false);
    setNe_nroCote(''); setNe_nroTramite(''); setNe_fecha('');
    setNe_pais(''); setNe_producto(''); setNe_corte('');
    setNe_cajas(''); setNe_pesoNeto('');
  };

  const hasEditsCount = Object.keys(edits.exports).length + Object.keys(edits.ingresos).length + (edits.ingresosManuales?.length || 0) + (edits.exportacionesManuales?.length || 0);

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

  const stats = useMemo(() => {
    const totalIngresoEnvases = [...ingresoMap.values()].reduce((s, a) => s + a.envases, 0);
    const totalIngresoKg = [...ingresoMap.values()].reduce((s, a) => s + a.pesoNeto, 0);
    const totalCruceExpEnvases = cruceRows.reduce((s, r) => s + r.envasesExp, 0);
    const totalCruceIngresoEnvases = cruceRows.reduce((s, r) => s + r.totalEnvasesIngreso, 0);
    const totalSinCruceEnvases = sinCruceRows.reduce((s, r) => s + (r.exp.cantidadEnvases || 0), 0);
    const pendienteEnvases = pendienteRows.reduce((s, r) => s + r.envases, 0);
    const conProblema = cruceRows.filter(r => r.diffEnvases < 0).length;
    return {
      totalIngresoEnvases, totalIngresoKg,
      totalIngresos: ingresoMap.size,
      exportConCruce: cruceRows.length,
      exportSinCruce: sinCruceRows.length,
      totalCruceExpEnvases, totalCruceIngresoEnvases, totalSinCruceEnvases,
      pendienteCount: pendienteRows.length, pendienteEnvases,
      cotesVinculados: new Set(cruceRows.flatMap(r => r.ingresoCotes)).size,
      conProblema,
    };
  }, [ingresoMap, cruceRows, sinCruceRows, pendienteRows]);

  const clearFilters = useCallback(() => { setSearch(''); setPais(''); setFechaDesde(''); setFechaHasta(''); }, []);
  const hasFilters = search || pais || fechaDesde || fechaHasta;
  const detailType = detailRow ? ('exp' in detailRow ? ('ingresoCotes' in detailRow ? 'cruce' : 'sincruce') : 'pendiente') : null;

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const cruceSheet = cruceRows.map(r => ({
      'COTE Export': r.exp.nroCote,
      'Tramite Export': r.exp.nroTramite,
      'Fecha Export': r.exp.fechaTramite?.split('T')[0] || '',
      'Pais': r.exp.paisDestino,
      'Producto Export': r.exp.denominacionMercaderia,
      'Cajas Exportadas': r.envasesExp,
      'Kg Exportados': r.kgExp,
      'COTEs de Ingreso': r.ingresoCotes.join(', '),
      'Tramites Ingreso': r.ingresoAgg.map(a => a.tramite).join(', '),
      'Cortes Ingreso': r.ingresoAgg.flatMap(a => a.cortes).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      'Cajas Ingresadas': r.totalEnvasesIngreso,
      'Kg Ingresados': r.totalKgIngreso,
      'Diferencia Cajas': r.diffEnvases,
      'Vinculacion': r.isManualLink ? 'Manual' : 'Automatica (observaciones)',
      'Estado': r.diffEnvases < 0 ? 'ERROR: mas cajas exportadas que ingresadas' : r.diffEnvases === 0 ? 'OK' : 'Sobran cajas ingresadas (normal)',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cruceSheet), 'Con Cruce');

    const sinSheet = sinCruceRows.map(r => ({
      'COTE': r.exp.nroCote,
      'Tramite': r.exp.nroTramite,
      'Fecha': r.exp.fechaTramite?.split('T')[0] || '',
      'Pais': r.exp.paisDestino,
      'Producto': r.exp.denominacionMercaderia,
      'Cajas': r.exp.cantidadEnvases || 0,
      'Kg': r.exp.pesoNeto || 0,
      'Observaciones': r.obsPreview,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sinSheet), 'Sin Cruce');

    const pendSheet = pendienteRows.map(r => ({
      'COTE': r.cote,
      'Tramite': r.tramite,
      'Fecha': r.fecha?.split('T')[0] || '',
      'Producto': r.producto,
      'Cajas': r.envases,
      'Kg Neto': r.pesoNeto,
      'Kg Bruto': r.pesoBruto,
      'Cortes': r.cortes.join(', '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendSheet), 'Pendientes');

    XLSX.writeFile(wb, `cruce_caliral_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  function diffBadgeEnvases(diff: number) {
    if (diff === 0) return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />0</span>;
    if (diff < 0) {
      return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><PackageMinus className="h-3 w-3" />{diff} cajas</span>;
    }
    return <span className="inline-flex items-center text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">+{diff} cajas</span>;
  }

  const isEdited = (type: 'export' | 'ingreso', id: string) => type === 'export' ? !!edits.exports[id] : !!edits.ingresos[id];

  if (loading) return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">Cruce Caliral</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-orange-600" />
          Cruce Caliral
          <span className="text-sm font-normal text-slate-400 ml-2">Trazabilidad por cajas (envases)</span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Exportar Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-50"><ArrowLeftRight className="h-5 w-5 text-emerald-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Ingresos Caliral</p><p className="text-lg font-bold">{stats.totalIngresos}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalIngresoEnvases)} cajas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-50"><Link2 className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">COTEs Vinculados</p><p className="text-lg font-bold">{stats.cotesVinculados}</p><p className="text-[10px] text-slate-400">de {stats.totalIngresos} ingresos</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-sky-50"><CheckCircle2 className="h-5 w-5 text-sky-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Exports con cruce</p><p className="text-lg font-bold">{stats.exportConCruce}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalCruceExpEnvases)} cajas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-50"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Exports sin COTE</p><p className="text-lg font-bold">{stats.exportSinCruce}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalSinCruceEnvases)} cajas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-50"><Unlink className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Ingresos pendientes</p><p className="text-lg font-bold">{stats.pendienteCount}</p><p className="text-[10px] text-slate-400">{fmt(stats.pendienteEnvases)} cajas</p></div>
        </CardContent></Card>
        <Card><CardContent className={`p-4 flex items-center gap-3 ${stats.conProblema > 0 ? 'ring-2 ring-red-200' : ''}`}>
          <div className={`p-3 rounded-xl ${stats.conProblema > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            {stats.conProblema > 0 ? <PackageMinus className="h-5 w-5 text-red-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          </div>
          <div><p className="text-[10px] text-slate-500 uppercase">Con diferencia</p><p className={`text-lg font-bold ${stats.conProblema > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{stats.conProblema}</p><p className="text-[10px] text-slate-400">mas cajas exp. que ing.</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-50"><span className="text-sm font-bold text-violet-600">%</span></div>
          <div><p className="text-[10px] text-slate-500 uppercase">Cobertura cruce</p><p className="text-lg font-bold">
            {stats.totalIngresos > 0 ? ((stats.cotesVinculados / stats.totalIngresos) * 100).toFixed(0) : 0}%
          </p><p className="text-[10px] text-slate-400">COTEs vinculados</p></div>
        </CardContent></Card>
      </div>

      {/* Info banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700 mb-1">Como funciona el cruce</p>
        <p>Se extraen los COTEs de ingreso desde las <b>observaciones</b> de cada exportacion. Se comparan las <b>cajas (envases)</b> exportadas contra las cajas que ingresaron con esos COTEs a Caliral. La diferencia negativa (roja) indica que se exportaron mas cajas de las que ingresaron, lo cual es un error. La diferencia positiva (azul) es normal: significa que no todas las cajas de esos COTEs fueron en esa exportacion (pueden ir en otra o estar pendientes). La mayoria de las exportaciones no tienen COTE de ingreso en observaciones, por lo que aparecen en &quot;Sin COTE de ingreso&quot;. <b>Podes editar cualquier registro haciendo click en el lapiz</b>. Las ediciones se guardan en el navegador.</p>
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
              placeholder={subTab === 'pendientes' ? 'Buscar COTE, tramite, producto...' : 'Buscar tramite, COTE, pais, producto...'}
              value={search} onChange={e => setSearch(e.target.value)} className="pl-9"
            />
          </div>
          {subTab !== 'pendientes' && (
            <Select value={pais} onValueChange={v => setPais(v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Pais" /></SelectTrigger>
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
                  <th className="px-3 py-3">Tramite</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Pais</th>
                  <th className="px-3 py-3 hidden xl:table-cell">Producto</th>
                  <th className="px-3 py-3 text-right">Cajas Exp.</th>
                  <th className="px-3 py-3">COTEs de Ingreso</th>
                  <th className="px-3 py-3 text-right hidden lg:table-cell">Cajas Ingreso</th>
                  <th className="px-3 py-3 w-[100px]">Agregar COTE</th>
                  <th className="px-3 py-3 text-right">Diff. Cajas</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as CruceRow[]).map(r => (
                  <tr key={r.exp.id} className={`border-b cursor-pointer ${r.diffEnvases < 0 ? 'hover:bg-red-50/40' : 'hover:bg-orange-50/40'} ${isEdited('export', r.exp.id) ? 'bg-violet-50/30' : ''}`} onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-blue-700">{r.exp.nroCote}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.exp.nroTramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.exp.fechaTramite)}</td>
                    <td className="px-3 py-2.5 text-xs">{r.exp.paisDestino}</td>
                    <td className="px-3 py-2.5 text-xs hidden xl:table-cell max-w-[200px] truncate">{r.exp.denominacionMercaderia}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono font-medium">{r.envasesExp.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.isManualLink && <span className="inline-block bg-violet-100 text-violet-800 text-[9px] font-bold px-1 py-0.5 rounded">MANUAL</span>}
                        {r.ingresoCotes.map(c => (
                          <span key={c} className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-mono px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                        {r.ingresoCotesNotFound.map(c => (
                          <span key={c} title="No encontrado en ingresos Caliral" className="inline-block bg-red-100 text-red-700 text-[10px] font-mono px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono hidden lg:table-cell">{r.totalEnvasesIngreso.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2.5 py-1 rounded-md transition-colors"
                        onClick={() => openExportEdit(r)}
                      >
                        <Plus className="h-3 w-3" />Vincular COTE
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">{diffBadgeEnvases(r.diffEnvases)}</td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-1 rounded hover:bg-slate-100" title="Editar" onClick={() => openExportEdit(r)}>
                          <Pencil className={`h-3.5 w-3.5 ${isEdited('export', r.exp.id) ? 'text-violet-600' : 'text-slate-400'}`} />
                        </button>
                        <button className="p-1 rounded hover:bg-slate-100" title="Ver detalle" onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {subTab === 'sincruce' && (
            <>
            <div className="mb-2">
              <Button size="sm" className="text-xs" onClick={() => setAddExpOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Agregar exportacion manual
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-3">COTE Exp.</th>
                  <th className="px-3 py-3">Tramite</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Pais</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Producto</th>
                  <th className="px-3 py-3 text-right">Cajas Exp.</th>
                  <th className="px-3 py-3 text-right hidden md:table-cell">Kg</th>
                  <th className="px-3 py-3 w-[160px]">Agregar COTE Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as SinCruceRow[]).map(r => (
                  <SinCruceInlineRow key={r.exp.id} row={r} ingresoMap={ingresoMap} edits={edits} onSaved={(newEdits) => { setEdits(newEdits); saveEdits(newEdits); recomputeCruce(newEdits); }} onEditFull={() => openExportEdit(r)} isEditedFlag={isEdited('export', r.exp.id)} />
                ))}
              </tbody>
            </table>
            </>
          )}

          {subTab === 'pendientes' && (
            <>
            <div className="mb-2">
              <Button size="sm" className="text-xs" onClick={() => setAddIngresoOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Agregar COTE deposito manual
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-3 py-3">COTE</th>
                  <th className="px-3 py-3">Tramite</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Producto</th>
                  <th className="px-3 py-3 hidden md:table-cell">Cortes</th>
                  <th className="px-3 py-3 text-right">Cajas</th>
                  <th className="px-3 py-3 text-right hidden md:table-cell">Kg</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as IngresoPendienteRow[]).map(r => (
                  <tr key={r.cote} className={`border-b hover:bg-orange-50/40 cursor-pointer ${isEdited('ingreso', r.cote) ? 'bg-violet-50/30' : ''}`} onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-orange-700">{r.cote}</td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.tramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.fecha)}</td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{r.producto}</td>
                    <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[200px] truncate">{r.cortes.join(', ')}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">{r.envases.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono hidden md:table-cell">{r.pesoNeto.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-1 rounded hover:bg-slate-100" title="Editar" onClick={() => openIngresoEdit(r)}>
                          <Pencil className={`h-3.5 w-3.5 ${isEdited('ingreso', r.cote) ? 'text-violet-600' : 'text-slate-400'}`} />
                        </button>
                        <button className="p-1 rounded hover:bg-slate-100" title="Ver detalle" onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-slate-500">{filteredData.length} registros — Pagina {page} de {totalPages || 1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent></Card>

      {/* Detail Sheet (read-only) */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {detailRow && detailType === 'cruce' && (() => {
            const r = detailRow as CruceRow;
            return (<>
              <SheetHeader><SheetTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-orange-600" />Cruce — Exportacion COTE {r.exp.nroCote}</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Datos de la Exportacion</p>
                  <div className="bg-blue-50/50 rounded-lg p-3 space-y-1">
                    {[
                      ['COTE Exportacion', r.exp.nroCote],
                      ['Nro. Tramite', String(r.exp.nroTramite)],
                      ['Fecha', fd(r.exp.fechaTramite)],
                      ['Pais', r.exp.paisDestino],
                      ['Producto', r.exp.denominacionMercaderia],
                      ['Corte', r.exp.corte],
                      ['Transporte', r.exp.tipoTransporte || '-'],
                      ['Contenedor', (r.exp as Record<string, unknown>).contenedorSerieNro as string || '-'],
                      ['Precinto', r.exp.precinto1 || '-'],
                      ['Cert. Sanitario', r.exp.nroCertificadoSanitario || '-'],
                      ['Estab. Certificador', r.exp.nombreEstablecimientoCertif || '-'],
                      ['Cajas (envases)', String(r.envasesExp)],
                      ['Peso Bruto', r.exp.pesoBruto ? String(r.exp.pesoBruto) + ' kg' : '-'],
                      ['Peso Neto', r.kgExp ? String(r.kgExp) + ' kg' : '-'],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between gap-4"><span className="text-slate-500 text-xs">{l}</span><span className="text-slate-800 text-xs text-right font-medium break-all">{v}</span></div>
                    ))}
                  </div>
                </div>
                {r.isManualLink && (
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-2 text-xs text-violet-800">
                    <p className="font-bold">Vinculacion manual de COTEs de ingreso</p>
                  </div>
                )}
                <div className={`rounded-lg p-4 ${r.diffEnvases < 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Balance por Cajas (Envases)</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-[10px] text-slate-400">Cajas Ingresadas</p><p className="text-xl font-bold text-emerald-700">{r.totalEnvasesIngreso.toLocaleString('es-UY')}</p></div>
                    <div><p className="text-[10px] text-slate-400">Cajas Exportadas</p><p className="text-xl font-bold text-blue-700">{r.envasesExp.toLocaleString('es-UY')}</p></div>
                    <div><p className="text-[10px] text-slate-400">Diferencia</p><div className="flex justify-center">{diffBadgeEnvases(r.diffEnvases)}</div></div>
                  </div>
                  {r.diffEnvases < 0 && (
                    <div className="mt-3 bg-red-100 rounded p-2 text-xs text-red-800">
                      <p className="font-bold">ERROR: Se exportaron {Math.abs(r.diffEnvases)} cajas mas de las que ingresaron con los COTEs referenciados.</p>
                      <p className="mt-1">Posibles causas: las cajas pueden venir de COTEs de ingreso no declarados en observaciones, o hubo un error de carga.</p>
                    </div>
                  )}
                  {r.diffEnvases > 0 && (
                    <p className="text-center text-xs text-sky-600 mt-2">Sobran {r.diffEnvases} cajas de ingreso vs esta exportacion (pueden corresponder a otras exportaciones o estar pendientes).</p>
                  )}
                </div>
                <div className="bg-slate-50/50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Referencia en Kg</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Kg ingresados: <span className="font-medium text-slate-700">{r.totalKgIngreso.toLocaleString('es-UY')} kg</span></span>
                    <span className="text-slate-500">Kg exportados: <span className="font-medium text-slate-700">{r.kgExp.toLocaleString('es-UY')} kg</span></span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">COTEs de Ingreso ({r.ingresoCotes.length})</p>
                  <div className="space-y-2">
                    {r.ingresoAgg.map(agg => (
                      <div key={agg.cote} className="border rounded-lg p-3 bg-emerald-50/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-emerald-700 text-sm">{agg.cote}</span>
                          <span className="text-xs text-slate-500">Tramite {agg.tramite} — {fd(agg.fecha)}</span>
                        </div>
                        <div className="text-xs text-slate-600 space-y-0.5">
                          <p>Producto: {agg.producto}</p>
                          <p>Cortes: {agg.cortes.join(', ')}</p>
                          <p><span className="font-medium">Cajas: {agg.envases.toLocaleString('es-UY')}</span> — Peso Neto: {agg.pesoNeto.toLocaleString('es-UY')} kg ({agg.lineCount} lineas)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {r.ingresoCotesNotFound.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">COTEs no encontrados en ingresos Caliral</p>
                    <div className="flex flex-wrap gap-1">
                      {r.ingresoCotesNotFound.map(c => (
                        <span key={c} className="inline-block bg-red-100 text-red-700 text-xs font-mono px-2 py-1 rounded">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
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
                  <p className="font-bold mb-1">Esta exportacion no tiene COTE de ingreso referenciado.</p>
                  <p>Hace click en <b>Editar</b> para agregar los COTEs de ingreso y la cantidad de cajas manualmente.</p>
                </div>
                <div className="space-y-1">
                  {[
                    ['COTE', r.exp.nroCote], ['Nro. Tramite', String(r.exp.nroTramite)],
                    ['Fecha', fd(r.exp.fechaTramite)], ['Pais', r.exp.paisDestino],
                    ['Producto', r.exp.denominacionMercaderia], ['Corte', r.exp.corte],
                    ['Contenedor', (r.exp as Record<string, unknown>).contenedorSerieNro as string || '-'],
                    ['Cajas (envases)', String(r.exp.cantidadEnvases ?? '-')],
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
                  <p className="font-bold mb-1">Este ingreso a Caliral no esta vinculado a ninguna exportacion.</p>
                  <p>Esto puede deberse a que aun no se exporto la mercaderia, o a que el COTE de ingreso no fue registrado en las observaciones del tramite de exportacion.</p>
                </div>
                {agg && (
                  <div>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">Detalle del Ingreso</p>
                    <div className="space-y-1">
                      {[
                        ['COTE', agg.cote], ['Nro. Tramite', String(agg.tramite)],
                        ['Fecha', fd(agg.fecha)], ['Producto', agg.producto],
                        ['Cortes', agg.cortes.join(', ')], ['Lineas', String(agg.lineCount)],
                        ['Cajas (envases)', agg.envases.toLocaleString('es-UY')],
                        ['Peso Bruto', agg.pesoBruto.toLocaleString('es-UY') + ' kg'],
                        ['Peso Neto', agg.pesoNeto.toLocaleString('es-UY') + ' kg'],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between gap-4"><span className="text-slate-500 text-xs">{l}</span><span className="text-slate-800 text-xs text-right font-medium break-all">{v}</span></div>
                      ))}
                    </div>
                    {agg.lines.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Lineas del ingreso</p>
                        <div className="max-h-[300px] overflow-y-auto border rounded">
                          <table className="w-full text-[11px]">
                            <thead className="sticky top-0 bg-slate-100"><tr>
                              <th className="px-2 py-1 text-left">Linea</th>
                              <th className="px-2 py-1 text-left">Corte</th>
                              <th className="px-2 py-1 text-right">Cajas</th>
                              <th className="px-2 py-1 text-right">Peso Neto</th>
                            </tr></thead>
                            <tbody>
                              {agg.lines.map((l, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-2 py-1">{String((l as Record<string, unknown>).idLinea ?? i + 1)}</td>
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

      {/* EDIT SHEET */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {editTarget?.type === 'export' && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-violet-600" />
                  Editar Exportacion — {(editTarget.row as CruceRow | SinCruceRow).exp.nroCote}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                {/* Datos generales */}
                <div>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Datos de la Exportacion</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><FieldLabel>COTE</FieldLabel><Input value={ef_nroCote} onChange={e => setEf_nroCote(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Tramite</FieldLabel><Input type="number" value={ef_nroTramite} onChange={e => setEf_nroTramite(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Pais</FieldLabel><Input value={ef_pais} onChange={e => setEf_pais(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Producto</FieldLabel><Input value={ef_producto} onChange={e => setEf_producto(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Corte</FieldLabel><Input value={ef_corte} onChange={e => setEf_corte(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Cajas (envases)</FieldLabel><Input type="number" value={ef_cajas} onChange={e => setEf_cajas(e.target.value)} className="h-8 text-xs font-mono" /></div>
                    <div><FieldLabel>Peso Neto (kg)</FieldLabel><Input type="number" value={ef_pesoNeto} onChange={e => setEf_pesoNeto(e.target.value)} className="h-8 text-xs font-mono" /></div>
                    <div><FieldLabel>Peso Bruto (kg)</FieldLabel><Input type="number" value={ef_pesoBruto} onChange={e => setEf_pesoBruto(e.target.value)} className="h-8 text-xs font-mono" /></div>
                  </div>
                </div>

                {/* Logistica */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Logistica</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><FieldLabel>Transporte</FieldLabel><Input value={ef_transporte} onChange={e => setEf_transporte(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Contenedor</FieldLabel><Input value={ef_contenedor} onChange={e => setEf_contenedor(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Precinto</FieldLabel><Input value={ef_precinto} onChange={e => setEf_precinto(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Matricula Camion</FieldLabel><Input value={ef_matricula} onChange={e => setEf_matricula(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Cert. Sanitario</FieldLabel><Input value={ef_certSanitario} onChange={e => setEf_certSanitario(e.target.value)} className="h-8 text-xs" /></div>
                    <div><FieldLabel>Estab. Certificador</FieldLabel><Input value={ef_estabCertif} onChange={e => setEf_estabCertif(e.target.value)} className="h-8 text-xs" /></div>
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <FieldLabel>Observaciones</FieldLabel>
                  <textarea value={ef_observaciones} onChange={e => setEf_observaciones(e.target.value)} className="w-full min-h-[80px] text-xs border rounded-md p-2 font-mono resize-y" placeholder="Escribir observaciones... los COTEs de ingreso se detectan automaticamente (formato P12345)" />
                </div>

                {/* COTEs de Ingreso MANUALES */}
                <div className="border-2 border-violet-200 rounded-lg p-4 bg-violet-50/50">
                  <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">
                    COTEs de Ingreso (vinculacion manual)
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3">Agrega los COTEs de ingreso que corresponden a esta exportacion y la cantidad de cajas usadas de cada uno. Esto reemplaza la deteccion automatica desde observaciones.</p>

                  {ef_manualCotes.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {ef_manualCotes.map(mc => (
                        <div key={mc.cote} className="flex items-center gap-2 bg-white border rounded-md px-3 py-2">
                          <span className="font-mono text-sm font-bold text-emerald-700 flex-1">{mc.cote}</span>
                          <span className="text-xs text-slate-500">cajas:</span>
                          <Input type="number" value={mc.cajas} onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setEf_manualCotes(prev => prev.map(c => c.cote === mc.cote ? { ...c, cajas: val } : c));
                          }} className="w-20 h-7 text-xs text-right font-mono" />
                          <button onClick={() => removeManualCote(mc.cote)} className="p-1 rounded hover:bg-red-100"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                        </div>
                      ))}
                      <div className="text-xs text-right text-slate-500">
                        Total cajas ingreso: <span className="font-bold text-slate-800">{ef_manualCotes.reduce((s, c) => s + c.cajas, 0).toLocaleString('es-UY')}</span>
                        {ef_cajas && (
                          <> — Exportadas: <span className="font-bold text-blue-700">{parseInt(ef_cajas || '0').toLocaleString('es-UY')}</span>
                          {' '}(diff: <span className={ef_manualCotes.reduce((s, c) => s + c.cajas, 0) - parseInt(ef_cajas || '0') < 0 ? 'text-red-600' : 'text-emerald-600'}>{(ef_manualCotes.reduce((s, c) => s + c.cajas, 0) - parseInt(ef_cajas || '0')).toLocaleString('es-UY')}</span>)</>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <FieldLabel>COTE de ingreso</FieldLabel>
                      <Input value={ef_newCote} onChange={e => setEf_newCote(e.target.value.toUpperCase())} placeholder="P12345" className="h-8 text-xs font-mono" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualCote(); } }} />
                    </div>
                    <div className="w-24">
                      <FieldLabel>Cajas</FieldLabel>
                      <Input type="number" value={ef_newCoteCajas} onChange={e => setEf_newCoteCajas(e.target.value)} placeholder="0" className="h-8 text-xs font-mono text-right" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualCote(); } }} />
                    </div>
                    <Button size="sm" variant="outline" onClick={addManualCote} className="h-8 mb-0.5" disabled={!ef_newCote.trim() || !ef_newCoteCajas}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Agregar
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" onClick={saveExportEdit} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />Guardar cambios
                  </Button>
                  {isEdited('export', editTarget.id) && (
                    <Button size="sm" variant="outline" onClick={clearExportEdit} className="text-red-600 border-red-200 hover:bg-red-50">
                      <RotateCcw className="h-4 w-4 mr-1" />Revertir
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {editTarget?.type === 'ingreso' && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-violet-600" />
                  Editar Ingreso — {editTarget.id}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-2">Datos del Ingreso</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><FieldLabel>Cajas (envases)</FieldLabel><Input type="number" value={ei_cajas} onChange={e => setEi_cajas(e.target.value)} className="h-8 text-xs font-mono" /></div>
                    <div><FieldLabel>Peso Neto (kg)</FieldLabel><Input type="number" value={ei_pesoNeto} onChange={e => setEi_pesoNeto(e.target.value)} className="h-8 text-xs font-mono" /></div>
                    <div><FieldLabel>Peso Bruto (kg)</FieldLabel><Input type="number" value={ei_pesoBruto} onChange={e => setEi_pesoBruto(e.target.value)} className="h-8 text-xs font-mono" /></div>
                    <div><FieldLabel>Producto</FieldLabel><Input value={ei_producto} onChange={e => setEi_producto(e.target.value)} className="h-8 text-xs" /></div>
                  </div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2 text-[11px] text-amber-800">
                  Se editan los valores agregados del COTE. Las lineas individuales del JSON original no se modifican.
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" onClick={saveIngresoEdit} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />Guardar cambios
                  </Button>
                  {isEdited('ingreso', editTarget.id) && (
                    <Button size="sm" variant="outline" onClick={clearIngresoEdit} className="text-red-600 border-red-200 hover:bg-red-50">
                      <RotateCcw className="h-4 w-4 mr-1" />Revertir
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* NEW INGRESO SHEET */}
      <Sheet open={addIngresoOpen} onOpenChange={setAddIngresoOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              Agregar COTE deposito manual
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm">
            <div className="bg-orange-50 rounded-lg p-3 text-xs text-orange-800">
              Agrega un COTE de ingreso/depósito que no existe en los datos originales. Se guardará como edición manual.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>COTE</FieldLabel><Input value={ni_cote} onChange={e => setNi_cote(e.target.value.toUpperCase())} placeholder="P12345" className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Tramite</FieldLabel><Input type="number" value={ni_tramite} onChange={e => setNi_tramite(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Fecha</FieldLabel><Input type="date" value={ni_fecha} onChange={e => setNi_fecha(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Producto</FieldLabel><Input value={ni_producto} onChange={e => setNi_producto(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Cajas (envases)</FieldLabel><Input type="number" value={ni_cajas} onChange={e => setNi_cajas(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Kg Neto</FieldLabel><Input type="number" value={ni_pesoNeto} onChange={e => setNi_pesoNeto(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Kg Bruto</FieldLabel><Input type="number" value={ni_pesoBruto} onChange={e => setNi_pesoBruto(e.target.value)} className="h-8 text-xs font-mono" /></div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" onClick={saveNewIngreso} className="flex-1" disabled={!ni_cote.trim()}>
                <Save className="h-4 w-4 mr-2" />Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddIngresoOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* NEW EXPORT SHEET */}
      <Sheet open={addExpOpen} onOpenChange={setAddExpOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Agregar exportacion manual
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm">
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
              Agrega una exportación que no existe en los datos originales. Se guardará como edición manual.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>COTE Exportacion</FieldLabel><Input value={ne_nroCote} onChange={e => setNe_nroCote(e.target.value.toUpperCase())} placeholder="E12345" className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Tramite</FieldLabel><Input type="number" value={ne_nroTramite} onChange={e => setNe_nroTramite(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Fecha</FieldLabel><Input type="date" value={ne_fecha} onChange={e => setNe_fecha(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Pais</FieldLabel><Input value={ne_pais} onChange={e => setNe_pais(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Producto</FieldLabel><Input value={ne_producto} onChange={e => setNe_producto(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Corte</FieldLabel><Input value={ne_corte} onChange={e => setNe_corte(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Cajas (envases)</FieldLabel><Input type="number" value={ne_cajas} onChange={e => setNe_cajas(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Kg Neto</FieldLabel><Input type="number" value={ne_pesoNeto} onChange={e => setNe_pesoNeto(e.target.value)} className="h-8 text-xs font-mono" /></div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" onClick={saveNewExp} className="flex-1" disabled={!ne_nroCote.trim()}>
                <Save className="h-4 w-4 mr-2" />Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddExpOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
