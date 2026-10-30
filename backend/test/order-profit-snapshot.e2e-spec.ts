import "reflect-metadata";
import { randomUUID } from "crypto";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { CacheService } from "../src/common/services/cache.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import {
  Order,
  OrderStatus,
} from "../src/modules/orders/entities/order.entity";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import { IdempotencyKey } from "../src/modules/orders/entities/idempotency-key.entity";
import {
  Currency,
  Product,
} from "../src/modules/products/entities/product.entity";
import { ProductsService } from "../src/modules/products/products.service";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { SubscriptionService } from "../src/modules/subscription/subscription.service";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { SettingsService } from "../src/modules/settings/services/settings.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { captureOrder } from "../src/modules/receipts/services/document-render.service";
import { TelegramService } from "../src/modules/telegram/telegram.service";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { RestrictedAppDatabase } from "./helpers/restricted-app-database";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";

// Profit reads the cost frozen on each order line. Services run as a restricted
// role on a fully migrated database (the real column and CHECK) through the
// production tenant query context, with an in-memory dashboard cache.
describeIsolatedPostgres(
  "historical profit from order-line cost snapshots on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let orders: OrdersService;
    let products: ProductsService;
    let subscription: SubscriptionService;
    let user: User;
    let recipient: Recipient;
    const cache = new Map<string, unknown>();
    const memoryCache = {
      get: async (key: string) => cache.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        cache.set(key, value);
      },
      // Redis glob semantics for the only pattern shape in use: dashboard:*:{user}:*
      delByPattern: async (pattern: string) => {
        const [prefix, , userId] = pattern.split(":");
        for (const key of [...cache.keys()])
          if (key.startsWith(`${prefix}:`) && key.includes(`:${userId}:`))
            cache.delete(key);
      },
    } as unknown as CacheService;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_profit");
      const { app } = db;
      subscription = new SubscriptionService(
        app.getRepository(UserSubscription),
        app.getRepository(Product),
        app.getRepository(Order),
        app,
      );
      products = new ProductsService(app.getRepository(Product), subscription);
      orders = new OrdersService(
        app.getRepository(Order),
        app.getRepository(OrderItem),
        app.getRepository(IdempotencyKey),
        app.getRepository(Product),
        app.getRepository(Recipient),
        app,
        // Document voiding is covered by order-lifecycle; no receipts exist here.
        {
          voidForCancellation: async () => 0,
        } as unknown as ReceiptsService,
        memoryCache,
        subscription,
        {
          getAutoGenerateReceipt: async () => false,
        } as unknown as SettingsService,
      );
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      cache.clear();
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@profit.invalid`,
        password: "fixture",
      });
      recipient = await db.admin
        .getRepository(Recipient)
        .save({ name: "Profit recipient", user_id: user.id });
    });

    const asTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      runWithTenant(user.id, operation);

    const seedProduct = (
      cost: number,
      price = 500,
      name: string = randomUUID(),
    ) =>
      db.admin.getRepository(Product).save(
        db.admin.getRepository(Product).create({
          name,
          user_id: user.id,
          purchase_price_cents: cost,
          sale_price_cents: price,
          quantity: 100,
          currency: Currency.UAH,
        }),
      );

    type Line = { product: Product; qty: number; unitPriceCents?: number };

    const draft = async (
      lines: Line[],
      to: Recipient = recipient,
    ): Promise<Order> =>
      (
        await asTenant(() =>
          orders.create(
            {
              recipientId: to.id,
              items: lines.map(({ product, qty, unitPriceCents }) => ({
                productId: product.id,
                qty,
                unitPriceCents,
              })),
            },
            user,
          ),
        )
      ).data as Order;

    const confirmed = async (lines: Line[], to?: Recipient) => {
      const order = await draft(lines, to);
      await asTenant(() => orders.confirm(order.id, user));
      return order;
    };

    const lineCosts = async (orderId: string) =>
      (
        await db.admin.getRepository(OrderItem).find({
          where: { order_id: orderId },
          order: { product_name: "ASC" },
        })
      ).map((item) => [item.product_name, item.unit_cost_cents]);

    /** Simulates a line written before cost snapshots existed. */
    const forgetCost = (orderId: string, productId?: string) =>
      db.admin.getRepository(OrderItem).update(
        {
          order_id: orderId,
          ...(productId ? { product_id: productId } : {}),
        },
        { unit_cost_cents: null },
      );

    const everything = () =>
      asTenant(() =>
        Promise.all([
          orders.getTotalRevenue(user),
          orders.getRevenueByProducts(user),
          orders.getRevenueByRecipients(user),
          orders.getDailyRevenue(user, 2),
          orders.getTotalTurnover(user),
          orders.getTurnoverByProducts(user),
          orders.getTurnoverByRecipients(user),
        ]),
      );

    describe("capture", () => {
      it("freezes the product cost on create and keeps it through confirmation", async () => {
        const beans = await seedProduct(100, 500, "beans");
        const order = await draft([{ product: beans, qty: 2 }]);
        expect(await lineCosts(order.id)).toEqual([["beans", 100]]);

        await db.admin
          .getRepository(Product)
          .update({ id: beans.id }, { purchase_price_cents: 300 });
        await asTenant(() => orders.confirm(order.id, user));

        // Confirmation does not re-capture.
        expect(await lineCosts(order.id)).toEqual([["beans", 100]]);
      });

      it("a draft edit keeps unchanged lines' cost (even unknown) and captures changed or new lines", async () => {
        const beans = await seedProduct(100, 500, "beans");
        const cups = await seedProduct(40, 90, "cups");
        const filters = await seedProduct(5, 20, "filters");
        const order = await draft([
          { product: beans, qty: 2 },
          { product: cups, qty: 3 },
        ]);
        await forgetCost(order.id, cups.id);
        for (const product of [beans, cups, filters])
          await db.admin
            .getRepository(Product)
            .update(
              { id: product.id },
              { purchase_price_cents: product.purchase_price_cents + 1000 },
            );

        // Same product and quantity (new sale price) → keeps 100; cups unchanged → stays unknown.
        await asTenant(() =>
          orders.update(
            order.id,
            {
              items: [
                { productId: beans.id, qty: 2, unitPriceCents: 650 },
                { productId: cups.id, qty: 3 },
              ],
            },
            user,
          ),
        );
        expect(await lineCosts(order.id)).toEqual([
          ["beans", 100],
          ["cups", null],
        ]);

        // A changed quantity and a new line capture today's cost.
        await asTenant(() =>
          orders.update(
            order.id,
            {
              items: [
                { productId: beans.id, qty: 2 },
                { productId: cups.id, qty: 4 },
                { productId: filters.id, qty: 1 },
              ],
            },
            user,
          ),
        );
        expect(await lineCosts(order.id)).toEqual([
          ["beans", 100],
          ["cups", 1040],
          ["filters", 1005],
        ]);
      });

      it("Telegram orders freeze the cost and drop the owner's dashboard cache", async () => {
        const beans = await seedProduct(120, 500, "beans");
        const saved = { ...process.env };
        process.env.TELEGRAM_BOT_TOKEN = "test-only";
        process.env.TELEGRAM_BOT_OWNER_USER_ID = user.id;
        let telegram: TelegramService;
        try {
          telegram = new TelegramService(
            db.app.getRepository(Recipient),
            db.app.getRepository(Order),
            db.app.getRepository(Product),
            db.app.getRepository(OrderItem),
            db.app,
            memoryCache,
          );
        } finally {
          process.env = saved;
        }
        const before = await asTenant(() => orders.getTotalRevenue(user));
        expect(before.total_revenue_cents).toBe(0);
        expect(cache.size).toBeGreaterThan(0);

        const order = await telegram.createOrderFromTelegram({
          user: { telegram_user_id: "4242", first_name: "Bot" },
          items: [{ productId: beans.id, qty: 2 }],
        } as never);

        expect(await lineCosts(order.id)).toEqual([["beans", 120]]);
        expect([...cache.keys()]).toEqual([]);
        expect(await asTenant(() => orders.getTotalRevenue(user))).toEqual({
          total_revenue_cents: 760,
          total_orders: 1,
          currency: "UAH",
          unknown_cost_lines: 0,
          unknown_cost_turnover_cents: 0,
          profit_complete: true,
        });
      });

      it("never exposes the cost in the frozen document content", async () => {
        const beans = await seedProduct(100);
        const order = await confirmed([{ product: beans, qty: 2 }]);
        const owned = await asTenant(() => orders.findOne(order.id, user));
        expect(owned.items[0].unit_cost_cents).toBe(100);

        const frozen = JSON.stringify(captureOrder(owned));
        expect(frozen).not.toContain("unit_cost");
        expect(frozen).not.toContain("purchase");
      });
    });

    describe("reporting", () => {
      it("a product cost change does not rewrite confirmed profit, cached or not", async () => {
        const beans = await seedProduct(100, 500, "beans");
        await confirmed([{ product: beans, qty: 2 }]);
        const before = await everything();
        expect(before[0]).toMatchObject({
          total_revenue_cents: 800,
          profit_complete: true,
        });

        await asTenant(() =>
          products.update(beans.id, { purchase_price_cents: 450 }, user),
        );
        const cached = await everything();
        cache.clear();
        const fresh = await everything();

        expect(cached).toEqual(before);
        expect(fresh).toEqual(before);
        expect(fresh[1]).toEqual([
          expect.objectContaining({
            product_id: beans.id,
            total_revenue_cents: 800,
          }),
        ]);
        expect(fresh[3][1]).toMatchObject({
          revenue_cents: 800,
          turnover_cents: 1000,
        });
      });

      it("an unknown cost is excluded and reported, never counted as zero; turnover is unchanged", async () => {
        const beans = await seedProduct(100, 500, "beans");
        const cups = await seedProduct(40, 90, "cups");
        const legacy = await confirmed([
          { product: beans, qty: 2 },
          { product: cups, qty: 3 },
        ]);
        await forgetCost(legacy.id, cups.id);

        const [total, byProduct, byRecipient, daily, turnover] =
          await everything();

        // Known: beans (500-100)*2 = 800. Unknown: cups 90*3 = 270 of turnover.
        expect(total).toEqual({
          total_revenue_cents: 800,
          total_orders: 1,
          currency: "UAH",
          unknown_cost_lines: 1,
          unknown_cost_turnover_cents: 270,
          profit_complete: false,
        });
        expect(byProduct).toEqual([
          {
            product_id: beans.id,
            product_name: "beans",
            total_revenue_cents: 800,
            total_quantity: 2,
            currency: "UAH",
            unknown_cost_lines: 0,
            unknown_cost_turnover_cents: 0,
            profit_complete: true,
          },
          {
            product_id: cups.id,
            product_name: "cups",
            total_revenue_cents: null,
            total_quantity: 3,
            currency: "UAH",
            unknown_cost_lines: 1,
            unknown_cost_turnover_cents: 270,
            profit_complete: false,
          },
        ]);
        expect(byRecipient).toEqual([
          expect.objectContaining({
            recipient_id: recipient.id,
            total_revenue_cents: 800,
            total_orders: 1,
            unknown_cost_lines: 1,
            unknown_cost_turnover_cents: 270,
            profit_complete: false,
          }),
        ]);
        expect(daily[1]).toMatchObject({
          revenue_cents: 800,
          turnover_cents: 1270,
          unknown_cost_lines: 1,
          profit_complete: false,
        });
        // Turnover counts every line, whatever its cost.
        expect(turnover).toMatchObject({
          total_turnover_cents: 1270,
          total_orders: 1,
        });

        await forgetCost(legacy.id);
        cache.clear();
        const [allUnknown, , recipientsUnknown] = await everything();
        expect(allUnknown).toMatchObject({
          total_revenue_cents: null,
          unknown_cost_lines: 2,
          unknown_cost_turnover_cents: 1270,
          profit_complete: false,
        });
        expect(recipientsUnknown[0].total_revenue_cents).toBeNull();
      });

      it("a zero cost is a known cost: complete, with the full sale as profit", async () => {
        const sample = await seedProduct(0, 300, "sample");
        await confirmed([{ product: sample, qty: 2 }]);

        const [total, byProduct] = await everything();

        expect(total).toMatchObject({
          total_revenue_cents: 600,
          unknown_cost_lines: 0,
          profit_complete: true,
        });
        expect(byProduct[0]).toMatchObject({
          total_revenue_cents: 600,
          profit_complete: true,
        });
      });

      it("daily: a day without orders is a complete 0, a day of unknown costs is null", async () => {
        const beans = await seedProduct(100);
        const yesterday = await confirmed([{ product: beans, qty: 1 }]);
        await db.admin.query(
          "UPDATE orders SET created_at = (CURRENT_DATE - 1) + time '12:00' WHERE id = $1",
          [yesterday.id],
        );
        const today = await confirmed([{ product: beans, qty: 2 }]);
        await forgetCost(today.id);

        const daily = await asTenant(() => orders.getDailyRevenue(user, 3));

        expect(daily.map((day) => day.revenue_cents)).toEqual([0, 400, null]);
        expect(daily[0]).toMatchObject({
          turnover_cents: 0,
          unknown_cost_lines: 0,
          unknown_cost_turnover_cents: 0,
          profit_complete: true,
        });
        expect(daily[2]).toMatchObject({
          turnover_cents: 1000,
          unknown_cost_lines: 1,
          unknown_cost_turnover_cents: 1000,
          profit_complete: false,
        });
      });

      it("sorts unknown profit after every known profit, including losses", async () => {
        const loss = await seedProduct(700, 500, "loss");
        const gain = await seedProduct(100, 500, "gain");
        const unknown = await seedProduct(100, 500, "unknown");
        const other = await db.admin
          .getRepository(Recipient)
          .save({ name: "Other recipient", user_id: user.id });
        await confirmed([
          { product: loss, qty: 1 },
          { product: gain, qty: 1 },
        ]);
        const legacy = await confirmed([{ product: unknown, qty: 1 }], other);
        await forgetCost(legacy.id);

        const [, byProduct, byRecipient] = await everything();

        expect(
          byProduct.map((row) => [row.product_name, row.total_revenue_cents]),
        ).toEqual([
          ["gain", 400],
          ["loss", -200],
          ["unknown", null],
        ]);
        expect(
          byRecipient.map((row) => [row.recipient_id, row.total_revenue_cents]),
        ).toEqual([
          [recipient.id, 200],
          [other.id, null],
        ]);
      });
    });

    describe("dashboard cache", () => {
      it("never serves an entry cached in the previous payload shape", async () => {
        const beans = await seedProduct(100);
        await confirmed([{ product: beans, qty: 2 }]);
        const legacyKey = `dashboard:totalRevenue:${user.id}:[null,null]`;
        cache.set(legacyKey, {
          total_revenue_cents: 0,
          total_orders: 0,
          currency: "UAH",
        });

        expect(await asTenant(() => orders.getTotalRevenue(user))).toEqual({
          total_revenue_cents: 800,
          total_orders: 1,
          currency: "UAH",
          unknown_cost_lines: 0,
          unknown_cost_turnover_cents: 0,
          profit_complete: true,
        });
        expect(
          cache.has(`dashboard:v2:totalRevenue:${user.id}:[null,null]`),
        ).toBe(true);
      });

      it("order writes drop entries of every version for the tenant only", async () => {
        const beans = await seedProduct(100);
        const order = await confirmed([{ product: beans, qty: 2 }]);
        const stranger = randomUUID();
        cache.set(`dashboard:totalRevenue:${user.id}:[]`, {});
        cache.set(`dashboard:v2:statusSummary:${stranger}:[]`, {});
        await asTenant(() => orders.getTotalRevenue(user));

        const cancelled = await asTenant(() => orders.cancel(order.id, user));

        expect(cancelled.status).toBe(OrderStatus.CANCELLED);
        expect([...cache.keys()]).toEqual([
          `dashboard:v2:statusSummary:${stranger}:[]`,
        ]);
        expect(
          await asTenant(() => orders.getTotalRevenue(user)),
        ).toMatchObject({
          total_revenue_cents: 0,
          total_orders: 0,
          profit_complete: true,
        });
      });
    });
  },
);
