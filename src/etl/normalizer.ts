// ============================================================
// ETL NORMALIZER — Normalización de datos
// ============================================================

import type { Normalizer as INormalizer } from './interfaces';
import type { Cote } from '@/domain';

const NULL_DATE_STR = '30/12/1899';

function isNullDate(d: unknown): boolean {
  if (d === null || d === undefined) return true;
  if (typeof d === 'number') return d === 0;
  if (typeof d === 'string') {
    const s = d.trim();
    return s === '' || s === NULL_DATE_STR || s === '0' || s === '1899-12-30' || s === '1899/12/30';
  }
  return false;
}

export const Normalizer: INormalizer = {
  normalizeDate(value: unknown): string | null {
    if (isNullDate(value)) return null;
    if (value instanceof Date) {
      if (isNaN(value.getTime()) || value.getFullYear() < 1900) return null;
      return value.toISOString().split('T')[0];
    }
    if (typeof value === 'number') {
      try {
        const epoch = new Date(1899, 11, 30);
        const ms = epoch.getTime() + value * 86400000;
        const d = new Date(ms);
        if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null;
        return d.toISOString().split('T')[0];
      } catch { return null; }
    }
    const s = String(value).trim();
    if (!s) return null;

    // DD/MM/YYYY o MM/DD/YYYY con separadores / - .
    const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      let y = m[3];
      if (y.length === 2) y = '20' + y;
      // Heurística: si a > 12 → DD/MM, si b > 12 → MM/DD
      if (a > 12 && b <= 12) { [a, b] = [b, a]; }
      const d = new Date(parseInt(y), b - 1, a);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) {
        if (d.getMonth() === b - 1 && d.getDate() === a) {
          return d.toISOString().split('T')[0];
        }
      }
    }
    // ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d.toISOString().split('T')[0];
    } catch { /* noop */ }
    return null;
  },

  normalizeNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    const s = String(value).replace(/[^\d.-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  },

  normalizeString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  },

  normalizeTipoProducto(denominacion: string): 'Congelado' | 'Fresco' | '' {
    const d = denominacion.toUpperCase();
    if (d.includes('CONGEL')) return 'Congelado';
    if (d.includes('FRESC') || d.includes('REFRIG')) return 'Fresco';
    return '';
  },

  normalizeEstadoCote(opts: { tieneStock: boolean; tieneExportacion: boolean; diasSinMovimiento: number; retenido: boolean }): Cote['estado'] {
    if (opts.retenido) return 'retenido';
    if (opts.tieneExportacion && opts.tieneStock) return 'parcial';
    if (opts.tieneExportacion) return 'exportado';
    if (opts.tieneStock && opts.diasSinMovimiento > 60) return 'en_stock';
    if (opts.tieneStock) return 'en_stock';
    if (!opts.tieneStock && !opts.tieneExportacion) return 'sin_destino';
    return 'desconocido';
  },
};
