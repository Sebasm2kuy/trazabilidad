// ============================================================
// RULE REGISTRY — Registro central de reglas de integridad
// ------------------------------------------------------------
// El motor no conoce reglas específicas: solo itera sobre las
// registradas. Las reglas se registran en orden, y el motor
// ejecuta cada una sobre cada nodo.
//
// Para añadir una nueva regla:
//   1. Crear rules/MiRegla.ts implementando IntegrityRule
//   2. Importarla acá y hacer registry.register(new MiRegla())
//
// Para deshabilitar una regla: comentar su línea de register()
// o llamar registry.unregister('codigo').
// ============================================================

import type { IntegrityRule } from './types';
import { StructuralRule } from './rules/StructuralRule';
import { DocumentalRule } from './rules/DocumentalRule';
import { DuplicateBatchRule } from './rules/DuplicateBatchRule';
import { CronologicoRule } from './rules/CronologicoRule';
import { LogisticoRule } from './rules/LogisticoRule';
import { ComercialRule } from './rules/ComercialRule';
import { MatematicoRule } from './rules/MatematicoRule';
import { OperativoRule } from './rules/OperativoRule';
import { CountryRule } from './rules/CountryRule';
import { PortRule } from './rules/PortRule';
import { DestinationRule } from './rules/DestinationRule';

export class RuleRegistry {
  private rules = new Map<string, IntegrityRule>();
  private order: string[] = [];

  register(rule: IntegrityRule): void {
    if (!this.rules.has(rule.code)) {
      this.order.push(rule.code);
    }
    this.rules.set(rule.code, rule);
  }

  unregister(code: string): boolean {
    if (!this.rules.delete(code)) return false;
    this.order = this.order.filter(c => c !== code);
    return true;
  }

  get(code: string): IntegrityRule | undefined {
    return this.rules.get(code);
  }

  /** Lista ordenada de reglas registradas. */
  all(): IntegrityRule[] {
    return this.order.map(c => this.rules.get(c)!).filter(Boolean);
  }

  clear(): void {
    this.rules.clear();
    this.order = [];
  }
}

/** Registry singleton con las reglas por defecto del sistema. */
export function createDefaultRegistry(): RuleRegistry {
  const registry = new RuleRegistry();
  registry.register(new StructuralRule());
  registry.register(new DocumentalRule());
  registry.register(new DuplicateBatchRule());
  registry.register(new CronologicoRule());
  registry.register(new LogisticoRule());
  registry.register(new PortRule());           // no-op hasta habilitar ENABLE_PORT_VALIDATION
  registry.register(new ComercialRule());
  registry.register(new DestinationRule());
  registry.register(new MatematicoRule());
  registry.register(new OperativoRule());
  registry.register(new CountryRule());        // no-op hasta configurar PAISES_VALIDOS
  return registry;
}
