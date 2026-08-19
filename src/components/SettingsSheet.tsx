'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Database, Loader2, Settings, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ConnectionStatus {
  state: 'loading' | 'connected' | 'error';
  email?: string;
  role?: string;
  imports?: number;
  snapshots?: number;
  message?: string;
}

export default function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'loading' });

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStatus({ state: 'loading' });

    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('La sesión no está disponible.');

        const [profileResult, importsResult, snapshotsResult] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', authData.user.id).single(),
          supabase.from('import_runs').select('id', { count: 'exact', head: true }),
          supabase.from('stock_snapshots').select('id', { count: 'exact', head: true }),
        ]);
        const error = profileResult.error || importsResult.error || snapshotsResult.error;
        if (error) throw new Error(error.message);

        if (active) {
          setStatus({
            state: 'connected',
            email: authData.user.email,
            role: profileResult.data.role,
            imports: importsResult.count || 0,
            snapshots: snapshotsResult.count || 0,
          });
        }
      } catch (error) {
        if (active) {
          setStatus({
            state: 'error',
            message: error instanceof Error ? error.message : 'No se pudo comprobar Supabase.',
          });
        }
      }
    })();

    return () => { active = false; };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-600" />
              Base de datos operativa
            </h3>

            {status.state === 'loading' && (
              <div className="flex items-center gap-3 rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" /> Comprobando Supabase…
              </div>
            )}

            {status.state === 'connected' && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-3">
                  <Cloud className="h-5 w-5 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Conectado a Supabase</p>
                    <p className="text-xs text-emerald-700">PostgreSQL protegido con autenticación y RLS</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-white/70 p-2"><dt className="text-slate-500">Usuario</dt><dd className="font-medium break-all">{status.email}</dd></div>
                  <div className="rounded bg-white/70 p-2"><dt className="text-slate-500">Rol</dt><dd className="font-medium capitalize">{status.role}</dd></div>
                  <div className="rounded bg-white/70 p-2"><dt className="text-slate-500">Importaciones</dt><dd className="font-semibold">{status.imports}</dd></div>
                  <div className="rounded bg-white/70 p-2"><dt className="text-slate-500">Instantáneas de stock</dt><dd className="font-semibold">{status.snapshots}</dd></div>
                </dl>
              </div>
            )}

            {status.state === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                No se pudo comprobar la conexión: {status.message}
              </div>
            )}
          </section>

          <section className="border-t pt-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-600" /> Seguridad y persistencia
            </h3>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-xs leading-relaxed text-sky-800">
              Supabase es la única fuente operativa. La configuración de Firebase y el restablecimiento local fueron retirados. Las preferencias visuales pueden permanecer en este navegador, pero los ingresos, exportaciones y snapshots no se leen desde archivos incluidos ni desde localStorage.
            </div>
            <div className="flex items-start gap-2 rounded-lg border p-3 text-xs text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              Las eliminaciones y reversiones de datos se implementarán como operaciones auditadas; no existe un botón de borrado directo desde esta pantalla.
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
