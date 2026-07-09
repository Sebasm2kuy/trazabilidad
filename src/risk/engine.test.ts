// ============================================================
// RISK ENGINE — Tests unitarios
// ------------------------------------------------------------
// Cubren:
//   1. Bug fix de findMaxBy (concentración de depósitos)
//   2. Casos borde: array vacío, empate, snapshot mínimo
//   3. Calculadoras públicas: assessAllRisks, portfolioRiskScore,
//      topRisks, riskLevelDistribution, detectSystemRisks
//   4. Inmutabilidad del snapshot de entrada
// ============================================================

/// <reference types="bun-types" />
import { describe, test, expect } from 'bun:test';
import {
  assessAllRisks,
  portfolioRiskScore,
  topRisks,
  riskLevelDistribution,
  detectSystemRisks,
} from './engine';
import type {
  TwinSnapshot, Warehouse, Country, Producer, Client, InventoryLot,
  RiskAssessment,
} from '@/digital-twin/types';

// ------------------------------------------------------------
// Builders — factories mínimas para no repetir boilerplate
// ------------------------------------------------------------

function buildWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'wh-1',
    name: 'Depósito A',
    totalPn: 0,
    embarques: 0,
    productores: 1,
    marketShare: 0,
    stockPn: 0,
    stockPallets: 0,
    capacidadKg: null,
    utilizacion: 0,
    productoresList: [],
    riskScore: 0,
    ...overrides,
  };
}

function buildCountry(overrides: Partial<Country> = {}): Country {
  return {
    id: 'co-1',
    name: 'China',
    embarques: 0,
    pesoNetoTotal: 0,
    empresas: [],
    productores: [],
    ...overrides,
  };
}

function buildProducer(overrides: Partial<Producer> = {}): Producer {
  return {
    id: 'pr-1',
    name: 'Productor A',
    certificadorPreferidoId: null,
    depositoPreferidoId: null,
    totalPn: 0,
    embarques: 0,
    paises: ['China'],
    cortes: ['HP'],
    ultimaActividad: null,
    activo: true,
    riskScore: 0,
    ...overrides,
  };
}

function buildClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'cl-1',
    name: 'Cliente A',
    totalPn: 0,
    embarques: 0,
    paises: ['China'],
    productores: ['pr-1'],
    ultimaActividad: null,
    activo: true,
    riskScore: 0,
    ...overrides,
  };
}

function buildLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    id: 'lot-1',
    cote: 'COTE-001',
    companyId: 'co-1',
    producerId: 'pr-1',
    warehouseId: 'wh-1',
    corte: 'HP',
    producto: 'Cuarto',
    pesoNeto: 0,
    envases: 0,
    pallets: 0,
    estado: 'en_stock',
    fechaIngreso: null,
    ultimaActividad: null,
    diasSinMovimiento: 0,
    tieneExportacion: false,
    timeline: [],
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<TwinSnapshot> = {}): TwinSnapshot {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    lots: [],
    movements: [],
    companies: [],
    producers: [],
    certifiers: [],
    warehouses: [],
    clients: [],
    exports: [],
    containers: [],
    ports: [],
    countries: [],
    documents: [],
    inspections: [],
    timeline: [],
    risks: [],
    recommendations: [],
    kpis: {
      totalStockPn: 0,
      totalExportacionesPn: 0,
      totalDepositosPn: 0,
      productoresActivos: 0,
      clientesActivos: 0,
      alertasCriticas: 0,
      riskScorePromedio: 0,
      utilizacionPromedioDepositos: 0,
    },
    ...overrides,
  };
}

// ------------------------------------------------------------
// 1. Bug fix: findMaxBy (concentración de depósitos)
// ------------------------------------------------------------

