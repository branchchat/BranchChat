-- Migration 0006: users.is_beta_tester — account-gated private beta.
-- Run in the Supabase SQL editor as postgres BEFORE deploying backend commit
-- with the beta gate. Mirrors alembic/versions/0006_beta_tester_flag.py.

begin;

alter table users
  add column if not exists is_beta_tester boolean not null default false;

update alembic_version
  set version_num = '0006_beta_tester_flag'
  where version_num = '0005_synced_chats';

commit;

-- Verify:  select version_num from alembic_version;  -- 0006_beta_tester_flag

-- Approve the founders right away (or use the admin API once deployed):
--   update users set is_beta_tester = true where email in
--     ('your-email@example.com', 'jayden-email@example.com');
