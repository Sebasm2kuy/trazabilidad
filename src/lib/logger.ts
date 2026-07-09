// ============================================================
// logger.ts — Logger centralizado del proyecto
// ------------------------------------------------------------
// Reemplaza console.log/error/warn/info con un logger estructurado
// que respeta el entorno (dev/prod) y permite filtrar por categoría.
//
// Uso:
//   import { logger } from '@/lib/logger';
//   logger.info('Mensaje', { data: 123 });
//   logger.warn('[categoria] algo pasó', err);
//   logger.error('[categoria] falló', err);
//
// En producción (NODE_ENV=production), logger.debug NO escribe.
// logger.log está eliminado intencionalmente (debug residual).
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';

/** Etiqueta extraída del primer argumento si empieza con [corchetes]. */
function extractTag(args: unknown[]): { tag: string | null; rest: unknown[] } {
  if (args.length > 0 && typeof args[0] === 'string') {
    const match = /^\[([^\]]+)\]/.exec(args[0]);
    if (match) {
      return { tag: match[1], rest: [args[0].slice(match[0].length).trim(), ...args.slice(1)] };
    }
  }
  return { tag: null, rest: args };
}

function formatMessage(level: LogLevel, tag: string | null, args: unknown[]): unknown[] {
  const prefix = tag ? `[${tag}]` : '';
  const timestamp = isProduction ? '' : '';
  return [prefix, ...args].filter(x => x !== '' || prefix !== '');
}

export const logger = {
  /** Solo en desarrollo. Útil para debugging temporal. */
  debug(...args: unknown[]): void {
    if (isProduction) return;
    const { tag, rest } = extractTag(args);
    // eslint-disable-next-line no-console
    console.debug(...formatMessage('debug', tag, rest));
  },

  /** Información operacional (rate limits, syncs, auditoría). */
  info(...args: unknown[]): void {
    const { tag, rest } = extractTag(args);
    // eslint-disable-next-line no-console
    console.info(...formatMessage('info', tag, rest));
  },

  /** Advertencias: fallbacks, datos sospechosos. */
  warn(...args: unknown[]): void {
    const { tag, rest } = extractTag(args);
    // eslint-disable-next-line no-console
    console.warn(...formatMessage('warn', tag, rest));
  },

  /** Errores: catch blocks, fallos de red, excepciones. */
  error(...args: unknown[]): void {
    const { tag, rest } = extractTag(args);
    // eslint-disable-next-line no-console
    console.error(...formatMessage('error', tag, rest));
  },
} as const;

export type Logger = typeof logger;
