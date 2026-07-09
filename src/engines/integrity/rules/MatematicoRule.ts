// ============================================================
// MatematicoRule — Grupo F: validaciones matemáticas
// ------------------------------------------------------------
// Cubre: peso_negativo, cajas_negativas, cajas_inconsistentes
// (suma de cajas de exportaciones > ingreso + tolerancia).
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class MatematicoRule implements IntegrityRule {
  readonly code = 'matematico';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];
    if (!node.ingreso) return findings;

    if (node.ingreso.pesoNeto < 0) {
      findings.push({
        code: 'peso_negativo',
        group: 'F_matematico',
        severity: 'CRITICA',
        weight: config.pesoPesoInconsistente,
        data: { pesoNeto: node.ingreso.pesoNeto },
      });
    }

    if (node.ingreso.cajas < 0) {
      findings.push({
        code: 'cajas_negativas',
        group: 'F_matematico',
        severity: 'CRITICA',
        weight: config.pesoCajasInconsistentes,
        data: { cajas: node.ingreso.cajas },
      });
    }

    // Suma de cajas de exportaciones excede ingreso + tolerancia
    if (node.ingreso.cajas > 0) {
      const totalExpCajas = node.exportaciones.reduce((s, e) => s + e.cajas, 0);
      if (totalExpCajas > node.ingreso.cajas + config.cajasTolerancia) {
        findings.push({
          code: 'cajas_inconsistentes',
          group: 'F_matematico',
          severity: 'CRITICA',
          weight: config.pesoCajasInconsistentes,
          data: {
            ingresoCajas: node.ingreso.cajas,
            exportadoCajas: totalExpCajas,
            tolerancia: config.cajasTolerancia,
          },
        });
      }
    }

    return findings;
  }
}