describe('detectSystemRisks — bug fix concentración de depósitos', () => {
  test('reporta el depósito con mayor stockPn aunque NO sea el primero del array', () => {
    // ANTES del fix: warehouses[0] siempre ganaba sin importar el stockPn real.
    // Si snapshot.warehouses venía desordenado, el alerta apuntaba al depósito
    // equivocado. Este test garantiza que findMaxBy resuelve el problema.
    const snapshot = buildSnapshot({
      warehouses: [
        buildWarehouse({ id: 'wh-A', name: 'Depósito A', stockPn: 100 }),   // primero, pero chico
        buildWarehouse({ id: 'wh-B', name: 'Depósito B', stockPn: 1500 }),  // tercero, pero el mayor
        buildWarehouse({ id: 'wh-C', name: 'Depósito C', stockPn: 400 }),
      ],
    });

    const risks = detectSystemRisks(snapshot);
    const concentracion = risks.find(r => r.id === 'risk-concentracion-deposito');

    expect(concentracion).toBeDefined();
    // 1500 / (100+1500+400) = 75% → supera el umbral de 60%
    expect(concentracion!.affectedEntities[0].id).toBe('wh-B');
    expect(concentracion!.affectedEntities[0].name).toBe('Depósito B');
    expect(concentracion!.metric).toBeCloseTo(75, 0);
    // 75 > 70 → severity 'alto'
    expect(concentracion!.severity).toBe('alto');
  });

  test('no reporta concentración cuando el depósito mayor está por debajo del umbral', () => {
    const snapshot = buildSnapshot({
      warehouses: [
        buildWarehouse({ id: 'wh-A', stockPn: 300 }),
        buildWarehouse({ id: 'wh-B', stockPn: 350 }),
        buildWarehouse({ id: 'wh-C', stockPn: 350 }),
      ],
    });
    // total = 1000, top = 350 → 35% < 60% → no debe generarse
    const risks = detectSystemRisks(snapshot);
    expect(risks.find(r => r.id === 'risk-concentracion-deposito')).toBeUndefined();
  });

  test('maneja snapshot sin warehouses sin lanzar excepción', () => {
    const snapshot = buildSnapshot({ warehouses: [] });
    expect(() => detectSystemRisks(snapshot)).not.toThrow();
    const risks = detectSystemRisks(snapshot);
    expect(risks.find(r => r.id === 'risk-concentracion-deposito')).toBeUndefined();
  });

  test('maneja warehouses con stockPn = 0 sin división por cero', () => {
    const snapshot = buildSnapshot({
      warehouses: [
        buildWarehouse({ id: 'wh-A', stockPn: 0 }),
        buildWarehouse({ id: 'wh-B', stockPn: 0 }),
      ],
    });
    expect(() => detectSystemRisks(snapshot)).not.toThrow();
    const risks = detectSystemRisks(snapshot);
    // totalPn = 0 → share = 0 → no supera umbral
    expect(risks.find(r => r.id === 'risk-concentracion-deposito')).toBeUndefined();
  });

  test('no genera falso positivo cuando varios depósitos empatan en el máximo y ninguno supera el umbral', () => {
    // Caso teórico: con 2+ depósitos empatados en el máximo, su share individual
    // no puede superar el 50%, por lo que jamás cruzan el umbral de 60%.
    // findMaxBy es determinístico (devuelve el primero), pero el resultado
    // observable es "no se reporta" porque el share es < umbral.
    // Esto cubre el edge case mencionado en el análisis de riesgos #2.
    const snapshot = buildSnapshot({
      warehouses: [
        buildWarehouse({ id: 'wh-A', stockPn: 1000 }),
        buildWarehouse({ id: 'wh-B', stockPn: 1000 }),
        buildWarehouse({ id: 'wh-C', stockPn: 1000 }),
      ],
    });
    const risks = detectSystemRisks(snapshot);
    // 1000 / 3000 = 33.3% < 60% → no se reporta concentración
    expect(risks.find(r => r.id === 'risk-concentracion-deposito')).toBeUndefined();
  });

  test('cuando el primer elemento del array YA es el máximo, lo reporta correctamente', () => {
    // Verifica que findMaxBy no se "salta" el primer elemento por accidente.
    // Antes del fix, warehouses[0] siempre ganaba; este test garantiza que
    // el fix también funciona cuando warehouses[0] legítimamente es el top.
    const snapshot = buildSnapshot({
      warehouses: [
        buildWarehouse({ id: 'wh-A', name: 'Depósito A', stockPn: 1500 }),
        buildWarehouse({ id: 'wh-B', name: 'Depósito B', stockPn: 400 }),
        buildWarehouse({ id: 'wh-C', name: 'Depósito C', stockPn: 100 }),
      ],
    });
    const risks = detectSystemRisks(snapshot);
    const concentracion = risks.find(r => r.id === 'risk-concentracion-deposito');
    expect(concentracion).toBeDefined();
    expect(concentracion!.affectedEntities[0].id).toBe('wh-A');
    expect(concentracion!.affectedEntities[0].name).toBe('Depósito A');
    // 1500 / 2000 = 75% > 70% → alto
    expect(concentracion!.severity).toBe('alto');
  });
});

