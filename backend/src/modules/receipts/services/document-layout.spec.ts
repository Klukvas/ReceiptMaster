import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { assertTemplateSupportsDocument } from "../document-template-support";
import { DocumentLanguage, DOCUMENT_TYPE_SPECS } from "../document-types";
import { DocumentType } from "../entities/receipt.entity";
import type { DocumentContext } from "../frozen-document";
import { getTemplateCapabilities } from "../templates/metadata";
import { DOCUMENT_LABELS } from "../templates/translations/document-labels";
import { DocumentRenderService, FrozenOrder } from "./document-render.service";
import { ReceiptTemplate, TemplateService } from "./template.service";

type TypedDocument =
  | DocumentType.INVOICE
  | DocumentType.ACT
  | DocumentType.SALES_RECEIPT
  | DocumentType.PACKING_LIST;
// Invoice and act have golden digests; the later types are checked by content below.
const TYPES: TypedDocument[] = [DocumentType.INVOICE, DocumentType.ACT];
const ALL_TYPES: TypedDocument[] = [
  ...TYPES,
  DocumentType.SALES_RECEIPT,
  DocumentType.PACKING_LIST,
];
const UNPRICED_TYPE = DocumentType.PACKING_LIST;
const STYLES = ["standard", "classic", "minimal", "corporate"];
const LANGUAGES: DocumentLanguage[] = ["uk", "ru", "en"];
const SLOTS = [
  "documentStyles",
  "documentParties",
  "documentPayment",
  "documentTotals",
  "documentClosing",
];
const HTML_DIR = path.join(__dirname, "../templates/html");
const NOW = new Date("2026-10-15T09:30:00Z");

const SELLER_IBAN = "UA213223130000026007233566001";
const XSS = '<script>alert("x")</script>';

// Digests of the rendered HTML; a change here is a visible change to the document.
const GOLDEN_SHA256: Record<string, string> = {
  "invoice.standard.uk":
    "c923ac40f43c9437db558038b39229bd5807ba71344d13a2144a73a2a4b6e0cc",
  "invoice.standard.ru":
    "dc9774b5ee38243b5089a7a0d6f21fed813e8ac48813719ed690f6ad481fccf9",
  "invoice.standard.en":
    "df8b08b16f5ac51b9117e2cbd90097f53592dfa2f1b13ff1e2be2d28ddcdcf52",
  "invoice.classic.uk":
    "28feb1b1edf0bf4dd0d8017aa4221bc1795ce2082f3764f0e92f1a6e57122402",
  "invoice.classic.ru":
    "809fd4f7b19075a68a2f6072e88fbd4191a4f60bd37c0f4bc5021932df933580",
  "invoice.classic.en":
    "de41a254bb9acd434af3021cd463c65639d749d97b5f7efc04eff864532ff980",
  "invoice.minimal.uk":
    "b8dd1aa45f140b365ed647aa379f96a62448755eb2a8a2d25e010faf9b5afea1",
  "invoice.minimal.ru":
    "af03e3b1df44c1224b0814858fb461dc7333b951b0b2697a20c76fd3da6cb87d",
  "invoice.minimal.en":
    "c4cd600e559815ef1ae40273cf9f6cdad1b1e9841dd27f919d3c4ae599b09a0c",
  "invoice.corporate.uk":
    "bb810feec2e292e656c7dc8ac282f60bff5b5c0a2ba34f1e9157bd9bc0351743",
  "invoice.corporate.ru":
    "71ed4031919e2e0d07570aa8259f98fc6dd6aeb5afaa1c18cd0e16591478f3bb",
  "invoice.corporate.en":
    "d77d79c3ba3cd69a8c86617cd54cb285f0ad2956d78ccc42bc4c23062985a11c",
  "act.standard.uk":
    "6c187f6b148416eb117b806f1f94b3eb0fb64fd89cd1584484c30ac24a1b4a82",
  "act.standard.ru":
    "a85ec1d90d242d917d5636a982eb3bcf8ca3777cbb083bec7b629087e509728d",
  "act.standard.en":
    "eb3333ea6632795c0fe3dcb2ca31ac679e97df72ae2850e631b7bed976193c1f",
  "act.classic.uk":
    "4875b51f0d918256d7c9da0e4782a488053bd9e2b6555e90cc9f13f1f7a96d9b",
  "act.classic.ru":
    "8c08d8daeff379d2fdc3052ac8c2b64d6a62e721bf9bd7e7ae9827279202cbb2",
  "act.classic.en":
    "091b5991991ca45605cf16c56bbe0b2f9ea07b49cf6a5f6ae15e4ec748ca0a50",
  "act.minimal.uk":
    "6449f814df81483d8f09caea879df88796febe69b8b6132897098e5b0db1c23e",
  "act.minimal.ru":
    "0658b5f48fb06a91e53fb755e4dc6ce2aefb98f574cfe59e75fcbe81f1e218b6",
  "act.minimal.en":
    "525fdaef98c042e544cdffde62e2bb92b43965caafbf0febd41a01bdb99e43e6",
  "act.corporate.uk":
    "45a576c0c8f7af07ccc3b0927c09b8b8a2fd7d6713d582ce69694128a116165d",
  "act.corporate.ru":
    "cf9ba943040cf0a246b1c1ad0e1b15a9dfdb413172e04f28918621efb94eb7db",
  "act.corporate.en":
    "2ff7db1f12d21c5472eebf16c4ca50ae7ac8ec40946bcd08491e63ee0bc435ab",
};

