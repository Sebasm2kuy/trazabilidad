// ============================================================
// DestinationRule — Validación de destino comercial
// ------------------------------------------------------------
// Cubre: sin_destino (exportación sin destino declarado),
// destino_vacio (destino presente pero vacío/whitespace).
// Complementa ComercialRule que valida a nivel nodo; esta
// regla valida a nivel exportación individual.
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class DestinationRule implements IntegrityRule {
  readonly code = 'destination';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];

    for (const exp of node.exportaciones) {
      if (!exp.destino || exp.destino.trim() === '') {
        findings.push({
          code: 'sin_destino',
          group: 'E_comercial',
          severity: 'BAJA',
          weight: config.pesoSinPais,
          data: {
            documento: exp.documento,
          },
        });
      }
    }

    return findings;
  }
}
