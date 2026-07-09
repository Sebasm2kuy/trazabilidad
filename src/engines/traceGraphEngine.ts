// ============================================================
// TRACEGRAPH ENGINE — Núcleo de trazabilidad
// ------------------------------------------------------------
// ETI-04: El TraceGraph es la ÚNICA representación oficial del
// negocio. Todos los motores y pantallas consumen de aquí.
// ============================================================

import type {
  TraceNode, TraceEstado, TraceIngreso, TraceExportacion,
  TraceStock, TraceRelacion, TraceEvento, TraceAlerta,
  RiesgoNivel, Ingreso, Exportacion, StockPallet,
} from '@/domain';
import type { TraceGraphEngine as ITraceGraphEngine } from './interfaces';

// --- Índices internos ---

interface TraceIndices {
  porCote: Map<string, TraceNode>;
  porProductor: Map<string, Set<TraceNode>>;
  porCertificadora: Map<string, Set<TraceNode>>;
  porDeposito: Map<string, Set<TraceNode>>;
  porCliente: Map<string, Set<TraceNode>>;
  porPais: Map<string, Set<TraceNode>>;
  porEstado: Map<TraceEstado, Set<TraceNode>>;
  porRiesgo: Map<RiesgoNivel, Set<TraceNode>>;
  porFecha: Map<string, Set<TraceNode>>; // YYYY-MM
}

function createIndices(): TraceIndices {
  return {
    porCote: new Map(),
    porProductor: new Map(),
    porCertificadora: new Map(),
    porDeposito: new Map(),
    porCliente: new Map(),
    porPais: new Map(),
    porEstado: new Map(),
    porRiesgo: new Map(),
    porFecha: new Map(),
  };
}

function addToIndex<K>(map: Map<K, Set<TraceNode>>, key: K, node: TraceNode) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(node);
}

function removeFromIndex<K>(map: Map<K, Set<TraceNode>>, key: K, node: TraceNode) {
  if (!key) return;
  map.get(key)?.delete(node);
}

// --- Motor de eventos ---

type EventListener = (node: TraceNode, event: TraceEvento) => void;

// --- Implementación ---

class TraceGraphEngineImpl implements ITraceGraphEngine {
  private nodes: Map<string, TraceNode> = new Map();
  private indices: TraceIndices = createIndices();
  private listeners: Set<EventListener> = new Set();
  private nodeIdCounter = 0;

  // --- Construcción del grafo ---

  buildGraph(
    _cotes: any[],
    ingresos: Ingreso[],
    exportaciones: Exportacion[],
    _movimientos: any[]
  ): TraceNode[] {
    // Limpiar
    this.nodes.clear();
    this.indices = createIndices();

    // 1. Crear nodos desde ingresos
    for (const ing of ingresos) {
      this.addIngreso(ing);
    }

    // 2. Agregar exportaciones a los nodos existentes
    for (const exp of exportaciones) {
      this.addExportacion(exp);
    }

    // 3. Para nodos sin ingreso pero con exportación, crear como huérfano
    for (const exp of exportaciones) {
      if (!this.nodes.has(exp.nroCote)) {
        this.createOrphanNode(exp);
      }
    }

    // 4. Recalcular todos los nodos
    for (const node of this.nodes.values()) {
      this.recalculate(node);
    }

    return Array.from(this.nodes.values());
  }

  // --- Agregar ingreso a un nodo ---

  private addIngreso(ing: Ingreso): TraceNode {
    let node = this.nodes.get(ing.nroCote);
    const now = new Date().toISOString();

    if (!node) {
      node = this.createNode(ing.nroCote);
      node.productor = ing.productorId;
      node.corte = ing.corte;
      node.producto = ing.producto;
    }

    node.ingreso = {
      fecha: ing.fecha,
      documento: String(ing.nroTramite),
      cajas: ing.cantidadEnvases,
      pesoNeto: ing.pesoNeto,
      pesoBruto: 0,
      pallets: 0,
      deposito: ing.depositoId,
      archivoOrigen: 'ETL',
      filaOrigen: 0,
    };

    this.addEvent(node, 'ingreso_agregado', `Ingreso agregado: ${ing.cantidadEnvases} cajas, ${ing.pesoNeto} kg`);
    this.recalculate(node);

    return node;
  }

  // --- Agregar exportación a un nodo ---

