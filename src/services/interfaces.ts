// ============================================================
// SERVICE INTERFACES — Integraciones y procesos auxiliares
// ============================================================

export interface PersistenceService {
  save<T>(key: string, value: T): void;
  load<T>(key: string, fallback: T): T;
  remove(key: string): void;
  clearAll(): void;
  exists(key: string): boolean;
}

export interface LoggerService {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface SettingsService {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
  reset(): void;
}

export interface FileService {
  download(filename: string, content: string, mimeType: string): void;
  downloadJSON(filename: string, data: unknown): void;
  downloadCSV(filename: string, rows: Record<string, unknown>[]): void;
}

export interface NotificationService {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}
