// ============================================================
// DISCOVERY ENGINE — Motor de Descubrimiento Automático
// ------------------------------------------------------------
// ETI-13: Detecta patrones, anomalías y oportunidades que el
// usuario no solicitó. Trabaja sobre los motores existentes.
// NUNCA accede a React ni a Excel.
// ============================================================

import { KPIEngine } from './kpiEngine';
import { RiskEngine } from './riskEngine';
import { BusinessIntelligenceEngine } from './biEngine';
import { TraceGraph } from './traceGraphEngine';
import { ConciliationEngine } from './conciliationEngine';
import { IntegrityEngine } from './integrityEngine';
import type { Ingreso, Exportacion, StockPallet } from '@/domain';

// --- Tipos ---

export type DiscoveryType =
  | 'growth' | 'decline' | 'new_market' | 'lost_market'
  | 'customer_change' | 'concentration' | 'diversification'
  | 'seasonality' | 'historical_record' | 'anomaly'
  | 'opportunity' | 'dependency' | 'competitor_shift';

export type DiscoverySeverity = 'info' | 'positive' | 'warning' | 'negative' | 'opportunity';

export interface Discovery {
  id: string;
  type: DiscoveryType;
  severity: DiscoverySeverity;
  title: string;
  description: string;
  evidence: string[];
  confidence: number;       // 0-100
  entities: { type: string; id: string; label: string }[];
  period: { start: string; end: string };
  recommendation: string;
  detectedAt: string;
  motor: string;            // qué motor lo detectó
}

export interface KnowledgeTimelineEntry {
  id: string;
  fecha: string;
  tipo: DiscoveryType;
  impacto: 'alto' | 'medio' | 'bajo';
  entidades: string[];
  evidencia: string;
  motor: string;
  confianza: number;
  estado: 'nuevo' | 'revisado' | 'archivado';
}

// --- Implementación ---

class DiscoveryEngineImpl {
  private timeline: KnowledgeTimelineEntry[] = [];

  // --- API Pública ---

  detectAll(ingresos: Ingreso[], exportaciones: Exportacion[], stock: StockPallet[]): Discovery[] {
    const discoveries: Discovery[] = [];

    discoveries.push(...this.detectGrowthPatterns(exportaciones));
    discoveries.push(...this.detectDeclinePatterns(exportaciones));
    discoveries.push(...this.detectNewMarkets(exportaciones));
    discoveries.push(...this.detectLostMarkets(exportaciones));
    discoveries.push(...this.detectMarketConcentration(exportaciones));
    discoveries.push(...this.detectHistoricalRecords(exportaciones));
    discoveries.push(...this.detectAnomalies(exportaciones));
    discoveries.push(...this.detectBusinessOpportunities(exportaciones));
    discoveries.push(...this.detectSeasonality(exportaciones));
    discoveries.push(...this.detectCustomerChanges(exportaciones));
    discoveries.push(...this.detectDiversification(exportaciones));

    // Registrar en timeline
    for (const d of discoveries) {
      this.timeline.unshift({
        id: d.id,
        fecha: d.detectedAt,
        tipo: d.type,
        impacto: d.severity === 'negative' || d.severity === 'positive' ? 'alto' : 'medio',
        entidades: d.entities.map(e => e.label),
        evidencia: d.evidence.join('; '),
        motor: d.motor,
        confianza: d.confidence,
        estado: 'nuevo',
      });
    }

    return discoveries.sort((a, b) => b.confidence - a.confidence);
  }

  // --- Patrones de Crecimiento ---

  detectGrowthPatterns(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);

    for (const [pais, meses] of byPaisMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length < 3) continue;

      const last3 = sorted.slice(-3).reduce((s, [, v]) => s + v, 0);
      const prev3 = sorted.slice(-6, -3).reduce((s, [, v]) => s + v, 0);

