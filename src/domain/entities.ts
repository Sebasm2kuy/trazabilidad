// ============================================================
// DOMAIN ENTITIES — Modelo del negocio frigorífico
// ------------------------------------------------------------
// Estas son las entidades centrales del sistema. Todo el proyecto
// deberá hablar utilizando estas entidades, nunca mediante objetos
// anónimos ni filas crudas del Excel.
// ============================================================

// --- Entidades base ---

export interface Empresa {
  id: string;
  nombre: string;
  roles: RolEmpresa[];
  /** Peso neto total gestionado (kg). */
  pesoNetoTotal: number;
  embarques: number;
  marketShare: number;
  paises: number;
  cortes: number;
  clientes: number;
  riskScore: number;
}

export type RolEmpresa = 'certificadora' | 'productor' | 'deposito' | 'cliente';

export interface Productor {
  id: string;
  nombre: string;
  certificadoraPreferidaId: string | null;
  depositoPreferidoId: string | null;
  pesoNetoTotal: number;
  embarques: number;
  paises: string[];
  cortes: string[];
  ultimaActividad: string | null;
  activo: boolean;
  riskScore: number;
}

export interface Certificadora {
  id: string;
  nombre: string;
  pesoNetoTotal: number;
  embarques: number;
  marketShare: number;
  productores: number;
  paises: number;
  cortes: number;
  riskScore: number;
}

export interface Deposito {
  id: string;
  nombre: string;
  pesoNetoTotal: number;
  embarques: number;
  productores: number;
  marketShare: number;
  stockPn: number;
  stockPallets: number;
  capacidadKg: number | null;
  utilizacion: number;
  productoresList: string[];
  riskScore: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  pesoNetoTotal: number;
  embarques: number;
  paises: string[];
  productores: string[];
  ultimaActividad: string | null;
  activo: boolean;
  riskScore: number;
}

export interface Pais {
  id: string;
  nombre: string;
  embarques: number;
  pesoNetoTotal: number;
  empresas: string[];
  productores: string[];
}

// --- Entidades operativas ---

export interface Cote {
  id: string;
  numero: string;
  nroTramite: number;
  fechaTramite: string;
  fechaEmitido: string | null;
  certificadoraId: string;
  productorId: string;
  depositoId: string | null;
  clienteId: string | null;
  paisDestino: string;
  corte: string;
  producto: string;
  denominacion: string;
  pesoBruto: number;
  pesoNeto: number;
  cantidadEnvases: number;
  pallets: number;
  tipoTransporte: string;
  contenedor: string | null;
  proceso: string;
  tipoProducto: 'Congelado' | 'Fresco' | '';
  tipoMovimiento: 'INGRESO' | 'EXPORTACION' | 'DEPOSITO';
  fechaInicioFaena: string | null;
  fechaFinFaena: string | null;
  fechaInicioProduccion: string | null;
  fechaFinProduccion: string | null;
  fechaInicioCongelacion: string | null;
  fechaFinCongelacion: string | null;
  estado: EstadoCote;
}

export type EstadoCote =
  | 'en_stock'
  | 'en_transito'
  | 'exportado'
  | 'retenido'
  | 'parcial'
  | 'sin_destino'
  | 'desconocido';

export interface Ingreso {
  id: string;
  coteId: string;
  nroCote: string;
  fecha: string;
  productorId: string;
  depositoId: string;
  pesoNeto: number;
  cantidadEnvases: number;
  corte: string;
  producto: string;
  nroTramite: number;
}

export interface Exportacion {
  id: string;
  coteId: string;
  nroCote: string;
  fecha: string;
  certificadoraId: string;
  productorId: string;
  paisDestino: string;
  destino: string;
  pesoNeto: number;
  cantidadEnvases: number;
  corte: string;
  producto: string;
  contenedor: string | null;
  nroTramite: number;
}

export interface StockPallet {
  id: string;
  codigo: string;
  codigoTipo: 'COTE' | 'PASE_SANITARIO' | 'NINGUNO';
  fechaComision: string | null;
  fechaEntrega: string | null;
  contenedor: string;
  pallets: number;
  cajas: number;
  kilos: number;
  contenido: string;
  producto: string;
  nroLote: string;
  dua: string;
  fechaVencimiento: string | null;
  le: string;
}

export interface Movimiento {
  id: string;
  coteId: string;
  nroCote: string;
  tipo: 'ingreso' | 'egreso' | 'transferencia' | 'exportacion' | 'retorno' | 'correccion';
  fecha: string;
  origenId: string | null;
  destinoId: string | null;
  pesoNeto: number;
  cantidadEnvases: number;
  observaciones?: string;
  eventId: string;
}

