// ============================================================
// NACIONAL LOADER — Carga perezosa y cacheada del dataset MGAP
// ------------------------------------------------------------
// Orden de prioridad:
// 1. Firebase (mercado_nacional_data) — datos subidos por el usuario
// 2. Cache en memoria
// 3. Archivo estático nacional_mgmp.json.gz (puede no existir)
// ============================================================

import type { MovRecord } from '@/intelligence/types';
import { dataUrl } from '@/lib/staticData';
import { loadNacionalFromFirebase } from '@/lib/parseNacionalExcel';

let cache: MovRecord[] | null = null;
let loadingPromise: Promise<MovRecord[]> | null = null;

/** Carga el dataset nacional con cache en memoria. */
export async function loadNacionalRecords(): Promise<MovRecord[]> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      // 1. Intentar Firebase primero (datos subidos por el usuario)
      const fbData = await loadNacionalFromFirebase();
      if (fbData && fbData.length > 0) {
        cache = fbData;
        return fbData;
      }

      // 2. Fallback al archivo estático .json.gz (puede no existir post-reset)
      const rr = await fetch(dataUrl('data/nacional_mgmp.json.gz'));
      if (!rr.ok) {
        if (rr.status !== 404) {
          console.warn(`[nacional-loader] HTTP ${rr.status}`);
        }
        cache = [];
        return [];
      }
      let text: string;
      if (rr.body && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('gzip');
        const decompressed = rr.body.pipeThrough(ds);
        text = await new Response(decompressed).text();
      } else {
        const buf = await rr.arrayBuffer();
        const pako = await import('pako');
        const decompressed = pako.inflate(new Uint8Array(buf));
        text = new TextDecoder().decode(decompressed);
      }
      const data = JSON.parse(text) as MovRecord[];
      cache = data;
      return data;
    } catch (e) {
      console.warn('[nacional-loader] carga falló (datos vacíos):', e);
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
