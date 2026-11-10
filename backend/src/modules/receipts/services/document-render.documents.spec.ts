import { ApiErrorResponse } from "../../../common/errors/ApiError";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { DocumentContext } from "../frozen-document";
import { DocumentType } from "../entities/receipt.entity";
import { ReceiptTemplate, TemplateService } from "./template.service";
import { documentYear } from "../receipt-number";
import { DocumentRenderService, FrozenOrder } from "./document-render.service";

const SELLER_IBAN = "UA213223130000026007233566001";
const BUYER_IBAN = "UA903052992990004149123456789";
const BUYER_TAX_ID = "87654321";
const VAT_ID = "123456789012";
const SIGNATORY = "Петренко Петро Петрович";

const order: FrozenOrder = {
  id: "order-1",
  currency: "UAH",
  subtotal_cents: 150000,
  total_cents: 150000,
  created_at: "2026-10-14T12:00:00.000Z",
  recipient: { name: "Іван Покупець", email: "ivan@example.com" },
  items: [
    {
      product_name: "Послуга",
      qty: 2,
      unit_price_cents: 75000,
      line_total_cents: 150000,
    },
  ],
};

const configFor = (templateId: string, visibleIban = true): DocumentConfig => {
  const base = legacyConfig(null);
  return {
    ...base,
    templateId,
    documentLanguage: "uk",
    title: { mode: "custom", text: "МІЙ ЗАГОЛОВОК" },
    company: {
      ...base.company,
      companyName: "ТОВ Продавець",
      companyTaxId: "12345678",
      companyIban: SELLER_IBAN,
    },
    visibility: { ...base.visibility, companyIban: visibleIban },
  };
};

const contextFor = (
  type: DocumentType.INVOICE | DocumentType.ACT,
  config: DocumentConfig,
): DocumentContext => ({
  request: {
    type,
    details: { contractRef: "Договір 7" },
  },
  seller: buildSeller(config.company, {
    companyVatPayer: true,
    companyVatId: VAT_ID,
    companySignatoryName: SIGNATORY,
    companySignatoryPosition: "Директор",
  }),
  buyer: buildBuyer({
    name: "Іван Покупець",
    legal_name: "ТОВ Покупець",
    tax_id: BUYER_TAX_ID,
    iban: BUYER_IBAN,
  }),
  defaultPaymentTermDays: null,
});

