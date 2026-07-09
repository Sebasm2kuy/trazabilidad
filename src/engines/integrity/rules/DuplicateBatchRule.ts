// ============================================================
// DuplicateBatchRule — Detección de lotes/documentos duplicados
// ------------------------------------------------------------
// Extraída de DocumentalRule. Cubre: doc_duplicado (mismo
// documento repetido en exportaciones del mismo nodo, lo que
// sugiere doble carga o doble exportación).
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class DuplicateBatchRule implements IntegrityRule {
  readonly code = 'duplicate_batch';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];

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
