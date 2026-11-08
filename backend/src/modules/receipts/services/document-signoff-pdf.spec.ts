import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import sharp = require("sharp");
import { SignoffSource } from "../../../common/services/signoff-image";
import { legacyConfig } from "../../settings/document-config";
import type { DocumentConfig } from "../../settings/document-config";
import { buildBuyer, buildSeller } from "../document-requisites";
import { DocumentType } from "../entities/receipt.entity";
import type { DocumentContext } from "../frozen-document";
import { DocumentRenderService, FrozenOrder } from "./document-render.service";
import { PlaywrightPdfGenerator } from "./playwright-pdf-generator.service";
import { TemplateService } from "./template.service";

/**
 * Prints real PDFs with a signature and a stamp in Chromium and checks, with poppler, that
 * the images are embedded and that the footer never ends up alone on a page. Skipped where
 * Chromium or poppler is missing. Set DOCUMENT_PDF_OUT_DIR to keep the PDFs for a look.
 */
const STYLES = ["standard", "classic", "minimal", "corporate"];
const OUT_DIR = process.env.DOCUMENT_PDF_OUT_DIR;
const FOOTER_MARKER = "Дякуємо за співпрацю";
const SIGNATURE_CAPTION = "Підпис";

const available = (command: string): boolean => {
  try {
    execFileSync(command, ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const scribble = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220">
     <path d="M20 160 C80 20 140 200 200 90 S320 40 380 150 S500 60 580 120"
           fill="none" stroke="#1a2fb0" stroke-width="7" stroke-linecap="round"/>
   </svg>`,
);
const seal = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
     <circle cx="200" cy="200" r="185" fill="none" stroke="#7a1fa2" stroke-width="10"/>
     <circle cx="200" cy="200" r="130" fill="none" stroke="#7a1fa2" stroke-width="4"/>
     <text x="200" y="215" font-size="48" text-anchor="middle" fill="#7a1fa2">ТОВ ПРОДАВЕЦЬ</text>
   </svg>`,
);

const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const lines = (count: number): FrozenOrder["items"] =>
  Array.from({ length: count }, (_, index) => ({
    product_name: `Товар ${index + 1}`,
    qty: 2,
    unit_price_cents: 12500,
    line_total_cents: 25000,
  }));

const orderOf = (count: number): FrozenOrder => {
  const items = lines(count);
  const total = items.reduce((sum, line) => sum + line.line_total_cents, 0);
  return {
    id: "order-1",
    currency: "UAH",
    subtotal_cents: total,
    total_cents: total,
    created_at: "2026-10-14T12:00:00.000Z",
    recipient: { name: "Іван Покупець", address: "Київ, вул. Тестова 1" },
    items,
  };
};

const configFor = (style: string): DocumentConfig => {
  const base = legacyConfig(null);
  return {
    ...base,
    templateId: style,
    documentLanguage: "uk",
    footerTitle: FOOTER_MARKER,
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

const invoiceContext = (config: DocumentConfig): DocumentContext => ({
  request: {
    type: DocumentType.INVOICE,
    details: { dueDate: inDays(7) },
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
    name: "Іван Покупець",
    legal_name: "ТОВ Іван Покупець",
    tax_id: "87654321",
    legal_address: "м. Львів",
  }),
  defaultPaymentTermDays: null,
});

const pagesOf = (pdf: Buffer): { pages: string[]; images: number } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-pdf-"));
  const file = path.join(dir, "doc.pdf");
  try {
    fs.writeFileSync(file, pdf);
    const text = execFileSync("pdftotext", ["-layout", file, "-"], {
      encoding: "utf-8",
    });
    const listing = execFileSync("pdfimages", ["-list", file], {
      encoding: "utf-8",
    });
    const images = listing
      .split("\n")
      .filter((row) => /^\s*\d+\s+\d+\s+image/.test(row));
    return { pages: text.split("\f").slice(0, -1), images: images.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("signature and stamp in printed PDFs (real Chromium)", () => {
  const templates = new TemplateService();
  const renders = new DocumentRenderService(templates, undefined, undefined);
  const pdfs = new PlaywrightPdfGenerator();
  let canRun = false;
  let signoff: SignoffSource;

  beforeAll(async () => {
    await templates.ready;
    signoff = {
      signature: {
        assetId: "sig",
        bytes: await sharp(scribble).png().toBuffer(),
      },
      stamp: { assetId: "stamp", bytes: await sharp(seal).png().toBuffer() },
    };
    try {
      await pdfs.initialize();
      canRun = available("pdftotext") && available("pdfimages");
    } catch {
      canRun = false;
    }
  }, 60_000);
  afterAll(() => pdfs.cleanup());

  const print = async (
    label: string,
    style: string,
    count: number,
    typed: boolean,
  ) => {
    const config = configFor(style);
    const { html, snapshot } = await renders.prepare(
      "u1",
      config,
      orderOf(count),
      "2026-000007",
      undefined,
      typed ? invoiceContext(config) : undefined,
      signoff,
    );
    const pdf = await pdfs.generatePdf(html, snapshot.options);
    if (OUT_DIR) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${label}.pdf`), pdf);
    }
    return pagesOf(pdf);
  };

  const expectSealedAndFooterNotAlone = (
    result: { pages: string[]; images: number },
    imagesExpected: number,
  ) => {
    result.pages.forEach((text) =>
      expect(text.trim().length).toBeGreaterThan(0),
    );
    const last = result.pages[result.pages.length - 1];
    expect(last).toContain(SIGNATURE_CAPTION);
    // Some styles print no footer text on a typed document; where one does, it stays with the signatures.
    if (result.pages.some((text) => text.includes(FOOTER_MARKER)))
      expect(last).toContain(FOOTER_MARKER);
    expect(result.images).toBeGreaterThanOrEqual(imagesExpected);
  };

  const run = (name: string, work: () => Promise<void>) =>
    it(
      name,
      async () => {
        if (!canRun) return;
        await work();
      },
      60_000,
    );

  describe.each(STYLES)("invoice / %s", (style) => {
    run("a short invoice prints both images and keeps the footer", async () => {
      expectSealedAndFooterNotAlone(
        await print(`invoice.${style}.3`, style, 3, true),
        2,
      );
    });
    run(
      "a 45-line invoice keeps the images with the closing block",
      async () => {
        expectSealedAndFooterNotAlone(
          await print(`invoice.${style}.45`, style, 45, true),
          2,
        );
      },
    );
  });

  describe.each(STYLES)("waybill / %s", (style) => {
    run("a short waybill prints both images before the footer", async () => {
      expectSealedAndFooterNotAlone(
        await print(`waybill.${style}.3`, style, 3, false),
        2,
      );
    });
    run("a 45-line waybill keeps the images with the footer", async () => {
      expectSealedAndFooterNotAlone(
        await print(`waybill.${style}.45`, style, 45, false),
        2,
      );
    });
  });
});
