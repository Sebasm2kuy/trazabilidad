// ============================================================
// types.ts — Tipos compartidos del módulo AIAssistant
// ============================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Item extraído de una captura por Puter AI Vision. */
export interface ExtractedLot {
  nroCote?: string;
  nroTramite?: string;
  fecha?: string;
  producto?: string;
  corte?: string;
  cantidadEnvases?: string;
  pesoBruto?: string;
  pesoNeto?: string;
  paisDestino?: string;
  establecimiento?: string;
  [key: string]: unknown;
}

/** Resultado de extraer datos de una imagen. */
export interface ImageExtractionResult {
  fileName: string;
  items: ExtractedLot[];
  raw: string;
}

/** Registro de ingreso construido a partir de imágenes. */
export interface NewIngresoRecord {
  id: string;
  nroTramite: number;
  fechaTramite: string;
  nroCote: string;
  nombreEstablecimientoDestino: string;
  nombreEstablecimientoProd: string;
  paisDestino: string;
  denominacionMercaderia: string;
  corte: string;
  tipo: string;
  cantidadEnvases: number;
  pesoBruto: number;
  pesoNeto: number;
  fechaEmitidoCote: string;
  lineas: Array<{ id: string; producto: string; corte: string; cajas: number }>;
}
