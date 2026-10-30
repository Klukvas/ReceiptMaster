import "reflect-metadata";
import { randomUUID } from "crypto";
import { QueryRunner } from "typeorm";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { CacheService } from "../src/common/services/cache.service";
import { ProductsService } from "../src/modules/products/products.service";
import {
  Product,
  Currency,
} from "../src/modules/products/entities/product.entity";
import { UpdateProductDto } from "../src/modules/products/dto/update-product.dto";
import { OrdersService } from "../src/modules/orders/orders.service";
import { Order } from "../src/modules/orders/entities/order.entity";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import { IdempotencyKey } from "../src/modules/orders/entities/idempotency-key.entity";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
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

// Services run as a restricted role inside the production tenant query context,
// so RLS applies to every statement exactly as it does behind the HTTP guards.
describeIsolatedPostgres(
  "products: stock preconditions and product quota on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const FREE_PRODUCT_LIMIT = PLAN_LIMITS.free.maxProducts;
    let db: RestrictedAppDatabase;
    let products: ProductsService;
    let orders: OrdersService;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openRestrictedAppDatabase(connection, "audit_products");
      const { app } = db;
      const subscription = new SubscriptionService(
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

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@products.invalid`,
        password: "fixture",
      });
      recipient = await db.admin
        .getRepository(Recipient)
        .save({ name: "Stock recipient", user_id: user.id });
    });

    const asTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      runWithTenant(user.id, operation);

    const seedProduct = (quantity: number, name = randomUUID()) =>
      db.admin.getRepository(Product).save(
        db.admin.getRepository(Product).create({
          name,
          user_id: user.id,
          purchase_price_cents: 100,
          sale_price_cents: 500,
          quantity,
          currency: Currency.UAH,
        }),
      );

    const stored = (id: string) =>
      db.admin.getRepository(Product).findOneOrFail({
        where: { id },
        withDeleted: true,
      });

    const update = (id: string, body: UpdateProductDto) =>
      asTenant(() => products.update(id, body, user));

    const orderTwo = (product: Product) =>
      asTenant(() =>
        orders.create(
          {
            recipientId: recipient.id,
            items: [{ productId: product.id, qty: 2 }],
          },
          user,
        ),
      );

    const openBlocker = async (): Promise<QueryRunner> => {
      const blocker = db.admin.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      return blocker;
    };

    describe("stock is a precondition write", () => {
      it("form opened at 10, an order takes 2, a rename keeps 8", async () => {
        const product = await seedProduct(10);
        const formSnapshot = await asTenant(() =>
          products.findOne(product.id, user),
        );
        expect(formSnapshot.quantity).toBe(10);

        await orderTwo(product);
        expect((await stored(product.id)).quantity).toBe(8);

        const renamed = await update(product.id, { name: "Renamed" });
        expect(renamed).toMatchObject({ name: "Renamed", quantity: 8 });
        expect(await stored(product.id)).toMatchObject({
          name: "Renamed",
          quantity: 8,
        });
      });

      it("rejects the old full-entity payload instead of writing its stale quantity", async () => {
        const product = await seedProduct(10);
        await orderTwo(product);

        await expect(
          update(product.id, {
            name: "Renamed",
            purchase_price_cents: 100,
            sale_price_cents: 500,
            quantity: 10,
            currency: Currency.UAH,
          }),
        ).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect(await stored(product.id)).toMatchObject({
          name: product.name,
          quantity: 8,
        });
      });

      it("rejects expectedQuantity without quantity", async () => {
        const product = await seedProduct(10);
        await expect(
          update(product.id, { expectedQuantity: 10 }),
        ).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect((await stored(product.id)).quantity).toBe(10);
      });

      it("a deliberately stale quantity edit gets a conflict and changes nothing", async () => {
        const product = await seedProduct(10);
        await orderTwo(product);

        await expect(
          update(product.id, {
            name: "Not saved",
            quantity: 15,
            expectedQuantity: 10,
          }),
        ).rejects.toMatchObject({
          statusCode: 409,
          errorCode: "PRODUCT_QUANTITY_CONFLICT",
        });
        expect(await stored(product.id)).toMatchObject({
          name: product.name,
          quantity: 8,
        });
      });

      it("an informed quantity edit against the current stock applies", async () => {
        const product = await seedProduct(10);
        await orderTwo(product);

        const updated = await update(product.id, {
          quantity: 15,
          expectedQuantity: 8,
        });
        expect(updated.quantity).toBe(15);
        expect((await stored(product.id)).quantity).toBe(15);
      });

      it("a quantity edit blocked by an order's row lock re-checks and conflicts", async () => {
        const product = await seedProduct(10);
        const blocker = await openBlocker();
        let pending: Promise<Product> | undefined;
        try {
          await blocker.query(
            "SELECT id FROM products WHERE id = $1 FOR UPDATE",
            [product.id],
          );
          pending = update(product.id, { quantity: 15, expectedQuantity: 10 });
          // Keep the rejection observed while the edit is parked on the lock.
          pending.catch(() => undefined);
          expect(await db.waitForLockWaiters(1)).toBeGreaterThanOrEqual(1);
          await blocker.query(
            "UPDATE products SET quantity = quantity - 2 WHERE id = $1",
            [product.id],
          );
          await blocker.commitTransaction();
        } finally {
          if (blocker.isTransactionActive) await blocker.rollbackTransaction();
          await blocker.release();
        }

        await expect(pending).rejects.toMatchObject({
          statusCode: 409,
          errorCode: "PRODUCT_QUANTITY_CONFLICT",
        });
        expect((await stored(product.id)).quantity).toBe(8);
      });

      it("a soft-deleted or missing product is 404, not a conflict", async () => {
        const product = await seedProduct(10);
        await db.admin.getRepository(Product).softDelete({ id: product.id });

        for (const id of [product.id, randomUUID()]) {
          await expect(
            update(id, { quantity: 3, expectedQuantity: 10 }),
          ).rejects.toMatchObject({
            statusCode: 404,
            errorCode: "PRODUCT_NOT_FOUND",
          });
        }
        expect((await stored(product.id)).quantity).toBe(10);
      });

      it("runs under the caller's tenant: another tenant context cannot update the row", async () => {
        const product = await seedProduct(10);
        const intruder = await db.admin.getRepository(User).save({
          email: `${randomUUID()}@products.invalid`,
          password: "fixture",
        });

        await expect(
          runWithTenant(intruder.id, () =>
            products.update(product.id, { name: "Hijacked" }, user),
          ),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect((await stored(product.id)).name).toBe(product.name);
      });
    });

    describe("product quota", () => {
      const seedUpToLimitMinusOne = async () => {
        const live = await Promise.all(
          Array.from({ length: FREE_PRODUCT_LIMIT - 1 }, () => seedProduct(1)),
        );
        // Soft-deleted products never count against the plan.
        const deleted = await seedProduct(1);
        await db.admin.getRepository(Product).softDelete({ id: deleted.id });
        return live;
      };

      const liveCount = () =>
        db.admin.getRepository(Product).count({ where: { user_id: user.id } });

      const createProduct = (name: string) =>
        asTenant(() =>
          products.create(
            {
              name,
              purchase_price_cents: 100,
              sale_price_cents: 500,
              quantity: 1,
              currency: Currency.UAH,
            },
            user,
          ),
        );

      it("of two creates for the last free slot exactly one succeeds", async () => {
        await seedUpToLimitMinusOne();
        // SHARE blocks inserts but not counts, so without serialization both
        // creates would pass their check before either insert lands.
        const blocker = await openBlocker();
        let results: PromiseSettledResult<Product>[];
        try {
          await blocker.query("LOCK TABLE products IN SHARE MODE");
          const pending = Promise.allSettled([
            createProduct("last-slot-a"),
            createProduct("last-slot-b"),
          ]);
          expect(await db.waitForLockWaiters(2)).toBeGreaterThanOrEqual(2);
          await blocker.commitTransaction();
          results = await pending;
        } finally {
          if (blocker.isTransactionActive) await blocker.rollbackTransaction();
          await blocker.release();
        }

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected?.reason).toMatchObject({
          statusCode: 402,
          errorCode: "PRODUCT_LIMIT_EXCEEDED",
        });
        expect(await liveCount()).toBe(FREE_PRODUCT_LIMIT);
      });

      it("a create rolled back after its insert does not consume the quota", async () => {
        await seedUpToLimitMinusOne();
        const trigger = `force_rollback_${randomUUID().replace(/-/g, "")}`;
        await db.admin.query(
          `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$
           BEGIN RAISE EXCEPTION 'forced failure after product insert'; END $$`,
        );
        // Deferred: the insert succeeds and the failure happens at COMMIT.
        await db.admin.query(
          `CREATE CONSTRAINT TRIGGER "${trigger}" AFTER INSERT ON products
           DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
           WHEN (NEW.name = 'force-rollback') EXECUTE FUNCTION "${trigger}"()`,
        );
        try {
          await expect(createProduct("force-rollback")).rejects.toThrow(
            /forced failure after product insert/,
          );
        } finally {
          await db.admin.query(`DROP TRIGGER "${trigger}" ON products`);
          await db.admin.query(`DROP FUNCTION "${trigger}"()`);
        }
        expect(await liveCount()).toBe(FREE_PRODUCT_LIMIT - 1);

        await expect(createProduct("after-rollback")).resolves.toMatchObject({
          name: "after-rollback",
        });
        expect(await liveCount()).toBe(FREE_PRODUCT_LIMIT);
        await expect(createProduct("over-limit")).rejects.toMatchObject({
          statusCode: 402,
          errorCode: "PRODUCT_LIMIT_EXCEEDED",
        });
      });
    });
  },
);
