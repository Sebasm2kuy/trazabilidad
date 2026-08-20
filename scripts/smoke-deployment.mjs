#!/usr/bin/env node

const siteUrl = new URL(process.argv[2] || 'https://sebasm2kuy.github.io/trazabilidad/');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

async function responseOk(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

const page = await responseOk(siteUrl);
const html = await page.text();
if (!html.includes('<title>Trazabilidad - Frigorífico San Jacinto</title>')) {
  throw new Error('The deployed page does not contain the expected title');
}

const assetPaths = [...html.matchAll(/(?:src|href)="(\/trazabilidad\/(?:_next|scripts)\/[^" ]+)/g)]
  .map(match => match[1]);
if (assetPaths.length === 0) throw new Error('No deployed assets were found');

for (const path of new Set(assetPaths)) {
  await responseOk(new URL(path, siteUrl.origin));
}

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
await responseOk(new URL('/auth/v1/settings', supabaseUrl), { headers: { apikey: anonKey } });

for (const table of ['profiles', 'import_runs', 'stock_snapshots']) {
  const response = await responseOk(
    new URL(`/rest/v1/${table}?select=id&limit=1`, supabaseUrl),
    { headers },
  );
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 0) {
    throw new Error(`Anonymous RLS check failed for ${table}`);
  }
}

process.stdout.write(`Deployment smoke check passed: ${siteUrl}\n`);
