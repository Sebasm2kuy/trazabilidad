// ============================================================
// ComercialRule — Grupo E: validaciones comerciales
// ------------------------------------------------------------
// Cubre: sin_cliente y sin_pais cuando hay exportaciones.
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class ComercialRule implements IntegrityRule {
  readonly code = 'comercial';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];

    if (node.exportaciones.length > 0 && !node.cliente) {
      findings.push({
        code: 'sin_cliente',
        group: 'E_comercial',
        severity: 'BAJA',
        weight: config.pesoSinCliente,
        data: { exportacionesCount: node.exportaciones.length },
      });
    }

    if (node.exportaciones.length > 0 && !node.paisDestino) {
      findings.push({
        code: 'sin_pais',
        group: 'E_comercial',
        severity: 'BAJA',
        weight: config.pesoSinPais,
        data: { exportacionesCount: node.exportaciones.length },
      });
    }

    return findings;
  }
}
