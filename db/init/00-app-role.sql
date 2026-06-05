-- Runs once on first container init (empty data dir), as the postgres superuser
-- against the `branchchat` database.
--
-- Creates the least-privilege application role. The API MUST connect as this
-- role (not `postgres`) because Postgres superusers bypass row-level security —
-- connecting as a superuser would silently defeat every RLS policy.
--
-- For Supabase, create an equivalent role and connect the app pooler as it:
--   CREATE ROLE app_user LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
--   GRANT USAGE ON SCHEMA public TO app_user;
-- then run `alembic upgrade head` (which applies table grants + policies).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pw'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE branchchat TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Per-table privileges are granted by the Alembic migration once tables exist.
