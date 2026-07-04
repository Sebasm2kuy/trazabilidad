'use client';

// ============================================================
// ClientesEstrategicos — Wrapper con selector de cliente
// ------------------------------------------------------------
// Por ahora solo NIREA SAN JACINTO. La arquitectura permite
// agregar más clientes estratégicos en el futuro.
// ============================================================

import { useState } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { CLIENTES_ESTRATEGICOS } from '@/intelligence-engine/capturaCaliral';
import { NireaSanJacinto } from './NireaSanJacinto';

export function ClientesEstrategicos() {
  const [selected, setSelected] = useState<string | null>('NIREA');

  if (selected === 'NIREA') {
    return <NireaSanJacinto />;
  }

  // Selector de cliente estratégico
  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="px-8 pt-8 pb-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] uppercase tracking-widest text-violet-600 dark:text-violet-400 font-semibold mb-1">
            Inteligencia Comercial
          </p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">
            Clientes Estratégicos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Seleccioná un cliente para analizar su participación con CALIRAL.
          </p>
        </div>
      </div>

      <div className="px-8 pb-12">
        <div className="max-w-4xl mx-auto space-y-2">
          {CLIENTES_ESTRATEGICOS.map(cliente => (
            <button
              key={cliente.id}
              onClick={() => setSelected(cliente.id)}
              className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-violet-700 dark:text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {cliente.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Análisis de exportaciones · Índice de Captura CALIRAL
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300" />
            </button>
          ))}

          <Card className="p-5 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
            <p className="text-xs text-slate-500 text-center">
              Próximamente: más clientes estratégicos.
              <br />
              <span className="text-[10px]">Contactá al administrador para agregar nuevos clientes.</span>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
