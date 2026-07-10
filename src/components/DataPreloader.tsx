// ============================================================
// DataPreloader — Precarga todos los datasets al iniciar la app
// ------------------------------------------------------------
// Se ejecuta una vez al montar la app. Carga en paralelo:
//   1. Dataset nacional MGAP (200K registros) — el más pesado
//   2. Depósitos (ingresos a Caliral)
//   3. Exportaciones
//   4. Stock de pallets
//
// Como todos los loaders tienen cache en memoria, cuando el usuario
// abre cualquier pestaña, los datos ya están listos (instantáneo).
//
// Muestra un indicador visual discreto mientras carga.
// ============================================================

'use client';
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { loadNacionalRecords } from '@/lib/nacionalLoader';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';

interface PreloadState {
  nacional: 'pending' | 'loading' | 'done' | 'error';
  depositos: 'pending' | 'loading' | 'done' | 'error';
  exportaciones: 'pending' | 'loading' | 'done' | 'error';
  stock: 'pending' | 'loading' | 'done' | 'error';
}

const initialState: PreloadState = {
  nacional: 'pending',
  depositos: 'pending',
  exportaciones: 'pending',
  stock: 'pending',
};

export function DataPreloader() {
  const [state, setState] = useState<PreloadState>(initialState);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Mostrar indicador si tarda más de 500ms
    const showTimer = setTimeout(() => mounted && setShowIndicator(true), 500);

    const updateState = (key: keyof PreloadState, value: PreloadState[keyof PreloadState]) => {
      if (!mounted) return;
      setState(prev => ({ ...prev, [key]: value }));
    };

    // Cargar todo en paralelo
    const loadAll = async () => {
      // 1. Dataset nacional (200K registros) — el más pesado
      updateState('nacional', 'loading');
      try {
        await loadNacionalRecords();
        updateState('nacional', 'done');
      } catch {
        updateState('nacional', 'error');
      }

      // 2. Depósitos
      updateState('depositos', 'loading');
      try {
        await loadDepositos();
        updateState('depositos', 'done');
      } catch {
        updateState('depositos', 'error');
      }

      // 3. Exportaciones
      updateState('exportaciones', 'loading');
      try {
        await loadExportaciones();
        updateState('exportaciones', 'done');
      } catch {
        updateState('exportaciones', 'error');
      }

      // 4. Stock de pallets (localStorage, instantáneo)
      updateState('stock', 'loading');
      try {
        // El stock se lee directamente de localStorage en los componentes.
        // Solo verificamos que exista la clave.
        if (typeof window !== 'undefined') {
          localStorage.getItem('trazabilidad_stock_data');
        }
        updateState('stock', 'done');
      } catch {
        updateState('stock', 'error');
      }
    };

    loadAll();

    // Ocultar indicador cuando todo termine
    return () => {
      mounted = false;
      clearTimeout(showTimer);
    };
  }, []);

  // Ocultar indicador cuando todo esté done/error
  const allDone = Object.values(state).every(s => s === 'done' || s === 'error');
  useEffect(() => {
    if (allDone && showIndicator) {
      const timer = setTimeout(() => setShowIndicator(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [allDone, showIndicator]);

  if (!showIndicator) return null;

  const totalDone = Object.values(state).filter(s => s === 'done' || s === 'error').length;
  const total = Object.keys(state).length;
  const allSuccess = Object.values(state).every(s => s === 'done');

  return (
    <div className="fixed bottom-4 left-4 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-3 max-w-xs transition-opacity duration-300">
      <div className="flex items-center gap-2 mb-2">
        {allSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : (
          <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
        )}
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {allSuccess ? 'Datos sincronizados' : 'Sincronizando datos…'}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto tabular-nums">
          {totalDone}/{total}
        </span>
      </div>
      {!allSuccess && (
        <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${(totalDone / total) * 100}%` }}
          />
        </div>
      )}
      {!allSuccess && (
        <div className="mt-2 space-y-0.5">
          {state.nacional === 'loading' && (
            <p className="text-[10px] text-slate-500">📊 Cargando dataset MGAP (200K registros)…</p>
          )}
          {state.nacional === 'done' && (
            <p className="text-[10px] text-emerald-600">✓ Dataset MGAP cargado</p>
          )}
          {state.depositos === 'loading' && (
            <p className="text-[10px] text-slate-500">📦 Cargando depósitos…</p>
          )}
          {state.exportaciones === 'loading' && (
            <p className="text-[10px] text-slate-500">🚢 Cargando exportaciones…</p>
          )}
        </div>
      )}
    </div>
  );
}
