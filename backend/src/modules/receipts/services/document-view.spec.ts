import { ApiErrorResponse } from "../../../common/errors/ApiError";
import { amountInWords } from "../../../common/utils/amount-in-words.util";
import { calculateVatBreakdown } from "../../../common/utils/vat.util";
import { formatDocumentMoney } from "../../../common/utils/document-formatting.util";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { DocumentType } from "../entities/receipt.entity";
import type { FrozenDocument } from "../frozen-document";
import {
  buildDocumentRenderData,
  DocumentOrderInput,
  nameWithLegalForm,
} from "./document-view";

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
  items: [
    { qty: 1, line_total_cents: 70000 },
    { qty: 3, line_total_cents: 50000 },
  ],
};

const frozenFor = (
  type:
    | DocumentType.INVOICE
    | DocumentType.ACT
    | DocumentType.SALES_RECEIPT
    | DocumentType.PACKING_LIST
    | DocumentType.QUOTE,
  vatPayer: boolean | null,
  overrides: Partial<FrozenDocument> = {},
): FrozenDocument => ({
  type,
  title: "T",
  details:
    type === DocumentType.INVOICE
      ? { dueDate: "2026-10-20" }
      : type === DocumentType.ACT
        ? {
            contractRef: "Договір 7",
            period: { from: "2026-10-01", to: "2026-10-31" },
          }
        : type === DocumentType.QUOTE
          ? {
              validUntil: "2026-10-29",
              validUntilSource: "default",
              paymentTerms: "50% передоплата",
              deliveryTerms: "Самовивіз",
            }
          : {},
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

describe("tax codes in the parties block", () => {
  const sellerOf = (taxId: string) =>
    buildSeller(
      {
        ...config.company,
        companyName: "Продавець",
        companyTaxId: taxId,
        companyIban: "UA213223130000026007233566001",
      },
      {},
    );
  const view = (overrides: Partial<FrozenDocument>) =>
    buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, false, overrides),
      order,
      "N-1",
      config,
    ).view;

  it("prints a code whose kind is known, under its label", () => {
    const { seller, buyer } = view({});
    expect(seller).toMatchObject({ codeLabel: "ЄДРПОУ", code: "12345678" });
    expect(buyer).toMatchObject({ codeLabel: "ЄДРПОУ", code: "87654321" });
  });

  it("hides a seller code of unknown kind instead of printing it unlabelled", () => {
    const { seller } = view({ seller: sellerOf("12345") });
    expect(seller.codeLabel).toBe("");
    expect(seller.code).toBe("");
  });

  it("hides a buyer code of unknown kind", () => {
    const { buyer } = view({
      buyer: buildBuyer({ name: "Іван", tax_id: "ABC" }),
    });
    expect(buyer.codeLabel).toBe("");
    expect(buyer.code).toBe("");
  });
});

