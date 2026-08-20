import { describe, expect, test } from 'bun:test';
import { getAllowedTabs } from './auth';

describe('Supabase-backed navigation', () => {
  test('does not expose screens that still read bundled or local data', () => {
    expect(getAllowedTabs('supervisor')).toEqual([
      'dashboard', 'depositos', 'exportaciones', 'importar',
    ]);
    expect(getAllowedTabs('supervisor')).not.toContain('trazabilidad-explorer');
    expect(getAllowedTabs('supervisor')).not.toContain('mercado-nacional');
    expect(getAllowedTabs('supervisor')).not.toContain('clientes-estrategicos');
  });

  test('gives commercial users no legacy operational screen', () => {
    expect(getAllowedTabs('comercial')).toEqual(['dashboard']);
  });
});
