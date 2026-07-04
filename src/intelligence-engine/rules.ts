// ============================================================
// RULES ENGINE — Genera alertas automáticas
// ------------------------------------------------------------
// Reglas puras. No dependen de React. Cada regla toma un contexto
// de datos y devuelve Alert[].
// ============================================================

import type { StockItem, Alert, AlertCategory, AlertPriority, Producer, Warehouse } from '@/domain/types';

export interface RulesContext {
  stock: StockItem[];
  productores: Producer[];
  depositos: Warehouse[];
  /** Fecha de corte para cálculos de antigüedad. Default: ahora. */
  now?: Date;
}

type Rule = (ctx: RulesContext) => Alert[];

const DAY_MS = 1000 * 60 * 60 * 24;
const THRESHOLDS = {
  stockInmovilizado: 90, // días
  stockSinMovimiento: 60,
  exportacionDemorada: 30,
  productorInactivo: 90,
};

function uid(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

// ============================================================
// Reglas
// ============================================================

/** Stock inmovilizado: mercadería en depósito sin movimiento > 90 días. */
const stockInmovilizadoRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  return ctx.stock
    .filter(s => s.diasSinMovimiento > THRESHOLDS.stockInmovilizado)
    .map(s => {
      const dias = s.diasSinMovimiento;
      const priority: AlertPriority = dias > 180 ? 'critica' : dias > 120 ? 'alta' : 'media';
      return {
        id: uid('stock-inmovilizado', s.id),
        category: 'stock_inmovilizado' as AlertCategory,
        priority,
        title: `Stock inmovilizado: ${s.cote || 'sin COTE'}`,
        description: `${s.deposito} • ${s.productor} • ${s.corte}. Sin movimiento por ${dias} días. Peso: ${s.pesoNeto.toLocaleString('es-UY')} kg, ${s.envases} envases.`,
        entity: { type: 'cote' as const, id: s.id, label: s.cote || s.id },
        metric: dias,
        suggestedAction: 'Verificar estado físico, gestionar retorno o reasignar destino comercial.',
        detectedAt: now.toISOString(),
      };
    });
};

/** Mercadería retenida: snapshot con retención explícita. */
const mercaderiaRetenidaRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  return ctx.stock
    .filter(s => s.estado === 'retenido')
    .map(s => ({
      id: uid('retenido', s.id),
      category: 'mercaderia_retenida' as AlertCategory,
      priority: 'critica' as AlertPriority,
      title: `Mercadería retenida: ${s.cote || 'sin COTE'}`,
      description: `${s.deposito} • ${s.productor} • ${s.corte}. Requiere intervención manual para liberar.`,
      entity: { type: 'cote' as const, id: s.id, label: s.cote || s.id },
      metric: s.pesoNeto,
      suggestedAction: 'Contactar DGSA / MGAP para liberación. Documentar motivo de retención.',
      detectedAt: now.toISOString(),
    }));
};

/** Mercadería sin destino: en stock sin destino ni exportación. */
const mercaderiaSinDestinoRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  return ctx.stock
    .filter(s => !s.tieneDestino && !s.tieneExportacion && s.diasSinMovimiento > 30)
    .map(s => ({
      id: uid('sin-destino', s.id),
      category: 'mercaderia_sin_destino' as AlertCategory,
      priority: (s.diasSinMovimiento > 90 ? 'alta' : 'media') as AlertPriority,
      title: `Mercadería sin destino: ${s.cote || 'sin COTE'}`,
      description: `${s.deposito} • ${s.productor}. Sin destino asignado ni exportación vinculada. ${s.diasSinMovimiento} días en stock.`,
      entity: { type: 'cote' as const, id: s.id, label: s.cote || s.id },
      metric: s.pesoNeto,
      suggestedAction: 'Asignar destino comercial o iniciar trámite de exportación.',
      detectedAt: now.toISOString(),
    }));
};

/** Duplicados de COTE: mismo COTE en más de un registro de stock. */
const duplicadosRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  const byCote = new Map<string, number>();
  for (const s of ctx.stock) {
    if (!s.cote) continue;
    byCote.set(s.cote, (byCote.get(s.cote) || 0) + 1);
  }
  const alerts: Alert[] = [];
  for (const [cote, count] of byCote.entries()) {
    if (count > 1) {
      alerts.push({
        id: uid('duplicado', cote),
        category: 'duplicados' as AlertCategory,
        priority: 'alta' as AlertPriority,
        title: `COTE duplicado: ${cote}`,
        description: `Se detectaron ${count} registros de stock para el mismo COTE. Posible error de carga o duplicación operativa.`,
        entity: { type: 'cote' as const, id: cote, label: cote },
        metric: count,
        suggestedAction: 'Auditar registros, consolidar o eliminar duplicados.',
        detectedAt: now.toISOString(),
      });
    }
  }
  return alerts;
};