  private addExportacion(exp: Exportacion): TraceNode {
    let node = this.nodes.get(exp.nroCote);

    if (!node) {
      node = this.createNode(exp.nroCote);
      node.certificadora = exp.certificadoraId;
      node.productor = exp.productorId;
      node.paisDestino = exp.paisDestino;
      node.cliente = exp.destino;
    }

    const traceExp: TraceExportacion = {
      id: exp.id,
      documento: String(exp.nroTramite),
      fecha: exp.fecha,
      cliente: exp.destino,
      destino: exp.paisDestino,
      peso: exp.pesoNeto,
      cajas: exp.cantidadEnvases,
      contenedor: exp.contenedor,
      observaciones: '',
      archivoOrigen: 'ETL',
      filaOrigen: 0,
    };

    // Evitar duplicados
    const exists = node.exportaciones.some(e => e.documento === traceExp.documento);
    if (!exists) {
      node.exportaciones.push(traceExp);
      this.addEvent(node, 'exportacion_agregada', `Exportación agregada: ${exp.pesoNeto} kg a ${exp.paisDestino}`);
    }

    this.recalculate(node);
    return node;
  }

  // --- Crear nodo huérfano (exportación sin ingreso) ---

  private createOrphanNode(exp: Exportacion): TraceNode {
    const node = this.createNode(exp.nroCote);
    node.certificadora = exp.certificadoraId;
    node.productor = exp.productorId;
    node.paisDestino = exp.paisDestino;
    node.cliente = exp.destino;
    node.estado = 'HUERFANO';
    node.integridadScore = 30;
    this.addEvent(node, 'creacion', `Nodo huérfano creado: exportación sin ingreso`);
    this.addAlerta(node, 'sin_ingreso', 'warning', 'Exportación sin ingreso relacionado');
    return node;
  }

  // --- Crear nodo base ---

  private createNode(nroCote: string): TraceNode {
    const now = new Date().toISOString();
    const node: TraceNode = {
      id: `tn_${this.nodeIdCounter++}`,
      nroCote,
      estado: 'NUEVO',
      integridadScore: 100,
      riesgoScore: 'MUY_BAJO',
      fechaCreacion: now,
      fechaActualizacion: now,
      observaciones: '',
      productor: '',
      certificadora: '',
      establecimiento: '',
      especie: '',
      producto: '',
      corte: '',
      cliente: null,
      paisDestino: '',
      empresa: '',
      ingreso: null,
      exportaciones: [],
      stock: {
        ingresoCajas: 0, ingresoPn: 0,
        exportadoCajas: 0, exportadoPn: 0,
        saldoCajas: 0, saldoPn: 0,
        palletsEnDeposito: 0, palletsPn: 0,
      },
      relaciones: [],
      historial: [],
      alertas: [],
    };

    // Registrar en índices
    this.nodes.set(nroCote, node);
    this.indices.porCote.set(nroCote, node);
    this.addEvent(node, 'creacion', `Nodo creado para COTE ${nroCote}`);

    return node;
  }

  // --- Recalcular nodo: stock, estado, integridad, riesgo, alertas ---

  private recalculate(node: TraceNode): void {
    const oldEstado = node.estado;
    const oldIntegridad = node.integridadScore;

    // 1. Stock
    const ingCajas = node.ingreso?.cajas || 0;
    const ingPn = node.ingreso?.pesoNeto || 0;
    const expCajas = node.exportaciones.reduce((s, e) => s + e.cajas, 0);
    const expPn = node.exportaciones.reduce((s, e) => s + e.peso, 0);

    node.stock = {
      ingresoCajas: ingCajas,
      ingresoPn: ingPn,
      exportadoCajas: expCajas,
      exportadoPn: expPn,
      saldoCajas: ingCajas - expCajas,
      saldoPn: ingPn - expPn,
      palletsEnDeposito: 0,
      palletsPn: 0,
    };

    // 2. Estado
    node.estado = this.calculateEstado(node);

    // 3. Integridad
    node.integridadScore = this.calculateIntegridad(node);

    // 4. Riesgo
    node.riesgoScore = this.calculateRiesgo(node);

    // 5. Relaciones
    node.relaciones = this.calculateRelaciones(node);

    // 6. Actualizar índices si cambió el estado
    if (oldEstado !== node.estado) {
      removeFromIndex(this.indices.porEstado, oldEstado, node);
      addToIndex(this.indices.porEstado, node.estado, node);
      this.addEvent(node, 'estado_cambiado', `Estado: ${oldEstado} → ${node.estado}`, oldEstado, node.estado);
    }

    // 7. Actualizar índices de riesgo
    addToIndex(this.indices.porRiesgo, node.riesgoScore, node);
    addToIndex(this.indices.porProductor, node.productor, node);
    addToIndex(this.indices.porCertificadora, node.certificadora, node);
    if (node.ingreso) addToIndex(this.indices.porDeposito, node.ingreso.deposito, node);
    if (node.cliente) addToIndex(this.indices.porCliente, node.cliente, node);
    if (node.paisDestino) addToIndex(this.indices.porPais, node.paisDestino, node);
    if (node.ingreso?.fecha) {
      const month = node.ingreso.fecha.substring(0, 7);
      addToIndex(this.indices.porFecha, month, node);
    }

    // 8. Fecha de actualización
    node.fechaActualizacion = new Date().toISOString();

    // 9. Notificar listeners
    if (oldEstado !== node.estado || oldIntegridad !== node.integridadScore) {
      this.notify(node, node.historial[node.historial.length - 1]);
    }
  }

