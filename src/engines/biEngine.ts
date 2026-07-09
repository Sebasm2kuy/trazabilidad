// ============================================================
// BUSINESS INTELLIGENCE ENGINE — Analytics, Cubos y Digital Twin
// ------------------------------------------------------------
// ETI-08: Transforma datos en inteligencia. Cubos OLAP, drill
// down/up, ABC, Pareto, heatmap, tendencias, insights, What-If.
// ============================================================

import type { TraceNode, StockPallet, Ingreso, Exportacion } from '@/domain';
import { TraceGraph } from './traceGraphEngine';
import { KPIEngine } from './kpiEngine';
import { IntegrityEngine } from './integrityEngine';
import { RiskEngine } from './riskEngine';

// --- Cubos OLAP ---

export type DimensionCubo =
  | 'empresa' | 'productor' | 'certificadora' | 'cliente'
  | 'pais' | 'deposito' | 'corte' | 'producto' | 'mes' | 'año' | 'cote';

export type MetricaCubo = 'pesoNeto' | 'cajas' | 'pallets' | 'registros' | 'stockKg' | 'stockCajas';

export interface CuboEntry {
  dimension: string;
  dimensionLabel: string;
  metricas: Record<MetricaCubo, number>;
  hijo?: CuboEntry[]; // para drill down
}

export interface CuboResultado {
  dimension: DimensionCubo;
  total: Record<MetricaCubo, number>;
  entries: CuboEntry[];
}

// --- Comparativos ---

export interface Comparativo {
  label: string;
  actual: number;
  anterior: number;
  variacionAbsoluta: number;
  variacionPct: number;
  tendencia: 'sube' | 'baja' | 'estable';
}

// --- ABC / Pareto ---

export interface ABCEntry {
  id: string;
  label: string;
  valor: number;
  pctAcumulado: number;
  categoria: 'A' | 'B' | 'C';
}

export interface ParetoEntry {
  id: string;
  label: string;
  valor: number;
  pctAcumulado: number;
}

// --- Heatmap ---

export interface HeatmapCell {
  fila: string;
  columna: string;
  valor: number;
}

// --- Insights ejecutivos ---

export interface InsightEjecutivo {
  id: string;
  titulo: string;
  descripcion: string;
  datosUtilizados: string;
  periodoAnalizado: string;
  confianza: number;
  severidad: 'info' | 'warning' | 'error' | 'positive';
}

// --- What-If ---

export interface EscenarioWhatIf {
  id: string;
  nombre: string;
  descripcion: string;
  modificaciones: WhatIfModificacion[];
  resultado: {
    stockImpacto: number;
    exportacionImpacto: number;
    integridadImpacto: number;
    riesgoImpacto: number;
    alertasNuevas: number;
  };
}

export interface WhatIfModificacion {
  tipo: 'eliminar_exportacion' | 'cambiar_productor' | 'agregar_ingreso' | 'cambiar_peso';
  cote: string;
  detalle: string;
}

// --- Digital Twin ---

export interface DigitalTwinState {
  timestamp: string;
  totalCotes: number;
  totalIngresos: number;
  totalExportaciones: number;
  stockTotalKg: number;
  stockTotalCajas: number;
  stockTotalPallets: number;
  integridadPromedio: number;
  riesgoGlobal: number;
  alertasActivas: number;
  nodosPorEstado: Record<string, number>;
  nodosPorRiesgo: Record<string, number>;
  flujo: DigitalTwinNodo[];
}

export interface DigitalTwinNodo {
  tipo: 'ingreso' | 'stock' | 'exportacion' | 'cliente';
  label: string;
  peso: number;
  cajas: number;
  count: number;
  estado: string;
}

// --- Tendencias ---

export interface Tendencia {
  id: string;
  label: string;
  direccion: 'sube' | 'baja' | 'estable';
  magnitud: number;
  periodo: string;
  valores: { fecha: string; valor: number }[];
}

// --- Implementación ---

