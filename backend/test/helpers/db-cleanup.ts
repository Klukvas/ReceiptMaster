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

async function truncateTables(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query("SET session_replication_role = 'replica'");
  for (const table of TABLES_IN_ORDER) {
    await query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await query("SET session_replication_role = 'origin'");
}

export async function cleanDatabase(app: INestApplication): Promise<void> {
  const connection = adminConnectionFromEnv();
  if (!connection) {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    await truncateTables((sql) => dataSource.query(sql));
    return;
  }
  const admin = new Client(connection);
  await admin.connect();
  try {
    await truncateTables((sql) => admin.query(sql));
  } finally {
    await admin.end();
  }
}