/** Productores inactivos: sin actividad en los últimos 90 días. */
const productoresInactivosRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  return ctx.productores
    .filter(p => !p.activo)
    .map(p => ({
      id: uid('productor-inactivo', p.id),
      category: 'anomalia' as AlertCategory,
      priority: 'media' as AlertPriority,
      title: `Productor inactivo: ${p.name}`,
      description: `Sin actividad en los últimos ${THRESHOLDS.productorInactivo} días. Última actividad: ${p.ultimaActividad ? new Date(p.ultimaActividad).toLocaleDateString('es-UY') : 'sin datos'}.`,
      entity: { type: 'productor' as const, id: p.id, label: p.name },
      suggestedAction: 'Verificar relación comercial. Posible churn o baja operativa.',
      detectedAt: now.toISOString(),
    }));
};

/** Concentración en depósito: un depósito con > 60% del stock total. */
const concentracionDepositoRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  const total = ctx.depositos.reduce((s, d) => s + d.stockPn, 0);
  if (!total) return [];
  return ctx.depositos
    .filter(d => d.stockPn / total > 0.6)
    .map(d => ({
      id: uid('concentracion-deposito', d.id),
      category: 'anomalia' as AlertCategory,
      priority: 'media' as AlertPriority,
      title: `Concentración en depósito: ${d.name}`,
      description: `${d.name} concentra el ${((d.stockPn / total) * 100).toFixed(1)}% del stock total. Riesgo de dependencia operativa.`,
      entity: { type: 'deposito' as const, id: d.id, label: d.name },
      metric: d.stockPn / total * 100,
      suggestedAction: 'Diversificar depósitos. Evaluar capacidad operativa alterna.',
      detectedAt: now.toISOString(),
    }));
};

/** Documentación incompleta: COTE sin fecha de faena/producción/congelación. */
const documentacionIncompletaRule: Rule = (ctx) => {
  const now = ctx.now ?? new Date();
  return ctx.stock
    .filter(s => !s.fechaIngreso)
    .slice(0, 50) // limitar alertas
    .map(s => ({
      id: uid('doc-incompleta', s.id),
      category: 'documentacion_incompleta' as AlertCategory,
      priority: 'baja' as AlertPriority,
      title: `Documentación incompleta: ${s.cote || 'sin COTE'}`,
      description: `Sin fecha de ingreso registrada. Posible carga manual incompleta.`,
      entity: { type: 'cote' as const, id: s.id, label: s.cote || s.id },
      suggestedAction: 'Completar documentación o solicitar COTE original al productor.',
      detectedAt: now.toISOString(),
    }));
};

// ============================================================
// Registro de reglas
// ============================================================

export const ALL_RULES: { id: string; name: string; rule: Rule }[] = [
  { id: 'stock-inmovilizado', name: 'Stock inmovilizado (>90 días)', rule: stockInmovilizadoRule },
  { id: 'mercaderia-retenida', name: 'Mercadería retenida', rule: mercaderiaRetenidaRule },
  { id: 'mercaderia-sin-destino', name: 'Mercadería sin destino', rule: mercaderiaSinDestinoRule },
  { id: 'duplicados', name: 'COTEs duplicados', rule: duplicadosRule },
  { id: 'productores-inactivos', name: 'Productores inactivos', rule: productoresInactivosRule },
  { id: 'concentracion-deposito', name: 'Concentración en depósito', rule: concentracionDepositoRule },
  { id: 'documentacion-incompleta', name: 'Documentación incompleta', rule: documentacionIncompletaRule },
];

/** Ejecuta todas las reglas habilitadas contra el contexto. */
export function runRules(ctx: RulesContext, enabledRuleIds?: string[]): Alert[] {
  const rules = enabledRuleIds
    ? ALL_RULES.filter(r => enabledRuleIds.includes(r.id))
    : ALL_RULES;
  const alerts: Alert[] = [];
  for (const { rule } of rules) {
    try {
      alerts.push(...rule(ctx));
    } catch (e) {
      console.error('[rules-engine] Regla falló:', e);
    }
  }
  // Ordenar por prioridad
  const order: Record<AlertPriority, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return alerts.sort((a, b) => order[a.priority] - order[b.priority]);
}

export { THRESHOLDS };
