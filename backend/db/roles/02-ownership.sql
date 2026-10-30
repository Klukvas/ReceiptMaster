-- Run as the bootstrap superuser. One transaction, idempotent, and invisible to a
-- superuser-connected app. REASSIGN OWNED BY postgres is not an option: PostgreSQL refuses it
-- for the bootstrap role, so objects move one by one. Extension members stay with their extension.
BEGIN;
SET LOCAL lock_timeout = '15s';

DO $$
DECLARE
  target text;
BEGIN
  EXECUTE format('ALTER DATABASE %I OWNER TO rm_owner', current_database());

  -- ALTER TABLE also moves the table's indexes and column-owned sequences.
  FOR target IN
    SELECT format(
             'ALTER %s %s OWNER TO rm_owner',
             CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
             c.oid::regclass)
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p', 'v', 'm')
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE target;
  END LOOP;

  FOR target IN
    SELECT format('ALTER SEQUENCE %s OWNER TO rm_owner', c.oid::regclass)
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind = 'S'
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i', 'e'))
  LOOP
    EXECUTE target;
  END LOOP;

  FOR target IN
    SELECT format('ALTER TYPE %s OWNER TO rm_owner', t.oid::regtype)
      FROM pg_type t
     WHERE t.typnamespace = 'public'::regnamespace
       AND t.typtype IN ('e', 'd')
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE target;
  END LOOP;

  FOR target IN
    SELECT format('ALTER ROUTINE %s OWNER TO rm_owner', p.oid::regprocedure)
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE target;
  END LOOP;
END $$;

COMMIT;
