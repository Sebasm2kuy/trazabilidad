// ============================================================
// NACIONAL LOADER — Carga perezosa y cacheada del dataset MGAP
// ------------------------------------------------------------
// Reutilizable por NIREA, Mercado Nacional, Hallazgos, etc.
// ============================================================

import type { MovRecord } from '@/intelligence/types';
import { dataUrl } from '@/lib/staticData';

let cache: MovRecord[] | null = null;
let loadingPromise: Promise<MovRecord[]> | null = null;

/** Carga el dataset nacional (222K registros) con cache en memoria. */
export async function loadNacionalRecords(): Promise<MovRecord[]> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const rr = await fetch(dataUrl('data/nacional_mgmp.json.gz'));
      if (!rr.ok) {
        // 404 es esperado después del reset (archivo borrado del bundle).
        // No loguear como error, simplemente devolver array vacío.
        if (rr.status !== 404) {
          console.warn(`[nacional-loader] HTTP ${rr.status} al cargar nacional_mgmp.json.gz`);
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

/** Limpia el cache (para forzar recarga). */
export function clearNacionalCache(): void {
  cache = null;
  loadingPromise = null;
}
