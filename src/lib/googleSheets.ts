// ============================================================
// Cloud Sync - Firebase Realtime Database (REST API)
// ============================================================
// Uses Firebase Realtime Database REST API for cloud sync.
// Works from any origin (GitHub Pages, Vercel, localhost, etc.)
// No SDK needed — just fetch to the database URL.
// ============================================================

const SETTINGS_KEY = 'trazabilidad_firebase_url';
const LAST_SYNC_KEY = 'trazabilidad_last_sync';
const OLD_SETTINGS_KEY = 'trazabilidad_sheets_url'; // Legacy Google Sheets key
const SYNC_DEBOUNCE_MS = 3000; // Wait 3s after last change before pushing

// Firebase URL — prefer deployment configuration, then optional browser override for static hosts.
const DEFAULT_FIREBASE_URL = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';
const FIREBASE_URL = (
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  (typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>).TRZ_FB_URL as string | undefined : undefined) ||
  DEFAULT_FIREBASE_URL
).replace(/\/+$/, '');

// Auto-migrate: clear old Google Sheets URL to prevent CORS errors
if (typeof window !== 'undefined') {
  try {
    const oldUrl = localStorage.getItem(OLD_SETTINGS_KEY);
    if (oldUrl) {
      localStorage.removeItem(OLD_SETTINGS_KEY);
      // Don't copy it — old URL is a Google Apps Script that causes CORS
    }
    // Also clear old sync key name
    localStorage.removeItem('trazabilidad_sheets_last_sync');
  } catch (err) { console.warn('Auto-migrate cleanup error:', err); }
}

// All localStorage keys that need to be synced (password excluded for security)
export const SYNC_KEYS = [
  'trazabilidad_new_records',
  'trazabilidad_exp_edits',
  'trazabilidad_exp_deleted',
  'trazabilidad_exp_ingresos',
  'trazabilidad_dep_edits',
  'trazabilidad_dep_new_records',
  'trazabilidad_dep_deleted',
  'cruce_caliral_edits',
  'trazabilidad_stock_data',
  'trazabilidad_dep_imported',
  'trazabilidad_exp_imported',
  'trazabilidad_stock_assignments',
];

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

// --- Settings ---

export function getSheetUrl(): string {
  // Always use the hardcoded URL — no configuration needed
  return FIREBASE_URL;
}

export function setSheetUrl(url: string) {
  // URL is hardcoded, but keep the setting for display purposes
  if (typeof window === 'undefined') return;
  const cleaned = url.trim().replace(/\/+$/, '');
  localStorage.setItem(SETTINGS_KEY, cleaned);
}

export function isConfigured(): boolean {
  return Boolean(getSheetUrl());
}

export function getLastSync(): string {
  return localStorage.getItem(LAST_SYNC_KEY) || '';
}

// --- Firebase REST API calls ---

interface SyncData {
  [key: string]: unknown;
}

async function firebaseGet(url: string): Promise<SyncData | null> {
  try {
    const resp = await fetch(`${url}/.json`, {
      method: 'GET',
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Firebase GET ${resp.status}: ${text.slice(0, 100)}`);
    }
    const data = await resp.json();
    // Firebase returns null for empty database
    if (data === null || typeof data !== 'object') return {};
    return data as SyncData;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      console.warn('Firebase: no se pudo conectar (red/CORS)');
      return null;
    }
    throw err;
  }
}

async function firebasePut(url: string, data: SyncData): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Firebase PUT ${resp.status}: ${text.slice(0, 100)}`);
    }
    return true;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      console.warn('Firebase: no se pudo conectar (red/CORS)');
      return false;
    }
    throw err;
  }
}

