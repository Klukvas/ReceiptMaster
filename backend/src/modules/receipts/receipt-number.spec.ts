import { QueryFailedError } from "typeorm";
import { DocumentType } from "./entities/receipt.entity";
import { MAX_COUNTER_VALUE } from "./receipt-number-sql";
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
  reset_every_year: false,
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
    [{ prefix: "INV", padding: 4, includeYear: false }, 7, "INV-0007"],
    [{ prefix: "", padding: 1, includeYear: false }, 12, "12"],
    [{ prefix: "A ", padding: 9, includeYear: true }, 5, "A 2026-000000005"],
  ])("formats %j for %d", (format, value, expected) => {
    expect(formatDocumentNumber(format, value, 2026)).toBe(expected);
  });

  it.each([
    ["КП", "КП-2026-000001"],
    ["INV", "INV-2026-000001"],
    ["КП-", "КП-2026-000001"],
    ["A.", "A.2026-000001"],
    ["A_", "A_2026-000001"],
    ["A ", "A 2026-000001"],
    ["", "2026-000001"],
  ])(
    "separates the prefix %j from the rest only when it ends in a letter",
    (prefix, expected) => {
      expect(
        formatDocumentNumber(
          { prefix, padding: 6, includeYear: true },
          1,
          2026,
        ),
      ).toBe(expected);
    },
  );

  it("separates a letter prefix from a number without the year too", () => {
    expect(
      formatDocumentNumber(
        { prefix: "КП", padding: 3, includeYear: false },
        7,
        2026,
      ),
    ).toBe("КП-007");
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
      ["user-1", DocumentType.INVOICE, 2026],
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
    expect(manager.query.mock.calls[0][0]).toContain('"reset_every_year"');
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

describe("counter ceiling", () => {
  it("refuses a draw past the integer maximum with 409 instead of a database error", async () => {
    const overflow = new QueryFailedError("WITH base AS ...", [], {
      code: "22003",
    } as unknown as Error);
    const manager = { query: jest.fn().mockRejectedValue(overflow) };

    await expect(
      nextDocumentNumber(manager as never, "u", DocumentType.INVOICE, {
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "DOCUMENT_NUMBERS_EXHAUSTED",
    });
  });

  it("passes any other draw failure through", async () => {
    const manager = { query: jest.fn().mockRejectedValue(new Error("down")) };

    await expect(
      nextDocumentNumber(manager as never, "u", DocumentType.INVOICE, {
        timeZone: "UTC",
      }),
    ).rejects.toThrow("down");
  });

  it("never raises a counter to the integer maximum, so the next draw still fits", async () => {
    const calls: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        if (/FOR UPDATE/.test(sql))
          return [{ reset_every_year: false, start_number: 1 }];
        if (/MAX\(/.test(sql)) return [{ highest: null }];
        if (/RETURNING "value"/.test(sql)) return [{ value: 0 }];
        return [];
      }),
    };

    await raiseCounterToIssued(manager as never, "u", DocumentType.INVOICE);

    const highest = calls.find((sql) => /MAX\(/.test(sql));
    expect(highest).toContain(`<= ${MAX_COUNTER_VALUE - 1}`);
    expect(highest).not.toContain(`<= ${MAX_COUNTER_VALUE}`);
  });
});

describe("raiseCounterToIssued", () => {
  it("locks the counter row, reads the highest issued value and only raises", async () => {
    const calls: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        if (/FOR UPDATE/.test(sql))
          return [{ reset_every_year: false, start_number: 1 }];
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
        /FOR UPDATE/.test(sql)
          ? [{ reset_every_year: false, start_number: 1 }]
          : /MAX\(/.test(sql)
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

describe("yearly reset", () => {
  const draw = (rows: object[], now: string, timeZone = "UTC") => {
    const manager = { query: jest.fn().mockResolvedValue(rows) };
    return nextDocumentNumber(manager as never, "u", DocumentType.INVOICE, {
      timeZone,
      now: new Date(now),
    }).then((drawn) => ({ drawn, manager }));
  };

  it("hands the year of the draw to the statement and reports it for a release", async () => {
    const { drawn, manager } = await draw(
      [counterRow(1, { reset_every_year: true })],
      "2027-01-01T00:30:00Z",
    );
    expect(drawn).toEqual({ number: "2027-000001", value: 1, year: 2027 });
    expect(manager.query.mock.calls[0][1]).toEqual([
      "u",
      DocumentType.INVOICE,
      2027,
    ]);
  });

  it("takes the year from the document time zone at the border of the year", async () => {
    const { drawn } = await draw(
      [counterRow(1, { reset_every_year: true })],
      "2026-12-31T22:30:00Z",
      "Europe/Kyiv",
    );
    expect(drawn).toMatchObject({ number: "2027-000001", year: 2027 });
  });

  it("does not mark a number from the flat counter with a year", async () => {
    const { drawn } = await draw([counterRow(5)], "2027-01-01T00:30:00Z");
    expect(drawn.year).toBeUndefined();
  });

  it("releases a yearly number from its own year's counter", async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ value: 4 }]) };
    expect(
      await releaseDocumentNumber(
        manager as never,
        "u",
        DocumentType.WAYBILL,
        5,
        2027,
      ),
    ).toBe(true);
    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toContain('"document_year_counters"');
    expect(sql).not.toContain('"receipt_counter"');
    expect(params).toEqual(["u", DocumentType.WAYBILL, 5, 2027]);
  });

  it("repairs the counter of the colliding year only", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        calls.push([sql, params]);
        if (/FOR UPDATE/.test(sql))
          return [{ reset_every_year: true, start_number: 100 }];
        if (/RAISE|document_year_counters/.test(sql)) return [{ value: 120 }];
        return [];
      }),
    };
    expect(
      await raiseCounterToIssued(
        manager as never,
        "u",
        DocumentType.INVOICE,
        2027,
      ),
    ).toBe(120);
    const raise = calls.find(([sql]) => sql.includes("year_counters"));
    expect(raise?.[1]).toEqual(["u", DocumentType.INVOICE, 2027, 100]);
    expect(calls.some(([sql]) => /UPDATE "document_counters"/.test(sql))).toBe(
      false,
    );
  });
});
