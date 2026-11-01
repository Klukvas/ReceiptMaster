import { randomBytes } from "crypto";
import { Client, ClientConfig } from "pg";

/**
 * Gate for the PostgreSQL integration suites that create and drop their own
 * databases and roles. They only ever connect to a fixed loopback port with
 * explicitly supplied test credentials, refuse a cluster that holds the
 * application database, and require a sentinel database that marks the cluster
 * as disposable, so a stray opt-in cannot reach dev, production or another
 * project's cluster that happens to listen on the same port.
 */

const LOOPBACK_HOST = "127.0.0.1";

// The application database name used by the dev compose files and the
// production env examples (docker-compose*.yml, backend/env.example, env.prod.example).
const PROTECTED_DATABASES: readonly string[] = ["market_db"];

/** Created by hand (or by CI) only in a cluster that exists for these suites. */
export const ISOLATED_PG_SENTINEL = "receiptmaster_isolated_pg_sentinel";

const SAFE_ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

type Env = Readonly<Record<string, string | undefined>>;

export type IsolatedPostgresCluster = {
  readonly portVariable: string;
  readonly port: number;
};

export const AUDIT_CLUSTER: IsolatedPostgresCluster = {
  portVariable: "AUDIT_PG_PORT",
  port: 55439,
};

export const TEMPLATE_CLUSTER: IsolatedPostgresCluster = {
  portVariable: "TEMPLATE_PG_PORT",
  port: 55447,
};

export type IsolatedPostgresConnection = {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string | undefined;
};

export type IsolatedPostgresGate =
  | {
      readonly status: "enabled";
      readonly connection: IsolatedPostgresConnection;
    }
  | { readonly status: "skipped" }
  | { readonly status: "misconfigured"; readonly reason: string };

export function resolveIsolatedPostgres(
  cluster: IsolatedPostgresCluster,
  env: Env = process.env,
): IsolatedPostgresGate {
  const requestedPort = env[cluster.portVariable];
  if (!requestedPort) {
    if (env.REQUIRE_PG_SUITES !== "1") return { status: "skipped" };
    return {
      status: "misconfigured",
      reason:
        `REQUIRE_PG_SUITES=1 but ${cluster.portVariable} is not set. Start a disposable ` +
        `PostgreSQL cluster on ${LOOPBACK_HOST}:${cluster.port} and set ` +
        `${cluster.portVariable}=${cluster.port} plus ISOLATED_PG_USER.`,
    };
  }
  if (requestedPort !== String(cluster.port)) {
    return {
      status: "misconfigured",
      reason:
        `${cluster.portVariable} must be exactly ${cluster.port} (the isolated test port), ` +
        `got "${requestedPort}". These suites never connect to any other port.`,
    };
  }
  const user = env.ISOLATED_PG_USER || env.TEMPLATE_PG_USER;
  if (!user) {
    return {
      status: "misconfigured",
      reason:
        `${cluster.portVariable} is set but ISOLATED_PG_USER is not. Set the disposable ` +
        `cluster's admin user (and ISOLATED_PG_PASSWORD if it needs one).`,
    };
  }
  return {
    status: "enabled",
    connection: {
      host: LOOPBACK_HOST,
      port: cluster.port,
      user,
      password: env.ISOLATED_PG_PASSWORD || undefined,
    },
  };
}

/**
 * Registers the suite when the opt-in is complete, a single failing test when
 * it is incomplete or required, and a skipped suite otherwise.
 */
export function describeIsolatedPostgres(
  title: string,
  cluster: IsolatedPostgresCluster,
  suite: (connection: IsolatedPostgresConnection) => void,
): void {
  const gate = resolveIsolatedPostgres(cluster);
  if (gate.status === "enabled") {
    describe(title, () => suite(gate.connection));
    return;
  }
  if (gate.status === "misconfigured") {
    describe(title, () => {
      it("has a complete isolated PostgreSQL opt-in", () => {
        throw new Error(gate.reason);
      });
    });
    return;
  }
  // Hooks never run in a skipped suite, so the placeholder is never dialled.
  describe.skip(title, () =>
    suite({
      host: LOOPBACK_HOST,
      port: cluster.port,
      user: "",
      password: undefined,
    }),
  );
}

export function pgClientConfig(
  connection: IsolatedPostgresConnection,
  database: string,
): ClientConfig {
  return {
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database,
  };
}

