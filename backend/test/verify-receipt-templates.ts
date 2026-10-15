/** Offline regression: ts-node test/verify-receipt-templates.ts [new temp/receipt-fix-* dir] [--smoke]. */
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import * as path from "path";
import {
  TemplateService,
  ReceiptTemplate,
} from "../src/modules/receipts/services/template.service";
import { PlaywrightPdfGenerator } from "../src/modules/receipts/services/playwright-pdf-generator.service";
import { getTemplateMetadata } from "../src/modules/receipts/templates/metadata";
import { Order } from "../src/modules/orders/entities/order.entity";
import { OrderItem } from "../src/modules/orders/entities/order-item.entity";
import { Recipient } from "../src/modules/recipients/entities/recipient.entity";
import { PdfTestController } from "../src/modules/receipts/controllers/pdf-test.controller";
import { Response } from "express";
const output = path.resolve(process.argv[2] || "temp/receipt-fix-verification");
if (!output.startsWith(path.resolve("temp/receipt-fix-")))
  throw new Error("Use a new temp/receipt-fix-* directory");
const smoke = process.argv.includes("--smoke");
const selectedStyle = process.argv
  .find((argument) => argument.startsWith("--style="))
  ?.slice(8);
if (
  selectedStyle &&
  !Object.values(ReceiptTemplate).includes(selectedStyle as ReceiptTemplate)
) {
  throw new Error("Unknown receipt style");
}
Logger.overrideLogger(["error", "warn"]);
const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
const logo = (width: number, height: number) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#2563eb"/></svg>`).toString("base64")}`;

