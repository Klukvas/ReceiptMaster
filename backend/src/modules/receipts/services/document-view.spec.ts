import { ApiErrorResponse } from "../../../common/errors/ApiError";
import { amountInWords } from "../../../common/utils/amount-in-words.util";
import { calculateVatBreakdown } from "../../../common/utils/vat.util";
import { formatDocumentMoney } from "../../../common/utils/document-formatting.util";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { DocumentType } from "../entities/receipt.entity";
import type { FrozenDocument } from "../frozen-document";
import { buildDocumentRenderData, DocumentOrderInput } from "./document-view";

const config: DocumentConfig = {
  ...legacyConfig(null),
  documentLanguage: "uk",
};
const money = (cents: number) =>
  formatDocumentMoney(cents, "UAH", config.formatting);

const order: DocumentOrderInput = {
  currency: "UAH",
  total_cents: 120000,
  recipient: { address: "Київ, вул. Order 1" },
  items: [{ line_total_cents: 70000 }, { line_total_cents: 50000 }],
};

const frozenFor = (
  type: DocumentType.INVOICE | DocumentType.ACT,
  vatPayer: boolean | null,
  overrides: Partial<FrozenDocument> = {},
): FrozenDocument => ({
  type,
  title: "T",
  details:
    type === DocumentType.INVOICE
      ? { dueDate: "2026-10-20" }
      : {
          contractRef: "Договір 7",
          period: { from: "2026-10-01", to: "2026-10-31" },
        },
  issueDate: "2026-10-15",
  seller: buildSeller(
    {
      ...config.company,
      companyName: "Продавець",
      companyAddress: "Київ, вул. Продавця 1",
      companyTaxId: "12345678",
      companyIban: "UA213223130000026007233566001",
    },
    {
      companyLegalForm: "ТОВ",
      companyBankName: "АТ Банк",
      companyVatPayer: vatPayer,
      companyVatId: "123456789012",
      companySignatoryName: "Петренко П.П.",
      companySignatoryPosition: "Директор",
    },
  ),
  buyer: buildBuyer({
    name: "Іван",
    legal_name: "ТОВ Покупець",
    tax_id: "87654321",
  }),
  vatRatePercent: 20,
  warnings: [],
  buyerFingerprint: "x",
  ...overrides,
});

