'use client';

// ============================================================
// UniversalSearch — Buscador global de entidades
// ------------------------------------------------------------
// Busca simultáneamente en: depósitos, exportaciones, productores,
// empresas, depósitos (warehouses), clientes. Devuelve resultados
// categorizados que abren el drawer al seleccionarlos.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Hash, Building2, Users, Warehouse, MapPin, Package, Ship, FileText, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityType, SearchResult } from '@/domain/types';
import { useEntityDrawer } from '@/store/useEntityDrawer';
import { useAppStore } from '@/store/useAppStore';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import type { Shipment, ExpRecord } from '@/lib/types';

interface Props {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const TYPE_META: Record<EntityType, { label: string; icon: typeof Hash; color: string }> = {
  cote:         { label: 'COTE',          icon: Hash,        color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40' },
  empresa:      { label: 'Empresa',       icon: Building2,   color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  cliente:      { label: 'Cliente',       icon: Users,       color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
  productor:    { label: 'Productor',     icon: Warehouse,   color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  certificador: { label: 'Certificador',  icon: Building2,   color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40' },
  deposito:     { label: 'Depósito',      icon: Warehouse,   color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40' },
  puerto:       { label: 'Puerto',        icon: Ship,        color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40' },
  pais:         { label: 'País',          icon: MapPin,      color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40' },
  destino:      { label: 'Destino',       icon: MapPin,      color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40' },
  documento:    { label: 'Documento',     icon: FileText,    color: 'text-slate-600 bg-slate-50 dark:bg-slate-900/40' },
  contenedor:   { label: 'Contenedor',    icon: Boxes,       color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40' },
  corte:        { label: 'Corte',         icon: Package,     color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40' },
  producto:     { label: 'Producto',      icon: Package,     color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40' },
};

export function UniversalSearch({ className, placeholder = 'Buscar COTE, empresa, cliente, productor, país...', autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openDrawer = useEntityDrawer(s => s.openDrawer);
  const setActiveTab = useAppStore(s => s.setActiveTab);

  // Cache de datos (cargar una sola vez)
  const dataRef = useRef<{ depositos: (Shipment | ExpRecord)[]; exportaciones: (Shipment | ExpRecord)[] } | null>(null);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (dataRef.current) return;
    Promise.all([loadDepositos(), loadExportaciones()])
      .then(([deps, exps]) => {
        dataRef.current = { depositos: deps, exportaciones: exps };
        setDataReady(true);
      })
      .catch((e) => console.error('[universal-search] no se pudo cargar datos:', e));
  }, []);

  // Búsqueda en vivo
  useEffect(() => {
    if (!query.trim() || query.length < 2 || !dataReady) {
      setResults([]);
      setOpen(false);
      return;
    }
    const q = query.toLowerCase().trim();
    const data = dataRef.current;
    if (!data) return;

    const seen = new Set<string>();
    const out: SearchResult[] = [];

    const push = (type: EntityType, id: string, label: string, subtitle?: string, meta?: string) => {
      const key = `${type}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ type, id, label, subtitle, meta });
    };

    // Helper: extraer campos con fallback a claves legacy
    const get = (r: Shipment | ExpRecord, primary: string, ...alts: string[]): string => {
      const rec = r as unknown as Record<string, unknown>;
      if (rec[primary] && typeof rec[primary] === 'string') return rec[primary] as string;
      for (const a of alts) {
        if (rec[a] && typeof rec[a] === 'string') return rec[a] as string;
      }
      return '';
    };

    // Buscar en depósitos + exportaciones
    for (const r of [...data.depositos, ...data.exportaciones]) {
      if (out.length > 50) break;
      const cote = (r.nroCote || '').toLowerCase();
      const emp = get(r, 'nombreEstablecimientoCertif', 'establecimiento', 'nombreEstablecimientoProd').toLowerCase();
      const prod = get(r, 'nombreEstablecimientoProd', 'productor').toLowerCase();
      const dest = get(r, 'nombreEstablecimientoDestino', 'destino').toLowerCase();
      const pais = (r.paisDestino || '').toLowerCase();
      const corte = (r.corte || '').toLowerCase();
      const prod_ = get(r, 'denominacionMercaderia', 'denominacion', 'producto').toLowerCase();
      const cont = get(r, 'contenedorSerieNro', 'contenedor').toLowerCase();
      const envases = r.cantidadEnvases || 0;

      if (cote && cote.includes(q)) push('cote', r.nroCote, r.nroCote, 'COTE', `${get(r, 'nombreEstablecimientoCertif', 'establecimiento')} ${r.paisDestino || ''}`.trim());
      if (emp && emp.includes(q)) push('empresa', get(r, 'nombreEstablecimientoCertif', 'establecimiento'), get(r, 'nombreEstablecimientoCertif', 'establecimiento'), 'Empresa', `${envases} envases`);
      if (prod && prod.includes(q)) push('productor', get(r, 'nombreEstablecimientoProd', 'productor'), get(r, 'nombreEstablecimientoProd', 'productor'), 'Productor', get(r, 'nombreEstablecimientoCertif', 'establecimiento'));
      if (dest && dest.includes(q)) push('destino', get(r, 'nombreEstablecimientoDestino', 'destino'), get(r, 'nombreEstablecimientoDestino', 'destino'), 'Destino', r.paisDestino || '');
      if (pais && pais.includes(q)) push('pais', r.paisDestino, r.paisDestino, 'País', get(r, 'nombreEstablecimientoDestino', 'destino'));
      if (corte && corte.includes(q)) push('corte', r.corte, r.corte, 'Corte', get(r, 'denominacionMercaderia', 'denominacion'));
      if (prod_ && prod_.includes(q)) push('producto', get(r, 'denominacionMercaderia', 'denominacion', 'producto'), get(r, 'denominacionMercaderia', 'denominacion', 'producto'), 'Producto');
      if (cont && cont.includes(q)) push('contenedor', get(r, 'contenedorSerieNro', 'contenedor'), get(r, 'contenedorSerieNro', 'contenedor'), 'Contenedor', r.nroCote || '');
    }

    setResults(out.slice(0, 30));
    setOpen(true);
    setHighlight(0);
  }, [query, dataReady]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Navegación por teclado
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = results[highlight];
      if (sel) selectResult(sel);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function selectResult(r: SearchResult) {
    openDrawer(r.type, r.id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  // Agrupar por tipo
  const grouped = useMemo(() => {
    const g: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!g[r.type]) g[r.type] = [];
      g[r.type].push(r);
    }
    return g;
  }, [results]);

  const flatIndex = (type: string, idx: number) => {
    let counter = 0;
    for (const t of Object.keys(grouped)) {
      if (t === type) return counter + idx;
      counter += grouped[t].length;
    }
    return counter + idx;
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            'w-full pl-10 pr-10 py-2.5 rounded-lg text-sm',
            'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
            'placeholder:text-slate-400 text-slate-800 dark:text-slate-100',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400',
            'transition-shadow',
          )}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
          {Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type as EntityType];
            const Icon = meta.icon;
            return (
              <div key={type}>
                <div className="sticky top-0 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 border-b border-slate-100 dark:border-slate-900 flex items-center gap-1.5">
                  <Icon className={cn('w-3 h-3', meta.color.split(' ')[0])} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{meta.label}</span>
                  <span className="text-[10px] text-slate-400">({items.length})</span>
                </div>
                {items.map((r, idx) => {
                  const flatIdx = flatIndex(type, idx);
                  return (
                    <button
                      key={`${r.type}:${r.id}`}
                      onClick={() => selectResult(r)}
                      onMouseEnter={() => setHighlight(flatIdx)}
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors',
                        flatIdx === highlight ? 'bg-violet-50 dark:bg-violet-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                      )}
                    >
                      <Icon className={cn('w-3.5 h-3.5 shrink-0', meta.color.split(' ')[0])} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">{r.label}</p>
                        {r.subtitle && <p className="text-[10px] text-slate-500 truncate">{r.subtitle}</p>}
                      </div>
                      {r.meta && <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{r.meta}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-6 text-center">
          <p className="text-xs text-slate-500">Sin resultados para &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
