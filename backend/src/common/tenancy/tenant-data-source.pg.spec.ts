import { DataSource } from "typeorm";
import { randomUUID } from "crypto";
import { join } from "path";
import { userInfo } from "os";
import { installTenantContext } from "./tenant-data-source";
import { runWithPublicToken, runWithTenant } from "./tenant-context";
import { AddRLSPolicies1761500000006 } from "../../config/migrations/1761500000006-AddRLSPolicies";
import { ReceiptCapabilitiesAndOutbox1792000000000 } from "../../config/migrations/1792000000000-ReceiptCapabilitiesAndOutbox";
import { UsersService } from "../../modules/users/users.service";
import { RefreshToken } from "../../modules/users/entities/refresh-token.entity";
import { User } from "../../modules/users/entities/user.entity";
import { Currency } from "../../modules/products/entities/product.entity";
import { Product } from "../../modules/products/entities/product.entity";
import { Recipient } from "../../modules/recipients/entities/recipient.entity";
import { Order, OrderStatus } from "../../modules/orders/entities/order.entity";
import { OrderItem } from "../../modules/orders/entities/order-item.entity";
import { ReceiptsService } from "../../modules/receipts/receipts.service";
import {
  Receipt,
  ReceiptStatus,
} from "../../modules/receipts/entities/receipt.entity";

// Opt in only to the disposable audit cluster, never normal application DB defaults.
const pgDescribe =
  process.env.AUDIT_PG_PORT === "55439" ? describe : describe.skip;
