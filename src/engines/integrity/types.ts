// ============================================================
// INTEGRITY RULES — Tipos compartidos
// ------------------------------------------------------------
// Una regla de integridad es una función pura que recibe un nodo
// del TraceGraph + configuración y devuelve 0 o más hallazgos.
// No genera texto final: el motor se encarga de materializar
// los hallazgos en AlertaIntegridad con mensajes.
// ============================================================

import type { TraceNode } from '@/domain';
import type {
  ReglaConfig, GrupoIntegridad, SeveridadIntegridad,
} from '../integrityEngine';

/** Contexto que recibe cada regla. */
export interface RuleContext {
  node: TraceNode;
  config: ReglaConfig;
  /** Timestamp ISO del inicio de la corrida, para asignar detectadaEn. */
  now: string;
}

/**
 * Hallazgo de una regla. NO contiene texto final ni mensajes.
 * Solo datos estructurados que el motor convierte en AlertaIntegridad.
 */
export interface RuleFinding {
  /** Código estables: 'sin_cote', 'doc_duplicado', 'exp_antes_ing', ... */
  code: string;
  /** Grupo A-H al que pertenece la regla. */
  group: GrupoIntegridad;
  /** Severidad sugerida por la regla. El motor puede re-mapear. */
  severity: SeveridadIntegridad;
  /**
   * Peso (0-100) que resta del score del nodo. Suele venir de
   * `ctx.config.pesoXxx` pero la regla puede sobreescribirlo
   * (p.ej. inmovilizado usa 5 fijo).
   */
  weight: number;
  /**
   * Datos estructurados para que el motor construya el mensaje.
   * Cada regla define su forma; el motor la usa vía templates.
   */
  data: Record<string, string | number | boolean | null>;
}

/** Contrato que cumple cada regla. */
export interface IntegrityRule {
  /** Código estables de la regla, igual a RuleFinding.code del primer hallazgo. */
  readonly code: string;
  /** Ejecuta la regla sobre un nodo. Devuelve 0+ hallazgos. Pura. */
  evaluate(ctx: RuleContext): RuleFinding[];
}