describe("nameWithLegalForm", () => {
  it.each([
    ["ТОВ", "Ромашка", "ТОВ Ромашка"],
    ["ТОВ", "ТОВ Ромашка", "ТОВ Ромашка"],
    ["ТОВ", "тов Ромашка", "тов Ромашка"],
    ["ТОВ", 'ТОВ "Ромашка"', 'ТОВ "Ромашка"'],
    ["ТОВ", "ТОВ", "ТОВ"],
    ["ТОВ", "Товариство друзів", "ТОВ Товариство друзів"],
    ["", "Ромашка", "Ромашка"],
    ["ФОП", "Іваненко", "ФОП Іваненко"],
    ["Ltd.", "Ltd. Acme", "Ltd. Acme"],
    ["Ltd.", "Ltdx Acme", "Ltd. Ltdx Acme"],
  ])("%s + %s prints %s", (form, name, printed) => {
    expect(nameWithLegalForm(form, name)).toBe(printed);
  });

  it("does not double the form in the seller line and the payee of an invoice", () => {
    const seller = buildSeller(
      {
        ...config.company,
        companyName: "ТОВ Ромашка",
        companyTaxId: "12345678",
        companyIban: "UA213223130000026007233566001",
      },
      { companyLegalForm: "ТОВ" },
    );
    const { view } = buildDocumentRenderData(
      { ...frozenFor(DocumentType.INVOICE, false), seller },
      order,
      "N-1",
      config,
    );
    expect(view.seller.name).toBe("ТОВ Ромашка");
    expect(view.payment?.recipient).toBe("ТОВ Ромашка");
  });
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
      "Оплата за рахунком № 2026-000007 від 15 жовтня 2026 р., у т.ч. ПДВ 20% — 200,00 грн",
    );
    expect(view.seller.vatLine).toBe("ІПН 123456789012");
  });

  it("writes the VAT amount in the purpose without a currency symbol or no-break spaces", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      {
        ...order,
        total_cents: 123456789,
        items: [{ qty: 1, line_total_cents: 123456789 }],
      },
      "N-1",
      config,
    );
    const purpose = view.payment?.purpose ?? "";
    expect(purpose).toMatch(/— 205 761,32 грн$/);
    expect(purpose).not.toMatch(/₴|[\u00a0\u202f]/);
  });

  it("keeps the ISO code as the unit for a non-hryvnia order", () => {
    const { view } = buildDocumentRenderData(
      frozenFor(DocumentType.INVOICE, true),
      { ...order, currency: "USD" },
      "N-1",
      config,
    );
    expect(view.payment?.purpose).toMatch(/— 200,00 USD$/);
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
  describe("sales receipt", () => {
    const view = (vatPayer: boolean | null) =>
      buildDocumentRenderData(
        frozenFor(DocumentType.SALES_RECEIPT, vatPayer),
        order,
        "N",
        config,
      ).view;

    it("carries the non-fiscal notice, and no other type does", () => {
      expect(view(true).notice).toBe("Не є фіскальним документом");
      for (const type of [
        DocumentType.INVOICE,
        DocumentType.ACT,
        DocumentType.PACKING_LIST,
      ] as const)
        expect(
          buildDocumentRenderData(frozenFor(type, true), order, "N", config)
            .view.notice,
        ).toBeUndefined();
    });

    it("splits the VAT like an invoice and has no payment block", () => {
      const payer = view(true);
      expect(payer.totals?.vat).toEqual({
        label: "У тому числі ПДВ (20%)",
        amount: money(20000),
      });
      expect(payer.payment).toBeUndefined();
      expect(payer.hidesItemPrices).toBeUndefined();
      expect(view(false).totals?.noVat).toBe("Без ПДВ");
    });

    it("has a seller-only signature captioned without a seal", () => {
      const { signatures, seller, buyer } = view(true);
      expect(signatures.seller.heading).toBe("Продавець");
      expect(signatures.buyer).toBeUndefined();
      expect(signatures.caption).toBe("Підпис");
      expect(signatures.caption).not.toContain("М.П.");
      expect([seller.role, buyer.role]).toEqual(["Продавець", "Покупець"]);
    });
  });

  describe("quote", () => {
    const view = (vatPayer: boolean | null, overrides = {}) =>
      buildDocumentRenderData(
        frozenFor(DocumentType.QUOTE, vatPayer, overrides),
        order,
        "N",
        config,
      ).view;

    it("carries the quotation notice and no other type does", () => {
      expect(view(true).notice).toBe(
        "Пропозиція не є рахунком та не є підставою для оплати або бухгалтерського обліку",
      );
      for (const type of [
        DocumentType.INVOICE,
        DocumentType.ACT,
        DocumentType.SALES_RECEIPT,
        DocumentType.PACKING_LIST,
      ] as const)
        expect(
          buildDocumentRenderData(frozenFor(type, true), order, "N", config)
            .view.notice ?? "",
        ).not.toContain("Пропозиція");
    });

    it("renames the grand total and leaves the other types' labels alone", () => {
      expect(view(true).labels.grandTotal).toBe("Загальна вартість");
      const invoice = buildDocumentRenderData(
        frozenFor(DocumentType.INVOICE, true),
        order,
        "N",
        config,
      ).view;
      expect(invoice.labels.grandTotal).toBe("Всього до сплати");
    });

    it("has no payment block, splits VAT and signs as supplier with a seal", () => {
      const payer = view(true);
      expect(payer.payment).toBeUndefined();
      expect(payer.totals?.vat?.amount).toBe(money(20000));
      expect(view(false).totals?.noVat).toBe("Без ПДВ");
      expect(payer.signatures.seller.heading).toBe("Від Постачальника");
      expect(payer.signatures.buyer).toBeUndefined();
      expect(payer.signatures.caption).toBe("Підпис / М.П.");
      expect([payer.seller.role, payer.buyer.role]).toEqual([
        "Постачальник",
        "Покупець",
      ]);
    });

    it("exposes the offer terms, and omits them when absent", () => {
      expect(view(true).offer).toEqual({
        validUntil: "29 жовтня 2026 р.",
        paymentTerms: "50% передоплата",
        deliveryTerms: "Самовивіз",
      });
      expect(
        view(true, { details: { validUntil: "2026-10-29" } }).offer,
      ).toEqual({ validUntil: "29 жовтня 2026 р." });
    });

    it("gives the other types no offer", () => {
      for (const type of [
        DocumentType.INVOICE,
        DocumentType.ACT,
        DocumentType.SALES_RECEIPT,
        DocumentType.PACKING_LIST,
      ] as const)
        expect(
          buildDocumentRenderData(frozenFor(type, true), order, "N", config)
            .view.offer,
        ).toBeUndefined();
    });
  });

  describe("packing list", () => {
    const build = (vatPayer: boolean | null = true, input = order) =>
      buildDocumentRenderData(
        frozenFor(DocumentType.PACKING_LIST, vatPayer),
        input,
        "N",
        config,
      );

    it("has no totals, VAT or amount in words, and no price columns", () => {
      const { view, translationOverrides } = build(true);
      expect(view.totals).toBeUndefined();
      expect(view.hidesItemPrices).toBe(true);
      expect(view.notice).toBeUndefined();
      const { labels: _labels, ...printed } = view;
      expect(JSON.stringify(printed)).not.toMatch(/ПДВ|ІПН|прописом|₴|грн/);
      expect(translationOverrides.amount).toBeUndefined();
      expect(translationOverrides.price).toBeUndefined();
    });

    it("counts line items and total quantity", () => {
      expect(build().view.quantities).toEqual({ lines: "2", units: "4" });
    });

    it("signs as shipper and consignee with a plain caption", () => {
      const { signatures, seller, buyer } = build().view;
      expect(signatures.seller.heading).toBe("Відправив");
      expect(signatures.buyer?.heading).toBe("Отримав");
      expect(signatures.caption).toBe("Підпис");
      expect([seller.role, buyer.role]).toEqual(["Відправник", "Одержувач"]);
    });
  });

  describe("buyer address priority", () => {
    it("puts the delivery address first for a packing list and the legal one for a receipt", () => {
      const withLegal = (
        type: DocumentType.PACKING_LIST | DocumentType.SALES_RECEIPT,
      ) =>
        buildDocumentRenderData(
          frozenFor(type, true, {
            buyer: buildBuyer({
              name: "Іван",
              legal_name: "ТОВ Покупець",
              legal_address: "Львів, вул. Юридична 2",
            }),
          }),
          order,
          "N",
          config,
        ).view.buyer.address;
      expect(withLegal(DocumentType.PACKING_LIST)).toBe("Київ, вул. Order 1");
      expect(withLegal(DocumentType.SALES_RECEIPT)).toBe(
        "Львів, вул. Юридична 2",
      );
    });

    it("falls back to the legal address when the order has no delivery address", () => {
      const view = buildDocumentRenderData(
        frozenFor(DocumentType.PACKING_LIST, true, {
          buyer: buildBuyer({ name: "Іван", legal_address: "Львів, 2" }),
        }),
        { ...order, recipient: {} },
        "N",
        config,
      ).view;
      expect(view.buyer.address).toBe("Львів, 2");
    });
  });
});