// ------------------------------------------------------------
// 2. detectSystemRisks — dependencia de país (refactor colateral)
// ------------------------------------------------------------

describe('detectSystemRisks — dependencia de país', () => {
  test('reporta el país con mayor pesoNetoTotal aunque NO sea el primero', () => {
    const snapshot = buildSnapshot({
      countries: [
        buildCountry({ id: 'co-CN', name: 'China', pesoNetoTotal: 100 }),    // 1ro, chico
        buildCountry({ id: 'co-DE', name: 'Alemania', pesoNetoTotal: 1500 }), // 2do, mayor
        buildCountry({ id: 'co-US', name: 'EE.UU.', pesoNetoTotal: 400 }),
      ],
    });
    const risks = detectSystemRisks(snapshot);
    const dep = risks.find(r => r.id === 'risk-dependencia-pais');
    expect(dep).toBeDefined();
    expect(dep!.affectedEntities[0].id).toBe('co-DE');
    expect(dep!.affectedEntities[0].name).toBe('Alemania');
    // 1500 / 2000 = 75%
    expect(dep!.metric).toBeCloseTo(75, 0);
    expect(dep!.severity).toBe('alto');
  });

  test('no reporta dependencia si ningún país supera el umbral', () => {
    const snapshot = buildSnapshot({
      countries: [
        buildCountry({ pesoNetoTotal: 400 }),
        buildCountry({ pesoNetoTotal: 350 }),
        buildCountry({ pesoNetoTotal: 250 }),
      ],
    });
    // total = 1000, top = 400 = 40% < 50% → no se reporta
    const risks = detectSystemRisks(snapshot);
    expect(risks.find(r => r.id === 'risk-dependencia-pais')).toBeUndefined();
  });
});

// ------------------------------------------------------------
// 3. detectSystemRisks — depósitos saturados, clientes inactivos,
//    stock inmovilizado, mercadería retenida
// ------------------------------------------------------------

