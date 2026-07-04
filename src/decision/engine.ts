// ============================================================
// DECISION ENGINE — Genera recomendaciones accionables
// ------------------------------------------------------------
// Recibe el snapshot + riesgos + predicciones y emite
// recomendaciones priorizadas.
// ============================================================

import type {
  TwinSnapshot, Recommendation, RiskAssessment, Prediction,
} from '@/digital-twin/types';
import { detectSystemRisks } from '@/risk/engine';

/** Genera recomendaciones basadas en el estado del gemelo digital. */
export function generateRecommendations(
  snapshot: TwinSnapshot,
  risks: RiskAssessment[],
  predictions: Prediction[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  const systemRisks = detectSystemRisks(snapshot);

  // 1. Para cada riesgo sistémico, sugerir acción
  for (const r of systemRisks) {
    switch (r.category) {
      case 'deposito_saturado':
        recs.push({
          id: `rec-${r.id}`,
          title: `Redistribuir stock desde depósitos saturados`,
          description: `${r.description} Mover carga hacia depósitos con menor utilización.`,
          priority: r.severity === 'critico' ? 'critica' : 'alta',
          category: 'redistribuir_depositos',
          action: 'Abrir laboratorio de simulación',
          entityType: r.affectedEntities[0]?.type,
          entityId: r.affectedEntities[0]?.id,
          expectedImpact: 'Reducir utilización por debajo del 80%',
        });
        break;
      case 'cliente_inactivo':
        recs.push({
          id: `rec-${r.id}`,
          title: `Reactivar ${r.metric} clientes inactivos`,
          description: r.description,
          priority: 'media',
          category: 'reactivar_cliente',
          action: 'Contactar comercialmente',
          expectedImpact: 'Recuperar flujo de venta',
        });
        break;
      case 'stock_inmovilizado':
        recs.push({
          id: `rec-${r.id}`,
          title: `Liberar ${r.metric.toLocaleString('es-UY')} kg de stock inmovilizado`,
          description: r.description,
          priority: r.severity === 'critico' ? 'critica' : 'alta',
          category: 'mover_stock',
          action: 'Asignar destino comercial o exportar',
          expectedImpact: 'Liberar capital inmovilizado',
        });
        break;
      case 'mercaderia_retenida':
        recs.push({
          id: `rec-${r.id}`,
          title: `Gestionar liberación de mercadería retenida`,
          description: r.description,
          priority: 'critica',
          category: 'controlar_documentacion',
          action: 'Documentar y contactar DGSA/MGAP',
        });
        break;
      case 'concentracion_stock':
        recs.push({
          id: `rec-${r.id}`,
          title: `Diversificar concentración de stock`,
          description: r.description,
          priority: 'alta',
          category: 'reducir_concentracion',
          action: 'Distribuir hacia otros depósitos',
        });
        break;
      case 'dependencia_pais':
        recs.push({
          id: `rec-${r.id}`,
          title: `Diversificar destinos de exportación`,
          description: r.description,
          priority: 'alta',
          category: 'diversificar',
          action: 'Explorar nuevos mercados',
        });
        break;
    }
  }

  // 2. Para las top 5 entidades con mayor riesgo, sugerir auditoría
  const topRisk = risks.slice(0, 5);
  for (const r of topRisk) {
    if (r.score < 50) continue;
    recs.push({
      id: `rec-audit-${r.entityId}`,
      title: `Auditar ${r.entityName}`,
      description: `Score de riesgo: ${r.score.toFixed(0)}/100 (${r.level}). Factores: ${r.factors.map(f => f.label).join(', ')}.`,
      priority: r.level === 'critico' ? 'critica' : r.level === 'alto' ? 'alta' : 'media',
      category: 'auditar',
      action: 'Revisar historial y contexto',
      entityType: r.entityType,
      entityId: r.entityId,
    });
  }

  // 3. Para predicciones de saturación futura
  for (const pred of predictions) {
    if (pred.metric === 'ingresos_pn' && pred.values.length > 0) {
      const last = pred.values[pred.values.length - 1];
      const first = pred.values[0];
      if (last.value > first.value * 1.2) {
        recs.push({
          id: `rec-pred-${pred.id}`,
          title: `Preparar capacidad para crecimiento proyectado`,
          description: `Se proyecta +${((last.value / first.value - 1) * 100).toFixed(0)}% en los próximos ${pred.horizon} meses. Asegurar capacidad de depósitos.`,
          priority: 'media',
          category: 'aumentar_exportaciones',
          action: 'Planificar capacidad',
          expectedImpact: 'Evitar saturación futura',
        });
      }
    }
  }

  // 4. Siempre: benchmark mensual
  recs.push({
    id: 'rec-benchmark',
    title: 'Realizar benchmark mensual vs top 3 competidores',
    description: 'Comparar share, diversificación geográfica y cartera de cortes.',
    priority: 'baja',
    category: 'auditar',
    action: 'Abrir Mercado Nacional',
  });

  return recs;
}
