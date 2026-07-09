// ============================================================
// ETL SCHEMA — Definición de columnas esperadas por archivo
// ============================================================

import type { ColumnSpec } from './interfaces';

// MGAP Nacional — Exportar_DatosEmbarqueCarne (60 columnas)
export const NACIONAL_SCHEMA: ColumnSpec[] = [
  { name: 'Nro. Trámite', index: 0, type: 'number', required: true, description: 'Número de trámite' },
  { name: 'Fecha del Trámite', index: 1, type: 'date', required: true, description: 'Fecha del trámite' },
  { name: 'Nro. de C.O.T.E.', index: 2, type: 'string', required: true, description: 'Número de COTE' },
  { name: 'Nombre del Establecimiento Certificador', index: 4, type: 'string', required: true, description: 'Certificadora' },
  { name: 'Nombre Establecimiento Productor', index: 5, type: 'string', required: true, description: 'Productor' },
  { name: 'Nro. Establecimiento Productor', index: 6, type: 'number', required: false, description: 'N° productor' },
  { name: 'Fecha emitido COTE', index: 7, type: 'date', required: false, description: 'Fecha emisión COTE' },
  { name: 'Tipo de Transporte', index: 9, type: 'string', required: false, description: 'Transporte' },
  { name: 'Contenedor - Serie y Nro.', index: 10, type: 'string', required: false, description: 'Contenedor' },
  { name: 'Nombre Establecimiento Destino', index: 19, type: 'string', required: false, description: 'Destino' },
  { name: 'Tipo de Movimiento', index: 20, type: 'string', required: true, description: 'Tipo movimiento' },
  { name: 'País de Destino', index: 23, type: 'string', required: false, description: 'País destino' },
  { name: 'Denominación de Mercadería', index: 42, type: 'string', required: false, description: 'Producto' },
  { name: 'Corte', index: 43, type: 'string', required: false, description: 'Corte' },
  { name: 'Pallets', index: 44, type: 'number', required: false, description: 'Pallets' },
  { name: 'Cantidad de Envases', index: 45, type: 'number', required: false, description: 'Envases' },
  { name: 'Peso Bruto', index: 46, type: 'number', required: false, description: 'Peso bruto kg' },
  { name: 'Peso Neto', index: 47, type: 'number', required: true, description: 'Peso neto kg' },
  { name: 'Shipping', index: 49, type: 'string', required: false, description: 'Shipping' },
  { name: 'Proceso', index: 59, type: 'string', required: false, description: 'Proceso' },
];

// Ingresos a FRIMARAL — mismo formato que Registro Excel (60 columnas)
export const INGRESOS_SCHEMA: ColumnSpec[] = NACIONAL_SCHEMA;

// Exportaciones desde FRIMARAL — mismo formato
export const EXPORTACIONES_SCHEMA: ColumnSpec[] = NACIONAL_SCHEMA;

// Movimiento de Pallets — stock operativo
export const PALLETS_SCHEMA: ColumnSpec[] = [
  { name: 'Fec Com', index: 0, type: 'date', required: false, description: 'Fecha comisión' },
  { name: 'Fec Ent', index: 1, type: 'date', required: false, description: 'Fecha entrega' },
  { name: 'Contenedor', index: 2, type: 'string', required: false, description: 'Contenedor' },
  { name: 'Pallets', index: 3, type: 'number', required: true, description: 'Cantidad pallets' },
  { name: 'Cajas', index: 4, type: 'number', required: true, description: 'Cantidad cajas' },
  { name: 'Kilos', index: 5, type: 'number', required: true, description: 'Kilos' },
  { name: 'Contenido', index: 6, type: 'string', required: true, description: 'Contenido del pallet' },
  { name: 'Nro Lote', index: 8, type: 'string', required: false, description: 'N° lote' },
  { name: 'DUA', index: 9, type: 'string', required: false, description: 'DUA' },
  { name: 'F. Venc.', index: 10, type: 'date', required: false, description: 'Fecha vencimiento' },
  { name: 'L/E', index: 11, type: 'string', required: false, description: 'L/E' },
];

// Validación de extensiones
export const EXTENSIONES_PERMITIDAS: Record<string, string[]> = {
  nacional: ['.xlsb', '.xlsx', '.xls'],
  ingresos: ['.xlsx', '.xls'],
  exportaciones: ['.xlsx', '.xls'],
  pallets: ['.xls', '.xlsx'],
};

// Tamaños máximos (bytes)
export const TAMANIO_MAXIMO: Record<string, number> = {
  nacional: 100 * 1024 * 1024, // 100 MB
  ingresos: 50 * 1024 * 1024,
  exportaciones: 50 * 1024 * 1024,
  pallets: 10 * 1024 * 1024,
};

// Cantidades mínimas de registros
export const REGISTROS_MINIMOS: Record<string, number> = {
  nacional: 100,
  ingresos: 10,
  exportaciones: 10,
  pallets: 1,
};
