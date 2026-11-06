import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { DocumentLanguage } from "../document-types";
import { DocumentType } from "../entities/receipt.entity";
import type { DocumentContext } from "../frozen-document";
import { DocumentRenderService, FrozenOrder } from "./document-render.service";
import { PlaywrightPdfGenerator } from "./playwright-pdf-generator.service";
import { TemplateService } from "./template.service";

/**
 * Prints real PDFs in Chromium and reads their pages back with poppler, because a
 * footer that falls alone onto its own page is a pagination effect that HTML digests
 * cannot show. Skipped where Chromium or poppler is not installed. Set
 * DOCUMENT_PDF_OUT_DIR to keep the PDFs for a visual check.
 */
const LONG_TEXT =
  `${"Умови, які розтягуються на кілька рядків. ".repeat(8)}`.slice(0, 300);
const STYLES = ["standard", "classic", "minimal", "corporate"];
const LANGUAGE: DocumentLanguage = "uk";
const OUT_DIR = process.env.DOCUMENT_PDF_OUT_DIR;

const hasPoppler = (): boolean => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const items = (count: number, name: string): FrozenOrder["items"] =>
  Array.from({ length: count }, (_, index) => ({
    product_name: `${name} ${index + 1}`,
    qty: 2,
    unit_price_cents: 12500,
    line_total_cents: 25000,
  }));

const longItems = (count: number): FrozenOrder["items"] =>
  Array.from({ length: count }, (_, index) => ({
    product_name: `Позиція ${index + 1}: ${"дуже довга назва товару ".repeat(14)}`,
    qty: 3,
    unit_price_cents: 99900,
    line_total_cents: 299700,
  }));

const orderOf = (lines: FrozenOrder["items"]): FrozenOrder => {
  const total = lines.reduce((sum, line) => sum + line.line_total_cents, 0);
  return {
    id: "order-1",
    currency: "UAH",
    subtotal_cents: total,
    total_cents: total,
    created_at: "2026-10-14T12:00:00.000Z",
    recipient: { name: "Іван Покупець", address: "Київ, вул. Тестова 1" },
    items: lines,
  };
};

const configFor = (style: string): DocumentConfig => {
  const base = legacyConfig(null);
  return {
    ...base,
    templateId: style,
    documentLanguage: LANGUAGE,
    footerTitle: "Дякуємо за співпрацю",
    footerSubtitle: "Питання — пишіть нам",
    company: {
      ...base.company,
      companyName: "Продавець",
      companyAddress: "Київ, вул. Продавця 1",
      companyTaxId: "12345678",
      companyIban: "UA213223130000026007233566001",
      companyEmail: "sales@example.com",
    },
  };
};

const contextOf = (
  type:
    | DocumentType.QUOTE
    | DocumentType.INVOICE
    | DocumentType.SALES_RECEIPT
    | DocumentType.PACKING_LIST
    | DocumentType.RETURN_NOTE,
  config: DocumentConfig,
  withTerms: boolean,
): DocumentContext => ({
  request: {
    type,
    details:
      type === DocumentType.QUOTE
        ? {
            validUntil: inDays(14),
            ...(withTerms
              ? { paymentTerms: LONG_TEXT, deliveryTerms: LONG_TEXT }
              : {}),
          }
        : type === DocumentType.RETURN_NOTE
          ? {
              lines: [{ orderItemId: "item-1", qty: 1 }],
              reason: LONG_TEXT,
            }
          : { dueDate: inDays(7) },
  },
  ...(type === DocumentType.RETURN_NOTE
    ? {
        returnSource: {
          kind: "waybill" as const,
          number: "2026-000003",
          date: "2026-10-10",
        },
      }
    : {}),
  seller: buildSeller(config.company, {
    companyLegalForm: "ТОВ",
    companyBankName: "АТ Банк",
    companyVatPayer: true,
    companyVatId: "123456789012",
    companySignatoryName: "Петренко Петро",
    companySignatoryPosition: "Директор",
  }),
  buyer: buildBuyer({
    name: "Іван Покупець",
    legal_name: "ТОВ Іван Покупець",
    tax_id: "87654321",
    legal_address: "м. Львів",
  }),
  defaultPaymentTermDays: null,
});

