-- BranchChat — Supabase bootstrap (run once in the Supabase SQL Editor).
--
-- Mirrors Alembic migration 0001_initial exactly, and additionally:
--   * creates the least-privilege `app_user` role the API connects as
--     (RLS only enforces for a NON-superuser, NOBYPASSRLS role — never connect
--     the app as `postgres`),
--   * REVOKEs our tables from Supabase's anon/authenticated API roles (so the
--     auto-generated data API can't read them),
--   * stamps `alembic_version` to 0001_initial so future `alembic upgrade`
--     stays consistent.
--
-- Idempotent: safe to re-run. BEFORE RUNNING, replace __APP_USER_PASSWORD__
-- (one occurrence) with a strong password of your choice.

begin;

-- Extensions -----------------------------------------------------------------
create extension if not exists citext;

-- Least-privilege application role -------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password '__APP_USER_PASSWORD__'
      nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

-- Tables ---------------------------------------------------------------------
create table if not exists users (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null,
  password_hash      varchar(255) not null,
  email_verified     boolean not null default false,
  failed_login_count integer not null default 0,
  locked_until       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists uq_users_email on users (email);

create table if not exists email_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  varchar(64) not null,
  purpose     varchar(16) not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_email_tokens_hash on email_tokens (token_hash);
create index if not exists ix_email_tokens_user on email_tokens (user_id);
create index if not exists ix_email_tokens_expires on email_tokens (expires_at);

create table if not exists usage_counters (
  id            uuid primary key default gen_random_uuid(),
  identity_hash varchar(64) not null,
  day           date not null,
  kind          varchar(16) not null,
  count         integer not null default 0,
  updated_at    timestamptz not null default now(),
  constraint uq_usage_identity_day_kind unique (identity_hash, day, kind)
);

create table if not exists share_snapshots (
  id            uuid primary key default gen_random_uuid(),
  token         varchar(64) not null,
  owner_user_id uuid not null references users(id) on delete cascade,
  title         varchar(200),
  payload       jsonb not null,
  view_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz
);
create unique index if not exists uq_share_token on share_snapshots (token);
create index if not exists ix_share_owner_created
  on share_snapshots (owner_user_id, created_at);

create table if not exists login_attempts (
  id         uuid primary key default gen_random_uuid(),
  identifier varchar(64) not null,
  scope      varchar(16) not null,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_login_attempts_lookup
  on login_attempts (identifier, scope, created_at);

-- Privileges -----------------------------------------------------------------
-- Lock our tables away from Supabase's public API roles, grant the backend role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
  end if;
end
$$;

grant usage on schema public to app_user;
grant select, insert, update, delete
  on users, email_tokens, usage_counters, share_snapshots, login_attempts
  to app_user;

-- Row-level security ---------------------------------------------------------
-- Service tables: only the backend role; no anon/authenticated policy = denied.
do $$
declare t text;
begin
  foreach t in array array['users','email_tokens','usage_counters','login_attempts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_service', t);
    execute format(
      'create policy %I on %I to app_user using (true) with check (true)',
      t || '_service', t);
  end loop;
end
$$;

-- share_snapshots: real per-row ownership, forced even for the table owner.
alter table share_snapshots enable row level security;
alter table share_snapshots force row level security;
drop policy if exists share_owner on share_snapshots;
create policy share_owner on share_snapshots
  to app_user
  using (owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check (owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- Keep Alembic in sync (so `alembic upgrade head` is a no-op against this DB).
create table if not exists alembic_version (
  version_num varchar(32) not null constraint alembic_version_pkc primary key
);
insert into alembic_version (version_num)
  values ('0001_initial')
  on conflict do nothing;

commit;
