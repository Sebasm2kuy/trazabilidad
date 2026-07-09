// ============================================================
// CronologicoRule — Grupo C: validaciones cronológicas
// ------------------------------------------------------------
// Cubre: exp_antes_ing (exportación con fecha anterior al ingreso)
// y fecha_futura (ingreso con fecha posterior al momento de la
// corrida).
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class CronologicoRule implements IntegrityRule {
  readonly code = 'cronologico';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config, now } = ctx;
    const findings: RuleFinding[] = [];

    if (!node.ingreso || !node.ingreso.fecha) return findings;
    const fechaIng = new Date(node.ingreso.fecha);
    if (isNaN(fechaIng.getTime())) return findings;

    // Exportación anterior al ingreso
    for (const exp of node.exportaciones) {
      if (!exp.fecha) continue;
      const fechaExp = new Date(exp.fecha);
      if (isNaN(fechaExp.getTime())) continue;
      if (fechaExp < fechaIng) {
        findings.push({
          code: 'exp_antes_ing',
          group: 'C_cronologico',
          severity: 'ALTA',
          weight: config.pesoExportacionAntesIngreso,
          data: {
            documento: exp.documento,
            fechaIngreso: node.ingreso.fecha,
            fechaExportacion: exp.fecha,
          },
        });
      }
    }

    // Fecha futura
    const ahora = new Date(now);
    if (fechaIng > ahora) {
      findings.push({
        code: 'fecha_futura',
        group: 'C_cronologico',
        severity: 'ALTA',
        weight: config.pesoFechaFutura,
        data: {
          fecha: node.ingreso.fecha,
          ahora: ahora.toISOString(),
        },
      });
    }

    return findings;
  }
}