  // --- Calcular estado ---

  private calculateEstado(node: TraceNode): TraceEstado {
    const { ingresoCajas, exportadoCajas, saldoCajas } = node.stock;

    if (!node.ingreso && node.exportaciones.length > 0) return 'HUERFANO';
    if (!node.ingreso && node.exportaciones.length === 0) return 'NUEVO';

    if (exportadoCajas === 0) return 'EN_STOCK';
    if (exportadoCajas < ingresoCajas) return 'EXPORTADO_PARCIAL';
    if (exportadoCajas === ingresoCajas) return 'EXPORTADO_TOTAL';
    if (exportadoCajas > ingresoCajas) return 'SOBREEXPORTADO';

    // Diferencias
    if (saldoCajas < 0) return 'INCONSISTENTE';
    if (node.alertas.some(a => a.severidad === 'error')) return 'CON_DIFERENCIAS';

    return 'EN_STOCK';
  }

  // --- Calcular integridad (0-100) ---

  private calculateIntegridad(node: TraceNode): number {
    let score = 100;

    // Sin ingreso
    if (!node.ingreso) score -= 40;

    // Sin productor
    if (!node.productor) score -= 10;

    // Sin certificadora
    if (!node.certificadora) score -= 10;

    // Saldo negativo
    if (node.stock.saldoCajas < 0) score -= 20;

    // Sobreexportación
    if (node.stock.exportadoCajas > node.stock.ingresoCajas) score -= 25;

    // Alertas activas
    const errors = node.alertas.filter(a => a.severidad === 'error').length;
    const warnings = node.alertas.filter(a => a.severidad === 'warning').length;
    score -= errors * 10;
    score -= warnings * 3;

    return Math.max(0, Math.min(100, score));
  }

  // --- Calcular riesgo ---

  private calculateRiesgo(node: TraceNode): RiesgoNivel {
    const score = node.integridadScore;
    const saldoNegativo = node.stock.saldoCajas < 0;
    const sobreexp = node.stock.exportadoCajas > node.stock.ingresoCajas;

    if (score < 40 || sobreexp) return 'CRITICO';
    if (score < 60 || saldoNegativo) return 'ALTO';
    if (score < 80) return 'MEDIO';
    if (score < 95) return 'BAJO';
    return 'MUY_BAJO';
  }

  // --- Calcular relaciones ---

  private calculateRelaciones(node: TraceNode): TraceRelacion[] {
    const rels: TraceRelacion[] = [];
    if (node.productor) rels.push({ tipo: 'productor', entidadId: node.productor, entidadLabel: node.productor });
    if (node.certificadora) rels.push({ tipo: 'certificadora', entidadId: node.certificadora, entidadLabel: node.certificadora });
    if (node.ingreso) rels.push({ tipo: 'deposito', entidadId: node.ingreso.deposito, entidadLabel: node.ingreso.deposito });
    if (node.cliente) rels.push({ tipo: 'cliente', entidadId: node.cliente, entidadLabel: node.cliente });
    if (node.paisDestino) rels.push({ tipo: 'pais', entidadId: node.paisDestino, entidadLabel: node.paisDestino });
    return rels;
  }

  // --- Agregar evento al historial ---

