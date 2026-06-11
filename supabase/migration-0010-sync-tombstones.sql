-- Migration 0010: synced_chats.deleted_at — server-side delete tombstones.
-- Run in the Supabase SQL editor as postgres BEFORE deploying the backend
-- commit that soft-deletes synced chats. Mirrors
-- alembic/versions/0010_sync_tombstones.py.

begin;

alter table synced_chats
  add column if not exists deleted_at timestamptz null;

update alembic_version
  set version_num = '0010_sync_tombstones'
  where version_num = '0009_feedback';

commit;

-- Verify:  select version_num from alembic_version;  -- 0010_sync_tombstones