describe('detectSystemRisks — categorías básicas', () => {
  test('depósito sobre 90% de capacidad genera alerta', () => {
    const snapshot = buildSnapshot({
      warehouses: [buildWarehouse({ id: 'wh-A', name: 'A', utilizacion: 95 })],
    });
    const risks = detectSystemRisks(snapshot);
    const sat = risks.find(r => r.id === 'risk-depositos-saturados');
    expect(sat).toBeDefined();
    expect(sat!.severity).toBe('alto'); // 1 depósito → no crítico
    expect(sat!.metric).toBe(1);
  });

  test('4+ depósitos saturados escalan a crítico', () => {
    const snapshot = buildSnapshot({
      warehouses: Array.from({ length: 4 }, (_, i) =>
        buildWarehouse({ id: `wh-${i}`, name: `W${i}`, utilizacion: 95 }),
      ),
    });
    const risks = detectSystemRisks(snapshot);
    const sat = risks.find(r => r.id === 'risk-depositos-saturados');
    expect(sat!.severity).toBe('critico');
  });

  test('clientes inactivos escalan a alto cuando superan countAlto', () => {
    const snapshot = buildSnapshot({
      clients: Array.from({ length: 6 }, (_, i) =>
        buildClient({ id: `cl-${i}`, name: `C${i}`, activo: false }),
      ),
    });
    const risks = detectSystemRisks(snapshot);
    const inact = risks.find(r => r.id === 'risk-clientes-inactivos');
    expect(inact).toBeDefined();
    expect(inact!.severity).toBe('alto'); // 6 > 5
  });

  test('stock inmovilizado con pn > 100000 escala a crítico', () => {
    const snapshot = buildSnapshot({
      lots: [
        buildLot({ id: 'lot-1', cote: 'COTE-001', diasSinMovimiento: 120, pesoNeto: 60000 }),
        buildLot({ id: 'lot-2', cote: 'COTE-002', diasSinMovimiento: 150, pesoNeto: 60000 }),
      ],
    });
    const risks = detectSystemRisks(snapshot);
    const inm = risks.find(r => r.id === 'risk-stock-inmovilizado');
    expect(inm).toBeDefined();
    expect(inm!.severity).toBe('critico'); // 120000 > 100000
    expect(inm!.metric).toBe(120000);
  });

  test('lote retenido genera alerta crítica', () => {
    const snapshot = buildSnapshot({
      lots: [buildLot({ id: 'lot-R', cote: 'COTE-R', estado: 'retenido' })],
    });
    const risks = detectSystemRisks(snapshot);
    const ret = risks.find(r => r.id === 'risk-mercaderia-retenida');
    expect(ret).toBeDefined();
    expect(ret!.severity).toBe('critico');
  });

  test('snapshot vacío no produce riesgos', () => {
    const snapshot = buildSnapshot();
    const risks = detectSystemRisks(snapshot);
    expect(risks).toEqual([]);
  });
});

// ------------------------------------------------------------
// 4. assessAllRisks + helpers públicos
// ------------------------------------------------------------

describe('assessAllRisks', () => {
  test('retorna RiskAssessment para cada entidad, ordenado desc por score', () => {
    const snapshot = buildSnapshot({
      warehouses: [
        // saturacion=100, concentración=100 (1 prod), share=10 (marketShare=0)
        // → 100*0.4 + 100*0.3 + 10*0.3 = 40 + 30 + 3 = 73
        buildWarehouse({ id: 'wh-1', name: 'W1', utilizacion: 100, productores: 1, marketShare: 0 }),
      ],
      producers: [
        // ultimaActividad=null → diasInactivo=999 → value=100
        // paises.length=1 → concentración=100
        // cortes.length=1 → concentración=100
        // → 100*0.4 + 100*0.3 + 100*0.3 = 100
        buildProducer({ id: 'pr-1', name: 'P1', ultimaActividad: null, paises: ['CN'], cortes: ['HP'] }),
      ],
      clients: [
        // ultimaActividad=null → 100, paises=1→100, productores=1→100
        // → 100*0.5 + 100*0.3 + 100*0.2 = 100
        buildClient({ id: 'cl-1', name: 'C1', ultimaActividad: null, paises: ['CN'], productores: ['pr-1'] }),
      ],
      lots: [
        // diasSinMovimiento=200 → value=min(100,100)=100
        // sin exportación y estado='en_stock' → value=80
        // no retenido → value=0
        // → 100*0.5 + 80*0.3 + 0*0.2 = 50 + 24 + 0 = 74
        buildLot({ id: 'lot-1', cote: 'COTE-1', diasSinMovimiento: 200, tieneExportacion: false, estado: 'en_stock' }),
      ],
    });

    const all = assessAllRisks(snapshot);
    // 1 wh + 1 producer + 1 client + 1 lot (<=200) = 4
    expect(all).toHaveLength(4);
    // Ordenado desc
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].score).toBeGreaterThanOrEqual(all[i].score);
    }
    // Scores esperados
    const w = all.find(a => a.entityType === 'warehouse');
    const p = all.find(a => a.entityType === 'producer');
    const c = all.find(a => a.entityType === 'client');
    const l = all.find(a => a.entityType === 'inventory_lot');
    expect(w!.score).toBe(73);
    expect(p!.score).toBe(100);
    expect(c!.score).toBe(100);
    expect(l!.score).toBe(74);
  });

  test('limita a 200 lotes', () => {
    const lots = Array.from({ length: 300 }, (_, i) =>
      buildLot({ id: `lot-${i}`, cote: `COTE-${i}` }),
    );
    const snapshot = buildSnapshot({ lots });
    const all = assessAllRisks(snapshot);
    expect(all.filter(a => a.entityType === 'inventory_lot')).toHaveLength(200);
  });
});

