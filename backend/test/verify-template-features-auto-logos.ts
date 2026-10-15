/** Actual current renderer vs original-baseline HTML; synthetic images, no DB/storage writes. */
import { createTemplateFixture, TENANT } from "./template-features-fixture";
import { legacyConfig } from "../src/modules/settings/document-config";
import {
  sampleOrder,
  captureOrder,
} from "../src/modules/receipts/services/document-render.service";
import {
  TEMPLATE_METADATA,
  getTemplateCapabilities,
} from "../src/modules/receipts/templates/metadata";
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import * as Handlebars from "handlebars";
import sharp = require("sharp");
import assert = require("node:assert/strict");
async function main() {
  const out = resolve(
    process.env.TEMPLATE_EVIDENCE ||
      "temp/template-features-20261015-225300/fix3",
  );
  mkdirSync(out, { recursive: true });
  const f = await createTemplateFixture(true);
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    chromiumSandbox: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1400 },
  });
  await page.emulateMedia({ media: "print" });
  const results: unknown[] = [];
  const failures: string[] = [];
  const load = f.templates.loadTemplate.bind(f.templates);
  try {
    for (const id of Object.keys(TEMPLATE_METADATA)) {
      const raw = readFileSync(
        resolve(`src/modules/receipts/templates/html/${id}-receipt.html`),
        "utf8",
      );
      const tags = raw.match(/<img\b[^>]*>/g) || [];
      assert(
        tags.every((tag) => (tag.match(/\bstyle=/g) || []).length <= 1),
        `${id} duplicate style`,
      );
      for (const [width, height] of [
        [100, 400],
        [800, 180],
      ]) {
        const logo = await sharp({
          create: { width, height, channels: 4, background: "blue" },
        })
          .png()
          .toBuffer();
        const config = { ...legacyConfig(null), templateId: id };
        const order = captureOrder(sampleOrder(TENANT));
        f.templates.loadTemplate = load;
        const current = await f.renders.prepare(
          TENANT,
          config,
          order,
          "AUTO-0001",
          logo,
        );
        f.templates.loadTemplate = async (name) =>
          (
            f.templates as unknown as { handlebars: typeof Handlebars }
          ).handlebars.compile(
            readFileSync(
              resolve(
                `temp/template-features-20261015-225300/baseline/backend/src/modules/receipts/templates/html/${name}-receipt.html`,
              ),
              "utf8",
            ),
          );
        const original = await f.renders.prepare(
          TENANT,
          config,
          order,
          "AUTO-0001",
          logo,
        );
        const measure = async (html: string) => {
          await page.setContent(html);
          await page
            .locator('img[alt="Logo"]')
            .evaluate(async (img: HTMLImageElement) => {
              await img.decode();
            });
          return page.locator('img[alt="Logo"]').evaluate((img) => {
            const s = getComputedStyle(img),
              r = img.getBoundingClientRect();
            return {
              width: r.width,
              height: r.height,
              marginBottom: s.marginBottom,
              marginRight: s.marginRight,
              maxHeight: s.maxHeight,
              maxWidth: s.maxWidth,
              withinContainer: (() => {
                const c = img.closest(".container")?.getBoundingClientRect();
                return Boolean(
                  c && r.left >= c.left - 0.1 && r.right <= c.right + 0.1,
                );
              })(),
            };
          });
        };
        const baseline = await measure(original.html),
          actual = await measure(current.html);
        results.push({ id, aspect: `${width}x${height}`, baseline, actual });
        assert(actual.width <= 200.1 && actual.height <= 120.1);
        assert(
          actual.withinContainer,
          `${id} automatic logo outside printable container`,
        );
        if (id === "compact") {
          assert(Math.abs(actual.width - (height === 400 ? 30 : 200)) < 0.1);
          assert(Math.abs(actual.height - (height === 400 ? 120 : 45)) < 0.1);
        }
        if (
          Math.abs(baseline.height - actual.height) > 0.1 ||
          Math.abs(baseline.width - actual.width) > 0.1 ||
          baseline.marginBottom !== actual.marginBottom ||
          baseline.marginRight !== actual.marginRight
        )
          failures.push(
            `${id} ${width}x${height}: ${JSON.stringify({ baseline, actual })}`,
          );
        if (id === "corporate" && height === 400) {
          await page.screenshot({
            path: join(out, "corporate-auto-tall.png"),
            fullPage: true,
          });
          writeFileSync(
            join(out, "corporate-auto-tall.pdf"),
            await f.renders.render(current.html, current.snapshot),
          );
        }
      }
    }
    f.templates.loadTemplate = load;
    for (const id of Object.keys(TEMPLATE_METADATA))
      for (const size of [24, 200]) {
        const logo = await sharp({
          create: { width: 100, height: 400, channels: 4, background: "blue" },
        })
          .png()
          .toBuffer();
        const config = legacyConfig(null);
        const prepared = await f.renders.prepare(
          TENANT,
          { ...config, templateId: id, logo: { ...config.logo, size } },
          captureOrder(sampleOrder(TENANT)),
          "EXPLICIT",
          logo,
        );
        await page.setContent(prepared.html);
        const actual = await page
          .locator('img[alt="Logo"]')
          .evaluate((img) => ({
            height: img.getBoundingClientRect().height,
            width: img.getBoundingClientRect().width,
            marginBottom: getComputedStyle(img).marginBottom,
          }));
        const caps = getTemplateCapabilities(id).logo;
        assert(
          actual.height <= caps.maxHeight && actual.width <= caps.maxWidth,
        );
        if (id === "corporate") assert.equal(actual.marginBottom, "10px");
        results.push({ id, size, actual });
      }
  } finally {
    f.templates.loadTemplate = load;
    writeFileSync(
      join(out, "auto-logo-comparison.json"),
      JSON.stringify({ results, failures }, null, 2),
    );
    await browser.close();
    await f.close();
  }
  assert.deepEqual(failures, []);
  process.stdout.write(
    "30 original-baseline/current auto-logo comparisons and 30 explicit bounds across all 15 styles passed\n",
  );
}
main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
