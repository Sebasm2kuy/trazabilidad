'use client';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Settings, Cloud, CloudOff, RefreshCw, CheckCircle2, XCircle, Loader2, ExternalLink, Save } from 'lucide-react';
import { toast } from 'sonner';
import * as gs from '@/lib/googleSheets';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('');

  useEffect(() => {
    if (open) {
      setUrl(gs.getSheetUrl());
      setLastSync(gs.getLastSync());
      setTestResult(null);
    }
  }, [open]);

  // Listen for sync events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.type === 'initial-pull') {
        if (detail.error) {
          toast.error(`Error al sincronizar: ${detail.error}`);
        } else if (detail.count > 0) {
          toast.success(`Sincronizado: ${detail.count} campos cargados`);
        }
        setLastSync(gs.getLastSync());
      } else if (detail.type === 'auto-push') {
        if (detail.error) {
          console.warn('Auto-push failed:', detail.error);
        }
        setLastSync(gs.getLastSync());
      }
    };
    window.addEventListener('sheets-sync', handler);
    return () => window.removeEventListener('sheets-sync', handler);
  }, []);

  const handleSave = () => {
    if (!url.trim()) {
      gs.setSheetUrl('');
      toast.success('URL eliminada. Usando datos locales.');
      setTestResult(null);
      onOpenChange(false);
      return;
    }
    gs.setSheetUrl(url.trim());
    toast.success('URL guardada. Probá la conexión.');
  };

  const handleTest = async () => {
    if (!url.trim()) {
      toast.error('Ingresá la URL primero');
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await gs.ping();
    setTestResult({
      ok: result.ok,
      message: result.ok ? `Conectado (${result.time ? new Date(result.time).toLocaleTimeString('es-UY') : 'ok'})` : (result.error || 'No se pudo conectar'),
    });
    setTesting(false);
  };

  const handleSyncNow = async () => {
    if (!gs.isConfigured()) {
      toast.error('Configurá la URL del script primero');
      return;
    }
    setSyncing(true);
    const result = await gs.fullSync();
    setSyncing(false);
    setLastSync(gs.getLastSync());
    if (result.error) {
      toast.error(`Error: ${result.error}`);
    } else {
      toast.success(`Sincronizado: ${result.pulled} bajados, ${result.pushed} subidos`);
    }
  };

  const configured = gs.isConfigured();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sincronización con Google Sheets
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${configured ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
            {configured ? (
              <Cloud className="h-5 w-5 text-emerald-600" />
            ) : (
              <CloudOff className="h-5 w-5 text-amber-600" />
            )}
            <div>
              <p className="text-sm font-medium">{configured ? 'Conectado a Google Sheets' : 'No conectado'}</p>
              <p className="text-xs text-slate-500">
                {configured
                  ? (lastSync ? `Ultima sync: ${new Date(lastSync).toLocaleString('es-UY')}` : 'Sin sincronización previa')
                  : 'Los datos se guardan solo en este navegador'}
              </p>
            </div>
          </div>

          {/* URL Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              URL del Script de Google
            </label>
            <Input
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={e => { setUrl(e.target.value); setTestResult(null); }}
              className="text-xs font-mono"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
            <p className="text-[11px] text-slate-400">
              Pegá acá la URL que te da Google Apps Script al implementar
            </p>
          </div>

          {/* Buttons row */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSave} className="flex-1">
              <Save className="h-3.5 w-3.5 mr-1.5" />Guardar URL
            </Button>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !url.trim()}>
              {testing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5 mr-1.5" />}
              Probar
            </Button>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult.message}
            </div>
          )}

          {/* Sync button */}
          {configured && (
            <div className="space-y-2">
              <Button
                size="sm"
                onClick={handleSyncNow}
                disabled={syncing}
                className="w-full"
                variant="outline"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {syncing ? 'Sincronizando...' : 'Sincronizar ahora (subir y bajar)'}
              </Button>
              <p className="text-[11px] text-slate-400">
                Fusiona datos locales con los de la Sheet. Tus datos locales tienen prioridad.
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Como configurar (una sola vez):</h4>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside">
              <li>
                Andá a{' '}
                <a href="https://script.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-0.5">
                  script.google.com <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </li>
              <li>Creá un nuevo proyecto de Apps Script</li>
              <li>Creá un Spreadsheet nuevo (Archivo &gt; Nuevo &gt; Hoja de cálculo) o usá uno existente</li>
              <li>
                En el editor de Apps Script, pegá el código que está en el archivo{' '}
                <code className="bg-slate-100 px-1 rounded font-mono">google-script/Code.gs</code> del repositorio
              </li>
              <li>Implementar &gt; Nueva implementación &gt; Aplicación web</li>
              <li>Ejecutar como: <b>Yo</b> | Acceso: <b>Cualquier persona</b></li>
              <li>Copiá la URL y pegala arriba</li>
            </ol>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <b>Como funciona:</b> Cada vez que editás datos, se sincronizan automáticamente con la Sheet
              (con una espera de 2 segundos después de tu último cambio). Cuando abrís la app en otro PC,
              los datos se cargan desde la Sheet automáticamente. También podés ver y editar los datos
              directamente en la Sheet si querés.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}