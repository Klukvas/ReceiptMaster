import "reflect-metadata";
import { randomUUID } from "crypto";
import { join } from "path";
import { DataSource } from "typeorm";
import { Client } from "pg";
import { OrdersService } from "../src/modules/orders/orders.service";
import { SettingsService } from "../src/modules/settings/services/settings.service";
import { Order } from "../src/modules/orders/entities/order.entity";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import { IdempotencyKey } from "../src/modules/orders/entities/idempotency-key.entity";
import { Product } from "../src/modules/products/entities/product.entity";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { SubscriptionService } from "../src/modules/subscription/subscription.service";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { CacheService } from "../src/common/services/cache.service";
import { PLAN_LIMITS } from "../src/modules/subscription/config/plans.config";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

// Explicit opt-in; no dotenv, production ORM config, or shared cleanup helper.
describeIsolatedPostgres(
  "orders audit: isolated PostgreSQL persistence and concurrency",
  AUDIT_CLUSTER,
  (connection) => {
    const database = `audit_orders_${process.pid}_${Date.now()}`;
    let admin: Client;
    let db: DataSource;
    let service: OrdersService;
    let user: User;
    let recipient: Recipient;
    const cache = new Map<string, unknown>();

    beforeAll(async () => {
      admin = await connectIsolatedAdmin(connection);
      await admin.query(`CREATE DATABASE "${database}"`);
      db = new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database,
        entities: [join(__dirname, "../src/**/*.entity.ts")],
        synchronize: true,
        extra: { max: 12, options: "-c statement_timeout=10000" },
      });
      await db.initialize();
      // Enable currency fixtures only in this suite-owned database.
      await db.query(
        `ALTER TYPE products_currency_enum ADD VALUE IF NOT EXISTS 'USD'`,
      );
      await db.query(
        `ALTER TYPE products_currency_enum ADD VALUE IF NOT EXISTS 'EUR'`,
      );
      const subscription = new SubscriptionService(
        db.getRepository(UserSubscription),
        db.getRepository(Product),
        db.getRepository(Order),
        db,
      );
      const memoryCache = {
        get: async (key: string) => cache.get(key),
        set: async (key: string, value: unknown) => {
          cache.set(key, value);
        },
        delByPattern: async (pattern: string) => {
          const tenantId = pattern.split(":")[2];
          for (const key of cache.keys())
            if (key.includes(`:${tenantId}:`)) cache.delete(key);
        },
      } as unknown as CacheService;
      service = new OrdersService(
        db.getRepository(Order),
        db.getRepository(OrderItem),
        db.getRepository(IdempotencyKey),
        db.getRepository(Product),
        db.getRepository(Recipient),
        db,
        {} as ReceiptsService,
        memoryCache,
        subscription,
        {
          getAutoGenerateReceipt: async () => false,
        } as unknown as SettingsService,
      );
    });

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [db],
        admin,
        databases: [database],
      }),
    );

    beforeEach(async () => {
      cache.clear();
      user = await db
        .getRepository(User)
        .save({ email: `${randomUUID()}@audit.invalid`, password: "fixture" });
      recipient = await db
        .getRepository(Recipient)
        .save({ name: "Audit recipient", user_id: user.id });
    });

    async function product(currency = "UAH", quantity = 10): Promise<Product> {
      return db.getRepository(Product).save(
        db.getRepository(Product).create({
          name: randomUUID(),
          user_id: user.id,
          purchase_price_cents: 100,
          sale_price_cents: 500,
          quantity,
          currency: currency as Product["currency"],
        }),
      );
    }

    async function create(p: Product, qty = 2, key?: string): Promise<Order> {
      const result = await service.create(
        { recipientId: recipient.id, items: [{ productId: p.id, qty }] },
        user,
        key,
      );
      return result.data as Order;
    }

    async function stock(p: Product): Promise<number> {
      return (await db.getRepository(Product).findOneByOrFail({ id: p.id }))
        .quantity;
    }

    // Hold a real product row lock until BOTH operations reach their lock seam.
    // Old code reads the same live order/quota twice; fixed code blocks the loser
    // on the order/advisory lock, before any stock restoration or quota insertion.
    async function overlap<T>(
      products: Product[],
      operations: (() => Promise<T>)[],
    ): Promise<PromiseSettledResult<T>[]> {
      const blocker = db.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query(
        "SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [products.map((p) => p.id)],
      );
      const pending = Promise.allSettled(operations.map((fn) => fn()));
      let waiting = 0;
      try {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const rows = await admin.query(
            "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'",
            [database],
          );
          waiting = rows.rows[0].n as number;
          if (waiting >= 2) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
      }
      const results = await pending;
      expect(waiting).toBeGreaterThanOrEqual(2);
      return results;
    }

    it("4: replacing A with B durably restores A and reserves B", async () => {
      const a = await product();
      const b = await product();
      const order = await create(a);
      expect(await stock(a)).toBe(8);
      await service.update(
        order.id,
        { items: [{ productId: b.id, qty: 1 }] },
        user,
      );
      expect(await stock(a)).toBe(10);
      expect(await stock(b)).toBe(9);
      expect(
        (await service.findOne(order.id, user)).items.map(
          (item) => item.product_id,
        ),
      ).toEqual([b.id]);
    });

    it.each(["create", "update"])(
      "5: %s rejects duplicate product lines at service boundary without stock changes",
      async (method) => {
        const a = await product();
        const b = await product();
        const order = await create(a);
        const items = [
          { productId: b.id, qty: 6 },
          { productId: b.id, qty: 6 },
        ];
        const request =
          method === "create"
            ? service.create({ recipientId: recipient.id, items }, user)
            : service.update(order.id, { items }, user);
        await expect(request).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect(await stock(a)).toBe(8);
        expect(await stock(b)).toBe(10);
      },
    );

    it.each(["create", "update"])(
      "12: %s rejects mixed USD/EUR with no stock or order changes",
      async (method) => {
        const a = await product("USD");
        const b = await product("EUR");
        const order = await create(a);
        const items = [
          { productId: a.id, qty: 1 },
          { productId: b.id, qty: 1 },
        ];
        const request =
          method === "create"
            ? service.create({ recipientId: recipient.id, items }, user)
            : service.update(order.id, { items }, user);
        await expect(request).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect(await stock(a)).toBe(8);
        expect(await stock(b)).toBe(10);
        expect((await service.findOne(order.id, user)).total_cents).toBe(1000);
      },
    );

    it.each(["USD", "EUR"])(
      "12/5: preserves explicit zero prices and consistent %s subtotal on create/update",
      async (currency) => {
        const a = await product(currency);
        const b = await product(currency);
        const items = [
          { productId: a.id, qty: 2, unitPriceCents: 0 },
          { productId: b.id, qty: 3, unitPriceCents: 700 },
        ];
        const response = await service.create(
          { recipientId: recipient.id, items },
          user,
        );
        expect(response.data).toMatchObject({
          currency,
          subtotal_cents: 2100,
          total_cents: 2100,
        });
        const updated = await service.update(
          response.data.id,
          { items: [{ productId: a.id, qty: 1, unitPriceCents: 0 }] },
          user,
        );
        expect(updated).toMatchObject({
          currency,
          subtotal_cents: 0,
          total_cents: 0,
        });
        expect(updated.items[0].unit_price_cents).toBe(0);
        expect(await stock(b)).toBe(10);
      },
    );

    it("7: overlapping single deletes restore stock once and have one winner", async () => {
      const p = await product();
      const order = await create(p);
      const results = await overlap(
        [p],
        [
          () => service.remove(order.id, user),
          () => service.remove(order.id, user),
        ],
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await stock(p)).toBe(10);
      await expect(service.findOne(order.id, user)).rejects.toMatchObject({
        errorCode: "ORDER_NOT_FOUND",
      });
    });

    it("7: single/batch overlap restores shared stock once", async () => {
      const p = await product();
      const order = await create(p);
      const results = await overlap<unknown>(
        [p],
        [
          () => service.remove(order.id, user),
          () => service.deleteBatch([order.id, order.id], user),
        ],
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await stock(p)).toBe(10);
    });

    it("7: update/delete overlap leaves deleted order stock fully restored", async () => {
      const p = await product();
      const order = await create(p);
      const results = await overlap<unknown>(
        [p],
        [
          () =>
            service.update(
              order.id,
              { items: [{ productId: p.id, qty: 3 }] },
              user,
            ),
          () => service.remove(order.id, user),
        ],
      );
      expect(results[1].status).toBe("fulfilled");
      expect(await stock(p)).toBe(10);
      await expect(service.findOne(order.id, user)).rejects.toMatchObject({
        errorCode: "ORDER_NOT_FOUND",
      });
    });

    it("7: parallel updates serialize against the latest reservation", async () => {
      const p = await product();
      const order = await create(p);
      const results = await overlap(
        [p],
        [
          () =>
            service.update(
              order.id,
              { items: [{ productId: p.id, qty: 3 }] },
              user,
            ),
          () =>
            service.update(
              order.id,
              { items: [{ productId: p.id, qty: 4 }] },
              user,
            ),
        ],
      );
      expect(results.every((result) => result.status === "fulfilled")).toBe(
        true,
      );
      const finalOrder = await service.findOne(order.id, user);
      expect(await stock(p)).toBe(10 - finalOrder.items[0].qty);
    });

    it("7: reversed overlapping batches lock orders/products consistently and restore once", async () => {
      const a = await product();
      const b = await product();
      const first = await create(a);
      const second = await create(b);
      const results = await overlap(
        [a, b],
        [
          () => service.deleteBatch([first.id, second.id], user),
          () => service.deleteBatch([second.id, first.id], user),
        ],
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(await stock(a)).toBe(10);
      expect(await stock(b)).toBe(10);
    });

    it.each([true, false])(
      "8: serializes distinct-product quota creates with subscription present=%s",
      async (present) => {
        if (present)
          await db
            .getRepository(UserSubscription)
            .save({ user_id: user.id, plan: "free" });
        await db.getRepository(Order).insert(
          Array.from(
            { length: PLAN_LIMITS.free.maxOrdersPerMonth - 1 },
            () => ({
              recipient_id: recipient.id,
              user_id: user.id,
              currency: "UAH",
              subtotal_cents: 0,
              total_cents: 0,
            }),
          ),
        );
        const a = await product();
        const b = await product();
        const results = await overlap(
          [a, b],
          [() => create(a, 1), () => create(b, 1)],
        );
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(rejected.reason).toMatchObject({
          errorCode: "ORDER_MONTHLY_LIMIT_EXCEEDED",
        });
        expect(
          await db.getRepository(Order).countBy({ user_id: user.id }),
        ).toBe(PLAN_LIMITS.free.maxOrdersPerMonth);
        expect((await stock(a)) + (await stock(b))).toBe(19);
      },
    );

    it("8: idempotent replay succeeds at quota with unchanged order count and stock", async () => {
      const p = await product();
      const key = randomUUID();
      const order = await create(p, 1, key);
      await db.getRepository(Order).insert(
        Array.from({ length: PLAN_LIMITS.free.maxOrdersPerMonth - 1 }, () => ({
          recipient_id: recipient.id,
          user_id: user.id,
          currency: "UAH",
          subtotal_cents: 0,
          total_cents: 0,
        })),
      );
      const replay = await service.create(
        { recipientId: recipient.id, items: [{ productId: p.id, qty: 1 }] },
        user,
        key,
      );
      expect(replay.isFromCache).toBe(true);
      expect(replay.data.id).toBe(order.id);
      expect(await stock(p)).toBe(9);
      expect(await db.getRepository(Order).countBy({ user_id: user.id })).toBe(
        PLAN_LIMITS.free.maxOrdersPerMonth,
      );
    });

    it.each(["single", "batch"])(
      "9: %s delete excludes confirmed money from all six aggregates and invalidates warmed cache",
      async (method) => {
        const p = await product();
        const order = await create(p);
        await service.confirm(order.id, user);
        const all = () =>
          Promise.all([
            service.getRevenueByProducts(user),
            service.getRevenueByRecipients(user),
            service.getTotalRevenue(user),
            service.getTurnoverByProducts(user),
            service.getTurnoverByRecipients(user),
            service.getTotalTurnover(user),
          ]);
        const before = await all();
        expect(before[2]).toMatchObject({
          total_revenue_cents: 800,
          total_orders: 1,
        });
        expect(before[5]).toMatchObject({
          total_turnover_cents: 1000,
          total_orders: 1,
        });
        if (method === "single") await service.remove(order.id, user);
        else await service.deleteBatch([order.id], user);
        const after = await all();
        expect(after).toEqual([
          [],
          [],
          { total_revenue_cents: 0, total_orders: 0, currency: "UAH" },
          [],
          [],
          { total_turnover_cents: 0, total_orders: 0, currency: "UAH" },
        ]);
        cache.clear();
        expect(await all()).toEqual(after);
      },
    );
  },
);
