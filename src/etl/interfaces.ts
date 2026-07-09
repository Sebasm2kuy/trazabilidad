// ============================================================
// ETL INTERFACES — Extract, Transform, Load
// ------------------------------------------------------------
// Toda la importación de archivos vive aquí. Nunca en React.
// Los Excel son materia prima que se transforma en entidades
// del dominio antes de ser utilizados.
// ============================================================

import type {
  Cote, Ingreso, Exportacion, StockPallet,
} from '@/domain';

// --- Lectores de archivos ---

export interface FileReader {
  /** Lee un archivo y devuelve un array de arrays (filas × columnas). */
  read(file: File): Promise<unknown[][]>;
}

// --- Parsers (convierten filas crudas en objetos intermedios) ---

export interface ExcelParser {
  /** Parsea el archivo del MGAP nacional (Exportar_DatosEmbarqueCarne). */
  parseNacional(file: File, onProgress?: (current: number, total: number) => void): Promise<NacionalRecord[]>;
  /** Parsea ingresos a FRIMARAL. */
  parseIngresos(file: File): Promise<IngresoRecord[]>;
  /** Parsea exportaciones desde FRIMARAL. */
  parseExportaciones(file: File): Promise<ExportacionRecord[]>;
  /** Parsea movimiento de pallets (stock). */
  parsePallets(file: File): Promise<PalletRecord[]>;
}

// --- Registros intermedios (antes de normalizar) ---

export interface NacionalRecord {
  tramite: number;
  fecha: string;
  cote: string;
  certificadora: string;
  productor: string;
  nroProductor: string;
  destino: string;
  tipoMovimiento: string;
  pais: string;
  denominacion: string;
  corte: string;
  pallets: number;
  envases: number;
  pesoBruto: number;
  pesoNeto: number;
  tipoTransporte: string;
  shipping: string;
  proceso: string;
}

export interface IngresoRecord {
  nroTramite: number;
  fechaTramite: string;
  nroCote: string;
  productor: string;
  deposito: string;
  pesoNeto: number;
  cantidadEnvases: number;
  corte: string;
  denominacion: string;
}

export interface ExportacionRecord {
  nroTramite: number;
  fechaTramite: string;
  nroCote: string;
  certificadora: string;
  productor: string;
  paisDestino: string;
  destino: string;
  pesoNeto: number;
  cantidadEnvases: number;
  corte: string;
  denominacion: string;
  contenedor: string | null;
}

export interface PalletRecord {
  fechaComision: string;
  fechaEntrega: string;
  contenedor: string;
  pallets: number;
  cajas: number;
  kilos: number;
  contenido: string;
  nroLote: string;
  dua: string;
  fechaVencimiento: string;
  le: string;
  codigo: string;
  codigoTipo: 'COTE' | 'PASE_SANITARIO' | 'NINGUNO';
}

// --- Validadores ---

export interface SchemaValidator {
  /** Valida que un archivo tenga la estructura esperada. */
  validateNacional(records: NacionalRecord[]): ValidationResult;
  validateIngresos(records: IngresoRecord[]): ValidationResult;
  validateExportaciones(records: ExportacionRecord[]): ValidationResult;
  validatePallets(records: PalletRecord[]): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

// --- Normalizadores ---

export interface Normalizer {
  /** Normaliza fechas (resuelve MM/DD vs DD/MM, años de 2 dígitos, etc.). */
  normalizeDate(value: unknown): string | null;
  /** Normaliza números (coma decimal, separadores de miles, etc.). */
  normalizeNumber(value: unknown): number;
  /** Normaliza strings (trim, sin dobles espacios, sin saltos). */
  normalizeString(value: unknown): string;
  /** Normaliza tipo de producto desde denominación. */
  normalizeTipoProducto(denominacion: string): 'Congelado' | 'Fresco' | '';
  /** Normaliza estado de COTE. */
  normalizeEstadoCote(opts: { tieneStock: boolean; tieneExportacion: boolean; diasSinMovimiento: number; retenido: boolean }): Cote['estado'];
}

// --- Conversores (registros intermedios → entidades del dominio) ---

export interface Converter {
  /** Convierte registros del MGAP a entidades del dominio. */
  convertNacional(records: NacionalRecord[]): { cotes: Cote[]; ingresos: Ingreso[]; exportaciones: Exportacion[] };
  /** Convierte registros de ingresos a entidades del dominio. */
  convertIngresos(records: IngresoRecord[]): Ingreso[];
  /** Convierte registros de exportaciones a entidades del dominio. */
  convertExportaciones(records: ExportacionRecord[]): Exportacion[];
  /** Convierte registros de pallets a entidades del dominio. */
  convertPallets(records: PalletRecord[]): StockPallet[];
}

// --- Sesión de importación ---

export interface LoadSession {
  id: string;
  fecha: string;
  archivos: LoadedFile[];
  totalRegistros: number;
  errores: number;
  advertencias: number;
}

export interface LoadedFile {
  nombre: string;
  tipo: 'nacional' | 'ingresos' | 'exportaciones' | 'pallets';
  registros: number;
  tamaño: number;
}

// --- Import Manager (orquesta todo el ETL) ---

export interface ImportManager {
  /** Importa los 4 archivos oficiales. */
  importAll(files: {
    nacional?: File;
    ingresos?: File;
    exportaciones?: File;
    pallets?: File;
  }, onProgress?: (progress: ImportProgress) => void): Promise<LoadSession>;

  /** Importa un solo archivo. */
  importFile(file: File, tipo: LoadedFile['tipo'], onProgress?: (progress: ImportProgress) => void): Promise<LoadSession>;

  /** Obtiene el historial de importaciones. */
  getHistory(): LoadSession[];

  /** Obtiene la última sesión. */
  getLastSession(): LoadSession | null;
}

export interface ImportProgress {
  phase: 'reading' | 'parsing' | 'validating' | 'normalizing' | 'converting' | 'persisting' | 'done';
  current: number;
  total: number;
  message: string;
}

// --- Schema (definición de columnas esperadas) ---

export interface Schema {
  /** Define las columnas esperadas para cada tipo de archivo. */
  getNacionalSchema(): ColumnSpec[];
  getIngresosSchema(): ColumnSpec[];
  getExportacionesSchema(): ColumnSpec[];
  getPalletsSchema(): ColumnSpec[];
}

export interface ColumnSpec {
  name: string;
  index: number;
  type: 'string' | 'number' | 'date';
  required: boolean;
  description: string;
}

// --- Mapping (mapeo de columnas Excel → campos) ---

export interface Mapping {
  /** Mapea columnas del MGAP nacional. */
  mapNacional(row: unknown[]): NacionalRecord;
  /** Mapea columnas de ingresos. */
  mapIngresos(row: unknown[]): IngresoRecord;
  /** Mapea columnas de exportaciones. */
  mapExportaciones(row: unknown[]): ExportacionRecord;
  /** Mapea columnas de pallets. */
  mapPallets(row: unknown[]): PalletRecord;
}
