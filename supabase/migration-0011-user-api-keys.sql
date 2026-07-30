-- Migration 0011: user_api_keys — BYOK provider keys, sealed at rest.
-- Run in the Supabase SQL editor as postgres BEFORE deploying the backend
-- commit that adds /api/keys (the chat and models routes query this table
-- for signed-in users, so deploying first would 500 them). Mirrors
-- alembic/versions/0011_user_api_keys.py.

begin;

create table if not exists user_api_keys (
  user_id uuid not null references users(id) on delete cascade,
  provider varchar(32) not null,
  sealed_key text not null,
  key_hint varchar(8) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on user_api_keys to app_user;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on user_api_keys from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on user_api_keys from authenticated;
  end if;
end
$$;

alter table user_api_keys enable row level security;
alter table user_api_keys force row level security;
drop policy if exists user_api_keys_owner on user_api_keys;
create policy user_api_keys_owner on user_api_keys
  to app_user
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

update alembic_version
  set version_num = '0011_user_api_keys'
  where version_num = '0010_sync_tombstones';

commit;

-- Verify:  select version_num from alembic_version;  -- 0011_user_api_keys
