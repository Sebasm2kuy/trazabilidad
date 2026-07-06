import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format number with locale (es-UY) */
export function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '-';
  return (n as number).toLocaleString('es-UY');
}

/** Format date string to readable format */
export function fd(d: string | null | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
}

/** Format datetime string to readable format with time */
export function fdt(d: string | null | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('es-UY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
}
