// ============================================================
// GRAPH ENGINE — Construye el grafo de relaciones del gemelo
// ------------------------------------------------------------
// Nodos: entidades (warehouse, producer, certifier, client, etc).
// Edges: relaciones certificadas/produce/deposita/exporta/etc.
// ============================================================

import type { TwinSnapshot, RelationshipGraph, GraphNode, GraphEdge } from '@/digital-twin/types';

/** Construye el grafo desde el snapshot. */
export function buildRelationshipGraph(snapshot: TwinSnapshot): RelationshipGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Empresas (certificadoras)
  for (const c of snapshot.companies) {
    nodes.push({
      id: c.id, type: 'company', label: c.name,
      weight: c.totalPn, riskScore: c.riskScore,
    });
  }

  // Productores
  for (const p of snapshot.producers) {
    nodes.push({
      id: p.id, type: 'producer', label: p.name,
      weight: p.totalPn, riskScore: p.riskScore,
    });
    // Edge: certificador → productor
    if (p.certificadorPreferidoId) {
      edges.push({
        source: p.certificadorPreferidoId, target: p.id,
        type: 'certifica', weight: p.totalPn,
      });
    }
  }

  // Depósitos
  for (const w of snapshot.warehouses) {
    nodes.push({
      id: w.id, type: 'warehouse', label: w.name,
      weight: w.stockPn, riskScore: w.riskScore,
    });
  }

  // Lotes → aristas producer → warehouse
  for (const l of snapshot.lots.slice(0, 500)) { // limitar para performance
    if (l.producerId && l.warehouseId) {
      edges.push({
        source: l.producerId, target: l.warehouseId,
        type: 'deposita', weight: l.pesoNeto,
      });
    }
  }

  // Clientes
  for (const c of snapshot.clients) {
    nodes.push({
      id: c.id, type: 'client', label: c.name,
      weight: c.totalPn, riskScore: c.riskScore,
    });
  }

  // Países
  for (const c of snapshot.countries) {
    nodes.push({
      id: c.id, type: 'country', label: c.name,
      weight: c.pesoNetoTotal,
    });
  }

  // Exportaciones → aristas company → country, company → client
  for (const e of snapshot.exports.slice(0, 500)) {
    if (e.companyId && e.pais) {
      edges.push({
        source: e.companyId, target: e.pais,
        type: 'exporta', weight: e.pesoNeto,
      });
    }
    if (e.companyId && e.destino) {
      const clienteNode = nodes.find(n => n.id === e.destino);
      if (!clienteNode) {
        nodes.push({
          id: e.destino, type: 'client', label: e.destino,
          weight: 0,
        });
      }
      edges.push({
        source: e.companyId, target: e.destino,
        type: 'destina', weight: e.pesoNeto,
      });
    }
  }

  return { nodes, edges };
}

// ------------------------------------------------------------
// Análisis del grafo
// ------------------------------------------------------------

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  /** Nodos con mayor grado (centralidad de grado). */
  topConnected: { id: string; label: string; type: string; degree: number; weight: number }[];
  /** Clusters detectados (componentes conectados simples). */
  clusters: { id: string; size: number; nodes: string[] }[];
}

export function analyzeGraph(graph: RelationshipGraph): GraphStats {
  // Grado por nodo
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  const topConnected = Array.from(degree.entries())
    .map(([id, deg]) => {
      const node = graph.nodes.find(n => n.id === id);
      return {
        id, label: node?.label || id, type: String(node?.type || 'unknown'),
        degree: deg, weight: node?.weight || 0,
      };
    })
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10);

  // Componentes conectados (Union-Find)
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const n of graph.nodes) find(n.id);
  for (const e of graph.edges) union(e.source, e.target);

  const clustersMap = new Map<string, string[]>();
  for (const n of graph.nodes) {
    const root = find(n.id);
    if (!clustersMap.has(root)) clustersMap.set(root, []);
    clustersMap.get(root)!.push(n.id);
  }
  const clusters = Array.from(clustersMap.entries())
    .map(([root, nodes], i) => ({ id: `cluster-${i}`, size: nodes.length, nodes }))
    .sort((a, b) => b.size - a.size);

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    topConnected,
    clusters,
  };
}

/** Filtra el grafo para mostrar solo entidades relevantes (top N por peso). */
export function filterGraph(graph: RelationshipGraph, maxNodes = 50): RelationshipGraph {
  const sortedNodes = [...graph.nodes].sort((a, b) => b.weight - a.weight).slice(0, maxNodes);
  const nodeIds = new Set(sortedNodes.map(n => n.id));
  const filteredEdges = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { nodes: sortedNodes, edges: filteredEdges };
}
