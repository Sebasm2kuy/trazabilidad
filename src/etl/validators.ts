// ============================================================
// ETL VALIDATORS — Validación física, estructura y negocio
// ============================================================

import type {
  SchemaValidator as ISchemaValidator,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  NacionalRecord,
  IngresoRecord,
  ExportacionRecord,
  PalletRecord,
} from './interfaces';
import { EXTENSIONES_PERMITIDAS, TAMANIO_MAXIMO, REGISTROS_MINIMOS } from './schema';

// --- Validación física del archivo ---

export function validateFile(file: File, tipo: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Extensión
  const exts = EXTENSIONES_PERMITIDAS[tipo] || [];
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!exts.includes(ext)) {
    errors.push({ row: 0, field: 'extensión', message: `Extensión "${ext}" no permitida. Esperada: ${exts.join(', ')}` });
  }

  // Tamaño
  const maxSize = TAMANIO_MAXIMO[tipo] || 50 * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push({ row: 0, field: 'tamaño', message: `Archivo de ${(file.size / 1024 / 1024).toFixed(1)} MB excede el máximo de ${(maxSize / 1024 / 1024).toFixed(0)} MB` });
  }
  if (file.size === 0) {
    errors.push({ row: 0, field: 'tamaño', message: 'Archivo vacío' });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Validador de negocio ---

function validateNegocioGeneric(records: { pesoNeto?: number; cantidadEnvases?: number; cote?: string }[], tipo: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const now = new Date();

  records.forEach((r, idx) => {
    const rowNum = idx + 17; // datos empiezan en fila 17

    // Peso negativo
    if (r.pesoNeto !== undefined && r.pesoNeto < 0) {
      errors.push({ row: rowNum, field: 'pesoNeto', message: `Peso neto negativo: ${r.pesoNeto}` });
    }
    // Envases negativos
    if (r.cantidadEnvases !== undefined && r.cantidadEnvases < 0) {
      errors.push({ row: rowNum, field: 'cantidadEnvases', message: `Envases negativos: ${r.cantidadEnvases}` });
    }
    // COTE vacío
    if (r.cote !== undefined && !r.cote) {
      warnings.push({ row: rowNum, field: 'cote', message: 'COTE vacío' });
    }
  });

  // Cantidad mínima
  const min = REGISTROS_MINIMOS[tipo] || 1;
  if (records.length < min) {
    warnings.push({ row: 0, field: 'registros', message: `Solo ${records.length} registros (mínimo esperado: ${min})` });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export const SchemaValidator: ISchemaValidator = {
  validateNacional(records: NacionalRecord[]): ValidationResult {
    return validateNegocioGeneric(records, 'nacional');
  },
  validateIngresos(records: IngresoRecord[]): ValidationResult {
    return validateNegocioGeneric(records, 'ingresos');
  },
  validateExportaciones(records: ExportacionRecord[]): ValidationResult {
    return validateNegocioGeneric(records, 'exportaciones');
  },
  validatePallets(records: PalletRecord[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    records.forEach((r, idx) => {
      if (r.kilos < 0) errors.push({ row: idx + 7, field: 'kilos', message: `Kilos negativos: ${r.kilos}` });
      if (r.cajas < 0) errors.push({ row: idx + 7, field: 'cajas', message: `Cajas negativas: ${r.cajas}` });
      if (!r.contenido) warnings.push({ row: idx + 7, field: 'contenido', message: 'Contenido vacío' });
    });

    if (records.length < 1) {
      errors.push({ row: 0, field: 'registros', message: 'No hay pallets' });
    }

    return { valid: errors.length === 0, errors, warnings };
  },
};

// --- Validaciones cruzadas ---

export interface CrossValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export function crossValidate(
  nacional: NacionalRecord[],
  ingresos: IngresoRecord[],
  exportaciones: ExportacionRecord[],
  pallets: PalletRecord[]
): CrossValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. COTEs en exportaciones sin ingreso relacionado
  const cotesIngresos = new Set([...ingresos.map(r => r.nroCote), ...nacional.filter(r => r.tipoMovimiento.includes('DEP')).map(r => r.cote)]);
  const cotesExportaciones = new Set([...exportaciones.map(r => r.nroCote), ...nacional.filter(r => r.tipoMovimiento.includes('EXPORT')).map(r => r.cote)]);

  let sinIngreso = 0;
  for (const cote of cotesExportaciones) {
    if (!cotesIngresos.has(cote)) sinIngreso++;
  }
  if (sinIngreso > 0) {
    warnings.push({ row: 0, field: 'cruzada', message: `${sinIngreso} COTE(s) con exportación pero sin ingreso relacionado` });
  }

  // 2. COTEs en pallets sin ingreso
  const palletCotes = new Set(pallets.map(p => p.codigo).filter(Boolean));
  let palletsSinIngreso = 0;
  for (const cote of palletCotes) {
    if (!cotesIngresos.has(cote)) palletsSinIngreso++;
  }
  if (palletsSinIngreso > 0) {
    warnings.push({ row: 0, field: 'cruzada', message: `${palletsSinIngreso} COTE(s) en stock sin ingreso relacionado` });
  }

  // 3. Diferencia entre stock de pallets y saldo calculado
  const stockPalletsPn = pallets.reduce((s, p) => s + p.kilos, 0);
  const ingresoPn = ingresos.reduce((s, r) => s + r.pesoNeto, 0);
  const expPn = exportaciones.reduce((s, r) => s + r.pesoNeto, 0);
  const saldoCalculado = ingresoPn - expPn;
  if (saldoCalculado > 0 && stockPalletsPn > 0) {
    const diff = Math.abs(stockPalletsPn - saldoCalculado);
    const pct = (diff / Math.max(stockPalletsPn, saldoCalculado)) * 100;
    if (pct > 20) {
      warnings.push({ row: 0, field: 'cruzada', message: `Diferencia significativa entre stock de pallets (${(stockPalletsPn/1000).toFixed(1)} t) y saldo calculado (${(saldoCalculado/1000).toFixed(1)} t). Diferencia: ${pct.toFixed(1)}%` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
