'use client';

// ============================================================
// OperacionCaliral — Nueva HOME del sistema
// ------------------------------------------------------------
// Diseño limpio, una sola pregunta por sección, mucho espacio
// en blanco. Reemplaza al Centro de Inteligencia como pantalla
// inicial. NO muestra dashboards genéricos.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Search, Package, AlertTriangle, Warehouse, Building2, Clock,
  FileText, ArrowRight, Activity, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UniversalSearch } from '@/components/centro/UniversalSearch';
import { EntityDrawer } from '@/components/centro/EntityDrawer';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import type { Shipment, ExpRecord } from '@/lib/types';
import type { StockLoad, StockPallet } from '@/lib/parseStockXls';
import { useAppStore } from '@/store/useAppStore';
import { useEntityDrawer } from '@/store/useEntityDrawer';

const CALIRAL_ID = 'CALIRAL S.A.';
const DAY_MS = 1000 * 60 * 60 * 24;

interface ResumenCard {
  key: string;
  label: string;
  value: string;
  subtitle: string;
  icon: typeof Package;
  color: string;
  bgColor: string;
  onClick?: () => void;
}

export function OperacionCaliral() {
  const [loading, setLoading] = useState(true);
  const [depositos, setDepositos] = useState<(Shipment | ExpRecord)[]>([]);
  const [exportaciones, setExportaciones] = useState<(Shipment | ExpRecord)[]>([]);
  const [stockPallets, setStockPallets] = useState<StockPallet[]>([]);
  const [stockLoad, setStockLoad] = useState<StockLoad | null>(null);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const openDrawer = useEntityDrawer(s => s.openDrawer);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadDepositos(), loadExportaciones()])
      .then(([deps, exps]) => {
        if (!mounted) return;
        // FILTRAR: solo registros donde CALIRAL aparece como certificador
        // o como destino (depósito). Esto excluye registros del MGAP nacional
        // que corresponden a otros exportadores.
        const isCaliral = (r: Shipment | ExpRecord): boolean => {
          const cf = String(r.nombreEstablecimientoCertif || '').toUpperCase();
          const ed = String(r.nombreEstablecimientoDestino || '').toUpperCase();
          return cf.includes('CALIRAL') || ed.includes('CALIRAL');
        };
        setDepositos(deps.filter(isCaliral));
        setExportaciones(exps.filter(isCaliral));

        // LEER STOCK DE PALLETS desde localStorage (mismo lugar que Cruces Frimaral)
        try {
          const raw = localStorage.getItem('trazabilidad_stock_data');
          if (raw) {
            const load: StockLoad = JSON.parse(raw);
            setStockLoad(load);
            setStockPallets(load.pallets || []);
          }
        } catch (e) {
          console.error('[operacion-caliral] error leyendo stock_data:', e);
        }
      })
      .catch(e => console.error('[operacion-caliral] carga falló:', e))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  // --- Cálculos operativos basados en STOCK REAL de pallets ---
  // El stock real viene del archivo de pallets cargado en Cruces Frimaral,
  // no de la suma de ingresos históricos a depósito.
  const stockTotalKg = useMemo(() => stockPallets.reduce((s, p) => s + (p.kilos || 0), 0), [stockPallets]);
  const stockTotalCajas = useMemo(() => stockPallets.reduce((s, p) => s + (p.cajas || 0), 0), [stockPallets]);
  const stockTotalPallets = useMemo(() => stockPallets.reduce((s, p) => s + (p.pallets || 0), 0), [stockPallets]);

  // COTEs únicos en stock
  const stockCotes = useMemo(() => {
    const set = new Set<string>();
    for (const p of stockPallets) {
      if (p.codigo && p.codigoTipo === 'COTE') set.add(p.codigo);
    }
    return Array.from(set);
  }, [stockPallets]);

  // Mercadería retenida: pallets cuyo contenido incluye "RETENIDO" o similar
  const retenidaPallets = useMemo(() => stockPallets.filter(p => {
    const c = (p.contenido || '').toUpperCase();
    return c.includes('RETENIDO') || c.includes('REtenido'.toUpperCase());
  }), [stockPallets]);
  const retenidaPn = retenidaPallets.reduce((s, p) => s + (p.kilos || 0), 0);

  // Mercadería mayor a 180 días: pallets cuya fecha de comisión > 180 días
  const mayor180Pallets = useMemo(() => stockPallets.filter(p => {
    if (!p.fechaComision) return false;
    const d = new Date(p.fechaComision);
    if (isNaN(d.getTime())) return false;
    const dias = Math.floor((Date.now() - d.getTime()) / DAY_MS);
    return dias > 180;
  }), [stockPallets]);
  const mayor180Pn = mayor180Pallets.reduce((s, p) => s + (p.kilos || 0), 0);

  // Mercadería en CALIRAL vs terceros: todo el stock del archivo está en CALIRAL
  // (es el depósito propio). Si hay pallets en otros depósitos, se identifican
  // por el contenedor o contenido. Por ahora asumimos que todo el stock está en CALIRAL.
  const enCaliralPn = stockTotalKg;
  const enCaliralCount = stockCotes.length;
  const enTercerosPn = 0;
  const enTercerosCount = 0;

  // Sin documentación: pallets sin COTE
  const sinDocPallets = useMemo(() => stockPallets.filter(p => !p.codigo || p.codigoTipo === 'NINGUNO'), [stockPallets]);
  const sinDocCount = sinDocPallets.length;

  const alertasCriticas = useMemo(() => {
    // Alertas: pallets retenidos + pallets > 180 días
    const alertas: { pallet: StockPallet; motivo: string }[] = [];
    for (const p of retenidaPallets.slice(0, 4)) {
      alertas.push({ pallet: p, motivo: 'Mercadería retenida' });
    }
    for (const p of mayor180Pallets.slice(0, 4)) {
      alertas.push({ pallet: p, motivo: `Sin movimiento >180 días` });
    }
    return alertas.slice(0, 8);
  }, [retenidaPallets, mayor180Pallets]);

  // Últimos movimientos
  const ultimosMovs = useMemo(() => {
    return [...depositos, ...exportaciones]
      .map(r => {
        const rec = r as unknown as Record<string, string | number | null | undefined>;
        return {
          id: String(r.id || Math.random()),
          cote: r.nroCote || '',
          tipo: rec.tipo === 'EXPORTACION' ? 'exportacion' : 'ingreso',
          fecha: r.fechaTramite || '',
          descripcion: `${rec.nombreEstablecimientoCertif || rec.establecimiento || '—'} → ${rec.nombreEstablecimientoDestino || rec.destino || r.paisDestino || '—'}`,
          peso: r.pesoNeto || 0,
        };
      })
      .filter(m => m.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 12);
  }, [depositos, exportaciones]);

  const fmt = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: 0 });
  const fmtKg = (n: number) => `${fmt(n)} kg`;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Activity className="w-6 h-6 animate-pulse text-violet-500" />
        <p className="ml-3 text-sm text-slate-500">Cargando operación…</p>
      </div>
    );
  }

  const resumenCards: ResumenCard[] = [
    {
      key: 'almacenada',
      label: 'Mercadería almacenada',
      value: fmtKg(stockTotalKg),
      subtitle: stockPallets.length > 0
        ? `${fmt(stockTotalCajas)} cajas • ${stockPallets.length} pallets • ${stockCotes.length} COTEs`
        : 'Sin stock cargado. Subí el Excel en Cruces Frimaral.',
      icon: Package,
      color: 'text-blue-700 dark:text-blue-300',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900',
      onClick: () => setActiveTab('cruce-caliral'),
    },
    {
      key: 'retenida',
      label: 'Mercadería retenida',
      value: fmtKg(retenidaPn),
      subtitle: retenidaPallets.length > 0 ? `${retenidaPallets.length} pallet(s) — atención requerida` : 'Sin retenciones',
      icon: AlertTriangle,
      color: retenidaPallets.length > 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300',
      bgColor: retenidaPallets.length > 0
        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
      onClick: () => setActiveTab('cruce-caliral'),
    },
    {
      key: 'en-caliral',
      label: 'Mercadería en CALIRAL',
      value: fmtKg(enCaliralPn),
      subtitle: `${enCaliralCount} COTE(s) en depósito propio`,
      icon: Warehouse,
      color: 'text-violet-700 dark:text-violet-300',
      bgColor: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900',
      onClick: () => setActiveTab('cruce-caliral'),
    },
    {
      key: 'en-terceros',
      label: 'Mercadería en terceros',
      value: fmtKg(enTercerosPn),
      subtitle: enTercerosCount > 0 ? `${enTercerosCount} lote(s) en depósitos de terceros` : 'Sin mercadería en terceros',
      icon: Building2,
      color: 'text-amber-700 dark:text-amber-300',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900',
      onClick: () => setActiveTab('cruce-caliral'),
    },
    {
      key: 'mayor-180',
      label: 'Mercadería mayor a 180 días',
      value: fmtKg(mayor180Pn),
      subtitle: mayor180Pallets.length > 0 ? `${mayor180Pallets.length} pallet(s) inmovilizado(s)` : 'Sin stock crónico',
      icon: Clock,
      color: mayor180Pallets.length > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-emerald-700 dark:text-emerald-300',
      bgColor: mayor180Pallets.length > 0
        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900'
        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
      onClick: () => setActiveTab('cruce-caliral'),
    },
    {
      key: 'doc-pendiente',
      label: 'Documentación pendiente',
      value: String(sinDocCount),
      subtitle: sinDocCount > 0 ? 'pallet(s) sin COTE identificado' : 'Todo documentado',
      icon: FileText,
      color: sinDocCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300',
      bgColor: sinDocCount > 0
        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
      onClick: () => setActiveTab('cruce-caliral'),
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* HEADER minimalista */}
      <div className="px-8 pt-8 pb-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] uppercase tracking-widest text-violet-600 dark:text-violet-400 font-semibold mb-1">
            Operación CALIRAL
          </p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">
            {new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {stockPallets.length > 0
              ? `${stockCotes.length} COTEs en stock • ${stockPallets.length} pallets • ${alertasCriticas.length} alerta(s)`
              : 'Sin stock cargado. Subí el Excel de pallets en Cruces Frimaral.'}
          </p>
        </div>
      </div>

      {/* BUSCADOR — elemento principal */}
      <div className="px-8 pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-3">
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200">
              Buscar mercadería
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              COTE · Lote · Productor · Cliente · País · Depósito · Documento
            </p>
          </div>
          <UniversalSearch
            placeholder="Escribí un COTE, productor, cliente o depósito…"
            autoFocus
          />
          <p className="text-center text-[11px] text-slate-400 mt-2">
            Al seleccionar un resultado se abre la ficha completa.
          </p>
        </div>
      </div>

      {/* RESUMEN OPERATIVO — 1 pregunta por tarjeta */}
      <div className="px-8 pb-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
            Resumen operativo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumenCards.map(card => {
              const Icon = card.icon;
              return (
                <button
                  key={card.key}
                  onClick={card.onClick}
                  className={cn(
                    'text-left rounded-xl border p-5 transition-all hover:shadow-md hover:-translate-y-0.5',
                    card.bgColor,
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <Icon className={cn('w-5 h-5', card.color)} />
                    {card.onClick && <ChevronRight className="w-4 h-4 text-slate-300" />}
                  </div>
                  <p className={cn('text-2xl font-bold tabular-nums', card.color)}>
                    {card.value}
                  </p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1">
                    {card.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {card.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ALERTAS CRÍTICAS — solo problemas reales */}
      {alertasCriticas.length > 0 && (
        <div className="px-8 pb-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Requiere atención
              </h2>
              <Button
                variant="ghost" size="sm"
                onClick={() => setActiveTab('cruce-caliral')}
                className="text-[11px] text-violet-600"
              >
                Ver todas <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            <div className="space-y-2">
              {alertasCriticas.map(({ pallet, motivo }) => (
                <button
                  key={pallet.id}
                  onClick={() => pallet.codigo && openDrawer('cote', pallet.codigo)}
                  className="w-full text-left rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-3 hover:shadow-sm transition-shadow flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {pallet.codigo || 'Sin COTE'} — {motivo}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {pallet.contenido?.substring(0, 80)} • {fmtKg(pallet.kilos)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ÚLTIMOS MOVIMIENTOS */}
      {ultimosMovs.length > 0 && (
        <div className="px-8 pb-12">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              Últimos movimientos
            </h2>
            <Card className="divide-y divide-slate-100 dark:divide-slate-900">
              {ultimosMovs.map(m => (
                <button
                  key={m.id}
                  onClick={() => m.cote && openDrawer('cote', m.cote)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                >
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    m.tipo === 'exportacion' ? 'bg-emerald-500' : 'bg-blue-500',
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                      <span className="font-mono font-medium">{m.cote || '—'}</span>
                      <span className="text-slate-400 mx-2">•</span>
                      {m.descripcion}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {fmtKg(m.peso)}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 w-20 text-right">
                    {m.fecha ? new Date(m.fecha).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' }) : '—'}
                  </span>
                </button>
              ))}
            </Card>
          </div>
        </div>
      )}

      <EntityDrawer />
    </div>
  );
}
