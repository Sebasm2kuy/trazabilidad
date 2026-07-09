// ============================================================
// UTILS — Funciones genéricas (no específicas del negocio)
// ============================================================

export { cn, fmt, fd, fdt } from '@/lib/utils';

// --- Date utils ---

export function daysBetween(from: string | Date, to: string | Date): number {
  const d1 = typeof from === 'string' ? new Date(from) : from;
  const d2 = typeof to === 'string' ? new Date(to) : to;
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysSince(date: string | null | undefined): number {
  if (!date) return Infinity;
  return daysBetween(date, new Date());
}

export function monthLabel(yyyymm: string): string {
  if (!yyyymm || yyyymm.length !== 7) return yyyymm;
  const [y, m] = yyyymm.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return yyyymm;
  return `${months[idx]} ${y.substring(2)}`;
}

// --- Number utils ---

export function safeNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// --- String utils ---

export function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 1) + '…' : s;
}

// --- Array utils ---

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function groupBy<T, K extends string | number>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

export function sum<T>(arr: T[], valueFn: (item: T) => number): number {
  return arr.reduce((s, item) => s + valueFn(item), 0);
}

// --- Math utils ---

export function percentage(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export function growthRate(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}
