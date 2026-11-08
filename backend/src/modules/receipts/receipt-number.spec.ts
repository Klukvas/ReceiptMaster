import { DocumentType } from "./entities/receipt.entity";
import {
  DEFAULT_NUMBER_FORMAT,
  formatDocumentNumber,
  nextDocumentNumber,
  raiseCounterToIssued,
  releaseDocumentNumber,
} from "./receipt-number";

const counterRow = (value: number, overrides: object = {}) => ({
  value,
  prefix: "",
  padding: 6,
  include_year: true,
  ...overrides,
});

describe("formatDocumentNumber", () => {
  it("prints the default format exactly as numbers have always looked", () => {
    expect(formatDocumentNumber(DEFAULT_NUMBER_FORMAT, 42, 2026)).toBe(
      "2026-000042",
    );
    expect(formatDocumentNumber(DEFAULT_NUMBER_FORMAT, 1, 2026)).toBe(
      "2026-000001",
    );
  });

  it.each([
    [{ prefix: "РФ-", padding: 6, includeYear: true }, 43, "РФ-2026-000043"],
    [{ prefix: "INV", padding: 4, includeYear: false }, 7, "INV0007"],
    [{ prefix: "", padding: 1, includeYear: false }, 12, "12"],
    [{ prefix: "A ", padding: 9, includeYear: true }, 5, "A 2026-000000005"],
  ])("formats %j for %d", (format, value, expected) => {
    expect(formatDocumentNumber(format, value, 2026)).toBe(expected);
  });

  it("does not truncate a value wider than the padding", () => {
    expect(
      formatDocumentNumber(
        { prefix: "", padding: 2, includeYear: false },
        12345,
        2026,
      ),
    ).toBe("12345");
  });

  it("never prints equal text for different values when the prefix ends in a non-digit", () => {
    const formats = [
      { prefix: "", padding: 3, includeYear: true },
      { prefix: "2026-", padding: 3, includeYear: false },
      { prefix: "A", padding: 1, includeYear: true },
      { prefix: "A2026-", padding: 6, includeYear: false },
    ];
    const seen = new Map<string, number>();
    for (const format of formats)
      for (let value = 1; value <= 1200; value++) {
        const text = formatDocumentNumber(format, value, 2026);
        expect(seen.get(text) ?? value).toBe(value);
        seen.set(text, value);
      }
  });
});

describe("nextDocumentNumber", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-01T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("pads the counter and scopes the bump to the account and type", async () => {
    const manager = { query: jest.fn().mockResolvedValue([counterRow(42)]) };

    expect(
      await nextDocumentNumber(
        manager as never,
        "user-1",
        DocumentType.INVOICE,
        { timeZone: "UTC" },
      ),
    ).toEqual({ number: "2026-000042", value: 42 });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("user_id", "document_type")'),
      ["user-1", DocumentType.INVOICE],
    );
  });

  it("prints with the format returned together with the value", async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValue([counterRow(43, { prefix: "РФ-", padding: "6" })]),
    };
    expect(
      await nextDocumentNumber(manager as never, "u", DocumentType.INVOICE, {
        timeZone: "UTC",
      }),
    ).toEqual({ number: "РФ-2026-000043", value: 43 });
    expect(manager.query.mock.calls[0][0]).toContain(
      'RETURNING "value", "prefix", "padding", "include_year"',
    );
  });

  it.each([
    ["Europe/Kyiv", "2026-12-31T22:30:00Z", 2027],
    ["UTC", "2026-12-31T22:30:00Z", 2026],
    ["Europe/Kyiv", "2026-12-31T21:30:00Z", 2026],
    ["America/New_York", "2027-01-01T03:00:00Z", 2026],
    ["Pacific/Kiritimati", "2026-12-31T10:30:00Z", 2027],
  ])(
    "prints the year of the document's own time zone (%s at %s)",
    async (timeZone, at, year) => {
      const manager = { query: jest.fn().mockResolvedValue([counterRow(1)]) };
      const { number } = await nextDocumentNumber(
        manager as never,
        "u",
        DocumentType.ACT,
        { timeZone, now: new Date(at) },
      );
      expect(number).toBe(`${year}-000001`);
    },
  );

  it("keeps the legacy users counter in step for waybills only", async () => {
    const manager = { query: jest.fn().mockResolvedValue([counterRow(1)]) };

    await nextDocumentNumber(manager as never, "u", DocumentType.WAYBILL, {
      timeZone: "UTC",
    });
    await nextDocumentNumber(manager as never, "u", DocumentType.ACT, {
      timeZone: "UTC",
    });

    expect(manager.query.mock.calls[0][0]).toContain('"receipt_counter"');
    expect(manager.query.mock.calls[1][0]).not.toContain('"receipt_counter"');
    expect(manager.query.mock.calls[0][0]).toContain(
      '"include_year" FROM bumped',
    );
  });

  it("fails when nothing was bumped and propagates database errors", async () => {
    const manager = { query: jest.fn().mockResolvedValueOnce([]) };
    await expect(
      nextDocumentNumber(manager as never, "ghost", DocumentType.WAYBILL, {
        timeZone: "UTC",
      }),
    ).rejects.toThrow("Could not bump the waybill counter for user ghost");

    manager.query.mockRejectedValueOnce(new Error("DB error"));
    await expect(
      nextDocumentNumber(manager as never, "u", DocumentType.WAYBILL, {
        timeZone: "UTC",
      }),
    ).rejects.toThrow("DB error");
  });
});

