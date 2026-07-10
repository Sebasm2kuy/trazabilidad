'use client';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, ChevronLeft, ChevronRight, Eye, Download, ArrowLeftRight, AlertTriangle, CheckCircle2, Link2, Unlink, PackageMinus, Package, Pencil, Save, Plus, Trash2, RotateCcw, Upload, ClipboardPaste, Globe, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { schedulePush } from '@/lib/googleSheets'
import { dataUrl } from '@/lib/staticData';
import type { ExpRecord } from '@/lib/types';
import type { StockLoad, StockCodigoAgg, StockPallet } from '@/lib/parseStockXls';
import { buildStockAggMap, SIN_CODIGO_KEY } from '@/lib/parseStockXls';
import { fd, fmt } from '@/lib/utils';
import { useAppStore, selectCruceCaliralFields, useShallow } from '@/store/useAppStore';

// Fix dates that were corrupted by MM/DD ↔ DD/MM swap during Excel import
// If a date is more than 2 months in the future, swap day and month
function fixSwappedDate(iso: string): string {
  if (!iso || !iso.includes('T')) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const twoMonthsMs = 62 * 86400000;
  // If date is more than 2 months in the future, it's probably swapped
  if (d.getTime() > now.getTime() + twoMonthsMs && d.getDate() <= 12 && d.getMonth() + 1 <= 12) {
    const swapped = new Date(d.getFullYear(), d.getDate() - 1, d.getMonth() + 1);
    if (!isNaN(swapped.getTime()) && swapped.getTime() <= now.getTime()) {
      return swapped.toISOString();
    }
  }
  return iso;
}

function fixRecordDates<T>(records: T[], dateFields: string[]): T[] {
  let changed = false;
  const fixed = records.map(r => {
    let modified = false;
    const copy = { ...r } as unknown as Record<string, unknown>;
    for (const f of dateFields) {
      const v = copy[f];
      if (typeof v === 'string' && v.includes('T')) {
        const fixedVal = fixSwappedDate(v);
        if (fixedVal !== v) { copy[f] = fixedVal; modified = true; }
      }
    }
    if (modified) changed = true;
    return copy as T;
  });
  if (changed) return fixed;
  return records;
}

// --- MGAP page content parser ---
interface MgapParsed {
  cote?: string;
  tramite?: number;
  fecha?: string;
  producto?: string;
  cajas?: number;
  pesoNeto?: number;
  pesoBruto?: number;
  corte?: string;
  pais?: string;
}

function parseMgapContent(raw: string): MgapParsed {
  const r: MgapParsed = {};
  if (!raw?.trim()) return r;

  // Check if it's a URL — extract tramite from DSP,NNNNNN pattern
  const urlMatch = raw.trim().match(/DSP[,.]\s*(\d+)/i);
  if (urlMatch && raw.trim().startsWith('http')) {
    r.tramite = parseInt(urlMatch[1]);
    return r;
  }

  // Strip HTML tags to get plain text
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th?>/gi, '\t')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\t+/g, '\t')
    .replace(/\n{3,}/g, '\n\n');

  // Extract COTE: look for P followed by 4-8 digits (ingreso COTE pattern)
  // Try label-value patterns first, then standalone
  const coteLabel = text.match(/(?:Nro\.?\s*Cote[:\s\t]+|Cote[:\s\t]+|Nro\.?\s*C\.?O\.?T\.?E\.?[:\s\t]+)([PE]\s*\d[\d.\s]{3,15})/i);
  if (coteLabel) {
    r.cote = coteLabel[1].replace(/[\s.]+/g, '').toUpperCase();
  } else {
    // Look for standalone COTE pattern: P or E followed by digits
    const coteStandalone = text.match(/\b([PE])\s*(\d{4,8})\b/i);
    if (coteStandalone) {
      r.cote = (coteStandalone[1] + coteStandalone[2]).toUpperCase();
    }
  }

  // Extract Tramite
  const tramLabel = text.match(/(?:Tr[aá]mite\s*(?:Nro\.?|Numero|N[°o])?[:\s\t]+)(\d[\d.]*)/i);
  if (tramLabel) {
    r.tramite = parseInt(tramLabel[1].replace(/\./g, ''));
  } else {
    const tramUrl = text.match(/DSP[,.]\s*(\d+)/i);
    if (tramUrl) r.tramite = parseInt(tramUrl[1]);
  }

  // Extract Date — try multiple formats
  const fechaLabel = text.match(/(?:Fecha\s*(?:Emisi[oó]n|Tr[aá]mite|Inicio)?[:\s\t]+)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i);
  if (fechaLabel) {
    let d = parseInt(fechaLabel[1]), m = parseInt(fechaLabel[2]), y = parseInt(fechaLabel[3]);
    if (y < 100) y += 2000;
    // Handle DD/MM/YYYY format (Uruguayan standard)
    const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    r.fecha = iso;
  }

  // Extract Producto / Denominacion
  const prodLabel = text.match(/(?:Denominaci[oó]n(?:\s*(?:de\s*la\s*)?Mercader[ií]a)?|Producto|Descripci[oó]n)[:\s\t]+([^\t\n]{4,80}?)(?=\s*(?:Peso|Cant|Envases|Corte|Tropa|Faena|$))/im);
  if (prodLabel) {
    r.producto = prodLabel[1].trim().replace(/\s+/g, ' ');
  }

  // Extract Corte
  const corteLabel = text.match(/(?:Corte|Tipo\s*Corte|Cortes)[:\s\t]+([^\t\n]{2,60}?)(?=\s*(?:Peso|Cant|Envases|Producto|Tropa|Faena|$))/im);
  if (corteLabel) {
    r.corte = corteLabel[1].trim().replace(/\s+/g, ' ');
  }

  // Extract Pais destino
  const paisLabel = text.match(/(?:Pa[ií]s(?:\s*Destino)?|Destino|Destinatario)[:\s\t]+([^\t\n]{2,60}?)(?=\s*(?:Peso|Cant|Envases|Producto|Corte|Tropa|Faena|$))/im);
  if (paisLabel) {
    r.pais = paisLabel[1].trim().replace(/\s+/g, ' ');
  }

  // Extract Cajas / Envases
  const cajasLabel = text.match(/(?:Cant\.?\s*(?:Envases|Cajas|Trozos)|Envases|Cajas|Total\s*Envases)[:\s\t]+(\d[\d.]*)/i);
  if (cajasLabel) {
    r.cajas = parseInt(cajasLabel[1].replace(/\./g, ''));
  }

  // Extract Peso Neto
  const pnLabel = text.match(/Peso\s*Neto[:\s\t]+(\d[\d.,]*)/i);
  if (pnLabel) {
    r.pesoNeto = parseFloat(pnLabel[1].replace(/\./g, '').replace(',', '.'));
  }

  // Extract Peso Bruto
  const pbLabel = text.match(/Peso\s*Bruto[:\s\t]+(\d[\d.,]*)/i);
  if (pbLabel) {
    r.pesoBruto = parseFloat(pbLabel[1].replace(/\./g, '').replace(',', '.'));
  }

  return r;
}

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
  manualCajasUsadas?: number;
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

interface ProductoCorteLine {
  id: string;
  producto: string;
  corte: string;
  cajas: number | '';
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
  lineas?: ProductoCorteLine[];
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
  lineas?: ProductoCorteLine[];
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
  schedulePush();
}

// --- Data loading ---
const cache: { shipments: IngresoLine[]; exportsRaw: ExpRecord[]; exports: ExpRecord[]; loaded: boolean } = { shipments: [], exportsRaw: [], exports: [], loaded: false };

