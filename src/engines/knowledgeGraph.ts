// ============================================================
// KNOWLEDGE GRAPH — Grafo de Conocimiento y Relaciones
// ------------------------------------------------------------
// ETI-13: Capa lógica para relacionar entidades del negocio.
// No sustituye Prisma/Firebase. Es una capa de inteligencia.
// ============================================================

import type { Ingreso, Exportacion, StockPallet } from '@/domain';
import { DiscoveryEngine } from './discoveryEngine';
import type { Discovery } from './discoveryEngine';

// --- Tipos ---

export type EntityType =
  | 'empresa' | 'productor' | 'cliente' | 'pais' | 'producto' | 'puerto'
  | 'contenedor' | 'certificador' | 'deposito' | 'cote'
  | 'exportacion' | 'ingreso';

export type RelationType =
  | 'exporta_a' | 'certifica_a' | 'deposita_en' | 'produce'
  | 'compra_a' | 'envia_a' | 'usa_puerto' | 'usa_contenedor'
  | 'comparte_mercado' | 'comparte_cliente' | 'comparte_producto'
  | 'compite_con' | 'depende_de';

export interface KnowledgeNode {
  id: string;
  type: EntityType;
  label: string;
  properties: {
    pesoNetoTotal: number;
    embarques: number;
    primeraAparicion: string | null;
    ultimaAparicion: string | null;
    activo: boolean;
  };
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  type: RelationType;
  weight: number;       // peso neto total
  count: number;        // número de registros
  frecuencia: number;   // 0-1, qué tan frecuente es esta relación
  estable: boolean;     // true si la relación se mantiene en el tiempo
  desde: string | null; // primera fecha
  hasta: string | null; // última fecha
}

export interface RelationAnalysis {
  entityType: EntityType;
  entityId: string;
  relacionTipo: RelationType;
  relacionadaCon: EntityType;
  gradoDependencia: number;   // 0-100
  diversificacion: number;    // 0-100 (más alto = más diversificado)
  centralidad: number;        // 0-100 (qué tan central es)
  concentracion: number;      // 0-100 (qué tan concentrada está)
  estabilidad: number;        // 0-100 (qué tan estable en el tiempo)
  evolucion: number;          // -100 a 100 (tendencia)
}

export interface InvestigationReport {
  id: string;
  nombre: string;
  descripcion: string;
  fecha: string;
  filtros: Record<string, string>;
  resultados: {
    resumen: string;
    kpis: { label: string; value: string }[];
    timeline: { fecha: string; evento: string }[];
    riesgos: { titulo: string; nivel: string }[];
    hallazgos: Discovery[];
    relaciones: { entidad: string; tipo: string; peso: number }[];
    recomendaciones: string[];
  };
}

// --- Implementación ---

class KnowledgeGraphImpl {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();
  private investigations: InvestigationReport[] = [];

  // --- Construcción del grafo ---

  buildGraph(ingresos: Ingreso[], exportaciones: Exportacion[], stock: StockPallet[]): void {
    this.nodes.clear();
    this.edges.clear();

    // Crear nodos desde exportaciones
    for (const exp of exportaciones) {
      this.addNode('empresa', exp.certificadoraId, exp.pesoNeto, exp.fecha);
      this.addNode('productor', exp.productorId, exp.pesoNeto, exp.fecha);
      this.addNode('cliente', exp.destino, exp.pesoNeto, exp.fecha);
      this.addNode('pais', exp.paisDestino, exp.pesoNeto, exp.fecha);
      this.addNode('cote', exp.nroCote, exp.pesoNeto, exp.fecha);

      // Crear aristas
      this.addEdge(exp.certificadoraId, exp.paisDestino, 'exporta_a', exp.pesoNeto, exp.fecha);
      this.addEdge(exp.certificadoraId, exp.destino, 'certifica_a', exp.pesoNeto, exp.fecha);
      this.addEdge(exp.destino, exp.paisDestino, 'compra_a', exp.pesoNeto, exp.fecha);
    }

    // Crear nodos desde ingresos
    for (const ing of ingresos) {
      this.addNode('deposito', ing.depositoId, ing.pesoNeto, ing.fecha);
      this.addNode('productor', ing.productorId, ing.pesoNeto, ing.fecha);
      this.addEdge(ing.productorId, ing.depositoId, 'deposita_en', ing.pesoNeto, ing.fecha);
    }

    // Calcular frecuencia y estabilidad
    for (const edge of this.edges.values()) {
      edge.frecuencia = Math.min(1, edge.count / 10);
      edge.estable = edge.count >= 3;
    }
  }

