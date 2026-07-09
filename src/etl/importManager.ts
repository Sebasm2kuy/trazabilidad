// ============================================================
// ETL IMPORT MANAGER — Orquestador transaccional del ETL
// ============================================================
// Punto de entrada único para importar los 4 archivos oficiales.
// Procesa todo como una transacción: si algo falla, no se actualiza nada.
// ============================================================

import type {
  ImportManager as IImportManager,
  LoadSession,
  ImportProgress,
  NacionalRecord,
  IngresoRecord,
  ExportacionRecord,
  PalletRecord,
} from './interfaces';
import { Normalizer } from './normalizer';
import { SchemaValidator, validateFile, crossValidate } from './validators';
import { Converter } from './converters';
import type { Cote, Ingreso, Exportacion, StockPallet } from '@/domain';

const HISTORY_KEY = 'trazabilidad_import_history';
const MAX_HISTORY = 100;

// --- Resultado de la importación ---

export interface ImportResult {
  session: LoadSession;
  success: boolean;
  error?: string;
  data?: {
    cotes: Cote[];
    ingresos: Ingreso[];
    exportaciones: Exportacion[];
    pallets: StockPallet[];
  };
  validation?: {
    nacionalErrors: number;
    ingresosErrors: number;
    exportacionesErrors: number;
    palletsErrors: number;
    crossErrors: number;
    totalWarnings: number;
    quality: number;
  };
}

// --- Mapeo de filas a registros intermedios ---

function mapNacionalRow(row: unknown[]): NacionalRecord {
  const s = Normalizer.normalizeString;
  const n = Normalizer.normalizeNumber;
  const d = Normalizer.normalizeDate;
  return {
    tramite: n(row[0]),
    fecha: d(row[1]) || '',
    cote: s(row[2]),
    certificadora: s(row[4]),
    productor: s(row[5]),
    nroProductor: s(row[6]),
    destino: s(row[19]),
    tipoMovimiento: s(row[20]),
    pais: s(row[23]),
    denominacion: s(row[42]),
    corte: s(row[43]),
    pallets: n(row[44]),
    envases: n(row[45]),
    pesoBruto: n(row[46]),
    pesoNeto: n(row[47]),
    tipoTransporte: s(row[9]),
    shipping: s(row[49]),
    proceso: s(row[59]),
  };
}

function mapIngresoRow(row: unknown[]): IngresoRecord {
  const s = Normalizer.normalizeString;
  const n = Normalizer.normalizeNumber;
  const d = Normalizer.normalizeDate;
  return {
    nroTramite: n(row[0]),
    fechaTramite: d(row[1]) || '',
    nroCote: s(row[2]),
    productor: s(row[5]),
    deposito: s(row[19]),
    pesoNeto: n(row[47]),
    cantidadEnvases: n(row[45]),
    corte: s(row[43]),
    denominacion: s(row[42]),
  };
}

function mapExportacionRow(row: unknown[]): ExportacionRecord {
  const s = Normalizer.normalizeString;
  const n = Normalizer.normalizeNumber;
  const d = Normalizer.normalizeDate;
  return {
    nroTramite: n(row[0]),
    fechaTramite: d(row[1]) || '',
    nroCote: s(row[2]),
    certificadora: s(row[4]),
    productor: s(row[5]),
    paisDestino: s(row[23]),
    destino: s(row[19]),
    pesoNeto: n(row[47]),
    cantidadEnvases: n(row[45]),
    corte: s(row[43]),
    denominacion: s(row[42]),
    contenedor: s(row[10]) || null,
  };
}

function mapPalletRow(row: unknown[]): PalletRecord {
  const s = Normalizer.normalizeString;
  const n = Normalizer.normalizeNumber;
  const d = Normalizer.normalizeDate;
  const contenido = s(row[6]);
  // Extraer código COTE o Pase Sanitario del contenido
  const coteMatch = contenido.match(/COTE\s+(P\d{4,8})/i);
  const paseMatch = contenido.match(/PASE\s+SANITARIO\s+(B\d{4,8})/i);
  let codigo = '';
  let codigoTipo: 'COTE' | 'PASE_SANITARIO' | 'NINGUNO' = 'NINGUNO';
  if (coteMatch) { codigo = coteMatch[1].toUpperCase(); codigoTipo = 'COTE'; }
  else if (paseMatch) { codigo = paseMatch[1].toUpperCase(); codigoTipo = 'PASE_SANITARIO'; }
  return {
    fechaComision: d(row[0]) || '',
    fechaEntrega: d(row[1]) || '',
    contenedor: s(row[2]),
    pallets: n(row[3]),
    cajas: n(row[4]),
    kilos: n(row[5]),
    contenido,
    nroLote: s(row[8]),
    dua: s(row[9]),
    fechaVencimiento: d(row[10]) || '',
    le: s(row[11]),
    codigo,
    codigoTipo,
  };
}