describe("releaseDocumentNumber", () => {
  it("steps the counter back by value, whatever the format", async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ value: 41 }]) };

    expect(
      await releaseDocumentNumber(
        manager as never,
        "user-1",
        DocumentType.INVOICE,
        42,
      ),
    ).toBe(true);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"value" = $3'),
      ["user-1", DocumentType.INVOICE, 42],
    );
  });

  it.each([DocumentType.INVOICE, DocumentType.WAYBILL])(
    "reads the %s result as plain rows: the UPDATE sits in a CTE, not bare",
    async (type) => {
      // A bare UPDATE ... RETURNING answers `[rows, count]` from the postgres driver, which
      // made `rows.length` always 2 and hid a refused release.
      const manager = { query: jest.fn().mockResolvedValue([]) };
      await releaseDocumentNumber(manager as never, "u", type, 3);
      expect(manager.query.mock.calls[0][0]).toMatch(/^\s*WITH /);
    },
  );

  it("leaves the gap when a later number was already handed out", async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    expect(
      await releaseDocumentNumber(manager as never, "u", DocumentType.ACT, 7),
    ).toBe(false);
  });

  it("steps the legacy counter back together with the waybill counter", async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ value: 6 }]) };
    await releaseDocumentNumber(manager as never, "u", DocumentType.WAYBILL, 7);
    expect(manager.query.mock.calls[0][0]).toContain('"receipt_counter"');
  });

  it.each([0, -1, 1.5, Number.NaN])("ignores the value %p", async (value) => {
    const manager = { query: jest.fn() };
    expect(
      await releaseDocumentNumber(
        manager as never,
        "u",
        DocumentType.ACT,
        value,
      ),
    ).toBe(false);
    expect(manager.query).not.toHaveBeenCalled();
  });
});

describe("raiseCounterToIssued", () => {
  it("locks the counter row, reads the highest issued value and only raises", async () => {
    const calls: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        if (/MAX\(/.test(sql)) return [{ highest: "57" }];
        if (/RETURNING "value"/.test(sql)) return [{ value: 57 }];
        return [];
      }),
    };

    expect(
      await raiseCounterToIssued(manager as never, "u", DocumentType.INVOICE),
    ).toBe(57);

    expect(calls.findIndex((sql) => /FOR UPDATE/.test(sql))).toBeLessThan(
      calls.findIndex((sql) => /MAX\(/.test(sql)),
    );
    expect(calls.some((sql) => /GREATEST\("value"/.test(sql))).toBe(true);
    // The raise is read back as plain rows (CTE), and reads all 10 digits of a number.
    expect(calls.find((sql) => /GREATEST\("value"/.test(sql))).toMatch(
      /^\s*WITH /,
    );
    expect(calls.find((sql) => /MAX\(/.test(sql))).toContain("{1,10}");
    expect(calls.some((sql) => /"users"/.test(sql))).toBe(false);
  });

  it("keeps the legacy waybill counter in step", async () => {
    const manager = {
      query: jest.fn(async (sql: string) =>
        /MAX\(/.test(sql)
          ? [{ highest: null }]
          : /RETURNING "value"/.test(sql)
            ? [{ value: 4 }]
            : [],
      ),
    };
    await raiseCounterToIssued(manager as never, "u", DocumentType.WAYBILL);
    expect(
      manager.query.mock.calls.some(([sql]) => /"receipt_counter"/.test(sql)),
    ).toBe(true);
  });
});
