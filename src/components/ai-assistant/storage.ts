// ============================================================
// storage.ts — Servicio de persistencia para AIAssistant
// ------------------------------------------------------------
// Aísla TODO el acceso a localStorage del componente React.
// Esto permite:
//   - Tipar correctamente los datos leídos/escritos
//   - Centralizar el manejo de errores (try/catch en un solo lado)
//   - Mockear fácilmente en tests
//   - Cambiar el backend (IndexedDB, Firebase) sin tocar el UI
// ============================================================

import type { ChatMessage } from './types';

/** Claves de localStorage usadas por el módulo. */
export const STORAGE_KEYS = {
  chatHistory: 'trazabilidad_chat_history',
  depImported: 'trazabilidad_dep_imported',
  depNewRecords: 'trazabilidad_dep_new_records',
  depEdits: 'trazabilidad_dep_edits',
  depDeleted: 'trazabilidad_dep_deleted',
  stockData: 'trazabilidad_stock_data',
  expImported: 'trazabilidad_exp_imported',
} as const;

/** Shape de los registros de ingreso (de dep_imported, dep_new_records). */
export interface IngresoRecord {
  nroCote: string;
  nroTramite?: number;
  fechaTramite?: string;
  cantidadEnvases?: number;
  pesoBruto?: number;
  pesoNeto?: number;
  producto?: string;
  denominacionMercaderia?: string;
  corte?: string;
  paisDestino?: string;
  nombreEstablecimientoProd?: string;
  lineas?: Array<{ id: string; producto: string; corte: string; cajas: number }>;
  id?: string;
  [key: string]: unknown;
}

/** Shape de los registros de exportación (de exp_imported). */
export interface ExportacionRecord {
  nroCote?: string;
  nroTramite?: number;
  cantidadEnvases?: number;
  observaciones?: string;
  [key: string]: unknown;
}

/** Shape de un pallet en stock_data. */
export interface StockPallet {
  codigo: string;
  cajas: number;
  kilos: number;
  producto?: string;
  codigoTipo?: 'COTE' | 'PASE_SANITARIO' | 'NINGUNO';
  [key: string]: unknown;
}

interface StockData {
  pallets: StockPallet[];
  [key: string]: unknown;
}

// --- Operaciones de chat history ---

export function loadChatHistory(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.chatHistory);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

export function saveChatHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.chatHistory, JSON.stringify(messages));
  } catch {
    /* storage lleno o no disponible: ignorar */
  }
}

export function clearChatHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.chatHistory);
  } catch {
    /* noop */
  }
}

// --- Operaciones de datos de la app ---

export function loadDepImported(): IngresoRecord[] {
  return readArray<IngresoRecord>(STORAGE_KEYS.depImported);
}

export function loadDepNewRecords(): IngresoRecord[] {
  return readArray<IngresoRecord>(STORAGE_KEYS.depNewRecords);
}

export function loadDepEdits(): Record<string, IngresoRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.depEdits);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, IngresoRecord>
      : {};
  } catch {
    return {};
  }
}

export function loadDepDeleted(): unknown[] {
  return readArray(STORAGE_KEYS.depDeleted);
}

export function loadStockPallets(): StockPallet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.stockData);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StockData;
    return Array.isArray(parsed?.pallets) ? parsed.pallets : [];
  } catch {
    return [];
  }
}

export function loadExpImported(): ExportacionRecord[] {
  return readArray<ExportacionRecord>(STORAGE_KEYS.expImported);
}

export function saveDepNewRecords(records: IngresoRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.depNewRecords, JSON.stringify(records));
  } catch {
    /* noop */
  }
}

export function saveDepEdits(edits: Record<string, IngresoRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.depEdits, JSON.stringify(edits));
  } catch {
    /* noop */
  }
}

/** Dispara el evento global que otros componentes escuchan para recargar. */
export function notifyDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('trazabilidad-data-ready'));
}

// --- Helpers internos ---

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function isChatMessage(m: unknown): m is ChatMessage {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Partial<ChatMessage>;
  return msg.role === 'user' || msg.role === 'assistant';
}
