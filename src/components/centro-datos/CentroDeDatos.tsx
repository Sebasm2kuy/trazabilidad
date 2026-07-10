'use client';

// ============================================================
// CentroDeDatos — Única pantalla de importación de la plataforma
// ------------------------------------------------------------
// ETI-03: Ningún otro módulo puede leer Excel. Esta es la única
// puerta de entrada oficial para los 4 archivos oficiales.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Database, Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  RefreshCw, Clock, BarChart3, Trash2, FileCheck, Loader2,
  HardDrive, Activity, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ImportManager } from '@/etl/importManager';
import type { ImportProgress, LoadSession } from '@/etl/interfaces';

type FileType = 'nacional' | 'ingresos' | 'exportaciones' | 'pallets';

interface FileState {
  file: File | null;
  status: 'empty' | 'selected' | 'validating' | 'valid' | 'importing' | 'done' | 'error';
  error?: string;
  session?: LoadSession;
}

const FILE_CONFIG: Record<FileType, { label: string; accept: string; icon: typeof Database; color: string; bgColor: string; description: string }> = {
  nacional: {
    label: 'MGAP Nacional',
    accept: '.xlsb,.xlsx,.xls',
    icon: Globe,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900',
    description: 'Exportar_DatosEmbarqueCarne — histórico 2025→hoy',
  },
  ingresos: {
    label: 'Ingresos a FRIMARAL',
    accept: '.xlsx,.xls',
    icon: FileText,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
    description: 'Todos los ingresos reales a depósito',
  },
  exportaciones: {
    label: 'Exportaciones desde FRIMARAL',
    accept: '.xlsx,.xls',
    icon: Ship,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900',
    description: 'Todas las exportaciones reales',
  },
  pallets: {
    label: 'Movimiento de Pallets (Stock)',
    accept: '.xls,.xlsx',
    icon: Package,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900',
    description: 'Stock operativo del día — fuente de verdad absoluta',
  },
};

// Import icons used above
import { Globe, Ship, Package } from 'lucide-react';

