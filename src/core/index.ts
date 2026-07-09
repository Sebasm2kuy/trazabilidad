// ============================================================
// CORE — Inicialización + Platform Core + Enterprise Blueprint
// ============================================================

export { PlatformCore } from './platformCore';
export type {
  User, Session, Role, RoleId, Permission, ComponentVisibility,
  ConfigEntry, ConfigHistoryEntry,
  AuditEvent, MetricEntry, HealthStatus,
  Notification, SoftDelete, VersionInfo, UserPreferences,
} from './platformCore';
export { DEFAULT_ROLES } from './platformCore';

export { PRINCIPLES, ARCHITECTURE_FLOW, DEV_RULES, TEST_STRATEGY, ROADMAP, FINAL_CHECKLIST, PROHIBITIONS, AI_READINESS, MIGRATION_READY, BLUEPRINT_VERSION, BLUEPRINT_DATE, BLUEPRINT_DOCUMENTS, isDone } from './enterpriseBlueprint';
export type { AcceptanceCriteria, TestSpec, TestLevel, RoadmapItem, RoadmapPhase, ProjectChecklist } from './enterpriseBlueprint';
