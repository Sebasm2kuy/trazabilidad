'use client';

// ============================================================
// EntityDrawer — Panel lateral de detalle (drill-down)
// ------------------------------------------------------------
// Se abre desde el store useEntityDrawer. Recibe el tipo y id
// de la entidad seleccionada y muestra tabs con información
// detallada.
// ============================================================

import { useEffect, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Info, Package, FileText, ArrowLeftRight, GitBranch, BarChart3, History,
  Hash, Building2, Users, Warehouse, MapPin, Package as PackageIcon, Ship,
} from 'lucide-react';
import { useEntityDrawer } from '@/store/useEntityDrawer';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';
import type { Shipment, ExpRecord } from '@/lib/types';
import type { EntityType } from '@/domain/types';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<EntityType, string> = {
  cote: 'COTE',
  empresa: 'Empresa',
  cliente: 'Cliente',
  productor: 'Productor',
  certificador: 'Certificador',
  deposito: 'Depósito',
  puerto: 'Puerto',
  pais: 'País',
  destino: 'Destino',
  documento: 'Documento',
  contenedor: 'Contenedor',
  corte: 'Corte',
  producto: 'Producto',
};

const TYPE_ICON: Record<EntityType, typeof Hash> = {
  cote: Hash, empresa: Building2, cliente: Users, productor: Warehouse,
  certificador: Building2, deposito: Warehouse, puerto: Ship, pais: MapPin,
  destino: MapPin, documento: FileText, contenedor: Package, corte: PackageIcon, producto: PackageIcon,
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-UY');
}
function fmtNum(n?: number) {
  return typeof n === 'number' ? n.toLocaleString('es-UY') : '—';
}

