import {
  ACT_COMPLETION_TEXT_MAX_LENGTH,
  actDetailsSchema,
  documentGenerationSchema,
  documentTypeProbe,
  invoiceDetailsSchema,
  isRealCalendarDate,
} from "./document-schemas";

describe("isRealCalendarDate", () => {
  it.each(["2026-02-28", "2028-02-29", "2026-12-31"])("accepts %s", (v) =>
    expect(isRealCalendarDate(v)).toBe(true),
  );
  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-1-1",
    "26-01-01",
    "",
  ])("rejects %p", (v) => expect(isRealCalendarDate(v)).toBe(false));
});

describe("invoiceDetailsSchema", () => {
  it("accepts a due date or a term in days", () => {
    expect(
      invoiceDetailsSchema.safeParse({ dueDate: "2026-11-30" }).success,
    ).toBe(true);
    expect(
      invoiceDetailsSchema.safeParse({ paymentTermDays: 14 }).success,
    ).toBe(true);
    expect(invoiceDetailsSchema.safeParse({}).success).toBe(true);
  });
  it.each([
    [{ dueDate: "2026-11-30", paymentTermDays: 5 }],
    [{ dueDate: "2026-02-30" }],
    [{ paymentTermDays: 0 }],
    [{ paymentTermDays: 366 }],
    [{ paymentTermDays: 1.5 }],
    [{ unknown: 1 }],
  ])("rejects %j", (value) =>
    expect(invoiceDetailsSchema.safeParse(value).success).toBe(false),
  );
});

