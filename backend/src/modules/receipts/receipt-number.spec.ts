import { DocumentType } from "./entities/receipt.entity";
import { nextDocumentNumber } from "./receipt-number";

describe("nextDocumentNumber", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-01T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("pads the counter and scopes the bump to the account and type", async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ value: 42 }]) };

    expect(
      await nextDocumentNumber(
        manager as never,
        "user-1",
        DocumentType.INVOICE,
      ),
    ).toBe("2026-000042");
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("user_id", "document_type")'),
      ["user-1", DocumentType.INVOICE],
    );
  });

  it("keeps the legacy users counter in step for waybills only", async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ value: 1 }]) };

    await nextDocumentNumber(manager as never, "u", DocumentType.WAYBILL);
    await nextDocumentNumber(manager as never, "u", DocumentType.ACT);

    expect(manager.query.mock.calls[0][0]).toContain('"receipt_counter"');
    expect(manager.query.mock.calls[1][0]).not.toContain('"receipt_counter"');
  });

  it("fails when nothing was bumped and propagates database errors", async () => {
    const manager = { query: jest.fn().mockResolvedValueOnce([]) };
    await expect(
      nextDocumentNumber(manager as never, "ghost", DocumentType.WAYBILL),
    ).rejects.toThrow("Could not bump the waybill counter for user ghost");

    manager.query.mockRejectedValueOnce(new Error("DB error"));
    await expect(
      nextDocumentNumber(manager as never, "u", DocumentType.WAYBILL),
    ).rejects.toThrow("DB error");
  });
});
