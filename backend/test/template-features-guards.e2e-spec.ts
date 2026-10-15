import { DataSource } from "typeorm";
import { join } from "path";
import request = require("supertest");
import sharp = require("sharp");
import { randomUUID } from "crypto";
import {
  createTemplateFixture,
  TENANT,
  ORDER_ID,
} from "./template-features-fixture";
import { Order } from "../src/modules/orders/entities/order.entity";
import { Receipt } from "../src/modules/receipts/entities/receipt.entity";
import { DocumentAsset } from "../src/modules/settings/entities/document-asset.entity";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { legacyConfig } from "../src/modules/settings/document-config";
import {
  captureOrder,
  sampleOrder,
} from "../src/modules/receipts/services/document-render.service";
import {
  TEMPLATE_METADATA,
  getTemplateCapabilities,
} from "../src/modules/receipts/templates/metadata";

describe("document guards and retention (synthetic DB/storage)", () => {
  let f: Awaited<ReturnType<typeof createTemplateFixture>>;
  beforeEach(async () => {
    f = await createTemplateFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  it("revalidates both authoritative configuration and order after external preparation", async () => {
    const prepared = await f.snapshots.prepare(TENANT, ORDER_ID, "TEST", {
      logoAction: "keep",
    });
    await f.db.manager.update(Order, { id: ORDER_ID }, { total_cents: 2 });
    await expect(
      f.db.transaction((manager) =>
        f.snapshots.validatePrepared(TENANT, ORDER_ID, prepared, manager),
      ),
    ).rejects.toThrow("Order changed");
    await f.db.manager.update(Order, { id: ORDER_ID }, { total_cents: 205050 });
    const v = await f.documents.read(TENANT);
    await f.documents.save(TENANT, { config: v.config, logoAction: "keep" }, 0);
    await expect(
      f.db.transaction((manager) =>
        f.snapshots.validatePrepared(TENANT, ORDER_ID, prepared, manager),
      ),
    ).rejects.toThrow("Defaults changed");
  });
  it("checks effective template entitlement on Save, preview and document selection without creating account state", async () => {
    await f.db.manager.update(
      UserSubscription,
      { user_id: TENANT },
      { plan: "free" },
    );
    const v = await f.documents.read(TENANT),
      config = { ...v.config, templateId: "branded" };
    const api = request(f.app.getHttpServer());
    await api
      .put("/api/v1/settings/document-config")
      .send({ config, expectedRevision: 0 })
      .expect(402);
    await api.post("/api/v1/receipts/preview").send({ config }).expect(402);
    await api
      .post(`/api/v1/receipts/orders/${ORDER_ID}/receipt`)
      .send({ config })
      .expect(402);
    expect((await f.documents.read(TENANT)).revision).toBe(0);
    expect(f.memory.rows(Receipt)).toHaveLength(0);
  });
  it("new read contracts reject unknown parameters and malformed UUIDs", async () => {
    const api = request(f.app.getHttpServer());
    await api.get("/api/v1/settings/document-config?unexpected=1").expect(400);
    await api.get("/api/v1/settings/document-presets?unexpected=1").expect(400);
    await api.get("/api/v1/settings/document-presets/not-a-uuid").expect(400);
    expect(f.memory.writes).toEqual([]);
  });
  it("rejects an oversized complete request before multipart buffering or persistence", async () => {
    await request(f.app.getHttpServer())
      .post("/api/v1/receipts/preview")
      .set("Content-Type", "multipart/form-data; boundary=fixture")
      .set("Content-Length", String(6 * 1024 * 1024 + 1))
      .send("")
      .expect(413);
    expect(f.memory.writes).toEqual([]);
    expect(f.objects.size).toBe(0);
  });
  it("real TypeORM SQL excludes private snapshots and assets from receipt and nested order reads", async () => {
    const source = new DataSource({
      type: "postgres",
      entities: [join(__dirname, "../src/**/*.entity.ts")],
    });
    await (
      source as unknown as { buildMetadatas: () => Promise<void> }
    ).buildMetadatas();
    const receiptSql = source
      .getRepository(Receipt)
      .createQueryBuilder("r")
      .getSql();
    const orderSql = source
      .getRepository(Order)
      .createQueryBuilder("o")
      .leftJoinAndSelect("o.receipts", "r")
      .getSql();
    for (const column of [
      "html_snapshot",
      "active_snapshot",
      "pending_snapshot",
      "pending_html",
      "pending_id",
      "pending_expected_revision",
      "active_logo_asset_id",
      "pending_logo_asset_id",
    ]) {
      expect(receiptSql).not.toContain(`"${column}"`);
      expect(orderSql).not.toContain(`"${column}"`);
    }
    expect(receiptSql).toContain('"active_revision"');
  });
  it("legacy fixed-key preview reads only; an authorized Save copies it to an immutable tenant key", async () => {
    const logo = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    f.objects.set(`logos/logo-${TENANT}.png`, logo);
    const v = await f.documents.read(TENANT);
    await f.assets.preview(TENANT, { config: v.config, logoAction: "keep" });
    expect(f.memory.writes).toEqual([]);
    expect(f.objects.size).toBe(1);
    const saved = await f.documents.save(
      TENANT,
      { config: v.config, logoAction: "keep" },
      0,
    );
    expect(saved.config.logo.assetId).toBeTruthy();
    expect(f.objects.size).toBe(2);
    await f.documents.save(
      TENANT,
      { config: saved.config, logoAction: "remove" },
      1,
    );
    expect(
      await f.assets.preview(TENANT, {
        config: (await f.documents.read(TENANT)).config,
        logoAction: "keep",
      }),
    ).toBeUndefined();
    expect(f.objects.size).toBe(2);
  });
  it("a preset with an explicit empty logo does not inherit a legacy account logo", async () => {
    const config = legacyConfig(null);
    const preset = await f.documents.savePreset(TENANT, {
      name: "No logo",
      config,
      logoAction: "remove",
    });
    f.objects.set(
      `logos/logo-${TENANT}.png`,
      await sharp({
        create: { width: 10, height: 10, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
    );
    const prepared = await f.snapshots.prepare(TENANT, ORDER_ID, "TEST", {
      presetId: preset.id,
      presetRevision: preset.revision,
      logoAction: "keep",
    });
    expect(prepared.snapshot.config.logo.assetId).toBeNull();
    expect(prepared.html).not.toContain("data:image/png");
  });
  it("an explicit configuration on failed generation replaces its frozen design while a default retry reproduces", async () => {
    const first = await f.receipts.generateReceipt(ORDER_ID, f.user);
    await f.artifacts.failed(first.id, TENANT, first.generation_id);
    const defaults = await f.documents.read(TENANT);
    const custom = { ...defaults.config, footerTitle: "Explicit retry design" };
    const replacement = await f.receipts.generateReceipt(ORDER_ID, f.user, {
      config: custom,
      logoAction: "keep",
    });
    const frozen = await f.snapshots.internal(replacement.id, TENANT);
    expect(frozen.pending_snapshot.config.footerTitle).toBe(
      "Explicit retry design",
    );
    expect((await f.documents.read(TENANT)).config.footerTitle).toBe(
      defaults.config.footerTitle,
    );
  });
  it("asset cleanup rechecks references after claiming a lock and never deletes a newly referenced asset", async () => {
    const id = randomUUID(),
      asset = {
        id,
        user_id: TENANT,
        object_key: `logos/${TENANT}/${id}.png`,
        state: "ready" as const,
        lease_expires_at: new Date(0),
      };
    await f.db.manager.save(DocumentAsset, asset);
    const query = jest
      .spyOn(f.db.manager, "query")
      .mockImplementation(async (sql) =>
        String(sql).includes("AS used") ? [{ used: true }] : [asset],
      );
    const deletion = jest.spyOn(f.logos, "removeImmutable");
    expect(await f.assets.collectExpired(TENANT)).toBe(0);
    expect(deletion).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("deleting assets cannot be attached to a late account save", async () => {
    const id = randomUUID();
    await f.db.manager.save(DocumentAsset, {
      id,
      user_id: TENANT,
      state: "deleting",
    });
    const v = await f.documents.read(TENANT);
    await expect(
      f.documents.save(
        TENANT,
        {
          config: { ...v.config, logo: { ...v.config.logo, assetId: id } },
          logoAction: "keep",
        },
        0,
      ),
    ).rejects.toThrow("Logo asset not available");
    expect((await f.documents.read(TENANT)).revision).toBe(0);
  });
  it("frozen HTML integrity mismatch fails before PDF upload", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    await f.db.manager.update(
      Receipt,
      { id: created.id },
      { pending_html: "tampered" },
    );
    await expect(
      f.artifacts.execute(created.id, TENANT, created.generation_id),
    ).rejects.toThrow("integrity");
    expect(f.objects.size).toBe(0);
  });
  it("a cancelled order cannot receive a delayed candidate promotion", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    await f.db.manager.update(
      Order,
      { id: ORDER_ID },
      { status: "cancelled" as Order["status"] },
    );
    expect(
      await f.artifacts.execute(created.id, TENANT, created.generation_id),
    ).toBeNull();
    expect(
      (await f.snapshots.internal(created.id, TENANT)).active_revision,
    ).toBe(0);
  });
  it.each(Object.keys(TEMPLATE_METADATA))(
    "%s projects actual supported recipient contacts and accent only",
    async (templateId) => {
      const config = {
        ...legacyConfig(null),
        templateId,
        primaryColor: "#123456",
      };
      const order = {
        ...captureOrder(sampleOrder(TENANT)),
        recipient: {
          name: "Visible recipient",
          email: "recipient-only@example.com",
          phone: "UNIQUE-RECIPIENT-PHONE",
          address: "UNIQUE-RECIPIENT-ADDRESS",
        },
      };
      const prepared = await f.renders.prepare(TENANT, config, order, "TEST");
      const caps = getTemplateCapabilities(templateId);
      expect(prepared.html.includes("recipient-only@example.com")).toBe(
        caps.recipientFields.includes("recipientEmail"),
      );
      expect(prepared.html.includes("UNIQUE-RECIPIENT-PHONE")).toBe(
        caps.recipientFields.includes("recipientPhone"),
      );
      expect(prepared.html.includes("#123456")).toBe(caps.accent);
      const hidden = await f.renders.prepare(
        TENANT,
        {
          ...config,
          visibility: {
            ...config.visibility,
            recipientEmail: false,
            recipientPhone: false,
            recipientAddress: false,
          },
        },
        order,
        "TEST",
      );
      expect(hidden.html).not.toContain("UNIQUE-RECIPIENT");
      expect(JSON.stringify(hidden.snapshot.publicProjection)).not.toContain(
        "recipient-only@example.com",
      );
    },
  );
});