async function firebasePatch(url: string, data: SyncData): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Firebase PATCH ${resp.status}: ${text.slice(0, 100)}`);
    }
    return true;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      console.warn('Firebase: no se pudo conectar (red/CORS)');
      return false;
    }
    throw err;
  }
}

// --- Collect all local data ---

function collectLocalData(): SyncData {
  const data: SyncData = {};
  for (const key of SYNC_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null && val !== undefined) {
        data[key] = JSON.parse(val);
      }
    } catch (err) {
      console.warn('Sync key parse error:', key, err);
    }
  }
  return data;
}

// --- Public API ---

/**
 * Test connection to Firebase
 */
export async function ping(): Promise<{ ok: boolean; time?: string; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { ok: false, error: 'No configurada la URL de Firebase' };
  try {
    const start = Date.now();
    const data = await firebaseGet(url);
    const ms = Date.now() - start;
    if (data !== null) {
      return { ok: true, time: new Date().toISOString() };
    }
    return { ok: false, error: 'No se pudo leer la base de datos. Verificá las reglas de seguridad.' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Pull all data from Firebase and merge into localStorage.
 * Remote data is written to localStorage for each key.
 */
export async function pullFromSheets(): Promise<{ count: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { count: 0, error: 'No configurada' };
  if (isSyncing) return { count: 0, error: 'Sync en progreso' };
  isSyncing = true;

  try {
    const remote = await firebaseGet(url);
    if (!remote) return { count: 0, error: 'No se pudo conectar a Firebase' };

    let count = 0;
    for (const key of SYNC_KEYS) {
      if (remote[key] !== undefined && remote[key] !== null) {
        const val = typeof remote[key] === 'string' ? remote[key] : JSON.stringify(remote[key]);
        localStorage.setItem(key, val);
        count++;
      }
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    dispatchSyncEvent('pull', { count });
    return { count };
  } catch (err) {
    return { count: 0, error: (err as Error).message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Push all local data to Firebase using PATCH for granular sync.
 * PATCH only updates keys present in localData, preserving remote keys that don't exist locally.
 */
export async function pushToSheets(): Promise<{ count: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { count: 0, error: 'No configurada' };
  if (isSyncing) return { count: 0, error: 'Sync en progreso' };
  isSyncing = true;

  try {
    // Collect local data
    const localData = collectLocalData();

    const keys = Object.keys(localData);
    if (keys.length === 0) return { count: 0 };

    // Use PATCH instead of PUT: only updates keys present in localData,
    // preserving remote keys that don't exist locally (reduces data loss from concurrent writes)
    const ok = await firebasePatch(url, localData);
    if (ok) {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      dispatchSyncEvent('push', { count: keys.length });
      return { count: keys.length };
    }
    return { count: 0, error: 'No se pudo escribir en Firebase' };
  } catch (err) {
    return { count: 0, error: (err as Error).message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Full bidirectional sync: pull → merge (local wins) → push
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
    const remote = await firebaseGet(url);
    const remoteData: SyncData = remote || {};

    // 3. Merge: local wins for keys that exist locally
    const merged: SyncData = { ...remoteData, ...localData };

    // 4. Write merged to localStorage
    for (const key of SYNC_KEYS) {
      if (merged[key] !== undefined && merged[key] !== null) {
        const val = typeof merged[key] === 'string' ? merged[key] : JSON.stringify(merged[key]);
        localStorage.setItem(key, val);
      }
    }

    // 5. Push merged to Firebase
    const keys = Object.keys(merged);
    const ok = await firebasePut(url, merged);

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    dispatchSyncEvent('full', { pulled: Object.keys(remoteData).length, pushed: keys.length });

    return {
      pulled: Object.keys(remoteData).length,
      pushed: ok ? keys.length : 0,
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
    dispatchSyncEvent('auto-push', result);
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Initial pull from Firebase on app load.
 * Dispatches a 'trazabilidad-data-ready' event when done so components can reload.
 */
export async function initialPull(): Promise<{ count: number; error?: string }> {
  const url = getSheetUrl();
  if (!url) return { count: 0 };

  // BLOQUEO post-reset: si se hizo un reset reciente, no descargar de Firebase
  // porque significaría repoblar los datos que el usuario acaba de borrar.
  if (typeof window !== 'undefined') {
    const resetBlock = localStorage.getItem('trazabilidad_block_firebase_pull_until');
    if (resetBlock) {
      const until = parseInt(resetBlock, 10);
      if (Date.now() < until) {
        console.info('[initialPull] Bloqueado por reset reciente. Faltan', Math.ceil((until - Date.now()) / 1000), 's');
        return { count: 0 };
      } else {
        localStorage.removeItem('trazabilidad_block_firebase_pull_until');
      }
    }
  }

  const result = await pullFromSheets();
  dispatchSyncEvent('initial-pull', result);

  // Notify all components that data is ready (for cache invalidation)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trazabilidad-data-ready', { detail: result }));
  }

  return result;
}

// --- Event dispatching ---

function dispatchSyncEvent(type: string, detail: Record<string, unknown>) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sheets-sync', { detail: { type, ...detail } }));
  }
}

// --- Password management (local only — NOT synced via Firebase for security) ---

const PASSWORD_KEY = 'trazabilidad_system_password';
const PBKDF2_SALT_KEY = 'trazabilidad_pbkdf2_salt';
const PBKDF2_ITERATIONS = 100_000;
const HASH_PREFIX = 'pbkdf2$'; // Distinguish new hashes from old simpleHash format

/**
 * Legacy DJB2 hash — kept for backward compatibility during migration.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  const salted = 'trazabilidad_salt_' + str;
  for (let i = 0; i < salted.length; i++) {
    hash = ((hash << 5) + hash + salted.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(36);
}

/**
 * Get or create a stable PBKDF2 salt stored in localStorage.
 * The salt is derived from the app name + a random component.
 */
function getOrCreateSalt(): string {
  if (typeof window === 'undefined') return 'trazabilidad_fallback_salt';
  let salt = localStorage.getItem(PBKDF2_SALT_KEY);
  if (!salt) {
    const randomPart = crypto.getRandomValues(new Uint8Array(16));
    salt = 'trazabilidad_' + Array.from(randomPart, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(PBKDF2_SALT_KEY, salt);
  }
  return salt;
}

/**
 * Secure hash using PBKDF2 (Web Crypto API) with 100,000 iterations.
 * Returns a hex string prefixed with 'pbkdf2$' to distinguish from old simpleHash format.
 */
async function secureHash(str: string): Promise<string> {
  const salt = getOrCreateSalt();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(str),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return HASH_PREFIX + hexHash;
}

export function hasPassword(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(PASSWORD_KEY);
}

export async function setPassword(pw: string): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PASSWORD_KEY, await secureHash(pw));
}

export async function verifyPassword(pw: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(PASSWORD_KEY);
  if (!stored) return false;

  // Check if stored hash uses new PBKDF2 format
  if (stored.startsWith(HASH_PREFIX)) {
    const newHash = await secureHash(pw);
    return stored === newHash;
  }

  // Backward compatibility: try old simpleHash for migration
  const legacyMatch = stored === simpleHash(pw);
  if (legacyMatch) {
    // Migrate to new secure hash
    localStorage.setItem(PASSWORD_KEY, await secureHash(pw));
  }
  return legacyMatch;
}
