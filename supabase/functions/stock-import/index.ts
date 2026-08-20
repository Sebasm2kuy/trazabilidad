import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StockLine {
  sourceRow: number;
  dedupKey: string;
  customerCode: string;
  customerName: string;
  commissionDate: string | null;
  deliveryDate: string | null;
  containerNumber: string;
  pallets: number;
  packages: number;
  kilos: number;
  productDescription: string;
  lot: string;
  dua: string;
  expirationDate: string | null;
  entryExit: string;
  cote: string;
  sanitaryPass: string;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validLine(line: StockLine) {
  return Number.isInteger(line.sourceRow) && line.sourceRow > 0 &&
    line.dedupKey?.length > 0 && line.containerNumber?.length > 0 &&
    line.productDescription?.length > 0 && line.lot?.length > 0 &&
    Number.isInteger(line.pallets) && line.pallets >= 0 &&
    Number.isInteger(line.packages) && line.packages >= 0 &&
    Number.isFinite(line.kilos) && line.kilos >= 0;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json(401, { error: 'AUTH_REQUIRED' });
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) return json(500, { error: 'SERVER_NOT_CONFIGURED' });
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json(401, { error: 'INVALID_SESSION' });

    const form = await request.formData();
    const file = form.get('file');
    const payloadText = form.get('payload');
    if (!(file instanceof File) || typeof payloadText !== 'string') return json(400, { error: 'INVALID_FORM' });
    if (file.size <= 0 || file.size > 10 * 1024 * 1024 || !/\.xls[x]?$/i.test(file.name)) {
      return json(400, { error: 'INVALID_FILE' });
    }

    const payload = JSON.parse(payloadText);
    const fileBuffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== payload.sourceHash) return json(400, { error: 'HASH_MISMATCH' });
    if (!Array.isArray(payload.lines) || payload.lines.length === 0 || payload.lines.length > 10000) {
      return json(400, { error: 'INVALID_LINES' });
    }
    if (!payload.lines.every(validLine)) return json(400, { error: 'INVALID_LINE' });
    if (new Set(payload.lines.map((line: StockLine) => line.dedupKey)).size !== payload.lines.length) {
      return json(400, { error: 'DUPLICATE_LINES' });
    }

    const totals = payload.lines.reduce((sum: { pallets: number; packages: number; kilos: number }, line: StockLine) => ({
      pallets: sum.pallets + line.pallets,
      packages: sum.packages + line.packages,
      kilos: sum.kilos + line.kilos,
    }), { pallets: 0, packages: 0, kilos: 0 });

    const rpcLines = payload.lines.map((line: StockLine) => ({
      source_row: line.sourceRow, dedup_key: line.dedupKey,
      customer_code: line.customerCode, customer_name: line.customerName,
      commission_date: line.commissionDate, delivery_date: line.deliveryDate,
      container_number: line.containerNumber, pallets: line.pallets,
      packages: line.packages, kilos: line.kilos,
      product_description: line.productDescription, lot: line.lot, dua: line.dua,
      expiration_date: line.expirationDate, entry_exit: line.entryExit,
      cote: line.cote, sanitary_pass: line.sanitaryPass,
    }));
    const { data, error } = await supabase.rpc('commit_stock_import', {
      p_source_name: file.name, p_source_hash: hash, p_source_bytes: file.size,
      p_sheet_name: payload.sheetName, p_header_row: payload.headerRow,
      p_stock_date: payload.stockDate, p_duplicate_rows: payload.duplicateRows,
      p_total_pallets: totals.pallets, p_total_packages: totals.packages,
      p_total_kilos: totals.kilos, p_lines: rpcLines,
    });
    if (error) {
      const duplicate = error.message.includes('FILE_ALREADY_IMPORTED') || error.code === '23505';
      return json(duplicate ? 409 : 400, { error: duplicate ? 'FILE_ALREADY_IMPORTED' : 'COMMIT_FAILED' });
    }
    return json(200, data);
  } catch {
    return json(400, { error: 'INVALID_REQUEST' });
  }
});