const order = (overrides: Partial<FrozenOrder> = {}): FrozenOrder => ({
  id: "order-1",
  currency: "UAH",
  subtotal_cents: 205050,
  total_cents: 205050,
  created_at: "2026-10-14T12:00:00.000Z",
  recipient: { name: "Іван Покупець", address: "Київ, вул. Тестова 1" },
  items: [
    {
      product_name: "Розробка сайту",
      qty: 1,
      unit_price_cents: 150050,
      line_total_cents: 150050,
    },
    {
      product_name: "Консультація",
      qty: 2,
      unit_price_cents: 27500,
      line_total_cents: 55000,
    },
  ],
  ...overrides,
});

const configFor = (
  templateId: string,
  language: DocumentLanguage,
): DocumentConfig => {
  const base = legacyConfig(null);
  return {
    ...base,
    templateId,
    documentLanguage: language,
    company: {
      ...base.company,
      companyName: "Продавець",
      companyAddress: "Київ, вул. Продавця 1",
      companyTaxId: "12345678",
      companyIban: SELLER_IBAN,
      companySwift: "SWIFTUA2X",
    },
  };
};

const contextFor = (
  type: TypedDocument,
  config: DocumentConfig,
  buyerName = "Іван Покупець",
  contractRef = "Договір 7",
): DocumentContext => ({
  request: {
    type,
    details:
      type === DocumentType.ACT
        ? {
            contractRef,
            period: { from: "2026-10-01", to: "2026-10-31" },
          }
        : { dueDate: "2026-10-20" },
  },
  seller: buildSeller(config.company, {
    companyLegalForm: "ТОВ",
    companyBankName: "АТ Банк",
    companyVatPayer: true,
    companyVatId: "123456789012",
    companySignatoryName: "Петренко Петро",
    companySignatoryPosition: "Директор",
  }),
  buyer: buildBuyer({
    name: buyerName,
    legal_name: `ТОВ ${buyerName}`,
    tax_id: "87654321",
    legal_address: "м. Львів",
  }),
  defaultPaymentTermDays: null,
});

