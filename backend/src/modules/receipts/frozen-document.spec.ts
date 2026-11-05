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
