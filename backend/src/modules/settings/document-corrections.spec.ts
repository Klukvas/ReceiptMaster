import request = require("supertest");
import { randomUUID } from "crypto";
import {
  createTemplateFixture,
  TENANT,
  OTHER_TENANT,
  ORDER_ID,
} from "../../../test/template-features-fixture";
import { documentConfigSchema, legacyConfig } from "./document-config";
import { UserSettings } from "./entities/user-settings.entity";
import { DocumentAsset } from "./entities/document-asset.entity";
import { DocumentPreset } from "./entities/document-preset.entity";
import { DocumentArtifact } from "../receipts/entities/document-artifact.entity";
import { Receipt, ReceiptStatus } from "../receipts/entities/receipt.entity";
import { formatDocumentDate } from "../../common/utils/document-formatting.util";
import { documentDate } from "../../../../frontend/src/lib/document-config";
import { DocumentStorageMaintenanceService } from "../receipts/services/document-storage-maintenance.service";
import { tenantStore } from "../../common/tenancy/tenant-context";
import { DocumentStorageLeases1792100000001 } from "../../config/migrations/1792100000001-DocumentStorageLeases";
import { QueryRunner } from "typeorm";

describe("title provenance and legacy date presentation", () => {
  it.each(["", " \n\t "])(
    "rejects blank custom title %j without trimming nonblank provenance",
    (text) => {
      const config = legacyConfig(null);
      expect(
        documentConfigSchema.safeParse({
          ...config,
          title: { mode: "custom", text },
        }).success,
      ).toBe(false);
      expect(
        documentConfigSchema.parse({
          ...config,
          title: { mode: "custom", text: " Invoice " },
        }).title,
      ).toEqual({ mode: "custom", text: " Invoice " });
    },
  );
  it.each(["en", "ru", "uk"] as const)(
    "matches old TemplateService.toLocaleString for %s in explicit timezones and DST",
    (language) => {
      const locale = { en: "en-US", ru: "ru-RU", uk: "uk-UA" }[language];
      const config = legacyConfig({
        templateLanguage: language,
      } as UserSettings);
      expect(config.formatting.hourCycle).toBe(
        language === "en" ? "h12" : "h23",
      );
      expect(config.formatting.dateStyle).toBe("numeric");
      for (const timeZone of ["UTC", "Europe/Kyiv"])
        for (const date of [
          "2026-03-29T00:59:00Z",
          "2026-03-29T01:00:00Z",
          "2026-10-25T00:30:00Z",
          "2026-10-25T01:30:00Z",
        ]) {
          const preferences = { ...config.formatting, timeZone };
          const old = new Date(date).toLocaleString(locale, { timeZone });
          expect(formatDocumentDate(date, language, preferences)).toBe(old);
          expect(documentDate(date, language, preferences)).toBe(old);
          expect(old).toContain("2026");
        }
      for (const dateStyle of ["short", "medium", "long"] as const) {
        const preferences = {
          ...config.formatting,
          dateStyle,
          timeZone: "Europe/Kyiv",
        };
        const date = "2026-03-29T01:00:00Z";
        const expected = new Intl.DateTimeFormat(locale, {
          dateStyle,
          timeStyle: "medium",
          timeZone: preferences.timeZone,
          hourCycle: preferences.hourCycle,
        }).format(new Date(date));
        expect(formatDocumentDate(date, language, preferences)).toBe(expected);
        expect(documentDate(date, language, preferences)).toBe(expected);
      }
    },
  );
});

