-- Migration 0008: waitlist.unsubscribed_at — marketing-email opt-out.
-- Run in the Supabase SQL editor as postgres BEFORE deploying the backend
-- commit that adds the launch-broadcast endpoint. Mirrors
-- alembic/versions/0008_waitlist_unsubscribe.py.

begin;

alter table waitlist
  add column if not exists unsubscribed_at timestamptz null;

update alembic_version
  set version_num = '0008_waitlist_unsubscribe'
  where version_num = '0007_sync_title_text';

commit;

-- Verify:  select version_num from alembic_version;  -- 0008_waitlist_unsubscribe
