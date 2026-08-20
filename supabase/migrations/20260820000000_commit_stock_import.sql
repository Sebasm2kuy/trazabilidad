-- Atomic stock confirmation. The Edge Function calls this RPC only after parsing
-- and validating the original workbook again on the server.
create or replace function public.commit_stock_import(
  p_source_name text,
  p_source_hash text,
  p_source_bytes bigint,
  p_sheet_name text,
  p_header_row integer,
  p_stock_date date,
  p_duplicate_rows integer,
  p_total_pallets integer,
  p_total_packages integer,
  p_total_kilos numeric,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.user_role;
  import_id uuid;
  v_snapshot_id uuid;
  inserted_lines integer;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role is distinct from 'supervisor' then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = '42501';
  end if;
  if p_source_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_HASH'; end if;
  if p_source_bytes <= 0 or p_stock_date is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'INVALID_IMPORT';
  end if;
  if exists (
    select 1 from public.import_runs
    where owner_id = actor and kind = 'STOCK' and source_hash = p_source_hash
  ) then raise exception 'FILE_ALREADY_IMPORTED' using errcode = '23505'; end if;

  insert into public.import_runs (
    owner_id, kind, status, source_name, source_hash, source_bytes, sheet_name,
    header_row, stock_date, validated_at, valid_rows, duplicate_rows
  ) values (
    actor, 'STOCK', 'VALIDATED', p_source_name, p_source_hash, p_source_bytes, p_sheet_name,
    p_header_row, p_stock_date, now(), jsonb_array_length(p_lines), p_duplicate_rows
  ) returning id into import_id;

  insert into public.stock_snapshots (
    owner_id, import_run_id, stock_date, source_name, source_hash, status,
    is_current, line_count, total_pallets, total_packages, total_kilos
  ) values (
    actor, import_id, p_stock_date, p_source_name, p_source_hash, 'STAGED', false,
    jsonb_array_length(p_lines), p_total_pallets, p_total_packages, p_total_kilos
  ) returning id into v_snapshot_id;

  insert into public.stock_lines (
    owner_id, snapshot_id, source_row, dedup_key, customer_code, customer_name,
    commission_date, delivery_date, container_number, pallets, packages, kilos,
    product_description, lot, dua, expiration_date, entry_exit, cote, sanitary_pass
  )
  select actor, v_snapshot_id, item.source_row, item.dedup_key, item.customer_code,
    item.customer_name, item.commission_date, item.delivery_date,
    item.container_number, item.pallets, item.packages, item.kilos,
    item.product_description, item.lot, item.dua, item.expiration_date,
    item.entry_exit, item.cote, item.sanitary_pass
  from jsonb_to_recordset(p_lines) as item(
    source_row integer, dedup_key text, customer_code text, customer_name text,
    commission_date date, delivery_date date, container_number text, pallets integer,
    packages integer, kilos numeric, product_description text, lot text, dua text,
    expiration_date date, entry_exit text, cote text, sanitary_pass text
  );
  get diagnostics inserted_lines = row_count;

  if inserted_lines <> jsonb_array_length(p_lines)
     or (select coalesce(sum(pallets), 0) from public.stock_lines where snapshot_id = v_snapshot_id) <> p_total_pallets
     or (select coalesce(sum(packages), 0) from public.stock_lines where snapshot_id = v_snapshot_id) <> p_total_packages
     or (select coalesce(sum(kilos), 0) from public.stock_lines where snapshot_id = v_snapshot_id) <> p_total_kilos
  then raise exception 'TOTAL_MISMATCH'; end if;

  update public.stock_snapshots set
    status = 'SUPERSEDED', is_current = false, superseded_at = now()
  where owner_id = actor and is_current and id <> v_snapshot_id;

  update public.stock_snapshots set status = 'CURRENT', is_current = true
  where id = v_snapshot_id;
  update public.import_runs set status = 'COMMITTED', committed_at = now()
  where id = import_id;
  insert into public.audit_events (owner_id, import_run_id, action, entity_type, entity_id, details)
  values (actor, import_id, 'COMMIT', 'StockSnapshot', v_snapshot_id,
    jsonb_build_object('sourceHash', p_source_hash, 'lineCount', inserted_lines));

  return jsonb_build_object('importRunId', import_id, 'snapshotId', v_snapshot_id, 'lineCount', inserted_lines);
end;
$$;

revoke all on function public.commit_stock_import(text,text,bigint,text,integer,date,integer,integer,integer,numeric,jsonb) from public;
grant execute on function public.commit_stock_import(text,text,bigint,text,integer,date,integer,integer,integer,numeric,jsonb) to authenticated;
