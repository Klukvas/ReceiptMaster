/** Offline real settings -> logo -> production PDF generation. No remote services. */
import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import sharp = require("sharp");
import { mkdir, writeFile } from "fs/promises";
import * as path from "path";
import { Repository } from "typeorm";
import { chromium } from "playwright";
import { SettingsService } from "../src/modules/settings/services/settings.service";
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { CacheService } from "../src/common/services/cache.service";
import { LogoStorageService } from "../src/common/services/logo-storage.service";
import { PdfStorageService } from "../src/common/services/pdf-storage.service";
import {
  TemplateService,
  ReceiptTemplate,
} from "../src/modules/receipts/services/template.service";
import {
  PdfGeneratorService,
  ReceiptStyle,
} from "../src/modules/receipts/services/pdf-generator.service";
import { PlaywrightPdfGenerator } from "../src/modules/receipts/services/playwright-pdf-generator.service";
import { Order } from "../src/modules/orders/entities/order.entity";
import assert = require("assert/strict");

async function main() {
  const output = path.resolve(process.argv[2]);
  assert.ok(output.startsWith(path.resolve("temp/template-settings-fix-")));
  await mkdir(output, { recursive: true });
  Logger.overrideLogger(["error", "warn"]);
  const config = new ConfigService({
    LOGOS_BUCKET: "fixture",
    S3_ENDPOINT: "http://unused.invalid",
  });
  const logo = new LogoStorageService(config);
  let object: Buffer;
  logo.uploadFile = async (_bucket, _key, buffer, mime) => {
    assert.equal(mime, "image/png");
    object = buffer;
    return "mock://logo";
  };
  logo.downloadFile = async () => object;
  logo.userHasLogo = async () => true;
  const service = new TemplateService();
  await service.ready;
  const renderer = new PlaywrightPdfGenerator();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const order = {
    id: "fixture",
    created_at: new Date("2026-10-15T12:00:00Z"),
    currency: "UAH",
    recipient: { name: "BUYER" },
    items: [
      {
        product_name: "PRODUCT",
        qty: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000,
      },
    ],
    subtotal_cents: 10000,
    total_cents: 10000,
  } as Order;
  const company = {
    companyName: "SAVED_COMPANY",
    companyAddress: "SAVED_ADDRESS",
    companyEmail: "saved@example.com",
    companyPhone: "+380501234567",
    companyTaxId: "SAVED_TAX",
    companyIban: "SAVED_IBAN",
    companySwift: "SAVED_SWIFT",
    companyWebsite: "saved.example.com",
    companyTagline: "SAVED_TAGLINE",
  };
  const matrix = [];
  try {
    for (const [style, format] of [
      [ReceiptStyle.STANDARD, "png"],
      [ReceiptStyle.BRANDED, "jpeg"],
      [ReceiptStyle.PROFORMA, "svg"],
      [ReceiptStyle.THERMAL, "gif"],
    ] as const) {
      const input =
        format === "svg"
          ? Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="#12ab34"/></svg>',
            )
          : await sharp({
              create: {
                width: 100,
                height: 40,
                channels: 3,
                background: "#12ab34",
              },
            })
              .toFormat(format)
              .toBuffer();
      await logo.uploadLogo(
        input,
        "fixture",
        {
          png: "image/png",
          jpeg: "image/jpeg",
          gif: "image/gif",
          svg: "image/svg+xml",
        }[format],
      );
      const repo = {
        findOne: async () => ({
          ...company,
          userId: "fixture",
          templateId: style,
          templateLanguage: "ru",
          receiptTitle: null,
          footerText: "SAVED_FOOTER",
          subFooterText: "SAVED_SUBTITLE",
          paymentTerms: "SAVED_PAYMENT",
          deliveryTerms: "SAVED_DELIVERY",
        }),
      };
      const settings = new SettingsService(
        repo as unknown as Repository<UserSettings>,
        {
          get: async () => null,
          set: async () => {},
        } as unknown as CacheService,
      );
      const current = await settings.getAllPdfSettings("fixture");
      const storage = {
        uploadReceipt: async (buffer: Buffer) => {
          await writeFile(path.join(output, style + ".pdf"), buffer);
          return "mock://" + style;
        },
      };
      const pdf = new PdfGeneratorService(
        config,
        storage as unknown as PdfStorageService,
        logo,
        service,
        renderer,
      );
      const result = await pdf.generateReceiptPdf(
        order,
        "SAVED_NUMBER",
        current.companyInfo,
        "fixture",
        style,
        current.receiptTitle,
        current.templateLanguage,
        current.footerTitle,
        current.footerSubtitle,
        current.primaryColor,
        current.paymentTerms,
        current.deliveryTerms,
        current.hasCustomReceiptTitle,
      );
      assert.ok(result.html.includes("data:image/png;base64,"));
      const page = await browser.newPage();
      await page.route("http**/*", (route) => route.abort());
      await page.setContent(result.html);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page
          .locator("img")
          .evaluateAll((images) =>
            images.some(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth === 100,
            ),
          ),
      );
      const text = await page.locator("body").innerText();
      assert.ok(text.includes("SAVED_COMPANY"));
      assert.ok(text.includes("SAVED_FOOTER"));
      await page.screenshot({
        path: path.join(output, style + ".png"),
        fullPage: true,
      });
      matrix.push({
        style,
        format,
        title: current.receiptTitle,
        logo: "image/png",
        company: true,
        footer: true,
      });
      await page.close();
    }
    const support = [];
    const logoPath = "data:image/png;base64," + object.toString("base64");
    for (const style of Object.values(ReceiptTemplate)) {
      const data = service.prepareTemplateData(
        order,
        "MATRIX_NUMBER",
        company,
        true,
        logoPath,
        "SAVED_TITLE",
        "ru",
        "SAVED_FOOTER",
        "SAVED_SUBTITLE",
        "#12AB34",
        "SAVED_PAYMENT",
        "SAVED_DELIVERY",
        true,
      );
      const html = await service.renderTemplate(style, data);
      assert.ok(html.includes("SAVED_TITLE"));
      assert.ok(html.includes("SAVED_FOOTER"));
      assert.ok(html.includes("data:image/png;base64,"));
      support.push({
        style,
        title: true,
        company: html.includes("SAVED_COMPANY"),
        footer: true,
        payment: html.includes("SAVED_PAYMENT"),
        brandColor: html.includes("#12AB34"),
      });
    }
    await writeFile(
      path.join(output, "pdf-matrix.json"),
      JSON.stringify(matrix, null, 2),
    );
    await writeFile(
      path.join(output, "settings-support-matrix.json"),
      JSON.stringify(support, null, 2),
    );
    process.stdout.write(
      JSON.stringify({ pdfs: matrix.length, templates: support.length }) + "\n",
    );
  } finally {
    await browser.close();
    await renderer.cleanup();
  }
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