// --- Trazabilidad ---

export interface TraceNode {
  id: string;
  nroCote: string;
  estado: TraceEstado;
  integridadScore: number;       // 0-100
  riesgoScore: RiesgoNivel;
  fechaCreacion: string;
  fechaActualizacion: string;
  observaciones: string;

  // Producción
  productor: string;
  certificadora: string;
  establecimiento: string;
  especie: string;
  producto: string;
  corte: string;
  cliente: string | null;
  paisDestino: string;
  empresa: string;

  // Ingreso
  ingreso: TraceIngreso | null;

  // Exportaciones (puede haber varias)
  exportaciones: TraceExportacion[];

  // Stock
  stock: TraceStock;

  // Relaciones
  relaciones: TraceRelacion[];

  // Historial
  historial: TraceEvento[];

  // Alertas del nodo
  alertas: TraceAlerta[];
}

export type TraceEstado =
  | 'NUEVO'
  | 'EN_STOCK'
  | 'EXPORTADO_PARCIAL'
  | 'EXPORTADO_TOTAL'
  | 'CON_DIFERENCIAS'
  | 'HUERFANO'
  | 'SOBREEXPORTADO'
  | 'INCONSISTENTE'
  | 'BLOQUEADO'
  | 'ARCHIVADO';

export type RiesgoNivel = 'MUY_BAJO' | 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export interface TraceIngreso {
  fecha: string | null;
  documento: string;
  cajas: number;
  pesoNeto: number;
  pesoBruto: number;
  pallets: number;
  deposito: string;
  archivoOrigen: string;
  filaOrigen: number;
}

export interface TraceExportacion {
  id: string;
  documento: string;
  fecha: string | null;
  cliente: string;
  destino: string;
  peso: number;
  cajas: number;
  contenedor: string | null;
  observaciones: string;
  archivoOrigen: string;
  filaOrigen: number;
}

export interface TraceStock {
  ingresoCajas: number;
  ingresoPn: number;
  exportadoCajas: number;
  exportadoPn: number;
  saldoCajas: number;
  saldoPn: number;
  palletsEnDeposito: number;
  palletsPn: number;
}

export interface TraceRelacion {
  tipo: 'productor' | 'certificadora' | 'deposito' | 'cliente' | 'pais';
  entidadId: string;
  entidadLabel: string;
}

export interface TraceEvento {
  id: string;
  timestamp: string;
  tipo: 'creacion' | 'ingreso_agregado' | 'exportacion_agregada' | 'correccion' | 'saldo_recalculado' | 'integridad_recalculada' | 'alerta_generada' | 'estado_cambiado';
  descripcion: string;
  usuario: string;
  antes?: string;
  despues?: string;
}

export interface TraceAlerta {
  id: string;
  tipo: string;
  severidad: 'info' | 'warning' | 'error';
  mensaje: string;
  fecha: string;
}

// --- Alertas e Indicadores ---

export interface Alerta {
  id: string;
  categoria: CategoriaAlerta;
  prioridad: PrioridadAlerta;
  titulo: string;
  descripcion: string;
  entidad?: { tipo: string; id: string; label: string };
  metrica?: number;
  accionSugerida?: string;
  detectadaEn: string;
}

export type CategoriaAlerta =
  | 'stock_inmovilizado'
  | 'stock_sin_movimiento'
  | 'mercaderia_retenida'
  | 'duplicados'
  | 'documentacion_incompleta'
  | 'mercaderia_sin_destino'
  | 'stock_en_terceros'
  | 'anomalia'
  | 'exportacion_demorada'
  | 'operacion_sospechosa';

export type PrioridadAlerta = 'critica' | 'alta' | 'media' | 'baja';

export interface Indicador {
  id: string;
  nombre: string;
  valor: number;
  unidad: 'kg' | 'count' | 'percent' | 'currency' | 'days';
  tendencia?: number;
  descripcion?: string;
  categoria?: string;
}

// --- Matriz de captura ---

export interface MatrizCaptura {
  /** A: CALIRAL depósito + CALIRAL certificación */
  matrizA: { pn: number; count: number };
  /** B: CALIRAL depósito + Otro certificador */
  matrizB: { pn: number; count: number };
  /** C: Otro depósito + CALIRAL certificación */
  matrizC: { pn: number; count: number };
  /** D: Otro depósito + Otro certificador */
  matrizD: { pn: number; count: number };
}
