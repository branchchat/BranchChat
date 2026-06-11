-- 0007_sync_title_text: widen synced_chats.title for sealed (encrypted) titles.
-- Sealed titles are "enc1:<b64 nonce>:<b64 ciphertext>" and can exceed the old
-- varchar(200) cap. Run in the Supabase SQL editor, then stamp alembic:
--   INSERT note: alembic_version is managed by the deploy app's history only
--   if you run alembic; for SQL-editor application, update it manually:

ALTER TABLE synced_chats ALTER COLUMN title TYPE text;

UPDATE alembic_version SET version_num = '0007_sync_title_text';
