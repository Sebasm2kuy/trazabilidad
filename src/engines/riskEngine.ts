// ============================================================
// RISK ENGINE — Motor de Inteligencia Operativa
// ------------------------------------------------------------
// ETI-07: Mide impacto, probabilidad, prioridad y consecuencia.
// NO busca errores (eso lo hace Integrity Engine).
// Transforma miles de registros en prioridades de negocio.
// ============================================================

import type { TraceNode, RiesgoNivel, Alerta } from '@/domain';
import { TraceGraph } from './traceGraphEngine';
import { IntegrityEngine, type AlertaIntegridad } from './integrityEngine';
import { KPIEngine } from './kpiEngine';

// --- Configuración de pesos ---

export interface RiskConfig {
  // Pesos por dimensión (0-100)
  pesoOperativa: number;
  pesoEconomica: number;
  pesoTemporal: number;
  pesoDocumental: number;
  pesoHistorica: number;
  pesoLogistica: number;
  // Pesos por tipo de problema
  pesoSobreexportacion: number;
  pesoSaldoNegativo: number;
  pesoDocDuplicado: number;
  pesoPesoInconsistente: number;
  pesoSinIngreso: number;
  pesoInmovilizado: number;
  pesoClienteEstrategico: number;
  pesoReincidencia: number;
  // Multiplicadores
  multReincidencia: number;     // cuánto aumenta el riesgo por repetición
  multClienteEstrategico: number; // multiplicador si involucra a NIREA
  multPesoAlto: number;          // multiplicador si el peso > umbral
  umbralPesoAlto: number;        // kg
  // Tolerancias
  diasInmovilizado: number;
  diasReincidencia: number;      // ventana para considerar reincidencia
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  pesoOperativa: 30,
  pesoEconomica: 25,
  pesoTemporal: 15,
  pesoDocumental: 15,
  pesoHistorica: 10,
  pesoLogistica: 5,
  pesoSobreexportacion: 40,
  pesoSaldoNegativo: 35,
  pesoDocDuplicado: 25,
  pesoPesoInconsistente: 20,
  pesoSinIngreso: 30,
  pesoInmovilizado: 15,
  pesoClienteEstrategico: 20,
  pesoReincidencia: 10,
  multReincidencia: 1.5,
  multClienteEstrategico: 1.3,
  multPesoAlto: 1.2,
  umbralPesoAlto: 50000,
  diasInmovilizado: 180,
  diasReincidencia: 30,
};

// --- Tipos de salida ---

export interface RiesgoNodo {
  nodoId: string;
  nroCote: string;
  score: number;           // 0-100
  nivel: RiesgoNivel;
  motivos: MotivoRiesgo[];
  acciones: string[];
  scoreAnterior: number | null;
  tendencia: number | null; // delta vs cálculo anterior
}

export interface MotivoRiesgo {
  dimension: 'operativa' | 'economica' | 'temporal' | 'documental' | 'historica' | 'logistica';
  tipo: string;
  descripcion: string;
  peso: number;
  impacto: string;
}

export interface RankingRiesgo<T = string> {
  entidadId: T;
  entidadLabel: string;
  score: number;
  nivel: RiesgoNivel;
  alertas: number;
  reincidentes: number;
  integridadPromedio: number;
  pesoComprometido: number;
  cotes: number;
}

export interface InsightRiesgo {
  id: string;
  titulo: string;
  descripcion: string;
  datosUtilizados: string;
  periodoAnalizado: string;
  confianza: number; // 0-100
  severidad: 'info' | 'warning' | 'error';
}

export interface ResultadoRiesgoGlobal {
  scoreGlobal: number;
  nivelGlobal: RiesgoNivel;
  scoreAnterior: number | null;
  tendencia: number | null;
  topRiesgos: RiesgoNodo[];
  rankingProductores: RankingRiesgo[];
  rankingCertificadoras: RankingRiesgo[];
  rankingClientes: RankingRiesgo[];
  rankingDepositos: RankingRiesgo[];
  insights: InsightRiesgo[];
  totalAlertas: number;
  totalReincidentes: number;
}

