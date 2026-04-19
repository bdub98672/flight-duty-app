create extension if not exists pgcrypto;

create table if not exists duty_logs (
  id uuid primary key default gen_random_uuid(),
  pilot_name text not null,
  log_date date not null,
  duty_in text,
  duty_out text,
  flight_hours numeric(6,2),
  day_landings integer,
  night_landings integer,
  remarks text,
  exceedance_reason text,
  approved_by text,
  approval_time text,
  month_key text not null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_name, log_date)
);

create table if not exists month_signoffs (
  id uuid primary key default gen_random_uuid(),
  pilot_name text not null,
  month_key text not null,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  locked boolean not null default true,
  certification_text text,
  created_at timestamptz not null default now(),
  unique (pilot_name, month_key)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  pilot_name text,
  month_key text,
  actor_name text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table duty_logs enable row level security;
alter table month_signoffs enable row level security;
alter table audit_events enable row level security;

drop policy if exists "open duty logs" on duty_logs;
drop policy if exists "open signoffs" on month_signoffs;
drop policy if exists "open audit" on audit_events;

create policy "open duty logs" on duty_logs for all using (true) with check (true);
create policy "open signoffs" on month_signoffs for all using (true) with check (true);
create policy "open audit" on audit_events for all using (true) with check (true);
