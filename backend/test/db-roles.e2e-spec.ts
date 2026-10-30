import { randomBytes, randomUUID } from "crypto";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import {
  AUDIT_CLUSTER,
  IsolatedPostgresConnection,
  connectIsolatedAdmin,
  describeIsolatedPostgres,
  pgClientConfig,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";
import { DatabaseRoleNames, RoleScript, roleScript } from "./helpers/db-roles";

const MIGRATIONS = [join(__dirname, "../src/config/migrations/*.ts")];
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];
const RLS_ERROR = /row-level security/;

describeIsolatedPostgres(
  "production database roles",
  AUDIT_CLUSTER,
  (connection: IsolatedPostgresConnection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const names: DatabaseRoleNames = {
      owner: `rmroles_owner_${suffix}`,
      app: `rmroles_app_${suffix}`,
      backup: `rmroles_backup_${suffix}`,
    };
    const databases = {
      primary: `rmroles_primary_${suffix}`,
      restored: `rmroles_restored_${suffix}`,
      chain: `rmroles_chain_${suffix}`,
    };
    const passwords = {
      owner: randomBytes(16).toString("hex"),
      app: randomBytes(16).toString("hex"),
      backup: randomBytes(16).toString("hex"),
    };
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    let root: Client;
    let dba: Client;

    const run = (client: Client, script: RoleScript) =>
      client.query(roleScript(script, names));

    const connectAs = async (
      role: keyof DatabaseRoleNames,
      database: string,
    ): Promise<Client> => {
      const client = new Client({
        ...pgClientConfig(connection, database),
        user: names[role],
        password: passwords[role],
      });
      await client.connect();
      return client;
    };

    const asRole = async <T>(
      role: keyof DatabaseRoleNames,
      database: string,
      work: (client: Client) => Promise<T>,
    ): Promise<T> => {
      const client = await connectAs(role, database);
      try {
        return await work(client);
      } finally {
        await client.end();
      }
    };

    const superuserClient = async (database: string): Promise<Client> => {
      const client = new Client(pgClientConfig(connection, database));
      await client.connect();
      return client;
    };

    const dump = (role: keyof DatabaseRoleNames) =>
      spawnSync(
        "pg_dump",
        [
          "-h",
          connection.host,
          "-p",
          String(connection.port),
          "-U",
          names[role],
          "-d",
          databases.primary,
          "--no-owner",
          "--no-privileges",
        ],
        {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          env: { ...process.env, PGPASSWORD: passwords[role] },
        },
      );

    const publicObjectOwners = async (): Promise<string[]> => {
      const { rows } = await dba.query(
        `SELECT pg_get_userbyid(relowner) AS owner FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'S')
         UNION
         SELECT pg_get_userbyid(typowner) FROM pg_type
          WHERE typnamespace = 'public'::regnamespace AND typtype = 'e'
         UNION
         SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
          WHERE p.pronamespace = 'public'::regnamespace
            AND NOT EXISTS (SELECT FROM pg_depend d
                             WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`,
      );
      return rows.map((row: { owner: string }) => row.owner);
    };

    const seedTenant = async (client: Client, tenant: string) => {
      await client.query(
        "INSERT INTO users(id, email, password) VALUES ($1, $2, 'not-a-hash')",
        [tenant, `${tenant}@example.test`],
      );
      const recipient = randomUUID();
      await client.query(
        "INSERT INTO recipients(id, user_id, name) VALUES ($1, $2, 'Fixture')",
        [recipient, tenant],
      );
      await client.query(
        `INSERT INTO orders(id, user_id, recipient_id, status, subtotal_cents, total_cents, currency, created_by)
         VALUES ($1, $2, $3, 'draft', 0, 0, 'UAH', 'fixture')`,
        [randomUUID(), tenant, recipient],
      );
      await client.query(
        `INSERT INTO document_assets(user_id, object_key, sha256, bytes, width, height, lease_expires_at)
         VALUES ($1, $2, repeat('a', 64), 1, 1, 1, now())`,
        [tenant, `logos/${tenant}`],
      );
    };

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${databases.primary}"`);
      // Migrated by the superuser first: production's actual history.
      const migrator = await new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database: databases.primary,
        entities: ENTITIES,
        migrations: MIGRATIONS,
        synchronize: false,
      }).initialize();
      try {
        await migrator.runMigrations({ transaction: "all" });
      } finally {
        await migrator.destroy();
      }
      dba = await superuserClient(databases.primary);
      await seedTenant(dba, tenantA);
      await seedTenant(dba, tenantB);
      await run(root, "01-roles.sql");
      for (const role of ["owner", "app", "backup"] as const) {
        await root.query(
          `ALTER ROLE "${names[role]}" PASSWORD '${passwords[role]}'`,
        );
      }
    }, 120000);

    afterAll(async () => {
      await dba?.end();
      await teardownIsolatedPostgres({
        admin: root,
        databases: Object.values(databases),
        roles: Object.values(names),
      });
    });

    it("applies idempotently, moves every object and passes verification", async () => {
      for (let pass = 0; pass < 2; pass += 1) {
        await run(root, "01-roles.sql");
        await run(dba, "02-ownership.sql");
        await run(dba, "03-grants.sql");
      }
      await expect(run(dba, "04-verify.sql")).resolves.toBeDefined();
      expect(await publicObjectOwners()).toEqual([names.owner]);
    });

    it.each([
      {
        drift: `GRANT CREATE ON SCHEMA public TO "${names.app}"`,
        repair: `REVOKE CREATE ON SCHEMA public FROM "${names.app}"`,
        reported: /can create in public/,
      },
      {
        drift: `GRANT DELETE ON audit_logs TO "${names.app}"`,
        repair: `REVOKE DELETE ON audit_logs FROM "${names.app}"`,
        reported: /can rewrite audit_logs/,
      },
      {
        drift: `REVOKE SELECT ON orders FROM "${names.app}"`,
        repair: `GRANT SELECT ON orders TO "${names.app}"`,
        reported: /cannot read/,
      },
      {
        drift: `REVOKE USAGE ON SEQUENCE receipt_number_seq FROM "${names.app}"`,
        repair: `GRANT USAGE ON SEQUENCE receipt_number_seq TO "${names.app}"`,
        reported: /cannot use sequences/,
      },
      {
        drift: `ALTER TYPE orders_status_enum OWNER TO "${connection.user}"`,
        repair: `ALTER TYPE orders_status_enum OWNER TO "${names.owner}"`,
        reported: /type not owned/,
      },
      {
        drift: `ALTER FUNCTION generate_receipt_number() OWNER TO "${connection.user}"`,
        repair: `ALTER FUNCTION generate_receipt_number() OWNER TO "${names.owner}"`,
        reported: /routine not owned/,
      },
      {
        drift: `REVOKE pg_read_all_data FROM "${names.backup}"`,
        repair: `GRANT pg_read_all_data TO "${names.backup}"`,
        reported: /lacks pg_read_all_data/,
      },
      {
        drift: `ALTER ROLE "${names.backup}" NOLOGIN`,
        repair: `ALTER ROLE "${names.backup}" LOGIN`,
        reported: /cannot log in/,
      },
    ])("reports drift: $drift", async ({ drift, repair, reported }) => {
      await dba.query(drift);
      try {
        await expect(run(dba, "04-verify.sql")).rejects.toThrow(reported);
      } finally {
        await dba.query(repair);
      }
      await expect(run(dba, "04-verify.sql")).resolves.toBeDefined();
    });

    // The gate's SQL only meets fakes in deploy-production.test.py; this runs the shipped text.
    it("runs the release gate's own privilege and role queries", async () => {
      const gate = readFileSync(
        join(__dirname, "../../scripts/deploy-production.sh"),
        "utf8",
      );
      const privileges = /"(SELECT count\(\*\)::int AS missing [^"]+)"/.exec(
        gate,
      );
      const appRole = /APP_ROLE_SQL = "([^"]+)"/.exec(gate);
      const unowned = /"(SELECT \(\(SELECT count[^"]+ AS unowned)"/.exec(gate);
      expect(privileges).not.toBeNull();
      expect(appRole).not.toBeNull();
      expect(unowned).not.toBeNull();

      const missing = async () =>
        (await dba.query(privileges[1], [names.app])).rows[0].missing;
      expect(await missing()).toBe(0);

      await dba.query(`REVOKE UPDATE ON orders FROM "${names.app}"`);
      expect(await missing()).toBe(1);
      await dba.query(`GRANT UPDATE ON orders TO "${names.app}"`);

      await dba.query(
        `REVOKE USAGE ON SEQUENCE receipt_number_seq FROM "${names.app}"`,
      );
      expect(await missing()).toBe(1);
      await dba.query(
        `GRANT USAGE ON SEQUENCE receipt_number_seq TO "${names.app}"`,
      );
      expect(await missing()).toBe(0);

      const unownedAs = async (role: keyof DatabaseRoleNames) =>
        (
          await asRole(role, databases.primary, (client) =>
            client.query(unowned[1]),
          )
        ).rows[0].unowned;
      expect(await unownedAs("owner")).toBe(0);
      expect(await unownedAs("app")).toBeGreaterThan(0);

      // A type or routine left behind must block too, not only tables.
      await dba.query(
        `ALTER TYPE orders_status_enum OWNER TO "${connection.user}"`,
      );
      expect(await unownedAs("owner")).toBe(1);
      await dba.query(
        `ALTER TYPE orders_status_enum OWNER TO "${names.owner}"`,
      );
      await dba.query(
        `ALTER FUNCTION generate_receipt_number() OWNER TO "${connection.user}"`,
      );
      expect(await unownedAs("owner")).toBe(1);
      await dba.query(
        `ALTER FUNCTION generate_receipt_number() OWNER TO "${names.owner}"`,
      );

      const identity = await asRole("app", databases.primary, (client) =>
        client.query(appRole[1]),
      );
      expect(identity.rows).toEqual([
        {
          rolname: names.app,
          rolsuper: false,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
          owned: 0,
        },
      ]);
      const owner = await asRole("owner", databases.primary, (client) =>
        client.query(appRole[1]),
      );
      expect(owner.rows[0].owned).toBeGreaterThan(0);
      await dba.query(
        `ALTER FUNCTION generate_receipt_number() OWNER TO "${names.app}"`,
      );
      const drifted = await asRole("app", databases.primary, (client) =>
        client.query(appRole[1]),
      );
      await dba.query(
        `ALTER FUNCTION generate_receipt_number() OWNER TO "${names.owner}"`,
      );
      expect(drifted.rows[0].owned).toBe(1);

      await dba.query(`ALTER TYPE orders_status_enum OWNER TO "${names.app}"`);
      const driftedType = await asRole("app", databases.primary, (client) =>
        client.query(appRole[1]),
      );
      await dba.query(
        `ALTER TYPE orders_status_enum OWNER TO "${names.owner}"`,
      );
      expect(driftedType.rows[0].owned).toBe(1);
    });

    it("denies the runtime role every escalation", async () => {
      const denied = [
        `SET ROLE "${connection.user}"`,
        "COPY (SELECT 1) TO PROGRAM 'id'",
        "SELECT pg_read_file('/etc/passwd')",
        "ALTER TABLE orders DISABLE ROW LEVEL SECURITY",
        "TRUNCATE orders",
        "CREATE TABLE escalation(id int)",
        "CREATE TEMP TABLE escalation(id int)",
        "INSERT INTO migrations(timestamp, name) VALUES (1, 'escalation')",
        "DELETE FROM audit_logs",
        "UPDATE audit_logs SET action = 'escalation'",
      ];
      await asRole("app", databases.primary, async (client) => {
        for (const statement of denied) {
          await expect(client.query(statement)).rejects.toThrow();
        }
        await client.query("SET row_security = off");
        await expect(client.query("SELECT * FROM orders")).rejects.toThrow(
          RLS_ERROR,
        );
      });
    });

    it("scopes the runtime role to the tenant in context", async () => {
      await asRole("app", databases.primary, async (client) => {
        const bare = await client.query("SELECT id FROM orders");
        expect(bare.rowCount).toBe(0);

        await client.query("BEGIN");
        await client.query(
          "SELECT set_config('app.current_user_id', $1, true)",
          [tenantA],
        );
        const scoped = await client.query("SELECT user_id FROM orders");
        expect(scoped.rows).toEqual([{ user_id: tenantA }]);
        await expect(
          client.query(
            "INSERT INTO recipients(id, user_id, name) VALUES ($1, $2, 'Cross tenant')",
            [randomUUID(), tenantB],
          ),
        ).rejects.toThrow(RLS_ERROR);
        await client.query("ROLLBACK");
      });
    });

    it("keeps the runtime role append-only on audit_logs and read-only on migrations", async () => {
      await asRole("app", databases.primary, async (client) => {
        await client.query(
          "INSERT INTO audit_logs(user_id, action, entity_type) VALUES ($1, 'fixture', 'fixture')",
          [tenantA],
        );
        const history = await client.query(
          "SELECT count(*)::int AS n FROM migrations",
        );
        expect(history.rows[0].n).toBeGreaterThan(0);
      });
    });

    it("lets only the backup role dump a database with RLS", () => {
      for (const role of ["app", "owner"] as const) {
        const result = dump(role);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(RLS_ERROR);
      }
      const backup = dump("backup");
      expect(backup.stderr).toBe("");
      expect(backup.status).toBe(0);
      expect(backup.stdout).toContain("CREATE POLICY tenant_isolation_orders");
      expect(backup.stdout).toContain(tenantA);
    });

    it("restores a backup as the owner and needs only the grants script afterwards", async () => {
      await root.query(
        `CREATE DATABASE "${databases.restored}" OWNER "${names.owner}"`,
      );
      // No ON_ERROR_STOP: a newer local pg_dump may emit settings an older server rejects,
      // so the restored state below is the assertion.
      const restore = spawnSync(
        "psql",
        [
          "-X",
          "-q",
          "-h",
          connection.host,
          "-p",
          String(connection.port),
          "-U",
          names.owner,
          "-d",
          databases.restored,
        ],
        {
          input: dump("backup").stdout,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          env: { ...process.env, PGPASSWORD: passwords.owner },
        },
      );
      expect(restore.status).toBe(0);

      // The owner may reapply them, so a restore does not need the superuser.
      await asRole("owner", databases.restored, (client) =>
        run(client, "03-grants.sql"),
      );
      const restored = await superuserClient(databases.restored);
      try {
        await expect(run(restored, "04-verify.sql")).resolves.toBeDefined();
        const { rows } = await restored.query(
          `SELECT (SELECT count(*)::int FROM orders) AS orders,
                  (SELECT count(*)::int FROM document_assets) AS assets,
                  (SELECT count(*)::int FROM pg_policy) AS policies`,
        );
        const original = await dba.query(
          "SELECT count(*)::int AS policies FROM pg_policy",
        );
        expect(rows).toEqual([
          { orders: 2, assets: 2, policies: original.rows[0].policies },
        ]);
      } finally {
        await restored.end();
      }
    }, 60000);

    it("runs the whole migration chain as the ordinary owner", async () => {
      await root.query(
        `CREATE DATABASE "${databases.chain}" OWNER "${names.owner}"`,
      );
      const owner = await new DataSource({
        type: "postgres",
        host: connection.host,
        port: connection.port,
        username: names.owner,
        password: passwords.owner,
        database: databases.chain,
        entities: ENTITIES,
        migrations: MIGRATIONS,
        synchronize: false,
      }).initialize();
      try {
        const applied = await owner.runMigrations({ transaction: "all" });
        expect(applied.length).toBeGreaterThan(0);

        const chain = await superuserClient(databases.chain);
        try {
          await run(chain, "03-grants.sql");
          await expect(run(chain, "04-verify.sql")).resolves.toBeDefined();
        } finally {
          await chain.end();
        }

        // Default privileges must reach tables a later migration creates.
        await owner.query(
          "CREATE TABLE later_migration(id serial PRIMARY KEY)",
        );
        const [grant] = await owner.query(
          `SELECT has_table_privilege($1, 'later_migration', 'INSERT') AS can_insert,
                  has_sequence_privilege($1, 'later_migration_id_seq', 'USAGE') AS can_use_sequence`,
          [names.app],
        );
        expect(grant).toEqual({ can_insert: true, can_use_sequence: true });
      } finally {
        await owner.destroy();
      }
    }, 120000);

    it("hides FORCE tables from the owner, so backfills silently touch nothing", async () => {
      await asRole("owner", databases.primary, async (client) => {
        const update = await client.query(
          "UPDATE document_assets SET bytes = 2",
        );
        expect(update.rowCount).toBe(0);
      });
      const { rows } = await dba.query(
        "SELECT DISTINCT bytes FROM document_assets",
      );
      expect(rows).toEqual([{ bytes: 1 }]);
    });

    it("reverses the ownership transfer", async () => {
      await dba.query(
        roleScript("02-ownership.sql", { ...names, owner: connection.user }),
      );
      expect(await publicObjectOwners()).toEqual([connection.user]);
    });
  },
);