// --- Implementación ---

class RiskEngineImpl {
  private config: RiskConfig = DEFAULT_RISK_CONFIG;
  private historicoScores: Map<string, number[]> = new Map(); // nodoId → [scores previos]
  private ultimoResultado: ResultadoRiesgoGlobal | null = null;

  setConfig(config: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RiskConfig {
    return this.config;
  }

  // --- Riesgo por nodo ---

  obtenerRiesgoNodo(node: TraceNode, alertas: AlertaIntegridad[]): RiesgoNodo {
    const motivos: MotivoRiesgo[] = [];
    const acciones: string[] = [];
    let score = 0;

    const isNirea = (node.productor || '').toUpperCase().includes('NIREA') ||
                    (node.certificadora || '').toUpperCase().includes('NIREA');
    const pesoInvolucrado = node.stock.ingresoPn + node.stock.exportadoPn;

    // --- Dimensión Operativa ---
    if (node.stock.exportadoCajas > node.stock.ingresoCajas && node.stock.ingresoCajas > 0) {
      const peso = this.config.pesoSobreexportacion;
      score += peso;
      motivos.push({ dimension: 'operativa', tipo: 'sobreexportacion', descripcion: `Exportado ${node.stock.exportadoCajas} cajas vs ingresado ${node.stock.ingresoCajas}`, peso, impacto: 'Sobreexportación: se exportó más de lo ingresado' });
      acciones.push('Verificar ingreso relacionado.');
    }

    if (node.stock.saldoCajas < 0) {
      const peso = this.config.pesoSaldoNegativo;
      score += peso;
      motivos.push({ dimension: 'operativa', tipo: 'saldo_negativo', descripcion: `Saldo: ${node.stock.saldoCajas} cajas`, peso, impacto: 'Saldo negativo: posible pérdida de mercadería' });
      acciones.push('Conciliar movimientos.');
    }

    if (!node.ingreso && node.exportaciones.length > 0) {
      const peso = this.config.pesoSinIngreso;
      score += peso;
      motivos.push({ dimension: 'operativa', tipo: 'sin_ingreso', descripcion: 'Exportación sin ingreso', peso, impacto: 'No se puede verificar el origen' });
      acciones.push('Vincular o crear ingreso faltante.');
    }

    // --- Dimensión Económica ---
    if (pesoInvolucrado > this.config.umbralPesoAlto) {
      score *= this.config.multPesoAlto;
      motivos.push({ dimension: 'economica', tipo: 'peso_alto', descripcion: `${(pesoInvolucrado / 1000).toFixed(1)} t involucradas`, peso: 10, impacto: 'Alto valor económico en riesgo' });
    }

    if (isNirea) {
      score *= this.config.multClienteEstrategico;
      motivos.push({ dimension: 'economica', tipo: 'cliente_estrategico', descripcion: 'Involucra cliente estratégico NIREA', peso: this.config.pesoClienteEstrategico, impacto: 'Cliente estratégico afectado' });
    }

    // --- Dimensión Temporal ---
    if (node.ingreso && node.ingreso.fecha && node.stock.saldoCajas > 0) {
      const dias = Math.floor((Date.now() - new Date(node.ingreso.fecha).getTime()) / (1000 * 60 * 60 * 24));
      if (dias > this.config.diasInmovilizado) {
        const peso = this.config.pesoInmovilizado;
        score += peso;
        motivos.push({ dimension: 'temporal', tipo: 'inmovilizado', descripcion: `${dias} días sin movimiento`, peso, impacto: 'Stock inmovilizado' });
        acciones.push('Gestionar retorno o reasignar destino.');
      }
    }

    // --- Dimensión Documental ---
    const docDups = alertas.filter(a => a.tipo === 'doc_duplicado');
    if (docDups.length > 0) {
      const peso = this.config.pesoDocDuplicado;
      score += peso;
      motivos.push({ dimension: 'documental', tipo: 'doc_duplicado', descripcion: `${docDups.length} documento(s) duplicado(s)`, peso, impacto: 'Posible doble exportación' });
      acciones.push('Verificar y eliminar duplicados.');
    }

    // --- Dimensión Histórica (reincidencia) ---
    const historico = this.historicoScores.get(node.id) || [];
    if (historico.length >= 2) {
      const recientes = historico.slice(-5);
      const reincidentes = recientes.filter(s => s > 40).length;
      if (reincidentes >= 2) {
        score *= this.config.multReincidencia;
        motivos.push({ dimension: 'historica', tipo: 'reincidencia', descripcion: `${reincidentes} alertas repetidas en últimos cálculos`, peso: this.config.pesoReincidencia * reincidentes, impacto: 'Problema recurrente' });
        acciones.push('Auditar sistemáticamente este COTE.');
      }
    }

    // --- Limitar score ---
    score = Math.min(100, Math.max(0, Math.round(score)));

    // --- Nivel ---
    const nivel = this.scoreToNivel(score);

    // --- Guardar histórico ---
    historico.push(score);
    if (historico.length > 20) historico.shift();
    this.historicoScores.set(node.id, historico);

    // --- Tendencia ---
    const scoreAnterior = historico.length > 1 ? historico[historico.length - 2] : null;
    const tendencia = scoreAnterior !== null ? score - scoreAnterior : null;

    if (acciones.length === 0) {
      acciones.push('Sin acción requerida.');
    }

    return { nodoId: node.id, nroCote: node.nroCote, score, nivel, motivos, acciones, scoreAnterior, tendencia };
  }

  // --- Riesgo global ---

  obtenerRiesgoGlobal(): ResultadoRiesgoGlobal {
    const startTime = Date.now();
    const integrityResult = IntegrityEngine.validarTodo();
    const nodes: TraceNode[] = [];

    for (const node of (TraceGraph as any).nodes?.values() || []) {
      nodes.push(node as TraceNode);
    }

    // Riesgo por nodo
    const riesgosNodo: RiesgoNodo[] = [];
    for (const node of nodes) {
      const nodeAlertas = integrityResult.alertas.filter(a => a.nodoId === node.id);
      const riesgo = this.obtenerRiesgoNodo(node, nodeAlertas);
      riesgosNodo.push(riesgo);
    }

    // Score global
    const scoreGlobal = nodes.length > 0
      ? riesgosNodo.reduce((s, r) => s + r.score, 0) / nodes.length
      : 0;
    const nivelGlobal = this.scoreToNivel(scoreGlobal);

    // Top 10 riesgos
    const topRiesgos = riesgosNodo
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Rankings por entidad
    const rankingProductores = this.calcularRanking(nodes, riesgosNodo, n => n.productor);
    const rankingCertificadoras = this.calcularRanking(nodes, riesgosNodo, n => n.certificadora);
    const rankingClientes = this.calcularRanking(nodes, riesgosNodo, n => n.cliente || '');
    const rankingDepositos = this.calcularRanking(nodes, riesgosNodo, n => n.ingreso?.deposito || '');

    // Insights
    const insights = this.generarInsights(nodes, riesgosNodo, integrityResult.alertas);

    // Tendencia global
    const scoreAnterior = this.ultimoResultado?.scoreGlobal ?? null;
    const tendencia = scoreAnterior !== null ? scoreGlobal - scoreAnterior : null;

    const totalReincidentes = riesgosNodo.filter(r => r.motivos.some(m => m.tipo === 'reincidencia')).length;

    const resultado: ResultadoRiesgoGlobal = {
      scoreGlobal,
      nivelGlobal,
      scoreAnterior,
      tendencia,
      topRiesgos,
      rankingProductores: rankingProductores.slice(0, 10),
      rankingCertificadoras: rankingCertificadoras.slice(0, 10),
      rankingClientes: rankingClientes.slice(0, 10),
      rankingDepositos: rankingDepositos.slice(0, 10),
      insights,
      totalAlertas: integrityResult.alertas.length,
      totalReincidentes,
    };

    this.ultimoResultado = resultado;
    return resultado;
  }

  // --- Ranking por entidad ---

  private calcularRanking(
    nodes: TraceNode[],
    riesgos: RiesgoNodo[],
    keyFn: (node: TraceNode) => string
  ): RankingRiesgo[] {
    const map = new Map<string, { label: string; scores: number[]; alertas: number; peso: number; cotes: number; integridad: number[] }>();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const riesgo = riesgos[i];
      const key = keyFn(node);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { label: key, scores: [], alertas: 0, peso: 0, cotes: 0, integridad: [] });
      }
      const e = map.get(key)!;
      e.scores.push(riesgo.score);
      e.alertas += node.alertas.length;
      e.peso += node.stock.ingresoPn + node.stock.exportadoPn;
      e.cotes++;
      e.integridad.push(node.integridadScore);
    }

    return Array.from(map.entries())
      .map(([id, v]) => {
        const score = v.scores.reduce((s, x) => s + x, 0) / v.scores.length;
        const integridadProm = v.integridad.reduce((s, x) => s + x, 0) / v.integridad.length;
        return {
          entidadId: id,
          entidadLabel: v.label,
          score: Math.round(score),
          nivel: this.scoreToNivel(score),
          alertas: v.alertas,
          reincidentes: v.scores.filter(s => s > 60).length,
          integridadPromedio: Math.round(integridadProm),
          pesoComprometido: v.peso,
          cotes: v.cotes,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  // --- Insights automáticos ---

  private generarInsights(nodes: TraceNode[], riesgos: RiesgoNodo[], alertas: AlertaIntegridad[]): InsightRiesgo[] {
    const insights: InsightRiesgo[] = [];

    // 1. Concentración de riesgo en pocos COTEs
    const riesgosOrdenados = [...riesgos].sort((a, b) => b.score - a.score);
    const top5Score = riesgosOrdenados.slice(0, 5).reduce((s, r) => s + r.score, 0);
    const totalScore = riesgosOrdenados.reduce((s, r) => s + r.score, 0);
    if (totalScore > 0 && top5Score / totalScore > 0.5) {
      insights.push({
        id: 'ins-concentracion-cote',
        titulo: '5 COTEs concentran más del 50% del riesgo total',
        descripcion: `Los 5 COTEs con mayor riesgo representan el ${((top5Score / totalScore) * 100).toFixed(0)}% del riesgo de la plataforma.`,
        datosUtilizados: `${riesgosOrdenados.length} COTEs analizados`,
        periodoAnalizado: 'Actual',
        confianza: 95,
        severidad: 'warning',
      });
    }

    // 2. Productor con más inconsistencias
    const productorAlertas = new Map<string, number>();
    for (const a of alertas) {
      const node = nodes.find(n => n.id === a.nodoId);
      if (node?.productor) {
        productorAlertas.set(node.productor, (productorAlertas.get(node.productor) || 0) + 1);
      }
    }
    const topProductor = Array.from(productorAlertas.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topProductor && topProductor[1] > 3) {
      insights.push({
        id: 'ins-productor-alertas',
        titulo: `${topProductor[0]} concentra ${topProductor[1]} alertas`,
        descripcion: `El productor "${topProductor[0]}" genera ${topProductor[1]} alertas de integridad. Representa el mayor riesgo documental.`,
        datosUtilizados: `${alertas.length} alertas totales`,
        periodoAnalizado: 'Actual',
        confianza: 90,
        severidad: 'warning',
      });
    }

    // 3. Depósito con más stock inmovilizado
    const depositoInmovilizado = new Map<string, number>();
    for (const node of nodes) {
      if (node.ingreso && node.ingreso.fecha && node.stock.saldoCajas > 0) {
        const dias = Math.floor((Date.now() - new Date(node.ingreso.fecha).getTime()) / (1000 * 60 * 60 * 24));
        if (dias > this.config.diasInmovilizado) {
          const dep = node.ingreso.deposito;
          depositoInmovilizado.set(dep, (depositoInmovilizado.get(dep) || 0) + node.stock.saldoPn);
        }
      }
    }
    const topDeposito = Array.from(depositoInmovilizado.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topDeposito && topDeposito[1] > 10000) {
      insights.push({
        id: 'ins-deposito-inmovilizado',
        titulo: `${topDeposito[0]} acumula ${(topDeposito[1] / 1000).toFixed(1)} t inmovilizadas`,
        descripcion: `El depósito "${topDeposito[0]}" concentra la mayor cantidad de mercadería inmovilizada (>180 días).`,
        datosUtilizados: `${depositoInmovilizado.size} depósitos analizados`,
        periodoAnalizado: 'Actual',
        confianza: 92,
        severidad: 'warning',
      });
    }

    // 4. Tendencia global
    if (this.ultimoResultado) {
      const delta = riesgos.reduce((s, r) => s + (r.tendencia || 0), 0) / riesgos.length;
      if (Math.abs(delta) > 2) {
        insights.push({
          id: 'ins-tendencia',
          titulo: `El riesgo global ${delta > 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(delta).toFixed(1)} puntos`,
          descripcion: `Tendencia ${delta > 0 ? 'negativa' : 'positiva'} en el riesgo promedio de la plataforma.`,
          datosUtilizados: `${riesgos.length} COTEs comparados`,
          periodoAnalizado: 'Últimos 2 cálculos',
          confianza: 85,
          severidad: delta > 0 ? 'warning' : 'info',
        });
      }
    }

    return insights;
  }

  // --- Top riesgos ---

  obtenerTopRiesgos(limit: number = 10): RiesgoNodo[] {
    if (!this.ultimoResultado) {
      this.obtenerRiesgoGlobal();
    }
    return this.ultimoResultado?.topRiesgos.slice(0, limit) || [];
  }

  // --- Recalcular nodo ---

  recalcularNodo(node: TraceNode, alertas: AlertaIntegridad[]): RiesgoNodo {
    return this.obtenerRiesgoNodo(node, alertas);
  }

  // --- Obtener insights ---

  obtenerInsights(): InsightRiesgo[] {
    if (!this.ultimoResultado) {
      this.obtenerRiesgoGlobal();
    }
    return this.ultimoResultado?.insights || [];
  }

  // --- Obtener tendencias ---

  obtenerTendencias(): { kpiId: string; label: string; valores: { fecha: string; valor: number }[] }[] {
    const kpis = KPIEngine.obtenerTodos();
    return kpis
      .filter(k => k.grupo === 'F_estrategico')
      .map(k => {
        const hist = KPIEngine.obtenerHistorico(k.id);
        return {
          kpiId: k.id,
          label: k.nombre,
          valores: hist.map(h => ({ fecha: h.timestamp, valor: h.valor })),
        };
      });
  }

  // --- Helper ---

  private scoreToNivel(score: number): RiesgoNivel {
    if (score <= 20) return 'MUY_BAJO';
    if (score <= 40) return 'BAJO';
    if (score <= 60) return 'MEDIO';
    if (score <= 80) return 'ALTO';
    return 'CRITICO';
  }

  // --- Compatibilidad con interfaz existente ---

  assess(stock: any[], ingresos: any[], exportaciones: any[]): Alerta[] {
    const result = this.obtenerRiesgoGlobal();
    return result.topRiesgos.map(r => ({
      id: `risk-${r.nodoId}`,
      categoria: 'anomalia' as any,
      prioridad: r.nivel.toLowerCase() as any,
      titulo: `Riesgo ${r.nivel}: ${r.nroCote}`,
      descripcion: r.motivos.map(m => `${m.descripcion} (${m.impacto})`).join('; '),
      entidad: { tipo: 'cote', id: r.nodoId, label: r.nroCote },
      accionSugerida: r.acciones.join(' '),
      detectadaEn: new Date().toISOString(),
    })) as Alerta[];
  }

  detectConcentration(stock: any[]): Alerta[] { return []; }
  detectDependency(exportaciones: any[]): Alerta[] { return []; }
}

// --- Singleton ---

export const RiskEngine = new RiskEngineImpl();
