// ============================================================
// OperativoRule — Grupo G: validaciones operativas
// ------------------------------------------------------------
// Cubre: inmovilizado (mercadería con saldo y > DIAS_INMOVILIZADO
// desde el ingreso). Umbral y peso hardcodeados en la regla
// (no estaban en ReglaConfig originalmente).
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

/** Umbral y peso del stock inmovilizado. */
const INMOVILIZADO_CONFIG = {
  diasUmbral: 180,
  peso: 5,
} as const;

export class OperativoRule implements IntegrityRule {
  readonly code = 'operativo';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, now } = ctx;
    const findings: RuleFinding[] = [];

    if (!node.ingreso || !node.ingreso.fecha) return findings;
    if (node.stock.saldoCajas <= 0) return findings;

    const fechaIng = new Date(node.ingreso.fecha);
    if (isNaN(fechaIng.getTime())) return findings;

    const ahora = new Date(now);
    const dias = Math.floor((ahora.getTime() - fechaIng.getTime()) / (1000 * 60 * 60 * 24));

    if (dias > INMOVILIZADO_CONFIG.diasUmbral) {
      findings.push({
        code: 'inmovilizado',
        group: 'G_operativo',
        severity: 'MEDIA',
        weight: INMOVILIZADO_CONFIG.peso,
        data: {
          dias,
          diasUmbral: INMOVILIZADO_CONFIG.diasUmbral,
          fechaIngreso: node.ingreso.fecha,
        },
      });
    }

    return findings;
  }
}
