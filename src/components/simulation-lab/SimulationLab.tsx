'use client';

// ============================================================
// SimulationLab — Laboratorio de escenarios hipotéticos
// ------------------------------------------------------------
// Permite crear escenarios (mover stock, exportar X kg, cerrar
// depósito, agregar cliente) y ver el impacto sin tocar datos
// reales.
// ============================================================

import { useMemo, useState } from 'react';
import {
  FlaskConical, Play, Save, Trash2, Plus, ArrowRight,
  TrendingUp, AlertTriangle, Shield, Boxes,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TwinSnapshot, BusinessEvent, Scenario } from '@/digital-twin/types';
import type { SimulationImpact } from '@/simulation/engine';
import {
  runSimulation, simulateMoveStock, simulateExport, simulateCloseWarehouse,
  simulateNewClient, createScenario, saveScenario, listScenarios, deleteScenario,
} from '@/simulation/engine';

interface Props {
  snapshot: TwinSnapshot;
}

type ActionKind = 'move_stock' | 'export' | 'close_warehouse' | 'new_client';

export function SimulationLab({ snapshot }: Props) {
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [scenarioName, setScenarioName] = useState('Escenario experimental');
  const [scenarioCategory, setScenarioCategory] = useState<Scenario['category']>('custom');
  const [impact, setImpact] = useState<{ snapshot: TwinSnapshot; impact: SimulationImpact } | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([]);
  const [actionKind, setActionKind] = useState<ActionKind>('export');

  // Form state
  const [moveFrom, setMoveFrom] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [movePeso, setMovePeso] = useState(10000);
  const [expPais, setExpPais] = useState('Brasil');
  const [expPeso, setExpPeso] = useState(500000);
  const [closeId, setCloseId] = useState('');
  const [closeTarget, setCloseTarget] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPais, setNewClientPais] = useState('Brasil');
  const [newClientPeso, setNewClientPeso] = useState(200000);

  // Cargar escenarios guardados
  useMemo(() => {
    setSavedScenarios(listScenarios());
  }, []);

  const scenarioId = useMemo(() => `sim-${Date.now()}`, [scenarioName]);

  function addAction() {
    let newEvents: BusinessEvent[] = [];
    switch (actionKind) {
      case 'move_stock':
        if (!moveFrom || !moveTo) return;
        newEvents = simulateMoveStock({ scenarioId, fromWarehouseId: moveFrom, toWarehouseId: moveTo, pesoNeto: movePeso });
        break;
      case 'export':
        if (!expPais) return;
        newEvents = simulateExport({ scenarioId, pais: expPais, pesoNeto: expPeso });
        break;
      case 'close_warehouse':
        if (!closeId || !closeTarget) return;
        newEvents = simulateCloseWarehouse({ scenarioId, warehouseId: closeId, targetWarehouseId: closeTarget });
        break;
      case 'new_client':
        if (!newClientName) return;
        newEvents = simulateNewClient({ scenarioId, clientName: newClientName, pais: newClientPais, pesoNeto: newClientPeso });
        break;
    }
    setEvents(prev => [...prev, ...newEvents]);
  }

  function runSim() {
    const result = runSimulation(snapshot, events);
    setImpact(result);
  }

  function saveCurrentScenario() {
    const scn = createScenario({
      name: scenarioName,
      description: `${events.length} eventos simulados`,
      category: scenarioCategory,
      baseSnapshotId: snapshot.generatedAt,
    });
    saveScenario(scn);
    setSavedScenarios(listScenarios());
  }

  function reset() {
    setEvents([]);
    setImpact(null);
  }

  function removeEvent(idx: number) {
    setEvents(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-violet-200 dark:border-violet-900">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-violet-600" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Laboratorio de Simulación</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Crea escenarios hipotéticos sin modificar datos reales. Aplica eventos virtuales y observa el impacto.
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px]">{events.length} eventos</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Constructor de acciones */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acción a simular</h3>
            <div className="flex gap-1">
              {(['export', 'move_stock', 'close_warehouse', 'new_client'] as ActionKind[]).map(k => (
                <Button
                  key={k}
                  variant={actionKind === k ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActionKind(k)}
                  className="text-[10px] h-7"
                >
                  {k === 'export' ? 'Exportar' : k === 'move_stock' ? 'Mover' : k === 'close_warehouse' ? 'Cerrar dep.' : 'Nuevo cliente'}
                </Button>
              ))}
            </div>
          </div>

          {actionKind === 'export' && (
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">País destino</Label>
                <Input value={expPais} onChange={e => setExpPais(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">Peso neto (kg)</Label>
                <Input type="number" value={expPeso} onChange={e => setExpPeso(Number(e.target.value))} className="h-8 text-xs" />
                <p className="text-[10px] text-slate-500 mt-1">{(expPeso / 1000).toFixed(1)} toneladas</p>
              </div>
            </div>
          )}

          {actionKind === 'move_stock' && (
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">Depósito origen</Label>
                <select value={moveFrom} onChange={e => setMoveFrom(e.target.value)} className="w-full h-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2">
                  <option value="">— Seleccionar —</option>
                  {snapshot.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Depósito destino</Label>
                <select value={moveTo} onChange={e => setMoveTo(e.target.value)} className="w-full h-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2">
                  <option value="">— Seleccionar —</option>
                  {snapshot.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Peso a mover (kg)</Label>
                <Input type="number" value={movePeso} onChange={e => setMovePeso(Number(e.target.value))} className="h-8 text-xs" />
              </div>
            </div>
          )}

          {actionKind === 'close_warehouse' && (
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">Depósito a cerrar</Label>
                <select value={closeId} onChange={e => setCloseId(e.target.value)} className="w-full h-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2">
                  <option value="">— Seleccionar —</option>
                  {snapshot.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Mover stock hacia</Label>
                <select value={closeTarget} onChange={e => setCloseTarget(e.target.value)} className="w-full h-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2">
                  <option value="">— Seleccionar —</option>
                  {snapshot.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {actionKind === 'new_client' && (
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">Nombre del cliente</Label>
                <Input value={newClientName} onChange={e => setNewClientName(e.target.value)} className="h-8 text-xs" placeholder="Ej: Nuevo Distribuidor SA" />
              </div>
              <div>
                <Label className="text-[11px]">País</Label>
                <Input value={newClientPais} onChange={e => setNewClientPais(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">Volumen proyectado (kg)</Label>
                <Input type="number" value={newClientPeso} onChange={e => setNewClientPeso(Number(e.target.value))} className="h-8 text-xs" />
              </div>
            </div>
          )}

          <Button onClick={addAction} size="sm" className="w-full">
            <Plus className="w-3 h-3 mr-1" /> Agregar acción al escenario
          </Button>
        </Card>

        {/* Eventos del escenario actual */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Eventos del Escenario</h3>
            <div className="flex gap-1">
              <Button onClick={runSim} size="sm" className="bg-violet-600 hover:bg-violet-700">
                <Play className="w-3 h-3 mr-1" /> Ejecutar
              </Button>
              <Button onClick={saveCurrentScenario} size="sm" variant="outline">
                <Save className="w-3 h-3 mr-1" /> Guardar
              </Button>
              <Button onClick={reset} size="sm" variant="ghost">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-[11px]">Nombre del escenario</Label>
            <Input value={scenarioName} onChange={e => setScenarioName(e.target.value)} className="h-8 text-xs" />
          </div>

          <div>
            <Label className="text-[11px]">Categoría</Label>
            <select value={scenarioCategory} onChange={e => setScenarioCategory(e.target.value as Scenario['category'])} className="w-full h-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2">
              <option value="optimista">Optimista</option>
              <option value="conservador">Conservador</option>
              <option value="crisis">Crisis</option>
              <option value="exportacion">Exportación</option>
              <option value="mercado_interno">Mercado Interno</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-center text-slate-500 py-6">Sin eventos. Agrega acciones para construir el escenario.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {events.map((e, i) => (
                <div key={i} className="flex items-start gap-2 rounded border border-slate-200 dark:border-slate-800 p-2 text-xs">
                  <Badge variant="secondary" className="text-[9px]">{e.type.replace(/_/g, ' ')}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 dark:text-slate-200 truncate">
                      {Object.entries(e.payload).slice(0, 3).map(([k, v]) => `${k}=${String(v)}`).join(' • ')}
                    </p>
                  </div>
                  <button onClick={() => removeEvent(i)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Resultado */}
      {impact && (() => {
        const i = impact.impact;
        return (
        <Card className="p-4 space-y-3 border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Impacto del Escenario</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ImpactMetric
              label="Stock"
              before={i.stockBefore}
              after={i.stockAfter}
              unit="kg"
              icon={Boxes}
            />
            <ImpactMetric
              label="Exportaciones"
              before={i.exportsBefore}
              after={i.exportsAfter}
              unit="kg"
              icon={TrendingUp}
            />
            <ImpactMetric
              label="Depósitos saturados"
              before={i.saturatedBefore}
              after={i.saturatedAfter}
              unit=""
              icon={AlertTriangle}
              invertGood
            />
            <ImpactMetric
              label="Alertas"
              before={i.alertsBefore}
              after={i.alertsAfter}
              unit=""
              icon={AlertTriangle}
              invertGood
            />
            <ImpactMetric
              label="Risk score"
              before={i.riskBefore}
              after={i.riskAfter}
              unit=""
              icon={Shield}
              invertGood
            />
          </div>

          {i.summary.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Resumen del impacto</p>
              <ul className="space-y-1">
                {i.summary.map((s, idx) => (
                  <li key={idx} className="text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 text-violet-500" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        );
      })()}

      {/* Escenarios guardados */}
      {savedScenarios.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Escenarios Guardados</h3>
          <div className="space-y-1">
            {savedScenarios.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-xs p-2 rounded border border-slate-200 dark:border-slate-800">
                <Badge variant="outline" className="text-[9px]">{s.category}</Badge>
                <span className="font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                <span className="text-slate-500 flex-1 truncate">{s.description}</span>
                <button onClick={() => { deleteScenario(s.id); setSavedScenarios(listScenarios()); }} className="text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ImpactMetric({ label, before, after, unit, icon: Icon, invertGood }: {
  label: string; before: number; after: number; unit: string; icon: LucideIcon; invertGood?: boolean;
}) {
  const delta = after - before;
  const pctChange = before === 0 ? 0 : (delta / before) * 100;
  const good = invertGood ? delta < 0 : delta > 0;
  const bad = invertGood ? delta > 0 : delta < 0;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-slate-500" />
        <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
      </div>
      <p className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">
        {after.toLocaleString('es-UY', { maximumFractionDigits: 0 })} {unit}
      </p>
      <p className={cn(
        'text-[10px] font-medium',
        delta === 0 ? 'text-slate-400' : good ? 'text-emerald-600' : bad ? 'text-red-600' : 'text-slate-400',
      )}>
        {delta > 0 ? '+' : ''}{delta.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
        {before > 0 && ` (${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%)`}
      </p>
    </div>
  );
}
