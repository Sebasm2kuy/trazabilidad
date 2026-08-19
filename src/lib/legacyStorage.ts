const LEGACY_OPERATIONAL_KEYS = [
  'trazabilidad_new_records',
  'trazabilidad_exp_edits',
  'trazabilidad_exp_deleted',
  'trazabilidad_exp_ingresos',
  'trazabilidad_dep_edits',
  'trazabilidad_dep_new_records',
  'trazabilidad_dep_deleted',
  'cruce_caliral_edits',
  'trazabilidad_stock_data',
  'trazabilidad_imported_batches',
  'trazabilidad_dep_imported',
  'trazabilidad_exp_imported',
  'trazabilidad_stock_assignments',
] as const;

const MIGRATION_MARKER = 'trazabilidad_supabase_storage_migrated_v1';
const BACKUP_KEY = 'trazabilidad_legacy_backup_v1';

/**
 * Stops legacy browser data from leaking into the Supabase-backed UI.
 * Values are archived once before removal so the transition is reversible.
 */
export function archiveLegacyOperationalStorage(): void {
  if (typeof window === 'undefined' || localStorage.getItem(MIGRATION_MARKER)) return;

  const backup: Record<string, string> = {};
  for (const key of LEGACY_OPERATIONAL_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) backup[key] = value;
  }

  if (Object.keys(backup).length > 0) {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ archivedAt: new Date().toISOString(), data: backup }));
  }
  for (const key of LEGACY_OPERATIONAL_KEYS) localStorage.removeItem(key);
  localStorage.setItem(MIGRATION_MARKER, new Date().toISOString());
}
