// ============================================================
// StructuralRule — Grupo A: validaciones estructurales
// ------------------------------------------------------------
// Cubre: sin_cote, sin_productor, sin_certificadora, sin_deposito,
// sin_fecha_ingreso, sin_peso, sin_cajas.
// Todas son verificaciones de campos obligatorios en el nodo.
// ============================================================

import type { IntegrityRule, RuleContext, RuleFinding } from '../types';

export class StructuralRule implements IntegrityRule {
  readonly code = 'structural';

  evaluate(ctx: RuleContext): RuleFinding[] {
    const { node, config } = ctx;
    const findings: RuleFinding[] = [];

    if (!node.nroCote) {
      findings.push({
        code: 'sin_cote',
        group: 'A_estructural',
        severity: 'CRITICA',
        weight: config.pesoSinCOTE,
        data: { field: 'nroCote' },
      });
    }
    if (!node.productor) {
      findings.push({
        code: 'sin_productor',
        group: 'A_estructural',
        severity: 'ALTA',
        weight: config.pesoSinProductor,
        data: { field: 'productor' },
      });
    }
    if (!node.certificadora) {
      findings.push({
        code: 'sin_certificadora',
        group: 'A_estructural',
        severity: 'ALTA',
        weight: config.pesoSinCertificadora,
        data: { field: 'certificadora' },
      });
    }
    if (node.ingreso && !node.ingreso.deposito) {
      findings.push({
        code: 'sin_deposito',
        group: 'A_estructural',
        severity: 'MEDIA',
        weight: config.pesoSinDeposito,
        data: { field: 'ingreso.deposito' },
      });
    }
    if (node.ingreso && !node.ingreso.fecha) {
      findings.push({
        code: 'sin_fecha_ingreso',
        group: 'A_estructural',
        severity: 'MEDIA',
        weight: config.pesoSinFecha,
        data: { field: 'ingreso.fecha' },
      });
    }
    if (node.ingreso && node.ingreso.pesoNeto === 0) {
      findings.push({
        code: 'sin_peso',
        group: 'A_estructural',
        severity: 'ALTA',
        weight: config.pesoSinPeso,
        data: { field: 'ingreso.pesoNeto', value: 0 },
      });
    }
    if (node.ingreso && node.ingreso.cajas === 0) {
      findings.push({
        code: 'sin_cajas',
        group: 'A_estructural',
        severity: 'MEDIA',
        weight: config.pesoSinCajas,
        data: { field: 'ingreso.cajas', value: 0 },
      });
    }

    return findings;
  }
}
