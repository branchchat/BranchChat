-- Migration 0009: feedback — beta feedback routed to our backend.
-- Run in the Supabase SQL editor as postgres BEFORE deploying the backend
-- commit that adds /api/feedback. Mirrors alembic/versions/0009_feedback.py.

begin;

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  email       varchar(320),
  category    varchar(16) not null,
  message     text not null,
  path        varchar(200),
  chat_title  varchar(200),
  created_at  timestamptz not null default now()
);
create index if not exists ix_feedback_created_at on feedback (created_at);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert on feedback to app_user;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on feedback from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on feedback from authenticated;
  end if;
end
$$;

alter table feedback enable row level security;
drop policy if exists feedback_service on feedback;
create policy feedback_service on feedback
  to app_user using (true) with check (true);

update alembic_version
  set version_num = '0009_feedback'
  where version_num = '0008_waitlist_unsubscribe';

commit;

-- Verify:  select version_num from alembic_version;  -- 0009_feedback
