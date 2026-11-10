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
  | DocumentType.PACKING_LIST
  | DocumentType.QUOTE
  | DocumentType.RETURN_NOTE;
// Invoice and act also have readable snapshots; the other types are checked by content below.
const TYPES: TypedDocument[] = [DocumentType.INVOICE, DocumentType.ACT];
// Every type issued before the quotation has golden digests.
const GOLDEN_TYPES: TypedDocument[] = [
  ...TYPES,
  DocumentType.SALES_RECEIPT,
  DocumentType.PACKING_LIST,
];
const ALL_TYPES: TypedDocument[] = [
  ...GOLDEN_TYPES,
  DocumentType.QUOTE,
  DocumentType.RETURN_NOTE,
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
// The PDF prints the IBAN in groups of four; the stored value has no spaces.
const SELLER_IBAN_PRINTED = "UA21 3223 1300 0002 6007 2335 6600 1";
const XSS = '<script>alert("x")</script>';

// Digests of the rendered HTML; a change here is a visible change to the document.
const GOLDEN_SHA256: Record<string, string> = {
  "invoice.standard.uk":
    "72a48d5569d9df9103bd8e8c25176ae25339c41455c791e183f848b9db4c19a9",
  "invoice.standard.ru":
    "8585aa5cd8043e89cb5b044137c843b847a2baec364fb790e682ed7add1fdf45",
  "invoice.standard.en":
    "5c8b8592203aa554e80e177a34dce6ed345b803b17e71f843067df55b7721a89",
  "invoice.classic.uk":
    "006e7a8c17f2c6ff9c89d8b8ea9acad5fc1f933d6671cda0e927d6cb73fda118",
  "invoice.classic.ru":
    "45352f887156c7bbb0263cee0e5924db01adc3965b6477df4693e227483b5b24",
  "invoice.classic.en":
    "900678a65ddebd5b73d200545d1af73d2844eb9538711927d65ba96daff551f3",
  "invoice.minimal.uk":
    "c486f61aff8f9aeb461f030376f2cab73b7483457b4a57f8119e086af1627dd0",
  "invoice.minimal.ru":
    "1f8664d7120e55d21fe3ea2e5a13a4575c977c68fe009427582e35aa99b151e4",
  "invoice.minimal.en":
    "c385c46d37126caa8492b028470ff724b8b9b93937908328aa4649689cb2254d",
  "invoice.corporate.uk":
    "0a97701d9c4952ef8fbf85b65f3c47205c5e7d1103ee7bea4b79542a8b6c90cf",
  "invoice.corporate.ru":
    "69f1fcdfeb36d8c0097452eebe05b918ecadf3224a385db54f6eeefde628cd2b",
  "invoice.corporate.en":
    "073bc5887d1e4487bb2f303f41e4858f128e066f57545135d9f2a63db7ba75bd",
  "act.standard.uk":
    "943404607324f0b4d7905e02474e1f697f177dbe108ca2d6ebd796a14e91d3fa",
  "act.standard.ru":
    "b3e64fef5d3c666dda570ca1c50663ee1cc0ff96ca5c0886ab8fc1bef9907421",
  "act.standard.en":
    "ebcbaf3931a1b35febb71a5ed09d36648a9968b86c81e5f17f713fe1d95a49d7",
  "act.classic.uk":
    "853047c213630e88ebc94253c57f8bc9a46c2e667dfb4dfff100c579e0f4ddcb",
  "act.classic.ru":
    "e8360ef6ba876a0b647fb533b0b1c39293e3b10a7c898d47465f7d88ebcce69c",
  "act.classic.en":
    "4df67dd9db717a929e4c6e12e845a632df7437a7bc30a0ad40f0c57843c11acd",
  "act.minimal.uk":
    "0cedde9f9452f3ca0db26a2ecaa6619ce41d55b219dab3ed19fd679ea02ff70b",
  "act.minimal.ru":
    "05eeffe27e023a07f5a6d258d9d9c74f8697db4a49b2971c62bdd5a0554bbc47",
  "act.minimal.en":
    "cc2e901f651412ec96b849944930c45577b9429737980618d1ccb5e2b34f64e7",
  "act.corporate.uk":
    "3ef89d1f592b5e84e215f88bd200dbce2342e6429df9e8bbf3ffde4bba5953af",
  "act.corporate.ru":
    "e65677c3ed203347c2693693e823fcd769970d4218d256e1b7ded1e53cf00eda",
  "act.corporate.en":
    "2cd30ef611646a70c3ef07312492508fc09892e1f81c30f684373f1000ff58ec",
  "sales_receipt.standard.uk":
    "73a58fabe7f85d45ca8f158b5a08c373c1fbdccd824421c09d38b09ee67fece6",
  "sales_receipt.standard.ru":
    "43ebc1365486d943a23a3a099734491b7fe609018ff5e9a96e11f62640767e61",
  "sales_receipt.standard.en":
    "500d470defab15e1461f36c0eca842f716c52c25f8a5821993a53150cfe1ceba",
  "sales_receipt.classic.uk":
    "c32b532901072889c863f393e43144f752e45f4c4a765be3c5de5640e60c4608",
  "sales_receipt.classic.ru":
    "762131de53f8db0d675e27654b18d788bc794c2f779eeabe40b1d1e84c5558ac",
  "sales_receipt.classic.en":
    "4e45a884bf41bd7b0c3558f944e9b141a5db6eeed773aab96873b6525b1983a1",
  "sales_receipt.minimal.uk":
    "033b7b54ff83f1bdd2d496571cbeba70842c415c06a5250acdc2ebe4e88e083d",
  "sales_receipt.minimal.ru":
    "56d8d0a0e25a4c2cfe7b621f4f8d3cbc0c69e7d5fbd7bf0ec46e4f7e223e6384",
  "sales_receipt.minimal.en":
    "c228609e786f32c1502977795e9a4b4b2500b6af921351c9de216f4f08077e3f",
  "sales_receipt.corporate.uk":
    "f19fbe99ed375565b7e16715892e9d827f2a33140634f36bb39ac6544ce0a306",
  "sales_receipt.corporate.ru":
    "af263c5cfda0b0b5f99e1eeee2bcb51ed46e760f975c1dba8c4f217ed19c01b9",
  "sales_receipt.corporate.en":
    "f1d02f72508ec5204cdb06ec6d636d4cbc3c1b34e5f0d7e79072b02d1655a916",
  "packing_list.standard.uk":
    "8fd42cd1286f9d5ed4f92314469cf3aba9afaece88e6ed99724b1b212c2e41ec",
  "packing_list.standard.ru":
    "a06d648ef4b986cff20dd9287a8293f3ef5e81f99aa603dd6a326c258d2b5c6f",
  "packing_list.standard.en":
    "36f84e87e43cb9e7cab9162e2acfcee2bcb81b9222bd00a00c2b007c1be68baa",
  "packing_list.classic.uk":
    "b9c4500fec91125830f901c1c666d7429a8d083674c9ae27c931ac2d08c82103",
  "packing_list.classic.ru":
    "56caec70582b92a035c882498e8be3afa52fdbd8bb69a6c53d90b3250208961c",
  "packing_list.classic.en":
    "9bcdd22bc8c2c3fcce69ed5986ebba5ae73f1b99a42e503c770cca30bda8076d",
  "packing_list.minimal.uk":
    "b794859ea7973f9d639a490762e22e80ef01a93bde9a554198ca1e603a4eed81",
  "packing_list.minimal.ru":
    "70903b4de744e087a11ed9c0b5d95a94220dffc17bc3a92938c022b529277ff1",
  "packing_list.minimal.en":
    "e6afb662080e776b04f9e26f6e6cc125e2474cb436b7f9313166bc3320d691f0",
  "packing_list.corporate.uk":
    "a1d608a644a776a4c2789f50c2a260ca58cc9c4274204d3146f5a30e17e92450",
  "packing_list.corporate.ru":
    "54b52eb6095a61e59bf45f2e92f5f059f14a7c11f3bd5d300548183731a43503",
  "packing_list.corporate.en":
    "74f283ccd5cef7c39e8df264b9169520f2dc92872d9a45c941f2880f857703b3",
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

const quoteDetails = {
  validUntil: "2026-10-29",
  paymentTerms: "50% передоплата, решта після поставки",
  deliveryTerms: "Самовивіз зі складу",
};

const returnDetails = {
  lines: [{ orderItemId: "item-1", qty: 1 }],
  reason: "Не підійшов розмір",
};
const returnSource = {
  kind: "waybill" as const,
  number: "2026-000003",
  date: "2026-10-10",
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
        : type === DocumentType.QUOTE
          ? { ...quoteDetails }
          : type === DocumentType.RETURN_NOTE
            ? { ...returnDetails }
            : { dueDate: "2026-10-20" },
  },
  ...(type === DocumentType.RETURN_NOTE ? { returnSource } : {}),
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
    const cases = GOLDEN_TYPES.flatMap((type) =>
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
      en: "Not a fiscal receipt; does not replace a settlement document issued by a cash register (RRO/PRRO).",
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
        // Number (Corporate only), description, unit of measure, quantity.
        expect(header.match(/<th\b/g)?.length).toBeLessThanOrEqual(4);
        expect(header).toContain(DOCUMENT_LABELS.uk.unitOfMeasure);
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
          const withoutNotices = Object.values(NOTICES).reduce(
            (rest, notice) => rest.split(notice).join(""),
            html,
          );
          expect(withoutNotices).not.toMatch(
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

  describe("quotation", () => {
    const cases = STYLES.flatMap((style) =>
      LANGUAGES.map((language) => [style, language] as const),
    );
    const TITLES = {
      uk: "Комерційна пропозиція",
      ru: "Коммерческое предложение",
      en: "Quotation",
    };
    const NOTICE_START = {
      uk: "Комерційна пропозиція не є рахунком",
      ru: "Коммерческое предложение не является счётом",
      en: "This quotation is not an invoice",
    };
    const VALID_UNTIL = {
      uk: "Пропозиція дійсна до",
      ru: "Предложение действительно до",
      en: "Valid until",
    };

    it.each(cases)(
      "%s / %s carries title, notice, validity, terms and VAT but no payment details",
      async (style, language) => {
        const html = await render(DocumentType.QUOTE, style, language);
        const labels = DOCUMENT_LABELS[language];
        expect(html).toContain(TITLES[language]);
        expect(html).toContain('class="doc-notice"');
        expect(html).toContain(NOTICE_START[language]);
        expect(html).toContain(VALID_UNTIL[language]);
        expect(html).toContain(labels.paymentTerms);
        expect(html).toContain(quoteDetails.paymentTerms);
        expect(html).toContain(labels.deliveryTerms);
        expect(html).toContain(quoteDetails.deliveryTerms);
        expect(html).toContain(`${labels.vatIncluded} (20%)`);
        expect(html).toContain(labels.offerTotal);
        expect(html).toContain(labels.fromSupplier);
        expect(html).not.toContain(labels.paymentDetails);
        expect(html).not.toContain(SELLER_IBAN);
        expect(html).not.toContain(labels.dueDate);
        expect(html).not.toContain("Всього до сплати");
        expect(html).not.toContain("Всего к оплате");
        expect(html).not.toContain("Total due");
        expect(html).not.toContain("{{");
      },
    );

    it("calls the delivery condition 'supply' (поставки) in every language", () => {
      expect(DOCUMENT_LABELS.uk.deliveryTerms).toBe("Умови поставки");
      expect(DOCUMENT_LABELS.ru.deliveryTerms).toBe("Условия поставки");
      expect(DOCUMENT_LABELS.en.deliveryTerms).toBe("Delivery terms");
    });

    it("prints the validity date in the document language", async () => {
      const html = await render(DocumentType.QUOTE, "standard", "uk");
      expect(html).toContain("29 жовтня 2026 р.");
    });

    it("omits the terms that were not given", async () => {
      const config = configFor("standard", "uk");
      const context: DocumentContext = {
        ...contextFor(DocumentType.QUOTE, config),
        request: {
          type: DocumentType.QUOTE,
          details: { validUntil: "2026-10-29" },
        },
      };
      const html = await render(
        DocumentType.QUOTE,
        "standard",
        "uk",
        order(),
        context,
      );
      expect(html).toContain("Пропозиція дійсна до");
      expect(html).not.toContain("Умови оплати");
      expect(html).not.toContain("Умови поставки");
    });

    it("escapes hostile text in the terms", async () => {
      for (const style of STYLES) {
        const config = configFor(style, "uk");
        const context: DocumentContext = {
          ...contextFor(DocumentType.QUOTE, config),
          request: {
            type: DocumentType.QUOTE,
            details: {
              validUntil: "2026-10-29",
              paymentTerms: XSS,
              deliveryTerms: XSS,
            },
          },
        };
        const html = await render(
          DocumentType.QUOTE,
          style,
          "uk",
          order(),
          context,
        );
        expect(html).not.toContain("<script>alert");
        expect(html).toContain("&lt;script&gt;");
      }
    });

    it("keeps the quotation's wording out of the other types and theirs out of it", async () => {
      for (const type of GOLDEN_TYPES) {
        const html = await render(type, "standard", "uk");
        expect(html).not.toContain(NOTICE_START.uk);
        expect(html).not.toContain("Пропозиція дійсна до");
        expect(html).not.toContain("Загальна вартість");
      }
      const quote = await render(DocumentType.QUOTE, "standard", "uk");
      expect(quote).not.toContain("Не є фіскальним документом");
    });

    it("titles the document and numbers it through the style labels", async () => {
      const html = await render(DocumentType.QUOTE, "classic", "uk");
      expect(html).toContain("Номер пропозиції:");
      expect(html).not.toContain("Номер рахунку:");
    });
  });

  describe("return note", () => {
    const cases = STYLES.flatMap((style) =>
      LANGUAGES.map((language) => [style, language] as const),
    );
    const TITLES = {
      uk: "Накладна на повернення товару",
      ru: "Накладная на возврат товара",
      en: "Goods Return Note",
    };
    const NOTICES = {
      uk: "Документ підтверджує повернення товару покупцем. Не є фіскальним документом і не є розрахунком коригування до податкової накладної.",
      ru: "Документ подтверждает возврат товара покупателем. Не является фискальным документом и не является расчётом корректировки к налоговой накладной.",
      en: "This document confirms that the buyer returned the goods. It is not a fiscal document and not an adjustment calculation to a tax invoice.",
    };
    const returned = order({
      subtotal_cents: 27500,
      total_cents: 27500,
      items: [
        {
          product_name: "Консультація",
          qty: 1,
          unit_price_cents: 27500,
          line_total_cents: 27500,
        },
      ],
    });
    const renderNote = (
      style: string,
      language: DocumentLanguage,
      details: DocumentContext["request"]["details"] = returnDetails,
    ) => {
      const config = configFor(style, language);
      return render(DocumentType.RETURN_NOTE, style, language, returned, {
        ...contextFor(DocumentType.RETURN_NOTE, config),
        request: { type: DocumentType.RETURN_NOTE, details },
      });
    };

    it.each(cases)(
      "%s / %s carries title, notice, source, reason, VAT and the return wording",
      async (style, language) => {
        const html = await renderNote(style, language);
        const labels = DOCUMENT_LABELS[language];
        expect(html).toContain(TITLES[language]);
        expect(html).toContain(NOTICES[language]);
        expect(html).toContain(labels.returnTotal);
        expect(html).toContain(labels.returnSource);
        expect(html).toContain(`${labels.returnSourceWaybill} 2026-000003`);
        expect(html).toContain(labels.returnReason);
        expect(html).toContain("Не підійшов розмір");
        expect(html).toContain(`${labels.vatIncluded} (20%)`);
        expect(html).toContain(labels.amountInWords);
        expect(html).toContain(labels.receivedBy);
        expect(html).toContain(labels.returnedBy);
        expect(html).toContain("Консультація");
        expect(html).not.toContain("Розробка сайту");
        expect(html).not.toContain(labels.paymentDetails);
        expect(html).not.toContain(SELLER_IBAN);
        expect(html).not.toContain(labels.stamp);
        expect(html).not.toContain(labels.dueDate);
        expect(html).not.toContain(labels.grandTotal);
        expect(html).not.toContain("{{");
      },
    );

    it("prints the returned value, not the order total", async () => {
      const html = await renderNote("standard", "uk");
      expect(html).toMatch(/275[.,]00/);
      expect(html).not.toMatch(/2[\s\u00a0,.]?050[.,]50/);
    });

    it("omits the reason when none was given and names an invoice or the order as the source", async () => {
      const bare = await renderNote("standard", "uk", {
        lines: returnDetails.lines,
      });
      expect(bare).not.toContain(DOCUMENT_LABELS.uk.returnReason);
      const config = configFor("standard", "uk");
      for (const [kind, label] of [
        ["invoice", DOCUMENT_LABELS.uk.returnSourceInvoice],
        ["order", DOCUMENT_LABELS.uk.returnSourceOrder],
      ] as const) {
        const html = await render(
          DocumentType.RETURN_NOTE,
          "standard",
          "uk",
          returned,
          {
            ...contextFor(DocumentType.RETURN_NOTE, config),
            returnSource: { kind, number: "12", date: "2026-10-02" },
          },
        );
        expect(html).toContain(`${label} 12 від 2 жовтня 2026 р.`);
      }
    });

    it("numbers the document through the style labels", async () => {
      const html = await renderNote("classic", "uk");
      expect(html).toContain("Номер накладної на повернення:");
      expect(html).not.toContain("Номер рахунку:");
    });

    it("escapes hostile text in the reason", async () => {
      for (const style of STYLES) {
        const html = await renderNote(style, "uk", {
          lines: returnDetails.lines,
          reason: XSS,
        });
        expect(html).not.toContain("<script>alert");
        expect(html).toContain("&lt;script&gt;");
      }
    });

    it("keeps its wording out of every other type", async () => {
      for (const type of [...GOLDEN_TYPES, DocumentType.QUOTE] as const) {
        const html = await render(type, "standard", "uk");
        expect(html).not.toContain(NOTICES.uk);
        expect(html).not.toContain(DOCUMENT_LABELS.uk.returnSource);
        expect(html).not.toContain(DOCUMENT_LABELS.uk.returnTotal);
      }
    });

    it("never calls the note a cash or fiscal receipt", async () => {
      for (const language of LANGUAGES) {
        const html = await renderNote("standard", language);
        expect(
          html.replace(
            /Не є фіскальним документом|Не является фискальным документом|not a fiscal document/g,
            "",
          ),
        ).not.toMatch(/касов|кассов|\bcash\b|fiscal receipt|фіскальн\S* чек/i);
      }
    });
  });

  describe("content", () => {
    it.each(STYLES)("%s invoice: payment block, due date, words", async (s) => {
      const html = await render(DocumentType.INVOICE, s, "uk");
      expect(html).toContain("Реквізити для оплати");
      expect(html).toContain(SELLER_IBAN_PRINTED);
      expect(html).toContain("від 15.10.2026");
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

    it.each(STYLES)(
      "%s prints a unit of measure on every line of every typed document",
      async (style) => {
        for (const type of ALL_TYPES) {
          const html = await render(type, style, "uk");
          const labels = DOCUMENT_LABELS.uk;
          const unit =
            type === DocumentType.ACT ? labels.unitService : labels.unitPiece;
          expect(html).toContain(
            `<th class="doc-unit">${labels.unitOfMeasure}</th>`,
          );
          const cells = html.match(/<td class="doc-unit">([^<]*)<\/td>/g);
          expect(cells?.length).toBe(order().items.length);
          for (const cell of cells ?? []) expect(cell).toContain(`>${unit}<`);
        }
      },
    );

    it.each(STYLES)(
      "%s names the act's lines as works and every other type's neutrally",
      async (style) => {
        const labels = DOCUMENT_LABELS.uk;
        const act = await render(DocumentType.ACT, style, "uk");
        expect(act).toContain(`>${labels.workDescription}</th>`);
        for (const type of [
          DocumentType.INVOICE,
          DocumentType.PACKING_LIST,
        ] as const) {
          const html = await render(type, style, "uk");
          expect(html).toContain(`>${labels.itemDescription}</th>`);
          expect(html).not.toContain("Назва товару");
        }
      },
    );

    it.each(STYLES)(
      "%s leaves the buyer's signatory a captioned line for position and name",
      async (style) => {
        for (const type of [
          DocumentType.ACT,
          DocumentType.PACKING_LIST,
          DocumentType.RETURN_NOTE,
        ] as const) {
          const html = await render(type, style, "uk");
          expect(html).toContain('class="doc-sign-line doc-sign-line-name"');
          expect(html).toContain(
            `<div class="doc-sign-caption">${DOCUMENT_LABELS.uk.positionAndName}</div>`,
          );
        }
        const invoice = await render(DocumentType.INVOICE, style, "uk");
        expect(invoice).not.toContain(DOCUMENT_LABELS.uk.positionAndName);
      },
    );

    it("prints the seller's SWIFT nowhere, and the IBAN once", async () => {
      for (const style of STYLES) {
        const html = await render(DocumentType.INVOICE, style, "uk");
        expect(html).not.toContain("SWIFTUA2X");
        expect(html.split(SELLER_IBAN_PRINTED).length - 1).toBe(1);
        expect(html).not.toContain(SELLER_IBAN);
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

  describe("Original mark and footer in the corporate style", () => {
    const ORIGINAL = { uk: "Оригінал", ru: "Оригинал", en: "Original" };
    const renderWith = async (
      type: TypedDocument,
      language: DocumentLanguage,
      footer: { footerTitle?: string; footerSubtitle?: string } = {},
      style = "corporate",
    ) => {
      const config = { ...configFor(style, language), ...footer };
      const { html } = await renders.prepare(
        "u1",
        config,
        order(),
        "2026-000007",
        Buffer.from("logo"),
        contextFor(type, config),
      );
      return html;
    };

    it.each(LANGUAGES)(
      "prints the mark on invoice, act and packing list, not on sales receipt, quotation or return note (%s)",
      async (language) => {
        const marked: TypedDocument[] = [
          DocumentType.INVOICE,
          DocumentType.ACT,
          DocumentType.PACKING_LIST,
        ];
        const unmarked: TypedDocument[] = [
          DocumentType.SALES_RECEIPT,
          DocumentType.QUOTE,
          DocumentType.RETURN_NOTE,
        ];
        for (const type of marked)
          expect(await renderWith(type, language)).toContain(
            `document-type-right">${ORIGINAL[language]}<`,
          );
        for (const type of unmarked)
          expect(await renderWith(type, language)).not.toContain(
            'class="document-type-right"',
          );
      },
    );

    it.each(STYLES)(
      "no style prints the word on a sales receipt (%s)",
      async (style) => {
        for (const language of LANGUAGES)
          expect(
            await renderWith(DocumentType.SALES_RECEIPT, language, {}, style),
          ).not.toContain(`>${ORIGINAL[language]}<`);
      },
    );

    it("prints the user's footer text on a typed document", async () => {
      const html = await renderWith(DocumentType.INVOICE, "uk", {
        footerTitle: "Дякуємо за співпрацю",
        footerSubtitle: "Гаряча лінія 0 800 000 000",
      });
      expect(html).toContain("Дякуємо за співпрацю");
      expect(html).toContain("Гаряча лінія 0 800 000 000");
    });

    it("prints a lone subtitle, and nothing when no footer is set", async () => {
      const lone = await renderWith(DocumentType.ACT, "uk", {
        footerSubtitle: "Тільки підзаголовок",
      });
      expect(lone).toContain("Тільки підзаголовок");
      const none = await renderWith(DocumentType.ACT, "uk");
      expect(none).not.toContain('class="footer-section"');
    });
  });
});
