// ============================================================
// NACIONAL LOADER — Carga perezosa y cacheada del dataset MGAP
// ------------------------------------------------------------
// Orden de prioridad:
// 1. Firebase (mercado_nacional_data) — datos subidos por el usuario
// 2. Cache en memoria
// (El archivo estático nacional_mgmp.json.gz fue eliminado del bundle)
// ============================================================

import type { MovRecord } from '@/intelligence/types';
import { loadNacionalFromFirebase } from '@/lib/parseNacionalExcel';

let cache: MovRecord[] | null = null;
let loadingPromise: Promise<MovRecord[]> | null = null;

/** Carga el dataset nacional con cache en memoria. */
export async function loadNacionalRecords(): Promise<MovRecord[]> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      // Intentar Firebase (datos subidos por el usuario)
      const fbData = await loadNacionalFromFirebase();
      if (fbData && fbData.length > 0) {
        cache = fbData;
        return fbData;
      }
      // Sin datos — devolver array vacío
      cache = [];
      return [];
    } catch (e) {
      console.warn('[nacional-loader] carga falló:', e);
      cache = [];
      return [];
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/** Limpia el cache (para forzar recarga después de subir nuevo Excel). */
export function clearNacionalCache(): void {
  cache = null;
  loadingPromise = null;
}
