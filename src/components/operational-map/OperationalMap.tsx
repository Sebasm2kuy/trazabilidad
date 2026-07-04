'use client';

// ============================================================
// OperationalMap — Grafo visual de relaciones operacionales
// ------------------------------------------------------------
// Renderiza un grafo SVG con nodos (entidades) y aristas
// (relaciones). Layout: radial por tipo de entidad.
// ============================================================

import { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Filter, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TwinSnapshot } from '@/digital-twin/types';
import { buildRelationshipGraph, analyzeGraph, filterGraph } from '@/graph/engine';
import { useEntityDrawer } from '@/store/useEntityDrawer';

interface Props {
  snapshot: TwinSnapshot;
}

const TYPE_COLORS: Record<string, string> = {
  company: '#3b82f6',
  producer: '#f59e0b',
  certifier: '#06b6d4',
  warehouse: '#8b5cf6',
  client: '#10b981',
  country: '#ec4899',
  inventory_lot: '#64748b',
  container: '#7c3aed',
  port: '#14b8a6',
};

const TYPE_LABELS: Record<string, string> = {
  company: 'Empresa',
  producer: 'Productor',
  certifier: 'Certificador',
  warehouse: 'Depósito',
  client: 'Cliente',
  country: 'País',
  inventory_lot: 'Lote',
  container: 'Contenedor',
  port: 'Puerto',
};

const EDGE_COLORS: Record<string, string> = {
  certifica: '#06b6d4',
  produce: '#f59e0b',
  deposita: '#8b5cf6',
  exporta: '#10b981',
  pertenece: '#94a3b8',
  destina: '#ec4899',
  opera: '#3b82f6',
};

export function OperationalMap({ snapshot }: Props) {
  const [zoom, setZoom] = useState(1);
  const [filterType, setFilterType] = useState<string>('all');
  const [showLabels, setShowLabels] = useState(true);
  const openDrawer = useEntityDrawer(s => s.openDrawer);

  const fullGraph = useMemo(() => buildRelationshipGraph(snapshot), [snapshot]);
  const stats = useMemo(() => analyzeGraph(fullGraph), [fullGraph]);

  const filteredGraph = useMemo(() => {
    let g = filterType === 'all' ? fullGraph : {
      nodes: fullGraph.nodes.filter(n => n.type === filterType),
      edges: fullGraph.edges.filter(e => {
        const sn = fullGraph.nodes.find(n => n.id === e.source);
        const tn = fullGraph.nodes.find(n => n.id === e.target);
        return sn?.type === filterType || tn?.type === filterType;
      }),
    };
    return filterGraph(g, 60);
  }, [fullGraph, filterType]);

  // Layout radial por tipo
  const layout = useMemo(() => {
    const cx = 500, cy = 400;
    const types = Array.from(new Set(filteredGraph.nodes.map(n => n.type)));
    const nodesByType = new Map<string, typeof filteredGraph.nodes>();
    for (const t of types) {
      nodesByType.set(t, filteredGraph.nodes.filter(n => n.type === t));
    }
    const positions = new Map<string, { x: number; y: number }>();
    const radiusStep = 360 / Math.max(types.length, 1);

    types.forEach((type, typeIdx) => {
      const nodes = nodesByType.get(type) || [];
      const angle0 = typeIdx * radiusStep;
      const baseRadius = 250;
      nodes.forEach((node, i) => {
        const angle = (angle0 + (i / Math.max(nodes.length, 1)) * radiusStep) * Math.PI / 180;
        const r = baseRadius + (i % 3) * 40;
        positions.set(node.id, {
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        });
      });
    });

    return positions;
  }, [filteredGraph]);

  const nodeById = useMemo(() => {
    const m = new Map<string, typeof filteredGraph.nodes[number]>();
    for (const n of filteredGraph.nodes) m.set(n.id, n);
    return m;
  }, [filteredGraph]);

  const maxWeight = Math.max(...filteredGraph.nodes.map(n => n.weight), 1);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-violet-600" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Grafo Operacional
          </span>
          <Badge variant="secondary" className="text-[10px]">{stats.totalNodes} nodos</Badge>
          <Badge variant="secondary" className="text-[10px]">{stats.totalEdges} aristas</Badge>
          <Badge variant="secondary" className="text-[10px]">{stats.clusters.length} clusters</Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-slate-500" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1"
          >
            <option value="all">Todos los tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowLabels(s => !s)} className="text-xs">
          {showLabels ? 'Ocultar' : 'Mostrar'} etiquetas
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.2))}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
      </Card>

      {/* SVG Graph */}
      <Card className="p-0 overflow-hidden relative">
        <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
          <svg
            width="1000"
            height="800"
            viewBox="0 0 1000 800"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            className="bg-slate-50 dark:bg-slate-950"
          >
            {/* Edges */}
            {filteredGraph.edges.map((e, i) => {
              const s = layout.get(e.source);
              const t = layout.get(e.target);
              if (!s || !t) return null;
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={EDGE_COLORS[e.type] || '#cbd5e1'}
                  strokeWidth={Math.max(0.5, Math.log(e.weight + 1))}
                  strokeOpacity={0.4}
                />
              );
            })}

            {/* Nodes */}
            {filteredGraph.nodes.map(n => {
              const pos = layout.get(n.id);
              if (!pos) return null;
              const r = Math.max(4, Math.min(28, 4 + (n.weight / maxWeight) * 24));
              const color = TYPE_COLORS[n.type] || '#64748b';
              return (
                <g key={n.id} onClick={() => openDrawer(n.type as any, n.id)} className="cursor-pointer">
                  <circle
                    cx={pos.x} cy={pos.y} r={r}
                    fill={color}
                    fillOpacity={0.7}
                    stroke={n.riskScore && n.riskScore > 50 ? '#ef4444' : color}
                    strokeWidth={n.riskScore && n.riskScore > 50 ? 2 : 1}
                  />
                  {showLabels && r > 6 && (
                    <text
                      x={pos.x}
                      y={pos.y + r + 10}
                      textAnchor="middle"
                      fontSize={Math.max(8, Math.min(11, r / 2 + 4))}
                      fill="#475569"
                      className="pointer-events-none"
                    >
                      {n.label.length > 18 ? n.label.substring(0, 17) + '…' : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="absolute top-3 left-3 bg-white/95 dark:bg-slate-950/95 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1">
          <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Tipos</p>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-slate-600 dark:text-slate-300">{TYPE_LABELS[type] || type}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Top entidades conectadas */}
      <Card className="p-3">
        <p className="text-xs font-bold uppercase text-slate-500 mb-2">Entidades más conectadas (centralidad)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {stats.topConnected.slice(0, 10).map(n => (
            <div key={n.id} className="rounded border border-slate-200 dark:border-slate-800 p-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{n.label}</p>
              <p className="text-[10px] text-slate-500">{n.type}</p>
              <p className="text-[10px] text-violet-600 font-mono">{n.degree} conexiones</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
