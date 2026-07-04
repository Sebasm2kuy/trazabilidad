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

function levelFromScore(score: number): RiskLevel {
  if (score >= 75) return 'critico';
  if (score >= 50) return 'alto';
  if (score >= 25) return 'medio';
  return 'bajo';
}

interface RiskFactor {
  code: string;
  label: string;
  weight: number; // 0-1
  value: number;  // 0-100
}

// ------------------------------------------------------------
// Evaluación por tipo de entidad
// ------------------------------------------------------------

function assessWarehouse(w: TwinSnapshot['warehouses'][number]): RiskAssessment {
  const factors: RiskFactor[] = [];
  // Saturación
  factors.push({
    code: 'saturacion',
    label: 'Saturación del depósito',
    weight: 0.4,
    value: Math.min(100, w.utilizacion),
  });
  // Concentración de productores
  const prodConcentration = w.productores === 1 ? 100 : w.productores <= 3 ? 60 : w.productores <= 10 ? 30 : 10;
  factors.push({
    code: 'concentracion_productores',
    label: 'Concentración de productores',
    weight: 0.3,
    value: prodConcentration,
  });
  // Share alto
  factors.push({
    code: 'share_alto',
    label: 'Dependencia (share alto)',
    weight: 0.3,
    value: w.marketShare > 50 ? 100 : w.marketShare > 30 ? 60 : w.marketShare > 10 ? 30 : 10,
  });
  const score = factors.reduce((s, f) => s + f.value * f.weight, 0);
  return {
    entityType: 'warehouse',
    entityId: w.id,
    entityName: w.name,
    score,
    level: levelFromScore(score),
    factors,
  };
}