describe("DocumentRenderService: invoice and act", () => {
  const templates = new TemplateService();
  const renders = new DocumentRenderService(templates, undefined, undefined);

  it("renders the invoice with a fixed heading and the requisites block", async () => {
    const config = configFor("standard");
    const { html, snapshot } = await renders.prepare(
      "u1",
      config,
      order,
      "2026-000001",
      undefined,
      contextFor(DocumentType.INVOICE, config),
    );
    expect(html).toContain("Рахунок на оплату");
    expect(html).not.toContain("МІЙ ЗАГОЛОВОК");
    expect(html).toContain("UA21 3223 1300 0002 6007 2335 6600 1");
    expect(html).toContain("Сплатити до");
    expect(html).toContain("ТОВ Покупець");
    expect(snapshot.document?.type).toBe(DocumentType.INVOICE);
    expect(snapshot.publicProjection.companyInfo.receiptTitle).toBe(
      "Рахунок на оплату",
    );
  });

  it("renders the act with contract and without a payment date", async () => {
    const config = configFor("standard");
    const { html } = await renders.prepare(
      "u1",
      config,
      order,
      "2026-000001",
      undefined,
      contextFor(DocumentType.ACT, config),
    );
    expect(html).toContain("Акт виконаних робіт (наданих послуг)");
    expect(html).toContain("Договір 7");
    expect(html).not.toContain("Сплатити до");
  });

  it("keeps the buyer's IBAN, tax id, the VAT id and the signatory out of the public projection", async () => {
    const config = configFor("standard");
    const { snapshot } = await renders.prepare(
      "u1",
      config,
      order,
      "2026-000001",
      undefined,
      contextFor(DocumentType.INVOICE, config),
    );
    const publicJson = JSON.stringify(snapshot.publicProjection);
    for (const secret of [BUYER_IBAN, BUYER_TAX_ID, VAT_ID, SIGNATORY])
      expect(publicJson).not.toContain(secret);
    expect(publicJson).toContain(SELLER_IBAN);
  });

  it.each([DocumentType.INVOICE, DocumentType.ACT] as const)(
    "puts no requisite of a %s into the public JSON once the style hides the seller's",
    async (type) => {
      const base = configFor("standard");
      const config = {
        ...base,
        visibility: {
          ...base.visibility,
          companyIban: false,
          companyTaxId: false,
        },
      };
      const { snapshot } = await renders.prepare(
        "u1",
        config,
        order,
        "2026-000001",
        undefined,
        contextFor(type, config),
      );
      const publicJson = JSON.stringify(snapshot.publicProjection);
      for (const secret of [
        SELLER_IBAN,
        "12345678",
        BUYER_IBAN,
        BUYER_TAX_ID,
        VAT_ID,
        SIGNATORY,
        "Сума прописом",
      ])
        expect(publicJson).not.toContain(secret);
      expect(publicJson).not.toContain('"document":');
    },
  );

  it("shows the seller's IBAN publicly only while the style setting allows it", async () => {
    const config = configFor("standard", false);
    const { snapshot } = await renders.prepare(
      "u1",
      config,
      order,
      "2026-000001",
      undefined,
      contextFor(DocumentType.INVOICE, config),
    );
    expect(JSON.stringify(snapshot.publicProjection)).not.toContain(
      SELLER_IBAN,
    );
  });

  it("gives a waybill no document key and keeps its custom title", async () => {
    const { html, snapshot } = await renders.prepare(
      "u1",
      configFor("standard"),
      order,
      "2026-000001",
    );
    expect("document" in snapshot).toBe(false);
    expect(html).toContain("МІЙ ЗАГОЛОВОК");
    expect(html).not.toContain("doc-parties");
  });

  it.each(["standard", "classic", "minimal", "corporate"])(
    "renders an invoice in %s with the block",
    async (style) => {
      const config = configFor(style);
      const { html } = await renders.prepare(
        "u1",
        config,
        order,
        "2026-000001",
        undefined,
        contextFor(DocumentType.INVOICE, config),
      );
      expect(html).toContain("doc-parties");
      expect(html).toContain("Рахунок на оплату");
      expect(html).not.toContain("{{");
    },
  );

  it("refuses a style without money columns and a style without IBAN for an invoice", async () => {
    const reject = async (
      templateId: string,
      type: DocumentType.INVOICE | DocumentType.ACT,
    ) => {
      const config = configFor(templateId);
      await expect(
        renders.prepare(
          "u1",
          config,
          order,
          "N",
          undefined,
          contextFor(type, config),
        ),
      ).rejects.toMatchObject({ errorCode: "DOCUMENT_TEMPLATE_UNSUPPORTED" });
    };
    await reject("delivery", DocumentType.INVOICE);
    await reject("delivery", DocumentType.ACT);
    await reject("compact", DocumentType.INVOICE);
    for (const style of Object.values(ReceiptTemplate).filter(
      (t) => !["standard", "classic", "minimal", "corporate"].includes(t),
    )) {
      await reject(style, DocumentType.INVOICE);
      await reject(style, DocumentType.ACT);
    }
  });

  it("surfaces missing requisites as a 422 before rendering", async () => {
    const config = configFor("standard");
    const bare = {
      ...contextFor(DocumentType.INVOICE, config),
      seller: buildSeller({ ...config.company, companyIban: "" }, {}),
    };
    await expect(
      renders.prepare("u1", config, order, "N", undefined, bare),
    ).rejects.toBeInstanceOf(ApiErrorResponse);
  });

  it("dates the document and the number from the one instant it is given (31 Dec to 1 Jan in Kyiv)", async () => {
    const config = configFor("standard");
    // 22:30 UTC on 31 December is already 1 January 2027 in Kyiv.
    const now = new Date("2026-12-31T22:30:00Z");
    const { snapshot } = await renders.prepare(
      "u1",
      config,
      order,
      "2027-000001",
      undefined,
      contextFor(DocumentType.INVOICE, config),
      {},
      now,
    );
    expect(snapshot.document?.issueDate).toBe("2027-01-01");
    expect(snapshot.capturedAt).toBe(now.toISOString());
    // The same instant gives the same year in the number.
    expect(documentYear(now, config.formatting.timeZone)).toBe(2027);
  });
});
