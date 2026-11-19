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

function setup(plan: PlanName | null, generatedCount: number) {
  const oldest = [
    { id: "old-1", user_id: USER, pdf_path: "object-storage://b/old-1.pdf" },
  ];
  const manager = {
    findOne: jest.fn(
      async (entity: unknown, options: { where: { id?: string } }) => {
        if (entity === UserSubscription)
          return plan ? { user_id: USER, plan } : null;
        return oldest.find((row) => row.id === options.where.id) ?? null;
      },
    ),
    count: jest.fn().mockResolvedValue(generatedCount),
    find: jest.fn().mockResolvedValue(oldest),
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
  return { enforce, manager, leases };
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
  it("removes only the file and the public link of the oldest invoice over the free limit", async () => {
    const { enforce, manager, leases } = setup("free", 11);

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
        take: 1,
      }),
    );
    expect(leases.retire).toHaveBeenCalledWith(
      USER,
      "object-storage://b/old-1.pdf",
      manager,
    );
    expect(manager.update).toHaveBeenCalledWith(
      Receipt,
      { id: "old-1", user_id: USER, status: ReceiptStatus.GENERATED },
      {
        content_purged_at: expect.any(Date),
        pdf_path: null,
        pdf_url: null,
        public_token: null,
      },
    );
    // The row keeps the invoice's number and its one-per-order slot.
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it("deletes the oldest waybill over the limit, as before", async () => {
    const { enforce, manager } = setup("free", 11);

    await enforce(DocumentType.WAYBILL);

    expect(manager.delete).toHaveBeenCalledWith(Receipt, {
      id: "old-1",
      user_id: USER,
      status: ReceiptStatus.GENERATED,
    });
    expect(manager.update).not.toHaveBeenCalledWith(
      Receipt,
      expect.anything(),
      expect.anything(),
    );
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
