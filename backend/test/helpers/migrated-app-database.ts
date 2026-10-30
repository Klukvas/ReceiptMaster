import { join } from "path";
import { DataSource } from "typeorm";
import { installTenantContext } from "../../src/common/tenancy/tenant-data-source";
import {
  IsolatedPostgresConnection,
  connectIsolatedAdmin,
  createRestrictedRole,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./isolated-postgres";
import type { RestrictedAppDatabase } from "./restricted-app-database";

/**
 * Like `openRestrictedAppDatabase`, but the schema comes from the real migration
 * chain (functions, triggers, FORCE RLS policies and operational tables such as
 * the storage sweep queue) instead of entity synchronization. Use it when the
 * code under test needs production-shaped tables — receipt numbering, storage
 * leases, outbox — or when the migrations themselves are part of the claim.
 */

const ENTITIES = [join(__dirname, "../../src/**/*.entity.ts")];
const MIGRATIONS = [join(__dirname, "../../src/config/migrations/*.ts")];
const STATEMENT_TIMEOUT = "-c statement_timeout=10000";
const LOCK_WAIT_DEADLINE_MS = 5000;
const LOCK_WAIT_POLL_MS = 10;

export async function openMigratedAppDatabase(
  connection: IsolatedPostgresConnection,
  prefix: string,
): Promise<RestrictedAppDatabase> {
  const suffix = `${process.pid}_${Date.now()}`;
  const database = `${prefix}_${suffix}`;
  const role = `${prefix}_app_${suffix}`;
  const root = await connectIsolatedAdmin(connection);
  let admin: DataSource | undefined;
  let app: DataSource | undefined;

  const close = (): Promise<void> =>
    teardownIsolatedPostgres({
      dataSources: [app, admin],
      admin: root,
      databases: [database],
      roles: [role],
    });

  try {
    await root.query(`CREATE DATABASE "${database}"`);
    const rolePassword = await createRestrictedRole(root, role);
    admin = await new DataSource({
      type: "postgres",
      ...typeormCredentials(connection),
      database,
      entities: ENTITIES,
      migrations: MIGRATIONS,
      synchronize: false,
      extra: { options: STATEMENT_TIMEOUT },
    }).initialize();
    await admin.runMigrations({ transaction: "all" });
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
    );
    await admin.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`,
    );
    app = installTenantContext(
      await new DataSource({
        type: "postgres",
        host: connection.host,
        port: connection.port,
        username: role,
        password: rolePassword,
        database,
        entities: ENTITIES,
        extra: { max: 4, options: STATEMENT_TIMEOUT },
      }).initialize(),
    );
  } catch (error) {
    // Keep the setup failure primary; a cleanup failure is reported alongside it.
    const cleanup = await close().then(
      () => undefined,
      (cleanupError: unknown) => cleanupError,
    );
    if (cleanup === undefined) throw error;
    const reason = (value: unknown) =>
      value instanceof Error ? value.message : String(value);
    throw new Error(
      `Setup failed: ${reason(error)}; cleanup also failed: ${reason(cleanup)}`,
    );
  }

  const waitForLockWaiters = async (count: number): Promise<number> => {
    const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS;
    let waiting = 0;
    while (Date.now() < deadline) {
      const { rows } = await root.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'",
        [database],
      );
      waiting = rows[0].n;
      if (waiting >= count) return waiting;
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
    }
    return waiting;
  };

  return { database, admin, app, waitForLockWaiters, close };
}
