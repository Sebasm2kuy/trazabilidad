import { beforeEach, describe, expect, test } from 'bun:test';
import { archiveLegacyOperationalStorage } from './legacyStorage';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

describe('archiveLegacyOperationalStorage', () => {
  beforeEach(() => storage.clear());

  test('archives and removes legacy operational records once', () => {
    storage.setItem('trazabilidad_dep_imported', '[{"id":"legacy"}]');
    storage.setItem('theme', 'dark');

    archiveLegacyOperationalStorage();

    expect(storage.getItem('trazabilidad_dep_imported')).toBeNull();
    expect(storage.getItem('theme')).toBe('dark');
    expect(storage.getItem('trazabilidad_legacy_backup_v1')).toContain('legacy');
    expect(storage.getItem('trazabilidad_supabase_storage_migrated_v1')).not.toBeNull();
  });
});