const pdfPages = (pdf: Buffer): string[] => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-pages-"));
  const file = path.join(dir, "doc.pdf");
  try {
    fs.writeFileSync(file, pdf);
    const text = execFileSync("pdftotext", ["-layout", file, "-"], {
      encoding: "utf-8",
    });
    return text.split("\f").slice(0, -1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const FOOTER_MARKER = "Дякуємо за співпрацю";
const SIGNATURE_CAPTION = "Підпис";

describe("typed document pagination (real Chromium)", () => {
  const templates = new TemplateService();
  const renders = new DocumentRenderService(templates, undefined, undefined);
  const pdfs = new PlaywrightPdfGenerator();
  let canRun = false;

  beforeAll(async () => {
    await templates.ready;
    try {
      await pdfs.initialize();
      canRun = hasPoppler();
    } catch {
      canRun = false;
    }
  }, 60_000);
  afterAll(() => pdfs.cleanup());

  const print = async (
    label: string,
    type: Parameters<typeof contextOf>[0],
    style: string,
    lines: FrozenOrder["items"],
    withTerms = true,
  ): Promise<string[]> => {
    const config = configFor(style);
    const { html, snapshot } = await renders.prepare(
      "u1",
      config,
      orderOf(lines),
      "2026-000007",
      undefined,
      contextOf(type, config, withTerms),
    );
    const pdf = await pdfs.generatePdf(html, snapshot.options);
    if (OUT_DIR) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${label}.pdf`), pdf);
    }
    return pdfPages(pdf);
  };

  // The signatures close the document body: the last page must still carry them, so the
  // footer (when the style prints one) can never be the only thing on a page.
  const expectFooterNotAlone = (pages: string[]) => {
    pages.forEach((text) => expect(text.trim().length).toBeGreaterThan(0));
    const last = pages[pages.length - 1];
    expect(last).toContain(SIGNATURE_CAPTION);
    if (pages.some((text) => text.includes(FOOTER_MARKER))) {
      expect(last).toContain(FOOTER_MARKER);
    }
  };

  const run = (name: string, fn: () => Promise<void>) =>
    it(
      name,
      async () => {
        if (!canRun) return;
        await fn();
      },
      60_000,
    );

  describe.each(STYLES)("quotation / %s", (style) => {
    run("45 lines with terms keeps the footer with its content", async () => {
      expectFooterNotAlone(
        await print(
          `quote.${style}.45`,
          DocumentType.QUOTE,
          style,
          items(45, "Товар"),
        ),
      );
    });
    run(
      "3 long lines with long terms keeps the footer with its content",
      async () => {
        expectFooterNotAlone(
          await print(
            `quote.${style}.long3`,
            DocumentType.QUOTE,
            style,
            longItems(3),
          ),
        );
      },
    );
  });

  describe.each([
    DocumentType.INVOICE,
    DocumentType.SALES_RECEIPT,
    DocumentType.PACKING_LIST,
  ] as const)("%s", (type) => {
    run.call(
      null,
      `${type}: many lines keep the footer with its content`,
      async () => {
        expectFooterNotAlone(
          await print(
            `${type}.standard.45`,
            type,
            "standard",
            items(45, "Товар"),
          ),
        );
      },
    );
  });

  describe.each(STYLES)("goods return note / %s", (style) => {
    run("45 lines keep the footer with its content", async () => {
      expectFooterNotAlone(
        await print(
          `return_note.${style}.45`,
          DocumentType.RETURN_NOTE,
          style,
          items(45, "Товар"),
        ),
      );
    });
    run("3 long lines keep the footer with its content", async () => {
      expectFooterNotAlone(
        await print(
          `return_note.${style}.long3`,
          DocumentType.RETURN_NOTE,
          style,
          longItems(3),
        ),
      );
    });
  });
});