pgDescribe(
  "tenant query context against PostgreSQL with a restricted non-owner",
  () => {
    let admin: DataSource;
    let source: DataSource;
    const a = randomUUID();
    const b = randomUUID();
    const token = "a".repeat(64);
    const otherToken = "b".repeat(64);
    let sharedOrder: Order;
    let sharedReceipt: Receipt;
    let otherReceipt: Receipt;
    let legacyReceipt: Receipt;
    const role = `audit_app_${process.pid}_${Date.now()}`;
    const database = `audit_rls_${process.pid}_${Date.now()}`;

    beforeAll(async () => {
      const root = await new DataSource({
        type: "postgres",
        host: "127.0.0.1",
        port: 55439,
        username: userInfo().username,
        database: "postgres",
      }).initialize();
      await root.query(`CREATE DATABASE "${database}"`);
      await root.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOBYPASSRLS`);
      await root.destroy();
      admin = await new DataSource({
        type: "postgres",
        host: "127.0.0.1",
        port: 55439,
        username: userInfo().username,
        database,
        entities: [join(__dirname, "../../**/*.entity.ts")],
        synchronize: true,
      }).initialize();
      const fixtures = async (userId: string, publicToken: string) => {
        await admin.getRepository(User).save({
          id: userId,
          email: `${userId}@example.test`,
          password: "test-only",
        });
        const recipient = await admin
          .getRepository(Recipient)
          .save({ user_id: userId, name: "Fixture recipient" });
        const product = await admin.getRepository(Product).save({
          user_id: userId,
          name: "Fixture product",
          sale_price_cents: 100,
          purchase_price_cents: 50,
          currency: Currency.UAH,
          quantity: 10,
        });
        const order = await admin.getRepository(Order).save({
          user_id: userId,
          recipient_id: recipient.id,
          status: OrderStatus.CONFIRMED,
          subtotal_cents: 100,
          total_cents: 100,
          vat_cents: 0,
          currency: "UAH",
        });
        await admin.getRepository(OrderItem).save({
          user_id: userId,
          order_id: order.id,
          product_id: product.id,
          product_name: product.name,
          qty: 1,
          unit_price_cents: 100,
          line_total_cents: 100,
        });
        const receipt = await admin.getRepository(Receipt).save({
          user_id: userId,
          order_id: order.id,
          number: randomUUID(),
          status: ReceiptStatus.GENERATED,
          public_token: publicToken,
        });
        return { order, receipt };
      };
      ({ order: sharedOrder, receipt: sharedReceipt } = await fixtures(
        a,
        token,
      ));
      ({ receipt: otherReceipt } = await fixtures(b, otherToken));
      // A second order by A proves the public capability does not grant its whole tenant.
      const recipient = await admin
        .getRepository(Recipient)
        .save({ user_id: a, name: "Unshared customer" });
      await admin.getRepository(Order).save({
        user_id: a,
        recipient_id: recipient.id,
        status: OrderStatus.DRAFT,
        subtotal_cents: 0,
        total_cents: 0,
        vat_cents: 0,
        currency: "UAH",
      });
      ({ receipt: legacyReceipt } = await fixtures(
        randomUUID(),
        "c".repeat(64),
      ));
      await admin
        .getRepository(Receipt)
        .update(legacyReceipt.id, { status: ReceiptStatus.PROCESSING });
      // Reconstruct the old schema only in this newly created disposable database.
      await admin.query("DROP TABLE receipt_generation_outbox");
      await admin.query(
        "ALTER TABLE receipts DROP COLUMN generation_id, DROP COLUMN generation_started_at",
      );
      const runner = admin.createQueryRunner();
      await new AddRLSPolicies1761500000006().up(runner);
      await new ReceiptCapabilitiesAndOutbox1792000000000().up(runner);
      await runner.release();
      await admin.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );
      await admin.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`,
      );
      source = installTenantContext(
        await new DataSource({
          type: "postgres",
          host: "127.0.0.1",
          port: 55439,
          username: role,
          database,
          entities: [join(__dirname, "../../**/*.entity.ts")],
          extra: { max: 1 },
        }).initialize(),
      );
    }, 20000);
    afterAll(async () => {
      if (source?.isInitialized) await source.destroy();
      if (admin?.isInitialized) await admin.destroy();
    });

    it("upgrades legacy processing work into a new durable generation", async () => {
      const legacy = await admin
        .getRepository(Receipt)
        .findOneByOrFail({ id: legacyReceipt.id });
      expect(legacy.generation_id).toMatch(/^[a-f0-9-]{36}$/);
      const pending = await admin.query(
        "SELECT * FROM receipt_generation_outbox WHERE receipt_id = $1",
        [legacy.id],
      );
      expect(pending).toHaveLength(1);
      expect(pending[0].generation_id).toBe(legacy.generation_id);
    });

    it("guards malformed refresh tokens despite the installed ORM omitting undefined predicates", async () => {
      await admin.getRepository(RefreshToken).save({
        token: "d".repeat(128),
        user_id: a,
        expires_at: new Date(Date.now() + 60000),
        revoked: false,
      });
      const repository = source.getRepository(RefreshToken);
      // This is the real installed TypeORM behavior underlying the auth finding.
      expect(
        await repository.findOne({
          where: { token: undefined, revoked: false },
        }),
      ).not.toBeNull();
      const lookup = jest.spyOn(repository, "findOne");
      const service = new UsersService(
        source.getRepository(User),
        repository,
        undefined,
        undefined,
      );
      await expect(service.refreshToken(undefined)).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(lookup).not.toHaveBeenCalled();
      lookup.mockRestore();
    });

    it("uses an actual restricted non-owner and denies missing context", async () => {
      const [identity] = await source.query(
        "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      );
      expect(identity).toMatchObject({
        name: role,
        rolsuper: false,
        rolbypassrls: false,
      });
      expect(await source.query("SELECT * FROM orders")).toEqual([]);
      await expect(
        source.query(
          "INSERT INTO recipients(user_id, name) VALUES ($1, 'denied')",
          [a],
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("scopes unfiltered SELECTs before any write and isolates one pooled connection", async () => {
      for (const userId of [a, b, a, b]) {
        const rows = await runWithTenant(userId, () =>
          source.query("SELECT * FROM orders"),
        );
        expect(rows.length).toBe(userId === a ? 2 : 1);
        expect(
          rows.every((row: { user_id: string }) => row.user_id === userId),
        ).toBe(true);
        expect(await source.query("SELECT * FROM orders")).toEqual([]);
      }
      await runWithTenant(a, async () => {
        expect(
          await source.query("SELECT * FROM receipts WHERE id = $1", [
            otherReceipt.id,
          ]),
        ).toEqual([]);
        expect(
          await source.query(
            "UPDATE receipts SET public_token = NULL WHERE id = $1 RETURNING id",
            [otherReceipt.id],
          ),
        ).toEqual([[], 0]);
        await expect(
          source.query(
            "INSERT INTO recipients(user_id, name) VALUES ($1, 'denied')",
            [b],
          ),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("protects joined repositories and explicit transactions, savepoints, rollback and context switches", async () => {
      await runWithTenant(a, () =>
        source.transaction(async (manager) => {
          const orders = await manager
            .getRepository(Order)
            .find({ relations: ["items", "recipient"] });
          expect(orders).toHaveLength(2);
          const nested = manager.queryRunner;
          await nested.startTransaction();
          expect(
            await manager.query("SELECT * FROM orders WHERE user_id = $1", [b]),
          ).toEqual([]);
          await nested.rollbackTransaction();
          await expect(
            runWithTenant(b, () => manager.query("SELECT * FROM orders")),
          ).rejects.toThrow("Tenant context cannot change");
        }),
      );
      await expect(
        runWithTenant(a, () =>
          source.transaction(async (manager) => {
            await manager.query("SELECT * FROM orders");
            throw new Error("intentional rollback");
          }),
        ),
      ).rejects.toThrow("intentional rollback");
      expect(await source.query("SELECT * FROM orders")).toEqual([]);
      await expect(
        runWithTenant(a, () => source.query("SELECT 1 / 0")),
      ).rejects.toThrow();
      expect(await source.query("SELECT * FROM orders")).toEqual([]);
    });

    it("allows the token's exact receipt graph and denies unrelated reads and all writes", async () => {
      await runWithPublicToken(token, async () => {
        const receipts = await source
          .getRepository(Receipt)
          .find({ relations: ["order", "order.items", "order.recipient"] });
        expect(receipts).toHaveLength(1);
        expect(receipts[0].id).toBe(sharedReceipt.id);
        expect(receipts[0].order.id).toBe(sharedOrder.id);
        expect(receipts[0].order.items).toHaveLength(1);
        expect(await source.query("SELECT * FROM orders")).toHaveLength(1);
        expect(await source.query("SELECT * FROM recipients")).toHaveLength(1);
        expect(await source.query("SELECT * FROM products")).toEqual([]);
        expect(
          await source.query(
            "UPDATE receipts SET public_token = NULL RETURNING id",
          ),
        ).toEqual([[], 0]);
        await expect(
          source.query(
            "INSERT INTO recipients(user_id, name) VALUES ($1, 'denied')",
            [a],
          ),
        ).rejects.toThrow(/row-level security/);
      });
      expect(await source.query("SELECT * FROM receipts")).toEqual([]);
    });

    it("persists SQL NULL on revoke and denies the token after revoke or void", async () => {
      await runWithTenant(a, () =>
        source
          .getRepository(Receipt)
          .update({ id: sharedReceipt.id }, { public_token: null }),
      );
      expect(
        (
          await admin
            .getRepository(Receipt)
            .findOneByOrFail({ id: sharedReceipt.id })
        ).public_token,
      ).toBeNull();
      expect(
        await runWithPublicToken(token, () =>
          source.getRepository(Receipt).find(),
        ),
      ).toEqual([]);
      const service = new ReceiptsService(
        source.getRepository(Receipt),
        source.getRepository(Order),
        undefined,
        undefined,
        source,
        undefined,
        undefined,
        undefined,
      );
      await expect(service.getPublicReceipt(token)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(service.getPublicReceiptPdf(token)).rejects.toMatchObject({
        statusCode: 404,
      });
      await admin
        .getRepository(Receipt)
        .update(otherReceipt.id, { status: ReceiptStatus.VOID });
      expect(
        await runWithPublicToken(otherToken, () =>
          source.getRepository(Receipt).find(),
        ),
      ).toEqual([]);
    });
    it.each([
      ["explicit", "revoke"],
      ["fallback", "revoke"],
      ["explicit", "void"],
      ["fallback", "void"],
    ])(
      "preserves %s PDF regeneration against concurrent %s",
      async (mode, mutation) => {
        await admin.getRepository(Receipt).update(sharedReceipt.id, {
          status: ReceiptStatus.GENERATED,
          public_token: token,
          pdf_path: "object-storage://audit/old.pdf",
        });
        let finishPdf: (value: { filePath: string; url: string }) => void;
        let startedPdf: () => void;
        const started = new Promise<void>((resolve) => {
          startedPdf = resolve;
        });
        const pdf = {
          generateReceiptPdf: jest.fn(() => {
            startedPdf();
            return new Promise((resolve) => {
              finishPdf = resolve;
            });
          }),
        };
        const storage = {
          parseObjectStoragePath: () => ({
            bucket: "audit",
            key: "fixture.pdf",
          }),
          deleteFile: jest.fn().mockResolvedValue(undefined),
          fileExists: jest.fn().mockResolvedValue(false),
          downloadFile: jest.fn().mockResolvedValue(Buffer.from("fixture-pdf")),
        };
        const settings = {
          getAllPdfSettings: jest.fn().mockResolvedValue({
            companyInfo: {},
            templateId: "standard",
            receiptTitle: "Invoice",
            templateLanguage: "en",
          }),
        };
        const service = new ReceiptsService(
          source.getRepository(Receipt),
          source.getRepository(Order),
          pdf as never,
          storage as never,
          source,
          undefined,
          settings as never,
          undefined,
        );
        const user = { id: a } as User;
        const pending = runWithTenant(a, () =>
          mode === "explicit"
            ? service.regenerateReceiptPdf(sharedReceipt.id, user)
            : service.getReceiptPdf(sharedReceipt.id, user),
        );
        await started;
        await runWithTenant(a, () =>
          mutation === "void"
            ? service.voidReceipt(sharedReceipt.id, user, "fixture race")
            : service.revokePublicToken(sharedReceipt.id, user),
        );
        expect(
          (
            await admin
              .getRepository(Receipt)
              .findOneByOrFail({ id: sharedReceipt.id })
          ).public_token,
        ).toBeNull();
        finishPdf({
          filePath: "object-storage://audit/new.pdf",
          url: "https://example.test/new.pdf",
        });
        if (mutation === "void")
          await expect(pending).rejects.toMatchObject({
            statusCode: expect.any(Number),
          });
        else await pending;
        const current = await admin
          .getRepository(Receipt)
          .findOneByOrFail({ id: sharedReceipt.id });
        expect(current.public_token).toBeNull();
        expect(current.status).toBe(
          mutation === "void" ? ReceiptStatus.VOID : ReceiptStatus.GENERATED,
        );
        await expect(service.getPublicReceipt(token)).rejects.toMatchObject({
          statusCode: 404,
        });
        await expect(service.getPublicReceiptPdf(token)).rejects.toMatchObject({
          statusCode: 404,
        });
      },
    );

    it("returns one winning token to concurrent share creators", async () => {
      await admin.getRepository(Receipt).update(sharedReceipt.id, {
        status: ReceiptStatus.GENERATED,
        public_token: null,
      });
      const service = new ReceiptsService(
        source.getRepository(Receipt),
        source.getRepository(Order),
        undefined,
        undefined,
        source,
        { get: () => "https://example.test" } as never,
        undefined,
        undefined,
      );
      const results = await Promise.all(
        [1, 2].map(() =>
          runWithTenant(a, () =>
            service.generatePublicToken(sharedReceipt.id, { id: a } as User),
          ),
        ),
      );
      expect(results[0].token).toBe(results[1].token);
      expect(
        (
          await admin
            .getRepository(Receipt)
            .findOneByOrFail({ id: sharedReceipt.id })
        ).public_token,
      ).toBe(results[0].token);
    });

    it("cannot restore a voided receipt while creating its share token", async () => {
      await admin.getRepository(Receipt).update(sharedReceipt.id, {
        status: ReceiptStatus.GENERATED,
        public_token: null,
      });
      const repository = source.getRepository(Receipt);
      const update = repository.update.bind(repository);
      let resume: () => void;
      let started: () => void;
      const paused = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const intercepted = jest
        .spyOn(repository, "update")
        .mockImplementationOnce(async (criteria, values) => {
          started();
          await paused;
          return update(criteria, values);
        });
      try {
        const service = new ReceiptsService(
          repository,
          source.getRepository(Order),
          undefined,
          undefined,
          source,
          { get: () => "https://example.test" } as never,
          undefined,
          undefined,
        );
        const pending = runWithTenant(a, () =>
          service.generatePublicToken(sharedReceipt.id, { id: a } as User),
        );
        await entered;
        await admin.getRepository(Receipt).update(sharedReceipt.id, {
          status: ReceiptStatus.VOID,
          public_token: null,
        });
        resume();
        await expect(pending).rejects.toMatchObject({ statusCode: 400 });
        const current = await admin
          .getRepository(Receipt)
          .findOneByOrFail({ id: sharedReceipt.id });
        expect(current.status).toBe(ReceiptStatus.VOID);
        expect(current.public_token).toBeNull();
      } finally {
        intercepted.mockRestore();
      }
    });
  },
);
