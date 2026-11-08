import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import sharp = require("sharp");
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { SignoffKind } from "../src/common/services/signoff-image";
import { Order } from "../src/modules/orders/entities/order.entity";
import {
  Currency,
  Product,
} from "../src/modules/products/entities/product.entity";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { User } from "../src/modules/users/entities/user.entity";
import {
  DocumentType,
  Receipt,
} from "../src/modules/receipts/entities/receipt.entity";
import { buildDocumentServices } from "./helpers/document-services";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { openMigratedAppDatabase } from "./helpers/migrated-app-database";
import type { RestrictedAppDatabase } from "./helpers/restricted-app-database";

const KEEP = { logoAction: "keep" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const picture = (r: number, g: number, b: number, width = 300, height = 120) =>
  sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();

const upload = (buffer: Buffer): Express.Multer.File =>
  ({ buffer, mimetype: "image/png", size: buffer.length }) as never;

const dataUri = async (png: Buffer, kind: SignoffKind) => {
  // What is embedded is the normalized PNG, not the upload.
  const { normalizeSignoffImage } = await import(
    "../src/common/services/signoff-image"
  );
  const { png: stored } = await normalizeSignoffImage(png, "image/png", kind);
  return `data:image/png;base64,${stored.toString("base64")}`.replace(
    /=/g,
    "&#x3D;",
  );
};

/** Signature and stamp: storage, cleanup, ownership and what ends up in documents. */
describeIsolatedPostgres(
  "signature and stamp on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let services: ReturnType<typeof buildDocumentServices>;
    let user: User;
    let recipient: Recipient;

    beforeAll(async () => {
      db = await openMigratedAppDatabase(connection, "audit_signoff");
      services = buildDocumentServices(db.app);
    }, 60000);

    afterAll(async () => {
      await db?.close();
    });

    const newUser = async (): Promise<User> => {
      const created = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@signoff.invalid`,
        password: "fixture",
      });
      await db.admin.getRepository(UserSettings).save({
        userId: created.id,
        companyName: "ТОВ Продавець",
        companyTaxId: "12345678",
        companyIban: "UA213223130000026007233566001",
        templateLanguage: "uk",
        companyVatPayer: false,
        companySignatoryName: "Петренко П.",
        companySignatoryPosition: "Директор",
      });
      return created;
    };

    beforeEach(async () => {
      services.storage.failUploads = false;
      services.renderedHtml.length = 0;
      user = await newUser();
      recipient = await db.admin.getRepository(Recipient).save({
        name: "Іван Покупець",
        user_id: user.id,
      });
    });

    const asTenant = <T>(work: () => Promise<T>, tenant = user): Promise<T> =>
      runWithTenant(tenant.id, work);

    const replace = (kind: SignoffKind, buffer: Buffer, tenant = user) =>
      asTenant(
        () => services.signoffs.replace(tenant.id, kind, upload(buffer)),
        tenant,
      );
    const remove = (kind: SignoffKind) =>
      asTenant(() => services.signoffs.remove(user.id, kind));
    const collect = (tenant = user) =>
      asTenant(() => services.assets.collectExpired(tenant.id), tenant);
    const expire = (assetId: string) =>
      db.admin.query(
        `UPDATE document_assets SET lease_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [assetId],
      );
    const assetRow = async (assetId: string) =>
      (
        await db.admin.query(`SELECT * FROM document_assets WHERE id = $1`, [
          assetId,
        ])
      )[0];

    const confirmedOrder = async (): Promise<Order> => {
      const product = await db.admin.getRepository(Product).save(
        db.admin.getRepository(Product).create({
          name: randomUUID(),
          user_id: user.id,
          purchase_price_cents: 100,
          sale_price_cents: 500,
          quantity: 100,
          currency: Currency.UAH,
        }),
      );
      const draft = (
        await asTenant(() =>
          services.orders.create(
            {
              recipientId: recipient.id,
              items: [{ productId: product.id, qty: 1 }],
            },
            user,
          ),
        )
      ).data as Order;
      return asTenant(() => services.orders.confirm(draft.id, user));
    };

    const generate = async (
      type: DocumentType,
      order?: Order,
    ): Promise<Receipt> => {
      const target = order ?? (await confirmedOrder());
      return asTenant(() =>
        services.receipts.generateDocument(
          target.id,
          user,
          type,
          KEEP,
          type === DocumentType.INVOICE ? { paymentTermDays: 3 } : undefined,
        ),
      );
    };

    const stored = (id: string) =>
      db.admin
        .getRepository(Receipt)
        .createQueryBuilder("r")
        .addSelect([
          "r.pending_snapshot",
          "r.active_snapshot",
          "r.generation_id",
        ])
        .where("r.id = :id", { id })
        .getOneOrFail();

    const promote = async (receipt: Receipt) => {
      const row = await stored(receipt.id);
      return asTenant(() =>
        services.artifacts.execute(
          receipt.id,
          user.id,
          row.generation_id as string,
        ),
      );
    };

    describe("storing and removing", () => {
      it("stores a normalized PNG under signoffs/, with kind and owner, and points settings at it", async () => {
        const image = await replace("signature", await picture(10, 20, 200));

        const row = await assetRow(image.assetId);
        expect(row).toMatchObject({
          kind: "signature",
          user_id: user.id,
          state: "ready",
          mime: "image/png",
          object_key: `signoffs/${user.id}/${image.assetId}.png`,
        });
        expect(image).toMatchObject({ width: 300, height: 120 });
        expect(services.storage.keysFor("signoffs", user.id)).toEqual([
          `signoffs/${user.id}/${image.assetId}.png`,
        ]);
        expect(services.storage.keysFor("logos", user.id)).toEqual([]);

        const state = await asTenant(() => services.signoffs.get(user.id));
        expect(state).toEqual({ signature: image, stamp: null });
        const bytes = await asTenant(() =>
          services.signoffs.image(user.id, "signature"),
        );
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      });

      it("keeps the signature and the stamp apart", async () => {
        const signature = await replace("signature", await picture(0, 0, 200));
        const stamp = await replace(
          "stamp",
          await picture(200, 0, 0, 400, 400),
        );

        expect(signature.assetId).not.toBe(stamp.assetId);
        expect(await asTenant(() => services.signoffs.get(user.id))).toEqual({
          signature,
          stamp,
        });
        // A stamp is bounded to 600 x 600, a signature to 800 x 300.
        const big = await replace("stamp", await picture(1, 2, 3, 2000, 2000));
        expect([big.width, big.height]).toEqual([600, 600]);
      });

      it("refuses an unusable image with 400 and stores nothing", async () => {
        await expect(
          replace("signature", Buffer.from("<svg/>")),
        ).rejects.toMatchObject({
          statusCode: 400,
          errorCode: "VALIDATION_ERROR",
        });
        expect(
          await db.admin.query(
            `SELECT 1 FROM document_assets WHERE user_id = $1`,
            [user.id],
          ),
        ).toEqual([]);
        expect(services.storage.keysFor("signoffs", user.id)).toEqual([]);
      });

      it("leaves the current image in place when the upload fails", async () => {
        const current = await replace("signature", await picture(1, 1, 1));
        services.storage.failUploads = true;

        await expect(
          replace("signature", await picture(9, 9, 9)),
        ).rejects.toThrow("storage unavailable");

        expect(
          (await asTenant(() => services.signoffs.get(user.id))).signature,
        ).toEqual(current);
      });

      it("removes idempotently", async () => {
        await replace("stamp", await picture(5, 5, 5));
        await remove("stamp");
        await remove("stamp");
        await remove("signature");

        expect(await asTenant(() => services.signoffs.get(user.id))).toEqual({
          signature: null,
          stamp: null,
        });
        await expect(
          asTenant(() => services.signoffs.image(user.id, "stamp")),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe("cleanup of expired assets", () => {
      it("never deletes the active signature or stamp, even with an expired lease", async () => {
        const signature = await replace("signature", await picture(1, 2, 3));
        const stamp = await replace("stamp", await picture(3, 2, 1));
        await expire(signature.assetId);
        await expire(stamp.assetId);

        expect(await collect()).toBe(0);

        expect(await assetRow(signature.assetId)).toMatchObject({
          state: "ready",
        });
        expect(await assetRow(stamp.assetId)).toMatchObject({ state: "ready" });
        expect(services.storage.keysFor("signoffs", user.id)).toHaveLength(2);
        // Still readable afterwards.
        await asTenant(() => services.signoffs.image(user.id, "signature"));
      });

      it("deletes a removed image only after the grace period", async () => {
        const stamp = await replace("stamp", await picture(3, 2, 1));
        await remove("stamp");

        // Within the grace period: still stored, lease about a day out.
        expect(await collect()).toBe(0);
        const lease = new Date(
          (await assetRow(stamp.assetId)).lease_expires_at,
        );
        expect(lease.getTime() - Date.now()).toBeGreaterThan(DAY_MS - 60_000);
        expect(services.storage.keysFor("signoffs", user.id)).toHaveLength(1);

        await expire(stamp.assetId);
        expect(await collect()).toBe(1);

        expect(await assetRow(stamp.assetId)).toBeUndefined();
        expect(services.storage.keysFor("signoffs", user.id)).toEqual([]);
      });

      it("deletes the replaced image after the grace period and keeps the new one", async () => {
        const first = await replace("signature", await picture(1, 1, 1));
        const second = await replace("signature", await picture(2, 2, 2));
        await expire(first.assetId);
        await expire(second.assetId);

        expect(await collect()).toBe(1);

        expect(await assetRow(first.assetId)).toBeUndefined();
        expect(await assetRow(second.assetId)).toMatchObject({
          state: "ready",
        });
        expect(services.storage.keysFor("signoffs", user.id)).toEqual([
          `signoffs/${user.id}/${second.assetId}.png`,
        ]);
      });
    });

    describe("ownership and kind", () => {
      it("refuses to point settings at another account's asset", async () => {
        const stranger = await newUser();
        const foreign = await replace(
          "signature",
          await picture(7, 7, 7),
          stranger,
        );

        await expect(
          db.admin.query(
            `UPDATE user_settings SET signature_asset_id = $2 WHERE "userId" = $1`,
            [user.id, foreign.assetId],
          ),
        ).rejects.toThrow(/Invalid signature owner/);
        await expect(
          db.admin.query(
            `UPDATE user_settings SET logo_asset_id = $2 WHERE "userId" = $1`,
            [user.id, foreign.assetId],
          ),
        ).rejects.toThrow(/Invalid logo owner/);
      });

      it("refuses a signature in the stamp slot and the other way round", async () => {
        const signature = await replace("signature", await picture(1, 2, 3));
        const stamp = await replace("stamp", await picture(3, 2, 1));

        await expect(
          db.admin.query(
            `UPDATE user_settings SET stamp_asset_id = $2 WHERE "userId" = $1`,
            [user.id, signature.assetId],
          ),
        ).rejects.toThrow(/Invalid stamp owner/);
        await expect(
          db.admin.query(
            `UPDATE user_settings SET signature_asset_id = $2 WHERE "userId" = $1`,
            [user.id, stamp.assetId],
          ),
        ).rejects.toThrow(/Invalid signature owner/);
      });

      it("never lets a signature or stamp stand in for a logo", async () => {
        const signature = await replace("signature", await picture(1, 2, 3));

        await expect(
          db.admin.query(
            `UPDATE user_settings SET logo_asset_id = $2 WHERE "userId" = $1`,
            [user.id, signature.assetId],
          ),
        ).rejects.toThrow(/Invalid logo owner/);
        await expect(
          asTenant(() => services.assets.owned(user.id, signature.assetId)),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          asTenant(() => services.assets.read(user.id, signature.assetId)),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it("hides another account's images from the tenant", async () => {
        const stranger = await newUser();
        const foreign = await replace(
          "signature",
          await picture(7, 7, 7),
          stranger,
        );

        await expect(
          asTenant(() =>
            services.assets.readSignoff(user.id, foreign.assetId, "signature"),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
          await asTenant(() => services.signoffs.get(stranger.id)),
        ).toEqual({ signature: null, stamp: null });
      });
    });

    describe("documents", () => {
      it("embeds the images in an invoice and records ids and hashes in its snapshot", async () => {
        const signatureBytes = await picture(10, 20, 200);
        const stampBytes = await picture(200, 20, 10, 400, 400);
        const signature = await replace("signature", signatureBytes);
        const stamp = await replace("stamp", stampBytes);

        const invoice = await generate(DocumentType.INVOICE);
        const row = await stored(invoice.id);
        expect(invoice.warnings).toBeUndefined();

        const html = (
          await db.admin.query(
            `SELECT pending_html FROM receipts WHERE id = $1`,
            [invoice.id],
          )
        )[0].pending_html as string;
        expect(html).toContain(await dataUri(signatureBytes, "signature"));
        expect(html).toContain(await dataUri(stampBytes, "stamp"));
        expect(row.pending_snapshot?.signoff).toMatchObject({
          signatureAssetId: signature.assetId,
          stampAssetId: stamp.assetId,
        });
        expect(JSON.stringify(row.pending_snapshot)).not.toContain("base64");
        // A frozen document is not an asset reference: nothing pins the image.
        const refs = await db.admin.query(
          `SELECT 1 FROM receipts WHERE active_logo_asset_id = $1 OR pending_logo_asset_id = $1 OR active_logo_asset_id = $2 OR pending_logo_asset_id = $2`,
          [signature.assetId, stamp.assetId],
        );
        expect(refs).toEqual([]);
      });

      it("adds nothing to the snapshot or the HTML of an account without images", async () => {
        const invoice = await generate(DocumentType.INVOICE);
        const waybill = await generate(DocumentType.WAYBILL);

        for (const receipt of [invoice, waybill]) {
          const row = await stored(receipt.id);
          expect(row.pending_snapshot).not.toHaveProperty("signoff");
          const html = (
            await db.admin.query(
              `SELECT pending_html FROM receipts WHERE id = $1`,
              [receipt.id],
            )
          )[0].pending_html as string;
          expect(html).not.toContain("doc-sign-image");
          expect(html).not.toContain('class="signoff"');
        }
      });

      it("puts the signature and stamp into a waybill", async () => {
        const signature = await replace(
          "signature",
          await picture(10, 20, 200),
        );
        const waybill = await generate(DocumentType.WAYBILL);

        const row = await stored(waybill.id);
        expect(row.pending_snapshot?.signoff).toMatchObject({
          signatureAssetId: signature.assetId,
          stampAssetId: null,
        });
      });

      it("keeps a promoted document as it was when the images are replaced or removed", async () => {
        const originalSignature = await picture(10, 20, 200);
        const originalStamp = await picture(200, 20, 10, 400, 400);
        const signature = await replace("signature", originalSignature);
        const stamp = await replace("stamp", originalStamp);
        const invoice = await generate(DocumentType.INVOICE);
        await promote(invoice);
        const printedAtIssue = services.renderedHtml[
          services.renderedHtml.length - 1
        ] as string;

        const replacement = await picture(250, 250, 0);
        await replace("signature", replacement);
        await remove("stamp");
        await expire(signature.assetId);
        await expire(stamp.assetId);
        await collect();
        expect(await assetRow(signature.assetId)).toBeUndefined();

        await asTenant(() =>
          services.receipts.regenerateReceiptPdf(invoice.id, user, {
            mode: "reproduce",
          }),
        );
        const row = await stored(invoice.id);
        await asTenant(() =>
          services.artifacts.execute(
            invoice.id,
            user.id,
            row.generation_id as string,
          ),
        );

        const reprinted = services.renderedHtml[
          services.renderedHtml.length - 1
        ] as string;
        expect(reprinted).toBe(printedAtIssue);
        expect(reprinted).toContain(
          await dataUri(originalSignature, "signature"),
        );
        expect(reprinted).toContain(await dataUri(originalStamp, "stamp"));
        expect(reprinted).not.toContain(
          await dataUri(replacement, "signature"),
        );
        expect(
          (await stored(invoice.id)).active_snapshot?.signoff,
        ).toMatchObject({
          signatureAssetId: signature.assetId,
          stampAssetId: stamp.assetId,
        });
      });

      it("rebuilds a document with the current images when it is replaced", async () => {
        await replace("signature", await picture(10, 20, 200));
        const invoice = await generate(DocumentType.INVOICE);
        await promote(invoice);
        const replacement = await picture(250, 250, 0);
        const current = await replace("signature", replacement);

        const revision = (await stored(invoice.id)).active_revision;
        await asTenant(() =>
          services.receipts.regenerateReceiptPdf(invoice.id, user, {
            mode: "replace",
            expectedActiveRevision: revision,
            selection: KEEP,
          }),
        );

        const pending = (await stored(invoice.id)).pending_snapshot;
        expect(pending?.signoff).toMatchObject({
          signatureAssetId: current.assetId,
        });
      });

      it("refuses a document whose signature was removed while it was being prepared, and returns its number", async () => {
        await replace("signature", await picture(10, 20, 200));
        const order = await confirmedOrder();
        const load = services.signoffs.load.bind(services.signoffs);
        jest
          .spyOn(services.signoffs, "load")
          .mockImplementationOnce(async (userId) => {
            const loaded = await load(userId);
            await remove("signature");
            return loaded;
          });

        const failure = await generate(DocumentType.INVOICE, order).catch(
          (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(ConflictException);
        expect((failure as ConflictException).message).toMatch(
          /Defaults changed/,
        );
        expect(
          await db.admin.query(`SELECT 1 FROM receipts WHERE user_id = $1`, [
            user.id,
          ]),
        ).toEqual([]);
        expect(
          (
            await db.admin.query(
              `SELECT value FROM document_counters WHERE user_id = $1 AND document_type = 'invoice'`,
              [user.id],
            )
          )[0].value,
        ).toBe(0);
        // The next attempt carries no signature and takes number 1 again.
        const retry = await generate(DocumentType.INVOICE, order);
        expect(retry.number).toMatch(/-000001$/);
        expect((await stored(retry.id)).pending_snapshot).not.toHaveProperty(
          "signoff",
        );
      });

      it.each([
        [
          "its object is gone from storage",
          async (assetId: string) => {
            services.storage.objects.delete(
              `signoffs/${user.id}/${assetId}.png`,
            );
          },
        ],
        [
          "its object fails the checksum",
          async (assetId: string) => {
            services.storage.objects.set(
              `signoffs/${user.id}/${assetId}.png`,
              Buffer.from("tampered"),
            );
          },
        ],
        [
          "an older image's cleanup marked the asset as deleting",
          async (assetId: string) => {
            await db.admin.query(
              `UPDATE document_assets SET state = 'deleting' WHERE id = $1`,
              [assetId],
            );
          },
        ],
      ])(
        "still generates, without the image, when %s",
        async (_name, breakIt) => {
          const signature = await replace(
            "signature",
            await picture(10, 20, 200),
          );
          const stamp = await replace(
            "stamp",
            await picture(200, 20, 10, 400, 400),
          );
          await breakIt(signature.assetId);
          const warn = jest.spyOn(
            (services.signoffs as unknown as { logger: { warn: jest.Mock } })
              .logger,
            "warn",
          );

          const invoice = await generate(DocumentType.INVOICE);
          const waybill = await generate(DocumentType.WAYBILL);

          for (const receipt of [invoice, waybill]) {
            // No 409 loop: the pointer is unchanged between reading and the check.
            expect(receipt.status).toBe("processing");
            // Issued anyway, but the caller is told what is missing.
            expect(receipt.warnings).toEqual([
              {
                code: "SIGNOFF_UNAVAILABLE",
                kinds: ["signature"],
                message: expect.any(String),
              },
            ]);
            expect(
              (await stored(receipt.id)).pending_snapshot?.signoff,
            ).toMatchObject({
              signatureAssetId: null,
              stampAssetId: stamp.assetId,
            });
          }
          const html = (
            await db.admin.query(
              `SELECT pending_html FROM receipts WHERE id = $1`,
              [invoice.id],
            )
          )[0].pending_html as string;
          expect(html).not.toContain('class="doc-sign-image"');
          expect(html).toContain('class="doc-stamp"');
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
              `user ${user.id}, asset ${signature.assetId}`,
            ),
          );
          warn.mockRestore();
        },
      );

      it("keeps the images out of the public projection", async () => {
        await replace("signature", await picture(10, 20, 200));
        await replace("stamp", await picture(200, 20, 10, 400, 400));
        const invoice = await generate(DocumentType.INVOICE);
        await promote(invoice);

        const snapshot = (await stored(invoice.id)).active_snapshot;
        expect(JSON.stringify(snapshot?.publicProjection)).not.toMatch(
          /data:image|signature|stamp/i,
        );
      });

      it("ignores the images for a style without a signature block", async () => {
        await replace("signature", await picture(10, 20, 200));
        await db.admin.query(
          `UPDATE user_settings SET "templateId" = 'compact' WHERE "userId" = $1`,
          [user.id],
        );

        const waybill = await generate(DocumentType.WAYBILL);

        expect(waybill.warnings).toBeUndefined();
        expect((await stored(waybill.id)).pending_snapshot).not.toHaveProperty(
          "signoff",
        );
      });
    });

    it("does not load the signoff pointers with the settings entity", async () => {
      await replace("signature", await picture(10, 20, 200));
      const settings = await db.admin
        .getRepository(UserSettings)
        .findOneByOrFail({ userId: user.id });
      expect(settings.signature_asset_id).toBeUndefined();
      expect(settings.stamp_asset_id).toBeUndefined();
    });
  },
);
