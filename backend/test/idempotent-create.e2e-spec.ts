import "reflect-metadata";
import { randomUUID } from "crypto";
import { CacheService } from "../src/common/services/cache.service";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import {
  IdempotentCreateResult,
  scopedIdempotencyKey,
} from "../src/common/idempotency/idempotent-create";
import { ProductsService } from "../src/modules/products/products.service";
import {
  Product,
  Currency,
} from "../src/modules/products/entities/product.entity";
import { RecipientsService } from "../src/modules/recipients/recipients.service";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { OrdersService } from "../src/modules/orders/orders.service";
import { Order } from "../src/modules/orders/entities/order.entity";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import { IdempotencyKey } from "../src/modules/orders/entities/idempotency-key.entity";
import { User } from "../src/modules/users/entities/user.entity";
import { SubscriptionService } from "../src/modules/subscription/subscription.service";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { PLAN_LIMITS } from "../src/modules/subscription/config/plans.config";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { SettingsService } from "../src/modules/settings/services/settings.service";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import {
  RestrictedAppDatabase,
  openRestrictedAppDatabase,
} from "./helpers/restricted-app-database";

// Services run as a restricted role inside the production tenant query context.
// Concurrent requests are parked on the real advisory lock (an admin transaction
// holds it) and released together, so the race is deterministic.
describeIsolatedPostgres(
  "idempotent product and recipient create on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const FREE_PRODUCT_LIMIT = PLAN_LIMITS.free.maxProducts;
    let db: RestrictedAppDatabase;
    let products: ProductsService;
    let recipients: RecipientsService;
    let orders: OrdersService;
    let user: User;

    beforeAll(async () => {
      db = await openRestrictedAppDatabase(connection, "audit_idempotency");
      const { app } = db;
      const subscription = new SubscriptionService(
        app.getRepository(UserSubscription),
        app.getRepository(Product),
        app.getRepository(Order),
        app,
      );
      products = new ProductsService(app.getRepository(Product), subscription);
      recipients = new RecipientsService(app.getRepository(Recipient));
      orders = new OrdersService(
        app.getRepository(Order),
        app.getRepository(OrderItem),
        app.getRepository(IdempotencyKey),
        app.getRepository(Product),
        app.getRepository(Recipient),
        app,
        {} as ReceiptsService,
        { delByPattern: async () => undefined } as unknown as CacheService,
        subscription,
        {
          getAutoGenerateReceipt: async () => false,
        } as unknown as SettingsService,
      );
    }, 30000);

    afterAll(async () => {
      await db?.close();
    });

    const newUser = () =>
      db.admin.getRepository(User).save({
        email: `${randomUUID()}@idempotency.invalid`,
        password: "fixture",
      });

    beforeEach(async () => {
      user = await newUser();
    });

    const productBody = (name = `product-${randomUUID()}`) => ({
      name,
      purchase_price_cents: 100,
      sale_price_cents: 500,
      quantity: 3,
      currency: Currency.UAH,
    });

    const createProduct = (key: string, owner = user, name?: string) =>
      runWithTenant(owner.id, () =>
        products.createWithIdempotencyKey(productBody(name), owner, key),
      );

    const createRecipient = (key: string, owner = user) =>
      runWithTenant(owner.id, () =>
        recipients.createWithIdempotencyKey(
          { name: `recipient-${randomUUID()}` },
          owner,
          key,
        ),
      );

    const productCount = (owner = user) =>
      db.admin.getRepository(Product).count({ where: { user_id: owner.id } });
    const recipientCount = (owner = user) =>
      db.admin.getRepository(Recipient).count({ where: { user_id: owner.id } });
    const keyRows = (owner = user) =>
      db.admin
        .getRepository(IdempotencyKey)
        .find({ where: { user_id: owner.id }, order: { key: "ASC" } });

    const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

    const seedProducts = (count: number) =>
      Promise.all(
        Array.from({ length: count }, () =>
          db.admin
            .getRepository(Product)
            .save(
              db.admin
                .getRepository(Product)
                .create({ ...productBody(), user_id: user.id }),
            ),
        ),
      );

    /** Two calls parked behind an admin transaction holding the key's lock. */
    const raceOnKeyLock = async <T>(
      scopedKey: string,
      call: () => Promise<IdempotentCreateResult<T>>,
    ) => {
      const blocker = db.admin.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      try {
        await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          scopedKey,
        ]);
        const pending = Promise.allSettled([call(), call()]);
        expect(await db.waitForLockWaiters(2)).toBeGreaterThanOrEqual(2);
        await blocker.commitTransaction();
        return await pending;
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
      }
    };

    const fulfilled = <T>(results: PromiseSettledResult<T>[]): T[] =>
      results.map((result) => {
        if (result.status === "rejected") throw result.reason;
        return result.value;
      });

    it("the same product key twice creates one product and replays the first response", async () => {
      const key = randomUUID();
      const first = await createProduct(key);
      const second = await createProduct(key);

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.data).toEqual(asJson(first.data));
      expect(await productCount()).toBe(1);
      const rows = await keyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        key: scopedIdempotencyKey("product", key),
        order_id: null,
        status_code: 201,
      });
    });

    it("the same recipient key twice creates one recipient and replays the first response", async () => {
      const key = randomUUID();
      const first = await createRecipient(key);
      const second = await createRecipient(key);

      expect(first.replayed).toBe(false);
      expect(second).toEqual({ replayed: true, data: asJson(first.data) });
      expect(await recipientCount()).toBe(1);
      expect(await keyRows()).toHaveLength(1);
    });

    it("two concurrent product requests with one key create one product", async () => {
      const key = randomUUID();
      const [a, b] = fulfilled(
        await raceOnKeyLock(scopedIdempotencyKey("product", key), () =>
          createProduct(key),
        ),
      );

      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      expect(a.data.id).toBe(b.data.id);
      expect(await productCount()).toBe(1);
      expect(await keyRows()).toHaveLength(1);
    });

    it("two concurrent recipient requests with one key create one recipient", async () => {
      const key = randomUUID();
      const [a, b] = fulfilled(
        await raceOnKeyLock(scopedIdempotencyKey("recipient", key), () =>
          createRecipient(key),
        ),
      );

      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      expect(a.data.id).toBe(b.data.id);
      expect(await recipientCount()).toBe(1);
    });

    it("an order key, a product key and a recipient key with the same value do not collide", async () => {
      const key = randomUUID();
      const [stocked] = await seedProducts(1);
      const buyer = await db.admin
        .getRepository(Recipient)
        .save({ name: "Order buyer", user_id: user.id });
      const createOrder = () =>
        runWithTenant(user.id, () =>
          orders.create(
            {
              recipientId: buyer.id,
              items: [{ productId: stocked.id, qty: 1 }],
            },
            user,
            key,
          ),
        );

      const order = await createOrder();
      const product = await createProduct(key);
      const recipient = await createRecipient(key);
      const orderAgain = await createOrder();

      expect(order.isFromCache).toBe(false);
      expect(product.replayed).toBe(false);
      expect(recipient.replayed).toBe(false);
      expect(orderAgain.isFromCache).toBe(true);
      expect(orderAgain.data.id).toBe(order.data.id);
      expect(product.data.id).not.toBe(stocked.id);
      expect((await keyRows()).map((row) => row.key).sort()).toEqual(
        [
          key,
          scopedIdempotencyKey("product", key),
          scopedIdempotencyKey("recipient", key),
        ].sort(),
      );
    });

    it("a replay succeeds at the product-quota limit: the key lock comes before the quota", async () => {
      await seedProducts(FREE_PRODUCT_LIMIT - 1);
      const key = randomUUID();

      const first = await createProduct(key);
      expect(first.replayed).toBe(false);
      expect(await productCount()).toBe(FREE_PRODUCT_LIMIT);

      const replay = await createProduct(key);
      expect(replay).toEqual({ replayed: true, data: asJson(first.data) });

      await expect(createProduct(randomUUID())).rejects.toMatchObject({
        statusCode: 402,
        errorCode: "PRODUCT_LIMIT_EXCEEDED",
      });
      expect(await productCount()).toBe(FREE_PRODUCT_LIMIT);
    });

    it("a refused create stores nothing, so a retry with the same key runs again", async () => {
      const seeded = await seedProducts(FREE_PRODUCT_LIMIT);
      const key = randomUUID();

      await expect(createProduct(key)).rejects.toMatchObject({
        statusCode: 402,
      });
      expect(await keyRows()).toHaveLength(0);

      await db.admin.getRepository(Product).softDelete({ id: seeded[0].id });
      const retry = await createProduct(key);
      expect(retry.replayed).toBe(false);
      expect(await productCount()).toBe(FREE_PRODUCT_LIMIT);
    });

    it("an expired key creates again and replaces its stored response", async () => {
      const key = randomUUID();
      const first = await createProduct(key);
      await db.admin
        .getRepository(IdempotencyKey)
        .update(
          { user_id: user.id },
          { expires_at: new Date(Date.now() - 60_000) },
        );

      const again = await createProduct(key);

      expect(again.replayed).toBe(false);
      expect(again.data.id).not.toBe(first.data.id);
      expect(await productCount()).toBe(2);
      const rows = await keyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].response).toMatchObject({ id: again.data.id });
    });

    it("the same key from another tenant creates that tenant's own product", async () => {
      const key = randomUUID();
      const other = await newUser();

      const mine = await createProduct(key);
      const theirs = await createProduct(key, other);

      expect(theirs.replayed).toBe(false);
      expect(theirs.data.id).not.toBe(mine.data.id);
      expect(await productCount()).toBe(1);
      expect(await productCount(other)).toBe(1);
    });

    it("without a key, create is unchanged: every call inserts and nothing is stored", async () => {
      const create = () =>
        runWithTenant(user.id, () => products.create(productBody(), user));
      const [a, b] = [await create(), await create()];

      expect(a.id).not.toBe(b.id);
      expect(await productCount()).toBe(2);
      expect(await keyRows()).toHaveLength(0);
    });
  },
);
