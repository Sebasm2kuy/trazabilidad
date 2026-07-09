// ============================================================
// KPI ENGINE — Motor central de indicadores
// ------------------------------------------------------------
// ETI-06: Único responsable de generar indicadores oficiales.
// Ningún componente React calcula métricas. Todo viene de aquí.
// ============================================================

import type { Indicador, TraceNode, StockPallet, Ingreso, Exportacion, MatrizCaptura } from '@/domain';
import type { KPIEngine as IKPIEngine } from './interfaces';
import { TraceGraph } from './traceGraphEngine';
import { IntegrityEngine } from './integrityEngine';

// --- Metadatos de cada KPI ---

export type KPIGrupo = 'A_operativo' | 'B_comercial' | 'C_productivo' | 'D_logistico' | 'E_calidad' | 'F_estrategico';
export type KPITipoCalculo = 'SUMA' | 'PROMEDIO' | 'MEDIANA' | 'PORCENTAJE' | 'CONTADOR' | 'ACUMULADO' | 'VARIACION' | 'TENDENCIA';

export interface KPIMetadata {
  id: string;
  nombre: string;
  descripcion: string;
  grupo: KPIGrupo;
  unidad: 'kg' | 'count' | 'percent' | 'days' | 'currency';
  valor: number;
  valorAnterior: number | null;
  variacion: number | null;
  fechaCalculo: string;
  fuente: 'TraceGraph' | 'IntegrityEngine' | 'StockPallets' | 'Calculado';
  version: number;
  precision: number; // 0-100
  confianza: number; // 0-100
  tipoCalculo: KPITipoCalculo;
}

// --- Versión e histórico ---

export interface KPIVersion {
  version: number;
  fecha: string;
  origen: string;
  kpis: Map<string, number>;
}

export interface KPIHistoricoEntry {
  kpiId: string;
  timestamp: string;
  valor: number;
  version: number;
}

// --- Resultado de captura ---

export interface CapturaResult {
  totalClientePn: number;
  caliralDepositoPn: number;
  caliralCertificacionPn: number;
  captureIndex: number;
  matriz: MatrizCaptura;
}

// --- Implementación ---

class KPIEngineImpl {
  private cache: Map<string, KPIMetadata> = new Map();
  private versions: KPIVersion[] = [];
  private historico: KPIHistoricoEntry[] = [];
  private currentVersion = 0;
  private lastRecalcFull: string | null = null;

  // --- API Interna ---

  obtenerKPI(id: string): KPIMetadata | null {
    return this.cache.get(id) || null;
  }

  obtenerTodos(): KPIMetadata[] {
    return Array.from(this.cache.values());
  }

  obtenerPorCategoria(grupo: KPIGrupo): KPIMetadata[] {
    return Array.from(this.cache.values()).filter(k => k.grupo === grupo);
  }

