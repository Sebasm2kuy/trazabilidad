'use client';

// ============================================================
// NacionalUploadButton — Subir Excel del MGAP (.xlsb/.xlsx)
// ------------------------------------------------------------
// Procesa el archivo en el navegador, lo convierte a MovRecord[],
// lo guarda en Firebase en chunks, y dispara un reload de la app
// para que las 3 pestañas de Inteligencia Comercial carguen los
// datos nuevos.
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle, Database, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { parseNacionalExcel, saveNacionalToFirebase, getNacionalMeta, type ParseProgress } from '@/lib/parseNacionalExcel';
import { clearNacionalCache } from '@/lib/nacionalLoader';

interface Props {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export function NacionalUploadButton({ className, variant = 'outline', size = 'sm' }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [meta, setMeta] = useState<{ fileName: string; fecha: string; totalRegistros: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar metadata al montar
  useEffect(() => {
    getNacionalMeta().then(m => setMeta(m));
  }, []);

  async function handleFile(file: File) {
    setUploading(true);
    setProgress({ phase: 'reading', current: 0, total: file.size, message: `Leyendo ${file.name}…` });
    toast.info(`Procesando ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);

    try {
      // 1. Parsear el Excel → MovRecord[]
      const records = await parseNacionalExcel(file, (p) => {
        setProgress(p);
      });

      if (records.length === 0) {
        toast.error('No se encontraron registros en el archivo');
        return;
      }

      toast.info(`${records.length.toLocaleString('es-UY')} registros procesados. Guardando en la nube…`);

      // 2. Guardar en Firebase en chunks
      const totalChunks = Math.ceil(records.length / 5000);
      await saveNacionalToFirebase(records, file.name, (saved, total) => {
        setProgress({
          phase: 'parsing',
          current: saved,
          total,
          message: `Guardando en la nube… ${saved}/${total} chunks`,
        });
      });

      // 3. Limpiar cache del loader
      clearNacionalCache();

      // 4. Actualizar metadata
      const newMeta = await getNacionalMeta();
      setMeta(newMeta);

      toast.success(`¡Listo! ${records.length.toLocaleString('es-UY')} registros guardados. Recargando…`);

      // 5. Recargar la app después de 2s
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error('[nacional-upload] error:', err);
      toast.error('Error: ' + (err as Error).message);
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsb,.xlsx,.xls"
        onChange={onInputChange}
        className="hidden"
      />
      <Button
        variant={variant}
        size={size}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="gap-1.5"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? 'Procesando…' : 'Subir Excel MGAP'}
      </Button>

      {/* Metadata del último archivo subido */}
      {meta && !uploading && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Database className="h-3 w-3" />
          <span className="truncate max-w-[200px]" title={meta.fileName}>
            {meta.fileName}
          </span>
          <span>·</span>
          <span>{meta.totalRegistros.toLocaleString('es-UY')} reg</span>
          <span>·</span>
          <span>{new Date(meta.fecha).toLocaleDateString('es-UY')}</span>
        </div>
      )}

      {/* Barra de progreso */}
      {uploading && progress && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>{progress.message}</span>
          {progress.total > 0 && (
            <span className="font-mono">
              {progress.phase === 'parsing' && progress.total > 100
                ? `${Math.round((progress.current / progress.total) * 100)}%`
                : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
