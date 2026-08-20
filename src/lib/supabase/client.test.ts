import { describe, expect, test } from 'bun:test';

describe('Supabase public configuration', () => {
  test('the client module never references privileged credentials', async () => {
    const source = await Bun.file(import.meta.dir + '/client.ts').text();
    expect(source).not.toContain('SERVICE_ROLE');
    expect(source).not.toContain('DATABASE_URL');
    expect(source).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});