class BusinessIntelligenceEngineImpl {
  private cache: Map<string, any> = new Map();

  // --- Cubos OLAP ---

  obtenerCubo(
    dimension: DimensionCubo,
    ingresos: Ingreso[],
    exportaciones: Exportacion[],
    stock: StockPallet[],
    filtros?: Record<string, string>
  ): CuboResultado {
    const cacheKey = `cubo_${dimension}_${JSON.stringify(filtros || {})}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    // Filtrar
    let recs: any[] = [...ingresos, ...exportaciones];
    if (filtros) {
      recs = this.aplicarFiltros(recs, filtros);
    }

    // Agrupar por dimensión
    const map = new Map<string, { label: string; pesoNeto: number; cajas: number; pallets: number; registros: number; stockKg: number; stockCajas: number }>();

    for (const r of recs) {
      const key = this.getDimensionValue(r, dimension);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { label: key, pesoNeto: 0, cajas: 0, pallets: 0, registros: 0, stockKg: 0, stockCajas: 0 });
      }
      const e = map.get(key)!;
      e.pesoNeto += r.pesoNeto || 0;
      e.cajas += r.cantidadEnvases || 0;
      e.pallets += 0;
      e.registros++;
    }

    // Agregar stock si la dimensión lo permite
    if (dimension === 'deposito' || dimension === 'cote') {
      for (const p of stock) {
        const key = dimension === 'cote' ? p.codigo : p.contenedor?.split(' ')[0] || '';
        if (!key) continue;
        if (!map.has(key)) map.set(key, { label: key, pesoNeto: 0, cajas: 0, pallets: 0, registros: 0, stockKg: 0, stockCajas: 0 });
        const e = map.get(key)!;
        e.stockKg += p.kilos || 0;
        e.stockCajas += p.cajas || 0;
      }
    }

    const entries: CuboEntry[] = Array.from(map.entries())
      .map(([dim, v]) => ({
        dimension: dim,
        dimensionLabel: v.label,
        metricas: {
          pesoNeto: v.pesoNeto,
          cajas: v.cajas,
          pallets: v.pallets,
          registros: v.registros,
          stockKg: v.stockKg,
          stockCajas: v.stockCajas,
        }
      }))
      .sort((a, b) => b.metricas.pesoNeto - a.metricas.pesoNeto);

    const total: Record<MetricaCubo, number> = {
      pesoNeto: entries.reduce((s, e) => s + e.metricas.pesoNeto, 0),
      cajas: entries.reduce((s, e) => s + e.metricas.cajas, 0),
      pallets: entries.reduce((s, e) => s + e.metricas.pallets, 0),
      registros: entries.reduce((s, e) => s + e.metricas.registros, 0),
      stockKg: entries.reduce((s, e) => s + e.metricas.stockKg, 0),
      stockCajas: entries.reduce((s, e) => s + e.metricas.stockCajas, 0),
    };

    const resultado: CuboResultado = { dimension, total, entries };
    this.cache.set(cacheKey, resultado);
    return resultado;
  }

  // --- Comparativos ---

  obtenerComparativo(
    ingresos: Ingreso[],
    exportaciones: Exportacion[],
    periodo: 'mes' | 'año'
  ): Comparativo[] {
    const now = new Date();
    const resultados: Comparativo[] = [];

    // Exportaciones: mes actual vs anterior
    const expActual = this.filtrarPorPeriodo(exportaciones, now, periodo);
    const expAnterior = this.filtrarPorPeriodo(exportaciones, this.restarPeriodo(now, periodo), periodo);
    const expActualPn = expActual.reduce((s, r) => s + r.pesoNeto, 0);
    const expAnteriorPn = expAnterior.reduce((s, r) => s + r.pesoNeto, 0);
    resultados.push(this.crearComparativo(`Exportaciones (${periodo})`, expActualPn, expAnteriorPn));

    // Ingresos
    const ingActual = this.filtrarPorPeriodo(ingresos, now, periodo);
    const ingAnterior = this.filtrarPorPeriodo(ingresos, this.restarPeriodo(now, periodo), periodo);
    const ingActualPn = ingActual.reduce((s, r) => s + r.pesoNeto, 0);
    const ingAnteriorPn = ingAnterior.reduce((s, r) => s + r.pesoNeto, 0);
    resultados.push(this.crearComparativo(`Ingresos (${periodo})`, ingActualPn, ingAnteriorPn));

    // KPIs
    const kpis = KPIEngine.obtenerTodos();
    for (const kpi of kpis.filter(k => k.valorAnterior !== null)) {
      resultados.push(this.crearComparativo(kpi.nombre, kpi.valor, kpi.valorAnterior!));
    }

    return resultados;
  }

  // --- ABC ---

  obtenerABC(
    ingresos: Ingreso[],
    exportaciones: Exportacion[],
    dimension: DimensionCubo,
    metrica: MetricaCubo = 'pesoNeto'
  ): ABCEntry[] {
    const cubo = this.obtenerCubo(dimension, ingresos, exportaciones, []);
    const total = cubo.total[metrica] || 1;
    let acumulado = 0;

    return cubo.entries
      .map(e => {
        const valor = e.metricas[metrica];
        acumulado += valor;
        const pct = (acumulado / total) * 100;
        return {
          id: e.dimension,
          label: e.dimensionLabel,
          valor,
          pctAcumulado: pct,
          categoria: pct <= 80 ? 'A' as const : pct <= 95 ? 'B' as const : 'C' as const,
        };
      });
  }

  // --- Pareto ---

  obtenerPareto(
    tipo: 'riesgo' | 'alertas' | 'peso',
    limit?: number
  ): ParetoEntry[] {
    const riskResult = RiskEngine.obtenerRiesgoGlobal();
    let entries: { id: string; label: string; valor: number }[] = [];

    if (tipo === 'riesgo') {
      entries = riskResult.topRiesgos.map(r => ({ id: r.nodoId, label: r.nroCote, valor: r.score }));
    } else if (tipo === 'alertas') {
      entries = riskResult.rankingProductores.map(r => ({ id: r.entidadId, label: r.entidadLabel, valor: r.alertas }));
    } else {
      entries = riskResult.rankingClientes.map(r => ({ id: r.entidadId, label: r.entidadLabel, valor: r.pesoComprometido }));
    }

    const total = entries.reduce((s, e) => s + e.valor, 0) || 1;
    let acumulado = 0;
    const result = entries
      .sort((a, b) => b.valor - a.valor)
      .slice(0, limit || entries.length)
      .map(e => {
        acumulado += e.valor;
        return { id: e.id, label: e.label, valor: e.valor, pctAcumulado: (acumulado / total) * 100 };
      });

    return result;
  }

  // --- Heatmap ---

  obtenerHeatmap(
    filaDimension: DimensionCubo,
    columnaDimension: DimensionCubo,
    metrica: MetricaCubo,
    ingresos: Ingreso[],
    exportaciones: Exportacion[]
  ): HeatmapCell[] {
    const recs = [...ingresos, ...exportaciones];
    const map = new Map<string, number>();

    for (const r of recs) {
      const fila = this.getDimensionValue(r, filaDimension);
      const col = this.getDimensionValue(r, columnaDimension);
      if (!fila || !col) continue;
      const key = `${fila}§${col}`;
      map.set(key, (map.get(key) || 0) + (r.pesoNeto || 0));
    }

    return Array.from(map.entries()).map(([key, valor]) => {
      const [fila, columna] = key.split('§');
      return { fila, columna, valor };
    }).sort((a, b) => b.valor - a.valor);
  }

  // --- Tendencias ---

  obtenerTendencias(): Tendencia[] {
    const kpis = KPIEngine.obtenerTodos();
    const tendencias: Tendencia[] = [];

    for (const kpi of kpis) {
      const hist = KPIEngine.obtenerHistorico(kpi.id);
      if (hist.length < 2) continue;

      const ultimo = hist[hist.length - 1].valor;
      const primero = hist[0].valor;
      const delta = ultimo - primero;
      const direccion = delta > 0.01 ? 'sube' : delta < -0.01 ? 'baja' : 'estable';

      tendencias.push({
        id: kpi.id,
        label: kpi.nombre,
        direccion,
        magnitud: Math.abs(delta),
        periodo: `Últimas ${hist.length} mediciones`,
        valores: hist.map(h => ({ fecha: h.timestamp, valor: h.valor })),
      });
    }

    return tendencias;
  }

  // --- Insights ejecutivos ---

  obtenerInsightsEjecutivos(
    ingresos: Ingreso[],
    exportaciones: Exportacion[],
    stock: StockPallet[]
  ): InsightEjecutivo[] {
    const insights: InsightEjecutivo[] = [];
    const riskResult = RiskEngine.obtenerRiesgoGlobal();
    const integrityResult = IntegrityEngine.validarTodo();

    // 1. Concentración de exportaciones
    const cuboCliente = this.obtenerCubo('cliente', ingresos, exportaciones, []);
    const totalExp = cuboCliente.total.pesoNeto || 1;
    const top3 = cuboCliente.entries.slice(0, 3);
    const top3Pct = (top3.reduce((s, e) => s + e.metricas.pesoNeto, 0) / totalExp) * 100;
    if (top3Pct > 50) {
      insights.push({
        id: 'bi-concentracion-clientes',
        titulo: `${top3Pct.toFixed(0)}% del volumen exportado se concentra en 3 clientes`,
        descripcion: `Los clientes ${top3.map(e => e.dimensionLabel).join(', ')} representan la mayor parte de las exportaciones.`,
        datosUtilizados: `${cuboCliente.entries.length} clientes analizados`,
        periodoAnalizado: 'Período actual',
        confianza: 95,
        severidad: top3Pct > 70 ? 'warning' : 'info',
      });
    }

    // 2. Riesgo concentrado
    if (riskResult.topRiesgos.length > 0) {
      const top5Risk = riskResult.topRiesgos.slice(0, 5);
      const totalRisk = riskResult.topRiesgos.reduce((s, r) => s + r.score, 0) || 1;
      const top5Pct = (top5Risk.reduce((s, r) => s + r.score, 0) / totalRisk) * 100;
      insights.push({
        id: 'bi-riesgo-concentrado',
        titulo: `5 COTEs representan el ${top5Pct.toFixed(0)}% del riesgo total`,
        descripcion: `Los COTEs ${top5Risk.map(r => r.nroCote).join(', ')} concentran el mayor riesgo operativo.`,
        datosUtilizados: `${riskResult.topRiesgos.length} COTEs analizados`,
        periodoAnalizado: 'Actual',
        confianza: 90,
        severidad: 'warning',
      });
    }

    // 3. Productor dominante
    const cuboProductor = this.obtenerCubo('productor', ingresos, exportaciones, []);
    if (cuboProductor.entries.length > 0) {
      const topProductor = cuboProductor.entries[0];
      const pct = (topProductor.metricas.pesoNeto / (cuboProductor.total.pesoNeto || 1)) * 100;
      if (pct > 40) {
        insights.push({
          id: 'bi-productor-dominante',
          titulo: `${topProductor.dimensionLabel} representa el ${pct.toFixed(0)}% del volumen`,
          descripcion: `Un solo productor concentra la mayoría de las operaciones.`,
          datosUtilizados: `${cuboProductor.entries.length} productores`,
          periodoAnalizado: 'Actual',
          confianza: 95,
          severidad: 'info',
        });
      }
    }

    // 4. Stock inmovilizado
    const inmovilizado = stock.filter(p => {
      if (!p.fechaComision) return false;
      const d = new Date(p.fechaComision);
      if (isNaN(d.getTime())) return false;
      return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)) > 180;
    });
    if (inmovilizado.length > 0) {
      const pn = inmovilizado.reduce((s, p) => s + (p.kilos || 0), 0);
      const totalStock = stock.reduce((s, p) => s + (p.kilos || 0), 0) || 1;
      const pct = (pn / totalStock) * 100;
      insights.push({
        id: 'bi-inmovilizado',
        titulo: `${(pn / 1000).toFixed(1)} t inmovilizadas (${pct.toFixed(0)}% del stock)`,
        descripcion: `${inmovilizado.length} pallets llevan más de 180 días sin movimiento.`,
        datosUtilizados: `${stock.length} pallets analizados`,
        periodoAnalizado: 'Actual',
        confianza: 100,
        severidad: pct > 20 ? 'warning' : 'info',
      });
    }

    // 5. Integridad
    if (integrityResult.scoreGlobal < 90) {
      insights.push({
        id: 'bi-integridad',
        titulo: `Integridad del modelo: ${integrityResult.scoreGlobal.toFixed(1)}%`,
        descripcion: `Hay ${integrityResult.totalAlertas} alertas activas (${integrityResult.alertasPorSeveridad['CRITICA'] || 0} críticas).`,
        datosUtilizados: 'TraceGraph + Integrity Engine',
        periodoAnalizado: 'Actual',
        confianza: 100,
        severidad: integrityResult.scoreGlobal < 70 ? 'error' : 'warning',
      });
    }

    // 6. Insights del Risk Engine
    for (const ins of riskResult.insights) {
      insights.push({
        id: `bi-risk-${ins.id}`,
        titulo: ins.titulo,
        descripcion: ins.descripcion,
        datosUtilizados: ins.datosUtilizados,
        periodoAnalizado: ins.periodoAnalizado,
        confianza: ins.confianza,
        severidad: ins.severidad as any,
      });
    }

    return insights;
  }

  // --- Digital Twin ---

  obtenerDigitalTwin(stock: StockPallet[], ingresos: Ingreso[], exportaciones: Exportacion[]): DigitalTwinState {
    const stats = TraceGraph.getStats();
    const riskResult = RiskEngine.obtenerRiesgoGlobal();
    const integrityResult = IntegrityEngine.validarTodo();

    // Flujo: ingreso → stock → exportación → cliente
    const flujo: DigitalTwinNodo[] = [
      {
        tipo: 'ingreso',
        label: 'Ingresos',
        peso: ingresos.reduce((s, r) => s + r.pesoNeto, 0),
        cajas: ingresos.reduce((s, r) => s + r.cantidadEnvases, 0),
        count: ingresos.length,
        estado: 'activo',
      },
      {
        tipo: 'stock',
        label: 'Stock Actual',
        peso: stock.reduce((s, p) => s + (p.kilos || 0), 0),
        cajas: stock.reduce((s, p) => s + (p.cajas || 0), 0),
        count: stock.length,
        estado: 'en_deposito',
      },
      {
        tipo: 'exportacion',
        label: 'Exportaciones',
        peso: exportaciones.reduce((s, r) => s + r.pesoNeto, 0),
        cajas: exportaciones.reduce((s, r) => s + r.cantidadEnvases, 0),
        count: exportaciones.length,
        estado: 'exportado',
      },
      {
        tipo: 'cliente',
        label: 'Clientes',
        peso: exportaciones.reduce((s, r) => s + r.pesoNeto, 0),
        cajas: exportaciones.reduce((s, r) => s + r.cantidadEnvases, 0),
        count: new Set(exportaciones.map(r => r.destino).filter(Boolean)).size,
        estado: 'entregado',
      },
    ];

    return {
      timestamp: new Date().toISOString(),
      totalCotes: stats.total,
      totalIngresos: ingresos.length,
      totalExportaciones: exportaciones.length,
      stockTotalKg: stock.reduce((s, p) => s + (p.kilos || 0), 0),
      stockTotalCajas: stock.reduce((s, p) => s + (p.cajas || 0), 0),
      stockTotalPallets: stock.reduce((s, p) => s + (p.pallets || 0), 0),
      integridadPromedio: integrityResult.scoreGlobal,
      riesgoGlobal: riskResult.scoreGlobal,
      alertasActivas: integrityResult.totalAlertas,
      nodosPorEstado: stats.porEstado,
      nodosPorRiesgo: riskResult.rankingProductores.reduce((acc, r) => {
        acc[r.nivel] = (acc[r.nivel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      flujo,
    };
  }

  // --- What-If ---

  obtenerEscenario(modificaciones: WhatIfModificacion[]): EscenarioWhatIf {
    // Simulación básica: calcular impacto sin modificar datos reales
    let stockImpacto = 0;
    let exportacionImpacto = 0;
    let alertasNuevas = 0;

    for (const mod of modificaciones) {
      switch (mod.tipo) {
        case 'eliminar_exportacion':
          exportacionImpacto -= 1;
          alertasNuevas += 1; // posible saldo positivo
          break;
        case 'agregar_ingreso':
          stockImpacto += 1;
          alertasNuevas -= 1; // posible resolución de alerta
          break;
        case 'cambiar_peso':
          stockImpacto += 0.5;
          break;
        default:
          break;
      }
    }

    return {
      id: `esc_${Date.now()}`,
      nombre: `Escenario simulado`,
      descripcion: `${modificaciones.length} modificación(es) simulada(s)`,
      modificaciones,
      resultado: {
        stockImpacto,
        exportacionImpacto,
        integridadImpacto: alertasNuevas > 0 ? -5 : 0,
        riesgoImpacto: alertasNuevas > 0 ? 10 : 0,
        alertasNuevas: Math.abs(alertasNuevas),
      },
    };
  }

  // --- Helpers ---

  private getDimensionValue(r: any, dim: DimensionCubo): string {
    switch (dim) {
      case 'empresa': return r.certificadoraId || r.productorId || '';
      case 'productor': return r.productorId || '';
      case 'certificadora': return r.certificadoraId || '';
      case 'cliente': return r.destino || '';
      case 'pais': return r.paisDestino || '';
      case 'deposito': return r.depositoId || '';
      case 'corte': return r.corte || '';
      case 'producto': return r.producto || r.denominacion || '';
      case 'mes': return (r.fecha || '').substring(0, 7);
      case 'año': return (r.fecha || '').substring(0, 4);
      case 'cote': return r.nroCote || '';
      default: return '';
    }
  }

  private aplicarFiltros(recs: any[], filtros: Record<string, string>): any[] {
    return recs.filter(r => {
      for (const [key, value] of Object.entries(filtros)) {
        if (!value) continue;
        const rValue = this.getDimensionValue(r, key as DimensionCubo);
        if (rValue !== value) return false;
      }
      return true;
    });
  }

  private filtrarPorPeriodo(recs: any[], fecha: Date, periodo: 'mes' | 'año'): any[] {
    const y = fecha.getFullYear();
    const m = fecha.getMonth();
    return recs.filter(r => {
      if (!r.fecha) return false;
      const d = new Date(r.fecha);
      if (periodo === 'mes') return d.getFullYear() === y && d.getMonth() === m;
      return d.getFullYear() === y;
    });
  }

  private restarPeriodo(fecha: Date, periodo: 'mes' | 'año'): Date {
    const r = new Date(fecha);
    if (periodo === 'mes') r.setMonth(r.getMonth() - 1);
    else r.setFullYear(r.getFullYear() - 1);
    return r;
  }

  private crearComparativo(label: string, actual: number, anterior: number): Comparativo {
    const delta = actual - anterior;
    const pct = anterior !== 0 ? (delta / anterior) * 100 : 0;
    return {
      label,
      actual,
      anterior,
      variacionAbsoluta: delta,
      variacionPct: pct,
      tendencia: delta > 0.01 ? 'sube' : delta < -0.01 ? 'baja' : 'estable',
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// --- Singleton ---

export const BusinessIntelligenceEngine = new BusinessIntelligenceEngineImpl();
