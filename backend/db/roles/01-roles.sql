-- Run as the bootstrap superuser. Idempotent, and re-asserts flags if a role drifted.
-- Roles start without a password, so they cannot log in until an operator runs
-- \password <role> in an interactive psql (see README.md).
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['rm_owner', 'rm_app', 'rm_backup'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I', role_name);
    END IF;
  END LOOP;
END $$;

ALTER ROLE rm_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE rm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40;
ALTER ROLE rm_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 3;

GRANT pg_read_all_data TO rm_backup;
