-- Supabase/PostgreSQL foundation for the GitHub Pages deployment.
-- Apply with the Supabase migration workflow, never by exposing database credentials to Pages.

create extension if not exists pgcrypto;

create type public.user_role as enum ('comercial', 'supervisor');
create type public.import_kind as enum ('INBOUND', 'OUTBOUND', 'STOCK');
create type public.import_status as enum ('PENDING', 'VALIDATED', 'COMMITTED', 'REJECTED', 'ROLLED_BACK');
create type public.snapshot_status as enum ('STAGED', 'CURRENT', 'SUPERSEDED', 'ROLLED_BACK');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.user_role not null default 'comercial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  kind public.import_kind not null,
  status public.import_status not null default 'PENDING',
  source_name text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  source_bytes bigint not null check (source_bytes >= 0),
  sheet_name text,
  header_row integer check (header_row is null or header_row > 0),
  stock_date date,
  started_at timestamptz not null default now(),
  validated_at timestamptz,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  valid_rows integer not null default 0 check (valid_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  recognized jsonb,
  unknown_columns jsonb,
  report jsonb,
  error_message text,
  unique (owner_id, kind, source_hash)
);

create index import_runs_status_started_idx on public.import_runs(owner_id, status, started_at desc);

create table public.inbound_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  procedure_number text not null,
  procedure_date date not null,
  cote text not null,
  movement_type text,
  origin_name text,
  origin_number text,
  certifier_name text,
  veterinarian_name text,
  cote_issued_at timestamptz,
  transport_type text,
  truck_registration text,
  container_number text,
  seal_1 text,
  destination_name text,
  destination_country text,
  observations text,
  source_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, procedure_number, cote)
);

create index inbound_movements_cote_idx on public.inbound_movements(owner_id, cote);
create index inbound_movements_date_idx on public.inbound_movements(owner_id, procedure_date desc);

create table public.inbound_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  movement_id uuid not null references public.inbound_movements(id) on delete cascade,
  import_run_id uuid not null references public.import_runs(id),
  source_row integer not null check (source_row > 0),
  source_line_id text not null,
  dedup_key text not null,
  package_code text,
  product text not null,
  cut text,
  lot_usa_canada text,
  lots_china text,
  pallets integer check (pallets is null or pallets >= 0),
  packages integer check (packages is null or packages >= 0),
  gross_weight numeric(18,3) check (gross_weight is null or gross_weight >= 0),
  net_weight numeric(18,3) check (net_weight is null or net_weight >= 0),
  slaughter_start date,
  slaughter_end date,
  production_start date,
  production_end date,
  freezing_start date,
  freezing_end date,
  raw_extra jsonb,
  created_at timestamptz not null default now(),
  unique (import_run_id, dedup_key)
);

create index inbound_lines_movement_product_idx on public.inbound_lines(owner_id, movement_id, product, cut);
create index inbound_lines_lot_idx on public.inbound_lines(owner_id, lot_usa_canada);

create table public.outbound_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  procedure_number text not null,
  procedure_date date not null,
  cote text not null,
  movement_type text,
  destination_country text,
  destination_name text,
  transport_type text,
  truck_registration text,
  container_number text,
  seal_1 text,
  seal_2 text,
  seal_3 text,
  seal_4 text,
  sanitary_certificate text,
  received_at timestamptz,
  reception_service text,
  reception_observations text,
  reception_user text,
  exterior_inspection_ok boolean,
  inspection_observations text,
  observations text,
  source_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, procedure_number, cote)
);

create index outbound_movements_cote_idx on public.outbound_movements(owner_id, cote);
create index outbound_movements_date_idx on public.outbound_movements(owner_id, procedure_date desc);
create index outbound_movements_destination_idx on public.outbound_movements(owner_id, destination_country, destination_name);

