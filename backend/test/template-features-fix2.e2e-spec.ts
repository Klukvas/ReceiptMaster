import {
  createTemplateFixture,
  TENANT,
  OTHER_TENANT,
  ORDER_ID,
} from "./template-features-fixture";
import {
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { DocumentArtifact } from "../src/modules/receipts/entities/document-artifact.entity";
import { DocumentAsset } from "../src/modules/settings/entities/document-asset.entity";
import { Order } from "../src/modules/orders/entities/order.entity";
import { sampleOrder } from "../src/modules/receipts/services/document-render.service";
import { ReceiptOutboxService } from "../src/modules/receipts/receipt-outbox.service";
import { DocumentStorageMaintenanceService } from "../src/modules/receipts/services/document-storage-maintenance.service";
import { DocumentUploadFencing1792100000002 } from "../src/config/migrations/1792100000002-DocumentUploadFencing";
import { DocumentConfiguration1792100000000 } from "../src/config/migrations/1792100000000-DocumentConfiguration";
import { DocumentStorageLeases1792100000001 } from "../src/config/migrations/1792100000001-DocumentStorageLeases";
import { DataSource, EntitySchema, QueryRunner } from "typeorm";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const EVIDENCE_DIR =
  process.env.TEMPLATE_EVIDENCE ||
  join(tmpdir(), "receiptmaster-template-features", "fix3");
mkdirSync(EVIDENCE_DIR, { recursive: true });
import sharp = require("sharp");

type Row = Record<string, unknown>;
function deferred() {
  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve: () => resolve() };
}
describe("FIX2 actual production service regressions (synthetic persistence/storage)", () => {
  let f: Awaited<ReturnType<typeof createTemplateFixture>>;
  beforeEach(async () => {
    f = await createTemplateFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  async function expire() {
    for (const entity of [DocumentArtifact, DocumentAsset])
      for (const row of f.memory.rows(entity))
        await f.db.manager.update(
          entity,
          { id: row.id },
          { lease_expires_at: new Date(0) },
        );
  }
  it.each(["legacy", "active"] as const)(
    "repairs missing NULL path/hash with trustworthy %s snapshot and persists installed-TypeORM SQL",
    async (kind) => {
      const candidate = await f.receipts.generateReceipt(ORDER_ID, f.user);
      const active = await f.artifacts.execute(
        candidate.id,
        TENANT,
        candidate.generation_id,
      );
      await f.db.manager.update(
        Receipt,
        { id: active.id },
        {
          pdf_path: null,
          hash: null,
          ...(kind === "legacy"
            ? { active_snapshot: null, active_revision: 0 }
            : {}),
        },
      );
      const ds = new DataSource({
        type: "postgres",
        entities: [
          new EntitySchema({
            name: "Receipt",
            target: Receipt,
            columns: {
              id: { type: "uuid", primary: true },
              user_id: { type: "uuid" },
              status: { type: String },
              active_revision: { type: Number },
              hash: { type: String, nullable: true },
              pdf_path: { type: String, nullable: true },
              pdf_url: { type: String, nullable: true },
            },
          }),
        ],
      });
      await (
        ds as unknown as { buildMetadatas: () => Promise<void> }
      ).buildMetadatas();
      const update = f.db.manager.update.bind(f.db.manager);
      let sql: string;
      let parameters: unknown[];
      jest
        .spyOn(f.db.manager, "update")
        .mockImplementation(async (entity, where, patch) => {
          if (entity === Receipt && "pdf_url" in patch) {
            [sql, parameters] = ds
              .createQueryBuilder()
              .update(Receipt)
              .set(patch)
              .where(where)
              .getQueryAndParameters();
          }
          return update(entity, where, patch);
        });
      expect(
        (await f.artifacts.repair(active.id, TENANT)).subarray(0, 4).toString(),
      ).toBe("%PDF");
      writeFileSync(
        `${EVIDENCE_DIR}/repair-${kind}-${process.env.FIX2_BASELINE ? "red" : "green"}-sql.json`,
        JSON.stringify({ sql, parameters }, null, 2),
      );
      expect(sql).toMatch(/"hash" IS NULL/);
      expect(sql).toMatch(/"pdf_path" IS NULL/);
      expect(sql).toContain('"active_revision"');
      expect(sql).toContain('"user_id"');
      await f.db.manager.update(
        Receipt,
        { id: active.id },
        { html_snapshot: null, active_snapshot: null, pdf_path: null },
      );
      await expect(f.artifacts.repair(active.id, TENANT)).rejects.toThrow(
        /reconstruction/i,
      );
    },
  );
  it.each(["pdf", "logo"] as const)(
    "collects late %s PUT after expired lease collection, including collected tombstone and overlapping collector",
    async (kind) => {
      const paused = deferred(),
        resume = deferred();
      if (kind === "pdf") {
        const upload = f.pdfs.uploadReceipt.bind(f.pdfs);
        jest
          .spyOn(f.pdfs, "uploadReceipt")
          .mockImplementation(async (...args) => {
            paused.resolve();
            await resume.promise;
            return upload(...args);
          });
      } else {
        const upload = f.logos.uploadImmutable.bind(f.logos);
        jest
          .spyOn(f.logos, "uploadImmutable")
          .mockImplementation(async (...args) => {
            paused.resolve();
            await resume.promise;
            return upload(...args);
          });
      }
      const png = await sharp({
        create: { width: 10, height: 40, channels: 4, background: "blue" },
      })
        .png()
        .toBuffer();
      const base = await f.documents.read(TENANT);
      const pending = (
        kind === "pdf"
          ? f.leases.upload(Buffer.from("%PDF"), "late.pdf", TENANT)
          : f.assets.stage(
              TENANT,
              { config: base.config, logoAction: "replace" },
              { buffer: png, mimetype: "image/png" } as Express.Multer.File,
            )
      ).then(
        () => null,
        (error) => error,
      );
      await paused.promise;
      await expire();
      const entity = kind === "pdf" ? DocumentArtifact : DocumentAsset;
      const collect = () =>
        kind === "pdf"
          ? f.leases.collectExpired(TENANT)
          : f.assets.collectExpired(TENANT);
      await collect();
      expect(f.memory.rows(entity)).toHaveLength(1); // durable tombstone during upload uncertainty
      await expire();
      await collect(); // uncertain tombstone remains across repeated cleanup
      const deletePaused = deferred(),
        deleteResume = deferred();
      // Re-establishment must also survive an already in-flight collector's CAS.
      resume.resolve();
      expect(await pending).toBeInstanceOf(Error);
      expect(f.objects.size).toBe(1);
      expect(f.memory.rows(entity)).toHaveLength(1);
      await expire();
      const remove =
        kind === "pdf"
          ? f.pdfs.deleteReceipt.bind(f.pdfs)
          : f.logos.removeImmutable.bind(f.logos);
      const removeSpy =
        kind === "pdf"
          ? jest.spyOn(f.pdfs, "deleteReceipt")
          : jest.spyOn(f.logos, "removeImmutable");
      removeSpy.mockImplementation(async (...args: [string, string]) => {
        deletePaused.resolve();
        await deleteResume.promise;
        await remove(...args);
      });
      const sweep = collect();
      await deletePaused.promise;
      const row = f.memory.rows(entity)[0];
      await f.db.manager.update(entity, { id: row.id }, {
        cleanup_token: randomUUID(),
        lease_expires_at: new Date(Date.now() + 86400000),
      } as never);
      deleteResume.resolve();
      await sweep;
      expect(f.memory.rows(entity)).toHaveLength(1); // old collector cannot erase refreshed intent
      removeSpy.mockRestore();
      await expire();
      await collect();
      await expire();
      await collect();
      expect(f.objects.size).toBe(0);
      expect(f.memory.rows(entity)).toHaveLength(0);
    },
  );
  it.each(["pdf", "logo"] as const)(
    "backoff lets 25 failing %s deletes yield to a healthy later object",
    async (kind) => {
      const entity = kind === "pdf" ? DocumentArtifact : DocumentAsset;
      for (let i = 0; i < 26; i++)
        await f.db.manager.save(entity, {
          id: randomUUID(),
          user_id: TENANT,
          object_key: `${kind === "pdf" ? "receipts" : "logos"}/${TENANT}/${i}.${kind === "pdf" ? "pdf" : "png"}`,
          state: "ready",
          lease_expires_at: new Date(i),
          cleanup_attempts: 0,
        } as never);
      const calls: string[] = [];
      const remove = async (key: string) => {
        calls.push(key);
        if (!key.endsWith("25.pdf") && !key.endsWith("25.png"))
          throw new Error("persistent failure");
      };
      if (kind === "pdf")
        jest.spyOn(f.pdfs, "deleteReceipt").mockImplementation(remove);
      else jest.spyOn(f.logos, "removeImmutable").mockImplementation(remove);
      const collect = () =>
        kind === "pdf"
          ? f.leases.collectExpired(TENANT)
          : f.assets.collectExpired(TENANT);
      await expect(collect()).resolves.toBe(0);
      await expect(collect()).resolves.toBe(1);
      expect(calls).toHaveLength(26);
      expect(f.memory.rows(entity)).toHaveLength(25);
      expect(
        f.memory
          .rows(entity)
          .every(
            (row) =>
              new Date(String(row.lease_expires_at)).getTime() > Date.now(),
          ),
      ).toBe(true);
    },
  );
  it("maintenance runs PDF collector even if logo collector fails on consecutive sweeps", async () => {
    // Postgres driver shape for UPDATE ... RETURNING: [rows, rowCount].
    jest
      .spyOn(f.db.manager, "query")
      .mockResolvedValue([[{ user_id: TENANT }], 1]);
    const logos = jest
      .spyOn(f.assets, "collectExpired")
      .mockRejectedValue(new Error("logo service failed"));
    const pdf = jest.spyOn(f.leases, "collectExpired").mockResolvedValue(0);
    const maintenance = new DocumentStorageMaintenanceService(
      f.db,
      f.assets,
      f.leases,
    );
    await maintenance.sweep();
    await maintenance.sweep();
    expect(logos).toHaveBeenCalledTimes(2);
    expect(pdf).toHaveBeenCalledTimes(2);
  });
  it("expired mixed PUT intents retain their ledger without blocking legitimate PDF and logo uploads", async () => {
    for (let i = 0; i < 25; i++)
      await f.db.manager.save(i % 2 ? DocumentAsset : DocumentArtifact, {
        id: randomUUID(),
        user_id: TENANT,
        upload_pending: true,
        state: i % 3 ? "deleting" : "uploading",
        object_key: `${i % 2 ? "logos" : "receipts"}/${TENANT}/uncertain-${i}.${i % 2 ? "png" : "pdf"}`,
        lease_expires_at: new Date(0),
      } as never);
    const uncertainIds = [DocumentAsset, DocumentArtifact].flatMap((entity) =>
      f.memory.rows(entity).map((row) => row.id),
    );
    // Expired uploading rows free capacity even before the first collector sweep.
    await expect(
      f.leases.upload(Buffer.from("%PDF"), "before-sweep.pdf", TENANT),
    ).resolves.toHaveProperty("id");
    // Collectors extend retry deadlines, which must not reconsume capacity.
    await f.leases.collectExpired(TENANT);
    await f.assets.collectExpired(TENANT);
    await expect(
      f.leases.upload(Buffer.from("%PDF"), "new.pdf", TENANT),
    ).resolves.toHaveProperty("id");
    const png = await sharp({
      create: { width: 10, height: 40, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const base = await f.documents.read(TENANT);
    await expect(
      f.assets.stage(TENANT, { config: base.config, logoAction: "replace" }, {
        buffer: png,
        mimetype: "image/png",
      } as Express.Multer.File),
    ).resolves.toEqual(expect.any(String));
    expect(
      [DocumentAsset, DocumentArtifact]
        .flatMap((entity) => f.memory.rows(entity))
        .filter((row) => uncertainIds.includes(row.id) && row.upload_pending),
    ).toHaveLength(25);
    await expect(
      f.leases.upload(Buffer.from("%PDF"), "other.pdf", OTHER_TENANT),
    ).resolves.toHaveProperty("id");
  });
  it("serializes mixed live reservations at 25 while another tenant uploads", async () => {
    const pause = deferred(),
      rejected = deferred();
    const originalPdf = f.pdfs.uploadReceipt.bind(f.pdfs);
    const originalLogo = f.logos.uploadImmutable.bind(f.logos);
    let entered = 0;
    jest.spyOn(f.pdfs, "uploadReceipt").mockImplementation(async (...args) => {
      if (args[2] === TENANT) {
        entered++;
        await pause.promise;
      }
      return originalPdf(...args);
    });
    jest
      .spyOn(f.logos, "uploadImmutable")
      .mockImplementation(async (...args) => {
        entered++;
        await pause.promise;
        return originalLogo(...args);
      });
    const png = await sharp({
      create: { width: 10, height: 40, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    const base = await f.documents.read(TENANT);
    const uploads = Array.from({ length: 26 }, (_, i) =>
      (i % 2
        ? f.assets.stage(
            TENANT,
            { config: base.config, logoAction: "replace" },
            { buffer: png, mimetype: "image/png" } as Express.Multer.File,
          )
        : f.leases.upload(Buffer.from("%PDF"), `live-${i}.pdf`, TENANT)
      ).catch((error) => {
        rejected.resolve();
        return error;
      }),
    );
    // Wait for all attempted reservations, without releasing any PUT.
    await rejected.promise;
    expect(entered).toBe(25);
    expect(
      [DocumentAsset, DocumentArtifact]
        .flatMap((entity) => f.memory.rows(entity))
        .filter((row) => row.upload_pending),
    ).toHaveLength(25);
    const other = f.leases.upload(
      Buffer.from("%PDF"),
      "other.pdf",
      OTHER_TENANT,
    );
    await expect(other).resolves.toHaveProperty("id");
    pause.resolve();
    const settled = await Promise.all(uploads);
    expect(settled.filter((value) => value instanceof Error)).toHaveLength(1);
    expect(settled.find((value) => value instanceof Error).message).toContain(
      "in flight",
    );
    expect(
      f.memory.queries.filter((sql) =>
        sql.includes("pg_advisory_xact_lock(hashtextextended($1, 2))"),
      ),
    ).toHaveLength(27);
  });
  it.each(["pdf", "logo"] as const)(
    "late %s PUT keeps ledger if DB settlement fails after arbitrary suspension",
    async (kind) => {
      const paused = deferred(),
        resume = deferred();
      const originalPdf = f.pdfs.uploadReceipt.bind(f.pdfs);
      const originalLogo = f.logos.uploadImmutable.bind(f.logos);
      const delay = async () => {
        paused.resolve();
        await resume.promise;
      };
      if (kind === "pdf")
        jest
          .spyOn(f.pdfs, "uploadReceipt")
          .mockImplementation(async (...args) => {
            await delay();
            return originalPdf(...args);
          });
      else
        jest
          .spyOn(f.logos, "uploadImmutable")
          .mockImplementation(async (...args) => {
            await delay();
            return originalLogo(...args);
          });
      const png = await sharp({
        create: { width: 10, height: 40, channels: 4, background: "blue" },
      })
        .png()
        .toBuffer();
      const base = await f.documents.read(TENANT);
      const pending = (
        kind === "pdf"
          ? f.leases.upload(Buffer.from("%PDF"), "crashed.pdf", TENANT)
          : f.assets.stage(
              TENANT,
              { config: base.config, logoAction: "replace" },
              { buffer: png, mimetype: "image/png" } as Express.Multer.File,
            )
      ).catch((error) => error);
      await paused.promise;
      const entity = kind === "pdf" ? DocumentArtifact : DocumentAsset;
      for (let i = 0; i < 3; i++) {
        await expire();
        await (kind === "pdf"
          ? f.leases.collectExpired(TENANT)
          : f.assets.collectExpired(TENANT));
      }
      f.memory.failCommit = true;
      resume.resolve();
      expect(await pending).toBeInstanceOf(Error);
      expect(f.objects.size).toBe(1);
      expect(f.memory.rows(entity)).toEqual([
        expect.objectContaining({ upload_pending: true, state: "deleting" }),
      ]);
      f.memory.failCommit = false;
      await expire();
      await (kind === "pdf"
        ? f.leases.collectExpired(TENANT)
        : f.assets.collectExpired(TENANT));
      expect(f.objects.size).toBe(0);
      expect(f.memory.rows(entity)).toHaveLength(1); // crashed uploader cannot clear durable uncertainty
    },
  );
  it("losing the pre-render candidate claim emits no progress and does no render or storage work", async () => {
    const queued = await f.receipts.generateReceipt(ORDER_ID, f.user);
    const update = f.db.manager.update.bind(f.db.manager);
    jest
      .spyOn(f.db.manager, "update")
      .mockImplementation(async (entity, where, patch) =>
        entity === Receipt && "progress" in patch && patch.progress === 40
          ? { affected: 0, raw: [], generatedMaps: [] }
          : update(entity, where, patch),
      );
    const render = jest.spyOn(f.renders, "render"),
      progress = jest.fn();
    expect(
      await f.artifacts.execute(
        queued.id,
        TENANT,
        queued.generation_id,
        progress,
      ),
    ).toBeNull();
    expect(progress).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(f.objects.size).toBe(0);
  });
  it.each([2, 12])(
    "enforces MAX10 after each of %i queued initial promotions; does not evict processing/failed/other tenants",
    async (count) => {
      for (let i = 0; i < 9; i++)
        await f.db.manager.save(Receipt, {
          id: randomUUID(),
          user_id: TENANT,
          status: ReceiptStatus.GENERATED,
          order_id: randomUUID(),
          number: `old-${i}`,
          created_at: new Date(i),
        });
      const foreign = await f.db.manager.save(Receipt, {
        user_id: OTHER_TENANT,
        status: ReceiptStatus.GENERATED,
      });
      const failed = await f.db.manager.save(Receipt, {
        user_id: TENANT,
        status: ReceiptStatus.FAILED,
      });
      const jobs = [];
      for (let i = 0; i < count; i++) {
        const id = randomUUID();
        await f.db.manager.save(Order, {
          ...sampleOrder(TENANT),
          id,
          recipient_id: randomUUID(),
          updated_at: new Date(),
          is_locked: false,
        });
        jobs.push(await f.receipts.generateReceipt(id, f.user));
      }
      for (const job of jobs) {
        await f.artifacts.execute(job.id, TENANT, job.generation_id);
        expect(
          f.memory
            .rows(Receipt)
            .filter((r) => r.user_id === TENANT && r.status === "generated")
            .length,
        ).toBeLessThanOrEqual(10);
      }
      expect(f.memory.rows(Receipt).some((r) => r.id === foreign.id)).toBe(
        true,
      );
      expect(f.memory.rows(Receipt).some((r) => r.id === failed.id)).toBe(true);
      const evicted = jobs.find(
        (job) => !f.memory.rows(Receipt).some((r) => r.id === job.id),
      );
      if (evicted)
        expect(
          await f.artifacts.execute(evicted.id, TENANT, evicted.generation_id),
        ).toBeNull();
    },
  );
});
describe("FIX2 outbox observed-candidate CAS", () => {
  it.each(["promoted", "new-candidate", "void", "unchanged"])(
    "preserves %s replacement during getState",
    async (outcome) => {
      const current: Row = {
        id: "receipt",
        user_id: TENANT,
        generation_id: "G",
        status: ReceiptStatus.GENERATED,
        replacement_status: "processing",
        active_revision: 1,
        pending_id: "P",
      };
      const entries = [
        {
          id: "intent",
          receipt_id: "receipt",
          user_id: TENANT,
          generation_id: "G",
        },
      ];
      const repo = {
        findOne: async () => ({ ...current }),
        update: async (where: Row, patch: Row) => {
          if (Object.entries(where).every(([k, v]) => current[k] === v)) {
            Object.assign(current, patch);
            return { affected: 1 };
          }
          return { affected: 0 };
        },
      };
      const db = {
        getRepository: (entity: unknown) =>
          entity === Receipt
            ? repo
            : { find: async () => entries, delete: async () => undefined },
      };
      const publisher = {
        queue: {
          getJob: async () => ({
            getState: async () => {
              if (outcome === "promoted")
                Object.assign(current, {
                  active_revision: 2,
                  replacement_status: null,
                  pending_id: null,
                });
              if (outcome === "new-candidate") current.pending_id = "P2";
              if (outcome === "void") current.status = ReceiptStatus.VOID;
              return "completed";
            },
          }),
        },
        close: () => undefined,
      };
      const service = new ReceiptOutboxService(
        db as never,
        (() => publisher) as never,
      );
      await service.dispatch();
      service.onModuleDestroy();
      expect(current.replacement_status).toBe(
        outcome === "promoted"
          ? null
          : outcome === "unchanged"
            ? "failed"
            : "processing",
      );
    },
  );
  it("backfills under FORCE RLS with a transaction-bound owner-only policy, restores it, and checks both ownership columns", async () => {
    const statements: string[] = [];
    const q = {
      isTransactionActive: true,
      query: async (sql: string) => {
        statements.push(sql);
        return [];
      },
    } as QueryRunner;
    await new DocumentConfiguration1792100000000().up(q);
    expect(
      statements.find((sql) =>
        sql.includes("CREATE TRIGGER document_settings_logo_owner"),
      ),
    ).toContain('logo_asset_id, "userId"');
    statements.length = 0;
    await new DocumentStorageLeases1792100000001().up(q);
    const policy = statements.findIndex((sql) =>
      sql.includes("CREATE POLICY document_assets_backfill"),
    );
    const backfill = statements.findIndex((sql) =>
      sql.includes("SELECT DISTINCT user_id"),
    );
    const drop = statements.findIndex((sql) =>
      sql.includes("DROP POLICY document_assets_backfill"),
    );
    expect(policy).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(policy);
    expect(drop).toBeGreaterThan(backfill);
    expect(statements[policy]).toMatch(
      /FOR SELECT TO CURRENT_USER USING \(true\)/,
    );
    await expect(
      new DocumentStorageLeases1792100000001().up({
        isTransactionActive: false,
      } as QueryRunner),
    ).rejects.toThrow("requires a transaction");
    statements.length = 0;
    const fencing = new DocumentUploadFencing1792100000002();
    await fencing.up(q);
    for (const table of ["document_assets", "document_artifacts"]) {
      expect(
        statements.some((sql) =>
          sql.includes(`ALTER TABLE ${table} ADD COLUMN upload_pending`),
        ),
      ).toBe(true);
      expect(
        statements.some((sql) =>
          sql.includes(
            `DROP POLICY upload_fencing_backfill_select ON ${table}`,
          ),
        ),
      ).toBe(true);
    }
    await expect(
      fencing.up({ isTransactionActive: false } as QueryRunner),
    ).rejects.toThrow("requires a transaction");
    statements.length = 0;
    await fencing.down(q);
    expect(statements).toHaveLength(2);
    expect(
      statements.every((sql) =>
        sql.includes(
          "DROP COLUMN cleanup_attempts, DROP COLUMN cleanup_token, DROP COLUMN upload_pending",
        ),
      ),
    ).toBe(true);
  });
});