function loadExpEdits(): Record<string, Partial<ExpRecord>> {
  try { const r = localStorage.getItem('trazabilidad_exp_edits'); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

function applyExpEdits(data: ExpRecord[], edits: Record<string, Partial<ExpRecord>>): ExpRecord[] {
  if (Object.keys(edits).length === 0) return data;
  return data.map(s => edits[s.id] ? { ...s, ...edits[s.id] } : s);
}

async function ensureData(forceReload = false) {
  if (!cache.loaded || forceReload) {
    const [sR, eR] = await Promise.all([
      fetch(dataUrl('data/shipments.json') + '?t=' + Date.now()),
      fetch(dataUrl('data/exportaciones.json') + '?t=' + Date.now()),
    ]);
    const allShipments: IngresoLine[] = await sR.json();
    const allExports: ExpRecord[] = await eR.json();

    // Merge: imported Excel data takes priority if static JSON is empty
    // Read from trazabilidad_dep_imported (Excel import in Depositos tab)
    let importedShipments: IngresoLine[] = [];
    try {
      const depImpRaw = localStorage.getItem('trazabilidad_dep_imported');
      if (depImpRaw) importedShipments = JSON.parse(depImpRaw);
    } catch { /* ignore */ }

    // If static JSON is empty but imported data exists, use imported data as base
    let baseShipments = allShipments;
    if (baseShipments.length === 0 && importedShipments.length > 0) {
      baseShipments = importedShipments;
    }

    // Filter to Caliral-bound shipments
    let caliralShipments = baseShipments.filter(s => String(s.nombreEstablecimientoDestino || '').toLowerCase().includes('caliral'));

    // Also include imported records that are not already in base (for non-caliral merge)
    if (baseShipments === allShipments && importedShipments.length > 0) {
      const existingIds = new Set(caliralShipments.map(s => s.id));
      for (const nr of importedShipments) {
        if (!existingIds.has(nr.id)) {
          caliralShipments.push(nr);
        }
      }
    }

    // Also include new deposit records from Depositos page (manual creates)
    try {
      const depNewRaw = localStorage.getItem('trazabilidad_dep_new_records');
      if (depNewRaw) {
        const depNew: IngresoLine[] = JSON.parse(depNewRaw);
        const existingIds = new Set(caliralShipments.map(s => s.id));
        for (const nr of depNew) {
          if (!existingIds.has(nr.id)) {
            caliralShipments.push(nr);
          }
        }
      }
    } catch { /* ignore */ }

    // Apply deposit edits from Depositos page
    try {
      const depEditsRaw = localStorage.getItem('trazabilidad_dep_edits');
      if (depEditsRaw) {
        const depEdits: Record<string, Partial<IngresoLine>> = JSON.parse(depEditsRaw);
        caliralShipments = caliralShipments.map(s => depEdits[s.id] ? { ...s, ...depEdits[s.id] } : s);
      }
    } catch { /* ignore */ }

    // Remove deleted deposits
    try {
      const depDelRaw = localStorage.getItem('trazabilidad_dep_deleted');
      if (depDelRaw) {
        const depDeleted: Set<string> = new Set(JSON.parse(depDelRaw));
        caliralShipments = caliralShipments.filter(s => !depDeleted.has(s.id));
      }
    } catch { /* ignore */ }

    // Fix swapped dates (MM/DD ↔ DD/MM corruption from old Excel imports)
    const shipDateFields = ['fechaTramite', 'fechaEmitidoCote', 'fechaInicioFaena', 'fechaFinFaena', 'fechaInicioProduccion', 'fechaFinProduccion', 'fechaInicioCongelacion', 'fechaFinCongelacion'];
    const fixedShipments = fixRecordDates(caliralShipments, shipDateFields);
    if (fixedShipments !== caliralShipments) {
      // Save corrected data back to localStorage
      try {
        const depImpRaw = localStorage.getItem('trazabilidad_dep_imported');
        if (depImpRaw) {
          const depImported: IngresoLine[] = JSON.parse(depImpRaw);
          const fixedDep = fixRecordDates(depImported, shipDateFields);
          if (fixedDep !== depImported) localStorage.setItem('trazabilidad_dep_imported', JSON.stringify(fixedDep));
        }
      } catch { /* ignore */ }
      caliralShipments = fixedShipments;
    }

    cache.shipments = caliralShipments;
    cache.exportsRaw = allExports;
    cache.loaded = true;
  }

  // Build full export list: static JSON + imported Excel + new PDF uploads (always re-read localStorage)
  const allExportsList = [...cache.exportsRaw];

  // Read from trazabilidad_exp_imported (Excel import in Exportaciones tab)
  try {
    const expImpRaw = localStorage.getItem('trazabilidad_exp_imported');
    if (expImpRaw) {
      const expImported: ExpRecord[] = JSON.parse(expImpRaw);
      // If static JSON is empty, use imported as base
      if (allExportsList.length === 0) {
        allExportsList.push(...expImported);
      } else {
        const existingIds = new Set(allExportsList.map(e => e.id));
        for (const nr of expImported) {
          if (!existingIds.has(nr.id)) allExportsList.push(nr);
        }
      }
    }
  } catch { /* ignore */ }

  // Also include new records from PDF uploads
  try {
    const raw = localStorage.getItem('trazabilidad_new_records');
    if (raw) {
      const newRecs: ExpRecord[] = JSON.parse(raw);
      const existingIds = new Set(allExportsList.map(e => e.id));
      for (const nr of newRecs) {
        if (nr.tipo === 'EXPORTACION' && !existingIds.has(nr.id)) {
          allExportsList.push(nr);
        }
      }
    }
  } catch { /* ignore */ }

  // Fix swapped dates on exports too
  const expDateFields = ['fechaTramite', 'fechaEmitidoCote', 'fechaInicioFaena', 'fechaFinFaena', 'fechaInicioProduccion', 'fechaFinProduccion', 'fechaInicioCongelacion', 'fechaFinCongelacion', 'recibidaFechaHora'];
  const fixedExports = fixRecordDates(allExportsList, expDateFields);
  if (fixedExports !== allExportsList) {
    try {
      const expImpRaw = localStorage.getItem('trazabilidad_exp_imported');
      if (expImpRaw) {
        const expImported: ExpRecord[] = JSON.parse(expImpRaw);
        const fixedImp = fixRecordDates(expImported, expDateFields);
        if (fixedImp !== expImported) localStorage.setItem('trazabilidad_exp_imported', JSON.stringify(fixedImp));
      }
    } catch { /* ignore */ }
    allExportsList.length = 0;
    allExportsList.push(...fixedExports);
  }

  // Apply edits from Exportaciones page to ALL exports (including PDF uploads)
  const expEdits = loadExpEdits();
  cache.exports = applyExpEdits(allExportsList, expEdits);
}

function extractIngresoCotes(obs: string | null | undefined, exportCote: string): string[] {
  if (!obs) return [];
  const allP = obs.match(/P\d{4,8}/gi) || [];
  const allB = obs.match(/B\d{4,8}/gi) || [];
  const all = [...allP, ...allB];
  const exportUpper = exportCote.toUpperCase();
  return all.map(c => c.toUpperCase()).filter(c => c !== exportUpper);
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
function SinCruceInlineRow({ row, ingresoMap, stockAggMap, edits, onSaved, onEditFull, onViewDetail, isEditedFlag }: {
  row: SinCruceRow;
  ingresoMap: Map<string, IngresoAgg>;
  stockAggMap: Map<string, StockCodigoAgg>;
  edits: EditsStore;
  onSaved: (edits: EditsStore) => void;
  onEditFull: () => void;
  onViewDetail: () => void;
  isEditedFlag: boolean;
}) {
  const [expanding, setExpanding] = useState(false);
  const [newCote, setNewCote] = useState('');
  const [newCajas, setNewCajas] = useState('');
  // Local mirror of manualCotes to avoid stale closure when adding quickly
  const [localCotes, setLocalCotes] = useState<ManualCoteLink[]>(
    () => edits.exports[row.exp.id]?.manualCotes || []
  );
  const opLock = useRef(false);
  // Sync from props (handles external changes like sync/undo), skip during local ops
  const propCotes = edits.exports[row.exp.id]?.manualCotes || [];
  const propKey = propCotes.map(c => `${c.cote}:${c.cajas}`).join(',');
  const localKey = localCotes.map(c => `${c.cote}:${c.cajas}`).join(',');
  if (propKey !== localKey && !opLock.current) {
    setLocalCotes(propCotes);
  }

  const existingCotesInCaliral = [...ingresoMap.keys(), ...stockAggMap.keys()].sort();

  const handleQuickAdd = () => {
    const cote = newCote.trim().toUpperCase();
    if (!cote) return;
    let cajas = parseInt(newCajas) || 0;
    if (cajas <= 0 && ingresoMap.has(cote)) {
      cajas = ingresoMap.get(cote)!.envases;
    }
    if (cajas <= 0) {
      toast.error('Ingresá la cantidad de cajas');
      return;
    }
    opLock.current = true;
    setTimeout(() => { opLock.current = false; }, 100);
    const existingIdx = localCotes.findIndex(c => c.cote === cote);
    let updated: ManualCoteLink[];
    if (existingIdx >= 0) {
      updated = localCotes.map((c, i) => i === existingIdx ? { ...c, cajas } : c);
      toast.success(`${cote} actualizado: ${cajas} cajas`);
    } else {
      updated = [...localCotes, { cote, cajas }];
      toast.success(`${cote} agregado`);
    }
    setLocalCotes(updated);
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
    opLock.current = true;
    setTimeout(() => { opLock.current = false; }, 100);
    const updated = localCotes.filter(c => c.cote !== cote);
    setLocalCotes(updated);
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
        <td className="px-3 py-2.5 text-xs font-mono font-medium text-amber-700"><button onClick={(e) => { e.stopPropagation(); onViewDetail(); }} className="hover:underline cursor-pointer">{row.exp.nroCote}</button></td>
        <td className="px-3 py-2.5 text-xs font-mono">{row.exp.nroTramite}</td>
        <td className="px-3 py-2.5 text-xs">{fd(row.exp.fechaTramite)}</td>
        <td className="px-3 py-2.5 text-xs">{row.exp.paisDestino}</td>
        <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{row.exp.denominacionMercaderia}</td>
        <td className="px-1 py-1.5 text-right" onClick={e => e.stopPropagation()}>
          <input type="number" name={`envases-${row.exp.id}`} min="0" step="1"
            className="w-[72px] h-7 text-xs text-right font-mono font-medium bg-transparent border border-transparent hover:border-slate-300 focus:border-amber-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
            defaultValue={row.exp.cantidadEnvases || 0}
            onBlur={e => { const v = e.target.value; const nv = v !== '' ? parseInt(v) : null; if (nv !== row.exp.cantidadEnvases) { const ne: EditsStore = { ...edits }; ne.exports = { ...ne.exports, [row.exp.id]: { ...ne.exports[row.exp.id], cantidadEnvases: nv } }; onSaved(ne); } }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          />
        </td>
        <td className="px-1 py-1.5 text-right hidden md:table-cell" onClick={e => e.stopPropagation()}>
          <input type="number" name={`peso-neto-${row.exp.id}`} min="0" step="0.01"
            className="w-[88px] h-7 text-xs text-right font-mono bg-transparent border border-transparent hover:border-slate-300 focus:border-amber-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
            defaultValue={row.exp.pesoNeto || 0}
            onBlur={e => { const v = e.target.value; const nv = v !== '' ? parseFloat(v) : null; if (nv !== row.exp.pesoNeto) { const ne: EditsStore = { ...edits }; ne.exports = { ...ne.exports, [row.exp.id]: { ...ne.exports[row.exp.id], pesoNeto: nv } }; onSaved(ne); } }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          />
        </td>
        <td className="px-3 py-2.5 text-center">
          {localCotes.length > 0 ? (
            <div className="flex flex-wrap gap-1 justify-center">
              {localCotes.map(mc => {
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
                  {existingCotesInCaliral.filter(c => !localCotes.some(mc => mc.cote === c)).map(c => {
                    const ing = ingresoMap.get(c);
                    const stk = stockAggMap.get(c);
                    return (
                      <option key={c} value={c}>
                        {c} — {ing?.producto || stk?.producto || ''} ({ing?.envases || stk?.totalCajas || 0} cajas) {stk?.tipo === 'PASE_SANITARIO' ? '[PASE]' : ''}
                      </option>
                    );
                  })}
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
              <Button size="sm" className="h-8 text-xs" onClick={handleQuickAdd} disabled={!newCote.trim()}>
                <Plus className="h-3 w-3 mr-1" />Agregar
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onEditFull}>
                <Pencil className="h-3 w-3 mr-1" />Editar todo
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setExpanding(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {localCotes.length > 0 && (
              <div className="mt-2 space-y-0.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span>Usadas: <b className="text-violet-700">{localCotes.reduce((s, c) => s + c.cajas, 0)}</b></span>
                  <span className="text-slate-300">|</span>
                  <span>En depositos: <b className="text-emerald-700">{localCotes.reduce((s, c) => s + (ingresoMap.get(c.cote)?.envases || 0), 0)}</b></span>
                  <span className="text-slate-300">|</span>
                  <span>Exp.: <b>{row.exp.cantidadEnvases || 0}</b></span>
                  <span className="text-slate-300">|</span>
                  <span>Diff depositos: <b className={localCotes.reduce((s, c) => s + (ingresoMap.get(c.cote)?.envases || 0), 0) - (row.exp.cantidadEnvases || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}>{(localCotes.reduce((s, c) => s + (ingresoMap.get(c.cote)?.envases || 0), 0) - (row.exp.cantidadEnvases || 0)).toLocaleString('es-UY')}</b></span>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// --- Pallet Assignment Row (for S/PASE/COTE) ---
function PalletAssignRow({ pallet, allCodes, onAssign }: {
  pallet: StockPallet;
  allCodes: string[];
  onAssign: (palletId: string, codigo: string, tipo: 'COTE' | 'PASE_SANITARIO') => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [newCode, setNewCode] = useState('');

  const handleAssign = () => {
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    const tipo: 'COTE' | 'PASE_SANITARIO' = code.startsWith('B') ? 'PASE_SANITARIO' : 'COTE';
    onAssign(pallet.id, code, tipo);
    setAssigning(false);
    setNewCode('');
  };

  if (assigning) {
    return (
      <tr className="border-t bg-violet-50/50">
        <td className="px-2 py-1 font-mono">{pallet.contenedor || '-'}</td>
        <td className="px-2 py-1">{pallet.fechaEntrega ? fd(pallet.fechaEntrega) : '-'}</td>
        <td className="px-2 py-1 text-right font-mono">{pallet.cajas.toLocaleString('es-UY')}</td>
        <td className="px-2 py-1 text-right font-mono">{pallet.kilos.toLocaleString('es-UY')}</td>
        <td className="px-2 py-1 max-w-[200px] truncate" title={pallet.contenido}>{pallet.contenido}</td>
        <td className="px-2 py-1 font-mono">{pallet.nroLote || '-'}</td>
        <td className="px-2 py-1">{pallet.fechaVencimiento ? fd(pallet.fechaVencimiento) : '-'}</td>
        <td className="px-2 py-1">
          <div className="flex items-center gap-1">
            <Input
              className="h-6 w-[120px] text-[11px] font-mono"
              placeholder="P12345 / B44473"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAssign(); } if (e.key === 'Escape') { setAssigning(false); setNewCode(''); } }}
              autoFocus
              list={`assign-codes-${pallet.id}`}
            />
            <datalist id={`assign-codes-${pallet.id}`}>
              {allCodes.map(c => <option key={c} value={c} />)}
            </datalist>
            <Button size="sm" className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700" onClick={handleAssign} disabled={!newCode.trim()}>
              <CheckCircle2 className="h-3 w-3 mr-0.5" />OK
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => { setAssigning(false); setNewCode(''); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t hover:bg-white/50">
      <td className="px-2 py-1 font-mono">{pallet.contenedor || '-'}</td>
      <td className="px-2 py-1">{pallet.fechaEntrega ? fd(pallet.fechaEntrega) : '-'}</td>
      <td className="px-2 py-1 text-right font-mono">{pallet.cajas.toLocaleString('es-UY')}</td>
      <td className="px-2 py-1 text-right font-mono">{pallet.kilos.toLocaleString('es-UY')}</td>
      <td className="px-2 py-1 max-w-[200px] truncate" title={pallet.contenido}>{pallet.contenido}</td>
      <td className="px-2 py-1 font-mono">{pallet.nroLote || '-'}</td>
      <td className="px-2 py-1">{pallet.fechaVencimiento ? fd(pallet.fechaVencimiento) : '-'}</td>
      <td className="px-2 py-1">
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-violet-700 border-violet-300 hover:bg-violet-50" onClick={() => setAssigning(true)}>
          <ArrowLeftRight className="h-3 w-3 mr-0.5" />Asignar
        </Button>
      </td>
    </tr>
  );
}

// --- Inline Edit Codigo Component ---
function InlineEditCodigo({ value, allCodes, onSave }: {
  value: string;
  allCodes: string[];
  onSave: (newCode: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    const trimmed = editValue.trim().toUpperCase();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          className="h-6 w-[110px] text-[11px] font-mono"
          value={editValue}
          onChange={e => setEditValue(e.target.value.toUpperCase())}
          onBlur={handleSave}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') { setEditing(false); setEditValue(value); }
          }}
          autoFocus
          list={`inline-codes-${value}`}
        />
        <datalist id={`inline-codes-${value}`}>
          {allCodes.map(c => <option key={c} value={c} />)}
        </datalist>
      </div>
    );
  }

  return (
    <button
      className="hover:bg-teal-100 hover:underline px-1 py-0.5 rounded transition-colors cursor-pointer group/code inline-flex items-center gap-1"
      onClick={() => { setEditing(true); setEditValue(value); }}
      title="Click para editar codigo"
    >
      {value}
      <Pencil className="h-2.5 w-2.5 text-teal-400 opacity-0 group-hover/code:opacity-100 transition-opacity" />
    </button>
  );
}

// --- Stock Table Component ---
function StockTable({ stockAggMap, ingresoMap, cruceRows, sinCruceRows, edits, onAssignPallet, onAddIngresoFromStock, onRenameCodigo, onUnlinkCote, onEditObs }: {
  stockAggMap: Map<string, StockCodigoAgg>;
  ingresoMap: Map<string, IngresoAgg>;
  cruceRows: CruceRow[];
  sinCruceRows: SinCruceRow[];
  edits: EditsStore;
  onAssignPallet: (palletId: string, codigo: string, tipo: 'COTE' | 'PASE_SANITARIO') => void;
  onAddIngresoFromStock: (codigo: string, cajas: number, producto: string) => void;
  onRenameCodigo: (palletId: string, newCodigo: string) => void;
  onUnlinkCote: (expId: string, coteToRemove: string) => void;
  onEditObs: (expId: string) => void;
}) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'con_ingreso' | 'sin_ingreso' | 'con_diff' | 'sin_codigo'>('all');

  // Build export cajas map: ingreso COTE -> total cajas exported
  // Also track the breakdown: COTE -> list of { expCote, tramite, cajas, fecha, pais, isManual }
  const exportCajasMap = useMemo(() => {
    const map = new Map<string, number>();
    // From cruceRows (exports matched to ingreso COTEs)
    for (const r of cruceRows) {
      if (r.isManualLink && edits.exports[r.exp.id]?.manualCotes) {
        // Manual: use exact cajas per COTE
        for (const mc of edits.exports[r.exp.id].manualCotes!) {
          map.set(mc.cote, (map.get(mc.cote) || 0) + mc.cajas);
        }
      } else if (r.ingresoCotes.length > 0) {
        // Automatic: distribute export cajas proportionally by ingreso envases
        const totalIngCajas = r.ingresoCotes.reduce((s, c) => s + (ingresoMap.get(c)?.envases || 0), 0);
        for (const c of r.ingresoCotes) {
          let share: number;
          if (totalIngCajas > 0) {
            const ingCajas = ingresoMap.get(c)?.envases || 0;
            share = Math.round(r.envasesExp * ingCajas / totalIngCajas);
          } else {
            // No ingreso cajas info — split evenly
            share = Math.floor(r.envasesExp / r.ingresoCotes.length);
          }
          map.set(c, (map.get(c) || 0) + share);
        }
      }
    }
    // From sinCruceRows with manual cotes
    for (const r of sinCruceRows) {
      const mc = edits.exports[r.exp.id]?.manualCotes;
      if (mc) {
        for (const link of mc) {
          map.set(link.cote, (map.get(link.cote) || 0) + link.cajas);
        }
      }
    }
    return map;
  }, [cruceRows, sinCruceRows, edits, ingresoMap]);

  // Build export breakdown: COTE -> list of exports that reference it
  const exportBreakdownMap = useMemo(() => {
    const map = new Map<string, Array<{ expId: string; expCote: string; tramite: number; fecha: string; pais: string; cajas: number; isManual: boolean }>>();
    for (const r of cruceRows) {
      if (r.isManualLink && edits.exports[r.exp.id]?.manualCotes) {
        for (const mc of edits.exports[r.exp.id].manualCotes!) {
          if (!map.has(mc.cote)) map.set(mc.cote, []);
          map.get(mc.cote)!.push({ expId: r.exp.id, expCote: r.exp.nroCote, tramite: r.exp.nroTramite, fecha: r.exp.fechaTramite, pais: r.exp.paisDestino, cajas: mc.cajas, isManual: true });
        }
      } else if (r.ingresoCotes.length > 0) {
        const totalIngCajas = r.ingresoCotes.reduce((s, c) => s + (ingresoMap.get(c)?.envases || 0), 0);
        for (const c of r.ingresoCotes) {
          let share: number;
          if (totalIngCajas > 0) {
            const ingCajas = ingresoMap.get(c)?.envases || 0;
            share = Math.round(r.envasesExp * ingCajas / totalIngCajas);
          } else {
            share = Math.floor(r.envasesExp / r.ingresoCotes.length);
          }
          if (!map.has(c)) map.set(c, []);
          map.get(c)!.push({ expId: r.exp.id, expCote: r.exp.nroCote, tramite: r.exp.nroTramite, fecha: r.exp.fechaTramite, pais: r.exp.paisDestino, cajas: share, isManual: false });
        }
      }
    }
    for (const r of sinCruceRows) {
      const mc = edits.exports[r.exp.id]?.manualCotes;
      if (mc) {
        for (const link of mc) {
          if (!map.has(link.cote)) map.set(link.cote, []);
          map.get(link.cote)!.push({ expId: r.exp.id, expCote: r.exp.nroCote, tramite: r.exp.nroTramite, fecha: r.exp.fechaTramite, pais: r.exp.paisDestino, cajas: link.cajas, isManual: true });
        }
      }
    }
    return map;
  }, [cruceRows, sinCruceRows, edits, ingresoMap]);

  // Separate S/PASE/COTE from the rest
  const sinCodigoAgg = stockAggMap.get(SIN_CODIGO_KEY);
  const regularAggMap = useMemo(() => {
    const m = new Map<string, StockCodigoAgg>();
    for (const [k, v] of stockAggMap) {
      if (k !== SIN_CODIGO_KEY) m.set(k, v);
    }
    return m;
  }, [stockAggMap]);

  // Build list from regularAggMap (excluding S/PASE/COTE)
  const stockList = useMemo(() => {
    let items = [...regularAggMap.values()];

    if (stockSearch) {
      const s = stockSearch.toLowerCase();
      items = items.filter(a =>
        a.codigo.toLowerCase().includes(s) ||
        a.producto.toLowerCase().includes(s) ||
        a.contenedores.some(c => c.toLowerCase().includes(s))
      );
    }

    if (stockFilter === 'con_ingreso') {
      items = items.filter(a => ingresoMap.has(a.codigo));
    } else if (stockFilter === 'sin_ingreso') {
      items = items.filter(a => !ingresoMap.has(a.codigo));
    } else if (stockFilter === 'con_diff') {
      items = items.filter(a => {
        const ing = ingresoMap.get(a.codigo);
        if (!ing) return false;
        const expCajas = exportCajasMap.get(a.codigo) || 0;
        const saldo = ing.envases - expCajas;
        return Math.abs(a.totalCajas - saldo) > 0;
      });
    }

    items.sort((a, b) => b.totalKilos - a.totalKilos);
    return items;
  }, [regularAggMap, ingresoMap, stockSearch, stockFilter, exportCajasMap]);

  // All known codes for the datalist in assignment
  const allKnownCodes = useMemo(() => {
    return [...ingresoMap.keys(), ...regularAggMap.keys()].sort();
  }, [ingresoMap, regularAggMap]);

  const totalConIngreso = [...regularAggMap.values()].filter(a => ingresoMap.has(a.codigo)).length;
  const totalSinIngreso = regularAggMap.size - totalConIngreso;
  const totalCajasStock = [...stockAggMap.values()].reduce((s, a) => s + a.totalCajas, 0);
  const totalCajasIngreso = [...regularAggMap.values()].reduce((s, a) => { const ing = ingresoMap.get(a.codigo); return s + (ing?.envases || 0); }, 0);
  const totalCajasExport = [...regularAggMap.values()].reduce((s, a) => s + (exportCajasMap.get(a.codigo) || 0), 0);
  const totalSaldoTeorico = totalCajasIngreso - totalCajasExport;

  const isSinCodigoFilter = stockFilter === 'sin_codigo';

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Buscar codigo, producto, contenedor..."
            value={stockSearch} onChange={e => setStockSearch(e.target.value)} className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={stockFilter} onValueChange={v => setStockFilter(v as typeof stockFilter)}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Filtrar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({regularAggMap.size}{sinCodigoAgg ? ` + S/PASE/COTE` : ''})</SelectItem>
            <SelectItem value="sin_codigo">S/PASE/COTE ({sinCodigoAgg ? sinCodigoAgg.totalPallets : 0} pal.)</SelectItem>
            <SelectItem value="con_ingreso">Con ingreso ({totalConIngreso})</SelectItem>
            <SelectItem value="sin_ingreso">Sin ingreso ({totalSinIngreso})</SelectItem>
            <SelectItem value="con_diff">Con diferencia</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-slate-500 space-x-2">
          <span>{regularAggMap.size + (sinCodigoAgg ? 1 : 0)} codigos</span>
          <span className="text-slate-300">|</span>
          <span>Stock: <b className="text-teal-700">{totalCajasStock.toLocaleString('es-UY')}</b></span>
          <span className="text-slate-300">|</span>
          <span>Ingreso: <b className="text-emerald-700">{totalCajasIngreso.toLocaleString('es-UY')}</b></span>
          <span className="text-slate-300">|</span>
          <span>Export: <b className="text-blue-700">{totalCajasExport.toLocaleString('es-UY')}</b></span>
          <span className="text-slate-300">|</span>
          <span>Saldo teorico: <b className={totalSaldoTeorico < 0 ? 'text-red-600' : 'text-violet-700'}>{totalSaldoTeorico.toLocaleString('es-UY')}</b></span>
        </div>
      </div>

      {/* S/PASE/COTE section - show first when filtered or always at top */}
      {sinCodigoAgg && (isSinCodigoFilter || stockFilter === 'all') && (
        <div className="mb-3">
          <div
            className={`border rounded-lg overflow-hidden ${isSinCodigoFilter ? '' : 'border-amber-200 bg-amber-50/30'}`}
          >
            <div
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-amber-50/60 transition-colors ${expandedCode === SIN_CODIGO_KEY ? 'bg-amber-50/60' : ''}`}
              onClick={() => setExpandedCode(expandedCode === SIN_CODIGO_KEY ? null : SIN_CODIGO_KEY)}
            >
              <ChevronRight className={`h-4 w-4 text-amber-600 transition-transform flex-shrink-0 ${expandedCode === SIN_CODIGO_KEY ? 'rotate-90' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-amber-800">S/PASE/COTE</span>
                  <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">SIN IDENTIFICAR</span>
                </div>
                <div className="text-[11px] text-amber-700 mt-0.5">
                  {sinCodigoAgg.totalPallets} pallets &middot; {sinCodigoAgg.totalCajas.toLocaleString('es-UY')} cajas &middot; {sinCodigoAgg.totalKilos.toLocaleString('es-UY')} kg
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-amber-600">Podes asignar un COTE/PASE a cada pallet expandiendo</span>
                <ArrowLeftRight className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            {expandedCode === SIN_CODIGO_KEY && (
              <div className="border-t border-amber-200 bg-white">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-amber-100">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-amber-800">Contenedor</th>
                        <th className="px-2 py-1.5 text-left text-amber-800">Fec Ent</th>
                        <th className="px-2 py-1.5 text-right text-amber-800">Cajas</th>
                        <th className="px-2 py-1.5 text-right text-amber-800">Kg</th>
                        <th className="px-2 py-1.5 text-left text-amber-800">Contenido</th>
                        <th className="px-2 py-1.5 text-left text-amber-800">Lote</th>
                        <th className="px-2 py-1.5 text-left text-amber-800">Venc.</th>
                        <th className="px-2 py-1.5 text-center text-amber-800 w-[200px]">Asignar COTE/PASE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sinCodigoAgg.pallets.map(p => (
                        <PalletAssignRow key={p.id} pallet={p} allCodes={allKnownCodes} onAssign={onAssignPallet} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regular stock table (hide when filtering S/PASE/COTE only) */}
      {!isSinCodigoFilter && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <th className="px-3 py-2.5">Codigo</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5 hidden lg:table-cell">Producto</th>
              <th className="px-3 py-2.5 hidden xl:table-cell">Contenedores</th>
              <th className="px-3 py-2.5 text-right">Pallets</th>
              <th className="px-3 py-2.5 text-right">Cajas Ingreso</th>
              <th className="px-3 py-2.5 text-right">Cajas Export.</th>
              <th className="px-3 py-2.5 text-right">Saldo Teorico</th>
              <th className="px-3 py-2.5 text-right">Cajas Stock</th>
              <th className="px-3 py-2.5 text-right">Diff Stock/Saldo</th>
              <th className="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {stockList.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-10 text-slate-400">No se encontraron codigos</td></tr>
            ) : stockList.map(agg => {
              const ing = ingresoMap.get(agg.codigo);
              const expCajas = exportCajasMap.get(agg.codigo) || 0;
              const saldoTeorico = ing ? ing.envases - expCajas : null;
              const diffStockSaldo = saldoTeorico !== null ? agg.totalCajas - saldoTeorico : null;

              return (
                <React.Fragment key={agg._groupKey || agg.codigo}>
                  <tr className={`border-b hover:bg-teal-50/40 ${expandedCode === (agg._groupKey || agg.codigo) ? 'bg-teal-50/60' : ''}`}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-teal-700">
                      <InlineEditCodigo value={agg.codigo} allCodes={allKnownCodes} onSave={(newCode) => {
                        // Rename all pallets with this codigo
                        for (const p of agg.pallets) {
                          onRenameCodigo(p.id, newCode);
                        }
                      }} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${agg.tipo === 'COTE' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {agg.tipo === 'COTE' ? 'COTE' : 'PASE'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate" title={agg.producto}>{agg.producto}</td>
                    <td className="px-3 py-2.5 text-xs hidden xl:table-cell max-w-[150px] truncate">{agg.contenedores.join(', ') || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">{agg.totalPallets}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">
                      {ing ? (
                        <span className="text-emerald-700">{ing.envases.toLocaleString('es-UY')}</span>
                      ) : (edits.ingresosManuales || []).some(m => m.cote === agg.codigo) ? (
                        <span className="text-emerald-600 text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded" title="Creado manualmente">{((edits.ingresosManuales || []).find(m => m.cote === agg.codigo)?.envases || 0).toLocaleString('es-UY')} <span className="text-emerald-400">*</span></span>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onAddIngresoFromStock(agg.codigo, agg.totalCajas, agg.producto); }}
                          title="Crear ingreso para este COTE"
                        >
                          <Plus className="h-3 w-3" />
                          +{agg.totalCajas.toLocaleString('es-UY')}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">
                      {expCajas > 0 ? (
                        <span className="text-blue-700">{expCajas.toLocaleString('es-UY')}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">
                      {saldoTeorico !== null ? (
                        <span className={saldoTeorico < 0 ? 'text-red-600 font-medium' : 'text-violet-700 font-medium'}>
                          {saldoTeorico.toLocaleString('es-UY')}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono font-medium text-teal-700">{agg.totalCajas.toLocaleString('es-UY')}</td>
                    <td className="px-3 py-2.5 text-right">
                      {diffStockSaldo !== null ? (
                        <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          Math.abs(diffStockSaldo) === 0 ? 'bg-emerald-50 text-emerald-700' :
                          diffStockSaldo < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {Math.abs(diffStockSaldo) === 0 ? '0' : (diffStockSaldo > 0 ? '+' : '') + diffStockSaldo}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        className="p-1 rounded hover:bg-slate-100"
                        onClick={() => setExpandedCode(expandedCode === (agg._groupKey || agg.codigo) ? null : (agg._groupKey || agg.codigo))}
                      >
                        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedCode === (agg._groupKey || agg.codigo) ? 'rotate-90' : ''}`} />
                      </button>
                    </td>
                  </tr>
                  {expandedCode === (agg._groupKey || agg.codigo) && (
                    <tr className="border-b bg-teal-50/30">
                      <td colSpan={11} className="px-4 py-3">
                        <div className="space-y-3">
                          {/* Resumen saldo */}
                          {ing && (
                            <div className="bg-violet-50 rounded-lg p-3">
                              <p className="text-[10px] text-violet-600 uppercase font-bold mb-2">Resumen de saldo</p>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                                <div><span className="text-slate-500">Cajas Stock:</span> <span className="font-mono font-medium text-teal-700">{agg.totalCajas.toLocaleString('es-UY')}</span></div>
                                <div><span className="text-slate-500">Cajas Ingreso:</span> <span className="font-mono font-medium text-emerald-700">{ing.envases.toLocaleString('es-UY')}</span></div>
                                <div><span className="text-slate-500">Cajas Export.:</span> <span className="font-mono font-medium text-blue-700">{expCajas.toLocaleString('es-UY')}</span></div>
                                <div><span className="text-slate-500">Saldo Teorico:</span> <span className={`font-mono font-bold ${saldoTeorico! < 0 ? 'text-red-600' : 'text-violet-700'}`}>{(ing.envases - expCajas).toLocaleString('es-UY')}</span></div>
                                <div><span className="text-slate-500">Diff:</span> <span className={`font-mono font-bold ${Math.abs(diffStockSaldo!) === 0 ? 'text-emerald-600' : diffStockSaldo! < 0 ? 'text-red-600' : 'text-amber-600'}`}>{diffStockSaldo === 0 ? '0' : (diffStockSaldo! > 0 ? '+' : '') + diffStockSaldo}</span></div>
                              </div>
                            </div>
                          )}

                          {/* Ingreso info if found */}
                          {ing && (
                            <div className="bg-emerald-50 rounded-lg p-3">
                              <p className="text-[10px] text-emerald-600 uppercase font-bold mb-1">Ingreso vinculado</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div><span className="text-slate-500">Tramite:</span> <span className="font-mono">{ing.tramite}</span></div>
                                <div><span className="text-slate-500">Fecha:</span> <span>{fd(ing.fecha)}</span></div>
                                <div><span className="text-slate-500">Cajas:</span> <span className="font-mono font-medium text-emerald-700">{ing.envases.toLocaleString('es-UY')}</span></div>
                                <div><span className="text-slate-500">Kg Neto:</span> <span className="font-mono">{ing.pesoNeto.toLocaleString('es-UY')}</span></div>
                              </div>
                              <div className="text-[11px] text-slate-600 mt-1">
                                <span className="text-slate-500">Producto:</span> {ing.producto}
                                {ing.cortes.length > 0 && <span className="text-slate-500 ml-3">Cortes: {ing.cortes.join(', ')}</span>}
                              </div>
                            </div>
                          )}

                          {/* Export breakdown — shows which exports contribute to Cajas Export. */}
                          {(() => {
                            const breakdown = exportBreakdownMap.get(agg.codigo);
                            if (!breakdown || breakdown.length === 0) return null;
                            return (
                              <div className="bg-blue-50 rounded-lg p-3">
                                <p className="text-[10px] text-blue-600 uppercase font-bold mb-1">
                                  Exportaciones que referencian {agg.codigo} ({breakdown.length})
                                </p>
                                <div className="max-h-60 overflow-y-auto">
                                  <table className="w-full text-[11px]">
                                    <thead className="sticky top-0 bg-blue-100">
                                      <tr>
                                        <th className="px-2 py-1 text-left text-blue-800">COTE Exp.</th>
                                        <th className="px-2 py-1 text-left text-blue-800">Tramite</th>
                                        <th className="px-2 py-1 text-left text-blue-800">Fecha</th>
                                        <th className="px-2 py-1 text-left text-blue-800">Pais</th>
                                        <th className="px-2 py-1 text-right text-blue-800">Cajas</th>
                                        <th className="px-2 py-1 text-left text-blue-800">Tipo</th>
                                        <th className="px-2 py-1 text-center text-blue-800 w-[120px]">Acciones</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {breakdown.map((b, i) => (
                                        <tr key={i} className="border-t border-blue-200">
                                          <td className="px-2 py-1 font-mono font-medium text-blue-700">{b.expCote}</td>
                                          <td className="px-2 py-1 font-mono">{b.tramite}</td>
                                          <td className="px-2 py-1">{fd(b.fecha)}</td>
                                          <td className="px-2 py-1">{b.pais}</td>
                                          <td className="px-2 py-1 text-right font-mono font-medium text-blue-700">{b.cajas.toLocaleString('es-UY')}</td>
                                          <td className="px-2 py-1">
                                            {b.isManual ? (
                                              <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700">MANUAL</span>
                                            ) : (
                                              <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600">AUTO</span>
                                            )}
                                          </td>
                                          <td className="px-2 py-1 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                              <button
                                                className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                                                onClick={() => onUnlinkCote(b.expId, agg.codigo)}
                                                title="Desvincular este COTE de esta exportacion"
                                              >
                                                <Unlink className="h-2.5 w-2.5" />
                                                Desvincular
                                              </button>
                                              <button
                                                className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                                                onClick={() => onEditObs(b.expId)}
                                                title="Editar observaciones de esta exportacion"
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                                Editar Obs.
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-blue-300 bg-blue-100/50">
                                        <td colSpan={4} className="px-2 py-1 text-right font-bold text-blue-800">Total</td>
                                        <td className="px-2 py-1 text-right font-mono font-bold text-blue-800">{breakdown.reduce((s, b) => s + b.cajas, 0).toLocaleString('es-UY')}</td>
                                        <td colSpan={2}></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                                <p className="text-[10px] text-blue-500 mt-1">
                                  AUTO = cajas distribuidas proporcionalmente. MANUAL = cajas especificadas. Si un COTE esta mal vinculado, usa "Desvincular" para removerlo de las observaciones.
                                </p>
                              </div>
                            );
                          })()}
                          {!ing && (
                            (() => {
                              const manual = (edits.ingresosManuales || []).find(m => m.cote === agg.codigo);
                              return (
                              <div className="bg-amber-50 rounded-lg p-3 text-[11px] text-amber-700 space-y-2">
                                {manual ? (
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    <span className="text-emerald-700">{agg.codigo} ya fue creado como ingreso manual ({manual.envases} cajas, tramite {manual.tramite})</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span>Este codigo no tiene un ingreso registrado en los depositos de Caliral.</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <Package className="h-3.5 w-3.5" />
                                        Stock: <b>{agg.totalCajas.toLocaleString('es-UY')}</b> cajas
                                      </div>
                                      <Button
                                        size="sm"
                                        className="h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-white"
                                        onClick={() => onAddIngresoFromStock(agg.codigo, agg.totalCajas, agg.producto)}
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Crear ingreso con {agg.totalCajas.toLocaleString('es-UY')} cajas
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                              );
                            })()
                          )}

                          {/* Pallet details */}
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Pallets en stock ({agg.pallets.length}) — click en el codigo para editar</p>
                            <div className="max-h-64 overflow-y-auto border rounded">
                              <table className="w-full text-[11px]">
                                <thead className="sticky top-0 bg-slate-100">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Codigo</th>
                                    <th className="px-2 py-1 text-left">Contenedor</th>
                                    <th className="px-2 py-1 text-left">Fec Ent</th>
                                    <th className="px-2 py-1 text-right">Cajas</th>
                                    <th className="px-2 py-1 text-right">Kg</th>
                                    <th className="px-2 py-1 text-left">Contenido</th>
                                    <th className="px-2 py-1 text-left">Lote</th>
                                    <th className="px-2 py-1 text-left">Venc.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {agg.pallets.map(p => (
                                    <tr key={p.id} className="border-t hover:bg-white/50">
                                      <td className="px-2 py-1">
                                        <InlineEditCodigo value={agg.codigo} allCodes={allKnownCodes} onSave={(newCode) => onRenameCodigo(p.id, newCode)} />
                                      </td>
                                      <td className="px-2 py-1 font-mono">{p.contenedor || '-'}</td>
                                      <td className="px-2 py-1">{p.fechaEntrega ? fd(p.fechaEntrega) : '-'}</td>
                                      <td className="px-2 py-1 text-right font-mono">{p.cajas.toLocaleString('es-UY')}</td>
                                      <td className="px-2 py-1 text-right font-mono">{p.kilos.toLocaleString('es-UY')}</td>
                                      <td className="px-2 py-1 max-w-[300px] truncate" title={p.contenido}>{p.contenido}</td>
                                      <td className="px-2 py-1 font-mono">{p.nroLote || '-'}</td>
                                      <td className="px-2 py-1">{p.fechaVencimiento ? fd(p.fechaVencimiento) : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// --- Component ---
export default function CruceCaliral() {
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'cruce' | 'sincruce' | 'pendientes' | 'stock'>('cruce');
  const { activeTab, setActiveTab, setCruceNav, consumeCruceNav } = useAppStore(useShallow(selectCruceCaliralFields));

  // Stock state
  const [stockData, setStockData] = useState<StockLoad | null>(null);
  const [stockAggMap, setStockAggMap] = useState<Map<string, StockCodigoAgg>>(new Map());
  const [stockLoading, setStockLoading] = useState(false);
  const [palletAssignments, setPalletAssignments] = useState<Record<string, { codigo: string; tipo: 'COTE' | 'PASE_SANITARIO' }>>({});

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pais, setPais] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroProducto, setFiltroProducto] = useState('');
  const [filtroCorte, setFiltroCorte] = useState('');

  // Debounce search: input updates instantly, filtering delays 300ms
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  }, []);
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  const [page, setPage] = useState(1);
  const limit = 20;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<CruceRow | SinCruceRow | IngresoPendienteRow | null>(null);
  const [ingresoDetailCote, setIngresoDetailCote] = useState<string | null>(null);

  const [paises, setPaises] = useState<string[]>([]);
  const [productos, setProductos] = useState<string[]>([]);
  const [cortes, setCortes] = useState<string[]>([]);

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
  const [ni_lineas, setNi_lineas] = useState<ProductoCorteLine[]>([{ id: '1', producto: '', corte: '', cajas: '' }]);

  // MGAP import state
  const [mgapPaste, setMgapPaste] = useState('');
  const [showMgapImport, setShowMgapImport] = useState(true);
  const [mgapExportPaste, setMgapExportPaste] = useState('');
  const [showMgapExportImport, setShowMgapExportImport] = useState(true);
  // Main page MGAP import
  const [mainMgapPaste, setMainMgapPaste] = useState('');
  const [showMainMgap, setShowMainMgap] = useState(false);

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
  const [ne_lineas, setNe_lineas] = useState<ProductoCorteLine[]>([{ id: '1', producto: '', corte: '', cajas: '' }]);

  // Lineas helper functions for ingreso
  const addNiLinea = () => setNi_lineas(prev => [...prev, { id: String(Date.now()), producto: '', corte: '', cajas: '' }]);
  const removeNiLinea = (id: string) => setNi_lineas(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  const updateNiLinea = (id: string, field: 'producto' | 'corte' | 'cajas', value: string) => {
    setNi_lineas(prev => prev.map(l => l.id === id ? { ...l, [field]: field === 'cajas' ? (value === '' ? '' : parseInt(value) || 0) : value } : l));
  };

  // Lineas helper functions for export
  const addNeLinea = () => setNe_lineas(prev => [...prev, { id: String(Date.now()), producto: '', corte: '', cajas: '' }]);
  const removeNeLinea = (id: string) => setNe_lineas(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  const updateNeLinea = (id: string, field: 'producto' | 'corte' | 'cajas', value: string) => {
    setNe_lineas(prev => prev.map(l => l.id === id ? { ...l, [field]: field === 'cajas' ? (value === '' ? '' : parseInt(value) || 0) : value } : l));
  };

  // Process MGAP pasted content for ingreso
  const processMgapImport = () => {
    const parsed = parseMgapContent(mgapPaste);
    const filled: string[] = [];
    if (parsed.cote) { setNi_cote(parsed.cote); filled.push('COTE'); }
    if (parsed.tramite) { setNi_tramite(String(parsed.tramite)); filled.push('Tramite'); }
    if (parsed.fecha) { setNi_fecha(parsed.fecha); filled.push('Fecha'); }
    if (parsed.producto) { setNi_producto(parsed.producto); setNi_lineas(prev => [{ ...prev[0], producto: parsed.producto || prev[0].producto }]); filled.push('Producto'); }
    if (parsed.cajas) { setNi_cajas(String(parsed.cajas)); filled.push('Cajas'); }
    if (parsed.pesoNeto) { setNi_pesoNeto(String(parsed.pesoNeto)); filled.push('Kg Neto'); }
    if (parsed.pesoBruto) { setNi_pesoBruto(String(parsed.pesoBruto)); filled.push('Kg Bruto'); }
    if (filled.length > 0) {
      toast.success(`Campos completados: ${filled.join(', ')}`);
      setShowMgapImport(false);
      setMgapPaste('');
    } else {
      toast.error('No se pudieron extraer datos. Copia el contenido de la pagina del MGAP (Ctrl+A, Ctrl+C) y pegalo aqui.');
    }
  };

  // Process MGAP pasted content for export
  const processMgapExportImport = () => {
    const parsed = parseMgapContent(mgapExportPaste);
    const filled: string[] = [];
    if (parsed.cote) { setNe_nroCote(parsed.cote); filled.push('COTE'); }
    if (parsed.tramite) { setNe_nroTramite(String(parsed.tramite)); filled.push('Tramite'); }
    if (parsed.fecha) { setNe_fecha(parsed.fecha); filled.push('Fecha'); }
    if (parsed.pais) { setNe_pais(parsed.pais); filled.push('Pais'); }
    if (parsed.producto) { setNe_producto(parsed.producto); setNe_lineas(prev => [{ ...prev[0], producto: parsed.producto || prev[0].producto }]); filled.push('Producto'); }
    if (parsed.corte) { setNe_corte(parsed.corte); filled.push('Corte'); }
    if (parsed.cajas) { setNe_cajas(String(parsed.cajas)); filled.push('Cajas'); }
    if (parsed.pesoNeto) { setNe_pesoNeto(String(parsed.pesoNeto)); filled.push('Kg Neto'); }
    if (filled.length > 0) {
      toast.success(`Campos completados: ${filled.join(', ')}`);
      setShowMgapExportImport(false);
      setMgapExportPaste('');
    } else {
      toast.error('No se pudieron extraer datos. Copia el contenido de la pagina del MGAP (Ctrl+A, Ctrl+C) y pegalo aqui.');
    }
  };

  // Main page MGAP: paste content → auto-open the right form with data filled
  const processMainMgap = () => {
    const parsed = parseMgapContent(mainMgapPaste);
    if (!parsed.cote && !parsed.tramite) {
      toast.error('No se pudieron extraer datos del contenido pegado.');
      return;
    }
    // Check if this looks like an ingreso (has product but no country) or export (has country)
    const isIngreso = !parsed.pais && parsed.producto;
    if (isIngreso) {
      // Fill ingreso form and open
      if (parsed.cote) setNi_cote(parsed.cote);
      if (parsed.tramite) setNi_tramite(String(parsed.tramite));
      if (parsed.fecha) setNi_fecha(parsed.fecha);
      if (parsed.producto) setNi_producto(parsed.producto);
      if (parsed.cajas) setNi_cajas(String(parsed.cajas));
      if (parsed.pesoNeto) setNi_pesoNeto(String(parsed.pesoNeto));
      if (parsed.pesoBruto) setNi_pesoBruto(String(parsed.pesoBruto));
      setAddIngresoOpen(true);
      setShowMgapImport(false);
    } else {
      // Fill export form and open
      if (parsed.cote) setNe_nroCote(parsed.cote);
      if (parsed.tramite) setNe_nroTramite(String(parsed.tramite));
      if (parsed.fecha) setNe_fecha(parsed.fecha);
      if (parsed.pais) setNe_pais(parsed.pais);
      if (parsed.producto) setNe_producto(parsed.producto);
      if (parsed.corte) setNe_corte(parsed.corte);
      if (parsed.cajas) setNe_cajas(String(parsed.cajas));
      if (parsed.pesoNeto) setNe_pesoNeto(String(parsed.pesoNeto));
      setAddExpOpen(true);
      setShowMgapExportImport(false);
    }
    const filled = [parsed.cote && 'COTE', parsed.tramite && 'Tramite', parsed.fecha && 'Fecha', parsed.producto && 'Producto', parsed.cajas && 'Cajas', parsed.pesoNeto && 'Kg'].filter(Boolean);
    toast.success(`MGAP: ${isIngreso ? 'Ingreso' : 'Exportacion'} detectada. Campos: ${filled.join(', ')}`);
    setMainMgapPaste('');
    setShowMainMgap(false);
  };

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
      nombreEstablecimientoDestino: (me as unknown as unknown as Record<string, unknown>).nombreEstablecimientoDestino as string || '',
      tipo: (me as unknown as unknown as Record<string, unknown>).tipo as string || 'EXPORTACION',
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
        const totalEnvasesIngreso = aggs.reduce((s, a) => s + a.envases, 0);
        const manualCajasUsadas = isManual
          ? foundInCaliral.reduce((s, c) => s + (c.cajas > 0 ? c.cajas : 0), 0)
          : 0;
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
          manualCajasUsadas: isManual ? manualCajasUsadas : undefined,
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
    setProductos([...new Set(editedExports.map(e => e.denominacionMercaderia).filter(Boolean))].sort());
    setCortes([...new Set(editedExports.map(e => e.corte).filter(Boolean))].sort());
  }, []);

  // Consume navigation from other components (Dashboard KPI clicks, etc.)
  const cruceNavConsumed = useRef(false);
  useEffect(() => {
    if (cruceNavConsumed.current) return;
    const nav = consumeCruceNav();
    if (nav.subTab !== 'cruce' || nav.search) {
      setSubTab(nav.subTab);
      if (nav.search) {
        setSearch(nav.search);
        setSearchInput(nav.search);
      }
      cruceNavConsumed.current = true;
    }
  }, [consumeCruceNav]);

  // Also consume when the tab switches TO cruce-caliral
  useEffect(() => {
    if (activeTab === 'cruce-caliral') {
      cruceNavConsumed.current = false;
      const nav = consumeCruceNav();
      if (nav.subTab !== 'cruce' || nav.search) {
        setSubTab(nav.subTab);
        if (nav.search) {
          setSearch(nav.search);
          setSearchInput(nav.search);
        }
      }
      // Force reload stock from localStorage every time tab is activated
      try {
        const savedStock = localStorage.getItem('trazabilidad_stock_data');
        if (savedStock) {
          const load = JSON.parse(savedStock) as StockLoad;
          setStockData(prev => {
            // Only update if different (avoid infinite loops)
            if (prev && prev.pallets.length === load.pallets.length) return prev;
            return load;
          });
        }
      } catch { /* ignore */ }
    }
  }, [activeTab, consumeCruceNav]);

  useEffect(() => {
    (async () => {
      try {
        await ensureData(true);
      } catch (err) {
        console.error('Error cargando datos de Cruces Frimaral:', err);
      }
      const loadedEdits = loadEdits();
      setEdits(loadedEdits);
      recomputeCruce(loadedEdits);
      setLoading(false);
      // Load saved stock data
      try {
        const savedStock = localStorage.getItem('trazabilidad_stock_data');
        if (savedStock) {
          const load = JSON.parse(savedStock) as StockLoad;
          setStockData(load);
        }
      } catch { /* ignore */ }
      // Load pallet assignments
      try {
        const savedAssign = localStorage.getItem('trazabilidad_stock_assignments');
        if (savedAssign) {
          setPalletAssignments(JSON.parse(savedAssign));
        }
      } catch { /* ignore */ }
    })();
  }, [recomputeCruce]);

  // Listen for Firebase data-ready event and reload stock + assignments
  useEffect(() => {
    const handler = () => {
      try {
        const savedStock = localStorage.getItem('trazabilidad_stock_data');
        if (savedStock) {
          const load = JSON.parse(savedStock) as StockLoad;
          setStockData(load);
        } else {
          setStockData(null);
        }
      } catch { /* ignore */ }
      try {
        const savedAssign = localStorage.getItem('trazabilidad_stock_assignments');
        if (savedAssign) {
          setPalletAssignments(JSON.parse(savedAssign));
        } else {
          setPalletAssignments({});
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('trazabilidad-data-ready', handler);
    return () => window.removeEventListener('trazabilidad-data-ready', handler);
  }, []);

  // --- Rebuild stock map with assignments applied ---
  const rebuildStockMap = useCallback((data: StockLoad | null, assignments: Record<string, { codigo: string; tipo: 'COTE' | 'PASE_SANITARIO' }>) => {
    if (!data) { setStockAggMap(new Map()); return; }
    const modified = data.pallets.map(p => {
      const a = assignments[p.id];
      if (a) return { ...p, codigo: a.codigo, codigoTipo: a.tipo };
      return p;
    });
    setStockAggMap(buildStockAggMap(modified));
  }, []);

  // Rebuild stock map when stockData or assignments change
  useEffect(() => {
    rebuildStockMap(stockData, palletAssignments);
  }, [stockData, palletAssignments, rebuildStockMap]);

  // --- Handle pallet assignment ---
  const handleAssignPallet = useCallback((palletId: string, codigo: string, tipo: 'COTE' | 'PASE_SANITARIO') => {
    setPalletAssignments(prev => {
      const next = { ...prev, [palletId]: { codigo, tipo } };
      localStorage.setItem('trazabilidad_stock_assignments', JSON.stringify(next));
      return next;
    });
    toast.success(`Pallet asignado a ${codigo}`);
  }, []);

  // Rename a pallet's codigo (for fixing e.g. "15070" → "P15070")
  const handleRenameStockCodigo = useCallback((palletId: string, newCodigo: string) => {
    if (!stockData) return;
    const tipo: 'COTE' | 'PASE_SANITARIO' = newCodigo.startsWith('B') ? 'PASE_SANITARIO' : 'COTE';
    // Update pallet assignments (this is how we override the parsed codigo)
    setPalletAssignments(prev => {
      const next = { ...prev, [palletId]: { codigo: newCodigo, tipo } };
      localStorage.setItem('trazabilidad_stock_assignments', JSON.stringify(next));
      return next;
    });
    toast.success(`Codigo cambiado a ${newCodigo}`);
  }, [stockData]);

  // Unlink a COTE from an export's observaciones (removes the COTE text from obs)
  const handleUnlinkCote = useCallback((expId: string, coteToRemove: string) => {
    // Find the export in cruceRows or sinCruceRows
    const allRows = [...cruceRows, ...sinCruceRows];
    const row = allRows.find(r => r.exp.id === expId);
    if (!row) return;
    const exp = row.exp;
    const currentObs = edits.exports[expId]?.observaciones ?? exp.observaciones ?? '';
    // Remove the COTE from observaciones
    const newObs = currentObs.replace(new RegExp(coteToRemove, 'gi'), '').replace(/\s{2,}/g, ' ').trim();
    const ne = { ...edits };
    ne.exports = { ...ne.exports, [expId]: { ...ne.exports[expId], observaciones: newObs } };
    setEdits(ne);
    saveEdits(ne);
    recomputeCruce(ne);
    toast.success(`${coteToRemove} desvinculado de ${exp.nroCote}`);
  }, [edits, cruceRows, sinCruceRows]);

  // Open edit form for an export's observaciones (finds the row and opens the full edit sheet)
  const handleEditObs = useCallback((expId: string) => {
    const allRows = [...cruceRows, ...sinCruceRows];
    const row = allRows.find(r => r.exp.id === expId);
    if (row) openExportEdit(row);
  }, [cruceRows, sinCruceRows]);

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

  // Inline edit handlers for table cells
  const handleInlineExportCajas = useCallback((id: string, origVal: number | null | undefined, newVal: string) => {
    if (newVal === String(origVal ?? '')) return;
    const nv = newVal !== '' ? parseInt(newVal) : null;
    const ne = { ...edits };
    if (nv !== null && nv !== origVal) {
      ne.exports = { ...ne.exports, [id]: { ...ne.exports[id], cantidadEnvases: nv } };
    } else if (ne.exports[id]) {
      const ec = { ...ne.exports[id] };
      const tmp = { ...ec } as unknown as Record<string, unknown>;
      delete tmp.cantidadEnvases;
      if (Object.keys(tmp).length === 0) {
        const restEntries = Object.entries(ne.exports).filter(([k]) => k !== id);
        ne.exports = Object.fromEntries(restEntries) as typeof ne.exports;
      } else {
        ne.exports[id] = ec;
      }
    }
    setEdits(ne);
    saveEdits(ne);
    recomputeCruce(ne);
  }, [edits]);

  const handleInlineExportKg = useCallback((id: string, origVal: number | null | undefined, newVal: string) => {
    if (newVal === String(origVal ?? '')) return;
    const nv = newVal !== '' ? parseFloat(newVal) : null;
    const ne = { ...edits };
    if (nv !== null && nv !== origVal) {
      ne.exports = { ...ne.exports, [id]: { ...ne.exports[id], pesoNeto: nv } };
    } else if (ne.exports[id]) {
      const ec = { ...ne.exports[id] };
      const tmp = { ...ec } as unknown as Record<string, unknown>;
      delete tmp.pesoNeto;
      if (Object.keys(tmp).length === 0) {
        const restEntries = Object.entries(ne.exports).filter(([k]) => k !== id);
        ne.exports = Object.fromEntries(restEntries) as typeof ne.exports;
      } else {
        ne.exports[id] = ec;
      }
    }
    setEdits(ne);
    saveEdits(ne);
    recomputeCruce(ne);
  }, [edits]);

  const handleInlineIngresoField = useCallback((cote: string, field: 'envases' | 'pesoNeto', origVal: number, newVal: string) => {
    const nv = field === 'envases' ? (parseInt(newVal) || 0) : (parseFloat(newVal) || 0);
    if (nv === origVal) return;
    const ne = { ...edits };
    ne.ingresos = { ...ne.ingresos, [cote]: { ...ne.ingresos[cote], [field]: nv } };
    setEdits(ne);
    saveEdits(ne);
    recomputeCruce(ne);
  }, [edits]);

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
    if (!cote) return;
    let cajas = parseInt(ef_newCoteCajas) || 0;
    if (cajas <= 0 && ingresoMap.has(cote)) {
      cajas = ingresoMap.get(cote)!.envases;
    }
    if (cajas <= 0) {
      toast.error('Ingresá la cantidad de cajas');
      return;
    }
    const existingIdx = ef_manualCotes.findIndex(c => c.cote === cote);
    if (existingIdx >= 0) {
      setEf_manualCotes(prev => prev.map((c, i) => i === existingIdx ? { ...c, cajas } : c));
      toast.success(`${cote} actualizado: ${cajas} cajas`);
    } else {
      setEf_manualCotes(prev => [...prev, { cote, cajas }]);
      toast.success(`${cote} agregado`);
    }
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

  const handleAddIngresoFromStock = (codigo: string, cajas: number, producto: string) => {
    // Check if already exists
    const existingManual = (edits.ingresosManuales || []).find(m => m.cote === codigo);
    if (existingManual) {
      toast.info(`${String(codigo)} ya fue creado como ingreso manual (${existingManual.envases} cajas, tramite ${existingManual.tramite})`);
      return;
    }
    if (ingresoMap.has(codigo)) {
      const ing = ingresoMap.get(codigo)!;
      toast.info(`${String(codigo)} ya existe como ingreso: ${ing.envases} cajas, tramite ${ing.tramite}`);
      return;
    }
    // Pre-fill the new ingreso form with stock data and open it
    setNi_cote(codigo);
    setNi_cajas(String(cajas));
    setNi_producto(producto);
    setNi_tramite('');
    setNi_fecha('');
    setNi_pesoNeto('');
    setNi_pesoBruto('');
    setNi_lineas([{ id: '1', producto, corte: '', cajas: cajas }]);
    setAddIngresoOpen(true);
  };

  const saveNewIngreso = (overrideCote?: string, fromNotFoundView = false) => {
    let raw: string;
    if (overrideCote != null) {
      raw = typeof overrideCote === 'string' ? overrideCote : '';
    } else {
      raw = ni_cote;
    }
    const cote = (raw || '').trim().toUpperCase();
    if (!cote) return;
    const manualIngresos = edits.ingresosManuales || [];
    const existingManualIdx = manualIngresos.findIndex(m => m.cote === cote);
    const tramiteVal = parseInt(String(ni_tramite).replace(/[^0-9]/g, '')) || 0;

    // Check if already exists in ingresoMap (original data) — allow saving manual override with lineas
    if (ingresoMap.has(cote) && existingManualIdx < 0) {
      const ing = ingresoMap.get(cote)!;
      const filledLineas = ni_lineas.filter(l => l.producto.trim() || l.corte.trim());
      const totalCajasFromLineas = filledLineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0);
      const newIngreso: ManualIngreso = {
        cote,
        tramite: tramiteVal || ing.tramite,
        fecha: ni_fecha ? new Date(ni_fecha).toISOString() : ing.fecha,
        producto: filledLineas.length > 0 ? filledLineas.map(l => l.producto).filter(Boolean).join(', ') : ing.producto,
        cortes: filledLineas.length > 0 ? filledLineas.map(l => l.corte).filter(Boolean) : ing.cortes,
        pesoNeto: parseFloat(String(ni_pesoNeto).replace(/[^0-9.,]/g, '')) || ing.pesoNeto,
        pesoBruto: parseFloat(String(ni_pesoBruto).replace(/[^0-9.,]/g, '')) || ing.pesoBruto,
        envases: totalCajasFromLineas || (parseInt(String(ni_cajas).replace(/[^0-9]/g, '')) || ing.envases),
        lineas: filledLineas.length > 0 ? filledLineas : undefined,
      };
      const newEdits: EditsStore = {
        ...edits,
        ingresosManuales: [...manualIngresos, newIngreso],
      };
      setEdits(newEdits);
      saveEdits(newEdits);
      recomputeCruce(newEdits);
      toast.success(`${cote} guardado (existente, ahora con edicion manual)`);
      if (fromNotFoundView) {
        // keep detail open
      } else {
        setAddIngresoOpen(false);
      }
      setNi_cote(''); setNi_tramite(''); setNi_fecha('');
      setNi_producto(''); setNi_cajas(''); setNi_pesoNeto(''); setNi_pesoBruto('');
      setNi_lineas([{ id: '1', producto: '', corte: '', cajas: '' }]);
      return;
    }
    // Check if exists in manual ingresos — allow update
    if (tramiteVal <= 0) {
      toast.error('Ingresa el numero de tramite');
      return;
    }
    const filledLineas = ni_lineas.filter(l => l.producto.trim() || l.corte.trim());
    const totalCajasFromLineas = filledLineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0);
    const newIngreso: ManualIngreso = {
      cote,
      tramite: tramiteVal,
      fecha: ni_fecha ? new Date(ni_fecha).toISOString() : new Date().toISOString(),
      producto: filledLineas.length > 0 ? filledLineas.map(l => l.producto).filter(Boolean).join(', ') : ni_producto,
      cortes: filledLineas.map(l => l.corte).filter(Boolean),
      pesoNeto: parseFloat(String(ni_pesoNeto).replace(/[^0-9.,]/g, '')) || 0,
      pesoBruto: parseFloat(String(ni_pesoBruto).replace(/[^0-9.,]/g, '')) || 0,
      envases: totalCajasFromLineas || (parseInt(String(ni_cajas).replace(/[^0-9]/g, '')) || 0),
      lineas: filledLineas.length > 0 ? filledLineas : undefined,
    };
    let newEdits: EditsStore;
    if (existingManualIdx >= 0) {
      // Update existing manual ingreso
      const updated = [...manualIngresos];
      updated[existingManualIdx] = newIngreso;
      newEdits = { ...edits, ingresosManuales: updated };
      toast.success(`${cote} actualizado`);
    } else {
      newEdits = {
        ...edits,
        ingresosManuales: [...manualIngresos, newIngreso],
      };
      toast.success(`${cote} creado`);
    }
    setEdits(newEdits);
    saveEdits(newEdits);
    recomputeCruce(newEdits);
    if (fromNotFoundView) {
      // Keep the detail sheet open — ingresoMap will update and the detail will show the new data
    } else {
      setAddIngresoOpen(false);
    }
    setNi_cote(''); setNi_tramite(''); setNi_fecha('');
    setNi_producto(''); setNi_cajas(''); setNi_pesoNeto(''); setNi_pesoBruto('');
    setNi_lineas([{ id: '1', producto: '', corte: '', cajas: '' }]);
  };

  const saveNewExp = () => {
    const cote = ne_nroCote.trim().toUpperCase();
    if (!cote) return;
    const filledExpLineas = ne_lineas.filter(l => l.producto.trim() || l.corte.trim());
    const totalCajasExp = filledExpLineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0);
    const newExp: ManualExportacion = {
      id: `manual-${cote}-${Date.now()}`,
      nroTramite: parseInt(String(ne_nroTramite).replace(/[^0-9]/g, '')) || 0,
      fechaTramite: ne_fecha ? new Date(ne_fecha).toISOString() : new Date().toISOString(),
      nroCote: cote,
      paisDestino: ne_pais,
      denominacionMercaderia: filledExpLineas.length > 0 ? filledExpLineas.map(l => l.producto).filter(Boolean).join(', ') : ne_producto,
      corte: filledExpLineas.length > 0 ? filledExpLineas.map(l => l.corte).filter(Boolean).join(', ') : ne_corte,
      pesoNeto: ne_pesoNeto ? parseFloat(String(ne_pesoNeto).replace(/[^0-9.,]/g, '')) : null,
      pesoBruto: null,
      cantidadEnvases: totalCajasExp || (ne_cajas ? parseInt(String(ne_cajas).replace(/[^0-9]/g, '')) : null),
      observaciones: null,
      lineas: filledExpLineas.length > 0 ? filledExpLineas : undefined,
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
    setNe_lineas([{ id: '1', producto: '', corte: '', cajas: '' }]);
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
    if (filtroProducto) {
      rows = rows.filter(r => {
        if ('exp' in r) {
          return ((r as CruceRow | SinCruceRow).exp.denominacionMercaderia || '').toLowerCase().includes(filtroProducto.toLowerCase());
        }
        return (r as IngresoPendienteRow).producto.toLowerCase().includes(filtroProducto.toLowerCase());
      });
    }
    if (filtroCorte) {
      rows = rows.filter(r => {
        if ('exp' in r) {
          return ((r as CruceRow | SinCruceRow).exp.corte || '').toLowerCase().includes(filtroCorte.toLowerCase());
        }
        return (r as IngresoPendienteRow).cortes.some(c => c.toLowerCase().includes(filtroCorte.toLowerCase()));
      });
    }
    return rows;
  }, [cruceRows, sinCruceRows, pendienteRows, subTab, search, pais, fechaDesde, fechaHasta, filtroProducto, filtroCorte]);

  useEffect(() => { setPage(1); }, [subTab, search, pais, fechaDesde, fechaHasta, filtroProducto, filtroCorte]);

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

  const clearFilters = useCallback(() => { setSearchInput(''); setSearch(''); setPais(''); setFechaDesde(''); setFechaHasta(''); setFiltroProducto(''); setFiltroCorte(''); }, []);
  // Precompute: ingreso COTE -> total export cajas (used in cruce + stock columns)
  const exportCajasByCote = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of cruceRows) {
      if (r.isManualLink && edits.exports[r.exp.id]?.manualCotes) {
        for (const mc of edits.exports[r.exp.id].manualCotes!) {
          map.set(mc.cote, (map.get(mc.cote) || 0) + mc.cajas);
        }
      } else if (r.ingresoCotes.length > 0) {
        const totalIngCajas = r.ingresoCotes.reduce((s, c) => s + (ingresoMap.get(c)?.envases || 0), 0);
        for (const c of r.ingresoCotes) {
          const share = totalIngCajas > 0 ? Math.round(r.envasesExp * (ingresoMap.get(c)?.envases || 0) / totalIngCajas) : 0;
          map.set(c, (map.get(c) || 0) + share);
        }
      }
    }
    for (const r of sinCruceRows) {
      const mc = edits.exports[r.exp.id]?.manualCotes;
      if (mc) {
        for (const link of mc) {
          map.set(link.cote, (map.get(link.cote) || 0) + link.cajas);
        }
      }
    }
    return map;
  }, [cruceRows, sinCruceRows, edits, ingresoMap]);

  const hasFilters = search || pais || fechaDesde || fechaHasta || filtroProducto || filtroCorte;
  const detailType = detailRow ? ('exp' in detailRow ? ('ingresoCotes' in detailRow ? 'cruce' : 'sincruce') : 'pendiente') : null;

  // Stock file handler
  const handleLoadStock = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xls,.xlsx';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setStockLoading(true);
      try {
        const { parseStockXls } = await import('@/lib/parseStockXls');
        const load = await parseStockXls(file);
        setStockData(load);
        localStorage.setItem('trazabilidad_stock_data', JSON.stringify(load));
        // Clear previous assignments when loading new stock
        setPalletAssignments({});
        localStorage.removeItem('trazabilidad_stock_assignments');
        toast.success(`Stock cargado: ${load.pallets.length} pallets`);
        setSubTab('stock');
      } catch (err) {
        toast.error(`Error al cargar stock: ${(err as Error).message}`);
      } finally {
        setStockLoading(false);
      }
    };
    input.click();
  };

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

  const ALL_LS_KEYS = [
    'trazabilidad_new_records',
    'trazabilidad_exp_edits',
    'trazabilidad_exp_deleted',
    'trazabilidad_exp_ingresos',
    'trazabilidad_dep_edits',
    'trazabilidad_dep_new_records',
    'trazabilidad_dep_deleted',
    'cruce_caliral_edits',
    'trazabilidad_stock_data',
    'trazabilidad_stock_assignments',
  ];

  const handleBackup = () => {
    const backup: Record<string, unknown> = {};
    for (const key of ALL_LS_KEYS) {
      try {
        const val = localStorage.getItem(key);
        if (val) backup[key] = JSON.parse(val);
      } catch { /* skip */ }
    }
    backup._meta = { version: 1, fecha: new Date().toISOString(), page: 'trazabilidad_backup' };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trazabilidad_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Respaldo descargado');
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (!data._meta || data._meta.page !== 'trazabilidad_backup') {
            toast.error('Archivo invalido - no es un respaldo de trazabilidad');
            return;
          }
          let count = 0;
          for (const key of ALL_LS_KEYS) {
            if (data[key] !== undefined) {
              localStorage.setItem(key, JSON.stringify(data[key]));
              count++;
            }
          }
          toast.success(`Restaurados ${count} campos. Recargando...`);
          setTimeout(() => window.location.reload(), 1000);
        } catch {
          toast.error('Error al leer el archivo');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  function diffBadgeEnvases(diff: number) {
    if (diff === 0) return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />0</span>;
    if (diff < 0) {
      return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><PackageMinus className="h-3 w-3" />{diff} cajas</span>;
    }
    return <span className="inline-flex items-center text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">+{diff} cajas</span>;
  }

  const openIngresoDetail = (cote: string) => {
    setIngresoDetailCote(cote);
    setDetailOpen(true);
  };
  const closeIngresoDetail = () => {
    setIngresoDetailCote(null);
  };
  const isEdited = (type: 'export' | 'ingreso', id: string) => type === 'export' ? !!edits.exports[id] : !!edits.ingresos[id];

  if (loading) return <div className="p-6 space-y-4"><h2 className="text-2xl font-bold text-slate-800">Cruces Frimaral</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-orange-600" />
          Cruces Frimaral
          <span className="text-sm font-normal text-slate-400 ml-2">Trazabilidad por cajas (envases)</span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBackup} title="Descargar respaldo de todos tus datos">
            <Download className="h-4 w-4 mr-2" />Respaldo
          </Button>
          <Button variant="outline" size="sm" onClick={handleRestore} title="Restaurar datos desde un archivo de respaldo">
            <Upload className="h-4 w-4 mr-2" />Restaurar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Exportar Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleLoadStock} disabled={stockLoading}>
            <Upload className="h-4 w-4 mr-2" />{stockLoading ? 'Cargando...' : 'Cargar Stock'}
          </Button>
        </div>
      </div>

      {/* KPI Cards — all clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <Card className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group" onClick={() => { setActiveTab('depositos'); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50"><ArrowLeftRight className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Ingresos Caliral</p><p className="text-lg font-bold">{stats.totalIngresos}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalIngresoEnvases)} cajas</p></div>
            <span className="ml-auto text-[9px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ver ingresos →</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group" onClick={() => { setSubTab('cruce'); setSearchInput(''); setSearch(''); setPage(1); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50"><Link2 className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-[10px] text-slate-500 uppercase">COTEs Vinculados</p><p className="text-lg font-bold">{stats.cotesVinculados}</p><p className="text-[10px] text-slate-400">de {stats.totalIngresos} ingresos</p></div>
            <span className="ml-auto text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ver cruces →</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group" onClick={() => { setSubTab('cruce'); setSearchInput(''); setSearch(''); setPage(1); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-sky-50"><CheckCircle2 className="h-5 w-5 text-sky-600" /></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Exports con cruce</p><p className="text-lg font-bold">{stats.exportConCruce}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalCruceExpEnvases)} cajas</p></div>
            <span className="ml-auto text-[9px] text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ver con cruce →</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group" onClick={() => { setSubTab('sincruce'); setSearchInput(''); setSearch(''); setPage(1); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Exports sin COTE</p><p className="text-lg font-bold">{stats.exportSinCruce}</p><p className="text-[10px] text-slate-400">{fmt(stats.totalSinCruceEnvases)} cajas</p></div>
            <span className="ml-auto text-[9px] text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ver sin COTE →</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group" onClick={() => { setSubTab('pendientes'); setSearchInput(''); setSearch(''); setPage(1); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-50"><Unlink className="h-5 w-5 text-orange-600" /></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Ingresos pendientes</p><p className="text-lg font-bold">{stats.pendienteCount}</p><p className="text-[10px] text-slate-400">{fmt(stats.pendienteEnvases)} cajas</p></div>
            <span className="ml-auto text-[9px] text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ver pendientes →</span>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group ${stats.conProblema > 0 ? 'ring-2 ring-red-200' : ''}`} onClick={() => { setSubTab('cruce'); setSearchInput(''); setSearch(''); setPage(1); }}>
          <CardContent className={`p-4 flex items-center gap-3 ${stats.conProblema > 0 ? 'ring-2 ring-red-200' : ''}`}>
            <div className={`p-3 rounded-xl ${stats.conProblema > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
              {stats.conProblema > 0 ? <PackageMinus className="h-5 w-5 text-red-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            </div>
            <div><p className="text-[10px] text-slate-500 uppercase">Con diferencia</p><p className={`text-lg font-bold ${stats.conProblema > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{stats.conProblema}</p><p className="text-[10px] text-slate-400">mas cajas exp. que ing.</p></div>
            <span className="ml-auto text-[9px] text-red-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Ver diff →</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200 group" onClick={() => { setActiveTab('mercado-nacional'); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-50"><span className="text-sm font-bold text-violet-600">%</span></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Cobertura cruce</p><p className="text-lg font-bold">
              {stats.totalIngresos > 0 ? ((stats.cotesVinculados / stats.totalIngresos) * 100).toFixed(0) : 0}%
            </p><p className="text-[10px] text-slate-400">COTEs vinculados</p></div>
            <span className="ml-auto text-[9px] text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Mercado →</span>
          </CardContent>
        </Card>
      </div>

      {/* MGAP Quick Import - visible on main page */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="p-3">
          <button type="button" onClick={() => setShowMainMgap(!showMainMgap)}
            className="flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors w-full text-left">
            <Globe className="h-4 w-4" />
            Importar desde MGAP
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <span className="ml-auto text-xs text-violet-400">{showMainMgap ? '▲' : '▼'}</span>
          </button>
          {showMainMgap && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">Pega el contenido de la pagina del MGAP (Ctrl+A, Ctrl+C en la pagina) y se auto-completara el formulario de ingreso o exportacion segun corresponda.</p>
              <Textarea
                value={mainMgapPaste}
                onChange={e => setMainMgapPaste(e.target.value)}
                placeholder="Pega aqui el contenido de la pagina del MGAP..."
                className="text-xs min-h-[100px] font-mono"
                rows={4}
              />
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-xs" onClick={processMainMgap} disabled={!mainMgapPaste.trim()}>
                <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />Procesar y abrir formulario
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700 mb-1">Como funciona el cruce</p>
        <p>Se extraen los COTEs de ingreso desde las <b>observaciones</b> de cada exportacion. Se comparan las <b>cajas (envases)</b> exportadas contra los <b>totales de cajas en A Depositos</b> para esos COTEs. La diferencia negativa (roja) indica que se exportaron mas cajas de las que ingresaron, lo cual es un error. La diferencia positiva (azul) es normal: significa que no todas las cajas de esos COTEs fueron en esa exportacion (pueden ir en otra o estar pendientes). Si vinculaste COTEs manualmente, el campo "cajas" indica cuantas de cada COTE se usaron en la exportacion, pero la diferencia se calcula igual contra los totales de depositos. <b>Podes editar cualquier registro haciendo click en el lapiz</b>. Las ediciones se guardan en el navegador.</p>
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
          <Button variant={subTab === 'stock' ? 'default' : 'outline'} size="sm" onClick={() => setSubTab('stock')}>
            <Package className="h-4 w-4 mr-1.5" />Stock ({stockAggMap.size})
          </Button>
          <div className="flex-1" />
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1" />Limpiar</Button>}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={subTab === 'pendientes' ? 'Buscar COTE, tramite, producto...' : 'Buscar tramite, COTE, pais, producto...'}
              value={searchInput} onChange={e => handleSearchChange(e.target.value)} className="pl-9"
            />
          </div>
          {subTab !== 'pendientes' && (
            <Select value={pais} onValueChange={v => setPais(v)}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Pais" /></SelectTrigger>
              <SelectContent>{paises.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={filtroProducto} onValueChange={v => setFiltroProducto(v)}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Producto" /></SelectTrigger>
            <SelectContent>{productos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCorte} onValueChange={v => setFiltroCorte(v)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Corte" /></SelectTrigger>
            <SelectContent>{cortes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-[140px]" />
          <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-[140px]" />
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
                  <th className="px-3 py-3 text-right hidden lg:table-cell">Saldo Teorico</th>
                  <th className="px-3 py-3 text-right hidden lg:table-cell">Cajas Stock</th>
                  <th className="px-3 py-3 text-right hidden lg:table-cell">Diff Stock/Saldo</th>
                  <th className="px-3 py-3 text-right">Diff. Cajas</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={14} className="text-center py-10 text-slate-400">No se encontraron registros</td></tr>
                ) : (pageData as CruceRow[]).map(r => (
                  <tr key={r.exp.id} className={`border-b cursor-pointer ${r.diffEnvases < 0 ? 'hover:bg-red-50/40' : 'hover:bg-orange-50/40'} ${isEdited('export', r.exp.id) ? 'bg-violet-50/30' : ''}`} onClick={() => { setDetailRow(r); setDetailOpen(true); }}>
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-blue-700">
                      <button onClick={(e) => { e.stopPropagation(); setIngresoDetailCote(null); setDetailRow(r); setDetailOpen(true); }} className="hover:underline cursor-pointer">{r.exp.nroCote}</button>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.exp.nroTramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.exp.fechaTramite)}</td>
                    <td className="px-3 py-2.5 text-xs">{r.exp.paisDestino}</td>
                    <td className="px-3 py-2.5 text-xs hidden xl:table-cell max-w-[200px] truncate">{r.exp.denominacionMercaderia}</td>
                    <td className="px-1 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                      <input type="number" name={`envases-exp-${r.exp.id}`} min="0" step="1"
                        className="w-[72px] h-7 text-xs text-right font-mono font-medium bg-transparent border border-transparent hover:border-slate-300 focus:border-violet-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
                        defaultValue={r.envasesExp}
                        onBlur={e => handleInlineExportCajas(r.exp.id, r.exp.cantidadEnvases, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.isManualLink && <span className="inline-block bg-violet-100 text-violet-800 text-[9px] font-bold px-1 py-0.5 rounded">MANUAL</span>}
                        {r.ingresoCotes.map(c => (
                          <button key={c} onClick={(e) => { e.stopPropagation(); openIngresoDetail(c); }} className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-emerald-200 hover:underline cursor-pointer transition-colors">{c}</button>
                        ))}
                        {r.ingresoCotesNotFound.map(c => (
                          <button key={c} title="No encontrado en ingresos Caliral" onClick={(e) => { e.stopPropagation(); openIngresoDetail(c); }} className="inline-block bg-red-100 text-red-700 text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-red-200 hover:underline cursor-pointer transition-colors">{c}</button>
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
                    <td className="px-3 py-2.5 text-xs text-right font-mono hidden lg:table-cell">{(() => {
                      const linkedCotes = r.ingresoCotes.filter(c => ingresoMap.has(c));
                      if (linkedCotes.length === 0) return <span className="text-slate-300">&mdash;</span>;
                      const saldo = linkedCotes.reduce((s, c) => s + ((ingresoMap.get(c)?.envases || 0) - (exportCajasByCote.get(c) || 0)), 0);
                      return <span className={saldo < 0 ? 'text-red-600 font-medium' : 'text-violet-700 font-medium'}>{saldo.toLocaleString('es-UY')}</span>;
                    })()}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono hidden lg:table-cell">{(() => {
                      const stockCajas = r.ingresoCotes.reduce((s, c) => s + (stockAggMap.get(c)?.totalCajas || 0), 0);
                      return stockCajas > 0 ? <span className="text-teal-700 font-medium">{stockCajas.toLocaleString('es-UY')}</span> : <span className="text-slate-300">&mdash;</span>;
                    })()}</td>
                    <td className="px-3 py-2.5 text-right hidden lg:table-cell">{(() => {
                      const linkedCotes = r.ingresoCotes.filter(c => ingresoMap.has(c));
                      if (linkedCotes.length === 0) return <span className="text-slate-300">&mdash;</span>;
                      const saldo = linkedCotes.reduce((s, c) => s + ((ingresoMap.get(c)?.envases || 0) - (exportCajasByCote.get(c) || 0)), 0);
                      const stockCajas = r.ingresoCotes.reduce((s, c) => s + (stockAggMap.get(c)?.totalCajas || 0), 0);
                      if (stockCajas === 0) return <span className="text-slate-300">&mdash;</span>;
                      const diff = stockCajas - saldo;
                      return <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${Math.abs(diff) === 0 ? 'bg-emerald-50 text-emerald-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{diff.toLocaleString('es-UY')}</span>;
                    })()}</td>
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
                  <SinCruceInlineRow key={r.exp.id} row={r} ingresoMap={ingresoMap} stockAggMap={stockAggMap} edits={edits} onSaved={(newEdits) => { setEdits(newEdits); saveEdits(newEdits); recomputeCruce(newEdits); }} onEditFull={() => openExportEdit(r)} onViewDetail={() => { setIngresoDetailCote(null); setDetailRow(r); setDetailOpen(true); }} isEditedFlag={isEdited('export', r.exp.id)} />
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
                    <td className="px-3 py-2.5 text-xs font-mono font-medium text-orange-700"><button onClick={(e) => { e.stopPropagation(); setIngresoDetailCote(null); setDetailRow(r); setDetailOpen(true); }} className="hover:underline cursor-pointer">{r.cote}</button></td>
                    <td className="px-3 py-2.5 text-xs font-mono">{r.tramite}</td>
                    <td className="px-3 py-2.5 text-xs">{fd(r.fecha)}</td>
                    <td className="px-3 py-2.5 text-xs hidden lg:table-cell max-w-[200px] truncate">{r.producto}</td>
                    <td className="px-3 py-2.5 text-xs hidden md:table-cell max-w-[200px] truncate">{r.cortes.join(', ')}</td>
                    <td className="px-1 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                      <input type="number" name={`envases-${r.cote}`} min="0" step="1"
                        className="w-[72px] h-7 text-xs text-right font-mono bg-transparent border border-transparent hover:border-slate-300 focus:border-violet-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
                        defaultValue={r.envases}
                        onBlur={e => handleInlineIngresoField(r.cote, 'envases', r.envases, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-right hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <input type="number" name={`peso-neto-${r.cote}`} min="0" step="0.01"
                        className="w-[88px] h-7 text-xs text-right font-mono bg-transparent border border-transparent hover:border-slate-300 focus:border-violet-500 focus:bg-white rounded px-1.5 outline-none transition-colors"
                        defaultValue={r.pesoNeto}
                        onBlur={e => handleInlineIngresoField(r.cote, 'pesoNeto', r.pesoNeto, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                      />
                    </td>
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

          {subTab === 'stock' && (
            <>
              {stockData ? (<>
                {/* Stock summary card */}
                <div className="mb-3 p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="font-bold">Stock al {stockData.fecha ? fd(stockData.fecha) : '-'} — {stockData.cliente}</span>
                    <span>Total codigos: <b>{stockAggMap.size}</b></span>
                    <span>Total pallets: <b>{stockData.pallets.length}</b></span>
                    <span>Cajas totales: <b>{[...stockAggMap.values()].reduce((s, a) => s + a.totalCajas, 0).toLocaleString('es-UY')}</b></span>
                    <span>Kg totales: <b>{[...stockAggMap.values()].reduce((s, a) => s + a.totalKilos, 0).toLocaleString('es-UY')}</b></span>
                  </div>
                </div>
                <StockTable
                  stockAggMap={stockAggMap}
                  ingresoMap={ingresoMap}
                  cruceRows={cruceRows}
                  sinCruceRows={sinCruceRows}
                  edits={edits}
                  onAssignPallet={handleAssignPallet}
                  onAddIngresoFromStock={handleAddIngresoFromStock}
                  onRenameCodigo={handleRenameStockCodigo}
                  onUnlinkCote={handleUnlinkCote}
                  onEditObs={handleEditObs}
                />
              </>) : (
                <div className="text-center py-16 text-slate-400">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No hay datos de stock cargados.</p>
                  <p className="text-xs mt-1">Hace click en <b>Cargar Stock</b> para subir un archivo XLS del deposito.</p>
                </div>
              )}
            </>
          )}
        </div>
        {subTab !== 'stock' && (
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-slate-500">{filteredData.length} registros — Pagina {page} de {totalPages || 1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        )}
      </CardContent></Card>

      {/* Detail Sheet (read-only) */}
      <Sheet open={detailOpen} onOpenChange={(open) => { if (!open) { setDetailOpen(false); setIngresoDetailCote(null); } else { setDetailOpen(true); } }}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {/* Ingreso COTE detail view */}
          {ingresoDetailCote && (() => {
            const agg = ingresoMap.get(ingresoDetailCote);
            return (<>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <button onClick={closeIngresoDetail} className="p-1 rounded hover:bg-slate-100 mr-1"><ChevronLeft className="h-5 w-5" /></button>
                  Ingreso COTE {ingresoDetailCote}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                {agg ? (<>
                  <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
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
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase mb-1">Lineas del ingreso</p>
                      <div className="max-h-[400px] overflow-y-auto border rounded">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-slate-100"><tr>
                            <th className="px-2 py-1 text-left">Linea</th>
                            <th className="px-2 py-1 text-left">Corte</th>
                            <th className="px-2 py-1 text-right">Cajas</th>
                            <th className="px-2 py-1 text-right">Peso Bruto</th>
                            <th className="px-2 py-1 text-right">Peso Neto</th>
                          </tr></thead>
                          <tbody>
                            {agg.lines.map((l, i) => (
                              <tr key={i} className="border-t">
                                <td className="px-2 py-1">{String((l as unknown as Record<string, unknown>).idLinea ?? i + 1)}</td>
                                <td className="px-2 py-1">{l.corte}</td>
                                <td className="px-2 py-1 text-right font-mono">{l.cantidadEnvases ?? '-'}</td>
                                <td className="px-2 py-1 text-right font-mono">{l.pesoBruto ? l.pesoBruto.toLocaleString('es-UY') : '-'}</td>
                                <td className="px-2 py-1 text-right font-mono">{l.pesoNeto ? l.pesoNeto.toLocaleString('es-UY') : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <button onClick={closeIngresoDetail} className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors">
                    Volver al detalle de la exportacion
                  </button>
                </>) : (
                  <div className="space-y-4">
                    <div className="bg-orange-50 rounded-lg p-4 text-xs text-orange-800">
                      <p className="font-bold mb-1">COTE {ingresoDetailCote} no encontrado en los ingresos a Caliral.</p>
                      <p>Puede ser un COTE que no ingreso a Caliral, o un error en el numero. Crealo manualmente abajo para vincularlo.</p>
                    </div>
                    {/* MGAP import for not-found COTE */}
                    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg border border-violet-200 overflow-hidden">
                      <button
                        onClick={() => setShowMgapImport(!showMgapImport)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-violet-100/60 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-violet-800">
                          <Globe className="h-3.5 w-3.5" />
                          Importar desde MGAP
                        </span>
                        <Sparkles className={`h-3.5 w-3.5 text-violet-500 transition-transform ${showMgapImport ? 'rotate-180' : ''}`} />
                      </button>
                      {showMgapImport && (
                        <div className="px-3 pb-3 space-y-2">
                          <p className="text-[11px] text-violet-700 leading-relaxed">
                            Copia el contenido de la pagina del MGAP (<kbd className="bg-violet-100 px-1 rounded text-[10px]">Ctrl+A</kbd> <kbd className="bg-violet-100 px-1 rounded text-[10px]">Ctrl+C</kbd>) y pegalo abajo. Tambien podes pegar solo el URL para extraer el tramite.
                          </p>
                          <Textarea
                            value={mgapPaste}
                            onChange={e => setMgapPaste(e.target.value)}
                            placeholder="Pega aqui el contenido de la pagina del MGAP o el URL..."
                            className="min-h-[80px] text-xs font-mono resize-y"
                          />
                          <Button
                            size="sm"
                            onClick={processMgapImport}
                            disabled={!mgapPaste.trim()}
                            className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs"
                          >
                            <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                            Procesar y completar campos
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="border-2 border-dashed border-emerald-200 rounded-lg p-4 bg-emerald-50/50">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Crear ingreso manual para {ingresoDetailCote}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><FieldLabel>Tramite</FieldLabel><Input inputMode="numeric" value={ni_tramite} onChange={e => setNi_tramite(e.target.value)} placeholder="19282" className="h-8 text-xs font-mono" /></div>
                        <div><FieldLabel>Fecha</FieldLabel><Input type="date" value={ni_fecha} onChange={e => setNi_fecha(e.target.value)} className="h-8 text-xs" /></div>
                        <div><FieldLabel>Kg Neto</FieldLabel><Input inputMode="numeric" value={ni_pesoNeto} onChange={e => setNi_pesoNeto(e.target.value)} placeholder="2500" className="h-8 text-xs font-mono" /></div>
                        <div><FieldLabel>Kg Bruto</FieldLabel><Input inputMode="numeric" value={ni_pesoBruto} onChange={e => setNi_pesoBruto(e.target.value)} placeholder="2800" className="h-8 text-xs font-mono" /></div>
                      </div>

                      {/* Productos y Corte - Multi-linea */}
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
                            onClick={addNiLinea}
                          >
                            <Plus className="h-3 w-3" />Agregar linea
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {ni_lineas.map((linea, idx) => (
                            <div key={linea.id} className="flex items-center gap-2 p-2 bg-emerald-50/60 border border-emerald-200/60 rounded-lg">
                              <span className="text-[10px] text-slate-400 w-4 shrink-0 text-center font-mono">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <label className="text-[10px] text-slate-400 block mb-0.5">Producto</label>
                                <Input value={linea.producto} onChange={e => updateNiLinea(linea.id, 'producto', e.target.value)} placeholder="Menudencias bovinas..." className="h-7 text-xs" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <label className="text-[10px] text-slate-400 block mb-0.5">Corte</label>
                                <Input value={linea.corte} onChange={e => updateNiLinea(linea.id, 'corte', e.target.value)} placeholder="Corte..." className="h-7 text-xs" />
                              </div>
                              <div className="w-20 shrink-0">
                                <label className="text-[10px] text-slate-400 block mb-0.5">Cajas</label>
                                <Input type="number" min="0" value={linea.cajas === '' ? '' : linea.cajas} onChange={e => updateNiLinea(linea.id, 'cajas', e.target.value)} placeholder="0" className="h-7 text-xs text-right font-mono" />
                              </div>
                              {ni_lineas.length > 1 && (
                                <button type="button" className="mt-4 shrink-0 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" onClick={() => removeNiLinea(linea.id)} title="Quitar linea">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {ni_lineas.length > 1 && (
                            <div className="flex justify-end pt-1 pr-1">
                              <span className="text-xs font-medium text-emerald-700">
                                Total cajas: {ni_lineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0).toLocaleString('es-UY')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" onClick={() => { saveNewIngreso(ingresoDetailCote, true); }} className="flex-1" disabled={!ni_tramite.trim()}>
                          <Save className="h-4 w-4 mr-2" />Crear y vincular
                        </Button>
                        <Button size="sm" variant="outline" onClick={closeIngresoDetail}>Cancelar</Button>
                      </div>
                    </div>
                    <button onClick={closeIngresoDetail} className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors">
                      Volver al detalle de la exportacion
                    </button>
                  </div>
                )}
              </div>
            </>);
          })()}

          {/* Original detail views (only when no ingreso detail is active) */}
          {!ingresoDetailCote && detailRow && detailType === 'cruce' && (() => {
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
                      ['Contenedor', (r.exp as unknown as Record<string, unknown>).contenedorSerieNro as string || '-'],
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
                    {r.manualCajasUsadas !== undefined && r.manualCajasUsadas > 0 && (
                      <p className="mt-1">Cajas usadas de estos COTEs en esta exportacion: <b>{r.manualCajasUsadas.toLocaleString('es-UY')}</b> (de {r.totalEnvasesIngreso.toLocaleString('es-UY')} totales en depositos)</p>
                    )}
                  </div>
                )}
                <div className={`rounded-lg p-4 ${r.diffEnvases < 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Balance por Cajas (Envases)</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-[10px] text-slate-400">{r.isManualLink ? 'Cajas en Depositos' : 'Cajas Ingresadas'}</p><p className="text-xl font-bold text-emerald-700">{r.totalEnvasesIngreso.toLocaleString('es-UY')}</p></div>
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
                          <button onClick={() => openIngresoDetail(agg.cote)} className="font-mono font-bold text-emerald-700 text-sm hover:underline cursor-pointer">{agg.cote}</button>
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

          {!ingresoDetailCote && detailRow && detailType === 'sincruce' && (() => {
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
                    ['Contenedor', (r.exp as unknown as Record<string, unknown>).contenedorSerieNro as string || '-'],
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

          {!ingresoDetailCote && detailRow && detailType === 'pendiente' && (() => {
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
                                  <td className="px-2 py-1">{String((l as unknown as Record<string, unknown>).idLinea ?? i + 1)}</td>
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
                  <p className="text-[11px] text-slate-500 mb-3">Agrega los COTEs de ingreso y la cantidad de cajas de cada uno que se usaron en esta exportacion. La diferencia se calcula contra los totales de A Depositos.</p>

                  {ef_manualCotes.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {ef_manualCotes.map(mc => {
                        const depTotal = ingresoMap.get(mc.cote)?.envases || 0;
                        return (
                        <div key={mc.cote} className="flex items-center gap-2 bg-white border rounded-md px-3 py-2">
                          <span className="font-mono text-sm font-bold text-emerald-700 flex-1">{mc.cote}</span>
                          <span className="text-[10px] text-slate-400">depósito:{depTotal}</span>
                          <span className="text-xs text-slate-500">usadas:</span>
                          <Input type="number" value={mc.cajas} onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setEf_manualCotes(prev => prev.map(c => c.cote === mc.cote ? { ...c, cajas: val } : c));
                          }} className="w-20 h-7 text-xs text-right font-mono" />
                          <button onClick={() => removeManualCote(mc.cote)} className="p-1 rounded hover:bg-red-100"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                        </div>
                        );
                      })}
                      <div className="text-xs text-right text-slate-500 space-y-0.5">
                        <div>Usadas en esta exp.: <span className="font-bold text-violet-700">{ef_manualCotes.reduce((s, c) => s + c.cajas, 0).toLocaleString('es-UY')}</span></div>
                        <div>Total en depósitos: <span className="font-bold text-emerald-700">{ef_manualCotes.reduce((s, c) => s + (ingresoMap.get(c.cote)?.envases || 0), 0).toLocaleString('es-UY')}</span></div>
                        {ef_cajas && (
                          <div>Exportadas: <span className="font-bold text-blue-700">{parseInt(ef_cajas || '0').toLocaleString('es-UY')}</span>
                          {' — diff depósitos: '}<span className={ef_manualCotes.reduce((s, c) => s + (ingresoMap.get(c.cote)?.envases || 0), 0) - parseInt(ef_cajas || '0') < 0 ? 'text-red-600 font-bold' : 'text-emerald-600'}>{(ef_manualCotes.reduce((s, c) => s + (ingresoMap.get(c.cote)?.envases || 0), 0) - parseInt(ef_cajas || '0')).toLocaleString('es-UY')}</span></div>
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
                    <Button size="sm" variant="outline" onClick={addManualCote} className="h-8 mb-0.5" disabled={!ef_newCote.trim()}>
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
      <Sheet open={addIngresoOpen} onOpenChange={(v) => { setAddIngresoOpen(v); if (!v) { setShowMgapImport(false); setMgapPaste(''); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              Agregar COTE deposito manual
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm">
            {/* MGAP Import Section */}
            <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg border border-violet-200 overflow-hidden">
              <button
                onClick={() => setShowMgapImport(!showMgapImport)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-violet-100/60 transition-colors"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-violet-800">
                  <Globe className="h-3.5 w-3.5" />
                  Importar desde MGAP
                </span>
                <Sparkles className={`h-3.5 w-3.5 text-violet-500 transition-transform ${showMgapImport ? 'rotate-180' : ''}`} />
              </button>
              {showMgapImport && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[11px] text-violet-700 leading-relaxed">
                    Abri la pagina del COTE en MGAP, copia todo el contenido (<kbd className="bg-violet-100 px-1 rounded text-[10px]">Ctrl+A</kbd> <kbd className="bg-violet-100 px-1 rounded text-[10px]">Ctrl+C</kbd>) y pegalo abajo. Tambien podes pegar solo el URL para extraer el tramite.
                  </p>
                  <Textarea
                    value={mgapPaste}
                    onChange={e => setMgapPaste(e.target.value)}
                    placeholder="Pega aqui el contenido de la pagina del MGAP o el URL..."
                    className="min-h-[100px] text-xs font-mono resize-y"
                    onPaste={() => setTimeout(() => {}, 0)}
                  />
                  <Button
                    size="sm"
                    onClick={processMgapImport}
                    disabled={!mgapPaste.trim()}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                    Procesar y completar campos
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-orange-50 rounded-lg p-3 text-xs text-orange-800">
              Agrega un COTE de ingreso/depósito que no existe en los datos originales. Se guardará como edición manual.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>COTE</FieldLabel><Input value={ni_cote} onChange={e => setNi_cote(e.target.value.toUpperCase())} placeholder="P12345" className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Tramite</FieldLabel><Input inputMode="numeric" value={ni_tramite} onChange={e => setNi_tramite(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Fecha</FieldLabel><Input type="date" value={ni_fecha} onChange={e => setNi_fecha(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Kg Neto</FieldLabel><Input inputMode="numeric" value={ni_pesoNeto} onChange={e => setNi_pesoNeto(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Kg Bruto</FieldLabel><Input inputMode="numeric" value={ni_pesoBruto} onChange={e => setNi_pesoBruto(e.target.value)} className="h-8 text-xs font-mono" /></div>
            </div>

            {/* Productos y Corte - Multi-linea */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />Productos y Corte
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  onClick={addNiLinea}
                >
                  <Plus className="h-3 w-3" />Agregar linea
                </Button>
              </div>
              <div className="space-y-2">
                {ni_lineas.map((linea, idx) => (
                  <div key={linea.id} className="flex items-center gap-2 p-2 bg-emerald-50/60 border border-emerald-200/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 w-4 shrink-0 text-center font-mono">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Producto</label>
                      <Input value={linea.producto} onChange={e => updateNiLinea(linea.id, 'producto', e.target.value)} placeholder="Menudencias bovinas..." className="h-7 text-xs" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Corte</label>
                      <Input value={linea.corte} onChange={e => updateNiLinea(linea.id, 'corte', e.target.value)} placeholder="Corte..." className="h-7 text-xs" />
                    </div>
                    <div className="w-20 shrink-0">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Cajas</label>
                      <Input type="number" min="0" value={linea.cajas === '' ? '' : linea.cajas} onChange={e => updateNiLinea(linea.id, 'cajas', e.target.value)} placeholder="0" className="h-7 text-xs text-right font-mono" />
                    </div>
                    {ni_lineas.length > 1 && (
                      <button type="button" className="mt-4 shrink-0 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" onClick={() => removeNiLinea(linea.id)} title="Quitar linea">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {ni_lineas.length > 1 && (
                  <div className="flex justify-end pt-1 pr-1">
                    <span className="text-xs font-medium text-emerald-700">
                      Total cajas: {ni_lineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0).toLocaleString('es-UY')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" onClick={() => saveNewIngreso()} className="flex-1" disabled={!ni_cote.trim() || !ni_tramite.trim()}>
                <Save className="h-4 w-4 mr-2" />Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddIngresoOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* NEW EXPORT SHEET */}
      <Sheet open={addExpOpen} onOpenChange={(v) => { setAddExpOpen(v); if (!v) { setShowMgapExportImport(false); setMgapExportPaste(''); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Agregar exportacion manual
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm">
            {/* MGAP Import Section */}
            <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg border border-violet-200 overflow-hidden">
              <button
                onClick={() => setShowMgapExportImport(!showMgapExportImport)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-violet-100/60 transition-colors"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-violet-800">
                  <Globe className="h-3.5 w-3.5" />
                  Importar desde MGAP
                </span>
                <Sparkles className={`h-3.5 w-3.5 text-violet-500 transition-transform ${showMgapExportImport ? 'rotate-180' : ''}`} />
              </button>
              {showMgapExportImport && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[11px] text-violet-700 leading-relaxed">
                    Abri la pagina del COTE en MGAP, copia todo el contenido (<kbd className="bg-violet-100 px-1 rounded text-[10px]">Ctrl+A</kbd> <kbd className="bg-violet-100 px-1 rounded text-[10px]">Ctrl+C</kbd>) y pegalo abajo. Tambien podes pegar solo el URL para extraer el tramite.
                  </p>
                  <Textarea
                    value={mgapExportPaste}
                    onChange={e => setMgapExportPaste(e.target.value)}
                    placeholder="Pega aqui el contenido de la pagina del MGAP o el URL..."
                    className="min-h-[100px] text-xs font-mono resize-y"
                  />
                  <Button
                    size="sm"
                    onClick={processMgapExportImport}
                    disabled={!mgapExportPaste.trim()}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                    Procesar y completar campos
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
              Agrega una exportación que no existe en los datos originales. Se guardará como edición manual.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>COTE Exportacion</FieldLabel><Input value={ne_nroCote} onChange={e => setNe_nroCote(e.target.value.toUpperCase())} placeholder="E12345" className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Tramite</FieldLabel><Input type="number" value={ne_nroTramite} onChange={e => setNe_nroTramite(e.target.value)} className="h-8 text-xs font-mono" /></div>
              <div><FieldLabel>Fecha</FieldLabel><Input type="date" value={ne_fecha} onChange={e => setNe_fecha(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Pais</FieldLabel><Input value={ne_pais} onChange={e => setNe_pais(e.target.value)} className="h-8 text-xs" /></div>
              <div><FieldLabel>Kg Neto</FieldLabel><Input type="number" value={ne_pesoNeto} onChange={e => setNe_pesoNeto(e.target.value)} className="h-8 text-xs font-mono" /></div>
            </div>

            {/* Productos y Corte - Multi-linea */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />Productos y Corte
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={addNeLinea}
                >
                  <Plus className="h-3 w-3" />Agregar linea
                </Button>
              </div>
              <div className="space-y-2">
                {ne_lineas.map((linea, idx) => (
                  <div key={linea.id} className="flex items-center gap-2 p-2 bg-blue-50/60 border border-blue-200/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 w-4 shrink-0 text-center font-mono">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Producto</label>
                      <Input value={linea.producto} onChange={e => updateNeLinea(linea.id, 'producto', e.target.value)} placeholder="Menudencias bovinas..." className="h-7 text-xs" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Corte</label>
                      <Input value={linea.corte} onChange={e => updateNeLinea(linea.id, 'corte', e.target.value)} placeholder="Corte..." className="h-7 text-xs" />
                    </div>
                    <div className="w-20 shrink-0">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Cajas</label>
                      <Input type="number" min="0" value={linea.cajas === '' ? '' : linea.cajas} onChange={e => updateNeLinea(linea.id, 'cajas', e.target.value)} placeholder="0" className="h-7 text-xs text-right font-mono" />
                    </div>
                    {ne_lineas.length > 1 && (
                      <button type="button" className="mt-4 shrink-0 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" onClick={() => removeNeLinea(linea.id)} title="Quitar linea">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {ne_lineas.length > 1 && (
                  <div className="flex justify-end pt-1 pr-1">
                    <span className="text-xs font-medium text-blue-700">
                      Total cajas: {ne_lineas.reduce((s, l) => s + (typeof l.cajas === 'number' ? l.cajas : 0), 0).toLocaleString('es-UY')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button size="sm" onClick={() => saveNewExp()} className="flex-1" disabled={!ne_nroCote.trim()}>
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