      if (prev3 > 0 && last3 > prev3 * 1.2) {
        const pct = ((last3 / prev3 - 1) * 100);
        discoveries.push({
          id: `disc_growth_${pais}_${Date.now()}`,
          type: 'growth',
          severity: 'positive',
          title: `${pais} aumentó compras ${pct.toFixed(0)}%`,
          description: `Exportaciones a ${pais} crecieron de ${(prev3 / 1000).toFixed(1)} t a ${(last3 / 1000).toFixed(1)} t en los últimos 3 meses.`,
          evidence: [`Período anterior (3 meses): ${prev3.toLocaleString('es-UY')} kg`, `Período actual (3 meses): ${last3.toLocaleString('es-UY')} kg`, `Crecimiento: ${pct.toFixed(1)}%`],
          confidence: 90,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: sorted[sorted.length - 3][0], end: sorted[sorted.length - 1][0] },
          recommendation: `Considerar aumentar capacidad logística hacia ${pais}. Evaluar acuerdos comerciales.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Patrones de Caída ---

  detectDeclinePatterns(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);

    for (const [pais, meses] of byPaisMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length < 3) continue;

      const last3 = sorted.slice(-3).reduce((s, [, v]) => s + v, 0);
      const prev3 = sorted.slice(-6, -3).reduce((s, [, v]) => s + v, 0);

      if (prev3 > 10000 && last3 < prev3 * 0.7) {
        const pct = ((1 - last3 / prev3) * 100);
        discoveries.push({
          id: `disc_decline_${pais}_${Date.now()}`,
          type: 'decline',
          severity: 'negative',
          title: `${pais} redujo importaciones ${pct.toFixed(0)}%`,
          description: `Exportaciones a ${pais} cayeron de ${(prev3 / 1000).toFixed(1)} t a ${(last3 / 1000).toFixed(1)} t en los últimos 3 meses.`,
          evidence: [`Período anterior: ${prev3.toLocaleString('es-UY')} kg`, `Período actual: ${last3.toLocaleString('es-UY')} kg`, `Caída: ${pct.toFixed(1)}%`],
          confidence: 88,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: sorted[sorted.length - 3][0], end: sorted[sorted.length - 1][0] },
          recommendation: `Investigar causa: competencia, regulaciones, o cambio de proveedor. Contactar cliente.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Nuevos Mercados ---

  detectNewMarkets(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);
    const now = new Date();
    const recentMonths = new Set([0, -1, -2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }));

    for (const [pais, meses] of byPaisMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      const firstMonth = sorted[0][0];
      if (recentMonths.has(firstMonth) && sorted[0][1] > 1000) {
        discoveries.push({
          id: `disc_new_market_${pais}_${Date.now()}`,
          type: 'new_market',
          severity: 'opportunity',
          title: `Nuevo mercado detectado: ${pais}`,
          description: `${pais} apareció como destino por primera vez con ${(sorted[0][1] / 1000).toFixed(1)} t.`,
          evidence: [`Primer mes: ${firstMonth}`, `Volumen inicial: ${sorted[0][1].toLocaleString('es-UY')} kg`],
          confidence: 85,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: firstMonth, end: firstMonth },
          recommendation: `Evaluar potencial de ${pais} como mercado recurrente.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Mercados Perdidos ---

  detectLostMarkets(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const cutoffStr = cutoff.toISOString().substring(0, 7);

    for (const [pais, meses] of byPaisMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      const lastMonth = sorted[sorted.length - 1][0];
      const lastVal = sorted[sorted.length - 1][1];
      const totalBefore = sorted.slice(0, -1).reduce((s, [, v]) => s + v, 0);

      if (lastMonth < cutoffStr && totalBefore > 50000 && lastVal === 0) {
        discoveries.push({
          id: `disc_lost_market_${pais}_${Date.now()}`,
          type: 'lost_market',
          severity: 'warning',
          title: `Mercado perdido: ${pais}`,
          description: `${pais} dejó de recibir exportaciones. Último envío: ${lastMonth}. Total histórico: ${(totalBefore / 1000).toFixed(1)} t.`,
          evidence: [`Último mes con envíos: ${lastMonth}`, `Total histórico: ${totalBefore.toLocaleString('es-UY')} kg`, `Sin envíos en últimos 3 meses`],
          confidence: 82,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: sorted[0][0], end: lastMonth },
          recommendation: `Investigar pérdida de mercado. ¿Competencia? ¿Regulación? ¿Cambio de proveedor?`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Concentración de Mercado ---

  detectMarketConcentration(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const cubo = BusinessIntelligenceEngine.obtenerCubo('pais', [], exportaciones, []);
    const total = cubo.total.pesoNeto || 1;

    const top1 = cubo.entries[0];
    if (top1 && (top1.metricas.pesoNeto / total) * 100 > 50) {
      const pct = (top1.metricas.pesoNeto / total) * 100;
      discoveries.push({
        id: `disc_concentration_${top1.dimension}_${Date.now()}`,
        type: 'concentration',
        severity: 'warning',
        title: `${pct.toFixed(0)}% del volumen concentrado en ${top1.dimensionLabel}`,
        description: `Un solo país representa más de la mitad de las exportaciones. Riesgo de dependencia.`,
        evidence: [`País: ${top1.dimensionLabel}`, `Volumen: ${(top1.metricas.pesoNeto / 1000).toFixed(1)} t`, `Participación: ${pct.toFixed(1)}%`],
        confidence: 95,
        entities: [{ type: 'pais', id: top1.dimension, label: top1.dimensionLabel }],
        period: { start: 'período actual', end: 'período actual' },
        recommendation: `Diversificar destinos. Evaluar mercados alternativos para reducir dependencia.`,
        detectedAt: new Date().toISOString(),
        motor: 'DiscoveryEngine',
      });
    }

    return discoveries;
  }

  // --- Récords Históricos ---

  detectHistoricalRecords(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);

    for (const [pais, meses] of byPaisMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length < 6) continue;

      const lastVal = sorted[sorted.length - 1][1];
      const maxPrev = Math.max(...sorted.slice(0, -1).map(([, v]) => v));

      if (lastVal > maxPrev * 1.3 && lastVal > 10000) {
        discoveries.push({
          id: `disc_record_${pais}_${Date.now()}`,
          type: 'historical_record',
          severity: 'positive',
          title: `Récord histórico: ${pais}`,
          description: `${pais} alcanzó su máximo histórico con ${(lastVal / 1000).toFixed(1)} t en ${sorted[sorted.length - 1][0]}.`,
          evidence: [`Mes récord: ${sorted[sorted.length - 1][0]}`, `Volumen: ${lastVal.toLocaleString('es-UY')} kg`, `Máximo anterior: ${maxPrev.toLocaleString('es-UY')} kg`],
          confidence: 100,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: sorted[0][0], end: sorted[sorted.length - 1][0] },
          recommendation: `Aprovechar el momentum. Considerar expandir capacidad hacia ${pais}.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Anomalías ---

  detectAnomalies(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);

    for (const [pais, meses] of byPaisMes) {
      const values = Array.from(meses.values()).filter(v => v > 0);
      if (values.length < 4) continue;

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      const lastVal = sorted[sorted.length - 1][1];

      if (stdDev > 0 && Math.abs(lastVal - mean) > 2 * stdDev && lastVal > 5000) {
        const direction = lastVal > mean ? 'pico inusual' : 'caída inusual';
        discoveries.push({
          id: `disc_anomaly_${pais}_${Date.now()}`,
          type: 'anomaly',
          severity: lastVal > mean ? 'info' : 'warning',
          title: `Anomalía en ${pais}: ${direction}`,
          description: `El volumen de ${pais} en ${sorted[sorted.length - 1][0]} (${(lastVal / 1000).toFixed(1)} t) se desvía 2+ desviaciones estándar del promedio (${(mean / 1000).toFixed(1)} t).`,
          evidence: [`Valor actual: ${lastVal.toLocaleString('es-UY')} kg`, `Promedio: ${mean.toLocaleString('es-UY')} kg`, `Desviación estándar: ${stdDev.toLocaleString('es-UY', { maximumFractionDigits: 0 })} kg`],
          confidence: 80,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: sorted[sorted.length - 1][0], end: sorted[sorted.length - 1][0] },
          recommendation: `Investigar causa. ¿Evento puntual? ¿Cambio de tendencia?`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Oportunidades de Negocio ---

  detectBusinessOpportunities(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const cuboPais = BusinessIntelligenceEngine.obtenerCubo('pais', [], exportaciones, []);
    const total = cuboPais.total.pesoNeto || 1;

    // Países con volumen significativo pero baja participación de CALIRAL
    for (const entry of cuboPais.entries) {
      const pct = (entry.metricas.pesoNeto / total) * 100;
      if (pct > 2 && pct < 10 && entry.metricas.pesoNeto > 500000) {
        discoveries.push({
          id: `disc_opportunity_${entry.dimension}_${Date.now()}`,
          type: 'opportunity',
          severity: 'opportunity',
          title: `Oportunidad comercial: ${entry.dimensionLabel}`,
          description: `${entry.dimensionLabel} representa el ${pct.toFixed(1)}% del mercado con ${(entry.metricas.pesoNeto / 1000).toFixed(0)} t. Mercado de tamaño medio con espacio para crecer.`,
          evidence: [`Volumen: ${entry.metricas.pesoNeto.toLocaleString('es-UY')} kg`, `Participación: ${pct.toFixed(1)}%`],
          confidence: 75,
          entities: [{ type: 'pais', id: entry.dimension, label: entry.dimensionLabel }],
          period: { start: 'período actual', end: 'período actual' },
          recommendation: `Evaluar estrategia comercial para captar más volumen en ${entry.dimensionLabel}.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Estacionalidad ---

  detectSeasonality(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byPaisMes = this.groupByPaisMes(exportaciones);

    for (const [pais, meses] of byPaisMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length < 12) continue;

      // Agrupar por mes del año
      const byMonthOfYear = new Map<number, number[]>();
      for (const [yyyymm, val] of sorted) {
        const m = parseInt(yyyymm.split('-')[1], 10);
        if (!byMonthOfYear.has(m)) byMonthOfYear.set(m, []);
        byMonthOfYear.get(m)!.push(val);
      }

      // Calcular promedios
      const monthAvgs = new Map<number, number>();
      for (const [m, vals] of byMonthOfYear) {
        monthAvgs.set(m, vals.reduce((s, v) => s + v, 0) / vals.length);
      }

      const allAvgs = Array.from(monthAvgs.values());
      const overallAvg = allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length;
      const maxMonth = Array.from(monthAvgs.entries()).reduce((max, [m, v]) => v > max[1] ? [m, v] : max, [0, 0]);
      const minMonth = Array.from(monthAvgs.entries()).reduce((min, [m, v]) => v < min[1] ? [m, v] : min, [0, Infinity]);

      if (maxMonth[1] > overallAvg * 1.5 && minMonth[1] < overallAvg * 0.5) {
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        discoveries.push({
          id: `disc_seasonality_${pais}_${Date.now()}`,
          type: 'seasonality',
          severity: 'info',
          title: `Estacionalidad detectada: ${pais}`,
          description: `${pais} muestra un patrón estacional. Pico en ${monthNames[maxMonth[0] - 1]} (${(maxMonth[1] / 1000).toFixed(1)} t) y valle en ${monthNames[minMonth[0] - 1]} (${(minMonth[1] / 1000).toFixed(1)} t).`,
          evidence: [`Promedio anual: ${(overallAvg / 1000).toFixed(1)} t/mes`, `Mes pico: ${monthNames[maxMonth[0] - 1]} (${(maxMonth[1] / 1000).toFixed(1)} t)`, `Mes valle: ${monthNames[minMonth[0] - 1]} (${(minMonth[1] / 1000).toFixed(1)} t)`],
          confidence: 85,
          entities: [{ type: 'pais', id: pais, label: pais }],
          period: { start: sorted[0][0], end: sorted[sorted.length - 1][0] },
          recommendation: `Planificar capacidad según estacionalidad. Asegurar stock para meses pico.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Cambios de Clientes ---

  detectCustomerChanges(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byClienteMes = new Map<string, Map<string, number>>();

    for (const exp of exportaciones) {
      const cliente = exp.destino || '(sin cliente)';
      const mes = (exp.fecha || '').substring(0, 7);
      if (!mes) continue;
      if (!byClienteMes.has(cliente)) byClienteMes.set(cliente, new Map());
      byClienteMes.get(cliente)!.set(mes, (byClienteMes.get(cliente)!.get(mes) || 0) + exp.pesoNeto);
    }

    for (const [cliente, meses] of byClienteMes) {
      const sorted = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length < 4) continue;

      const lastMonth = sorted[sorted.length - 1][0];
      const lastVal = sorted[sorted.length - 1][1];
      const prevAvg = sorted.slice(0, -1).reduce((s, [, v]) => s + v, 0) / (sorted.length - 1);

      if (prevAvg > 10000 && lastVal === 0) {
        discoveries.push({
          id: `disc_customer_lost_${cliente}_${Date.now()}`,
          type: 'customer_change',
          severity: 'negative',
          title: `Cliente inactivo: ${cliente}`,
          description: `${cliente} no registró exportaciones en ${lastMonth}. Promedio anterior: ${(prevAvg / 1000).toFixed(1)} t/mes.`,
          evidence: [`Último mes activo: ${sorted[sorted.length - 2][0]}`, `Promedio mensual: ${prevAvg.toLocaleString('es-UY', { maximumFractionDigits: 0 })} kg`, `Mes actual: 0 kg`],
          confidence: 80,
          entities: [{ type: 'cliente', id: cliente, label: cliente }],
          period: { start: sorted[0][0], end: lastMonth },
          recommendation: `Contactar a ${cliente}. Investigar motivo de inactividad.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }

      if (prevAvg > 0 && lastVal > prevAvg * 2 && lastVal > 20000) {
        discoveries.push({
          id: `disc_customer_growth_${cliente}_${Date.now()}`,
          type: 'customer_change',
          severity: 'positive',
          title: `Cliente en crecimiento: ${cliente}`,
          description: `${cliente} incrementó exportaciones a ${(lastVal / 1000).toFixed(1)} t, ${((lastVal / prevAvg - 1) * 100).toFixed(0)}% sobre el promedio.`,
          evidence: [`Promedio anterior: ${prevAvg.toLocaleString('es-UY', { maximumFractionDigits: 0 })} kg`, `Mes actual: ${lastVal.toLocaleString('es-UY')} kg`],
          confidence: 85,
          entities: [{ type: 'cliente', id: cliente, label: cliente }],
          period: { start: sorted[0][0], end: lastMonth },
          recommendation: `Asegurar capacidad para sostener el crecimiento de ${cliente}.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Diversificación ---

  detectDiversification(exportaciones: Exportacion[]): Discovery[] {
    const discoveries: Discovery[] = [];
    const byEmpresaPais = new Map<string, Set<string>>();

    for (const exp of exportaciones) {
      const emp = exp.certificadoraId || '(sin empresa)';
      const pais = exp.paisDestino || '';
      if (!pais) continue;
      if (!byEmpresaPais.has(emp)) byEmpresaPais.set(emp, new Set());
      byEmpresaPais.get(emp)!.add(pais);
    }

    for (const [empresa, paises] of byEmpresaPais) {
      if (paises.size < 2) {
        discoveries.push({
          id: `disc_low_diversification_${empresa}_${Date.now()}`,
          type: 'dependency',
          severity: 'warning',
          title: `Baja diversificación: ${empresa}`,
          description: `${empresa} exporta a un solo país. Riesgo de dependencia geográfica.`,
          evidence: [`Países: ${Array.from(paises).join(', ')}`, `Cantidad: ${paises.size}`],
          confidence: 90,
          entities: [{ type: 'empresa', id: empresa, label: empresa }],
          period: { start: 'período actual', end: 'período actual' },
          recommendation: `Buscar nuevos mercados para diversificar riesgo.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      } else if (paises.size >= 10) {
        discoveries.push({
          id: `disc_high_diversification_${empresa}_${Date.now()}`,
          type: 'diversification',
          severity: 'positive',
          title: `Alta diversificación: ${empresa}`,
          description: `${empresa} exporta a ${paises.size} países. Buena diversificación geográfica.`,
          evidence: [`Países: ${paises.size}`, `Lista: ${Array.from(paises).slice(0, 5).join(', ')}...`],
          confidence: 95,
          entities: [{ type: 'empresa', id: empresa, label: empresa }],
          period: { start: 'período actual', end: 'período actual' },
          recommendation: `Mantener estrategia de diversificación.`,
          detectedAt: new Date().toISOString(),
          motor: 'DiscoveryEngine',
        });
      }
    }

    return discoveries;
  }

  // --- Timeline ---

  getTimeline(): KnowledgeTimelineEntry[] {
    return this.timeline;
  }

  // --- Helpers ---

  private groupByPaisMes(exportaciones: Exportacion[]): Map<string, Map<string, number>> {
    const map = new Map<string, Map<string, number>>();
    for (const exp of exportaciones) {
      const pais = exp.paisDestino || '(sin país)';
      const mes = (exp.fecha || '').substring(0, 7);
      if (!mes) continue;
      if (!map.has(pais)) map.set(pais, new Map());
      map.get(pais)!.set(mes, (map.get(pais)!.get(mes) || 0) + exp.pesoNeto);
    }
    return map;
  }
}

// --- Singleton ---

export const DiscoveryEngine = new DiscoveryEngineImpl();
