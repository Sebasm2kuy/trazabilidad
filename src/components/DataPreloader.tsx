// ============================================================
// DataPreloader — Precarga todos los datasets al iniciar la app
// ------------------------------------------------------------
// Se ejecuta una vez al montar la app. Carga en paralelo:
//   1. Dataset nacional MGAP (200K registros) — el más pesado (70%)
//   2. Depósitos (ingresos a Caliral) — 15%
//   3. Exportaciones — 10%
//   4. Stock de pallets — 5%
//
// Muestra porcentaje 0-100% con barra de progreso y heartbeat
// para que el usuario sepa que no se tranó.
// ============================================================

'use client';
import { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { loadNacionalRecords } from '@/lib/nacionalLoader';
import { loadDepositos, loadExportaciones } from '@/lib/dataRepository';

type LoadStatus = 'pending' | 'loading' | 'done' | 'error';

interface PreloadState {
  nacional: LoadStatus;
  depositos: LoadStatus;
  exportaciones: LoadStatus;
  stock: LoadStatus;
}

const initialState: PreloadState = {
  nacional: 'pending',
  depositos: 'pending',
  exportaciones: 'pending',
  stock: 'pending',
};

// Pesos de cada dataset en el progreso total
const WEIGHTS = {
  nacional: 70,      // 200K registros, el más pesado
  depositos: 15,
  exportaciones: 10,
  stock: 5,
} as const;

const WEIGHT_TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0); // 100

export function DataPreloader() {
  const [state, setState] = useState<PreloadState>(initialState);
  const [showIndicator, setShowIndicator] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let mounted = true;

    // Mostrar indicador si tarda más de 500ms
    const showTimer = setTimeout(() => mounted && setShowIndicator(true), 500);

    // Heartbeat: actualizar elapsed cada 1s para que se vea que no se tranó
    const heartbeat = setInterval(() => {
      if (mounted) setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    const updateState = (key: keyof PreloadState, value: LoadStatus) => {
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
        if (typeof window !== 'undefined') {
          localStorage.getItem('trazabilidad_stock_data');
        }
        updateState('stock', 'done');
      } catch {
        updateState('stock', 'error');
      }
    };

    loadAll();

    return () => {
      mounted = false;
      clearTimeout(showTimer);
      clearInterval(heartbeat);
    };
  }, []);

  // Ocultar indicador cuando todo termine
  const allDone = Object.values(state).every(s => s === 'done' || s === 'error');
  useEffect(() => {
    if (allDone && showIndicator) {
      const timer = setTimeout(() => setShowIndicator(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [allDone, showIndicator]);

  if (!showIndicator) return null;

  // Calcular porcentaje ponderado
  const calcProgress = (): number => {
    let pct = 0;
    (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).forEach(key => {
      const status = state[key];
      if (status === 'done' || status === 'error') {
        pct += WEIGHTS[key];
      } else if (status === 'loading') {
        // Si está cargando, sumar la mitad del peso (progreso parcial)
        pct += WEIGHTS[key] * 0.5;
      }
    });
    return Math.min(100, Math.round(pct));
  };

  const progress = calcProgress();
  const allSuccess = Object.values(state).every(s => s === 'done');

  // Encontrar qué se está cargando ahora
  const currentLoading = (Object.keys(state) as Array<keyof PreloadState>).find(k => state[k] === 'loading');
  const currentLabel: Record<string, string> = {
    nacional: '📊 Dataset MGAP (200K registros)',
    depositos: '📦 Depósitos',
    exportaciones: '🚢 Exportaciones',
    stock: '📋 Stock de pallets',
  };

  const formatTime = (s: number): string => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-4 w-72 transition-opacity duration-300">
      {/* Header con porcentaje grande */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {allSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
          )}
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {allSuccess ? 'Sincronizado' : 'Sincronizando'}
          </span>
        </div>
        <span className="text-2xl font-bold tabular-nums text-violet-600 dark:text-violet-400">
          {progress}%
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            allSuccess ? 'bg-emerald-500' : 'bg-violet-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Tiempo transcurrido + estado actual */}
      {!allSuccess && (
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
          <span>⏱ {formatTime(elapsed)}</span>
          {currentLoading && (
            <span className="text-violet-600 dark:text-violet-400 font-medium animate-pulse">
              {currentLabel[currentLoading]}…
            </span>
          )}
        </div>
      )}

      {/* Checklist de pasos */}
      <div className="space-y-0.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        {(Object.keys(state) as Array<keyof PreloadState>).map(key => {
          const status = state[key];
          const label = currentLabel[key];
          return (
            <div key={key} className="flex items-center gap-1.5 text-[10px]">
              {status === 'done' && <span className="text-emerald-600">✓</span>}
              {status === 'loading' && <span className="text-violet-600 animate-pulse">●</span>}
              {status === 'pending' && <span className="text-slate-300">○</span>}
              {status === 'error' && <span className="text-red-500">✗</span>}
              <span className={
                status === 'done' ? 'text-emerald-600' :
                status === 'loading' ? 'text-slate-700 dark:text-slate-200 font-medium' :
                status === 'error' ? 'text-red-500' :
                'text-slate-400'
              }>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mensaje de "no se tranó" cuando lleva mucho tiempo en nacional */}
      {state.nacional === 'loading' && elapsed > 30 && (
        <p className="text-[9px] text-slate-400 mt-2 italic">
          ⏳ Descargando 200K registros puede tardar 1-2 min. No se cerró.
        </p>
      )}
    </div>
  );
}
