// ============================================================
// CORE — Inicialización de la aplicación + Platform Core
// ============================================================
// App.tsx, Providers, Router, Theme, Contextos globales.
// PlatformCore: seguridad, auth, RBAC, config, audit, health.

export { PlatformCore } from './platformCore';
export type {
  User, Session, Role, RoleId, Permission, ComponentVisibility,
  ConfigEntry, ConfigHistoryEntry,
  AuditEvent, MetricEntry, HealthStatus,
  Notification, SoftDelete, VersionInfo, UserPreferences,
} from './platformCore';
export { DEFAULT_ROLES } from './platformCore';