describe("durable document cleanup with synthetic storage only", () => {
  let f: Awaited<ReturnType<typeof createTemplateFixture>>;
  beforeEach(async () => {
    f = await createTemplateFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  const expire = async (fixture: typeof f) => {
    for (const entity of [DocumentAsset, DocumentArtifact])
      for (const row of fixture.memory.rows(entity))
        await fixture.db.manager.update(
          entity,
          { id: row.id },
          { lease_expires_at: new Date(0) },
        );
  };
  it("rejects invalid title via HTTP, keeps saved state, and preserves literal Invoice and legacy blank reset", async () => {
    const before = await f.documents.read(TENANT);
    for (const text of ["", " \t "]) {
      const result = await request(f.app.getHttpServer())
        .put("/api/v1/settings/document-config")
        .send({
          config: { ...before.config, title: { mode: "custom", text } },
          expectedRevision: 0,
        });
      expect(result.status).toBe(400);
      expect(JSON.stringify(result.body)).toContain("Enter a title");
      expect(await f.documents.read(TENANT)).toEqual(before);
    }
    const saved = await f.documents.save(
      TENANT,
      {
        config: {
          ...before.config,
          title: { mode: "custom", text: "Invoice" },
        },
        logoAction: "keep",
      },
      0,
    );
    expect(saved.config.title).toEqual({ mode: "custom", text: "Invoice" });
    await request(f.app.getHttpServer())
      .post("/api/v1/settings/receipt-title")
      .send({ title: "  " })
      .expect(201);
    expect((await f.documents.read(TENANT)).config.title).toEqual({
      mode: "automatic",
    });
    for (const [language, titles] of [
      ["en", ["Delivery Note", "Proforma Invoice"]],
      ["ru", ["Накладная", "Проформа-инвойс"]],
      ["uk", ["Видаткова накладна", "Проформа-інвойс"]],
    ] as const)
      for (const [index, templateId] of ["delivery", "proforma"].entries()) {
        const config = {
          ...before.config,
          templateId,
          documentLanguage: language,
          title: { mode: "automatic" as const },
        };
        const preview = await f.snapshots.prepare(TENANT, ORDER_ID, "TITLE", {
          config,
          logoAction: "keep",
        });
        expect(preview.html).toContain(titles[index]);
      }
  });
  it("persists intent before failed upload and recovers it after grace", async () => {
    f.failures.upload = true;
    await expect(
      f.leases.upload(Buffer.from("%PDF"), "failed.pdf", TENANT),
    ).rejects.toThrow("upload failure");
    expect(f.memory.rows(DocumentArtifact)[0].state).toBe("uploading");
    expect(f.memory.rows(DocumentArtifact)[0].upload_pending).toBe(true);
    await expire(f);
    expect(await f.leases.collectExpired(TENANT)).toBe(1);
    // A rejected SDK promise does not fence a remote PUT. Keep a durable unresolved tombstone without consuming expired upload capacity.
    expect(f.memory.rows(DocumentArtifact)).toHaveLength(1);
    expect(f.memory.rows(DocumentArtifact)[0].state).toBe("deleting");
    expect(f.objects.size).toBe(0);
  });
  it("collects confirmed lost promotion and repair uploads; retains the active PDF", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    const upload = f.pdfs.uploadReceipt.bind(f.pdfs);
    const spy = jest
      .spyOn(f.pdfs, "uploadReceipt")
      .mockImplementation(async (...args) => {
        const url = await upload(...args);
        await f.db.manager.update(
          Receipt,
          { id: created.id },
          { generation_id: randomUUID() },
        );
        return url;
      });
    expect(
      await f.artifacts.execute(created.id, TENANT, created.generation_id),
    ).toBeNull();
    await expire(f);
    expect(await f.leases.collectExpired(TENANT)).toBe(1);
    expect(f.objects.size).toBe(0);
    spy.mockRestore();
    await f.db.manager.update(
      Receipt,
      { id: created.id },
      { generation_id: created.generation_id },
    );
    const active = await f.artifacts.execute(
      created.id,
      TENANT,
      created.generation_id,
    );
    const oldPath = active.pdf_path;
    jest.spyOn(f.pdfs, "uploadReceipt").mockImplementation(async (...args) => {
      const url = await upload(...args);
      await f.db.manager.update(
        Receipt,
        { id: created.id },
        { active_revision: active.active_revision + 1 },
      );
      return url;
    });
    await expect(f.artifacts.repair(created.id, TENANT)).rejects.toThrow(
      "changed during repair",
    );
    await expire(f);
    expect(await f.leases.collectExpired(TENANT)).toBe(1);
    expect(f.objects.has(oldPath.replace("object-storage://", ""))).toBe(true);
  });
  it("never eagerly deletes after an ambiguous promotion commit; reference checks retain the committed artifact", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    const tx = f.db.transaction.bind(f.db);
    let calls = 0;
    jest.spyOn(f.db, "transaction").mockImplementation(async (operation) => {
      const result = await tx(operation);
      if (++calls === 3) throw new Error("Ambiguous commit acknowledgment");
      return result;
    });
    await expect(
      f.artifacts.execute(created.id, TENANT, created.generation_id),
    ).rejects.toThrow("Ambiguous");
    expect(f.objects.size).toBe(1);
    await expire(f);
    expect(await f.leases.collectExpired(TENANT)).toBe(0);
    expect(f.objects.size).toBe(1);
  });
  it("retires superseded PDFs after grace and retries cleanup failures without deleting active storage", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    const active = await f.artifacts.execute(
      created.id,
      TENANT,
      created.generation_id,
    );
    const next = await f.receipts.regenerateReceiptPdf(active.id, f.user, {
      mode: "reproduce",
    });
    await f.artifacts.execute(next.id, TENANT, next.generation_id);
    expect(f.objects.size).toBe(2);
    expect(await f.leases.collectExpired(TENANT)).toBe(0);
    await expire(f);
    const deletion = jest
      .spyOn(f.pdfs, "deleteReceipt")
      .mockRejectedValueOnce(new Error("synthetic deletion failure"));
    expect(await f.leases.collectExpired(TENANT)).toBe(0);
    const deleting = f.memory
      .rows(DocumentArtifact)
      .find((r) => r.state === "deleting");
    await expect(
      f.db.transaction((m) => f.leases.attach(TENANT, String(deleting.id), m)),
    ).rejects.toThrow("unavailable");
    expect(await f.leases.collectExpired(TENANT)).toBe(0); // retry is delayed
    await expire(f);
    expect(await f.leases.collectExpired(TENANT)).toBe(1);
    expect(deletion).toHaveBeenCalledTimes(2);
    expect(f.objects.size).toBe(1);
  });
  it("protects every logo reference and tenant boundary, and retries deleting logos", async () => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    for (const id of ids)
      await f.db.manager.save(DocumentAsset, {
        id,
        user_id: TENANT,
        object_key: `logos/${TENANT}/${id}.png`,
        state: "ready",
        lease_expires_at: new Date(0),
      });
    await f.db.manager.update(
      UserSettings,
      { userId: TENANT },
      { logo_asset_id: ids[0] },
    );
    await f.db.manager.save(DocumentPreset, {
      user_id: TENANT,
      logo_asset_id: ids[1],
    });
    await f.db.manager.save(Receipt, {
      user_id: TENANT,
      active_logo_asset_id: ids[2],
      pending_logo_asset_id: ids[3],
    });
    const deletion = jest
      .spyOn(f.logos, "removeImmutable")
      .mockRejectedValueOnce(new Error("retry logo delete"));
    expect(await f.assets.collectExpired(TENANT)).toBe(0);
    await expect(
      f.db.transaction((m) => f.assets.attach(TENANT, ids[4], m)),
    ).rejects.toThrow("not available");
    expect(await f.assets.collectExpired(OTHER_TENANT)).toBe(0);
    expect(await f.assets.collectExpired(TENANT)).toBe(0);
    await expire(f);
    expect(await f.assets.collectExpired(TENANT)).toBe(1);
    expect(f.memory.rows(DocumentAsset)).toHaveLength(4);
    expect(deletion).toHaveBeenCalledTimes(2);
  });
  it("production maintenance selects bounded tenant IDs and enters their tenant context", async () => {
    const query = jest
      .spyOn(f.db.manager, "query")
      .mockResolvedValue([{ user_id: TENANT }]);
    const logos = jest
      .spyOn(f.assets, "collectExpired")
      .mockImplementation(async (id) => {
        expect(tenantStore.getStore()?.userId).toBe(id);
        return 0;
      });
    const pdfs = jest.spyOn(f.leases, "collectExpired").mockResolvedValue(0);
    await new DocumentStorageMaintenanceService(
      f.db,
      f.assets,
      f.leases,
    ).sweep();
    expect(query.mock.calls[0][0]).toContain("LIMIT 10 FOR UPDATE SKIP LOCKED");
    expect(logos).toHaveBeenCalledWith(TENANT);
    expect(pdfs).toHaveBeenCalledWith(TENANT);
  });
  it("rechecks a PDF reference committed before the cleanup lock and never deletes that object", async () => {
    const uploaded = await f.leases.upload(
      Buffer.from("%PDF"),
      "race.pdf",
      TENANT,
    );
    const row = f.memory.rows(DocumentArtifact)[0];
    jest
      .spyOn(f.db.manager, "query")
      .mockImplementation(async (sql) =>
        String(sql).includes("AS used") ? [{ used: true }] : [row],
      );
    const deletion = jest.spyOn(f.pdfs, "deleteReceipt");
    expect(await f.leases.collectExpired(TENANT)).toBe(0);
    expect(deletion).not.toHaveBeenCalled();
    await expect(
      f.db.transaction((m) => f.leases.attach(TENANT, uploaded.id, m)),
    ).resolves.toBeUndefined();
  });
  it("eviction removes pending references, schedules storage and preserves the ten-receipt bound", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    const active = await f.artifacts.execute(
      created.id,
      TENANT,
      created.generation_id,
    );
    const logoId = randomUUID();
    await f.db.manager.save(DocumentAsset, {
      id: logoId,
      user_id: TENANT,
      object_key: `logos/${TENANT}/${logoId}.png`,
      state: "ready",
      lease_expires_at: new Date(0),
    });
    await f.db.manager.update(
      Receipt,
      { id: active.id },
      {
        pending_logo_asset_id: logoId,
        pending_id: randomUUID(),
        replacement_status: "failed",
      },
    );
    for (let i = 0; i < 9; i++)
      await f.db.manager.save(Receipt, {
        user_id: TENANT,
        status: ReceiptStatus.GENERATED,
      });
    await f.db.transaction((manager) =>
      (
        f.receipts as unknown as {
          cleanupOldReceipts: (m: typeof manager, id: string) => Promise<void>;
        }
      ).cleanupOldReceipts(manager, TENANT),
    );
    expect(f.memory.rows(Receipt)).toHaveLength(9);
    expect(f.memory.rows(Receipt).some((r) => r.id === active.id)).toBe(false);
    expect(f.objects.size).toBe(1);
    expect(await f.assets.collectExpired(TENANT)).toBe(0);
    await expire(f);
    expect(await f.assets.collectExpired(TENANT)).toBe(1);
    expect(await f.leases.collectExpired(TENANT)).toBe(1);
    expect(
      await f.artifacts.execute(active.id, TENANT, created.generation_id),
    ).toBeNull();
  });
  it("additive migration creates tenant-isolated leases and only identifier/timing operational metadata", async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new DocumentStorageLeases1792100000001().up({
      query,
      isTransactionActive: true,
    } as unknown as QueryRunner);
    const sql = query.mock.calls.flat().join("\n");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("WITH CHECK");
    expect(sql).toContain(
      "document_storage_sweeps(user_id uuid PRIMARY KEY,next_sweep_at timestamptz NOT NULL)",
    );
  });
});