async function responseBody(
  action: (response: Response) => Promise<void>,
): Promise<string | Buffer> {
  let captured: string | Buffer | undefined;
  const response = {
    setHeader() {},
    send(body: string | Buffer) {
      captured = body;
    },
    status(code: number) {
      throw new Error(`Controller returned ${code}`);
    },
  } as unknown as Response;
  await action(response);
  if (captured === undefined) throw new Error("Controller response is empty");
  return captured;
}
async function main() {
  await mkdir(output, { recursive: true });
  const service = new TemplateService();
  await service.ready;
  const renderer = new PlaywrightPdfGenerator();
  const controller = new PdfTestController(service, renderer);
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const results = [];
  try {
    for (const style of Object.values(ReceiptTemplate)) {
      if (selectedStyle && style !== selectedStyle) continue;
      const scenarios = smoke
        ? ["base-uk", "long", "subtitle-only"]
        : [
            "base-en",
            "base-ru",
            "base-uk",
            "many80",
            "long",
            "wide-logo",
            "tall-logo",
            "minimal-data",
            "custom",
            "zero-price",
            "subtitle-only",
            "logo4to1",
            "wrap20",
            "preview-en",
            "preview-ru",
            "preview-uk",
            "escaped",
          ];
      if (!smoke && style === ReceiptTemplate.STANDARD)
        scenarios.push(...[8, 10, 12, 15, 20].map((count) => `count${count}`));
      for (const scenario of scenarios) {
        const language = scenario.endsWith("-en")
          ? "en"
          : scenario.endsWith("-ru")
            ? "ru"
            : "uk";
        const currency =
          language === "en" ? "USD" : language === "ru" ? "EUR" : "UAH";
        const count =
          scenario === "many80"
            ? 80
            : scenario === "wrap20"
              ? 20
              : scenario.startsWith("count")
                ? Number(scenario.slice(5))
                : 3;
        const itemName =
          scenario === "long"
            ? `Артикул-${"X".repeat(160)}`
            : scenario === "wrap20"
              ? `${"Якісний товар для офісу та дому ".repeat(7)}END`
              : "Професійний товар для офісу";
        const items = Array.from({ length: count }, (_, index) =>
          Object.assign(new OrderItem(), {
            product_name: `ITEM${String(index + 1).padStart(3, "0")} ${itemName}`,
            qty: 2,
            unit_price_cents: scenario === "zero-price" ? 0 : 123456,
            line_total_cents: scenario === "zero-price" ? 0 : 246912,
          }),
        );
        const order = Object.assign(new Order(), {
          currency,
          created_at: new Date("2026-10-14T12:34:00Z"),
          items,
          subtotal_cents: items.reduce(
            (sum, item) => sum + item.line_total_cents,
            0,
          ),
          total_cents: items.reduce(
            (sum, item) => sum + item.line_total_cents,
            0,
          ),
          recipient: Object.assign(new Recipient(), {
            name:
              scenario === "long"
                ? `Покупець ${"Олександр Петренко ".repeat(10)}`
                : "Покупець Олександр Петренко",
            email: "buyer@example.test",
            phone: "+380501234567",
            address: "Київ, вул. Тестова, 22, офіс 15",
          }),
        });
        const company =
          scenario === "minimal-data"
            ? { companyName: "Company" }
            : {
                companyName:
                  scenario === "long"
                    ? `Компанія ${"Якісні рішення ".repeat(14)}`
                    : scenario === "escaped"
                      ? '<script>alert("test")</script> & company'
                      : "ТОВ «Тестова компанія»",
                companyAddress: "Україна, Київ, вул. Хрещатик, 1",
                companyEmail: "office@example.test",
                companyPhone: "+380441234567",
                companyWebsite:
                  scenario === "long"
                    ? `https://${"x".repeat(119)}.example.test`
                    : "https://example.test",
                companyTaxId: "1234567890",
                companyIban: "UA123456789012345678901234567",
                companySwift: "TESTUA00",
                companyTagline: "Якісні рішення для вашого бізнесу",
              };
        const logoPath =
          scenario === "wide-logo"
            ? logo(1600, 100)
            : scenario === "tall-logo"
              ? logo(100, 1600)
              : scenario === "logo4to1"
                ? logo(400, 100)
                : undefined;
        const isPreview = scenario.startsWith("preview-");
        const data = isPreview
          ? await controller["getTestData"](true, language)
          : service.prepareTemplateData(
              order,
              "AUDIT-2026-000123",
              company,
              Boolean(logoPath),
              logoPath,
              scenario === "custom" ? "CUSTOM RECEIPT TITLE" : undefined,
              language,
              scenario === "custom" ? "CUSTOM FOOTER TITLE" : undefined,
              ["custom", "subtitle-only"].includes(scenario)
                ? "INDEPENDENT FOOTER SUBTITLE"
                : undefined,
              "#7C3AED",
              "Payment within 14 days",
              "Delivery within 5 days",
            );
        const html = isPreview
          ? String(
              await responseBody((response) =>
                controller.previewTemplate(style, "true", language, response),
              ),
            )
          : await service.renderTemplate(style, data);
        const filename = `${style}--${scenario}`;
        await writeFile(path.join(output, `${filename}.html`), html);
        const page = await browser.newPage({
          viewport: {
            width: style === ReceiptTemplate.THERMAL ? 288 : 756,
            height: 1085,
          },
        });
        await page.setContent(html, { waitUntil: "networkidle" });
        await page.emulateMedia({ media: "print" });
        await page.evaluate(() => document.fonts.ready);
        const dom = await page.evaluate(() => {
          const bounds =
            document.querySelector(".container")?.getBoundingClientRect() ||
            document.body.getBoundingClientRect();
          const outside = Array.from(
            document.querySelectorAll(
              "td, th, .item-row, img, .company-name, .info-line, .info-content, .client-data, .company-contact",
            ),
          ).flatMap((el) => {
            const rect = el.getBoundingClientRect();
            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1
              ? [
                  `${el.tagName}.${el.className}: ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`,
                ]
              : [];
          });
          const clipped = Array.from(
            document.querySelectorAll(
              "td, th, .item-name, .info-line, .company-name",
            ),
          ).flatMap((el) => {
            const rect = el.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(el);
            return Array.from(range.getClientRects()).some(
              (text) =>
                text.left < rect.left - 1 || text.right > rect.right + 1,
            )
              ? [`${el.tagName}.${el.className}`]
              : [];
          });
          const footer = document
            .querySelector(".footer, .footer-section")
            ?.getBoundingClientRect();
          const totals = document
            .querySelector(".totals-section, .totals")
            ?.getBoundingClientRect();
          return {
            lang: document.documentElement.lang,
            text: document.body.innerText,
            outside,
            clipped,
            footerOverlap: Boolean(
              footer &&
                totals &&
                footer.top < totals.bottom &&
                footer.bottom > totals.top,
            ),
            logos: Array.from(document.images).map((img) => ({
              width: img.width,
              height: img.height,
              ratio: img.naturalWidth / img.naturalHeight,
            })),
            emptyCells: Array.from(
              document.querySelectorAll("tbody td"),
            ).filter((el) => !el.textContent?.trim()).length,
          };
        });
        const issues: string[] = [];
        if (dom.lang !== language)
          issues.push(`language=${dom.lang}, expected=${language}`);
        const expectedDate = isPreview
          ? new Date().toLocaleDateString(
              TemplateService.getLocaleForLanguage(language),
            )
          : data.orderDate;
        if (!normalize(dom.text).includes(normalize(expectedDate)))
          issues.push("missing order date");
        if (!dom.text.includes(data.receiptNumber))
          issues.push("missing receipt number");
        if (dom.outside.length)
          issues.push(`outside: ${dom.outside.join(", ")}`);
        if (dom.clipped.length)
          issues.push(`clipped text: ${dom.clipped.join(", ")}`);
        if (dom.footerOverlap) issues.push("footer overlaps totals");
        if (dom.emptyCells) issues.push(`${dom.emptyCells} empty cells`);
        if (
          ["custom", "subtitle-only"].includes(scenario) &&
          !dom.text.includes("INDEPENDENT FOOTER SUBTITLE")
        )
          issues.push("missing independent footer subtitle");
        if (
          scenario === "custom" &&
          !normalize(dom.text).includes(normalize("CUSTOM RECEIPT TITLE"))
        )
          issues.push("missing custom receipt title");
        if (scenario === "escaped" && (await page.locator("script").count()))
          issues.push("unescaped company HTML");
        await writeFile(
          path.join(output, `${filename}.pdf`),
          isPreview
            ? await responseBody((response) =>
                controller.generateTestPdf(
                  { template: style, withLogo: true, language },
                  response,
                ),
              )
            : await renderer.generatePdf(
                html,
                getTemplateMetadata(style)?.pdfOptions,
              ),
        );
        if (["base-uk", "long"].includes(scenario))
          await page.screenshot({
            path: path.join(output, `${filename}-dom.png`),
            fullPage: true,
          });
        results.push({
          style,
          scenario,
          ...dom,
          issues,
          expected: {
            itemCount: data.items.length,
            itemNames: data.items.map((item) => item.productName),
            lineTotals: data.items.map((item) => item.lineTotal),
            total: data.total,
            number: data.receiptNumber,
            date: expectedDate,
            itemName,
          },
        });
        await page.close();
        process.stdout.write(
          `${issues.length ? "FAIL" : "PASS"} ${filename}${issues.length ? `: ${issues.join("; ")}` : ""}\n`,
        );
      }
    }
  } finally {
    await renderer.cleanup();
    await browser.close();
  }
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(results, null, 2),
  );
  const failures = results.filter((result) => result.issues.length);
  process.stdout.write(
    `${results.length} cases; ${failures.length} DOM failures. Run verify-receipt-pdfs.py for PDF completeness/pagination.\n`,
  );
  process.exitCode = failures.length ? 1 : 0;
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
