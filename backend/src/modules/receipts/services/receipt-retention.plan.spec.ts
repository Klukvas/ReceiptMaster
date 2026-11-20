import { DataSource, EntityManager, IsNull, Not } from "typeorm";
import { PlanName } from "../../subscription/entities/user-subscription.entity";
import { UserSubscription } from "../../subscription/entities/user-subscription.entity";
import {
  DocumentType,
  Receipt,
  ReceiptStatus,
} from "../entities/receipt.entity";
import { retentionAction } from "../document-retention";
import { DocumentArtifactsService } from "./document-artifacts.service";
import { DocumentRenderService } from "./document-render.service";
import { ReceiptArtifactService } from "./receipt-artifact.service";
import { ReceiptSnapshotService } from "./receipt-snapshot.service";

const USER = "user-1";

type OldRow = {
  id: string;
  user_id: string;
  pdf_path: string;
  replacement_status: string | null;
  active_logo_asset_id: string | null;
  pending_logo_asset_id: string | null;
};

const oldRow = (id: string, overrides: Partial<OldRow> = {}): OldRow => ({
  id,
  user_id: USER,
  pdf_path: `object-storage://b/${id}.pdf`,
  replacement_status: null,
  active_logo_asset_id: null,
  pending_logo_asset_id: null,
  ...overrides,
});

function setup(
  plan: PlanName | null,
  generatedCount: number,
  oldest: OldRow[] = [oldRow("old-1")],
) {
  const manager = {
    findOne: jest.fn(
      async (entity: unknown, options: { where: { id?: string } }) => {
        if (entity === UserSubscription)
          return plan ? { user_id: USER, plan } : null;
        return oldest.find((row) => row.id === options.where.id) ?? null;
      },
    ),
    count: jest.fn().mockResolvedValue(generatedCount),
    // Like the database: never more rows than asked for.
    find: jest.fn(async (_entity: unknown, options: { take: number }) =>
      oldest.slice(0, options.take),
    ),
    update: jest.fn(),
    delete: jest.fn(),
    // Deleting a waybill re-counts what still locks its order.
    exists: jest.fn().mockResolvedValue(true),
  };
  const leases = { retire: jest.fn() };
  const snapshots = { releaseLogo: jest.fn() };
  const service = new ReceiptArtifactService(
    {} as DataSource,
    snapshots as unknown as ReceiptSnapshotService,
    {} as DocumentRenderService,
    leases as unknown as DocumentArtifactsService,
  );
  const enforce = (type: DocumentType) =>
    (
      service as unknown as {
        enforceRetention(
          manager: EntityManager,
          userId: string,
          type: DocumentType,
          promotedId: string,
        ): Promise<void>;
      }
    ).enforceRetention(manager as unknown as EntityManager, USER, type, "new");
  const receiptUpdates = () =>
    manager.update.mock.calls.filter(([entity]) => entity === Receipt);
  return { enforce, manager, leases, snapshots, receiptUpdates };
}

describe("which documents keep their record over the limit", () => {
  it.each([
    [DocumentType.INVOICE, "purge"],
    [DocumentType.ACT, "purge"],
    [DocumentType.RETURN_NOTE, "purge"],
    [DocumentType.WAYBILL, "delete"],
    [DocumentType.SALES_RECEIPT, "delete"],
    [DocumentType.PACKING_LIST, "delete"],
    [DocumentType.QUOTE, "delete"],
  ])("%s → %s", (type, action) => {
    expect(retentionAction(type)).toBe(action);
  });
});

