export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/c\.\s*o\.\s*t\.\s*e\./g, 'cote')
    .replace(/n[º°]|nro\.?|numero/g, 'numero')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

export function preserveCode(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function parseUruguayanDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    if (value <= 0) return null;
    const result = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return result.getUTCFullYear() < 1900 ? null : result;
  }
  const text = String(value ?? '').trim();
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text);
  if (!match) return null;
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0)));
  return date.getUTCFullYear() === year && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[1]) ? date : null;
}

export function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (comma >= 0) text = text.replace(',', '.');
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

export function makeDedupKey(parts: unknown[]): string {
  return parts.map(value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ')).join('|');
}
