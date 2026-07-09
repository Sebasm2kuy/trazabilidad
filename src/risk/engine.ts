// ============================================================
// RISK ENGINE — Evaluación de riesgos por entidad y portafolio
// ------------------------------------------------------------
// Cada factor tiene un peso y un valor 0-100. El score final
// es el promedio ponderado. El nivel se deriva del score.
// ============================================================

import type {
  TwinSnapshot, RiskAssessment, TwinEntityType, TwinId,
} from '@/digital-twin/types';

type RiskLevel = 'bajo' | 'medio' | 'alto' | 'critico';

// --- Configuración centralizada (sin números mágicos) ---

const RISK_THRESHOLDS = {
  level: { critical: 75, high: 50, medium: 25 },
  warehouse: { saturationWeight: 0.4, producerConcentrationWeight: 0.3, shareWeight: 0.3 },
  producer: { inactivityWeight: 0.4, destinationConcentrationWeight: 0.3, corteConcentrationWeight: 0.3 },
  client: { inactivityWeight: 0.5, destinationConcentrationWeight: 0.3, producerConcentrationWeight: 0.2 },
  lot: { immobilizationWeight: 0.5, noDestinationWeight: 0.3, retainedWeight: 0.2 },
  concentration: { warehouseThreshold: 60, warehouseHigh: 70, countryThreshold: 50, countryHigh: 70 },
  saturation: { warehouseThreshold: 90 },
  stockInmovilizado: { days: 90, pnAlto: 50000, pnCritico: 100000 },
  clientInactive: { countMedio: 1, countAlto: 5 },
} as const;

// --- Helpers ---

function levelFromScore(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.level.critical) return 'critico';
  if (score >= RISK_THRESHOLDS.level.high) return 'alto';
  if (score >= RISK_THRESHOLDS.level.medium) return 'medio';
  return 'bajo';
}

interface RiskFactor {
  code: string;
  label: string;
  weight: number;
  value: number;
}

/** Calcula el score ponderado de un conjunto de factores. */
function calculateWeightedScore(factors: RiskFactor[]): number {
  return factors.reduce((s, f) => s + f.value * f.weight, 0);
}

/** Construye un RiskAssessment a partir de factores y metadatos de entidad. */
function buildAssessment(
  entityType: TwinEntityType,
  entityId: TwinId,
  entityName: string,
  factors: RiskFactor[],
): RiskAssessment {
  const score = calculateWeightedScore(factors);
  return { entityType, entityId, entityName, score, level: levelFromScore(score), factors };
}

// --- Concentración helpers ---

function concentrationByCount(count: number): number {
  if (count <= 1) return 100;
  if (count <= 3) return 60;
  if (count <= 10) return 30;
  return 10;
}

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 999;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ------------------------------------------------------------
// Evaluación por tipo de entidad
// ------------------------------------------------------------

function assessWarehouse(w: TwinSnapshot['warehouses'][number]): RiskAssessment {
  const factors: RiskFactor[] = [
    {
      code: 'saturacion',
      label: 'Saturación del depósito',
      weight: RISK_THRESHOLDS.warehouse.saturationWeight,
      value: Math.min(100, w.utilizacion),
    },
    {
      code: 'concentracion_productores',
      label: 'Concentración de productores',
      weight: RISK_THRESHOLDS.warehouse.producerConcentrationWeight,
      value: concentrationByCount(w.productores),
    },
    {
      code: 'share_alto',
      label: 'Dependencia (share alto)',
      weight: RISK_THRESHOLDS.warehouse.shareWeight,
      value: w.marketShare > 50 ? 100 : w.marketShare > 30 ? 60 : w.marketShare > 10 ? 30 : 10,
    },
  ];
  return buildAssessment('warehouse', w.id, w.name, factors);
}

function assessProducer(p: TwinSnapshot['producers'][number]): RiskAssessment {
  const diasInactivo = daysSince(p.ultimaActividad);
  const factors: RiskFactor[] = [
    {
      code: 'inactividad',
      label: 'Días sin actividad',
      weight: RISK_THRESHOLDS.producer.inactivityWeight,
      value: Math.min(100, diasInactivo / 3),
    },
    {
      code: 'concentracion_destinos',
      label: 'Concentración de destinos',
      weight: RISK_THRESHOLDS.producer.destinationConcentrationWeight,
      value: concentrationByCount(p.paises.length),
    },
    {
      code: 'concentracion_cortes',
      label: 'Concentración de cortes',
      weight: RISK_THRESHOLDS.producer.corteConcentrationWeight,
      value: concentrationByCount(p.cortes.length),
    },
  ];
  return buildAssessment('producer', p.id, p.name, factors);
}

