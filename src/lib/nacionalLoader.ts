// ============================================================
// NACIONAL LOADER — Carga perezosa y cacheada del dataset MGAP
// ------------------------------------------------------------
// Orden de prioridad:
// 1. Firebase (mercado_nacional_data) — datos subidos por el usuario
// 2. Cache en memoria
// (El archivo estático nacional_mgmp.json.gz fue eliminado del bundle)
//
// CACHE NIVEL 2: pre-filtra registros por cliente estratégico para
// que las pestañas posteriores no reescaneen 200K registros.
// ============================================================

import type { MovRecord } from '@/intelligence/types';
import { loadNacionalFromFirebase } from '@/lib/parseNacionalExcel';
import { filterByCliente, CLIENTES_ESTRATEGICOS } from '@/intelligence-engine/capturaCaliral';

let cache: MovRecord[] | null = null;
let loadingPromise: Promise<MovRecord[]> | null = null;

// Cache de registros pre-filtrados por cliente (NIREA, etc.)
// Evita reescanear 200K registros en cada cambio de pestaña.
const clienteCache = new Map<string, MovRecord[]>();

/**
 * Post-procesa los registros para asegurarse de que `tpd` (tipo de producto)
 * tenga un valor correcto. Si está vacío, lo deriva del campo `d` (denominación).
 * Esto permite que los datos antiguos en Firebase (subidos con un parser
 * que no extraía tpd) funcionen con el filtro Congelado/Fresco sin necesidad
 * de re-subir el Excel.
 */
function postProcessRecords(records: MovRecord[]): MovRecord[] {
  for (const r of records) {
    if (!r.tpd) {
      const denom = (r.d || '').toUpperCase();
      if (denom.includes('CONGEL')) {
        r.tpd = 'Congelado';
      } else if (denom.includes('FRESC') || denom.includes('REFRIG')) {
        r.tpd = 'Fresco';
      }
    }
  }
  return records;
}

/** Carga el dataset nacional con cache en memoria. */
export async function loadNacionalRecords(): Promise<MovRecord[]> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      // Intentar Firebase (datos subidos por el usuario)
      const fbData = await loadNacionalFromFirebase();
      if (fbData && fbData.length > 0) {
        // Post-procesar para derivar tpd de denominación si está vacío
        const processed = postProcessRecords(fbData);
        cache = processed;
        // Pre-cachear registros filtrados por cliente estratégico
        // para que las pestañas posteriores sean instantáneas
        for (const cliente of CLIENTES_ESTRATEGICOS) {
          const filtered = filterByCliente(processed, cliente.aliases);
          if (filtered.length > 0) {
            clienteCache.set(cliente.id, filtered);
          }
        }
        return processed;
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

/**
 * Devuelve los registros pre-filtrados para un cliente estratégico.
 * Instantáneo: ya están cacheados al cargar el dataset.
 * Si no hay cache (ej: cliente no estándar), devuelve null.
 */
export function getCachedClienteRecords(clienteId: string): MovRecord[] | null {
  return clienteCache.get(clienteId) ?? null;
}

/** Limpia el cache (para forzar recarga después de subir nuevo Excel). */
export function clearNacionalCache(): void {
  cache = null;
  loadingPromise = null;
  clienteCache.clear();
}
