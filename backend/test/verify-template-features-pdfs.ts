import { createTemplateFixture, TENANT } from "./template-features-fixture";
import { formatDocumentDate } from "../src/common/utils/document-formatting.util";
import { TEMPLATE_METADATA } from "../src/modules/receipts/templates/metadata";
import {
  legacyConfig,
  DocumentConfig,
} from "../src/modules/settings/document-config";
import {
  sampleOrder,
  captureOrder,
} from "../src/modules/receipts/services/document-render.service";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import sharp = require("sharp");
async function main(): Promise<void> {
  const output = resolve(
    process.env.TEMPLATE_EVIDENCE || "temp/template-features-20261015-225300",
    "pdfs",
  );
  mkdirSync(output, { recursive: true });
  const f = await createTemplateFixture(true);
  const manifest: Array<Record<string, unknown>> = [];
  try {
    for (const id of Object.keys(TEMPLATE_METADATA))
      for (const language of ["en", "ru", "uk"] as const)
        await render(`${id}-${language}`, id, language, 3);
    for (const language of ["en", "ru", "uk"] as const) {
      await render(`standard-long-${language}`, "standard", language, 85);
      await render(`thermal-long-${language}`, "thermal", language, 85);
    }
    await render("branded-logo-wide", "branded", "en", 3, 4096, 8);
    await render("branded-logo-tall", "branded", "uk", 3, 8, 4096);
    for (const language of ["en", "ru", "uk"] as const)
      for (const style of ["numeric", "short", "medium", "long"] as const)
        await render(
          `date-${style}-${language}`,
          "standard",
          language,
          3,
          800,
          180,
          style,
        );
    writeFileSync(
      join(output, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  } finally {
    await f.close();
  }
  async function render(
    name: string,
    id: string,
    language: DocumentConfig["documentLanguage"],
    count: number,
    width = 800,
    height = 180,
    dateStyle: DocumentConfig["formatting"]["dateStyle"] = "medium",
  ) {
    const png = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 30, g: 80, b: 150, alpha: 0.8 },
      },
    })
      .png()
      .toBuffer();
    const logo = await f.logos.normalizeLogo(png, "image/png");
    const config = legacyConfig(null);
    const configured: DocumentConfig = {
      ...config,
      templateId: id,
      documentLanguage: language,
      company: {
        companyName: "North Star Studio · Північна зірка",
        companyAddress: "123 Long Street, Kyiv, Україна",
        companyEmail: "billing@example.com",
        companyPhone: "+380501234567",
        companyTaxId: "UA12345678",
        companyIban: "UA213223130000026007233566001",
        companySwift: "NBUAUAUK",
        companyWebsite: "example.com",
        companyTagline: "Thoughtful work · Дбайлива робота",
      },
      title: { mode: "automatic" },
      footerTitle: "Thank you · Дякуємо · Спасибо",
      footerSubtitle: "Contact us for assistance",
      paymentTerms: "Payment within 30 days · Оплата протягом 30 днів",
      deliveryTerms: "Delivery within 5 days · Доставка протягом 5 днів",
      logo: {
        ...config.logo,
        size: language === "en" ? "auto" : 180,
        alignment: language === "uk" ? "right" : "center",
      },
      formatting: {
        ...config.formatting,
        numberLocale:
          language === "en" ? "en-US" : language === "uk" ? "uk-UA" : "ru-RU",
        timeZone: "Europe/Kyiv",
        dateStyle,
        hourCycle: language === "en" ? "h12" : "h23",
        currencyDisplay: "code",
      },
    };
    const source = captureOrder(sampleOrder(TENANT));
    const items = Array.from({ length: count }, (_v, index) => ({
      product_name: `${index + 1}. ${count > 3 ? "Long service description · Довгий опис послуги ".repeat(3) : "Design service · Дизайн"}`,
      qty: 1,
      unit_price_cents: index === 0 ? 0 : 19999,
      line_total_cents: index === 0 ? 0 : 19999,
    }));
    const order = {
      ...source,
      items,
      subtotal_cents: (count - 1) * 19999,
      total_cents: (count - 1) * 19999,
      created_at: "2026-03-29T01:00:00Z",
    };
    const prepared = await f.renders.prepare(
      TENANT,
      configured,
      order,
      "PDF-000123",
      logo,
    );
    const bytes = await f.renders.render(prepared.html, prepared.snapshot);
    writeFileSync(join(output, `${name}.pdf`), bytes);
    writeFileSync(join(output, `${name}.html`), prepared.html);
    manifest.push({
      name,
      expectedDate: formatDocumentDate(
        order.created_at,
        language,
        configured.formatting,
      ),
      id,
      language,
      items: count,
      bytes: bytes.length,
      logoBytes: logo.length,
      config: prepared.snapshot.config,
      options: prepared.snapshot.options,
      htmlHash: prepared.snapshot.htmlHash,
    });
    process.stdout.write(
      `PDF ${manifest.length}/65 ${name} ${bytes.length} bytes\n`,
    );
  }
}
void main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