function assessClient(c: TwinSnapshot['clients'][number]): RiskAssessment {
  const diasInactivo = daysSince(c.ultimaActividad);
  const factors: RiskFactor[] = [
    {
      code: 'inactividad',
      label: 'Días sin compra',
      weight: RISK_THRESHOLDS.client.inactivityWeight,
      value: Math.min(100, diasInactivo / 3),
    },
    {
      code: 'concentracion_destinos',
      label: 'Concentración de destinos',
      weight: RISK_THRESHOLDS.client.destinationConcentrationWeight,
      value: concentrationByCount(c.paises.length),
    },
    {
      code: 'concentracion_productores',
      label: 'Dependencia de un productor',
      weight: RISK_THRESHOLDS.client.producerConcentrationWeight,
      value: concentrationByCount(c.productores.length),
    },
  ];
  return buildAssessment('client', c.id, c.name, factors);
}

function assessLot(l: TwinSnapshot['lots'][number]): RiskAssessment {
  const factors: RiskFactor[] = [
    {
      code: 'inmovilizado',
      label: 'Días sin movimiento',
      weight: RISK_THRESHOLDS.lot.immobilizationWeight,
      value: Math.min(100, l.diasSinMovimiento / 2),
    },
    {
      code: 'sin_destino',
      label: 'Sin destino/exportación',
      weight: RISK_THRESHOLDS.lot.noDestinationWeight,
      value: (!l.tieneExportacion && !l.estado.includes('exportado')) ? 80 : 20,
    },
    {
      code: 'retenido',
      label: 'Mercadería retenida',
      weight: RISK_THRESHOLDS.lot.retainedWeight,
      value: l.estado === 'retenido' ? 100 : 0,
    },
  ];
  return buildAssessment('inventory_lot', l.id, l.cote || l.id, factors);
}

// ------------------------------------------------------------
// Evaluación de portafolio
// ------------------------------------------------------------

export function assessAllRisks(snapshot: TwinSnapshot): RiskAssessment[] {
  const all: RiskAssessment[] = [];
  for (const w of snapshot.warehouses) all.push(assessWarehouse(w));
  for (const p of snapshot.producers) all.push(assessProducer(p));
  for (const c of snapshot.clients) all.push(assessClient(c));
  for (const l of snapshot.lots.slice(0, 200)) all.push(assessLot(l));
  return all.sort((a, b) => b.score - a.score);
}

export function portfolioRiskScore(assessments: RiskAssessment[]): number {
  if (assessments.length === 0) return 0;
  return assessments.reduce((s, a) => s + a.score, 0) / assessments.length;
}

export function topRisks(assessments: RiskAssessment[], n = 10): RiskAssessment[] {
  return assessments.slice(0, n);
}

export function riskLevelDistribution(assessments: RiskAssessment[]): Record<RiskLevel, number> {
  const dist: Record<RiskLevel, number> = { critico: 0, alto: 0, medio: 0, bajo: 0 };
  for (const a of assessments) dist[a.level]++;
  return dist;
}

// ------------------------------------------------------------
// Riesgos específicos del sistema
// ------------------------------------------------------------

export interface SystemRisk {
  id: string;
  category: 'deposito_saturado' | 'cliente_inactivo' | 'stock_inmovilizado'
          | 'documentacion_pendiente' | 'operacion_sospechosa' | 'mercaderia_retenida'
          | 'concentracion_stock' | 'dependencia_cliente' | 'dependencia_pais';
  description: string;
  severity: RiskLevel;
  affectedEntities: { type: TwinEntityType; id: TwinId; name: string }[];
  metric: number;
}

/** Encuentra el elemento con mayor valor de una clave sin mutar el array original. O(n). */
function findMaxBy<T>(arr: readonly T[], valueFn: (item: T) => number): T | null {
  if (arr.length === 0) return null;
  let maxIdx = 0;
  let maxVal = valueFn(arr[0]);
  for (let i = 1; i < arr.length; i++) {
    const v = valueFn(arr[i]);
    if (v > maxVal) { maxVal = v; maxIdx = i; }
  }
  return arr[maxIdx];
}

