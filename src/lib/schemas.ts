// ============================================================
// schemas.ts — Validaciones Zod para datos de entrada ETL
// ------------------------------------------------------------
// Schemas para validar registros parseados de Excel/PDF/Firebase
// antes de ingestarlos al TraceGraph. Detecta datos corruptos
// tempranamente y da mensajes de error accionables.
// ============================================================

import { z } from 'zod';

// --- Schema: Ingreso (depósitos) ---

export const IngresoSchema = z.object({
  nroCote: z.string().min(1, 'COTE vacío'),
  nroTramite: z.number().int().nonnegative().optional(),
  fechaTramite: z.string().optional(),
  nombreEstablecimientoDestino: z.string().optional(),
  nombreEstablecimientoProd: z.string().optional(),
  paisDestino: z.string().optional(),
  denominacionMercaderia: z.string().optional(),
  corte: z.string().optional(),
  tipo: z.string().optional(),
  cantidadEnvases: z.number().int().nonnegative().optional(),
  pesoBruto: z.number().nonnegative().optional(),
  pesoNeto: z.number().nonnegative().optional(),
  fechaEmitidoCote: z.string().optional(),
});
export type IngresoInput = z.infer<typeof IngresoSchema>;

// --- Schema: Exportación ---

export const ExportacionSchema = z.object({
  nroCote: z.string().min(1, 'COTE vacío'),
  nroTramite: z.number().int().nonnegative().optional(),
  fecha: z.string().nullable().optional(),
  paisDestino: z.string().optional(),
  destino: z.string().optional(),
  pesoNeto: z.number().nonnegative().optional(),
  cantidadEnvases: z.number().int().nonnegative().optional(),
  observaciones: z.string().optional(),
});
export type ExportacionInput = z.infer<typeof ExportacionSchema>;

// --- Schema: StockPallet ---

export const StockPalletSchema = z.object({
  codigo: z.string(),
  cajas: z.number().nonnegative(),
  kilos: z.number().nonnegative(),
  producto: z.string().optional(),
  codigoTipo: z.enum(['COTE', 'PASE_SANITARIO', 'NINGUNO']).optional(),
});
export type StockPalletInput = z.infer<typeof StockPalletSchema>;

// --- Helpers ---

/**
 * Valida un array de registros y retorna { valid, errors }.
 * No lanza; los registros inválidos se descartan con un log.
 */
export function validateArray<T>(
  schema: z.ZodType<T>,
  records: unknown[],
  label = 'records',
): { valid: T[]; errors: Array<{ index: number; error: string }> } {
  const valid: T[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  records.forEach((rec, index) => {
    const result = schema.safeParse(rec);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        index,
        error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
  });
  if (errors.length > 0) {
    // Log sin acoplar al logger para evitar dependencia circular
    // eslint-disable-next-line no-console
    console.warn(`[schemas] ${label}: ${errors.length}/${records.length} registros inválidos descartados`);
  }
  return { valid, errors };
}
