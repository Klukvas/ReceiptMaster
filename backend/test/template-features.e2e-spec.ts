import request = require("supertest");
import sharp = require("sharp");
import { randomUUID } from "crypto";
import { QueryRunner } from "typeorm";
import {
  createTemplateFixture,
  TENANT,
  OTHER_TENANT,
  ORDER_ID,
} from "./template-features-fixture";
import { DocumentPreset } from "../src/modules/settings/entities/document-preset.entity";
import {
  Receipt,
  ReceiptStatus,
} from "../src/modules/receipts/entities/receipt.entity";
import { Order } from "../src/modules/orders/entities/order.entity";
import { DocumentConfiguration1792100000000 } from "../src/config/migrations/1792100000000-DocumentConfiguration";
import {
  TEMPLATE_METADATA,
  getTemplateCapabilities,
} from "../src/modules/receipts/templates/metadata";
import {
  documentConfigSchema,
  legacyConfig,
  parseConfig,
} from "../src/modules/settings/document-config";
import {
  captureOrder,
  sampleOrder,
} from "../src/modules/receipts/services/document-render.service";
import {
  formatDocumentDate,
  formatDocumentMoney,
} from "../src/common/utils/document-formatting.util";

describe("template features: real Nest HTTP, synthetic persistence/storage (no real DB/S3)", () => {
  let f: Awaited<ReturnType<typeof createTemplateFixture>>;
  const api = () => request(f.app.getHttpServer());
  const read = () => f.documents.read(TENANT);
  const save = async (companyName: string) => {
    const v = await read();
    return f.documents.save(
      TENANT,
      {
        config: { ...v.config, company: { ...v.config.company, companyName } },
        logoAction: "keep",
      },
      v.revision,
    );
  };
  beforeEach(async () => {
    f = await createTemplateFixture();
  });
  afterEach(async () => {
    await f.close();
  });
  async function generate() {
    const receipt = await f.receipts.generateReceipt(ORDER_ID, f.user);
    await f.artifacts.execute(receipt.id, TENANT, receipt.generation_id);
    return f.snapshots.internal(receipt.id, TENANT);
  }
  it("personalized unsaved PDF preview with staged logo performs zero persistence/storage writes", async () => {
    const v = await read(),
      png = await sharp({
        create: { width: 1500, height: 10, channels: 4, background: "red" },
      })
        .png()
        .toBuffer();
    const before = structuredClone(f.memory.tables);
    const response = await api()
      .post("/api/v1/receipts/preview")
      .field(
        "payload",
        JSON.stringify({
          config: {
            ...v.config,
            company: { ...v.config.company, companyName: "UNSAVED" },
          },
          logoAction: "replace",
        }),
      )
      .attach("logo", png, { filename: "logo.png", contentType: "image/png" })
      .expect(201);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(JSON.stringify([...f.memory.tables])).toBe(
      JSON.stringify([...before]),
    );
    expect(f.memory.writes).toEqual([]);
    expect(f.objects.size).toBe(0);
  });
  it("preview tenant-checks order IDs and logo asset IDs", async () => {
    const v = await read();
    await api()
      .post("/api/v1/receipts/preview")
      .send({ config: v.config, orderId: randomUUID() })
      .expect(404);
    await api()
      .post("/api/v1/receipts/preview")
      .send({
        config: {
          ...v.config,
          logo: { ...v.config.logo, assetId: randomUUID() },
        },
      })
      .expect(404);
    expect(f.memory.writes).toEqual([]);
  });
  it.each([
    "badMime",
    "badBytes",
    "missingFile",
    "unexpectedFile",
    "unknownField",
    "unknownPart",
    "oversizedFile",
  ])("rejects malformed multipart %s before saving", async (kind) => {
    const v = await read();
    let operation = api().put("/api/v1/settings/document-config");
    const body = {
      config: v.config,
      expectedRevision: 0,
      logoAction: ["unexpectedFile", "unknownField", "unknownPart"].includes(
        kind,
      )
        ? "keep"
        : "replace",
      ...(kind === "unknownField" ? { injected: true } : {}),
    };
    operation = operation.field("payload", JSON.stringify(body));
    if (kind !== "missingFile" && kind !== "unknownField")
      operation = operation.attach(
        kind === "unknownPart" ? "unexpected" : "logo",
        kind === "oversizedFile"
          ? Buffer.alloc(5 * 1024 * 1024 + 1)
          : Buffer.from("not an image"),
        {
          filename: "logo.png",
          contentType: kind === "badMime" ? "text/html" : "image/png",
        },
      );
    const response = await operation;
    expect([400, 409, 413]).toContain(response.status);
    expect((await read()).revision).toBe(0);
    expect(f.objects.size).toBe(0);
  });
  it("unified Save stores all fields and an immutable compact logo, without base64 config", async () => {
    const v = await read(),
      png = await sharp({
        create: { width: 2000, height: 50, channels: 4, background: "red" },
      })
        .png()
        .toBuffer();
    const config = {
      ...v.config,
      company: { ...v.config.company, companyName: "New company" },
      documentLanguage: "uk",
      title: { mode: "custom", text: "Invoice" },
      footerTitle: "Footer",
      paymentTerms: "Net 60",
      templateId: "branded",
      primaryColor: "#112233",
      logo: { ...v.config.logo, size: 180, alignment: "right" },
      formatting: {
        ...v.config.formatting,
        numberLocale: "de-DE",
        timeZone: "Europe/Kyiv",
      },
    };
    const response = await api()
      .put("/api/v1/settings/document-config")
      .field(
        "payload",
        JSON.stringify({ config, expectedRevision: 0, logoAction: "replace" }),
      )
      .attach("logo", png, { filename: "new.png", contentType: "image/png" })
      .expect(200);
    expect(response.body.data.config).toMatchObject({
      ...config,
      logo: { ...config.logo, assetId: expect.any(String) },
    });
    expect(response.body.data.config.logo.assetId).toMatch(/^[a-f0-9-]+$/);
    expect(response.body.data.revision).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain("base64");
    const bytes = [...f.objects.values()][0];
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBeLessThanOrEqual(600);
    expect(bytes.length).toBeLessThanOrEqual(524288);
    expect([...f.objects.keys()][0]).toContain(`logos/${TENANT}/`);
    expect([...f.objects.keys()][0]).not.toContain("logo-");
  });
  it("DB failure after upload leaves prior config and logo intact, with a safe orphan", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const file = { buffer: png, mimetype: "image/png" } as Express.Multer.File;
    const v = await read();
    const saved = await f.documents.save(
      TENANT,
      { config: v.config, logoAction: "replace" },
      0,
      file,
    );
    const original = await f.assets.read(TENANT, saved.config.logo.assetId);
    const upload = f.logos.uploadImmutable.bind(f.logos);
    jest
      .spyOn(f.logos, "uploadImmutable")
      .mockImplementation(async (...args) => {
        const result = await upload(...args);
        f.memory.failCommit = true;
        return result;
      });
    await expect(
      f.documents.save(
        TENANT,
        {
          config: { ...saved.config, footerTitle: "must roll back" },
          logoAction: "replace",
        },
        saved.revision,
        file,
      ),
    ).rejects.toThrow("Synthetic DB");
    expect(await read()).toEqual(saved);
    expect(await f.assets.read(TENANT, saved.config.logo.assetId)).toEqual(
      original,
    );
    expect(f.objects.size).toBe(2);
  });
  it("upload failure and stale CAS leave the saved configuration unchanged", async () => {
    const saved = await save("Before");
    f.failures.upload = true;
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(
      f.documents.save(
        TENANT,
        { config: saved.config, logoAction: "replace" },
        1,
        { buffer: png, mimetype: "image/png" } as Express.Multer.File,
      ),
    ).rejects.toThrow("Synthetic logo");
    await api()
      .put("/api/v1/settings/document-config")
      .send({ config: saved.config, expectedRevision: 0 })
      .expect(409);
    expect(await read()).toEqual(saved);
  });
  it("concurrent account CAS has one winner; legacy narrow adapters preserve advanced configuration", async () => {
    const config = (await read()).config;
    const results = await Promise.allSettled([save("A"), save("B")]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const v = await read();
    await f.documents.save(
      TENANT,
      {
        config: {
          ...v.config,
          logo: { ...v.config.logo, alignment: "right" },
          formatting: { ...config.formatting, timeZone: "Europe/Kyiv" },
        },
        logoAction: "keep",
      },
      v.revision,
    );
    await api()
      .post("/api/v1/settings/footer")
      .send({ footerTitle: "Adapted", footerSubtitle: "Atomic" })
      .expect(201);
    const after = await read();
    expect(after.config.footerTitle).toBe("Adapted");
    expect(after.config.logo.alignment).toBe("right");
    expect(after.config.formatting.timeZone).toBe("Europe/Kyiv");
  });
  it("presets provide validated CRUD, isolated tenant ownership and independent defaults", async () => {
    const before = await read();
    const config = { ...before.config, footerTitle: "Preset footer" };
    const created = (
      await api()
        .post("/api/v1/settings/document-presets")
        .send({ name: "Invoice team", config })
        .expect(201)
    ).body.data;
    expect(await read()).toEqual(before);
    const listing = (
      await api().get("/api/v1/settings/document-presets").expect(200)
    ).body.data;
    expect(listing).toHaveLength(1);
    expect(listing[0].config).toBeUndefined();
    await api()
      .get(`/api/v1/settings/document-presets/${created.id}`)
      .set("x-fixture-tenant", OTHER_TENANT)
      .expect(404);
    await api()
      .put(`/api/v1/settings/document-presets/${created.id}`)
      .send({ name: "Renamed", config, expectedRevision: 1 })
      .expect(200);
    await api()
      .put(`/api/v1/settings/document-presets/${created.id}`)
      .send({ name: "Conflict", config, expectedRevision: 1 })
      .expect(409);
    await api()
      .delete(`/api/v1/settings/document-presets/${created.id}`)
      .send({ expectedRevision: 1 })
      .expect(409);
    await api()
      .delete(`/api/v1/settings/document-presets/${created.id}`)
      .send({ expectedRevision: 2 })
      .expect(200);
    expect(await read()).toEqual(before);
  });
  it("preset name/count/revision bounds and foreign logo references are enforced", async () => {
    const { config } = await read();
    await api()
      .post("/api/v1/settings/document-presets")
      .send({ config, name: " " })
      .expect(400);
    await api()
      .post("/api/v1/settings/document-presets")
      .send({ config, name: "a".repeat(81) })
      .expect(400);
    await api()
      .post("/api/v1/settings/document-presets")
      .send({ config, name: "Valid", unexpected: true })
      .expect(400);
    await api()
      .post("/api/v1/settings/document-presets")
      .send({
        config: { ...config, logo: { ...config.logo, assetId: randomUUID() } },
        name: "Foreign",
      })
      .expect(404);
    for (let i = 0; i < 20; i++)
      await api()
        .post("/api/v1/settings/document-presets")
        .send({ name: `Preset ${i}`, config })
        .expect(201);
    await api()
      .post("/api/v1/settings/document-presets")
      .send({ name: "Overflow", config })
      .expect(409);
    await api()
      .post("/api/v1/settings/document-presets")
      .send({ name: "Preset 1", config })
      .expect(409);
    expect(f.memory.rows(DocumentPreset)).toHaveLength(20);
  });
  it("creation freezes personalized HTML before outbox intent and retries ignore live settings", async () => {
    const created = await f.receipts.generateReceipt(ORDER_ID, f.user);
    const frozen = await f.snapshots.internal(created.id, TENANT);
    expect(frozen.pending_html).toContain("Saved LLC");
    const writes = f.memory.writes;
    expect(writes.indexOf("save:Receipt")).toBeLessThan(
      writes.indexOf("save:ReceiptGenerationOutbox"),
    );
    await save("LIVE CHANGED");
    f.failures.render = true;
    await expect(
      f.artifacts.execute(created.id, TENANT, created.generation_id),
    ).rejects.toThrow("Synthetic render");
    await f.artifacts.failed(created.id, TENANT, created.generation_id);
    f.failures.render = false;
    const retried = await f.receipts.generateReceipt(ORDER_ID, f.user);
    await f.artifacts.execute(retried.id, TENANT, retried.generation_id);
    const active = await f.snapshots.internal(created.id, TENANT);
    expect(active.html_snapshot).toBe(frozen.pending_html);
    expect(active.active_snapshot.config.company.companyName).toBe("Saved LLC");
    expect(active.active_revision).toBe(1);
  });
  it("empty-body regeneration reproduces frozen content; replacement keeps old PDF until promotion", async () => {
    const active = await generate();
    const oldPath = active.pdf_path;
    await save("NEW DESIGN");
    const reproduced = await f.receipts.regenerateReceiptPdf(active.id, f.user);
    expect(reproduced.status).toBe("generated");
    expect(reproduced.pdf_path).toBe(oldPath);
    await f.artifacts.execute(active.id, TENANT, reproduced.generation_id);
    expect((await f.snapshots.internal(active.id, TENANT)).html_snapshot).toBe(
      active.html_snapshot,
    );
    const current = await f.snapshots.internal(active.id, TENANT);
    const replaced = await f.receipts.regenerateReceiptPdf(active.id, f.user, {
      mode: "replace",
      expectedActiveRevision: current.active_revision,
    });
    f.failures.render = true;
    await expect(
      f.artifacts.execute(active.id, TENANT, replaced.generation_id),
    ).rejects.toThrow();
    await f.artifacts.failed(active.id, TENANT, replaced.generation_id);
    const failed = await f.snapshots.internal(active.id, TENANT);
    expect(failed.status).toBe("generated");
    expect(failed.pdf_path).toBe(current.pdf_path);
    expect(failed.replacement_status).toBe("failed");
    expect(
      f.objects.has(f.pdfs.parseObjectStoragePath(current.pdf_path).key),
    ).toBe(true);
  });
  it("delayed replacement cannot restore a revoked token or concurrent void", async () => {
    const active = await generate();
    const token = (await f.receipts.generatePublicToken(active.id, f.user))
      .token;
    const replacement = await f.receipts.regenerateReceiptPdf(
      active.id,
      f.user,
      { mode: "replace", expectedActiveRevision: 1 },
    );
    const upload = f.pdfs.uploadReceipt.bind(f.pdfs);
    f.pdfs.uploadReceipt = async (...args) => {
      const url = await upload(...args);
      await f.receipts.revokePublicToken(active.id, f.user);
      return url;
    };
    await f.artifacts.execute(active.id, TENANT, replacement.generation_id);
    expect(
      (await f.snapshots.internal(active.id, TENANT)).public_token,
    ).toBeNull();
    await expect(f.receipts.getPublicReceipt(token)).rejects.toBeDefined();
    const next = await f.receipts.regenerateReceiptPdf(active.id, f.user, {
      mode: "replace",
      expectedActiveRevision: 2,
    });
    f.pdfs.uploadReceipt = async (...args) => {
      const url = await upload(...args);
      await f.receipts.voidReceipt(active.id, f.user, "Concurrent void");
      return url;
    };
    expect(
      await f.artifacts.execute(active.id, TENANT, next.generation_id),
    ).toBeNull();
    const voided = await f.snapshots.internal(active.id, TENANT);
    expect(voided.status).toBe("void");
    expect(voided.replacement_status).toBeNull();
    expect(voided.pending_id).toBeNull();
    expect(voided.active_revision).toBe(2);
  });
  it("public metadata uses frozen visible fields; internal snapshots never enter owner JSON", async () => {
    const v = await read();
    await f.documents.save(
      TENANT,
      {
        config: {
          ...v.config,
          company: { ...v.config.company, companyPhone: "SECRET PHONE" },
          visibility: {
            ...v.config.visibility,
            companyPhone: false,
            recipientEmail: false,
          },
        },
        logoAction: "keep",
      },
      0,
    );
    const active = await generate();
    const token = (await f.receipts.generatePublicToken(active.id, f.user))
      .token;
    await save("LIVE COMPANY");
    const publicData = await f.receipts.getPublicReceipt(token);
    expect(publicData.companyInfo.companyName).toBe("Saved LLC");
    expect(publicData.companyInfo.companyPhone).toBe("");
    expect(publicData.receipt.order.recipient.email).toBeUndefined();
    const response = await api()
      .get(`/api/v1/receipts/${active.id}`)
      .expect(200);
    const text = JSON.stringify(response.body);
    for (const forbidden of [
      "snapshot",
      "SECRET PHONE",
      "pending_html",
      "document_config",
      "base64",
    ])
      expect(text).not.toContain(forbidden);
  });
  it("legacy repair requires trustworthy HTML and never invents missing history", async () => {
    const active = await generate();
    await f.db.manager.update(
      Receipt,
      { id: active.id },
      { active_snapshot: null, html_snapshot: null, active_revision: 0 },
    );
    await expect(
      f.receipts.regenerateReceiptPdf(active.id, f.user),
    ).rejects.toMatchObject({
      response: { errorCode: "RECONSTRUCTION_REQUIRED" },
    });
    expect((await f.snapshots.internal(active.id, TENANT)).pdf_path).toBe(
      active.pdf_path,
    );
    const candidate = await f.receipts.regenerateReceiptPdf(active.id, f.user, {
      mode: "replace",
      expectedActiveRevision: 0,
      confirmReconstruction: true,
    });
    expect(candidate.replacement_status).toBe("processing");
  });
  it("eviction preserves the ten receipt limit and a deleted receipt cannot be recreated by an old worker", async () => {
    const oldest = await generate();
    for (let i = 0; i < 9; i++)
      await f.db.manager.save(Receipt, {
        id: randomUUID(),
        order_id: randomUUID(),
        user_id: TENANT,
        status: ReceiptStatus.GENERATED,
        number: `old-${i}`,
      });
    const order = {
      ...sampleOrder(TENANT),
      id: randomUUID(),
      recipient_id: randomUUID(),
      updated_at: new Date(),
      is_locked: false,
    };
    await f.db.manager.save(Order, order);
    await f.receipts.generateReceipt(order.id, f.user);
    expect(f.memory.rows(Receipt)).toHaveLength(10);
    expect(
      await f.artifacts.execute(oldest.id, TENANT, oldest.generation_id),
    ).toBeNull();
    expect(f.memory.rows(Receipt)).toHaveLength(10);
  });
});

