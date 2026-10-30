import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
import { Client } from "pg";
import * as request from "supertest";
import { DataSource } from "typeorm";
import { runWithTenant } from "../../src/common/tenancy/tenant-context";
import { IdempotencyCleanupService } from "../../src/modules/orders/idempotency-cleanup.service";
import { PaddleService } from "../../src/modules/paddle/paddle.service";
import { ReceiptOutboxService } from "../../src/modules/receipts/receipt-outbox.service";
import { DocumentStorageMaintenanceService } from "../../src/modules/receipts/services/document-storage-maintenance.service";
import { TelegramService } from "../../src/modules/telegram/telegram.service";
import { adminConnectionFromEnv, cleanDatabase } from "../helpers/db-cleanup";
import {
  authHeader,
  closeTestApp,
  createTestApp,
  registerUser,
} from "../helpers/test-app";

type Tenant = { id: string; token: string };
type TenantOrder = {
  orderId: string;
  productId: string;
  recipientId: string;
};

// CI sets this on the pass that connects as rm_app; run as a superuser this suite proves nothing.
const describeRestricted =
  process.env.E2E_RESTRICTED_ROLE === "1" ? describe : describe.skip;

describeRestricted("API under the restricted application role (e2e)", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let dataSource: DataSource;
  let admin: Client;

  const tenant = async (email: string): Promise<Tenant> => {
    const auth = await registerUser(server, email, "password123");
    return { id: auth.user.id, token: auth.access_token };
  };

  const createOrder = async (owner: Tenant): Promise<TenantOrder> => {
    const auth = authHeader(owner.token);
    const product = await request(server)
      .post("/api/v1/products")
      .set(auth)
      .send({
        name: "Restricted product",
        purchase_price_cents: 5000,
        sale_price_cents: 9900,
        quantity: 100,
        currency: "UAH",
      })
      .expect(201);
    const recipient = await request(server)
      .post("/api/v1/recipients")
      .set(auth)
      .send({ name: "Restricted recipient" })
      .expect(201);
    const order = await request(server)
      .post("/api/v1/orders")
      .set(auth)
      .send({
        recipientId: recipient.body.id,
        items: [{ productId: product.body.id, qty: 2 }],
      })
      .expect(201);
    return {
      orderId: order.body.id,
      productId: product.body.id,
      recipientId: recipient.body.id,
    };
  };

  const insertReceipt = async (
    owner: Tenant,
    orderId: string,
    status: "generated" | "processing",
    generationId?: string,
  ): Promise<string> => {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO receipts(id, user_id, order_id, number, status, generation_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, owner.id, orderId, `R-${id}`, status, generationId ?? null],
    );
    return id;
  };

  beforeAll(async () => {
    const connection = adminConnectionFromEnv();
    if (!connection?.password) {
      throw new Error(
        "E2E_RESTRICTED_ROLE=1 needs E2E_ADMIN_DB_USERNAME and E2E_ADMIN_DB_PASSWORD: a role that can truncate tables.",
      );
    }
    const context = await createTestApp();
    app = context.app;
    server = context.server;
    dataSource = app.get<DataSource>(getDataSourceToken());
    admin = new Client(connection);
    await admin.connect();
  });

  afterAll(async () => {
    await admin?.end();
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  it("connects as a role that cannot bypass RLS and owns nothing", async () => {
    const [role] = await dataSource.query(
      `SELECT r.rolsuper, r.rolbypassrls,
              (SELECT count(*)::int FROM pg_class c
                WHERE c.relowner = r.oid AND c.relnamespace = 'public'::regnamespace) AS owned
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, owned: 0 });
  });

  it("hides rows without tenant context and rejects unscoped writes", async () => {
    const owner = await tenant("context@test.com");
    await createOrder(owner);

    const [bare] = await dataSource.query(
      "SELECT count(*)::int AS n FROM orders",
    );
    expect(bare.n).toBe(0);
    const scoped = await runWithTenant(owner.id, () =>
      dataSource.query("SELECT count(*)::int AS n FROM orders"),
    );
    expect(scoped[0].n).toBe(1);
    await expect(
      dataSource.query(
        "INSERT INTO recipients(id, user_id, name) VALUES ($1, $2, 'Unscoped')",
        [randomUUID(), owner.id],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps tenants apart on lists, details and dashboards", async () => {
    const owner = await tenant("owner@test.com");
    const other = await tenant("other@test.com");
    const { orderId, recipientId } = await createOrder(owner);

    const list = await request(server)
      .get("/api/v1/orders")
      .set(authHeader(owner.token))
      .expect(200);
    expect(JSON.stringify(list.body)).toContain(orderId);
    const foreignList = await request(server)
      .get("/api/v1/orders")
      .set(authHeader(other.token))
      .expect(200);
    expect(JSON.stringify(foreignList.body)).not.toContain(orderId);

    await request(server)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader(other.token))
      .expect(404);
    await request(server)
      .get(`/api/v1/recipients/${recipientId}`)
      .set(authHeader(other.token))
      .expect(404);

    for (const report of [
      "status-summary",
      "total-revenue",
      "total-turnover",
    ]) {
      await request(server)
        .get(`/api/v1/orders/dashboard/${report}`)
        .set(authHeader(owner.token))
        .expect(200);
    }
  });

  it("shares, revokes and voids a receipt through the public capability", async () => {
    const owner = await tenant("receipt@test.com");
    const other = await tenant("receipt-other@test.com");
    const { orderId } = await createOrder(owner);
    const receiptId = await insertReceipt(owner, orderId, "generated");
    const auth = authHeader(owner.token);

    await request(server)
      .post(`/api/v1/receipts/${receiptId}/share`)
      .set(authHeader(other.token))
      .expect(404);

    const shared = await request(server)
      .post(`/api/v1/receipts/${receiptId}/share`)
      .set(auth)
      .expect(201);
    const publicUrl = `/api/v1/public/receipts/${shared.body.token}`;
    const read = await request(server).get(publicUrl).expect(200);
    expect(read.body.receipt.id).toBe(receiptId);

    await request(server)
      .post(`/api/v1/receipts/${receiptId}/share/revoke`)
      .set(auth)
      .expect(201);
    await request(server).get(publicUrl).expect(404);

    const reshared = await request(server)
      .post(`/api/v1/receipts/${receiptId}/share`)
      .set(auth)
      .expect(201);
    await request(server)
      .post(`/api/v1/receipts/${receiptId}/void`)
      .set(auth)
      .send({ reason: "restricted role check" })
      .expect(201);
    await request(server)
      .get(`/api/v1/public/receipts/${reshared.body.token}`)
      .expect(404);
  });

  it("dispatches the outbox across tenants through each tenant's context", async () => {
    const owner = await tenant("outbox@test.com");
    const { orderId } = await createOrder(owner);
    const generationId = randomUUID();
    const receiptId = await insertReceipt(
      owner,
      orderId,
      "processing",
      generationId,
    );
    const entryId = randomUUID();
    await admin.query(
      `INSERT INTO receipt_generation_outbox(id, receipt_id, order_id, user_id, generation_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [entryId, receiptId, orderId, owner.id, generationId],
    );

    const outbox = app.get(ReceiptOutboxService, { strict: false });
    const add = jest.fn(async () => undefined);
    Object.assign(outbox, {
      publisher: {
        queue: { getJob: async () => null, add },
        close: () => null,
      },
    });
    await outbox.dispatch();

    // The entry is deleted, not published, when the tenant read cannot see its receipt.
    expect(add).toHaveBeenCalledTimes(1);
    const { rows } = await admin.query(
      "SELECT published_at FROM receipt_generation_outbox WHERE id = $1",
      [entryId],
    );
    expect(rows[0].published_at).not.toBeNull();
  });

  it("claims due storage sweeps across tenants", async () => {
    const owner = await tenant("sweep@test.com");
    await admin.query(
      `INSERT INTO document_storage_sweeps(user_id, next_sweep_at)
       VALUES ($1, now() - interval '1 hour')`,
      [owner.id],
    );

    await app.get(DocumentStorageMaintenanceService, { strict: false }).sweep();

    const { rows } = await admin.query(
      "SELECT next_sweep_at > now() AS rescheduled FROM document_storage_sweeps WHERE user_id = $1",
      [owner.id],
    );
    await admin.query(
      "DELETE FROM document_storage_sweeps WHERE user_id = $1",
      [owner.id],
    );
    expect(rows).toEqual([{ rescheduled: true }]);
  });

  it("removes expired idempotency keys across tenants", async () => {
    const owner = await tenant("idempotency@test.com");
    const insertKey = (key: string, offset: string) =>
      admin.query(
        `INSERT INTO idempotency_keys(key, user_id, expires_at)
         VALUES ($1, $2, now() + $3::interval)`,
        [key, owner.id, offset],
      );
    await insertKey("expired", "-2 days");
    await insertKey("current", "2 days");

    await app
      .get(IdempotencyCleanupService, { strict: false })
      .cleanupExpiredKeys();

    const { rows } = await admin.query("SELECT key FROM idempotency_keys");
    expect(rows).toEqual([{ key: "current" }]);
  });

  it("downgrades lapsed subscriptions across tenants", async () => {
    const owner = await tenant("subscription@test.com");
    await admin.query(
      `INSERT INTO user_subscriptions(user_id, plan, paddle_status, current_period_end)
       VALUES ($1, 'pro', 'canceled', now() - interval '1 day')
       ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan,
         paddle_status = EXCLUDED.paddle_status,
         current_period_end = EXCLUDED.current_period_end`,
      [owner.id],
    );

    const paddle = app.get(PaddleService, { strict: false });
    const billing = jest
      .spyOn(
        paddle as unknown as { isBillingEnabled(): boolean },
        "isBillingEnabled",
      )
      .mockReturnValue(true);
    await paddle.downgradeCanceledSubscriptions();
    billing.mockRestore();

    const { rows } = await admin.query(
      "SELECT plan FROM user_subscriptions WHERE user_id = $1",
      [owner.id],
    );
    expect(rows).toEqual([{ plan: "free" }]);
  });

  it("creates a Telegram order inside the bot owner's tenant", async () => {
    const owner = await tenant("telegram@test.com");
    const { productId } = await createOrder(owner);
    const telegram = app.get(TelegramService, { strict: false });
    Object.assign(telegram, { botOwnerUserId: owner.id });

    const order = await telegram.createOrderFromTelegram({
      user: { telegram_user_id: "1001", first_name: "Restricted" },
      items: [{ productId, qty: 1 }],
    });

    const { rows } = await admin.query(
      "SELECT user_id FROM order_items WHERE order_id = $1",
      [order.id],
    );
    expect(rows).toEqual([{ user_id: owner.id }]);
  });
});
