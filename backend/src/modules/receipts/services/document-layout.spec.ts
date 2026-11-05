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

type TypedDocument = DocumentType.INVOICE | DocumentType.ACT;
const TYPES: TypedDocument[] = [DocumentType.INVOICE, DocumentType.ACT];
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
    "bc61ae605bca79751cacf78091a2a37f40df87d598b2b0f394c3b7484dcf8873",
  "invoice.minimal.ru":
    "d769d6ae2a1aa7989044ef1c720f970587cb7c3a7d5cae05c2d84de30a4cbd91",
  "invoice.minimal.en":
    "8c759fd07165bd2a6ae63a5e92b0be1879a351e37f6455c0076e5934901a0654",
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
    "103b742865196361e14e329919c279b7a4902099d7420a279b83a49f3cb82963",
  "act.minimal.ru":
    "eabd21e21bd953fa5db8c31c5f84816ef400d05d194f509a6b9ead2929477b93",
  "act.minimal.en":
    "8dd4d2940d36fe22d28b8324b9512bd7c3d6b4d33139642e8fb0fa78aeb0f354",
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
      for (const type of TYPES)
        expect(DOCUMENT_TYPE_SPECS[type].layout?.allowedStyles).toEqual(STYLES);
      for (const style of Object.values(ReceiptTemplate)) {
        const types = getTemplateCapabilities(style).documentTypes;
        expect(types.includes("waybill")).toBe(true);
        expect(types.includes("invoice")).toBe(STYLES.includes(style));
        expect(types.includes("act")).toBe(STYLES.includes(style));
      }
    });

    it("refuses every style outside the allowed list", () => {
      for (const style of Object.values(ReceiptTemplate))
        for (const type of TYPES) {
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