describe("actDetailsSchema", () => {
  it("accepts a trimmed contract reference and an ordered period", () => {
    const parsed = actDetailsSchema.parse({
      contractRef: "  Договір №5  ",
      period: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(parsed.contractRef).toBe("Договір №5");
  });
  it("trims the completion text and accepts 1 to 300 characters", () => {
    expect(
      actDetailsSchema.parse({ completionText: "  Прийнято без зауважень.  " })
        .completionText,
    ).toBe("Прийнято без зауважень.");
    expect(
      actDetailsSchema.safeParse({
        completionText: "x".repeat(ACT_COMPLETION_TEXT_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(ACT_COMPLETION_TEXT_MAX_LENGTH).toBe(300);
  });
  it.each([
    [{ completionText: "" }],
    [{ completionText: "   " }],
    [{ completionText: "x".repeat(301) }],
    [{ completionText: 5 }],
  ])("rejects the completion text in %j", (value) =>
    expect(actDetailsSchema.safeParse(value).success).toBe(false),
  );
  it("accepts a one-day period", () => {
    expect(
      actDetailsSchema.safeParse({
        period: { from: "2026-10-01", to: "2026-10-01" },
      }).success,
    ).toBe(true);
  });
  it.each([
    [{ contractRef: "   " }],
    [{ contractRef: "x".repeat(201) }],
    [{ period: { from: "2026-10-31", to: "2026-10-01" } }],
    [{ period: { from: "2026-10-01", to: "2026-10-32" } }],
    [{ period: { from: "2026-10-01" } }],
    [{ extra: true }],
  ])("rejects %j", (value) =>
    expect(actDetailsSchema.safeParse(value).success).toBe(false),
  );
});

describe("documentGenerationSchema", () => {
  it("defaults details for invoice and act", () => {
    const invoice = documentGenerationSchema.parse({ type: "invoice" });
    const act = documentGenerationSchema.parse({ type: "act" });
    expect("details" in invoice && invoice.details).toEqual({});
    expect("details" in act && act.details).toEqual({});
    expect(invoice.logoAction).toBe("keep");
  });
  it("takes no details for a waybill", () => {
    expect(
      documentGenerationSchema.safeParse({ type: "waybill", details: {} })
        .success,
    ).toBe(false);
  });
  it("keeps the config-or-preset rule", () => {
    const result = documentGenerationSchema.safeParse({
      type: "invoice",
      presetId: "5b0a2d5e-5a0f-4bb7-9a62-6f6c1c2e4d11",
      config: {},
    });
    expect(result.success).toBe(false);
  });
  it("applies the rule on its own too", () => {
    const result = documentGenerationSchema.safeParse({
      type: "act",
      config: undefined,
      presetId: "5b0a2d5e-5a0f-4bb7-9a62-6f6c1c2e4d11",
    });
    expect(result.success).toBe(true);
  });
  it("rejects unknown keys and unknown types", () => {
    expect(
      documentGenerationSchema.safeParse({ type: "invoice", x: 1 }).success,
    ).toBe(false);
    expect(
      documentGenerationSchema.safeParse({ type: "contract" }).success,
    ).toBe(false);
  });

  describe("return_note", () => {
    const itemId = "5b0a2d5e-5a0f-4bb7-9a62-6f6c1c2e4d11";
    const otherId = "6c1b3e6f-6b1a-4cc8-8b73-7a7d2d3f5e22";
    const parse = (details?: unknown) =>
      documentGenerationSchema.safeParse({ type: "return_note", details });

    it("requires details: there is no default", () => {
      expect(
        documentGenerationSchema.safeParse({ type: "return_note" }).success,
      ).toBe(false);
    });

    it("accepts lines and a trimmed reason", () => {
      const result = parse({
        lines: [
          { orderItemId: itemId, qty: 2 },
          { orderItemId: otherId, qty: 1 },
        ],
        reason: "  Брак  ",
      });
      expect(result.success).toBe(true);
      expect(
        result.success && "details" in result.data && result.data.details,
      ).toEqual({
        lines: [
          { orderItemId: itemId, qty: 2 },
          { orderItemId: otherId, qty: 1 },
        ],
        reason: "Брак",
      });
    });

    it("accepts a reason of exactly 300 characters and 200 lines", () => {
      expect(
        parse({
          lines: [{ orderItemId: itemId, qty: 1 }],
          reason: "x".repeat(300),
        }).success,
      ).toBe(true);
      const lines = Array.from({ length: 200 }, (_, index) => ({
        orderItemId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        qty: 1,
      }));
      expect(parse({ lines }).success).toBe(true);
    });

    it.each([
      ["no lines", { lines: [] }],
      ["a missing lines key", { reason: "x" }],
      ["a zero quantity", { lines: [{ orderItemId: itemId, qty: 0 }] }],
      ["a fractional quantity", { lines: [{ orderItemId: itemId, qty: 1.5 }] }],
      ["a string quantity", { lines: [{ orderItemId: itemId, qty: "1" }] }],
      ["a non-uuid id", { lines: [{ orderItemId: "item-1", qty: 1 }] }],
      [
        "a repeated line",
        {
          lines: [
            { orderItemId: itemId, qty: 1 },
            { orderItemId: itemId, qty: 1 },
          ],
        },
      ],
      [
        "an empty reason",
        { lines: [{ orderItemId: itemId, qty: 1 }], reason: "  " },
      ],
      [
        "a reason over 300 characters",
        { lines: [{ orderItemId: itemId, qty: 1 }], reason: "x".repeat(301) },
      ],
      [
        "an unknown key on a line",
        { lines: [{ orderItemId: itemId, qty: 1, price: 5 }] },
      ],
      [
        "an unknown key in details",
        { lines: [{ orderItemId: itemId, qty: 1 }], dueDate: "2026-12-31" },
      ],
    ])("rejects %s", (_name, details) => {
      expect(parse(details).success).toBe(false);
    });

    it("rejects more than 200 lines", () => {
      const lines = Array.from({ length: 201 }, (_, index) => ({
        orderItemId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        qty: 1,
      }));
      expect(parse({ lines }).success).toBe(false);
    });
  });

  describe("quote", () => {
    const parse = (details?: unknown) =>
      documentGenerationSchema.safeParse({ type: "quote", details });

    it("accepts a bare request and defaults the details to empty", () => {
      const result = documentGenerationSchema.safeParse({ type: "quote" });
      expect(result.success).toBe(true);
      expect(
        result.success && "details" in result.data && result.data.details,
      ).toEqual({});
    });

    it("accepts a date and trimmed terms", () => {
      const result = parse({
        validUntil: "2026-12-31",
        paymentTerms: "  50% upfront  ",
        deliveryTerms: "Pickup",
      });
      expect(result.success).toBe(true);
      expect(
        result.success && "details" in result.data && result.data.details,
      ).toEqual({
        validUntil: "2026-12-31",
        paymentTerms: "50% upfront",
        deliveryTerms: "Pickup",
      });
    });

    it.each([
      ["a day that does not exist", { validUntil: "2026-02-30" }],
      ["a malformed date", { validUntil: "31.12.2026" }],
      ["empty payment terms", { paymentTerms: "" }],
      ["blank delivery terms", { deliveryTerms: "   " }],
      ["too long terms", { paymentTerms: "x".repeat(301) }],
      ["an invoice key", { paymentTermDays: 5 }],
      ["a due date", { dueDate: "2026-12-31" }],
    ])("rejects %s", (_name, details) => {
      expect(parse(details).success).toBe(false);
    });

    it("accepts terms of exactly 300 characters", () => {
      expect(parse({ paymentTerms: "x".repeat(300) }).success).toBe(true);
    });
  });
});

describe("documentTypeProbe", () => {
  it("knows every document type and nothing else", () => {
    expect(documentTypeProbe.safeParse({ type: "quote" }).success).toBe(true);
    expect(documentTypeProbe.safeParse({ type: "receipt" }).success).toBe(
      false,
    );
    expect(documentTypeProbe.safeParse({}).success).toBe(false);
  });
});