export function typeormCredentials(connection: IsolatedPostgresConnection): {
  host: string;
  port: number;
  username: string;
  password: string | undefined;
} {
  return {
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
  };
}

/**
 * Connects to the cluster's maintenance database and refuses to continue unless
 * the cluster is marked disposable and holds no application database. Call it
 * before creating anything.
 */
export async function connectIsolatedAdmin(
  connection: IsolatedPostgresConnection,
): Promise<Client> {
  const client = new Client(pgClientConfig(connection, "postgres"));
  await client.connect();
  try {
    const { rows } = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname = ANY($1::text[])",
      [[...PROTECTED_DATABASES, ISOLATED_PG_SENTINEL]],
    );
    const names = rows.map((row) => row.datname);
    const target = `${connection.host}:${connection.port}`;
    const protectedFound = names.filter((name) =>
      PROTECTED_DATABASES.includes(name),
    );
    if (protectedFound.length > 0) {
      throw new Error(
        `Refusing to run against ${target}: the cluster contains application ` +
          `database(s) ${protectedFound.join(", ")}. Use a disposable PostgreSQL cluster.`,
      );
    }
    if (!names.includes(ISOLATED_PG_SENTINEL)) {
      throw new Error(
        `Refusing to run against ${target}: the cluster has no "${ISOLATED_PG_SENTINEL}" ` +
          `database, so it is not marked as a disposable test cluster. Only in a cluster ` +
          `started for these suites, run: CREATE DATABASE ${ISOLATED_PG_SENTINEL};`,
      );
    }
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

/**
 * Creates a login role that is neither superuser nor BYPASSRLS, so policies
 * apply to it. Returns its generated password (needed where the cluster
 * authenticates TCP connections, e.g. the official Docker image).
 */
export async function createRestrictedRole(
  admin: Client,
  role: string,
): Promise<string> {
  if (!SAFE_ROLE_NAME.test(role)) {
    throw new Error(`Refusing to create role with unsafe name "${role}"`);
  }
  // Hex only, so it is safe inside the literal; utility statements take no bind parameters.
  const password = randomBytes(24).toString("hex");
  await admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
  );
  return password;
}

type Destroyable = {
  readonly isInitialized: boolean;
  destroy(): Promise<void>;
};

function rethrowAll(failures: readonly unknown[], context: string): void {
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  const messages = failures.map((failure) =>
    failure instanceof Error ? failure.message : String(failure),
  );
  throw new Error(
    `${context} (${failures.length} failures): ${messages.join("; ")}`,
  );
}

/**
 * Destroys every initialized data source independently, so one rejected destroy
 * cannot leave the others connected; failures are rethrown together afterwards.
 */
export async function destroyDataSources(
  dataSources: ReadonlyArray<Destroyable | undefined>,
): Promise<void> {
  const settled = await Promise.allSettled(
    dataSources
      .filter((source): source is Destroyable => !!source?.isInitialized)
      .map((source) => source.destroy()),
  );
  rethrowAll(
    settled
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason),
    "Destroying data sources failed",
  );
}

/**
 * Tears down what a suite created on the isolated cluster. Every step runs even
 * when an earlier one fails: data sources are settled independently, each
 * database is force-dropped (terminating any connection a failed destroy left
 * behind; PostgreSQL 13+), each role is dropped, and the maintenance client is
 * always closed. All failures are rethrown at the end so they stay visible.
 */
export async function teardownIsolatedPostgres({
  dataSources = [],
  admin,
  databases = [],
  roles = [],
}: {
  readonly dataSources?: ReadonlyArray<Destroyable | undefined>;
  readonly admin: Client | undefined;
  readonly databases?: readonly string[];
  readonly roles?: readonly string[];
}): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (step: () => Promise<unknown>) => {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  };
  await attempt(() => destroyDataSources(dataSources));
  if (admin) {
    try {
      // Only what the suite created; the cluster itself is left running.
      for (const database of databases)
        await attempt(() =>
          admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
        );
      for (const role of roles)
        await attempt(() => admin.query(`DROP ROLE IF EXISTS "${role}"`));
    } finally {
      await attempt(() => admin.end());
    }
  }
  rethrowAll(failures, "Isolated PostgreSQL teardown failed");
}