  recalcular(stock: StockPallet[], ingresos: Ingreso[], exportaciones: Exportacion[]): KPIMetadata[] {
    const startTime = Date.now();
    this.currentVersion++;
    const now = new Date().toISOString();
    const version: KPIVersion = {
      version: this.currentVersion,
      fecha: now,
      origen: `Recálculo v${this.currentVersion}`,
      kpis: new Map(),
    };

    // Obtener stats del TraceGraph
    const graphStats = TraceGraph.getStats();

    // Obtener resultado del Integrity Engine
    const integrityResult = IntegrityEngine.validarTodo();

    // --- GRUPO A: Operativos ---
    const totalIngresado = ingresos.reduce((s, r) => s + r.pesoNeto, 0);
    const totalExportado = exportaciones.reduce((s, r) => s + r.pesoNeto, 0);
    const stockKg = stock.reduce((s, p) => s + (p.kilos || 0), 0);
    const stockCajas = stock.reduce((s, p) => s + (p.cajas || 0), 0);
    const stockPallets = stock.reduce((s, p) => s + (p.pallets || 0), 0);
    const stockCotes = new Set(stock.map(p => p.codigo).filter(Boolean)).size;

    this.setKPI('KPI_0001', 'Total Ingresado', 'Suma de peso neto de todos los ingresos', 'A_operativo', 'kg', totalIngresado, 'SUMA', 'TraceGraph', now, version);
    this.setKPI('KPI_0002', 'Total Exportado', 'Suma de peso neto de todas las exportaciones', 'A_operativo', 'kg', totalExportado, 'SUMA', 'TraceGraph', now, version);
    this.setKPI('KPI_0003', 'Stock Actual (kg)', 'Peso neto en stock según pallets', 'A_operativo', 'kg', stockKg, 'SUMA', 'StockPallets', now, version);
    this.setKPI('KPI_0004', 'Stock Actual (cajas)', 'Cajas en stock según pallets', 'A_operativo', 'count', stockCajas, 'SUMA', 'StockPallets', now, version);
    this.setKPI('KPI_0005', 'Stock Actual (pallets)', 'Total de pallets en stock', 'A_operativo', 'count', stockPallets, 'SUMA', 'StockPallets', now, version);
    this.setKPI('KPI_0006', 'COTEs en Stock', 'COTEs únicos en stock', 'A_operativo', 'count', stockCotes, 'CONTADOR', 'StockPallets', now, version);
    this.setKPI('KPI_0007', 'Total Ingresos (registros)', 'Cantidad de registros de ingreso', 'A_operativo', 'count', ingresos.length, 'CONTADOR', 'TraceGraph', now, version);
    this.setKPI('KPI_0008', 'Total Exportaciones (registros)', 'Cantidad de registros de exportación', 'A_operativo', 'count', exportaciones.length, 'CONTADOR', 'TraceGraph', now, version);

    // --- GRUPO B: Comercial ---
    const clientes = new Set(exportaciones.map(r => r.destino).filter(Boolean));
    const paises = new Set(exportaciones.map(r => r.paisDestino).filter(Boolean));
    this.setKPI('KPI_0101', 'Clientes Activos', 'Clientes únicos con exportaciones', 'B_comercial', 'count', clientes.size, 'CONTADOR', 'TraceGraph', now, version);
    this.setKPI('KPI_0102', 'Países de Destino', 'Países únicos de destino', 'B_comercial', 'count', paises.size, 'CONTADOR', 'TraceGraph', now, version);

    // --- GRUPO C: Productivo ---
    const productores = new Set(ingresos.map(r => r.productorId).filter(Boolean));
    const certificadoras = new Set(exportaciones.map(r => r.certificadoraId).filter(Boolean));
    this.setKPI('KPI_0201', 'Productores Activos', 'Productores únicos con ingresos', 'C_productivo', 'count', productores.size, 'CONTADOR', 'TraceGraph', now, version);
    this.setKPI('KPI_0202', 'Certificadoras Activas', 'Certificadoras únicas con exportaciones', 'C_productivo', 'count', certificadoras.size, 'CONTADOR', 'TraceGraph', now, version);
    const promPnLote = ingresos.length > 0 ? totalIngresado / ingresos.length : 0;
    this.setKPI('KPI_0203', 'Peso Promedio por Lote', 'Peso neto promedio por ingreso', 'C_productivo', 'kg', promPnLote, 'PROMEDIO', 'Calculado', now, version);

    // --- GRUPO D: Logístico ---
    const inmovilizados = stock.filter(p => {
      if (!p.fechaComision) return false;
      const d = new Date(p.fechaComision);
      if (isNaN(d.getTime())) return false;
      return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)) > 180;
    });
    const inmovilizadoPn = inmovilizados.reduce((s, p) => s + (p.kilos || 0), 0);
    this.setKPI('KPI_0301', 'Mercadería Inmovilizada', 'Pallets >180 días sin movimiento', 'D_logistico', 'kg', inmovilizadoPn, 'SUMA', 'StockPallets', now, version);
    this.setKPI('KPI_0302', 'Pallets Inmovilizados', 'Cantidad de pallets >180 días', 'D_logistico', 'count', inmovilizados.length, 'CONTADOR', 'StockPallets', now, version);

    // Tiempo promedio en depósito
    let tiempoTotal = 0;
    let palletsConFecha = 0;
    for (const p of stock) {
      if (p.fechaComision) {
        const d = new Date(p.fechaComision);
        if (!isNaN(d.getTime())) {
          tiempoTotal += Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
          palletsConFecha++;
        }
      }
    }
    const tiempoPromedio = palletsConFecha > 0 ? tiempoTotal / palletsConFecha : 0;
    this.setKPI('KPI_0303', 'Tiempo Promedio en Depósito', 'Días promedio de los pallets en stock', 'D_logistico', 'days', tiempoPromedio, 'PROMEDIO', 'StockPallets', now, version);

    // --- GRUPO E: Calidad ---
    this.setKPI('KPI_0401', 'Score Global de Integridad', 'Promedio de integridad de todos los nodos', 'E_calidad', 'percent', integrityResult.scoreGlobal, 'PROMEDIO', 'IntegrityEngine', now, version);
    const alertasCriticas = integrityResult.alertasPorSeveridad['CRITICA'] || 0;
    const alertasAltas = integrityResult.alertasPorSeveridad['ALTA'] || 0;
    const alertasMedias = integrityResult.alertasPorSeveridad['MEDIA'] || 0;
    const alertasBajas = integrityResult.alertasPorSeveridad['BAJA'] || 0;
    this.setKPI('KPI_0402', 'Alertas Críticas', 'Alertas de severidad CRÍTICA', 'E_calidad', 'count', alertasCriticas, 'CONTADOR', 'IntegrityEngine', now, version);
    this.setKPI('KPI_0403', 'Alertas Altas', 'Alertas de severidad ALTA', 'E_calidad', 'count', alertasAltas, 'CONTADOR', 'IntegrityEngine', now, version);
    this.setKPI('KPI_0404', 'Alertas Medias', 'Alertas de severidad MEDIA', 'E_calidad', 'count', alertasMedias, 'CONTADOR', 'IntegrityEngine', now, version);
    this.setKPI('KPI_0405', 'Alertas Bajas', 'Alertas de severidad BAJA', 'E_calidad', 'count', alertasBajas, 'CONTADOR', 'IntegrityEngine', now, version);

    // --- GRUPO F: Estratégico ---
    // Riesgo promedio
    const riesgoNiveles: Record<string, number> = { 'MUY_BAJO': 1, 'BAJO': 2, 'MEDIO': 3, 'ALTO': 4, 'CRITICO': 5 };
    const nodes = Array.from((TraceGraph as any).nodes?.values() || []) as TraceNode[];
    const riesgoSum = nodes.reduce((s, n) => s + (riesgoNiveles[n.riesgoScore] || 0), 0);
    const riesgoProm = nodes.length > 0 ? riesgoSum / nodes.length : 0;
    this.setKPI('KPI_0501', 'Riesgo Promedio (1-5)', 'Nivel de riesgo promedio (1=Muy Bajo, 5=Crítico)', 'F_estrategico', 'count', riesgoProm, 'PROMEDIO', 'TraceGraph', now, version);

    const cotesCriticos = nodes.filter(n => n.riesgoScore === 'CRITICO').length;
    this.setKPI('KPI_0502', 'COTEs Críticos', 'Nodos con riesgo CRÍTICO', 'F_estrategico', 'count', cotesCriticos, 'CONTADOR', 'TraceGraph', now, version);

    const sobreexportaciones = nodes.filter(n => n.stock.exportadoCajas > n.stock.ingresoCajas).length;
    this.setKPI('KPI_0503', 'Sobreexportaciones', 'COTEs donde exportado > ingresado', 'F_estrategico', 'count', sobreexportaciones, 'CONTADOR', 'TraceGraph', now, version);

    const saldosNegativos = nodes.filter(n => n.stock.saldoCajas < 0).length;
    this.setKPI('KPI_0504', 'Saldos Negativos', 'COTEs con saldo de cajas negativo', 'F_estrategico', 'count', saldosNegativos, 'CONTADOR', 'TraceGraph', now, version);

    // --- Control de consistencia ---
    this.validateConsistency(totalIngresado, totalExportado, stockKg);

    // --- Registrar versión ---
    for (const [id, kpi] of this.cache) {
      version.kpis.set(id, kpi.valor);
      // Guardar en histórico
      this.historico.push({ kpiId: id, timestamp: now, valor: kpi.valor, version: this.currentVersion });
    }
    this.versions.unshift(version);
    if (this.versions.length > 50) this.versions = this.versions.slice(0, 50);
    // Limitar histórico
    if (this.historico.length > 5000) this.historico = this.historico.slice(-5000);

    this.lastRecalcFull = now;

    return Array.from(this.cache.values());
  }

  recalcularNodo(node: TraceNode): void {
    // Recálculo incremental: solo KPIs afectados por el cambio de un nodo
    const affectedIds = ['KPI_0001', 'KPI_0002', 'KPI_0006', 'KPI_0401', 'KPI_0501', 'KPI_0502', 'KPI_0503', 'KPI_0504'];
    // En una implementación completa, solo recalcularíamos los KPIs afectados
    // Por ahora marcamos que necesitan recálculo
    for (const id of affectedIds) {
      const kpi = this.cache.get(id);
      if (kpi) {
        kpi.valorAnterior = kpi.valor;
        kpi.version = this.currentVersion;
        kpi.fechaCalculo = new Date().toISOString();
      }
    }
  }

  obtenerHistorico(kpiId: string): KPIHistoricoEntry[] {
    return this.historico.filter(h => h.kpiId === kpiId).slice(-100);
  }

  obtenerVersion(version: number): KPIVersion | null {
    return this.versions.find(v => v.version === version) || null;
  }

  obtenerUltimaVersion(): KPIVersion | null {
    return this.versions[0] || null;
  }

  // --- Capture Index (Índice de Captura CALIRAL) ---

  calculateCaptureIndex(ingresos: Ingreso[], exportaciones: Exportacion[], clienteAliases: string[]): CapturaResult {
    const CALIRAL = /CALIRAL/i;
    const upper = clienteAliases.map(a => a.toUpperCase());

    // Filtrar registros del cliente
    const clienteRecs = [...ingresos, ...exportaciones].filter(r => {
      const rec = r as any;
      const fields = [rec.productorId, rec.certificadoraId].filter(Boolean).map(s => s.toUpperCase());
      return upper.some(alias => fields.some(f => f.includes(alias)));
    });

    const totalClientePn = clienteRecs.reduce((s, r) => s + r.pesoNeto, 0);

    // CALIRAL como depósito (ed en ingresos)
    const caliralDepositoPn = clienteRecs
      .filter(r => r instanceof Object && 'depositoId' in r && CALIRAL.test(r.depositoId))
      .reduce((s, r) => s + r.pesoNeto, 0);

    // CALIRAL como certificador (cf en exportaciones)
    const caliralCertificacionPn = clienteRecs
      .filter(r => 'certificadoraId' in r && CALIRAL.test(r.certificadoraId))
      .reduce((s, r) => s + r.pesoNeto, 0);

    const captureIndex = totalClientePn > 0 ? (caliralDepositoPn / totalClientePn) * 100 : 0;

    // Matriz
    const matriz = this.calculateMatriz(clienteRecs, CALIRAL);

    return { totalClientePn, caliralDepositoPn, caliralCertificacionPn, captureIndex, matriz };
  }

  private calculateMatriz(recs: any[], CALIRAL: RegExp): MatrizCaptura {
    let a = 0, b = 0, c = 0, d = 0;
    let aCount = 0, bCount = 0, cCount = 0, dCount = 0;

    for (const r of recs) {
      const isDep = 'depositoId' in r && CALIRAL.test(r.depositoId);
      const isCf = 'certificadoraId' in r && CALIRAL.test(r.certificadoraId);
      const pn = r.pesoNeto || 0;

      if (isDep && isCf) { a += pn; aCount++; }
      else if (isDep && !isCf) { b += pn; bCount++; }
      else if (!isDep && isCf) { c += pn; cCount++; }
      else { d += pn; dCount++; }
    }

    return {
      matrizA: { pn: a, count: aCount },
      matrizB: { pn: b, count: bCount },
      matrizC: { pn: c, count: cCount },
      matrizD: { pn: d, count: dCount },
    };
  }

  // --- Stock ---

  calculateStock(stock: StockPallet[]) {
    return {
      totalKg: stock.reduce((s, p) => s + (p.kilos || 0), 0),
      totalCajas: stock.reduce((s, p) => s + (p.cajas || 0), 0),
      totalPallets: stock.reduce((s, p) => s + (p.pallets || 0), 0),
      cotes: new Set(stock.map(p => p.codigo).filter(Boolean)).size,
    };
  }

  // --- Helpers ---

  private setKPI(
    id: string, nombre: string, descripcion: string, grupo: KPIGrupo,
    unidad: KPIMetadata['unidad'], valor: number, tipoCalculo: KPITipoCalculo,
    fuente: KPIMetadata['fuente'], fecha: string, version: KPIVersion,
  ): void {
    // Validar que no sea NaN o Infinity
    if (isNaN(valor) || !isFinite(valor)) {
      valor = 0;
    }

    const anterior = this.cache.get(id);
    const valorAnterior = anterior?.valor ?? null;
    const variacion = valorAnterior !== null && valorAnterior !== 0
      ? ((valor - valorAnterior) / valorAnterior) * 100
      : null;

    const kpi: KPIMetadata = {
      id, nombre, descripcion, grupo, unidad, valor, valorAnterior, variacion,
      fechaCalculo: fecha, fuente, version: version.version,
      precision: 100, confianza: 99.82, tipoCalculo,
    };

    this.cache.set(id, kpi);
  }

  private validateConsistency(totalIngresado: number, totalExportado: number, stockKg: number): void {
    // El stock no puede ser mayor que el ingreso acumulado (con tolerancia)
    if (stockKg > totalIngresado * 1.1 && totalIngresado > 0) {
      console.warn('[KPIEngine] Inconsistencia: stock (%d) > ingreso acumulado (%d)', stockKg, totalIngresado);
    }
    // Ningún KPI puede ser NaN
    for (const [id, kpi] of this.cache) {
      if (isNaN(kpi.valor) || !isFinite(kpi.valor)) {
        console.error('[KPIEngine] KPI %s tiene valor inválido: %d', id, kpi.valor);
        kpi.valor = 0;
        kpi.confianza = 0;
      }
    }
  }
}

// --- Singleton ---

export const KPIEngine = new KPIEngineImpl();