describe('portfolioRiskScore', () => {
  test('calcula el promedio de scores', () => {
    const assessments: RiskAssessment[] = [
      { entityType: 'warehouse', entityId: '1', entityName: 'A', score: 60, level: 'medio', factors: [] },
      { entityType: 'warehouse', entityId: '2', entityName: 'B', score: 40, level: 'medio', factors: [] },
      { entityType: 'warehouse', entityId: '3', entityName: 'C', score: 80, level: 'alto',  factors: [] },
    ];
    expect(portfolioRiskScore(assessments)).toBeCloseTo(60, 5);
  });

  test('retorna 0 si no hay assessments', () => {
    expect(portfolioRiskScore([])).toBe(0);
  });
});

describe('topRisks', () => {
  test('devuelve los N primeros sin alterar el array original', () => {
    const assessments: RiskAssessment[] = Array.from({ length: 25 }, (_, i) => ({
      entityType: 'warehouse' as const,
      entityId: String(i),
      entityName: `W${i}`,
      score: i,
      level: 'bajo' as const,
      factors: [],
    }));
    const top = topRisks(assessments, 5);
    expect(top).toHaveLength(5);
    expect(top[0].entityId).toBe('0');
    expect(top[4].entityId).toBe('4');
    // Array original intacto
    expect(assessments).toHaveLength(25);
  });

  test('default n=10', () => {
    const assessments: RiskAssessment[] = Array.from({ length: 15 }, (_, i) => ({
      entityType: 'warehouse' as const,
      entityId: String(i),
      entityName: `W${i}`,
      score: i,
      level: 'bajo' as const,
      factors: [],
    }));
    expect(topRisks(assessments)).toHaveLength(10);
  });
});

describe('riskLevelDistribution', () => {
  test('cuenta correctamente por nivel', () => {
    const levels: Array<'critico' | 'alto' | 'medio' | 'bajo'> = [
      'critico', 'critico', 'alto', 'alto', 'alto', 'medio',
    ];
    const assessments: RiskAssessment[] = levels.map((level, i) => ({
      entityType: 'warehouse',
      entityId: String(i),
      entityName: `W${i}`,
      score: 0,
      level,
      factors: [],
    }));
    const dist = riskLevelDistribution(assessments);
    expect(dist.critico).toBe(2);
    expect(dist.alto).toBe(3);
    expect(dist.medio).toBe(1);
    expect(dist.bajo).toBe(0);
  });
});

// ------------------------------------------------------------
// 5. Inmutabilidad del snapshot de entrada
// ------------------------------------------------------------

describe('inmutabilidad', () => {
  test('detectSystemRisks no muta el snapshot ni el orden de warehouses', () => {
    const snapshot = buildSnapshot({
      warehouses: [
        buildWarehouse({ id: 'wh-A', stockPn: 100 }),
        buildWarehouse({ id: 'wh-B', stockPn: 1500 }),
        buildWarehouse({ id: 'wh-C', stockPn: 400 }),
      ],
    });
    const originalOrder = snapshot.warehouses.map(w => w.id);
    const originalStocks = snapshot.warehouses.map(w => w.stockPn);

    detectSystemRisks(snapshot);

    expect(snapshot.warehouses.map(w => w.id)).toEqual(originalOrder);
    expect(snapshot.warehouses.map(w => w.stockPn)).toEqual(originalStocks);
  });

  test('assessAllRisks no muta el snapshot', () => {
    const snapshot = buildSnapshot({
      warehouses: [buildWarehouse({ id: 'wh-1' })],
      producers: [buildProducer({ id: 'pr-1' })],
    });
    const before = JSON.stringify(snapshot);
    assessAllRisks(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
