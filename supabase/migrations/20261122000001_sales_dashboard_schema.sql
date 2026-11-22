-- ===========================================================================
-- GHL Multi-Account Sales Call Tracking — schema, RLS and RBAC.
--
-- Use a DEDICATED Supabase project for this app (not the Central Hub one).
-- Run with `supabase db push`, or paste into SQL Editor. Safe to re-run.
--
-- Isolation model
--   * Every GHL-sourced row carries account_id (→ ghl_accounts.location_id)
--     and its original GHL id, with UNIQUE (account_id, ghl_*_id). Two
--     sub-accounts can never collide, and re-delivered events upsert in place.
--   * Roles: admin (everything), manager (assigned accounts), rep (only rows
--     assigned to their linked sales_reps). Enforced here by RLS — the UI
--     mirrors it but is not the boundary.
--   * Credentials (ghl_credentials, oauth_states) have RLS enabled and NO
--     policies: only the server's service-role key can read them, and token
--     values are AES-256-GCM encrypted by the app before they are stored.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Users and roles
-- ---------------------------------------------------------------------------
create table if not exists user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'rep' check (role in ('admin', 'manager', 'rep')),
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- GHL sub-accounts and credentials
-- ---------------------------------------------------------------------------
create table if not exists ghl_accounts (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  location_id              text not null unique,
  company_id               text,
  auth_type                text not null default 'oauth' check (auth_type in ('oauth', 'private_integration')),
  -- For private integrations: the NAME of the server env var holding the
  -- token (e.g. GHL_PIT_ACCOUNT_1). The token itself never enters the DB.
  credential_env_var       text check (credential_env_var is null or credential_env_var ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  timezone                 text,
  color                    text not null default '#6366f1',
  active                   boolean not null default true,
  connection_status        text not null default 'not_connected'
                           check (connection_status in ('not_connected', 'connected', 'error', 'revoked')),
  granted_scopes           text[],
  last_successful_sync_at  timestamptz,
  last_sync_started_at     timestamptz,
  webhook_status           text not null default 'inactive' check (webhook_status in ('active', 'inactive', 'unavailable')),
  last_webhook_at          timestamptz,
  last_error               text,
  last_error_at            timestamptz,
  -- Reconciliation look-back/forward windows for appointments (days).
  appointment_lookback_days int not null default 120,
  appointment_lookahead_days int not null default 60,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists ghl_credentials (
  account_id        uuid primary key references ghl_accounts(id) on delete cascade,
  access_token_enc  text not null,
  refresh_token_enc text,
  expires_at        timestamptz,
  scopes            text,
  user_type         text,
  ghl_user_id       text,
  updated_at        timestamptz not null default now()
);

create table if not exists oauth_states (
  state       text primary key,
  account_id  uuid references ghl_accounts(id) on delete cascade,
  created_by  uuid references user_profiles(id) on delete set null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists user_account_access (
  user_id    uuid not null references user_profiles(id) on delete cascade,
  account_id uuid not null references ghl_accounts(id) on delete cascade,
  primary key (user_id, account_id)
);

-- ---------------------------------------------------------------------------
-- Reference data from GHL
-- ---------------------------------------------------------------------------
create table if not exists sales_reps (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references ghl_accounts(id) on delete cascade,
  ghl_user_id  text not null,
  name         text not null,
  email        text,
  -- Same human across sub-accounts → same person_key (lower(email) by default).
  person_key   text not null,
  user_id      uuid references user_profiles(id) on delete set null,
  active       boolean not null default true,
  updated_at   timestamptz not null default now(),
  unique (account_id, ghl_user_id)
);
create index if not exists sales_reps_user_idx on sales_reps(user_id);

create table if not exists pipelines (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references ghl_accounts(id) on delete cascade,
  ghl_pipeline_id   text not null,
  name              text not null,
  is_sales_pipeline boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique (account_id, ghl_pipeline_id)
);

create table if not exists pipeline_stages (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references ghl_accounts(id) on delete cascade,
  pipeline_id     uuid not null references pipelines(id) on delete cascade,
  ghl_stage_id    text not null,
  name            text not null,
  position        int not null default 0,
  business_stage  text check (business_stage in ('new_lead', 'first_call', 'second_call', 'third_call', 'fourth_stage', 'closing')),
  updated_at      timestamptz not null default now(),
  unique (account_id, ghl_stage_id)
);

create table if not exists calendars (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references ghl_accounts(id) on delete cascade,
  ghl_calendar_id   text not null,
  name              text not null,
  -- 1/2/3… = calendar dedicated to that call; null = numbered by sequence.
  call_number       int check (call_number is null or call_number between 1 and 9),
  is_sales_calendar boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique (account_id, ghl_calendar_id)
);

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references ghl_accounts(id) on delete cascade,
  ghl_contact_id        text not null,
  first_name            text,
  last_name             text,
  full_name             text,
  company_name          text,
  email                 text,
  phone                 text,
  source                text,
  assigned_ghl_user_id  text,
  date_added            timestamptz,
  ghl_updated_at        timestamptz,
  deleted_at            timestamptz,
  synced_at             timestamptz not null default now(),
  unique (account_id, ghl_contact_id)
);

create table if not exists opportunities (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references ghl_accounts(id) on delete cascade,
  ghl_opportunity_id     text not null,
  ghl_contact_id         text,
  name                   text,
  ghl_pipeline_id        text,
  pipeline_id            uuid references pipelines(id) on delete set null,
  ghl_stage_id           text,
  stage_id               uuid references pipeline_stages(id) on delete set null,
  status                 text not null default 'open' check (status in ('open', 'won', 'lost', 'abandoned')),
  monetary_value         numeric(14, 2) not null default 0,
  source                 text,
  assigned_ghl_user_id   text,
  rep_id                 uuid references sales_reps(id) on delete set null,
  ghl_created_at         timestamptz,
  last_stage_change_at   timestamptz,
  last_status_change_at  timestamptz,
  won_at                 timestamptz,
  lost_at                timestamptz,
  last_activity_at       timestamptz,
  ghl_updated_at         timestamptz,
  deleted_at             timestamptz,
  synced_at              timestamptz not null default now(),
  unique (account_id, ghl_opportunity_id)
);
create index if not exists opportunities_contact_idx on opportunities(account_id, ghl_contact_id);
create index if not exists opportunities_rep_idx on opportunities(rep_id);
create index if not exists opportunities_created_idx on opportunities(ghl_created_at);

create table if not exists appointments (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references ghl_accounts(id) on delete cascade,
  ghl_appointment_id    text not null,
  ghl_calendar_id       text,
  calendar_id           uuid references calendars(id) on delete set null,
  ghl_contact_id        text,
  opportunity_id        uuid references opportunities(id) on delete set null,
  assigned_ghl_user_id  text,
  rep_id                uuid references sales_reps(id) on delete set null,
  title                 text,
  ghl_status            text not null check (ghl_status in ('new', 'confirmed', 'cancelled', 'showed', 'noshow', 'invalid')),
  start_time            timestamptz not null,
  end_time              timestamptz,
  booked_at             timestamptz,
  original_start_time   timestamptz,
  reschedule_count      int not null default 0,
  -- Dashboard-only manual outcome. Never written back to GHL.
  outcome_override      text check (outcome_override in ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled', 'pending_outcome')),
  outcome_override_by   uuid references user_profiles(id) on delete set null,
  outcome_override_at   timestamptz,
  ghl_updated_at        timestamptz,
  deleted_at            timestamptz,
  synced_at             timestamptz not null default now(),
  unique (account_id, ghl_appointment_id)
);
create index if not exists appointments_contact_idx on appointments(account_id, ghl_contact_id);
create index if not exists appointments_start_idx on appointments(start_time);

create table if not exists call_activities (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references ghl_accounts(id) on delete cascade,
  ghl_message_id    text not null,
  ghl_contact_id    text,
  ghl_user_id       text,
  rep_id            uuid references sales_reps(id) on delete set null,
  direction         text check (direction in ('inbound', 'outbound')),
  call_status       text,
  duration_seconds  int,
  occurred_at       timestamptz not null,
  unique (account_id, ghl_message_id)
);

create table if not exists stage_transitions (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references ghl_accounts(id) on delete cascade,
  opportunity_id       uuid not null references opportunities(id) on delete cascade,
  from_ghl_stage_id    text,
  to_ghl_stage_id      text,
  from_business_stage  text,
  to_business_stage    text,
  entered_at           timestamptz not null,
  -- webhook / reconcile_diff are observed; snapshot is reconstructed from
  -- lastStageChangeAt on first sync and is labelled as such in reports.
  source               text not null check (source in ('webhook', 'reconcile_diff', 'snapshot')),
  created_at           timestamptz not null default now(),
  unique (opportunity_id, to_ghl_stage_id, entered_at)
);

create table if not exists revenue_receipts (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references ghl_accounts(id) on delete cascade,
  ghl_transaction_id  text,
  opportunity_id      uuid references opportunities(id) on delete set null,
  ghl_contact_id      text,
  amount              numeric(14, 2) not null,
  currency            text,
  received_at         timestamptz not null,
  source              text not null check (source in ('ghl_payments', 'manual')),
  note                text,
  created_by          uuid references user_profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (account_id, ghl_transaction_id)
);

-- ---------------------------------------------------------------------------
-- Integration plumbing
-- ---------------------------------------------------------------------------
create table if not exists webhook_events (
  id               uuid primary key default gen_random_uuid(),
  -- webhookId from the payload when present, else sha256 of the raw body.
  dedupe_key       text not null unique,
  account_id       uuid references ghl_accounts(id) on delete set null,
  location_id      text,
  event_type       text not null,
  payload          jsonb not null,
  signature_valid  boolean not null,
  status           text not null default 'received'
                   check (status in ('received', 'processed', 'failed', 'ignored', 'dead')),
  attempts         int not null default 0,
  last_error       text,
  next_attempt_at  timestamptz,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz
);
create index if not exists webhook_events_retry_idx on webhook_events(status, next_attempt_at);

create table if not exists sync_runs (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references ghl_accounts(id) on delete cascade,
  kind         text not null check (kind in ('full', 'reconcile', 'webhook_retry', 'manual')),
  status       text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  counts       jsonb not null default '{}'::jsonb,
  error        text
);
create index if not exists sync_runs_account_idx on sync_runs(account_id, started_at desc);

create table if not exists sync_logs (
  id          bigserial primary key,
  run_id      uuid references sync_runs(id) on delete cascade,
  account_id  uuid references ghl_accounts(id) on delete cascade,
  level       text not null check (level in ('info', 'warn', 'error')),
  message     text not null,
  context     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists sync_logs_account_idx on sync_logs(account_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  id                             int primary key default 1 check (id = 1),
  reporting_timezone             text not null default 'UTC',
  funnel_stages                  jsonb not null default '[]'::jsonb,
  outcome_mapping                jsonb not null default '{}'::jsonb,
  abandoned_counts_as_lost       boolean not null default true,
  pending_outcome_grace_minutes  int not null default 60,
  updated_at                     timestamptz not null default now(),
  updated_by                     uuid references user_profiles(id) on delete set null
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists follow_up_rules (
  key             text primary key check (key in ('new_lead_no_first_call', 'first_done_no_second', 'second_done_no_third', 'missed_no_reschedule', 'inactive')),
  label           text not null,
  enabled         boolean not null default true,
  threshold_days  int not null check (threshold_days between 0 and 365),
  updated_at      timestamptz not null default now()
);
insert into follow_up_rules (key, label, threshold_days) values
  ('new_lead_no_first_call', 'New lead without a first call scheduled', 2),
  ('first_done_no_second', 'First call completed, no second call scheduled', 3),
  ('second_done_no_third', 'Second call completed, no third call scheduled', 5),
  ('missed_no_reschedule', 'Missed appointment without a rescheduled call', 1),
  ('inactive', 'Lead inactive beyond threshold', 14)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies don't recurse into RLS)
-- ---------------------------------------------------------------------------
create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from user_profiles where id = auth.uid() and active
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = 'admin', false)
$$;

create or replace function can_view_account(acc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case app_role()
    when 'admin' then true
    when 'manager' then exists (select 1 from user_account_access where user_id = auth.uid() and account_id = acc)
    when 'rep' then exists (select 1 from sales_reps where user_id = auth.uid() and account_id = acc)
    else false
  end
$$;

-- Manager/admin see every record in a visible account; a rep only their own.
create or replace function can_view_record(acc uuid, rep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case app_role()
    when 'admin' then true
    when 'manager' then exists (select 1 from user_account_access where user_id = auth.uid() and account_id = acc)
    when 'rep' then rep is not null and exists (select 1 from sales_reps where id = rep and user_id = auth.uid())
    else false
  end
$$;

create or replace function can_manage_account(acc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case app_role()
    when 'admin' then true
    when 'manager' then exists (select 1 from user_account_access where user_id = auth.uid() and account_id = acc)
    else false
  end
$$;

revoke all on function app_role(), is_admin(), can_view_account(uuid), can_view_record(uuid, uuid), can_manage_account(uuid) from public;
grant execute on function app_role(), is_admin(), can_view_account(uuid), can_view_record(uuid, uuid), can_manage_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up: first account becomes an active admin; everyone else lands as an
-- inactive rep with no access until an admin activates and assigns them.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
begin
  perform pg_advisory_xact_lock(4242);
  select not exists (select 1 from user_profiles) into first_user;
  insert into user_profiles (id, email, full_name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          case when first_user then 'admin' else 'rep' end, first_user)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_sales on auth.users;
create trigger on_auth_user_created_sales after insert on auth.users
  for each row execute function handle_new_user();

-- Never remove the last active admin.
create or replace function protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)) then
    if not exists (select 1 from user_profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'Cannot remove the last active admin';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists user_profiles_last_admin on user_profiles;
create trigger user_profiles_last_admin before update or delete on user_profiles
  for each row execute function protect_last_admin();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table user_profiles        enable row level security;
alter table ghl_accounts         enable row level security;
alter table ghl_credentials      enable row level security;
alter table oauth_states         enable row level security;
alter table user_account_access  enable row level security;
alter table sales_reps           enable row level security;
alter table pipelines            enable row level security;
alter table pipeline_stages      enable row level security;
alter table calendars            enable row level security;
alter table contacts             enable row level security;
alter table opportunities        enable row level security;
alter table appointments         enable row level security;
alter table call_activities      enable row level security;
alter table stage_transitions    enable row level security;
alter table revenue_receipts     enable row level security;
alter table webhook_events       enable row level security;
alter table sync_runs            enable row level security;
alter table sync_logs            enable row level security;
alter table app_settings         enable row level security;
alter table follow_up_rules      enable row level security;

-- ghl_credentials and oauth_states: intentionally NO policies (service role only).
revoke all on ghl_credentials, oauth_states from anon, authenticated;

do $$
declare p record;
begin
  -- Drop and recreate our policies so the file is re-runnable.
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename = any (array[
    'user_profiles','ghl_accounts','user_account_access','sales_reps','pipelines','pipeline_stages','calendars',
    'contacts','opportunities','appointments','call_activities','stage_transitions','revenue_receipts',
    'webhook_events','sync_runs','sync_logs','app_settings','follow_up_rules']) loop
    execute format('drop policy if exists %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

-- Profiles
create policy profiles_self_read on user_profiles for select using (id = auth.uid() or is_admin());
create policy profiles_admin_update on user_profiles for update using (is_admin()) with check (is_admin());
create policy profiles_admin_delete on user_profiles for delete using (is_admin());

create policy access_read on user_account_access for select using (user_id = auth.uid() or is_admin());
create policy access_admin_write on user_account_access for all using (is_admin()) with check (is_admin());

-- Accounts (credentials live elsewhere)
create policy accounts_read on ghl_accounts for select using (can_view_account(id));
create policy accounts_admin_insert on ghl_accounts for insert with check (is_admin());
create policy accounts_admin_update on ghl_accounts for update using (is_admin()) with check (is_admin());
create policy accounts_admin_delete on ghl_accounts for delete using (is_admin());

-- Reference data: readable in visible accounts; mapping columns admin-writable.
create policy reps_read on sales_reps for select using (can_view_account(account_id));
create policy reps_admin_update on sales_reps for update using (is_admin()) with check (is_admin());
create policy pipelines_read on pipelines for select using (can_view_account(account_id));
create policy pipelines_admin_update on pipelines for update using (is_admin()) with check (is_admin());
create policy stages_read on pipeline_stages for select using (can_view_account(account_id));
create policy stages_admin_update on pipeline_stages for update using (is_admin()) with check (is_admin());
create policy calendars_read on calendars for select using (can_view_account(account_id));
create policy calendars_admin_update on calendars for update using (is_admin()) with check (is_admin());

-- Records: reps only see rows assigned to them.
create policy opps_read on opportunities for select using (can_view_record(account_id, rep_id));
create policy contacts_read on contacts for select using (
  can_manage_account(account_id)
  or exists (select 1 from opportunities o where o.account_id = contacts.account_id
             and o.ghl_contact_id = contacts.ghl_contact_id and can_view_record(o.account_id, o.rep_id))
);
create policy appts_read on appointments for select using (
  can_view_record(account_id, rep_id)
  or exists (select 1 from opportunities o where o.id = appointments.opportunity_id and can_view_record(o.account_id, o.rep_id))
);
create policy appts_outcome_update on appointments for update
  using (can_manage_account(account_id)) with check (can_manage_account(account_id));
create policy calls_read on call_activities for select using (can_view_record(account_id, rep_id));
create policy transitions_read on stage_transitions for select using (
  exists (select 1 from opportunities o where o.id = stage_transitions.opportunity_id and can_view_record(o.account_id, o.rep_id))
);
create policy receipts_read on revenue_receipts for select using (
  can_manage_account(account_id)
  or exists (select 1 from opportunities o where o.id = revenue_receipts.opportunity_id and can_view_record(o.account_id, o.rep_id))
);
create policy receipts_manual_insert on revenue_receipts for insert
  with check (source = 'manual' and can_manage_account(account_id));

-- Plumbing: admins can inspect; only the server (service role) writes.
create policy webhooks_admin_read on webhook_events for select using (is_admin());
create policy runs_read on sync_runs for select using (is_admin() or (account_id is not null and can_manage_account(account_id)));
create policy logs_read on sync_logs for select using (is_admin() or (account_id is not null and can_manage_account(account_id)));

-- Settings: everyone signed in and active reads; admins write.
create policy settings_read on app_settings for select using (app_role() is not null);
create policy settings_admin_update on app_settings for update using (is_admin()) with check (is_admin());
create policy rules_read on follow_up_rules for select using (app_role() is not null);
create policy rules_admin_update on follow_up_rules for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Column-level write privileges: authenticated users may only change the
-- dashboard-owned columns. GHL-sourced columns are written by the server only.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on all tables in schema public from anon;
revoke insert, update, delete on ghl_accounts, sales_reps, pipelines, pipeline_stages, calendars, contacts,
  opportunities, appointments, call_activities, stage_transitions, revenue_receipts, webhook_events,
  sync_runs, sync_logs, user_profiles, app_settings, follow_up_rules from authenticated;

grant insert (name, location_id, auth_type, credential_env_var, color, timezone) on ghl_accounts to authenticated;
grant update (name, auth_type, credential_env_var, color, active, appointment_lookback_days, appointment_lookahead_days) on ghl_accounts to authenticated;
grant delete on ghl_accounts to authenticated;
grant update (user_id, person_key) on sales_reps to authenticated;
grant update (is_sales_pipeline) on pipelines to authenticated;
grant update (business_stage) on pipeline_stages to authenticated;
grant update (call_number, is_sales_calendar) on calendars to authenticated;
grant update (outcome_override, outcome_override_by, outcome_override_at) on appointments to authenticated;
grant insert (account_id, opportunity_id, ghl_contact_id, amount, currency, received_at, source, note, created_by) on revenue_receipts to authenticated;
grant update (role, active, full_name) on user_profiles to authenticated;
grant delete on user_profiles to authenticated;
grant insert, delete on user_account_access to authenticated;
grant update (reporting_timezone, funnel_stages, outcome_mapping, abandoned_counts_as_lost, pending_outcome_grace_minutes, updated_at, updated_by) on app_settings to authenticated;
grant update (enabled, threshold_days, updated_at) on follow_up_rules to authenticated;
