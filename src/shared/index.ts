// ============================================================
// SHARED — Tipos, constantes, enums, formatters, helpers
// ============================================================

// --- Constantes del negocio ---

export const CALIRAL_ID = 'CALIRAL S.A.';
export const CALIRAL_DISPLAY_NAME = 'Caliral S.A.';
export const NIREA_NAME = 'NIREA SAN JACINTO';
export const FRIMARAL_NAME = 'FRIMARAL';

export const CLIENTES_ESTRATEGICOS = [
  { id: 'NIREA', name: 'NIREA SAN JACINTO', aliases: ['NIREA SAN JACINTO', 'NIREA'] },
] as const;

// --- Constantes técnicas ---

export const DAY_MS = 1000 * 60 * 60 * 24;
export const CHUNK_SIZE = 5000;
export const FIREBASE_URL = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';

// --- Enums ---

export enum TipoArchivo {
  NACIONAL = 'nacional',
  INGRESOS = 'ingresos',
  EXPORTACIONES = 'exportaciones',
  PALLETS = 'pallets',
}

export enum TipoMovimiento {
  INGRESO = 'INGRESO',
  EXPORTACION = 'EXPORTACION',
  DEPOSITO = 'DEPOSITO',
}

export enum TipoProducto {
  CONGELADO = 'Congelado',
  FRESCO = 'Fresco',
  TODOS = 'todos',
}

// --- Formatters ---

export const formatters = {
  kg: (n: number): string => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M kg';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K kg';
    return n.toLocaleString('es-UY') + ' kg';
  },
  tons: (n: number): string => `${(n / 1000).toFixed(1)} t`,
  number: (n: number): string => n.toLocaleString('es-UY', { maximumFractionDigits: 0 }),
  percent: (n: number): string => {
    if (n === 0) return '0%';
    if (n < 0.01) return `${n.toFixed(4)}%`;
    if (n < 0.1) return `${n.toFixed(3)}%`;
    if (n < 1) return `${n.toFixed(2)}%`;
    return `${n.toFixed(1)}%`;
  },
  date: (d: string | null | undefined): string => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return String(d); }
  },
  datetime: (d: string | null | undefined): string => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('es-UY', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return String(d); }
  },
};

// --- Helpers de negocio ---

export const isCaliral = (name: string): boolean => {
  return name.toUpperCase().includes('CALIRAL');
};

export const isNirea = (name: string): boolean => {
  return name.toUpperCase().includes('NIREA');
};

export const isProductor = (cf: string, p: string): boolean => {
  return cf !== p && Boolean(cf) && Boolean(p);
};
