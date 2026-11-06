import { ApiErrorResponse } from "../../common/errors/ApiError";
import { buildBuyer, buildSeller } from "./document-requisites";
import {
  addDaysToDate,
  buildFrozenDocument,
  DocumentContext,
  DocumentRequest,
  issueDateIn,
} from "./frozen-document";
import { DocumentType } from "./entities/receipt.entity";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  legacyConfig,
} from "../settings/document-config";
import type { DocumentConfig } from "../settings/document-config";

const config = {
  documentLanguage: "uk",
  formatting: { timeZone: "Europe/Kyiv" },
} as DocumentConfig;

const seller = buildSeller(
  {
    companyName: "ТОВ",
    companyTaxId: "12345678",
    companyIban: "UA213223130000026007233566001",
  } as DocumentConfig["company"],
  { companySignatoryName: "П", companySignatoryPosition: "Д" },
);

const context = (
  request: Partial<DocumentRequest> = {},
  defaultPaymentTermDays: number | null = null,
): DocumentContext => ({
  request: {
    type: DocumentType.INVOICE,
    details: {},
    ...request,
  } as DocumentRequest,
  seller,
  buyer: buildBuyer({ name: "Покупець" }),
  defaultPaymentTermDays,
});

const NOW = new Date("2026-11-02T22:30:00Z"); // already 3 Nov in Kyiv

describe("issueDateIn", () => {
  it("uses the calendar day of the document time zone", () => {
    expect(issueDateIn(NOW, "Europe/Kyiv")).toBe("2026-11-03");
    expect(issueDateIn(NOW, "UTC")).toBe("2026-11-02");
  });
});

