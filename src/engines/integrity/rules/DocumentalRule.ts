// ============================================================
// DocumentalRule — Grupo B: validaciones documentales
// ------------------------------------------------------------
// Cubre: sin_ingreso (exportaciones sin ingreso), doc_duplicado
// (mismo documento repetido en exportaciones del mismo nodo).
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

    // Documentos duplicados en exportaciones del nodo
    const docsExp = node.exportaciones.map(e => e.documento);
    const dups = docsExp.filter((d, i) => docsExp.indexOf(d) !== i);
    if (dups.length > 0) {
      findings.push({
        code: 'doc_duplicado',
        group: 'B_documental',
        severity: 'CRITICA',
        weight: config.pesoDocumentoDuplicado,
        data: {
          documentos: dups.join(', '),
          cantidad: dups.length,
        },
      });
    }

    return findings;
  }
}