describe("retention after a document is promoted", () => {
  it("strips the oldest invoice over the free limit of its file, frozen HTML, logo and link, and keeps the row", async () => {
    const { enforce, manager, leases, snapshots, receiptUpdates } = setup(
      "free",
      11,
      [oldRow("old-1", { active_logo_asset_id: "logo-1" })],
    );

    await enforce(DocumentType.INVOICE);

    expect(manager.count).toHaveBeenCalledWith(Receipt, {
      where: {
        user_id: USER,
        status: ReceiptStatus.GENERATED,
        document_type: DocumentType.INVOICE,
        content_purged_at: IsNull(),
      },
    });
    expect(manager.find).toHaveBeenCalledWith(
      Receipt,
      expect.objectContaining({
        where: expect.objectContaining({ id: Not("new") }),
        order: { created_at: "ASC", id: "ASC" },
      }),
    );
    expect(leases.retire).toHaveBeenCalledWith(
      USER,
      "object-storage://b/old-1.pdf",
      manager,
    );
    expect(snapshots.releaseLogo).toHaveBeenCalledWith(USER, "logo-1", manager);
    expect(receiptUpdates()).toEqual([
      [
        Receipt,
        { id: "old-1", user_id: USER, status: ReceiptStatus.GENERATED },
        {
          content_purged_at: expect.any(Date),
          pdf_path: null,
          pdf_url: null,
          public_token: null,
          html_snapshot: null,
          active_logo_asset_id: null,
          replacement_status: null,
          replacement_error: null,
          pending_id: null,
          pending_snapshot: null,
          pending_html: null,
          pending_logo_asset_id: null,
          pending_expected_revision: null,
        },
      ],
    ]);
    // The row keeps the invoice's number and its one-per-order slot.
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it("retires one document per promotion however far the account is over the limit", async () => {
    const invoices = setup("free", 60, [oldRow("old-1"), oldRow("old-2")]);
    await invoices.enforce(DocumentType.INVOICE);
    expect(invoices.receiptUpdates()).toHaveLength(1);

    const waybills = setup("free", 500, [oldRow("old-1"), oldRow("old-2")]);
    await waybills.enforce(DocumentType.WAYBILL);
    expect(waybills.manager.find).toHaveBeenCalledWith(
      Receipt,
      expect.objectContaining({ take: 1 }),
    );
    expect(waybills.manager.delete).toHaveBeenCalledTimes(1);
  });

  it("leaves an invoice that is being replaced alone and takes the next oldest", async () => {
    const { enforce, receiptUpdates, leases } = setup("free", 12, [
      oldRow("old-1", { replacement_status: "processing" }),
      oldRow("old-2"),
    ]);

    await enforce(DocumentType.INVOICE);

    expect(receiptUpdates().map(([, where]) => where.id)).toEqual(["old-2"]);
    expect(leases.retire).toHaveBeenCalledTimes(1);
  });

  it("purges nothing when every candidate is being replaced", async () => {
    const { enforce, receiptUpdates } = setup("free", 11, [
      oldRow("old-1", { replacement_status: "processing" }),
    ]);

    await enforce(DocumentType.INVOICE);

    expect(receiptUpdates()).toEqual([]);
  });

  it("deletes the oldest waybill over the limit, as before", async () => {
    const { enforce, manager, receiptUpdates } = setup("free", 11);

    await enforce(DocumentType.WAYBILL);

    expect(manager.delete).toHaveBeenCalledWith(Receipt, {
      id: "old-1",
      user_id: USER,
      status: ReceiptStatus.GENERATED,
    });
    expect(receiptUpdates()).toEqual([]);
  });

  it.each([
    ["free", 10],
    ["pro", 100],
  ] as const)(
    "leaves everything alone at the %s limit of %i",
    async (plan, count) => {
      const { enforce, manager } = setup(plan, count);

      await enforce(DocumentType.INVOICE);
      await enforce(DocumentType.WAYBILL);

      expect(manager.find).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    },
  );

  it("uses the plan's own limit: 11 documents are fine on the 100-document plan", async () => {
    const { enforce, manager } = setup("pro", 11);

    await enforce(DocumentType.WAYBILL);

    expect(manager.delete).not.toHaveBeenCalled();
  });

  it("never counts on a plan that keeps every document", async () => {
    const { enforce, manager } = setup("business", 5000);

    await enforce(DocumentType.INVOICE);

    expect(manager.count).not.toHaveBeenCalled();
  });

  it("applies the free limit to an account without a subscription row", async () => {
    const { enforce, manager } = setup(null, 11);

    await enforce(DocumentType.WAYBILL);

    expect(manager.delete).toHaveBeenCalled();
  });
});