  private addEvent(node: TraceNode, tipo: TraceEvento['tipo'], descripcion: string, antes?: string, despues?: string): void {
    const event: TraceEvento = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      tipo,
      descripcion,
      usuario: 'system',
      antes,
      despues,
    };
    node.historial.push(event);
  }

  // --- Agregar alerta al nodo ---

  private addAlerta(node: TraceNode, tipo: string, severidad: 'info' | 'warning' | 'error', mensaje: string): void {
    // Evitar duplicados
    if (node.alertas.some(a => a.tipo === tipo)) return;
    node.alertas.push({
      id: `alt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tipo,
      severidad,
      mensaje,
      fecha: new Date().toISOString(),
    });
  }

  // --- Notificar listeners ---

  private notify(node: TraceNode, event: TraceEvento): void {
    for (const listener of this.listeners) {
      try { listener(node, event); } catch { /* noop */ }
    }
  }

  // --- API pública ---

  getTrace(nroCote: string): TraceNode[] {
    const node = this.indices.porCote.get(nroCote);
    return node ? [node] : [];
  }

  getNextExpectedEvent(nroCote: string): string | null {
    const node = this.indices.porCote.get(nroCote);
    if (!node) return null;
    if (!node.ingreso) return 'Esperando ingreso a depósito';
    if (node.exportaciones.length === 0) return 'Esperando exportación';
    if (node.estado === 'EXPORTADO_PARCIAL') return 'Esperando exportación del saldo restante';
    if (node.estado === 'EXPORTADO_TOTAL') return 'Ciclo completo';
    return null;
  }

  // --- Búsquedas por índice ---

  getByProductor(productor: string): TraceNode[] {
    return Array.from(this.indices.porProductor.get(productor) || []);
  }

  getByCertificadora(cert: string): TraceNode[] {
    return Array.from(this.indices.porCertificadora.get(cert) || []);
  }

  getByDeposito(deposito: string): TraceNode[] {
    return Array.from(this.indices.porDeposito.get(deposito) || []);
  }

  getByEstado(estado: TraceEstado): TraceNode[] {
    return Array.from(this.indices.porEstado.get(estado) || []);
  }

  getByRiesgo(riesgo: RiesgoNivel): TraceNode[] {
    return Array.from(this.indices.porRiesgo.get(riesgo) || []);
  }

  getByPais(pais: string): TraceNode[] {
    return Array.from(this.indices.porPais.get(pais) || []);
  }

  getByCliente(cliente: string): TraceNode[] {
    return Array.from(this.indices.porCliente.get(cliente) || []);
  }

  // --- Estadísticas ---

  /** Devuelve una referencia inmutable a todos los nodos del TraceGraph. */
  getAllNodes(): TraceNode[] {
    return Array.from(this.nodes.values());
  }

  getStats(): {
    total: number;
    porEstado: Record<TraceEstado, number>;
    integridadPromedio: number;
    alertasTotal: number;
    stockTotalPn: number;
    stockTotalCajas: number;
  } {
    const nodes = Array.from(this.nodes.values());
    const porEstado: Record<string, number> = {};
    let integridadSum = 0;
    let alertasTotal = 0;
    let stockPn = 0;
    let stockCajas = 0;

    for (const node of nodes) {
      porEstado[node.estado] = (porEstado[node.estado] || 0) + 1;
      integridadSum += node.integridadScore;
      alertasTotal += node.alertas.length;
      stockPn += node.stock.saldoPn;
      stockCajas += node.stock.saldoCajas;
    }

    return {
      total: nodes.length,
      porEstado: porEstado as Record<TraceEstado, number>,
      integridadPromedio: nodes.length > 0 ? integridadSum / nodes.length : 0,
      alertasTotal,
      stockTotalPn: stockPn,
      stockTotalCajas: stockCajas,
    };
  }

  // --- Eventos ---

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Trazabilidad inversa ---

  getTrazabilidadInversa(nroCote: string): {
    ingreso: TraceIngreso | null;
    exportaciones: TraceExportacion[];
    pallets: StockPallet[];
    cliente: string | null;
    certificadora: string;
    productor: string;
  } | null {
    const node = this.indices.porCote.get(nroCote);
    if (!node) return null;
    return {
      ingreso: node.ingreso,
      exportaciones: node.exportaciones,
      pallets: [],
      cliente: node.cliente,
      certificadora: node.certificadora,
      productor: node.productor,
    };
  }

  // --- Agregar stock de pallets a nodos existentes ---

  addPallets(pallets: StockPallet[]): void {
    for (const p of pallets) {
      if (!p.codigo) continue;
      const node = this.indices.porCote.get(p.codigo);
      if (node) {
        node.stock.palletsEnDeposito += p.pallets;
        node.stock.palletsPn += p.kilos;
      }
    }
    // Recalcular nodos afectados
    const affectedCotes = new Set(pallets.map(p => p.codigo).filter(Boolean));
    for (const cote of affectedCotes) {
      const node = this.indices.porCote.get(cote);
      if (node) this.recalculate(node);
    }
  }
}

// --- Singleton ---

export const TraceGraph = new TraceGraphEngineImpl();