describe("template capability projection, formatting, and migration contracts", () => {
  it.each(Object.keys(TEMPLATE_METADATA))(
    "%s exposes capabilities matching real HTML and retains unsupported draft values",
    async (id) => {
      const f = await createTemplateFixture();
      try {
        const config = {
          ...legacyConfig(null),
          templateId: id,
          primaryColor: "#123456",
          paymentTerms: "UNIQUE PAYMENT",
          company: {
            ...legacyConfig(null).company,
            companyEmail: "unique@example.com",
            companyTaxId: "UNIQUE TAX",
          },
        };
        expect(parseConfig(documentConfigSchema, config)).toEqual(config);
        const { html, snapshot } = await f.renders.prepare(
          TENANT,
          config,
          captureOrder(sampleOrder(TENANT)),
          "TEST",
        );
        const caps = getTemplateCapabilities(id);
        expect(html.includes("UNIQUE PAYMENT")).toBe(caps.terms);
        expect(html.includes("UNIQUE TAX")).toBe(
          caps.companyFields.includes("companyTaxId"),
        );
        expect(snapshot.config.paymentTerms).toBe("UNIQUE PAYMENT");
        if (!caps.money)
          expect(snapshot.publicProjection.order.total_cents).toBeUndefined();
      } finally {
        await f.close();
      }
    },
  );
  it.each([0, 1, 10, 105, 1005, 1999999999, -1])(
    "formats %i cents without conversion or rounding drift",
    (cents) => {
      const f = {
        ...legacyConfig(null).formatting,
        numberLocale: "en-US" as const,
        currencyDisplay: "code" as const,
      };
      expect(formatDocumentMoney(cents, "UAH", f)).toContain(
        (Math.abs(cents) / 100).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
    },
  );
  it("freezes IANA timezone and handles DST boundaries independently of document language", () => {
    const f = {
      ...legacyConfig(null).formatting,
      dateLocale: "en-GB" as const,
      dateStyle: "short" as const,
      timeZone: "Europe/Kyiv",
      timeStyle: "short" as const,
      hourCycle: "h23" as const,
    };
    expect(formatDocumentDate("2026-03-29T00:59:00Z", "ru", f)).toContain(
      "02:59",
    );
    expect(formatDocumentDate("2026-03-29T01:00:00Z", "uk", f)).toContain(
      "04:00",
    );
    expect(formatDocumentDate("2026-10-25T00:30:00Z", "en", f)).toContain(
      "03:30",
    );
    expect(formatDocumentDate("2026-10-25T01:30:00Z", "uk", f)).toContain(
      "03:30",
    );
  });
  it.each([
    { timeZone: "Not/AZone" },
    { numberLocale: "invalid" },
    { currencyDisplay: "name" },
    { dateStyle: "full" },
    { hourCycle: "h24" },
    { timeZone: "+03:00" },
  ])("rejects invalid Intl preferences %j", (override) => {
    const config = legacyConfig(null);
    expect(
      documentConfigSchema.safeParse({
        ...config,
        formatting: { ...config.formatting, ...override },
      }).success,
    ).toBe(false);
  });
  it("migration adds bounded tenant assets/presets with explicit RLS USING and WITH CHECK, without unrelated settings RLS", async () => {
    const sql: string[] = [];
    const runner = {
      query: async (value: string) => {
        sql.push(value);
      },
    } as QueryRunner;
    await new DocumentConfiguration1792100000000().up(runner);
    expect(sql.filter((value) => value.includes("CREATE POLICY"))).toHaveLength(
      2,
    );
    for (const value of sql.filter((value) =>
      value.includes("CREATE POLICY"),
    )) {
      expect(value).toContain("USING");
      expect(value).toContain("WITH CHECK");
    }
    expect(sql.join("\n")).toContain("FOREIGN KEY(logo_asset_id,user_id)");
    expect(sql.join("\n")).not.toContain(
      "ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY",
    );
  });
});