export function CentroDeDatos() {
  const [files, setFiles] = useState<Record<FileType, FileState>>({
    nacional: { file: null, status: 'empty' },
    ingresos: { file: null, status: 'empty' },
    exportaciones: { file: null, status: 'empty' },
    pallets: { file: null, status: 'empty' },
  });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [history, setHistory] = useState<LoadSession[]>([]);
  const [lastSession, setLastSession] = useState<LoadSession | null>(null);
  const [dragOver, setDragOver] = useState<FileType | null>(null);
  const [directDataCounts, setDirectDataCounts] = useState<{
    nacional: number;
    ingresos: number;
    exportaciones: number;
    pallets: number;
  }>({ nacional: 0, ingresos: 0, exportaciones: 0, pallets: 0 });
  const fileInputRefs = useRef<Record<FileType, HTMLInputElement | null>>({
    nacional: null, ingresos: null, exportaciones: null, pallets: null,
  });

  // Cargar historial del ImportManager + detectar datos cargados directamente
  // en localStorage (por otras pestañas o cargas manuales que no pasaron
  // por el ImportManager). Esto evita que el Centro de Datos diga "Sin datos"
  // cuando las otras pestañas sí tienen datos.
  useEffect(() => {
    const loadStatus = () => {
      setHistory(ImportManager.getHistory());
      setLastSession(ImportManager.getLastSession());

      // Detectar datos cargados directamente en localStorage
      try {
        const nacionalRaw = localStorage.getItem('mercado_nacional_data');
        let nacionalCount = 0;
        if (nacionalRaw) {
          const parsed = JSON.parse(nacionalRaw);
          if (Array.isArray(parsed)) nacionalCount = parsed.length;
          else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown[] }).data)) {
            nacionalCount = (parsed as { data: unknown[] }).data.length;
          }
        }

        const depImportedRaw = localStorage.getItem('trazabilidad_dep_imported');
        const depNewRaw = localStorage.getItem('trazabilidad_dep_new_records');
        const depCount =
          (depImportedRaw ? (JSON.parse(depImportedRaw) as unknown[]).length : 0) +
          (depNewRaw ? (JSON.parse(depNewRaw) as unknown[]).length : 0);

        const expImportedRaw = localStorage.getItem('trazabilidad_exp_imported');
        const expCount = expImportedRaw ? (JSON.parse(expImportedRaw) as unknown[]).length : 0;

        const stockRaw = localStorage.getItem('trazabilidad_stock_data');
        let palletsCount = 0;
        if (stockRaw) {
          const stock = JSON.parse(stockRaw) as { pallets?: unknown[] };
          palletsCount = Array.isArray(stock?.pallets) ? stock.pallets.length : 0;
        }

        setDirectDataCounts({
          nacional: nacionalCount,
          ingresos: depCount,
          exportaciones: expCount,
          pallets: palletsCount,
        });
      } catch { /* ignore parse errors */ }
    };

    loadStatus();
    // Recargar cuando se dispare el evento de datos listos
    window.addEventListener('trazabilidad-data-ready', loadStatus);
    return () => window.removeEventListener('trazabilidad-data-ready', loadStatus);
  }, []);

  const handleFileSelect = (tipo: FileType, file: File) => {
    setFiles(prev => ({ ...prev, [tipo]: { file, status: 'selected' } }));
  };

  const handleImport = useCallback(async (tipo: FileType) => {
    const fileState = files[tipo];
    if (!fileState.file) return;

    setImporting(true);
    setFiles(prev => ({ ...prev, [tipo]: { ...fileState, status: 'importing' } }));

    try {
      setProgress({ phase: 'reading', current: 0, total: fileState.file.size, message: `Leyendo ${fileState.file.name}…` });

      const session = await ImportManager.importFile(fileState.file, tipo, (p) => {
        setProgress(p);
      });

      setFiles(prev => ({ ...prev, [tipo]: { file: fileState.file, status: 'done', session } }));
      setHistory(ImportManager.getHistory());
      setLastSession(session);
      toast.success(`${FILE_CONFIG[tipo].label}: ${session.totalRegistros.toLocaleString('es-UY')} registros importados`);
    } catch (err) {
      const message = (err as Error).message;
      setFiles(prev => ({ ...prev, [tipo]: { file: fileState.file, status: 'error', error: message } }));
      toast.error(`Error: ${message}`);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, [files]);

  const handleImportAll = useCallback(async () => {
    const tipos = Object.keys(files) as FileType[];
    for (const tipo of tipos) {
      if (files[tipo].file && files[tipo].status === 'selected') {
        await handleImport(tipo);
      }
    }
    toast.success('Importación completa. Recargando…');
    setTimeout(() => window.location.reload(), 2000);
  }, [files, handleImport]);

  const handleRemove = (tipo: FileType) => {
    setFiles(prev => ({ ...prev, [tipo]: { file: null, status: 'empty' } }));
    if (fileInputRefs.current[tipo]) fileInputRefs.current[tipo]!.value = '';
  };

  const handleDrop = (tipo: FileType, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(tipo, file);
  };

  // Estado general del sistema
  // Considera tanto sesiones del ImportManager como datos cargados
  // directamente en localStorage (por otras pestañas o cargas manuales)
  const directTotal = directDataCounts.nacional + directDataCounts.ingresos + directDataCounts.exportaciones + directDataCounts.pallets;
  const totalRegistros = history.reduce((s, h) => s + h.totalRegistros, 0) + directTotal;
  const systemUpdated = lastSession !== null || directTotal > 0;
  const integrityScore = lastSession
    ? Math.max(0, 100 - lastSession.errores * 0.5 - lastSession.advertencias * 0.1)
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* HEADER */}
      <div className="px-8 pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-5 h-5 text-violet-600" />
            <p className="text-[11px] uppercase tracking-widest text-violet-600 dark:text-violet-400 font-semibold">
              Sistema · Centro de Datos
            </p>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">
            Centro de Datos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Única puerta de entrada de información. Los 4 archivos oficiales se procesan aquí.
          </p>
        </div>
      </div>

      {/* PANEL SUPERIOR — Estado del sistema */}
      <div className="px-8 pb-6">
        <div className="max-w-6xl mx-auto">
          <Card className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', systemUpdated ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-amber-100 dark:bg-amber-900/40')}>
                  {systemUpdated ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Estado</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {systemUpdated ? 'Sistema actualizado' : 'Sin datos cargados'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Última carga</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {lastSession ? new Date(lastSession.fecha).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Integridad</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {integrityScore > 0 ? `${integrityScore.toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Database className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Registros</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {totalRegistros > 0 ? totalRegistros.toLocaleString('es-UY') : '0'}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* PANEL CENTRAL — 4 tarjetas de archivos */}
      <div className="px-8 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(FILE_CONFIG) as FileType[]).map(tipo => {
              const config = FILE_CONFIG[tipo];
              const state = files[tipo];
              const Icon = config.icon;

              return (
                <Card
                  key={tipo}
                  className={cn('p-4 transition-all', config.bgColor, dragOver === tipo && 'ring-2 ring-violet-400 ring-offset-2')}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(tipo); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(tipo, e)}
                >
                  <input
                    ref={(el) => { fileInputRefs.current[tipo] = el; }}
                    type="file"
                    accept={config.accept}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(tipo, f); }}
                    className="hidden"
                  />

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center bg-white dark:bg-slate-900')}>
                        <Icon className={cn('w-5 h-5', config.color)} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{config.label}</p>
                        <p className="text-[10px] text-slate-500">{config.description}</p>
                      </div>
                    </div>
                    {state.status === 'done' && (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> OK
                      </Badge>
                    )}
                    {state.status === 'error' && (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        <AlertCircle className="w-3 h-3 mr-1" /> Error
                      </Badge>
                    )}
                    {state.status === 'importing' && (
                      <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Procesando
                      </Badge>
                    )}
                  </div>

                  {state.file ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate flex-1 text-slate-700 dark:text-slate-200" title={state.file.name}>
                          {state.file.name}
                        </span>
                        <span className="text-slate-400 shrink-0">
                          {(state.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </div>

                      {state.status === 'done' && state.session && (
                        <div className="text-[11px] text-slate-500 space-y-0.5">
                          <p>✓ {state.session.totalRegistros.toLocaleString('es-UY')} registros</p>
                          <p>✓ {state.session.errores} errores · {state.session.advertencias} advertencias</p>
                        </div>
                      )}

                      {state.status === 'error' && (
                        <p className="text-[11px] text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2">
                          {state.error}
                        </p>
                      )}

                      <div className="flex gap-2">
                        {state.status === 'selected' && (
                          <Button size="sm" className="h-7 text-xs flex-1" onClick={() => handleImport(tipo)}>
                            <Upload className="w-3 h-3 mr-1" /> Importar
                          </Button>
                        )}
                        {state.status === 'done' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => fileInputRefs.current[tipo]?.click()}>
                            <RefreshCw className="w-3 h-3 mr-1" /> Reemplazar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleRemove(tipo)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRefs.current[tipo]?.click()}
                      className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 text-center hover:border-violet-400 transition-colors"
                    >
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-500">Arrastrar archivo o click para seleccionar</p>
                      <p className="text-[10px] text-slate-400 mt-1">{config.accept}</p>
                    </button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Botón importar todo */}
          {Object.values(files).some(f => f.status === 'selected') && (
            <div className="mt-4 flex justify-center">
              <Button
                size="lg"
                className="gap-2"
                onClick={handleImportAll}
                disabled={importing}
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                {importing ? 'Procesando…' : 'Importar todos los archivos seleccionados'}
              </Button>
            </div>
          )}

          {/* Barra de progreso */}
          {importing && progress && (
            <div className="mt-4">
              <Card className="p-3">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-violet-600 animate-pulse" />
                  <div className="flex-1">
                    <p className="text-xs text-slate-700 dark:text-slate-200">{progress.message}</p>
                    {progress.total > 0 && (
                      <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all"
                          style={{ width: `${Math.min((progress.current / progress.total) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* HISTORIAL */}
      {history.length > 0 && (
        <div className="px-8 pb-12">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              Historial de importaciones
            </h2>
            <Card className="divide-y divide-slate-100 dark:divide-slate-900">
              {history.slice(0, 10).map((session) => (
                <div key={session.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', session.errores === 0 ? 'bg-emerald-500' : 'bg-amber-500')} />
                  <span className="text-slate-500 w-32 shrink-0">
                    {new Date(session.fecha).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-slate-700 dark:text-slate-200 flex-1 truncate">
                    {session.archivos.map(a => `${a.nombre} (${a.registros.toLocaleString('es-UY')})`).join(', ')}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {session.totalRegistros.toLocaleString('es-UY')} reg
                  </Badge>
                  {session.errores > 0 && (
                    <Badge className="text-[9px] bg-red-100 text-red-700">{session.errores} err</Badge>
                  )}
                  {session.advertencias > 0 && (
                    <Badge className="text-[9px] bg-amber-100 text-amber-700">{session.advertencias} adv</Badge>
                  )}
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