create table public.outbound_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  movement_id uuid not null references public.outbound_movements(id) on delete cascade,
  import_run_id uuid not null references public.import_runs(id),
  source_row integer not null check (source_row > 0),
  source_line_id text not null,
  dedup_key text not null,
  package_code text,
  product text not null,
  cut text,
  lot_usa_canada text,
  lots_china text,
  pallets integer check (pallets is null or pallets >= 0),
  packages integer check (packages is null or packages >= 0),
  gross_weight numeric(18,3) check (gross_weight is null or gross_weight >= 0),
  net_weight numeric(18,3) check (net_weight is null or net_weight >= 0),
  shipping text,
  security_paper text,
  raw_extra jsonb,
  created_at timestamptz not null default now(),
  unique (import_run_id, dedup_key)
);

create index outbound_lines_movement_product_idx on public.outbound_lines(owner_id, movement_id, product, cut);
create index outbound_lines_lot_idx on public.outbound_lines(owner_id, lot_usa_canada);

create table public.stock_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  import_run_id uuid not null unique references public.import_runs(id),
  stock_date date not null,
  imported_at timestamptz not null default now(),
  source_name text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  status public.snapshot_status not null default 'STAGED',
  is_current boolean not null default false,
  line_count integer not null check (line_count >= 0),
  total_pallets integer not null check (total_pallets >= 0),
  total_packages integer not null check (total_packages >= 0),
  total_kilos numeric(18,3) not null check (total_kilos >= 0),
  superseded_at timestamptz,
  unique (owner_id, source_hash)
);

create unique index stock_one_current_per_owner_idx on public.stock_snapshots(owner_id) where is_current;
create index stock_snapshots_history_idx on public.stock_snapshots(owner_id, stock_date desc, imported_at desc);

create table public.stock_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  snapshot_id uuid not null references public.stock_snapshots(id) on delete cascade,
  source_row integer not null check (source_row > 0),
  dedup_key text not null,
  customer_code text,
  customer_name text,
  commission_date date,
  delivery_date date,
  container_number text not null,
  pallets integer not null check (pallets >= 0),
  packages integer not null check (packages >= 0),
  kilos numeric(18,3) not null check (kilos >= 0),
  product_description text not null,
  lot text not null,
  dua text,
  expiration_date date,
  entry_exit text,
  cote text,
  sanitary_pass text,
  unique (snapshot_id, dedup_key)
);

create index stock_lines_cote_idx on public.stock_lines(owner_id, cote);
create index stock_lines_pass_idx on public.stock_lines(owner_id, sanitary_pass);
create index stock_lines_lot_idx on public.stock_lines(owner_id, lot);
create index stock_lines_container_idx on public.stock_lines(owner_id, container_number);
create index stock_lines_customer_idx on public.stock_lines(owner_id, customer_code);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  import_run_id uuid references public.import_runs(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events(owner_id, entity_type, entity_id);
create index audit_events_created_idx on public.audit_events(owner_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger inbound_movements_updated_at before update on public.inbound_movements
for each row execute function public.set_updated_at();
create trigger outbound_movements_updated_at before update on public.outbound_movements
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email, 'usuario'),
    'comercial'
  );
  return new;
end;
$$;

create trigger auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.import_runs enable row level security;
alter table public.inbound_movements enable row level security;
alter table public.inbound_lines enable row level security;
alter table public.outbound_movements enable row level security;
alter table public.outbound_lines enable row level security;
alter table public.stock_snapshots enable row level security;
alter table public.stock_lines enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_own_select on public.profiles for select to authenticated using (id = auth.uid());

create policy import_runs_own_select on public.import_runs for select to authenticated using (owner_id = auth.uid());
create policy inbound_movements_own_select on public.inbound_movements for select to authenticated using (owner_id = auth.uid());
create policy inbound_lines_own_select on public.inbound_lines for select to authenticated using (owner_id = auth.uid());
create policy outbound_movements_own_select on public.outbound_movements for select to authenticated using (owner_id = auth.uid());
create policy outbound_lines_own_select on public.outbound_lines for select to authenticated using (owner_id = auth.uid());
create policy stock_snapshots_own_select on public.stock_snapshots for select to authenticated using (owner_id = auth.uid());
create policy stock_lines_own_select on public.stock_lines for select to authenticated using (owner_id = auth.uid());
create policy audit_events_own_select on public.audit_events for select to authenticated using (owner_id = auth.uid());

-- Operational writes intentionally have no browser policy. Authenticated clients can read
-- their rows; transactional imports and mutations must run in audited Edge Functions.
