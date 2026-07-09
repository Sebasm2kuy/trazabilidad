// ============================================================
// PLATFORM CORE — Seguridad, Administración y Gobierno
// ------------------------------------------------------------
// ETI-11: Núcleo administrativo. Auth, RBAC, configuración
// central, auditoría, observabilidad, health check, backup.
// NUNCA implementa lógica de negocio.
// ============================================================

// --- Autenticación ---

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  roleId: string;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  username: string;
  startedAt: string;
  expiresAt: string;
  browser: string;
  appVersion: string;
  active: boolean;
}

// --- RBAC ---

export type RoleId = 'admin' | 'auditor' | 'operador' | 'consulta' | 'supervisor' | 'gerencia' | 'invitado';

export interface Role {
  id: RoleId;
  name: string;
  description: string;
  permissions: Permission[];
}

export type Permission =
  | 'view' | 'create' | 'modify' | 'delete' | 'approve'
  | 'export' | 'import' | 'admin';

export type ComponentVisibility = 'visible' | 'readonly' | 'hidden' | 'disabled';

export const DEFAULT_ROLES: Role[] = [
  {
    id: 'admin', name: 'Administrador',
    description: 'Acceso total al sistema',
    permissions: ['view', 'create', 'modify', 'delete', 'approve', 'export', 'import', 'admin'],
  },
  {
    id: 'auditor', name: 'Auditor',
    description: 'Consulta y auditoría de datos',
    permissions: ['view', 'export'],
  },
  {
    id: 'operador', name: 'Operador',
    description: 'Operación diaria de trazabilidad',
    permissions: ['view', 'create', 'modify', 'import'],
  },
  {
    id: 'consulta', name: 'Consulta',
    description: 'Solo lectura de indicadores',
    permissions: ['view'],
  },
  {
    id: 'supervisor', name: 'Supervisor',
    description: 'Supervisión operativa',
    permissions: ['view', 'approve', 'export'],
  },
  {
    id: 'gerencia', name: 'Gerencia',
    description: 'Indicadores estratégicos',
    permissions: ['view', 'export'],
  },
  {
    id: 'invitado', name: 'Invitado',
    description: 'Acceso mínimo',
    permissions: ['view'],
  },
];

// --- Configuración central ---

export interface ConfigEntry {
  key: string;
  name: string;
  description: string;
  type: 'number' | 'string' | 'boolean' | 'json';
  value: unknown;
  defaultValue: unknown;
  editable: boolean;
  version: number;
  modifiedAt: string;
  modifiedBy: string;
  history: ConfigHistoryEntry[];
}

export interface ConfigHistoryEntry {
  version: number;
  value: unknown;
  modifiedAt: string;
  modifiedBy: string;
}

// --- Auditoría ---

export interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  entityType: string;
  entityId: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  origen: string;
  resultado: 'exito' | 'error' | 'parcial';
  duracionMs: number;
  severidad: 'info' | 'warning' | 'error' | 'critica';
}

// --- Observabilidad ---

export interface MetricEntry {
  id: string;
  timestamp: string;
  module: string;
  operation: string;
  durationMs: number;
  recordCount: number;
  memoryUsageMb: number;
  success: boolean;
}

export interface HealthStatus {
  module: string;
  status: 'ok' | 'warning' | 'error' | 'offline';
  message: string;
  lastCheck: string;
  metrics?: Record<string, number>;
}

// --- Notificaciones ---

export interface Notification {
  id: string;
  tipo: 'info' | 'advertencia' | 'error' | 'critica' | 'sistema' | 'auditoria';
  titulo: string;
  descripcion: string;
  timestamp: string;
  leida: boolean;
  userId?: string;
}

// --- Eliminación lógica ---

export interface SoftDelete {
  entityId: string;
  entityType: string;
  deletedAt: string;
  deletedBy: string;
  motivo: string;
  recoverable: boolean;
}

// --- Versionado ---

export interface VersionInfo {
  appVersion: string;
  dataModelVersion: string;
  traceGraphVersion: number;
  rulesVersion: number;
  configVersion: number;
  importVersion: number;
}

// --- Preferencias ---