describe("buildDocumentRenderData", () => {
  it("splits the VAT of a payer's total and puts it in the payment purpose", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      order,
      "2026-000007",
      config,
    );
    expect(view.totals.vat).toEqual({
      label: "У тому числі ПДВ (20%)",
      amount: money(20000),
    });
    expect(view.totals.noVat).toBeUndefined();
    expect(view.totals.grandTotal).toBe(money(120000));
    expect(view.payment?.purpose).toBe(
      `Оплата за рахунком № 2026-000007 від 15 жовтня 2026 р., у т.ч. ПДВ 20% — ${money(20000)}`,
    );
    expect(view.seller.vatLine).toBe("ІПН 123456789012");
  });

  it("net plus VAT always equals the total", () => {
    for (const cents of [1, 99, 205050, 333333, 1_000_001]) {
      const { net, vat, gross } = calculateVatBreakdown(cents, {
        mode: "included",
        rate: 20,
      });
      expect(net + vat).toBe(cents);
      expect(gross).toBe(cents);
    }
  });

  it("says 'without VAT' for a non-payer", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, false),
      order,
      "N-1",
      config,
    );
    expect(view.totals.vat).toBeUndefined();
    expect(view.totals.noVat).toBe("Без ПДВ");
    expect(view.payment?.purpose).toMatch(/, без ПДВ$/);
    expect(view.seller.vatLine).toBe("Не є платником ПДВ");
  });

  it("prints no VAT line at all when the VAT status is unknown", () => {
    const { view, translationOverrides } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, null),
      order,
      "N-1",
      config,
    );
    expect(view.totals.vat).toBeUndefined();
    expect(view.totals.noVat).toBeUndefined();
    expect(view.seller.vatLine).toBe("");
    expect(view.payment?.purpose).not.toMatch(/ПДВ/);
    expect(translationOverrides.amount).toBeUndefined();
  });

  it("uses the frozen rate, not the current constant", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true, { vatRatePercent: 7 }),
      order,
      "N-1",
      config,
    );
    expect(view.totals.vat?.label).toBe("У тому числі ПДВ (7%)");
  });

  it("renames the price columns only for a VAT payer", () => {
    const payer = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      order,
      "N",
      config,
    );
    expect(payer.translationOverrides).toMatchObject({
      price: "Ціна з ПДВ",
      unitPrice: "Ціна з ПДВ",
      rate: "Ціна з ПДВ",
      amount: "Сума з ПДВ",
    });
    const nonPayer = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, false),
      order,
      "N",
      config,
    );
    expect(nonPayer.translationOverrides.price).toBeUndefined();
  });

  it("writes the total in words", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      order,
      "N",
      config,
    );
    expect(view.totals.amountInWords).toBe(amountInWords(120000, "UAH", "uk"));
  });

  it("builds the buyer from legal requisites, falling back to the order address", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      order,
      "N",
      config,
    );
    expect(view.buyer).toMatchObject({
      role: "Платник",
      name: "ТОВ Покупець",
      codeLabel: "ЄДРПОУ",
      code: "87654321",
      address: "Київ, вул. Order 1",
    });
    expect(view.seller).toMatchObject({
      role: "Постачальник",
      name: "ТОВ Продавець",
      address: "Київ, вул. Продавця 1",
    });
  });

  it("gives an invoice a payment block and one signature, and an act the opposite", () => {
    const invoice = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      order,
      "N",
      config,
    ).view;
    expect(invoice.payment?.iban).toBe("UA213223130000026007233566001");
    expect(invoice.payment?.bank).toBe("АТ Банк");
    expect(invoice.act).toBeUndefined();
    expect(invoice.signatures.buyer).toBeUndefined();
    expect(invoice.signatures.seller.heading).toBe("Виписав(ла)");
    expect(invoice.dueDate).toBe("20 жовтня 2026 р.");

    const act = buildDocumentRenderData(
      frozenFor(DocumentType.ACT, true),
      order,
      "N",
      config,
    ).view;
    expect(act.payment).toBeUndefined();
    expect(act.dueDate).toBeUndefined();
    expect(act.act?.contractRef).toBe("Договір 7");
    expect(act.act?.period).toBe("1 жовтня 2026 р. – 31 жовтня 2026 р.");
    expect(act.seller.role).toBe("Виконавець");
    expect(act.buyer.role).toBe("Замовник");
    expect(act.signatures.seller).toMatchObject({
      heading: "Від Виконавця",
      position: "Директор",
      name: "Петренко П.П.",
    });
    expect(act.signatures.buyer?.heading).toBe("Від Замовника");
  });

  it("blanks the header's tax id, IBAN and SWIFT and uses the issue date", () => {
    const data = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      order,
      "N",
      config,
    );
    expect(data.headerCompany).toEqual({
      companyTaxId: "",
      companyIban: "",
      companySwift: "",
    });
    expect(data.orderDate).toBe("15 жовтня 2026 р.");
  });

  it("refuses an order whose total disagrees with its lines", () => {
    expect(() =>
      buildDocumentRenderData(
        frozenFor(DocumentType.INVOICE, true),
        { ...order, total_cents: 120001 },
        "N",
        config,
      ),
    ).toThrow(ApiErrorResponse);
  });

  it("reports an inconsistent total as a generic internal error without figures", () => {
    let thrown: unknown;
    try {
      buildDocumentRenderData(
        frozenFor(DocumentType.INVOICE, true),
        { ...order, total_cents: 120001 },
        "N",
        config,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      errorCode: "INTERNAL_SERVER_ERROR",
      message: "Document totals are inconsistent",
      statusCode: 500,
    });
  });
});
