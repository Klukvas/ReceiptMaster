import { ConflictException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createHash, randomBytes, randomUUID } from "crypto";
import { join } from "path";
import { Client } from "pg";
import { installTenantContext } from "./tenant-data-source";
import { runWithPublicToken, runWithTenant } from "./tenant-context";
import { AddRLSPolicies1761500000006 } from "../../config/migrations/1761500000006-AddRLSPolicies";
import { AddReceiptProcessingStatus1761500000005 } from "../../config/migrations/1761500000005-AddReceiptProcessingStatus";
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
import { ReceiptGenerationOutbox } from "../../modules/receipts/entities/receipt-generation-outbox.entity";
import { ReceiptArtifactService } from "../../modules/receipts/services/receipt-artifact.service";
import { ReceiptSnapshotService } from "../../modules/receipts/services/receipt-snapshot.service";
import { DocumentArtifactsService } from "../../modules/receipts/services/document-artifacts.service";
import {
  DocumentRenderService,
  RenderSnapshot,
} from "../../modules/receipts/services/document-render.service";
import {
  Receipt,
  ReceiptStatus,
} from "../../modules/receipts/entities/receipt.entity";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  destroyDataSources,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "../../../test/helpers/isolated-postgres";

// Opt in only to the disposable audit cluster, never normal application DB defaults.
describeIsolatedPostgres(
  "tenant query context against PostgreSQL with a restricted non-owner",
  AUDIT_CLUSTER,
  (connection) => {
    let root: Client;
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
    const freshDatabase = `audit_bootstrap_${process.pid}_${Date.now()}`;
    const regenerationDatabase = `audit_regen_${process.pid}_${Date.now()}`;
    let rolePassword: string;

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      rolePassword = await createRestrictedRole(root, role);
      admin = await new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
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
          order_number: 1,
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
        order_number: 1,
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
          host: connection.host,
          port: connection.port,
          username: role,
          password: rolePassword,
          database,
          entities: [join(__dirname, "../../**/*.entity.ts")],
          extra: { max: 1 },
        }).initialize(),
      );
    }, 20000);
    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [source, admin],
        admin: root,
        databases: [freshDatabase, regenerationDatabase, database],
        roles: [role],
      }),
    );

    it("applies the outbox migration in the same transaction that adds processing", async () => {
      const runner = admin.createQueryRunner();
      await runner.startTransaction();
      const schema = `enum_bootstrap_${randomUUID().replace(/-/g, "")}`;
      try {
        await runner.query(`CREATE SCHEMA "${schema}"`);
        await runner.query(`SET LOCAL search_path TO "${schema}", public`);
        await runner.query(
          "CREATE TYPE receipts_status_enum AS ENUM ('generated', 'void')",
        );
        await runner.query("CREATE TABLE recipients(id uuid PRIMARY KEY)");
        await runner.query(
          "CREATE TABLE orders(id uuid PRIMARY KEY, recipient_id uuid)",
        );
        await runner.query(
          "CREATE TABLE order_items(id uuid PRIMARY KEY, order_id uuid)",
        );
        await runner.query(
          "CREATE TABLE receipts(id uuid PRIMARY KEY, order_id uuid, user_id uuid, status receipts_status_enum, public_token text)",
        );
        await new AddReceiptProcessingStatus1761500000005().up(runner);
        await new ReceiptCapabilitiesAndOutbox1792000000000().up(runner);
        expect(
          await runner.query(
            "SELECT count(*)::int AS count FROM receipt_generation_outbox",
          ),
        ).toEqual([{ count: 0 }]);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it("bootstraps the complete migration chain on a clean database in one transaction", async () => {
      await admin.query(`CREATE DATABASE "${freshDatabase}"`);
      const fresh = await new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database: freshDatabase,
        entities: [join(__dirname, "../../**/*.entity.ts")],
        migrations: [join(__dirname, "../../config/migrations/*.ts")],
        synchronize: false,
      }).initialize();
      try {
        const applied = await fresh.runMigrations({ transaction: "all" });
        expect(
          applied.some(
            (migration) =>
              migration.name === "ReceiptCapabilitiesAndOutbox1792000000000",
          ),
        ).toBe(true);
        expect(
          await fresh.query(
            "SELECT count(*)::int AS count FROM receipt_generation_outbox",
          ),
        ).toEqual([{ count: 0 }]);
        expect(await fresh.showMigrations()).toBe(false);
      } finally {
        await fresh.destroy();
      }
    }, 20000);

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
      expect(
        await source.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user",
        ),
      ).toEqual([]);
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
    // Real-PostgreSQL evidence that a delayed regeneration cannot restore a revoked
    // public token or undo a concurrent void. Regeneration is asynchronous: an explicit
    // request freezes a candidate plus an outbox job that ReceiptArtifactService.execute
    // promotes; a missing PDF is repaired synchronously by ReceiptArtifactService.repair.
    // Both render outside any transaction, then promote under row locks with fenced
    // updates. The renderer is held open by a promise gate while the concurrent mutation
    // commits; everything runs as the restricted role under tenant context.
    describe("delayed regeneration against concurrent revoke or void", () => {
      const tenant = randomUUID();
      const user = { id: tenant } as User;
      const fixturePdf = Buffer.from("%PDF-1.4 regeneration fixture");
      let owner: DataSource;
      let runtime: DataSource;

      beforeAll(async () => {
        // The full migration chain provides the storage-lease, sweep and outbox tables
        // and policies these services write, exactly as production has them.
        await root.query(`CREATE DATABASE "${regenerationDatabase}"`);
        owner = await new DataSource({
          type: "postgres",
          ...typeormCredentials(connection),
          database: regenerationDatabase,
          entities: [join(__dirname, "../../**/*.entity.ts")],
          migrations: [join(__dirname, "../../config/migrations/*.ts")],
        }).initialize();
        await owner.runMigrations({ transaction: "all" });
        await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
        await owner.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
        );
        await owner.query(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`,
        );
        await owner.getRepository(User).save({
          id: tenant,
          email: `${tenant}@example.test`,
          password: "test-only",
        });
        runtime = installTenantContext(
          await new DataSource({
            type: "postgres",
            host: connection.host,
            port: connection.port,
            username: role,
            password: rolePassword,
            database: regenerationDatabase,
            entities: [join(__dirname, "../../**/*.entity.ts")],
            extra: { max: 1 },
          }).initialize(),
        );
      }, 30000);
      afterAll(() => destroyDataSources([runtime, owner]));

      /** A confirmed, locked order with a generated, shared receipt and frozen content. */
      async function sharedGeneratedReceipt() {
        const recipient = await owner
          .getRepository(Recipient)
          .save({ user_id: tenant, name: "Race recipient" });
        const order = await owner.getRepository(Order).save({
          user_id: tenant,
          recipient_id: recipient.id,
          status: OrderStatus.CONFIRMED,
          is_locked: true,
          subtotal_cents: 100,
          total_cents: 100,
          currency: "UAH",
        });
        const html = "<!doctype html><html><body>Frozen receipt</body></html>";
        const snapshot = {
          templateRevision: 1,
          options: {},
          htmlHash: createHash("sha256").update(html).digest("hex"),
        } as unknown as RenderSnapshot;
        const publicToken = randomBytes(32).toString("hex");
        const receipt = await owner.getRepository(Receipt).save({
          user_id: tenant,
          order_id: order.id,
          number: randomUUID(),
          status: ReceiptStatus.GENERATED,
          public_token: publicToken,
          html_snapshot: html,
          active_snapshot: snapshot,
          active_revision: 1,
          pdf_path: `object-storage://receipts/${tenant}/original.pdf`,
          hash: "original",
          progress: 100,
        });
        return { receipt, publicToken, originalPath: receipt.pdf_path };
      }

      /** Real receipt services over the restricted pool; only Chromium and S3 are doubles. */
      function receiptServices() {
        let markStarted: () => void;
        let release: () => void;
        const started = new Promise<void>((resolve) => {
          markStarted = resolve;
        });
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        const renderer = {
          generatePdf: jest.fn(async () => {
            markStarted();
            await released;
            return fixturePdf;
          }),
        };
        const storage = {
          uploadReceipt: jest.fn(
            async (_buffer: Buffer, filename: string) =>
              `https://storage.example.test/${filename}`,
          ),
          parseObjectStoragePath: (path: string) => ({
            bucket: "receipts",
            key: path.replace("object-storage://", ""),
          }),
          // The stored PDF is gone, so a download falls back to repair.
          fileExists: jest.fn().mockResolvedValue(false),
        };
        const renders = new DocumentRenderService(
          undefined,
          renderer as never,
          undefined,
        );
        const snapshots = new ReceiptSnapshotService(
          runtime,
          undefined,
          undefined,
          renders,
        );
        const leases = new DocumentArtifactsService(runtime, storage as never);
        const artifacts = new ReceiptArtifactService(
          runtime,
          snapshots,
          renders,
          leases,
        );
        const receipts = new ReceiptsService(
          runtime.getRepository(Receipt),
          runtime.getRepository(Order),
          undefined,
          storage as never,
          runtime,
          undefined,
          undefined,
          { dispatch: jest.fn() } as never,
          snapshots,
          artifacts,
        );
        return { receipts, artifacts, started, release: () => release() };
      }

      it.each([
        ["explicit", "revoke"],
        ["explicit", "void"],
        ["fallback", "revoke"],
        ["fallback", "void"],
      ] as const)(
        "%s regeneration finishing after a concurrent %s leaves the share token revoked and any void intact",
        async (mode, mutation) => {
          const { receipt, publicToken, originalPath } =
            await sharedGeneratedReceipt();
          const { receipts, artifacts, started, release } = receiptServices();
          const inTenant = <T>(operation: () => Promise<T>) =>
            runWithTenant(tenant, operation);

          let pending: Promise<unknown>;
          if (mode === "explicit") {
            const queued = await inTenant(() =>
              receipts.regenerateReceiptPdf(receipt.id, user),
            );
            expect(queued.replacement_status).toBe("processing");
            const jobs = await owner
              .getRepository(ReceiptGenerationOutbox)
              .findBy({ receipt_id: receipt.id });
            expect(jobs.map((job) => job.generation_id)).toEqual([
              queued.generation_id,
            ]);
            // What the queue worker runs for that outbox job.
            pending = inTenant(() =>
              artifacts.execute(receipt.id, tenant, queued.generation_id),
            );
          } else {
            pending = inTenant(() => receipts.getReceiptPdf(receipt.id, user));
          }
          // Fail fast if the operation settles without ever reaching the renderer.
          await Promise.race([
            started,
            pending.then(() => {
              throw new Error("finished before rendering");
            }),
          ]);
          await inTenant(() =>
            mutation === "void"
              ? receipts.voidReceipt(receipt.id, user, "Concurrent void")
              : receipts.revokePublicToken(receipt.id, user),
          );
          release();

          if (mutation === "void" && mode === "explicit")
            expect(await pending).toBeNull();
          else if (mutation === "void")
            await expect(pending).rejects.toBeInstanceOf(ConflictException);
          else if (mode === "explicit")
            expect(await pending).toMatchObject({
              status: ReceiptStatus.GENERATED,
              active_revision: 2,
              public_token: null,
              replacement_status: null,
            });
          else
            expect(
              ((await pending) as { buffer: Buffer }).buffer.equals(fixturePdf),
            ).toBe(true);

          const current = await owner
            .getRepository(Receipt)
            .createQueryBuilder("r")
            .addSelect("r.pending_id")
            .where("r.id = :id", { id: receipt.id })
            .getOneOrFail();
          expect(current.public_token).toBeNull();
          if (mutation === "void") {
            expect(current).toMatchObject({
              status: ReceiptStatus.VOID,
              active_revision: 1,
              pdf_path: originalPath,
              replacement_status: null,
              pending_id: null,
            });
          } else {
            // The regenerated PDF did land, without touching the share token.
            expect(current.status).toBe(ReceiptStatus.GENERATED);
            expect(current.active_revision).toBe(mode === "explicit" ? 2 : 1);
            expect(current.pdf_path).not.toBe(originalPath);
          }
          await expect(
            receipts.getPublicReceipt(publicToken),
          ).rejects.toMatchObject({ statusCode: 404 });
          await expect(
            receipts.getPublicReceiptPdf(publicToken),
          ).rejects.toMatchObject({ statusCode: 404 });
        },
      );
    });

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