describe("addDaysToDate", () => {
  it("crosses month and year ends", () => {
    expect(addDaysToDate("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDaysToDate("2028-02-27", 2)).toBe("2028-02-29");
  });
});

describe("buildFrozenDocument: invoice due date", () => {
  const due = (ctx: DocumentContext) =>
    buildFrozenDocument(ctx, config, NOW).details;

  it("takes an explicit date", () => {
    expect(due(context({ details: { dueDate: "2026-12-01" } }))).toEqual({
      dueDate: "2026-12-01",
      dueDateSource: "request_date",
    });
  });
  it("adds requested days to the issue date", () => {
    expect(due(context({ details: { paymentTermDays: 10 } }))).toEqual({
      dueDate: "2026-11-13",
      dueDateSource: "request_days",
    });
  });
  it("falls back to the account default, then to 5 days", () => {
    expect(due(context({}, 14))).toEqual({
      dueDate: "2026-11-17",
      dueDateSource: "settings_default",
    });
    expect(due(context())).toEqual({
      dueDate: "2026-11-08",
      dueDateSource: "fallback",
    });
  });
  it("accepts a due date equal to the issue date and rejects an earlier one", () => {
    expect(due(context({ details: { dueDate: "2026-11-03" } })).dueDate).toBe(
      "2026-11-03",
    );
    expect(() => due(context({ details: { dueDate: "2026-11-02" } }))).toThrow(
      /earlier than the issue date/,
    );
  });
  it("keeps the frozen date and details of a replacement", () => {
    const frozen = buildFrozenDocument(
      context({
        carryOver: {
          buyer: buildBuyer({ name: "Старий" }),
          issueDate: "2026-10-01",
          details: { dueDate: "2026-10-05", dueDateSource: "fallback" },
        },
      }),
      config,
      NOW,
    );
    expect(frozen.issueDate).toBe("2026-10-01");
    expect(frozen.details.dueDate).toBe("2026-10-05");
  });
});

describe("buildFrozenDocument: quote validity", () => {
  const quote = (
    details: DocumentRequest["details"] = {},
    now: Date = NOW,
    extra: Partial<DocumentRequest> = {},
  ) =>
    buildFrozenDocument(
      context({ type: DocumentType.QUOTE, details, ...extra }),
      config,
      now,
    );

  it("defaults to 14 days from the issue date in the document time zone", () => {
    // 22:30 UTC on 2 Nov is already 3 Nov in Kyiv, so the default is 17 Nov.
    expect(quote().details).toEqual({
      validUntil: "2026-11-17",
      validUntilSource: "default",
    });
  });
  it("follows the Kyiv calendar day around midnight", () => {
    const beforeMidnight = new Date("2026-11-02T21:59:00Z"); // 23:59, 2 Nov in Kyiv
    const afterMidnight = new Date("2026-11-02T22:00:00Z"); // 00:00, 3 Nov in Kyiv
    expect(quote({}, beforeMidnight).details.validUntil).toBe("2026-11-16");
    expect(quote({}, afterMidnight).details.validUntil).toBe("2026-11-17");
  });
  it("counts today in Kyiv for an account without saved formatting, whatever the server zone", () => {
    const stored = legacyConfig(null);
    expect(stored.formatting.timeZone).toBe(DEFAULT_DOCUMENT_TIME_ZONE);
    expect(DEFAULT_DOCUMENT_TIME_ZONE).toBe("Europe/Kyiv");
    // 23:30 UTC on 2 Nov is 01:30 on 3 Nov in Kyiv: a UTC "today" would give 2 Nov.
    const lateEvening = new Date("2026-11-02T23:30:00Z");
    const frozen = buildFrozenDocument(
      context({ type: DocumentType.QUOTE, details: {} }),
      stored,
      lateEvening,
    );
    expect(frozen.issueDate).toBe("2026-11-03");
    expect(frozen.details.validUntil).toBe("2026-11-17");
    // The validity floor uses the same day: 3 Nov is allowed, the UTC date 2 Nov is not.
    const withDate = (validUntil: string) =>
      buildFrozenDocument(
        context({ type: DocumentType.QUOTE, details: { validUntil } }),
        stored,
        lateEvening,
      );
    expect(withDate("2026-11-03").details.validUntil).toBe("2026-11-03");
    expect(() => withDate("2026-11-02")).toThrow(
      /must not be earlier than the issue date/,
    );
  });
  it("takes an explicit date and freezes the terms without empty keys", () => {
    expect(
      quote({
        validUntil: "2026-12-01",
        paymentTerms: "50% upfront",
      }).details,
    ).toEqual({
      validUntil: "2026-12-01",
      validUntilSource: "request_date",
      paymentTerms: "50% upfront",
    });
  });
  it("accepts a date equal to the issue date and one a year out", () => {
    expect(quote({ validUntil: "2026-11-03" }).details.validUntil).toBe(
      "2026-11-03",
    );
    expect(quote({ validUntil: "2027-11-03" }).details.validUntil).toBe(
      "2027-11-03",
    );
  });
  it("rejects a date before the issue date", () => {
    expect(() => quote({ validUntil: "2026-11-02" })).toThrow(
      /details\.validUntil: must not be earlier than the issue date/,
    );
  });
  it("rejects a date more than 365 days after the issue date", () => {
    expect(() => quote({ validUntil: "2027-11-04" })).toThrow(
      /details\.validUntil: must be within 365 days of the issue date/,
    );
  });
  it("keeps the validity of the document being replaced", () => {
    const frozen = quote({ validUntil: "2026-12-31" }, NOW, {
      carryOver: {
        buyer: buildBuyer({ name: "Старий" }),
        issueDate: "2026-10-01",
        details: {
          validUntil: "2026-10-10",
          validUntilSource: "default",
          deliveryTerms: "Pickup",
        },
      },
    });
    expect(frozen.issueDate).toBe("2026-10-01");
    expect(frozen.details).toEqual({
      validUntil: "2026-10-10",
      validUntilSource: "default",
      deliveryTerms: "Pickup",
    });
  });
});

describe("buildFrozenDocument", () => {
  it("freezes title, warnings and a buyer fingerprint", () => {
    const frozen = buildFrozenDocument(context(), config, NOW);
    expect(frozen.title).toBe("Рахунок на оплату");
    expect(frozen.issueDate).toBe("2026-11-03");
    expect(frozen.warnings).toContain("buyer.taxId");
    expect(frozen.buyerFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
  it("falls back to the English heading for an unknown language", () => {
    const frozen = buildFrozenDocument(
      context(),
      { ...config, documentLanguage: "de" } as unknown as DocumentConfig,
      NOW,
    );
    expect(frozen.title).toBe("Invoice");
  });
  it("throws DOCUMENT_REQUISITES_MISSING with the fields and warnings", () => {
    const bare = {
      ...context(),
      seller: buildSeller({} as DocumentConfig["company"], {}),
    };
    try {
      buildFrozenDocument(bare, config, NOW);
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiErrorResponse);
      const body = (error as ApiErrorResponse).toJSON();
      expect(body.errorCode).toBe("DOCUMENT_REQUISITES_MISSING");
      expect(body.fields).toEqual([
        "seller.name",
        "seller.taxId",
        "seller.iban",
      ]);
      expect(body.warnings).toEqual(expect.arrayContaining(["buyer.taxId"]));
      expect((error as ApiErrorResponse).statusCode).toBe(422);
    }
  });
  it("freezes act details", () => {
    const frozen = buildFrozenDocument(
      context({
        type: DocumentType.ACT,
        details: {
          contractRef: "№1",
          period: { from: "2026-10-01", to: "2026-10-31" },
        },
      }),
      config,
      NOW,
    );
    expect(frozen.title).toBe("Акт виконаних робіт (наданих послуг)");
    expect(frozen.details).toEqual({
      contractRef: "№1",
      period: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(frozen.warnings).not.toContain("details.contractRef");
  });
  it("freezes the VAT rate and lets a replacement keep the old one", () => {
    expect(buildFrozenDocument(context(), config, NOW).vatRatePercent).toBe(20);
    const carried = buildFrozenDocument(
      context({
        carryOver: { buyer: context().buyer, vatRatePercent: 7 },
      }),
      config,
      NOW,
    );
    expect(carried.vatRatePercent).toBe(7);
  });
});

describe("buildFrozenDocument for a return note", () => {
  const source = {
    kind: "waybill" as const,
    number: "2026-000003",
    date: "2026-10-10",
  };
  const lines = [{ orderItemId: "item-1", qty: 2 }];
  const returnContext = (
    overrides: Partial<DocumentContext> = {},
    details: DocumentRequest["details"] = { lines, reason: "Брак" },
  ): DocumentContext => ({
    ...context({ type: DocumentType.RETURN_NOTE, details }),
    returnSource: source,
    ...overrides,
  });

  it("freezes the lines, reason and source with the heading", () => {
    const frozen = buildFrozenDocument(returnContext(), config, NOW);
    expect(frozen.title).toBe("Накладна на повернення товару");
    expect(frozen.details).toEqual({
      returnLines: lines,
      returnReason: "Брак",
      returnSource: source,
    });
    expect(frozen.vatRatePercent).toBe(20);
  });

  it("omits the reason when none was given", () => {
    const frozen = buildFrozenDocument(
      returnContext({}, { lines }),
      config,
      NOW,
    );
    expect(frozen.details).not.toHaveProperty("returnReason");
  });

  it("copies the lines so the request cannot change the frozen document later", () => {
    const input = { lines: [{ orderItemId: "item-1", qty: 2 }] };
    const frozen = buildFrozenDocument(returnContext({}, input), config, NOW);
    input.lines[0].qty = 99;
    expect(frozen.details.returnLines).toEqual(lines);
  });

  it("refuses a request without lines", () => {
    expect(() =>
      buildFrozenDocument(returnContext({}, { lines: [] }), config, NOW),
    ).toThrow(ApiErrorResponse);
  });

  it("keeps the frozen details of a replacement, source included", () => {
    const original = buildFrozenDocument(returnContext(), config, NOW);
    const replaced = buildFrozenDocument(
      {
        ...context({
          type: DocumentType.RETURN_NOTE,
          details: {},
          carryOver: {
            buyer: original.buyer,
            issueDate: original.issueDate,
            details: original.details,
            vatRatePercent: original.vatRatePercent,
          },
        }),
        returnSource: undefined,
      },
      config,
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(replaced.details).toEqual(original.details);
    expect(replaced.issueDate).toBe(original.issueDate);
  });
});
