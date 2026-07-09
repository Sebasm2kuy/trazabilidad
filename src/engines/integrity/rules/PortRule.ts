// ============================================================
// PortRule — Validación de puerto / contenedor
// ------------------------------------------------------------
// Cubre: sin_contenedor (exportación sin contenedor asignado)
// y contenedor_mal_formado (formato ISO 6346: 4 letras + 7
// dígitos). El viejo motor no validaba esto; la regla es
// no-op hasta que se habilite via ENABLE_PORT_VALIDATION.
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

/** Flag para habilitar la regla. false = no-op (compatibilidad). */
const ENABLE_PORT_VALIDATION = false;

/** Regex ISO 6346: 4 letras (propietario) + 7 dígitos (serie + check). */
const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/;

export class PortRule implements IntegrityRule {
  readonly code = 'port';

  evaluate(ctx: RuleContext): RuleFinding[] {
    if (!ENABLE_PORT_VALIDATION) return [];

    const { node } = ctx;
    const findings: RuleFinding[] = [];

    for (const exp of node.exportaciones) {
      // Sin contenedor
      if (!exp.contenedor) {
        findings.push({
          code: 'sin_contenedor',
          group: 'D_logistico',
          severity: 'BAJA',
          weight: 3,
          data: {
            documento: exp.documento,
          },
        });
        continue;
      }
      // Contenedor mal formado (ISO 6346)
      if (!ISO_6346_REGEX.test(exp.contenedor)) {
        findings.push({
          code: 'contenedor_mal_formado',
          group: 'D_logistico',
          severity: 'BAJA',
          weight: 2,
          data: {
            documento: exp.documento,
            contenedor: exp.contenedor,
          },
        });
      }
    }

    return findings;
  }
}