  // --- Análisis de relaciones ---

  analyzeRelation(entityType: EntityType, entityId: string, relacionTipo: RelationType): RelationAnalysis | null {
    const relatedEdges = Array.from(this.edges.values()).filter(e =>
      (e.source === entityId && e.type === relacionTipo) ||
      (e.target === entityId && e.type === relacionTipo)
    );

    if (relatedEdges.length === 0) return null;

    const totalWeight = relatedEdges.reduce((s, e) => s + e.weight, 0);
    const topEdge = relatedEdges.sort((a, b) => b.weight - a.weight)[0];
    const topShare = totalWeight > 0 ? (topEdge.weight / totalWeight) * 100 : 0;

    // Grado de dependencia: qué tan concentrado en una sola relación
    const gradoDependencia = topShare;

    // Diversificación: 100 - concentración
    const diversificacion = 100 - topShare;

    // Centralidad: número de conexiones relativas
    const centralidad = Math.min(100, relatedEdges.length * 10);

    // Concentración: índice de Herfindahl
    const shares = relatedEdges.map(e => (e.weight / totalWeight) ** 2);
    const concentracion = shares.reduce((s, v) => s + v, 0) * 100;

    // Estabilidad: promedio de relaciones estables
    const estables = relatedEdges.filter(e => e.estable).length;
    const estabilidad = relatedEdges.length > 0 ? (estables / relatedEdges.length) * 100 : 0;

    // Evolución: comparar últimos 3 meses vs 3 anteriores (simplificado)
    const evolucion = 0; // se calcularía con histórico si estuviera disponible

    return {
      entityType, entityId, relacionTipo,
      relacionadaCon: 'empresa' as EntityType,
      gradoDependencia,
      diversificacion,
      centralidad,
      concentracion,
      estabilidad,
      evolucion,
    };
  }

  // --- Preguntas complejas ---

  // ¿Qué empresas venden los mismos productos?
  findCompaniesWithSameProducts(empresaId: string): { empresa: string; productosCompartidos: number; pesoCompartido: number }[] {
    // Agrupar empresa→producto
    const empProductos = new Map<string, Set<string>>();
    const empProductoPeso = new Map<string, number>();

    for (const edge of this.edges.values()) {
      if (edge.type === 'exporta_a') continue;
      // Simplificado: usa nodos y aristas disponibles
    }

    // En implementación completa, cruzaríamos productos
    return [];
  }

  // ¿Qué certificadores comparten clientes?
  findCertifiersSharingClients(certificadorId: string): { certificador: string; clientesCompartidos: number; pesoCompartido: number }[] {
    const result: { certificador: string; clientesCompartidos: number; pesoCompartido: number }[] = [];
    const myClients = new Set<string>();

    for (const edge of this.edges.values()) {
      if (edge.source === certificadorId && edge.type === 'certifica_a') {
        myClients.add(edge.target);
      }
    }

    for (const edge of this.edges.values()) {
      if (edge.type === 'certifica_a' && edge.source !== certificadorId && myClients.has(edge.target)) {
        const existing = result.find(r => r.certificador === edge.source);
        if (existing) {
          existing.clientesCompartidos++;
          existing.pesoCompartido += edge.weight;
        } else {
          result.push({ certificador: edge.source, clientesCompartidos: 1, pesoCompartido: edge.weight });
        }
      }
    }

    return result.sort((a, b) => b.pesoCompartido - a.pesoCompartido);
  }

  // ¿Qué empresas dependen de un solo mercado?
  findCompaniesDependingOnSingleMarket(): { empresa: string; pais: string; pctDependencia: number }[] {
    const result: { empresa: string; pais: string; pctDependencia: number }[] = [];
    const empPaisPeso = new Map<string, Map<string, number>>();

    for (const edge of this.edges.values()) {
      if (edge.type !== 'exporta_a') continue;
      if (!empPaisPeso.has(edge.source)) empPaisPeso.set(edge.source, new Map());
      empPaisPeso.get(edge.source)!.set(edge.target, (empPaisPeso.get(edge.source)!.get(edge.target) || 0) + edge.weight);
    }

    for (const [empresa, paises] of empPaisPeso) {
      const total = Array.from(paises.values()).reduce((s, v) => s + v, 0);
      for (const [pais, peso] of paises) {
        const pct = (peso / total) * 100;
        if (pct > 70 && total > 100000) {
          result.push({ empresa, pais, pctDependencia: pct });
        }
      }
    }

    return result.sort((a, b) => b.pctDependencia - a.pctDependencia);
  }

