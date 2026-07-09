// ============================================================
// LogisticoRule — Grupo D: validaciones logísticas
// ------------------------------------------------------------
// Cubre: saldo_negativo (stock en negativo) y sobreexportacion
// (cajas exportadas > cajas ingresadas).
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class LogisticoRule implements IntegrityRule {
  readonly code = 'logistico';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];

    if (node.stock.saldoCajas < 0) {
      findings.push({
        code: 'saldo_negativo',
        group: 'D_logistico',
        severity: 'CRITICA',
        weight: config.pesoSaldoNegativo,
        data: { saldoCajas: node.stock.saldoCajas },
      });
    }

    if (node.stock.exportadoCajas > node.stock.ingresoCajas && node.stock.ingresoCajas > 0) {
      findings.push({
        code: 'sobreexportacion',
        group: 'D_logistico',
        severity: 'CRITICA',
        weight: config.pesoSobreexportacion,
        data: {
          ingresoCajas: node.stock.ingresoCajas,
          exportadoCajas: node.stock.exportadoCajas,
        },
      });
    }

    return findings;
  }
}