// --- Implementación del ImportManager ---

export const ImportManager: IImportManager = {
  async importAll(files, onProgress): Promise<LoadSession> {
    const session = await this.importFile(
      files.nacional || files.ingresos || files.exportaciones || files.pallets!,
      files.nacional ? 'nacional' : files.ingresos ? 'ingresos' : files.exportaciones ? 'exportaciones' : 'pallets',
      onProgress
    );
    return session;
  },

  async importFile(file, tipo, onProgress): Promise<LoadSession> {
    const startTime = Date.now();
    const sessionId = `imp_${Date.now()}`;
    const report = (p: ImportProgress) => onProgress?.(p);

    report({ phase: 'reading', current: 0, total: file.size, message: `Leyendo ${file.name}…` });

    // 1. Validación física
    const fileValidation = validateFile(file, tipo);
    if (!fileValidation.valid) {
      throw new Error(fileValidation.errors.map(e => e.message).join('; '));
    }

    // 2. Leer archivo con SheetJS
    const XLSX = await import('xlsx');
    const ab = await file.arrayBuffer();
    report({ phase: 'reading', current: file.size, total: file.size, message: 'Decodificando…' });
    const wb = XLSX.read(ab, { type: 'array', cellDates: true, dense: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    // 3. Determinar fila de headers y datos
    let headerIdx = 15; // default para MGAP
    if (tipo === 'pallets') headerIdx = 6;
    // Buscar fila con "Nro. Trámite" o "Contenido"
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const rowStr = JSON.stringify(rows[i]).toLowerCase();
      if (rowStr.includes('trámite') || rowStr.includes('tramite') || rowStr.includes('contenido')) {
        if (rows[i].filter(c => c).length > 5) { headerIdx = i; break; }
      }
    }
    const dataStart = headerIdx + 1;

    report({ phase: 'parsing', current: 0, total: rows.length - dataStart, message: `Procesando ${rows.length - dataStart} filas…` });

    // 4. Mapear filas a registros intermedios
    const records: any[] = [];
    for (let i = dataStart; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      let rec: any;
      switch (tipo) {
        case 'nacional': rec = mapNacionalRow(row); break;
        case 'ingresos': rec = mapIngresoRow(row); break;
        case 'exportaciones': rec = mapExportacionRow(row); break;
        case 'pallets': rec = mapPalletRow(row); break;
      }
      if (rec) records.push(rec);
      if (i % 10000 === 0) {
        report({ phase: 'parsing', current: i - dataStart, total: rows.length - dataStart, message: `Procesando… ${i.toLocaleString('es-UY')} / ${rows.length.toLocaleString('es-UY')}` });
      }
    }

    // 5. Validar
    report({ phase: 'validating', current: 0, total: records.length, message: `Validando ${records.length} registros…` });
    let validation;
    switch (tipo) {
      case 'nacional': validation = SchemaValidator.validateNacional(records); break;
      case 'ingresos': validation = SchemaValidator.validateIngresos(records); break;
      case 'exportaciones': validation = SchemaValidator.validateExportaciones(records); break;
      case 'pallets': validation = SchemaValidator.validatePallets(records); break;
    }

    if (!validation.valid) {
      throw new Error(`Validación fallida: ${validation.errors.slice(0, 5).map(e => `Fila ${e.row}: ${e.message}`).join('; ')}`);
    }

    // 6. Normalizar (ya hecho en el mapeo)
    report({ phase: 'normalizing', current: records.length, total: records.length, message: 'Normalizando…' });

    // 7. Convertir a entidades del dominio
    report({ phase: 'converting', current: 0, total: records.length, message: 'Convirtiendo a entidades…' });
    let domainData: { cotes: Cote[]; ingresos: Ingreso[]; exportaciones: Exportacion[]; pallets: StockPallet[] } = { cotes: [], ingresos: [], exportaciones: [], pallets: [] };
    switch (tipo) {
      case 'nacional': {
        const result = Converter.convertNacional(records);
        domainData.cotes = result.cotes;
        domainData.ingresos = result.ingresos;
        domainData.exportaciones = result.exportaciones;
        break;
      }
      case 'ingresos':
        domainData.ingresos = Converter.convertIngresos(records);
        break;
      case 'exportaciones':
        domainData.exportaciones = Converter.convertExportaciones(records);
        break;
      case 'pallets':
        domainData.pallets = Converter.convertPallets(records);
        break;
    }

    // 8. Persistir en localStorage (compatible con sistema existente)
    report({ phase: 'persisting', current: 0, total: 1, message: 'Guardando…' });

    if (tipo === 'nacional') {
      // Guardar en Firebase en chunks (reutilizar lógica existente)
      try {
        const { saveNacionalToFirebase } = await import('@/lib/parseNacionalExcel');
        // Convertir a MovRecord para compatibilidad
        const movRecords = records.map(r => ({
          t: r.tipoMovimiento.includes('EXPORT') ? 'EXPORTACION' : 'INGRESO',
          f: r.fecha,
          c: r.cote,
          cf: r.certificadora,
          p: r.productor,
          np: r.nroProductor,
          ed: r.destino,
          tm: r.tipoMovimiento,
          pa: r.pais,
          d: r.denominacion,
          co: r.corte,
          pa2: r.pallets,
          e: r.envases,
          pb: r.pesoBruto,
          pn: r.pesoNeto,
          tt: r.tipoTransporte,
          sh: r.shipping,
          tpd: Normalizer.normalizeTipoProducto(r.denominacion),
          isd: r.tipoMovimiento.includes('DEP'),
        }));
        await saveNacionalToFirebase(movRecords, file.name, (saved, total) => {
          report({ phase: 'persisting', current: saved, total, message: `Guardando en la nube… ${saved}/${total}` });
        });
        // Limpiar cache del loader
        const { clearNacionalCache } = await import('@/lib/nacionalLoader');
        clearNacionalCache();
      } catch (e) {
        console.error('[ImportManager] Error guardando en Firebase:', e);
      }
    }

    if (tipo === 'pallets') {
      // Guardar en localStorage (compatible con Cruces Frimaral)
      const stockLoad = {
        fecha: new Date().toISOString(),
        cliente: 'CALIRAL',
        pallets: domainData.pallets,
      };
      localStorage.setItem('trazabilidad_stock_data', JSON.stringify(stockLoad));
      // Sincronizar con Firebase
      try {
        const FB_URL = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';
        await fetch(`${FB_URL}/trazabilidad_stock_data.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stockLoad),
        });
      } catch (e) {
        console.error('[ImportManager] Error sync pallets a Firebase:', e);
      }
    }

    if (tipo === 'ingresos') {
      // Guardar como dep_imported (compatible con dataRepository)
      const shipments = records.map(r => ({
        id: `dep_${r.nroTramite}`,
        nroTramite: r.nroTramite,
        fechaTramite: r.fechaTramite,
        nroCote: r.nroCote,
        nombreEstablecimientoProd: r.productor,
        nombreEstablecimientoDestino: r.deposito,
        pesoNeto: r.pesoNeto,
        cantidadEnvases: r.cantidadEnvases,
        corte: r.corte,
        denominacionMercaderia: r.denominacion,
        tipo: 'deposito',
      }));
      localStorage.setItem('trazabilidad_dep_imported', JSON.stringify(shipments));
      // Sincronizar con Firebase
      try {
        const FB_URL = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';
        await fetch(`${FB_URL}/trazabilidad_dep_imported.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shipments),
        });
      } catch (e) {
        console.error('[ImportManager] Error sync ingresos a Firebase:', e);
      }
    }

    if (tipo === 'exportaciones') {
      const exports = records.map(r => ({
        id: `exp_${r.nroTramite}`,
        nroTramite: r.nroTramite,
        fechaTramite: r.fechaTramite,
        nroCote: r.nroCote,
        nombreEstablecimientoCertif: r.certificadora,
        nombreEstablecimientoProd: r.productor,
        nombreEstablecimientoDestino: r.destino,
        paisDestino: r.paisDestino,
        pesoNeto: r.pesoNeto,
        cantidadEnvases: r.cantidadEnvases,
        corte: r.corte,
        denominacionMercaderia: r.denominacion,
        contenedorSerieNro: r.contenedor,
        tipo: 'exportacion',
      }));
      localStorage.setItem('trazabilidad_exp_imported', JSON.stringify(exports));
      // Sincronizar con Firebase
      try {
        const FB_URL = 'https://trazabilidad-9aa3c-default-rtdb.firebaseio.com';
        await fetch(`${FB_URL}/trazabilidad_exp_imported.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exports),
        });
      } catch (e) {
        console.error('[ImportManager] Error sync exportaciones a Firebase:', e);
      }
    }

    // 9. Registrar sesión
    const duration = Math.round((Date.now() - startTime) / 1000);
    const session: LoadSession = {
      id: sessionId,
      fecha: new Date().toISOString(),
      archivos: [{
        nombre: file.name,
        tipo,
        registros: records.length,
        tamaño: file.size,
      }],
      totalRegistros: records.length,
      errores: validation.errors.length,
      advertencias: validation.warnings.length,
    };

    // Guardar en historial
    try {
      const history = this.getHistory();
      history.unshift(session);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch { /* noop */ }

    report({ phase: 'done', current: records.length, total: records.length, message: `${records.length} registros procesados` });

    return session;
  },

  getHistory(): LoadSession[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  },

  getLastSession(): LoadSession | null {
    const history = this.getHistory();
    return history.length > 0 ? history[0] : null;
  },
};