describe("invoice and act layout", () => {
  const templates = new TemplateService();
  const renders = new DocumentRenderService(templates, undefined, undefined);

  beforeAll(async () => {
    await templates.ready;
    // Fonts are large and machine-independent only by accident; use stubs.
    const render = templates.renderTemplate.bind(templates);
    jest
      .spyOn(templates, "renderTemplate")
      .mockImplementation((name, data) =>
        render(name, { ...data, fontRegular: "FONT-R", fontBold: "FONT-B" }),
      );
    // Only Date is faked: file reads and promises must keep running.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
  });
  afterAll(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const render = async (
    type: TypedDocument,
    style: string,
    language: DocumentLanguage,
    frozenOrder: FrozenOrder = order(),
    context?: DocumentContext,
  ) => {
    const config = configFor(style, language);
    const { html } = await renders.prepare(
      "u1",
      config,
      frozenOrder,
      "2026-000007",
      Buffer.from("logo"),
      context ?? contextFor(type, config),
    );
    return html;
  };

  const sha = (html: string) => createHash("sha256").update(html).digest("hex");

  describe("golden HTML", () => {
    const cases = TYPES.flatMap((type) =>
      STYLES.flatMap((style) =>
        LANGUAGES.map((language) => [type, style, language] as const),
      ),
    );
    it.each(cases)("%s / %s / %s", async (type, style, language) => {
      const html = await render(type, style, language);
      expect(sha(html)).toBe(GOLDEN_SHA256[`${type}.${style}.${language}`]);
    });
  });

  describe("readable .doc-* fragments (standard, uk)", () => {
    const takeDiv = (html: string, className: string): string => {
      const start = html.indexOf(`<div class="${className}"`);
      if (start < 0) return "";
      const tag = /<div\b|<\/div>/g;
      tag.lastIndex = start;
      let depth = 0;
      for (let match = tag.exec(html); match; match = tag.exec(html)) {
        depth += match[0] === "</div>" ? -1 : 1;
        if (depth === 0) return html.slice(start, match.index + 6);
      }
      return "";
    };
    it.each(TYPES)("%s", async (type) => {
      const html = await render(type, "standard", "uk");
      const fragments = [
        "doc-parties",
        "doc-payment",
        "doc-totals",
        "doc-words",
        "doc-closing",
      ].map((name) => takeDiv(html, name));
      expect(fragments.join("\n---\n")).toMatchSnapshot();
    });
  });

  describe("invariants", () => {
    it.each(STYLES)("%s contains each of the five slots exactly once", (s) => {
      const html = fs.readFileSync(
        path.join(HTML_DIR, `${s}-receipt.html`),
        "utf-8",
      );
      for (const slot of SLOTS)
        expect(html.split(`{{> ${slot}}}`).length - 1).toBe(1);
    });

    it("no style reads the document type, and the others carry no slot", () => {
      for (const file of fs
        .readdirSync(HTML_DIR)
        .filter((f) => f.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(HTML_DIR, file), "utf-8");
        expect(html).not.toMatch(/document\.type|documentType/);
        if (!STYLES.includes(file.replace("-receipt.html", "")))
          expect(html).not.toMatch(/\{\{>\s*document[A-Z]/);
      }
    });

    it("allowed styles come from the spec and the capabilities list them", () => {
      for (const type of ALL_TYPES)
        expect(DOCUMENT_TYPE_SPECS[type].layout?.allowedStyles).toEqual(STYLES);
      for (const style of Object.values(ReceiptTemplate)) {
        const types = getTemplateCapabilities(style).documentTypes;
        expect(types.includes("waybill")).toBe(true);
        for (const type of ALL_TYPES)
          expect(types.includes(type)).toBe(STYLES.includes(style));
      }
    });

    it("refuses every style outside the allowed list", () => {
      for (const style of Object.values(ReceiptTemplate))
        for (const type of ALL_TYPES) {
          const check = () => assertTemplateSupportsDocument(type, style);
          if (STYLES.includes(style)) expect(check).not.toThrow();
          else expect(check).toThrow(/cannot carry this document type/);
        }
    });

    it("keeps the label sets in step across languages", () => {
      const keys = Object.keys(DOCUMENT_LABELS.uk).sort();
      expect(Object.keys(DOCUMENT_LABELS.ru).sort()).toEqual(keys);
      expect(Object.keys(DOCUMENT_LABELS.en).sort()).toEqual(keys);
      for (const language of LANGUAGES)
        for (const value of Object.values(DOCUMENT_LABELS[language]))
          expect(value.trim()).not.toBe("");
    });
  });

  describe("sales receipt and packing list", () => {
    const CURRENCY = /₴|грн|UAH/;
    const NOTICES = {
      uk: "Не є фіскальним документом",
      ru: "Не является фискальным документом",
      en: "Not a fiscal document",
    };
    const cases = STYLES.flatMap((style) =>
      LANGUAGES.map((language) => [style, language] as const),
    );

    it.each(cases)(
      "packing list in %s / %s prints quantities and no money",
      async (style, language) => {
        const html = await render(UNPRICED_TYPE, style, language);
        const labels = DOCUMENT_LABELS[language];
        expect(html).toContain("doc-parties");
        expect(html).toContain(labels.linesCount);
        expect(html).toContain(labels.totalQuantity);
        expect(html).toContain(labels.shippedBy);
        expect(html).toContain(labels.receivedBy);
        expect(html).not.toContain('class="doc-notice"');
        expect(html).not.toContain('class="doc-totals"');
        expect(html).not.toContain('class="doc-words"');
        expect(html).not.toContain(labels.amountInWords);
        expect(html).not.toContain(labels.vatIncluded);
        expect(html).not.toContain(labels.stamp);
        expect(html).not.toMatch(CURRENCY);
        // The default 1 500,50 / 275,00 amounts of the fixture order.
        expect(html).not.toMatch(
          /1[\s\u00a0,.]?500[.,]50|2[\s\u00a0,.]?050[.,]50/,
        );
        expect(html).not.toContain("{{");
      },
    );

    it.each(STYLES)(
      "packing list in %s has no price or amount header",
      async (s) => {
        const html = await render(UNPRICED_TYPE, s, "uk");
        const header = html.slice(
          html.indexOf("<thead"),
          html.indexOf("</thead>"),
        );
        expect(header.match(/<th\b/g)?.length).toBeLessThanOrEqual(3);
        expect(header).not.toMatch(/Ціна|Сума|Price|Amount|Rate/i);
      },
    );

    describe("minimal's empty footer", () => {
      const prepareMinimal = async (type: TypedDocument, footerTitle = "") => {
        const base = configFor("minimal", "uk");
        const config = { ...base, footerTitle };
        return (
          await renders.prepare(
            "u1",
            config,
            order(),
            "2026-000007",
            undefined,
            contextFor(type, config),
          )
        ).html;
      };

      it.each(ALL_TYPES)(
        "drops the lone rule under a %s so it cannot start a blank page",
        async (type) => {
          expect(await prepareMinimal(type)).not.toContain('class="footer"');
        },
      );

      it("keeps the footer whenever the account wrote one", async () => {
        const html = await prepareMinimal(DocumentType.INVOICE, "Дякуємо!");
        expect(html).toContain('class="footer"');
        expect(html).toContain("Дякуємо!");
      });
    });

    it("lists the delivery address for the consignee", async () => {
      const html = await render(UNPRICED_TYPE, "standard", "uk");
      expect(html).toContain("Київ, вул. Тестова 1");
      expect(html).not.toContain("м. Львів");
    });

    it.each(cases)(
      "sales receipt in %s / %s carries the notice, VAT and a seller-only signature",
      async (style, language) => {
        const html = await render(DocumentType.SALES_RECEIPT, style, language);
        const labels = DOCUMENT_LABELS[language];
        expect(html).toContain(NOTICES[language]);
        expect(html).toContain('class="doc-totals"');
        expect(html).toContain(`${labels.vatIncluded} (20%)`);
        expect(html).toContain(labels.amountInWords);
        expect(html).not.toContain(labels.paymentDetails);
        expect(html).not.toContain(labels.stamp);
        expect(html).not.toContain(labels.fromCustomer);
        expect(html).not.toContain("{{");
      },
    );

    it("keeps the notice out of the other types", async () => {
      for (const type of [
        DocumentType.INVOICE,
        DocumentType.ACT,
        DocumentType.PACKING_LIST,
      ] as const) {
        const html = await render(type, "standard", "uk");
        expect(html).not.toContain(NOTICES.uk);
      }
    });

    it("never names a receipt a cash or fiscal one", async () => {
      for (const type of [
        DocumentType.SALES_RECEIPT,
        DocumentType.PACKING_LIST,
      ] as const)
        for (const language of LANGUAGES) {
          const html = await render(type, "standard", language);
          expect(
            html.replace(
              /Not a fiscal document|Не є фіскальним документом|Не является фискальным документом/g,
              "",
            ),
          ).not.toMatch(
            /касов|кассов|\bcash\b|fiscal receipt|фіскальн|фискальн/i,
          );
        }
    });

    it("strips prices from the public projection of a packing list only", async () => {
      const config = configFor("standard", "uk");
      const prepare = (type: TypedDocument) =>
        renders.prepare(
          "u1",
          config,
          order(),
          "N",
          undefined,
          contextFor(type, config),
        );
      const packing = (await prepare(UNPRICED_TYPE)).snapshot.publicProjection;
      expect(packing.money).toBe(false);
      expect(packing.order.total_cents).toBeUndefined();
      expect(packing.order.subtotal_cents).toBeUndefined();
      expect(JSON.stringify(packing)).not.toMatch(
        /unit_price_cents|line_total_cents|_cents"?:\d/,
      );
      expect(packing.order.items).toEqual([
        { product_name: "Розробка сайту", qty: 1 },
        { product_name: "Консультація", qty: 2 },
      ]);
      const receipt = (await prepare(DocumentType.SALES_RECEIPT)).snapshot
        .publicProjection;
      expect(receipt.money).toBe(true);
      expect(receipt.order.total_cents).toBe(205050);
    });

    it("keeps prices out of the frozen HTML snapshot of a packing list", async () => {
      const config = configFor("corporate", "en");
      const { html } = await renders.prepare(
        "u1",
        config,
        order(),
        "N",
        undefined,
        contextFor(UNPRICED_TYPE, config),
      );
      expect(html).not.toMatch(/2,?050\.50|1,?500\.50/);
    });
  });

  describe("content", () => {
    it.each(STYLES)("%s invoice: payment block, due date, words", async (s) => {
      const html = await render(DocumentType.INVOICE, s, "uk");
      expect(html).toContain("Реквізити для оплати");
      expect(html).toContain(SELLER_IBAN);
      expect(html).toContain("Сплатити до");
      expect(html).toContain("20 жовтня 2026 р.");
      expect(html).toContain("Сума прописом");
      expect(html).toContain("Дві тисячі п");
      expect(html).toContain("Призначення платежу");
      expect(html).toContain("Ціна з ПДВ");
      expect(html).not.toContain("Чек згенеровано");
      expect(html).not.toContain("{{");
    });

    it.each(STYLES)(
      "%s act: no payment block, statement and signatures",
      async (s) => {
        const html = await render(DocumentType.ACT, s, "uk");
        expect(html).not.toContain("Реквізити для оплати");
        expect(html).not.toContain("Сплатити до");
        expect(html).toContain("Роботи виконано в повному обсязі");
        expect(html).toContain("Від Виконавця");
        expect(html).toContain("Від Замовника");
        expect(html).toContain("М.П.");
        expect(html).toContain("Договір 7");
        expect(html).not.toContain("{{");
      },
    );

    it("prints the seller's SWIFT nowhere, and the IBAN once", async () => {
      for (const style of STYLES) {
        const html = await render(DocumentType.INVOICE, style, "uk");
        expect(html).not.toContain("SWIFTUA2X");
        expect(html.split(SELLER_IBAN).length - 1).toBe(1);
      }
    });

    it("escapes hostile text in the buyer, the item and the contract", async () => {
      for (const style of STYLES) {
        const hostileOrder = order({
          items: [
            {
              product_name: XSS,
              qty: 1,
              unit_price_cents: 205050,
              line_total_cents: 205050,
            },
          ],
        });
        const config = configFor(style, "uk");
        for (const type of TYPES) {
          const html = await render(
            type,
            style,
            "uk",
            hostileOrder,
            contextFor(type, config, XSS, XSS),
          );
          expect(html).not.toContain("<script>alert");
          expect(html).toContain("&lt;script&gt;");
        }
      }
    });
  });
});