function assessProducer(p: TwinSnapshot['producers'][number]): RiskAssessment {
  const factors: RiskFactor[] = [];
  // Inactividad
  const diasInactivo = p.ultimaActividad
    ? Math.floor((Date.now() - new Date(p.ultimaActividad).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  factors.push({
    code: 'inactividad',
    label: 'Días sin actividad',
    weight: 0.4,
    value: Math.min(100, diasInactivo / 3),
  });
  // Concentración de destinos
  const destConcentration = p.paises.length <= 1 ? 100 : p.paises.length <= 3 ? 60 : 30;
  factors.push({
    code: 'concentracion_destinos',
    label: 'Concentración de destinos',
    weight: 0.3,
    value: destConcentration,
  });
  // Concentración de cortes
  const cortesConcentration = p.cortes.length <= 1 ? 100 : p.cortes.length <= 3 ? 60 : 30;
  factors.push({
    code: 'concentracion_cortes',
    label: 'Concentración de cortes',
    weight: 0.3,
    value: cortesConcentration,
  });
  const score = factors.reduce((s, f) => s + f.value * f.weight, 0);
  return {
    entityType: 'producer',
    entityId: p.id,
    entityName: p.name,
    score,
    level: levelFromScore(score),
    factors,
  };
}

function assessClient(c: TwinSnapshot['clients'][number]): RiskAssessment {
  const factors: RiskFactor[] = [];
  // Inactividad
  const diasInactivo = c.ultimaActividad
    ? Math.floor((Date.now() - new Date(c.ultimaActividad).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  factors.push({
    code: 'inactividad',
    label: 'Días sin compra',
    weight: 0.5,
    value: Math.min(100, diasInactivo / 3),
  });
  // Diversificación de destinos
  const destConcentration = c.paises.length <= 1 ? 100 : c.paises.length <= 3 ? 60 : 30;
  factors.push({
    code: 'concentracion_destinos',
    label: 'Concentración de destinos',
    weight: 0.3,
    value: destConcentration,
  });
  // Diversificación de productores
  const prodConcentration = c.productores.length <= 1 ? 100 : c.productores.length <= 3 ? 60 : 30;
  factors.push({
    code: 'concentracion_productores',
    label: 'Dependencia de un productor',
    weight: 0.2,
    value: prodConcentration,
  });
  const score = factors.reduce((s, f) => s + f.value * f.weight, 0);
  return {
    entityType: 'client',
    entityId: c.id,
    entityName: c.name,
    score,
    level: levelFromScore(score),
    factors,
  };
}

function assessLot(l: TwinSnapshot['lots'][number]): RiskAssessment {
  const factors: RiskFactor[] = [];
  // Inmovilización
  factors.push({
    code: 'inmovilizado',
    label: 'Días sin movimiento',
    weight: 0.5,
    value: Math.min(100, l.diasSinMovimiento / 2),
  });
  // Sin destino
  factors.push({
    code: 'sin_destino',
    label: 'Sin destino/exportación',
    weight: 0.3,
    value: (!l.tieneExportacion && !l.estado.includes('exportado')) ? 80 : 20,
  });
  // Retenido
  factors.push({
    code: 'retenido',
    label: 'Mercadería retenida',
    weight: 0.2,
    value: l.estado === 'retenido' ? 100 : 0,
  });
  const score = factors.reduce((s, f) => s + f.value * f.weight, 0);
  return {
    entityType: 'inventory_lot',
    entityId: l.id,
    entityName: l.cote || l.id,
    score,
    level: levelFromScore(score),
    factors,
  };
}

// ------------------------------------------------------------
// Evaluación de portafolio
// ------------------------------------------------------------

export function assessAllRisks(snapshot: TwinSnapshot): RiskAssessment[] {
  const all: RiskAssessment[] = [];
  for (const w of snapshot.warehouses) all.push(assessWarehouse(w));
  for (const p of snapshot.producers) all.push(assessProducer(p));
  for (const c of snapshot.clients) all.push(assessClient(c));
  for (const l of snapshot.lots.slice(0, 200)) all.push(assessLot(l)); // limitar
  return all.sort((a, b) => b.score - a.score);
}

/** Calcula el risk score promedio del portafolio. */
export function portfolioRiskScore(assessments: RiskAssessment[]): number {
  if (assessments.length === 0) return 0;
  return assessments.reduce((s, a) => s + a.score, 0) / assessments.length;
}

/** Top N entidades más riesgosas. */
export function topRisks(assessments: RiskAssessment[], n = 10): RiskAssessment[] {
  return assessments.slice(0, n);
}

/** Distribución por nivel de riesgo. */
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

export function detectSystemRisks(snapshot: TwinSnapshot): SystemRisk[] {
  const risks: SystemRisk[] = [];

  // 1. Depósitos saturados
  const sat = snapshot.warehouses.filter(w => w.utilizacion > 90);
  if (sat.length > 0) {
    risks.push({
      id: 'risk-depositos-saturados',
      category: 'deposito_saturado',
      description: `${sat.length} depósito(s) sobre 90% de capacidad. Riesgo operativo y de saturación.`,
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
      severity: inactClients.length > 5 ? 'alto' : 'medio',
      affectedEntities: inactClients.map(c => ({ type: 'client' as const, id: c.id, name: c.name })),
      metric: inactClients.length,
    });
  }

  // 3. Stock inmovilizado
  const inmovilizado = snapshot.lots.filter(l => l.diasSinMovimiento > 90);
  if (inmovilizado.length > 0) {
    const pn = inmovilizado.reduce((s, l) => s + l.pesoNeto, 0);
    risks.push({
      id: 'risk-stock-inmovilizado',
      category: 'stock_inmovilizado',
      description: `${inmovilizado.length} lote(s) sin movimiento por más de 90 días. ${pn.toLocaleString('es-UY')} kg inmovilizados.`,
      severity: pn > 100000 ? 'critico' : pn > 50000 ? 'alto' : 'medio',
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

  // 5. Concentración en depósitos
  if (snapshot.warehouses.length > 0) {
    const totalPn = snapshot.warehouses.reduce((s, w) => s + w.stockPn, 0);
    const top = snapshot.warehouses[0];
    const share = totalPn > 0 ? (top.stockPn / totalPn) * 100 : 0;
    if (share > 60) {
      risks.push({
        id: 'risk-concentracion-deposito',
        category: 'concentracion_stock',
        description: `${top.name} concentra el ${share.toFixed(1)}% del stock. Riesgo de dependencia.`,
        severity: share > 70 ? 'alto' : 'medio',
        affectedEntities: [{ type: 'warehouse' as const, id: top.id, name: top.name }],
        metric: share,
      });
    }
  }

  // 6. Dependencia de un país
  if (snapshot.countries.length > 0) {
    const totalExp = snapshot.countries.reduce((s, c) => s + c.pesoNetoTotal, 0);
    const top = [...snapshot.countries].sort((a, b) => b.pesoNetoTotal - a.pesoNetoTotal)[0];
    const share = totalExp > 0 ? (top.pesoNetoTotal / totalExp) * 100 : 0;
    if (share > 50) {
      risks.push({
        id: 'risk-dependencia-pais',
        category: 'dependencia_pais',
        description: `${top.name} concentra el ${share.toFixed(1)}% de las exportaciones. Riesgo geográfico.`,
        severity: share > 70 ? 'alto' : 'medio',
        affectedEntities: [{ type: 'country' as const, id: top.id, name: top.name }],
        metric: share,
      });
    }
  }

  return risks;
}
