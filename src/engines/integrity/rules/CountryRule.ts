// ============================================================
// CountryRule — Validación geográfica de país de destino
// ------------------------------------------------------------
// Verifica que el país de destino declarado en exportaciones
// exista en el catálogo de países válidos. Originalmente esta
// validación no existía en el motor, pero se incluye como
// ejemplo de regla nueva en el Rule Registry sin alterar la
// API pública (solo añade hallazgos; el motor los descarta si
// no hay catálogo configurado).
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

/** Catálogo mínimo de países válidos. Vacío = deshabilita la regla. */
const PAISES_VALIDOS: ReadonlySet<string> = new Set<string>();

export class CountryRule implements IntegrityRule {
  readonly code = 'country';

  evaluate(ctx: RuleContext): RuleFinding[] {
    // Si el catálogo está vacío, la regla no hace nada.
    // Esto preserva compatibilidad: el motor viejo no validaba esto.
    if (PAISES_VALIDOS.size === 0) return [];

    const { node } = ctx;
    const findings: RuleFinding[] = [];

    for (const exp of node.exportaciones) {
      if (!exp.destino) continue;
      if (!PAISES_VALIDOS.has(exp.destino)) {
        findings.push({
          code: 'pais_invalido',
          group: 'E_comercial',
          severity: 'BAJA',
          weight: 3,
          data: {
            documento: exp.documento,
            paisDeclarado: exp.destino,
          },
        });
      }
    }

    return findings;
  }
}
