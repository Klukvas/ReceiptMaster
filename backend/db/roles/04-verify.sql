-- Read-only. Raises with every problem it finds; a clean run ends with a NOTICE.
DO $$
DECLARE
  problems text[] := ARRAY[]::text[];
  found text;
BEGIN
  SELECT string_agg(rolname, ', ') INTO found FROM pg_roles
   WHERE rolname IN ('rm_owner', 'rm_app')
     AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication);
  IF found IS NOT NULL THEN problems := problems || format('elevated role: %s', found); END IF;

  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('rm_owner', 'rm_app', 'rm_backup')) <> 3 THEN
    problems := problems || 'missing role';
  END IF;

  SELECT string_agg(rolname, ', ') INTO found FROM pg_roles
   WHERE rolname IN ('rm_owner', 'rm_app', 'rm_backup') AND NOT rolcanlogin;
  IF found IS NOT NULL THEN problems := problems || format('cannot log in: %s', found); END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rm_backup' AND rolbypassrls AND NOT rolsuper) THEN
    problems := problems || 'rm_backup needs BYPASSRLS and no SUPERUSER';
  END IF;

  IF NOT pg_has_role('rm_backup', 'pg_read_all_data', 'MEMBER') THEN
    problems := problems || 'rm_backup lacks pg_read_all_data';
  END IF;

  IF pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database())) <> 'rm_owner' THEN
    problems := problems || 'database not owned by rm_owner';
  END IF;

  SELECT string_agg(c.relname, ', ') INTO found FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
     AND pg_get_userbyid(c.relowner) <> 'rm_owner'
     AND NOT EXISTS (SELECT FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e');
  IF found IS NOT NULL THEN problems := problems || format('not owned by rm_owner: %s', found); END IF;

  SELECT string_agg(t.typname, ', ') INTO found FROM pg_type t
   WHERE t.typnamespace = 'public'::regnamespace
     AND t.typtype IN ('e', 'd')
     AND pg_get_userbyid(t.typowner) <> 'rm_owner'
     AND NOT EXISTS (SELECT FROM pg_depend d
                      WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e');
  IF found IS NOT NULL THEN problems := problems || format('type not owned by rm_owner: %s', found); END IF;

  SELECT string_agg(p.proname, ', ') INTO found FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND pg_get_userbyid(p.proowner) <> 'rm_owner'
     AND NOT EXISTS (SELECT FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');
  IF found IS NOT NULL THEN problems := problems || format('routine not owned by rm_owner: %s', found); END IF;

  SELECT string_agg(c.relname, ', ') INTO found FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
     AND NOT has_table_privilege('rm_app', c.oid, 'SELECT');
  IF found IS NOT NULL THEN problems := problems || format('rm_app cannot read: %s', found); END IF;

  SELECT string_agg(c.relname, ', ') INTO found FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
     AND c.relname <> 'migrations'
     AND NOT has_table_privilege('rm_app', c.oid, 'INSERT');
  IF found IS NOT NULL THEN problems := problems || format('rm_app cannot insert: %s', found); END IF;

  SELECT string_agg(c.relname, ', ') INTO found FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
     AND c.relname NOT IN ('migrations', 'audit_logs')
     AND NOT (has_table_privilege('rm_app', c.oid, 'UPDATE') AND has_table_privilege('rm_app', c.oid, 'DELETE'));
  IF found IS NOT NULL THEN problems := problems || format('rm_app cannot update and delete: %s', found); END IF;

  SELECT string_agg(c.relname, ', ') INTO found FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('rm_app', c.oid, 'USAGE') ELSE false END;
  IF found IS NOT NULL THEN problems := problems || format('rm_app cannot use sequences: %s', found); END IF;

  IF has_table_privilege('rm_app', 'migrations', 'INSERT, UPDATE, DELETE') THEN
    problems := problems || 'rm_app can write migrations';
  END IF;
  IF has_table_privilege('rm_app', 'audit_logs', 'UPDATE, DELETE') THEN
    problems := problems || 'rm_app can rewrite audit_logs';
  END IF;
  IF has_schema_privilege('rm_app', 'public', 'CREATE') THEN
    problems := problems || 'rm_app can create in public';
  END IF;
  IF has_database_privilege('rm_app', current_database(), 'CREATE, TEMP') THEN
    problems := problems || 'rm_app can create in the database';
  END IF;

  SELECT string_agg(t.name, ', ') INTO found
    FROM unnest(ARRAY['orders', 'order_items', 'products', 'recipients', 'receipts',
                      'document_assets', 'document_presets', 'document_artifacts']) AS t(name)
   WHERE NOT EXISTS (SELECT FROM pg_class c
                      WHERE c.relnamespace = 'public'::regnamespace
                        AND c.relname = t.name AND c.relrowsecurity);
  IF found IS NOT NULL THEN problems := problems || format('RLS disabled: %s', found); END IF;

  SELECT string_agg(t.name, ', ') INTO found
    FROM unnest(ARRAY['document_assets', 'document_presets', 'document_artifacts']) AS t(name)
   WHERE NOT EXISTS (SELECT FROM pg_class c
                      WHERE c.relnamespace = 'public'::regnamespace
                        AND c.relname = t.name AND c.relforcerowsecurity);
  IF found IS NOT NULL THEN problems := problems || format('FORCE RLS disabled: %s', found); END IF;

  IF (SELECT count(DISTINCT defaclobjtype) FROM pg_default_acl
       WHERE defaclrole = 'rm_owner'::regrole
         AND defaclnamespace = 'public'::regnamespace
         AND defaclobjtype IN ('r', 'S')) <> 2 THEN
    problems := problems || 'default privileges for rm_owner are missing';
  END IF;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Role verification failed: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'Role verification passed';
END $$;
