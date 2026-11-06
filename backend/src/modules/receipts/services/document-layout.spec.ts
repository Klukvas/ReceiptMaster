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
const XSS = '<script>alert("x")</script>';

// Digests of the rendered HTML; a change here is a visible change to the document.
const GOLDEN_SHA256: Record<string, string> = {
  "invoice.standard.uk":
    "6bafcf978010092a57b5a0dd1819dd52a3f6ededeb5b5c99f705329aa8345d9c",
  "invoice.standard.ru":
    "7a0f140ba57a56a7c4717135e8828a7d51300688940ef944bf62034bc0cc0abe",
  "invoice.standard.en":
    "fd13357abaf832e9bc5d358c8665667a85800f2e1a01d84a0c0bb320d469b544",
  "invoice.classic.uk":
    "4226b16bf90aee6494bde04ba4809a5ca265cab6ebcb42ee869788f438732e25",
  "invoice.classic.ru":
    "cec829276b4732e9ef20b7c6a5c6856d07cdfb76ea2db704c2389580de03ec3b",
  "invoice.classic.en":
    "54c968dd257c8970847c45954103dcba8c53890063e4e38a4c040e537f569be3",
  "invoice.minimal.uk":
    "0d7004d227b1c3400cb81bbb5dd037b9d4c7190d98e7491fe30843df49da4252",
  "invoice.minimal.ru":
    "000d18b27753d7eba5d69b97e0e0cbd552e96d2292e7eb7ee8109d47b31b1230",
  "invoice.minimal.en":
    "00e3cb504b025068ad33b8f08c10c51e227f7bcbf5880a45b2cd6a1a0cff3ef1",
  "invoice.corporate.uk":
    "f86dbaae1e79be62fbc6eb97598f3c94861a3609a3689851522c9193ce9683bc",
  "invoice.corporate.ru":
    "0bb6122588f81f88fa0ffb8d28270879c3d43a20295bc0be6c636f6b4984b891",
  "invoice.corporate.en":
    "b74e131b942d653282d4e78383bf78b684d6db7c7f77e11be5483e1db5559d5f",
  "act.standard.uk":
    "1f628564df59d65b87d72c7912a0324e7ed5c6fe15e67c080df98f5daeddda33",
  "act.standard.ru":
    "913843b4d51dcc1d429003e8b836c2fdec152faa50711ca1dbf632e634ed8fff",
  "act.standard.en":
    "b4def70f0757c8dbefe7f248cfc394d721aaa359a7648f6a22955f5f20dc6946",
  "act.classic.uk":
    "2fdad5d53ef8589a3121f122f3604f9d976caf44068682f16ba22eb241541a7f",
  "act.classic.ru":
    "9d3e73a5801410760a559be63eea0f780c2000443462b63ba1356cf972aab639",
  "act.classic.en":
    "75399f213b65a2998bb150085211efc282e35a6a996a042e4fe5e12b9305e586",
  "act.minimal.uk":
    "64443491ff80201c1dff1e5d87c0fb371b95c66d4673a4d8c0f7f1d5fbe310df",
  "act.minimal.ru":
    "5e8f2b8cb844be8ec609737d3c35fdcef3a7baa55a07df6d1f7b8825f3b1da05",
  "act.minimal.en":
    "52eaee5151745a27caf2dce902fcd9ff29d2aeca1ef44f68db8ca8f123a2231c",
  "act.corporate.uk":
    "0995c60e36ee7057e11157e62732c3a4b328b4a997a4e63ab7103211ccab4d4b",
  "act.corporate.ru":
    "f248654be84dd6e3bd5c34567be9c86c306c458a517992cc194aa3619d9cc938",
  "act.corporate.en":
    "c5eebfea657a877709a4fb1b77e99d8df034cf696b3ccba7b3b52706625348dd",
  "sales_receipt.standard.uk":
    "2b57fc82f632f6a17e25867c07707e9c3a09e19fdeb4837dd5c4cbf362027c64",
  "sales_receipt.standard.ru":
    "48681ecfc65859e6b777bcdb4f03e3a2d9739bb3e328b0bf77c891fe424b341f",
  "sales_receipt.standard.en":
    "ebde1e0d3c5caa6d2a2b31e2d0bb092143e8f4f824cc33fd340046019710d6f4",
  "sales_receipt.classic.uk":
    "b760a599a2c50bb10f90b4190efd40f422882f55cc2f4a698f54fc56934a1255",
  "sales_receipt.classic.ru":
    "01de20a7242b945a999f16a545352d75a6cea78e075602fa814f3c451a118d2d",
  "sales_receipt.classic.en":
    "44dcf7de93276cf18728377e5b474c9a6bb622dc0da2ec1f9f1a2e8a29dfff30",
  "sales_receipt.minimal.uk":
    "3a8a91b8e3b6f5bc2655a7afd7af695b4a60e67e24cac356b83fe76f14da8b66",
  "sales_receipt.minimal.ru":
    "39f894603bda03c61b572301273d54f16a8afa4104d710acfc654733b528ca29",
  "sales_receipt.minimal.en":
    "cb6058e35877712769469effe4dfaa1e96d81f04792ecfdab3f07015c16531e1",
  "sales_receipt.corporate.uk":
    "bd47d494b606cad3409b20a61642ad5721ade09141a0acc409c6a54d9c03fd79",
  "sales_receipt.corporate.ru":
    "c5a2d632c33c61c8d1dacbb5bc603bbd4b6803bd2fb8f9c47ef24040698ae65d",
  "sales_receipt.corporate.en":
    "34b68dda78207f689b4c950fdda16be11d4d4c2d2372d591606f6c07b82e6e36",
  "packing_list.standard.uk":
    "1d1ed3dda0e0dac938bab901724552ee0c1baf093dcb8d72e397e153c1adf833",
  "packing_list.standard.ru":
    "bf8fde39c308e224c98572b32e115df12314a416be1f6149578ac1e614937208",
  "packing_list.standard.en":
    "9559061768bfc8c29e500eec793c3b63163299f78d128f2b85d52c81e5f7df42",
  "packing_list.classic.uk":
    "4ad52dcf1470da4588d927ecd5488a75af72aecdfccc9c1308e00f5fbb95cb0f",
  "packing_list.classic.ru":
    "ec64f8449c6acc50c75a0a1e00429d8155f1c71c15dd448a0b3837331056e16e",
  "packing_list.classic.en":
    "ef521510365ed5413dac76086b6e91b5e8bd3f17adf4a1c240a771608f04859f",
  "packing_list.minimal.uk":
    "7fee9ae7841724a3138301afbb9681b54547c2e19532ca9b5d27c3965b1f6039",
  "packing_list.minimal.ru":
    "c35c4450539c50206cfc753a6f2114dabfd8c1fc3333de4c9e6413376dbf82fa",
  "packing_list.minimal.en":
    "04388c6120dead79826d60e6a6771e0bc7974328957fd9266d01b7335d22d3c4",
  "packing_list.corporate.uk":
    "6a518fded11b6beaa38b07d79124b1748a1280317b8aab0cf9f669232227aa1d",
  "packing_list.corporate.ru":
    "9a793c3ea4dddabab423708ec81e7f58af0f11765fe3d00f2366863a3b64d962",
  "packing_list.corporate.en":
    "10286477140332a535ed50c7e5c92f59ad7fc5a4e51f05f0fde3e5b205d3182d",
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
      uk: "Пропозиція не є рахунком",
      ru: "Предложение не является счётом",
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
