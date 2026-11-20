import { DataSource } from "typeorm";
import { UserSubscription } from "../subscription/entities/user-subscription.entity";
import { DocumentNumberingService } from "./document-numbering.service";
import { DocumentType } from "./entities/receipt.entity";

// The counter arithmetic is covered against a real database (backend/test); this spec
// only pins which calls the plan gates.
describe("DocumentNumberingService plan gate", () => {
  const format = { prefix: "INV-", padding: 4, includeYear: false };
  const counterRow = {
    value: 0,
    reset_every_year: false,
    start_number: 1,
    receipt_counter: 0,
  };

  const makeService = (subscription: { plan: string } | null) => {
    const manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === UserSubscription ? subscription : null),
      ),
      query: jest.fn().mockResolvedValue([counterRow]),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((run: (tx: typeof manager) => unknown) =>
        run(manager),
      ),
    };
    return {
      manager,
      service: new DocumentNumberingService(
        dataSource as unknown as DataSource,
      ),
    };
  };

  it.each([
    ["the free plan", { plan: "free" }],
    ["an account without a subscription row", null],
  ])(
    "refuses an update on %s before touching a counter",
    async (_name, row) => {
      const { service, manager } = makeService(row);

      await expect(
        service.update("user-1", DocumentType.INVOICE, format),
      ).rejects.toMatchObject({
        statusCode: 402,
        errorCode: "PLAN_FEATURE_RESTRICTED",
        details: { feature: "customNumbering" },
      });
      expect(manager.query).not.toHaveBeenCalled();
    },
  );

  it("saves the format on a plan with custom numbering", async () => {
    const { service } = makeService({ plan: "pro" });

    await expect(
      service.update("user-1", DocumentType.INVOICE, format),
    ).resolves.toMatchObject({ documentType: DocumentType.INVOICE, ...format });
  });

  it("still lists the formats on the free plan", async () => {
    const { service, manager } = makeService({ plan: "free" });

    const { types } = await service.list("user-1");

    expect(types).toHaveLength(Object.values(DocumentType).length);
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});