  // --- Investigaciones ---

  createInvestigation(
    nombre: string,
    descripcion: string,
    filtros: Record<string, string>,
    ingresos: Ingreso[],
    exportaciones: Exportacion[],
    stock: StockPallet[]
  ): InvestigationReport {
    const discoveries = DiscoveryEngine.detectAll(ingresos, exportaciones, stock);
    const relevantDiscoveries = discoveries.filter(d => {
      // Filtrar por entidad si está en los filtros
      for (const [key, value] of Object.entries(filtros)) {
        if (!value) continue;
        const match = d.entities.some(e => e.id === value || e.label === value);
        if (!match) return false;
      }
      return true;
    });

    const resumen = `Investigación sobre ${filtros.empresa || filtros.cliente || filtros.pais || 'todas las entidades'}. ${relevantDiscoveries.length} hallazgos detectados. ${relevantDiscoveries.filter(d => d.severity === 'positive').length} positivos, ${relevantDiscoveries.filter(d => d.severity === 'negative').length} negativos.`;

    const kpis = relevantDiscoveries.slice(0, 5).map(d => ({
      label: d.title,
      value: d.description.substring(0, 100),
    }));

    const timeline = relevantDiscoveries.map(d => ({
      fecha: d.detectedAt,
      evento: d.title,
    }));

    const riesgos = relevantDiscoveries
      .filter(d => d.severity === 'negative' || d.severity === 'warning')
      .slice(0, 5)
      .map(d => ({ titulo: d.title, nivel: d.severity }));

    const relaciones = Array.from(this.edges.values())
      .filter(e => {
        for (const [, value] of Object.entries(filtros)) {
          if (value && (e.source === value || e.target === value)) return true;
        }
        return Object.values(filtros).every(v => !v);
      })
      .slice(0, 10)
      .map(e => ({ entidad: `${e.source} → ${e.target}`, tipo: e.type, peso: e.weight }));

    const recomendaciones = relevantDiscoveries
      .map(d => d.recommendation)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 5);

    const report: InvestigationReport = {
      id: `inv_${Date.now()}`,
      nombre, descripcion,
      fecha: new Date().toISOString(),
      filtros,
      resultados: {
        resumen, kpis, timeline, riesgos,
        hallazgos: relevantDiscoveries,
        relaciones, recomendaciones,
      },
    };

    this.investigations.unshift(report);
    if (this.investigations.length > 50) this.investigations = this.investigations.slice(0, 50);

    return report;
  }

  getInvestigations(): InvestigationReport[] {
    return this.investigations;
  }

  getInvestigation(id: string): InvestigationReport | null {
    return this.investigations.find(i => i.id === id) || null;
  }

  // --- Helpers ---

  private addNode(type: EntityType, id: string, peso: number, fecha: string): void {
    if (!id) return;
    const key = `${type}:${id}`;
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        id: key, type, label: id,
        properties: {
          pesoNetoTotal: 0, embarques: 0,
          primeraAparicion: fecha, ultimaAparicion: fecha,
          activo: true,
        },
      });
    }
    const node = this.nodes.get(key)!;
    node.properties.pesoNetoTotal += peso;
    node.properties.embarques++;
    if (fecha) {
      if (!node.properties.primeraAparicion || fecha < node.properties.primeraAparicion) {
        node.properties.primeraAparicion = fecha;
      }
      if (!node.properties.ultimaAparicion || fecha > node.properties.ultimaAparicion) {
        node.properties.ultimaAparicion = fecha;
      }
    }
  }

  private addEdge(source: string, target: string, type: RelationType, weight: number, fecha: string): void {
    if (!source || !target) return;
    const key = `${source}→${target}:${type}`;
    if (!this.edges.has(key)) {
      this.edges.set(key, {
        source, target, type,
        weight: 0, count: 0, frecuencia: 0,
        estable: false,
        desde: fecha, hasta: fecha,
      });
    }
    const edge = this.edges.get(key)!;
    edge.weight += weight;
    edge.count++;
    if (fecha) {
      if (!edge.desde || fecha < edge.desde) edge.desde = fecha;
      if (!edge.hasta || fecha > edge.hasta) edge.hasta = fecha;
    }
  }
}

// --- Singleton ---

export const KnowledgeGraph = new KnowledgeGraphImpl();
