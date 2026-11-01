import { INestApplication } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
import { Client, ClientConfig } from "pg";
import { DataSource } from "typeorm";

const TABLES_IN_ORDER = [
  "receipts",
  "order_items",
  "orders",
  "refresh_tokens",
  "idempotency_keys",
  "audit_logs",
  "user_settings",
  "user_subscriptions",
  "products",
  "recipients",
  "suppliers",
  "users",
];

/** Set when the application connects as the restricted role, which cannot truncate. */
export function adminConnectionFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ClientConfig | undefined {
  if (!env.E2E_ADMIN_DB_USERNAME) return undefined;
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.E2E_ADMIN_DB_USERNAME,
    password: env.E2E_ADMIN_DB_PASSWORD,
    database: env.DB_NAME,
  };
}

type AdminQuery = (
  sql: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;

async function truncateTables(query: AdminQuery): Promise<void> {
  await query("SET session_replication_role = 'replica'");
  for (const table of TABLES_IN_ORDER) {
    await query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await query("SET session_replication_role = 'origin'");
}

/** Test setup and checks that RLS hides from the application role outside a request. */
export async function withAdminQuery<T>(
  app: INestApplication,
  run: (query: AdminQuery) => Promise<T>,
): Promise<T> {
  const connection = adminConnectionFromEnv();
  if (!connection) {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    return run((sql, params) => dataSource.query(sql, params));
  }
  const admin = new Client(connection);
  await admin.connect();
  try {
    return await run(
      async (sql, params) => (await admin.query(sql, params)).rows,
    );
  } finally {
    await admin.end();
  }
}

export async function cleanDatabase(app: INestApplication): Promise<void> {
  await withAdminQuery(app, truncateTables);
}
