-- Idempotent. Re-run after every restore: S3 dumps use --no-privileges, so grants do not come back.
BEGIN;

DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  -- Explicit for the owner too: FK checks run as the table owner, so a database it does not own
  -- (a copy, a restore) would otherwise fail writes with a permission error.
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO rm_owner, rm_app, rm_backup', current_database());
END $$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO rm_owner;
GRANT USAGE ON SCHEMA public TO rm_app, rm_backup;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rm_app;

-- Rollback images with AUTO_RUN_MIGRATIONS=true read this history; they must never write it.
-- audit_logs stays append-only for the runtime role. The guard is for schemas built by entity
-- synchronization in tests; production always has both tables.
DO $$
BEGIN
  IF to_regclass('public.migrations') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON migrations FROM rm_app;
  END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON audit_logs FROM rm_app;
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE rm_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rm_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rm_app;

COMMIT;
