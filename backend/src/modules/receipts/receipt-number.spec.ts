import { nextReceiptNumber } from "./receipt-number";

describe("nextReceiptNumber", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-01T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("pads the account's counter and scopes the bump to that account", async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ receipt_counter: 42 }]),
    };

    expect(await nextReceiptNumber(manager as never, "user-1")).toBe(
      "2026-000042",
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"receipt_counter" + 1'),
      ["user-1"],
    );
  });

  it("fails for an unknown user and propagates database errors", async () => {
    const manager = { query: jest.fn().mockResolvedValueOnce([]) };
    await expect(nextReceiptNumber(manager as never, "ghost")).rejects.toThrow(
      "User ghost not found",
    );

    manager.query.mockRejectedValueOnce(new Error("DB error"));
    await expect(nextReceiptNumber(manager as never, "u")).rejects.toThrow(
      "DB error",
    );
  });
});
