import { INestApplication } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
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

export async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());

  await dataSource.query("SET session_replication_role = 'replica'");
  for (const table of TABLES_IN_ORDER) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await dataSource.query("SET session_replication_role = 'origin'");
}
