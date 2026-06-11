-- Migration 0005: synced_chats — optional server-side sync for signed-in users.
-- Run in the Supabase SQL editor as postgres (the deployed app does not run
-- migrations). Mirrors alembic/versions/0005_synced_chats.py exactly.

begin;

create table if not exists synced_chats (
  user_id           uuid not null references users(id) on delete cascade,
  chat_id           varchar(64) not null,
  title             varchar(200),
  payload           jsonb not null,
  client_updated_at bigint not null,
  synced_at         timestamptz not null default now(),
  primary key (user_id, chat_id)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on synced_chats to app_user;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on synced_chats from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on synced_chats from authenticated;
  end if;
end
$$;

alter table synced_chats enable row level security;
alter table synced_chats force row level security;
drop policy if exists synced_chats_owner on synced_chats;
create policy synced_chats_owner on synced_chats
  to app_user
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

update alembic_version
  set version_num = '0005_synced_chats'
  where version_num = '0004_login_attempts_retention';

commit;

-- Verify:
--   select version_num from alembic_version;                     -- 0005_synced_chats
--   select relrowsecurity, relforcerowsecurity
--     from pg_class where relname = 'synced_chats';              -- t, t
