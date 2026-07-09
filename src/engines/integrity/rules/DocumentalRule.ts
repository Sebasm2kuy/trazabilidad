// ============================================================
// DocumentalRule — Grupo B: validaciones documentales
// ------------------------------------------------------------
// Cubre únicamente: sin_ingreso (exportaciones sin ingreso
// vinculado). La detección de duplicados se movió a
// DuplicateBatchRule para respetar el principio de
// responsabilidad única.
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class DocumentalRule implements IntegrityRule {
  readonly code = 'documental';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];

    // Exportaciones sin ingreso vinculado
    if (!node.ingreso && node.exportaciones.length > 0) {
      findings.push({
        code: 'sin_ingreso',
        group: 'B_documental',
        severity: 'CRITICA',
        weight: config.pesoSinIngreso,
        data: {
          exportacionesCount: node.exportaciones.length,
        },
      });
    }

    return findings;
  }
}