export function EntityDrawer() {
  const { open, entityType, entityId, closeDrawer } = useEntityDrawer();
  const [relatedVersion, setRelatedVersion] = useState(0);
  const [related, setRelated] = useState<{ depositos: (Shipment | ExpRecord)[]; exportaciones: (Shipment | ExpRecord)[] } | null>(null);

  // Cargar relacionados cuando cambia entityType/entityId/open
  useEffect(() => {
    if (!open || !entityType || !entityId) {
      setRelated(null);
      return;
    }
    let mounted = true;
    Promise.all([loadDepositos(), loadExportaciones()])
      .then(([deps, exps]) => {
        if (!mounted) return;

        // Helper: extraer campo con fallback a claves legacy
        const getField = (r: Shipment | ExpRecord, primary: string, ...alts: string[]): string => {
          const rec = r as unknown as Record<string, unknown>;
          if (rec[primary] && typeof rec[primary] === 'string') return rec[primary] as string;
          for (const a of alts) {
            if (rec[a] && typeof rec[a] === 'string') return rec[a] as string;
          }
          return '';
        };

        const matchField = (r: Shipment | ExpRecord): boolean => {
          switch (entityType) {
            case 'cote': return r.nroCote === entityId;
            case 'empresa': return getField(r, 'nombreEstablecimientoCertif', 'establecimiento') === entityId;
            case 'productor': return getField(r, 'nombreEstablecimientoProd', 'productor') === entityId;
            case 'deposito': return getField(r, 'nombreEstablecimientoDestino', 'deposito', 'establecimiento') === entityId;
            case 'destino': return getField(r, 'nombreEstablecimientoDestino', 'destino') === entityId;
            case 'pais': return r.paisDestino === entityId;
            case 'corte': return r.corte === entityId;
            case 'producto': return getField(r, 'denominacionMercaderia', 'denominacion', 'producto') === entityId;
            case 'contenedor': return getField(r, 'contenedorSerieNro', 'contenedor') === entityId;
            case 'cliente': return getField(r, 'nombreEstablecimientoDestino', 'destino') === entityId;
            default: return false;
          }
        };

        setRelated({
          depositos: deps.filter(matchField),
          exportaciones: exps.filter(matchField),
        });
        setRelatedVersion(v => v + 1);
      })
      .catch((e) => console.error('[entity-drawer] carga falló:', e));
    return () => { mounted = false; };
  }, [open, entityType, entityId]);

  if (!entityType || !entityId) return null;
  const Icon = TYPE_ICON[entityType];
  const label = TYPE_LABEL[entityType];

  // Estadísticas agregadas
  const totalPn = (related?.depositos || []).reduce((s, r) => s + (r.pesoNeto || 0), 0) +
                  (related?.exportaciones || []).reduce((s, r) => s + (r.pesoNeto || 0), 0);
  const totalEnvases = (related?.depositos || []).reduce((s, r) => s + (r.cantidadEnvases || 0), 0) +
                       (related?.exportaciones || []).reduce((s, r) => s + (r.cantidadEnvases || 0), 0);
  const uniquePaises = new Set([
    ...(related?.depositos || []).map(r => r.paisDestino).filter(Boolean),
    ...(related?.exportaciones || []).map(r => r.paisDestino).filter(Boolean),
  ]);
  const uniqueProductores = new Set([
    ...(related?.depositos || []).map(r => (r as unknown as Record<string, string>).nombreEstablecimientoProd || (r as unknown as Record<string, string>).productor).filter(Boolean),
    ...(related?.exportaciones || []).map(r => (r as unknown as Record<string, string>).nombreEstablecimientoProd || (r as unknown as Record<string, string>).productor).filter(Boolean),
  ]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeDrawer()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center">
              <Icon className="w-5 h-5 text-violet-700 dark:text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base truncate">{entityId}</SheetTitle>
              <SheetDescription className="text-xs">
                <Badge variant="secondary" className="text-[10px]">{label}</Badge>{' '}
                {related && (
                  <span className="text-slate-500">
                    {related.depositos.length + related.exportaciones.length} registros
                  </span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-7 mx-4 mt-3 h-9 text-[11px]">
            <TabsTrigger value="general"><Info className="w-3 h-3 mr-1" />General</TabsTrigger>
            <TabsTrigger value="mercaderia"><Package className="w-3 h-3 mr-1" />Mercadería</TabsTrigger>
            <TabsTrigger value="docs"><FileText className="w-3 h-3 mr-1" />Docs</TabsTrigger>
            <TabsTrigger value="movs"><ArrowLeftRight className="w-3 h-3 mr-1" />Movs</TabsTrigger>
            <TabsTrigger value="traz"><GitBranch className="w-3 h-3 mr-1" />Trazab.</TabsTrigger>
            <TabsTrigger value="analisis"><BarChart3 className="w-3 h-3 mr-1" />Análisis</TabsTrigger>
            <TabsTrigger value="hist"><History className="w-3 h-3 mr-1" />Historial</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 px-6 py-4">
            <TabsContent value="general" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Peso Neto Total" value={`${fmtNum(totalPn)} kg`} />
                <Stat label="Envases Total" value={fmtNum(totalEnvases)} />
                <Stat label="Países únicos" value={String(uniquePaises.size)} />
                <Stat label="Productores" value={String(uniqueProductores.size)} />
                <Stat label="Ingresos a depósito" value={String(related?.depositos.length || 0)} />
                <Stat label="Exportaciones" value={String(related?.exportaciones.length || 0)} />
              </div>
              {uniquePaises.size > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Países de destino</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(uniquePaises).map(p => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {uniqueProductores.size > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Productores vinculados</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(uniqueProductores).slice(0, 15).map(p => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="mercaderia" className="space-y-2 mt-0">
              {(related?.depositos || []).length === 0 && (related?.exportaciones || []).length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-2">
                  {[...(related?.depositos || []), ...(related?.exportaciones || [])].slice(0, 50).map((r, i) => {
                    const rr = r as unknown as Record<string, string | number | null | undefined>;
                    return (
                    <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="COTE" value={r.nroCote || '—'} />
                        <Field label="Corte" value={r.corte || '—'} />
                        <Field label="Producto" value={(rr.denominacionMercaderia as string) || (rr.denominacion as string) || (rr.producto as string) || '—'} />
                        <Field label="Peso Neto" value={`${fmtNum(r.pesoNeto || 0)} kg`} />
                        <Field label="Envases" value={fmtNum(r.cantidadEnvases || 0)} />
                        <Field label="Pallets" value={fmtNum(r.pallets || 0)} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="docs" className="space-y-2 mt-0">
              {(related?.depositos || []).length === 0 ? <Empty /> : (
                <div className="space-y-2">
                  {(related?.depositos || []).slice(0, 30).map((r, i) => {
                    const rr = r as unknown as Record<string, string | null | undefined>;
                    return (
                    <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="N° Trámite" value={String(r.nroTramite || '—')} />
                        <Field label="Fecha Trámite" value={fmtDate(r.fechaTramite)} />
                        <Field label="Faena desde" value={fmtDate(rr.fechaInicioFaena)} />
                        <Field label="Faena hasta" value={fmtDate(rr.fechaFinFaena)} />
                        <Field label="Producción desde" value={fmtDate(rr.fechaInicioProduccion)} />
                        <Field label="Producción hasta" value={fmtDate(rr.fechaFinProduccion)} />
                        <Field label="Congelación desde" value={fmtDate(rr.fechaInicioCongelacion)} />
                        <Field label="Congelación hasta" value={fmtDate(rr.fechaFinCongelacion)} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="movs" className="space-y-2 mt-0">
              {(related?.depositos || []).length === 0 && (related?.exportaciones || []).length === 0 ? <Empty /> : (
                <div className="space-y-1.5">
                  {(related?.depositos || []).map((r, i) => {
                    const rr = r as unknown as Record<string, string | undefined>;
                    return (
                    <div key={`d-${i}`} className="flex items-center gap-2 text-xs p-2 rounded bg-blue-50 dark:bg-blue-950/30">
                      <ArrowLeftRight className="w-3 h-3 text-blue-600" />
                      <span className="font-medium">Ingreso a depósito</span>
                      <span className="text-slate-500">{rr.nombreEstablecimientoDestino || rr.deposito || rr.nombreEstablecimientoCertif}</span>
                      <span className="text-slate-400 ml-auto">{fmtDate(r.fechaTramite)}</span>
                    </div>
                    );
                  })}
                  {(related?.exportaciones || []).map((r, i) => (
                    <div key={`e-${i}`} className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/30">
                      <Ship className="w-3 h-3 text-emerald-600" />
                      <span className="font-medium">Exportación</span>
                      <span className="text-slate-500">{r.paisDestino}</span>
                      <span className="text-slate-400 ml-auto">{fmtDate(r.fechaTramite)}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="traz" className="mt-0">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500">
                <GitBranch className="w-4 h-4 mb-2 text-violet-600" />
                <p>Línea de tiempo de trazabilidad completa estará disponible cuando se vinculen los registros con el módulo de stock palets y movimientos manuales.</p>
                <p className="mt-2">Actualmente hay {related?.depositos.length || 0} ingresos y {related?.exportaciones.length || 0} exportaciones vinculados.</p>
              </div>
            </TabsContent>

            <TabsContent value="analisis" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Peso Neto promedio" value={`${fmtNum(related ? totalPn / Math.max(related.depositos.length + related.exportaciones.length, 1) : 0)} kg`} />
                <Stat label="Envases promedio" value={fmtNum(related ? totalEnvases / Math.max(related.depositos.length + related.exportaciones.length, 1) : 0)} />
              </div>
              {uniquePaises.size > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Distribución por país</p>
                  {Array.from(uniquePaises).map(p => {
                    const pn = [...(related?.depositos || []), ...(related?.exportaciones || [])]
                      .filter(r => r.paisDestino === p)
                      .reduce((s, r) => s + (r.pesoNeto || 0), 0);
                    const pct = totalPn > 0 ? (pn / totalPn) * 100 : 0;
                    return (
                      <div key={p} className="flex items-center gap-2 text-xs mb-1">
                        <span className="w-24 truncate">{p}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                          <div className="h-full bg-violet-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-slate-500 w-16 text-right">{fmtNum(pn)} kg</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="hist" className="mt-0">
              <div className="text-xs text-slate-500 text-center py-6">
                El historial de cambios estará disponible cuando se habilite la auditoría de ediciones.
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
      <p className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase font-semibold text-slate-400">{label}</p>
      <p className="text-xs text-slate-700 dark:text-slate-200 truncate">{value}</p>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-slate-500 text-center py-6">Sin información disponible.</div>;
}