export function detectSystemRisks(snapshot: TwinSnapshot): SystemRisk[] {
  const risks: SystemRisk[] = [];
  const T = RISK_THRESHOLDS;

  // 1. Depósitos saturados
  const sat = snapshot.warehouses.filter(w => w.utilizacion > T.saturation.warehouseThreshold);
  if (sat.length > 0) {
    risks.push({
      id: 'risk-depositos-saturados',
      category: 'deposito_saturado',
      description: `${sat.length} depósito(s) sobre ${T.saturation.warehouseThreshold}% de capacidad. Riesgo operativo y de saturación.`,
      severity: sat.length > 3 ? 'critico' : 'alto',
      affectedEntities: sat.map(w => ({ type: 'warehouse' as const, id: w.id, name: w.name })),
      metric: sat.length,
    });
  }

  // 2. Clientes inactivos
  const inactClients = snapshot.clients.filter(c => !c.activo);
  if (inactClients.length > 0) {
    risks.push({
      id: 'risk-clientes-inactivos',
      category: 'cliente_inactivo',
      description: `${inactClients.length} cliente(s) sin actividad en 90 días. Posible churn comercial.`,
      severity: inactClients.length > T.clientInactive.countAlto ? 'alto' : 'medio',
      affectedEntities: inactClients.map(c => ({ type: 'client' as const, id: c.id, name: c.name })),
      metric: inactClients.length,
    });
  }

  // 3. Stock inmovilizado
  const inmovilizado = snapshot.lots.filter(l => l.diasSinMovimiento > T.stockInmovilizado.days);
  if (inmovilizado.length > 0) {
    const pn = inmovilizado.reduce((s, l) => s + l.pesoNeto, 0);
    risks.push({
      id: 'risk-stock-inmovilizado',
      category: 'stock_inmovilizado',
      description: `${inmovilizado.length} lote(s) sin movimiento por más de ${T.stockInmovilizado.days} días. ${pn.toLocaleString('es-UY')} kg inmovilizados.`,
      severity: pn > T.stockInmovilizado.pnCritico ? 'critico' : pn > T.stockInmovilizado.pnAlto ? 'alto' : 'medio',
      affectedEntities: inmovilizado.slice(0, 20).map(l => ({ type: 'inventory_lot' as const, id: l.id, name: l.cote })),
      metric: pn,
    });
  }

  // 4. Mercadería retenida
  const retenidos = snapshot.lots.filter(l => l.estado === 'retenido');
  if (retenidos.length > 0) {
    risks.push({
      id: 'risk-mercaderia-retenida',
      category: 'mercaderia_retenida',
      description: `${retenidos.length} lote(s) retenido(s). Requiere intervención.`,
      severity: 'critico',
      affectedEntities: retenidos.map(l => ({ type: 'inventory_lot' as const, id: l.id, name: l.cote })),
      metric: retenidos.length,
    });
  }

  // 5. Concentración en depósitos — BUG FIX: usar findMaxBy en lugar de [0]
  if (snapshot.warehouses.length > 0) {
    const totalPn = snapshot.warehouses.reduce((s, w) => s + w.stockPn, 0);
    const top = findMaxBy(snapshot.warehouses, w => w.stockPn);
    if (top) {
      const share = totalPn > 0 ? (top.stockPn / totalPn) * 100 : 0;
      if (share > T.concentration.warehouseThreshold) {
        risks.push({
          id: 'risk-concentracion-deposito',
          category: 'concentracion_stock',
          description: `${top.name} concentra el ${share.toFixed(1)}% del stock. Riesgo de dependencia.`,
          severity: share > T.concentration.warehouseHigh ? 'alto' : 'medio',
          affectedEntities: [{ type: 'warehouse' as const, id: top.id, name: top.name }],
          metric: share,
        });
      }
    }
  }

  // 6. Dependencia de un país
  if (snapshot.countries.length > 0) {
    const totalExp = snapshot.countries.reduce((s, c) => s + c.pesoNetoTotal, 0);
    const top = findMaxBy(snapshot.countries, c => c.pesoNetoTotal);
    if (top) {
      const share = totalExp > 0 ? (top.pesoNetoTotal / totalExp) * 100 : 0;
      if (share > T.concentration.countryThreshold) {
        risks.push({
          id: 'risk-dependencia-pais',
          category: 'dependencia_pais',
          description: `${top.name} concentra el ${share.toFixed(1)}% de las exportaciones. Riesgo geográfico.`,
          severity: share > T.concentration.countryHigh ? 'alto' : 'medio',
          affectedEntities: [{ type: 'country' as const, id: top.id, name: top.name }],
          metric: share,
        });
      }
    }
  }

  return risks;
}
