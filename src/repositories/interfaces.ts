// ============================================================
// REPOSITORY INTERFACES — Contratos de acceso a datos
// ------------------------------------------------------------
// Los repositorios son la ÚNICA fuente de verdad para los datos
// procesados. Las pantallas y engines consumen de aquí, nunca
// de localStorage ni de Excel directamente.
// ============================================================

import type {
  Cote, Ingreso, Exportacion, StockPallet, Movimiento,
  Empresa, Productor, Certificadora, Deposito, Cliente, Pais,
  Alerta, Indicador, TraceNode,
} from '@/domain';

// --- Repositorio base ---

export interface Repository<T> {
  getAll(): T[];
  getById(id: string): T | null;
  saveAll(items: T[]): void;
  clear(): void;
  count(): number;
}

// --- Repositorios específicos ---

export interface CoteRepository extends Repository<Cote> {
  getByNroCote(nroCote: string): Cote | null;
  getByProductor(productorId: string): Cote[];
  getByCertificadora(certificadoraId: string): Cote[];
}

export interface IngresoRepository extends Repository<Ingreso> {
  getByCote(coteId: string): Ingreso[];
  getByDeposito(depositoId: string): Ingreso[];
  getByProductor(productorId: string): Ingreso[];
}

export interface ExportacionRepository extends Repository<Exportacion> {
  getByCote(coteId: string): Exportacion[];
  getByPais(pais: string): Exportacion[];
  getByCertificadora(certificadoraId: string): Exportacion[];
}

export interface StockRepository extends Repository<StockPallet> {
  getByCodigo(codigo: string): StockPallet[];
  getTotalKg(): number;
  getTotalCajas(): number;
  getTotalPallets(): number;
  getCotes(): string[];
}

export interface MovimientoRepository extends Repository<Movimiento> {
  getByCote(coteId: string): Movimiento[];
  getByTipo(tipo: Movimiento['tipo']): Movimiento[];
  getRecent(limit: number): Movimiento[];
}

export interface TraceRepository {
  getTraceByCote(nroCote: string): TraceNode[];
  getAllTraces(): TraceNode[];
}

export interface KPIRepository extends Repository<Indicador> {
  getByName(nombre: string): Indicador | null;
  getByCategoria(categoria: string): Indicador[];
}

export interface AlertaRepository extends Repository<Alerta> {
  getByPrioridad(prioridad: Alerta['prioridad']): Alerta[];
  getByCategoria(categoria: Alerta['categoria']): Alerta[];
}

export type EmpresaRepository = Repository<Empresa>;
export type ProductorRepository = Repository<Productor>;
export type CertificadoraRepository = Repository<Certificadora>;
export type DepositoRepository = Repository<Deposito>;
export type ClienteRepository = Repository<Cliente>;
export type PaisRepository = Repository<Pais>;
