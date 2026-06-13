// ============================================================
// Google Sheets Sync - Client-side module
// ============================================================
// Uses a Google Apps Script web app as backend.
// All data is stored as key-value pairs in a Google Sheet.
// ============================================================

const SETTINGS_KEY = 'trazabilidad_sheets_url';
const LAST_SYNC_KEY = 'trazabilidad_sheets_last_sync';
const SYNC_DEBOUNCE_MS = 2000; // Wait 2s after last change before pushing

// All localStorage keys that need to be synced
export const SYNC_KEYS = [
  'trazabilidad_new_records',
  'trazabilidad_exp_edits',
  'trazabilidad_exp_deleted',
  'trazabilidad_exp_ingresos',
  'trazabilidad_dep_edits',
  'trazabilidad_dep_new_records',
  'trazabilidad_dep_deleted',
  'cruce_caliral_edits',
];

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

// --- Settings ---

export function getSheetUrl(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SETTINGS_KEY) || '';
}

export function setSheetUrl(url: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, url.trim());
}

export function isConfigured(): boolean {
  const url = getSheetUrl();
  return url.length > 10;
}

export function getLastSync(): string {
  return localStorage.getItem(LAST_SYNC_KEY) || '';
}

// --- API calls ---

async function fetchGet(url: string, params: Record<string, string>): Promise<unknown> {
  const sep = url.includes('?') ? '&' : '?';
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const resp = await fetch(`${url}${sep}${qs}`, {
    method: 'GET',
    redirect: 'follow',
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Sheets GET error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

async function fetchPost(url: string, body: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Sheets POST error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

// --- Collect all local data ---

function collectLocalData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of SYNC_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val) {
        data[key] = JSON.parse(val);
      }
    } catch {
      // skip
    }
  }
  return data;
}

// --- Public API ---

/**
 * Test connection to the Google Sheets script
 */
export async function ping(): Promise<{ ok: boolean; time?: string; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { ok: false, error: 'No configurada la URL del script' };
  try {
    const result = await fetchGet(url, { action: 'ping' }) as Record<string, unknown>;
    if (result.status === 'ok') {
      return { ok: true, time: result.time as string };
    }
    return { ok: false, error: 'Respuesta inesperada' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Pull all data from Google Sheets and merge into localStorage.
 * Remote data is written to localStorage for each key.
 * Returns the number of keys synced.
 */
export async function pullFromSheets(): Promise<{ count: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { count: 0, error: 'No configurada' };
  if (isSyncing) return { count: 0, error: 'Sync en progreso' };
  isSyncing = true;

  try {
    const result = await fetchGet(url, { action: 'getmulti', keys: SYNC_KEYS.join(',') }) as { data?: Record<string, unknown> };

    if (!result.data) return { count: 0 };

    let count = 0;
    for (const key of SYNC_KEYS) {
      if (result.data[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(result.data[key]));
        count++;
      }
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return { count };
  } catch (err) {
    return { count: 0, error: (err as Error).message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Push all local data to Google Sheets (local wins on merge).
 * Returns the number of keys pushed.
 */
export async function pushToSheets(): Promise<{ count: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { count: 0, error: 'No configurada' };
  if (isSyncing) return { count: 0, error: 'Sync en progreso' };
  isSyncing = true;

  try {
    const data = collectLocalData();
    const keys = Object.keys(data);
    if (keys.length === 0) return { count: 0 };

    const result = await fetchPost(url, { action: 'push', data }) as { merged_keys?: number };
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return { count: result.merged_keys || keys.length };
  } catch (err) {
    return { count: 0, error: (err as Error).message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Full bidirectional sync:
 * 1. Pull remote data
 * 2. Merge with local (local wins)
 * 3. Push merged data back
 * 4. Update localStorage with final merged state
 */
export async function fullSync(): Promise<{ pulled: number; pushed: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { pulled: 0, pushed: 0, error: 'No configurada' };
  if (isSyncing) return { pulled: 0, pushed: 0, error: 'Sync en progreso' };
  isSyncing = true;

  try {
    // 1. Collect local
    const localData = collectLocalData();

    // 2. Pull remote
    const remoteResult = await fetchGet(url, { action: 'getmulti', keys: SYNC_KEYS.join(',') }) as { data?: Record<string, unknown> };
    const remoteData = remoteResult.data || {};

    // 3. Merge: local wins for keys that exist locally
    //    For keys that only exist remotely, pull them in
    const merged: Record<string, unknown> = { ...remoteData, ...localData };

    // 4. Write merged to localStorage
    for (const key of SYNC_KEYS) {
      if (merged[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(merged[key]));
      }
    }

    // 5. Push merged to remote
    const keys = Object.keys(merged);
    await fetchPost(url, { action: 'push', data: merged });

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return {
      pulled: Object.keys(remoteData).length,
      pushed: keys.length,
    };
  } catch (err) {
    return { pulled: 0, pushed: 0, error: (err as Error).message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Schedule a debounced push. Useful for auto-save after edits.
 * Waits SYNC_DEBOUNCE_MS after the last call before actually pushing.
 */
export function schedulePush() {
  if (!isConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const result = await pushToSheets();
    // Fire a custom event so UI can react
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sheets-sync', {
        detail: { type: 'auto-push', ...result },
      }));
    }
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Pull data on app load. Call this once when the app mounts.
 */
export async function initialPull(): Promise<{ count: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { count: 0, error: 'No configurada' };

  const result = await pullFromSheets();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sheets-sync', {
      detail: { type: 'initial-pull', ...result },
    }));
  }

  return result;
}