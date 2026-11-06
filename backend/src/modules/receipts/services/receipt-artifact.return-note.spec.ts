import { DocumentType, ReceiptStatus } from "../entities/receipt.entity";
import { ReceiptArtifactService } from "./receipt-artifact.service";

const lines = [
  { orderItemId: "item-b", qty: 1 },
  { orderItemId: "item-a", qty: 2 },
];

describe("ReceiptArtifactService.failed for a return note", () => {
  const build = (receipt: Record<string, unknown>, affected = 1) => {
    const manager = {
      getRepository: () => ({
        createQueryBuilder: () => {
          const builder = {
            addSelect: () => builder,
            where: () => builder,
            getOne: async () => receipt,
          };
          return builder;
        },
      }),
      update: jest.fn().mockResolvedValue({ affected }),
      query: jest.fn().mockResolvedValue([[{ id: "x" }], 1]),
    };
    const db = {
      manager: { update: jest.fn().mockResolvedValue({ affected: 1 }) },
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const snapshots = { lookup: jest.fn().mockResolvedValue(receipt) };
    const service = new ReceiptArtifactService(
      db as never,
      snapshots as never,
      {} as never,
      {} as never,
    );
    return { service, manager, db };
  };
  const note = (overrides: Record<string, unknown> = {}) => ({
    id: "note-1",
    order_id: "order-1",
    document_type: DocumentType.RETURN_NOTE,
    status: ReceiptStatus.PROCESSING,
    generation_id: "gen-1",
    pending_id: "cand-1",
    pending_snapshot: { document: { details: { returnLines: lines } } },
    active_snapshot: null,
    ...overrides,
  });

  it("marks the note failed and releases its quantities in one transaction", async () => {
    const { service, manager, db } = build(note());
    await expect(service.failed("note-1", "u1", "gen-1")).resolves.toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: ReceiptStatus.FAILED }),
    );
    expect(manager.query.mock.calls.map(([, params]) => params[0])).toEqual([
      "item-a",
      "item-b",
    ]);
    for (const [sql] of manager.query.mock.calls)
      expect(sql).toMatch(/"returned_qty" - \$4/);
  });

  it("releases nothing when the failure no longer applies to the current generation", async () => {
    const { service, manager } = build(note(), 0);
    await expect(service.failed("note-1", "u1", "gen-1")).resolves.toBe(false);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it("leaves other documents on the plain update", async () => {
    const { service, manager, db } = build(
      note({ document_type: DocumentType.INVOICE }),
    );
    await service.failed("note-1", "u1", "gen-1");
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.manager.update).toHaveBeenCalledTimes(1);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it("also releases when the note has no candidate left to render", async () => {
    const { service, manager } = build(note({ pending_id: null }));
    await expect(service.failed("note-1", "u1", "gen-1")).resolves.toBe(true);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it("reads the lines from the active snapshot when the pending one is gone", async () => {
    const { service, manager } = build(
      note({
        pending_id: null,
        pending_snapshot: null,
        active_snapshot: { document: { details: { returnLines: lines } } },
      }),
    );
    await service.failed("note-1", "u1", "gen-1");
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it("still fails the note, and warns, when no snapshot holds the lines", async () => {
    const { service, manager } = build(
      note({ pending_snapshot: null, active_snapshot: null }),
    );
    const warn = jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        "warn",
      )
      .mockImplementation();
    await expect(service.failed("note-1", "u1", "gen-1")).resolves.toBe(true);
    expect(manager.query).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("note-1"));
  });
});