export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark';
  language: string;
  visibleColumns: Record<string, string[]>;
  columnOrder: Record<string, string[]>;
  savedFilters: { id: string; name: string; filtros: Record<string, unknown> }[];
  defaultDashboard: string;
  pageSize: number;
}

// --- Implementación ---

class PlatformCoreImpl {
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private roles: Role[] = DEFAULT_ROLES;
  private config: Map<string, ConfigEntry> = new Map();
  private auditLog: AuditEvent[] = [];
  private metrics: MetricEntry[] = [];
  private notifications: Notification[] = [];
  private softDeletes: SoftDelete[] = [];
  private preferences: Map<string, UserPreferences> = new Map();

  // --- Auth ---

  login(username: string, _password: string): User | null {
    // Stub: en producción validar contra backend/SSO/OAuth
    const user: User = {
      id: `user_${username}`,
      username,
      displayName: username,
      email: null,
      roleId: 'admin',
      active: true,
      lastLogin: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.currentUser = user;
    this.currentSession = {
      id: `sess_${Date.now()}`,
      userId: user.id,
      username: user.username,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      appVersion: '2.0.0',
      active: true,
    };
    this.audit('login', 'user', user.id, null, user, 'exito', 'info');
    return user;
  }

  logout(): void {
    if (this.currentUser) {
      this.audit('logout', 'user', this.currentUser.id, null, null, 'exito', 'info');
    }
    this.currentUser = null;
    this.currentSession = null;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // --- RBAC ---

  hasPermission(permission: Permission): boolean {
    if (!this.currentUser) return false;
    const role = this.roles.find(r => r.id === this.currentUser!.roleId);
    return role?.permissions.includes(permission) || false;
  }

  getComponentVisibility(componentId: string, requiredPermission: Permission = 'view'): ComponentVisibility {
    if (!this.currentUser) return 'hidden';
    if (this.hasPermission('admin')) return 'visible';
    if (!this.hasPermission(requiredPermission)) return 'hidden';
    if (!this.hasPermission('modify')) return 'readonly';
    return 'visible';
  }

  getRoles(): Role[] {
    return this.roles;
  }

  // --- Configuración ---

  getConfig(key: string): unknown {
    const entry = this.config.get(key);
    return entry?.value ?? entry?.defaultValue;
  }

  getConfigEntry(key: string): ConfigEntry | null {
    return this.config.get(key) || null;
  }

  setConfig(key: string, value: unknown, userId: string): void {
    const existing = this.config.get(key);
    const now = new Date().toISOString();
    const history = existing?.history || [];
    if (existing) {
      history.push({ version: existing.version, value: existing.value, modifiedAt: existing.modifiedAt, modifiedBy: existing.modifiedBy });
    }
    const entry: ConfigEntry = {
      key,
      name: existing?.name || key,
      description: existing?.description || '',
      type: existing?.type || 'json',
      value,
      defaultValue: existing?.defaultValue ?? value,
      editable: true,
      version: (existing?.version || 0) + 1,
      modifiedAt: now,
      modifiedBy: userId,
      history,
    };
    this.config.set(key, entry);
    this.audit('config_change', 'config', key, existing?.value, value, 'exito', 'info');
  }

  getAllConfig(): ConfigEntry[] {
    return Array.from(this.config.values());
  }

  // --- Auditoría ---

  audit(
    action: string, entityType: string, entityId: string,
    valorAnterior: unknown, valorNuevo: unknown,
    resultado: AuditEvent['resultado'], severidad: AuditEvent['severidad'],
  ): void {
    const event: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId: this.currentUser?.id || 'system',
      username: this.currentUser?.username || 'system',
      action, entityType, entityId,
      valorAnterior, valorNuevo,
      origen: 'frontend',
      resultado, severidad,
      duracionMs: 0,
    };
    this.auditLog.unshift(event);
    if (this.auditLog.length > 1000) this.auditLog = this.auditLog.slice(0, 1000);
  }

  getAuditLog(limit: number = 100): AuditEvent[] {
    return this.auditLog.slice(0, limit);
  }

  getAuditByEntity(entityId: string): AuditEvent[] {
    return this.auditLog.filter(e => e.entityId === entityId);
  }

  // --- Observabilidad ---

  recordMetric(module: string, operation: string, durationMs: number, recordCount: number, success: boolean): void {
    const metric: MetricEntry = {
      id: `metric_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      module, operation, durationMs, recordCount,
      memoryUsageMb: typeof performance !== 'undefined' && (performance as any).memory?.usedJSHeapSize
        ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : 0,
      success,
    };
    this.metrics.unshift(metric);
    if (this.metrics.length > 500) this.metrics = this.metrics.slice(0, 500);
  }

  getMetrics(limit: number = 50): MetricEntry[] {
    return this.metrics.slice(0, limit);
  }

  // --- Health Check ---

  getHealthStatus(): HealthStatus[] {
    const now = new Date().toISOString();
    return [
      { module: 'ETL', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'TraceGraph', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'Integrity Engine', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'KPI Engine', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'Risk Engine', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'BI Engine', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'Conciliation Engine', status: 'ok', message: 'Operativo', lastCheck: now },
      { module: 'Presentation Engine', status: 'ok', message: 'Operativo', lastCheck: now },
    ];
  }

  // --- Notificaciones ---

  notify(tipo: Notification['tipo'], titulo: string, descripcion: string): void {
    this.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tipo, titulo, descripcion,
      timestamp: new Date().toISOString(),
      leida: false,
    });
    if (this.notifications.length > 200) this.notifications = this.notifications.slice(0, 200);
  }

  getNotifications(unreadOnly: boolean = false): Notification[] {
    return unreadOnly ? this.notifications.filter(n => !n.leida) : this.notifications;
  }

  markAsRead(id: string): void {
    const n = this.notifications.find(n => n.id === id);
    if (n) n.leida = true;
  }

  // --- Eliminación lógica ---

  softDelete(entityId: string, entityType: string, motivo: string): void {
    this.softDeletes.unshift({
      entityId, entityType,
      deletedAt: new Date().toISOString(),
      deletedBy: this.currentUser?.username || 'system',
      motivo,
      recoverable: true,
    });
    this.audit('soft_delete', entityType, entityId, 'active', 'deleted', 'exito', 'warning');
  }

  getSoftDeletes(): SoftDelete[] {
    return this.softDeletes;
  }

  // --- Versionado ---

  getVersionInfo(): VersionInfo {
    return {
      appVersion: '2.0.0',
      dataModelVersion: '1.0',
      traceGraphVersion: 1,
      rulesVersion: 1,
      configVersion: Array.from(this.config.values()).reduce((max, c) => Math.max(max, c.version), 0),
      importVersion: 0,
    };
  }

  // --- Preferencias ---

  getPreferences(userId: string): UserPreferences {
    if (!this.preferences.has(userId)) {
      this.preferences.set(userId, {
        userId,
        theme: 'light',
        language: 'es',
        visibleColumns: {},
        columnOrder: {},
        savedFilters: [],
        defaultDashboard: 'ejecutivo',
        pageSize: 20,
      });
    }
    return this.preferences.get(userId)!;
  }

  setPreferences(userId: string, prefs: Partial<UserPreferences>): void {
    const current = this.getPreferences(userId);
    this.preferences.set(userId, { ...current, ...prefs });
  }

  // --- Backup ---

  exportBackup(): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      config: Array.from(this.config.entries()),
      audit: this.auditLog,
      preferences: Array.from(this.preferences.entries()),
      softDeletes: this.softDeletes,
      notifications: this.notifications,
    };
  }

  importBackup(data: Record<string, unknown>): void {
    if (data.config) {
      for (const [key, entry] of data.config as [string, ConfigEntry][]) {
        this.config.set(key, entry);
      }
    }
    if (data.audit) this.auditLog = data.audit as AuditEvent[];
    if (data.preferences) {
      for (const [userId, prefs] of data.preferences as [string, UserPreferences][]) {
        this.preferences.set(userId, prefs);
      }
    }
    if (data.softDeletes) this.softDeletes = data.softDeletes as SoftDelete[];
    if (data.notifications) this.notifications = data.notifications as Notification[];
  }
}

// --- Singleton ---

export const PlatformCore = new PlatformCoreImpl();
