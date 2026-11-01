const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const origin = process.env.TEMPLATE_FIXTURE_URL || "http://127.0.0.1:4327";
// Same default as backend/test/serve-template-features.ts, outside the repository.
const output = path.resolve(
  process.env.TEMPLATE_EVIDENCE ||
    path.join(os.tmpdir(), "receiptmaster-template-features"),
);
const results = [];
async function check(name, operation) {
  await operation();
  results.push({ name, status: "pass" });
  process.stdout.write(`PASS ${name}\n`);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  // Playwright's bundled Chromium unless E2E_CHROME_PATH names another binary.
  const browser = await chromium.launch(
    process.env.E2E_CHROME_PATH
      ? { executablePath: process.env.E2E_CHROME_PATH }
      : {},
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (value) => errors.push(value.message));
  const state = async () => (await fetch(`${origin}/fixture/state`)).json();
  const control = (data) =>
    fetch(`${origin}/fixture/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  // Settings sections are ARIA tabs; the action buttons keep the button role.
  const tab = (name) =>
    page
      .getByRole("tab", { name, exact: true })
      .or(page.getByRole("button", { name, exact: true }))
      .click();
  const field = (name) => page.getByLabel(name, { exact: true });
  try {
    await page.goto(origin);
    await field("Company Name").waitFor();
    await check("loads current SettingsPage and saved company", async () =>
      assert.equal(await field("Company Name").inputValue(), "Saved LLC"),
    );
    await tab("Language");
    await check(
      "legacy numeric date remains the default and includes four-digit year",
      async () => {
        assert.equal(await field("Date style").inputValue(), "numeric");
        assert.match(
          await page.locator('p[role="status"]').first().innerText(),
          /2026/,
        );
      },
    );
    await tab("Receipt Design");
    await field("Receipt Title").fill("");
    await tab("Save changes");
    await check(
      "blank custom title is required without losing the draft",
      async () => {
        assert.equal(
          await field("Receipt Title").evaluate(
            (el) => el.validity.valueMissing,
          ),
          true,
        );
        assert.equal(await field("Receipt Title").inputValue(), "");
      },
    );
    await field("Receipt Title").fill("   ");
    await tab("Refresh preview");
    await check(
      "whitespace custom title shows friendly validation and retains draft",
      async () => {
        await page
          .getByRole("alert")
          .filter({ hasText: "Enter a title" })
          .waitFor();
        assert.equal(await field("Receipt Title").inputValue(), "   ");
        assert.equal(
          (await state()).defaults.config.title.text,
          "Saved invoice",
        );
      },
    );
    await field("Receipt Title").fill("Invoice");
    await tab("Discard");
    await tab("Company Info");
    await page.evaluate(() =>
      history.pushState(
        { ...history.state, idx: history.state.idx + 1 },
        "",
        "?historyGuard=1",
      ),
    );
    await field("Company Name").fill("History draft");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.evaluate(() => history.back());
    await page.waitForURL("**/?historyGuard=1");
    await check(
      "cancelled browser Back preserves the unsaved draft",
      async () => {
        assert.equal(await field("Company Name").inputValue(), "History draft");
      },
    );
    await tab("Discard");
    await field("Company Name").fill("Unsaved Studio");
    await tab("Receipt Design");
    await field("Template").selectOption("branded");
    await field("Footer Title").fill("Draft footer");
    await field("Payment Terms").fill("Net 45 retained");
    await check(
      "contextual warning preserves unsupported Proforma terms in Branded",
      async () => {
        assert.match(
          await page.locator("form").innerText(),
          /Not used by this template; value retained/,
        );
        assert.equal(
          await field("Payment Terms").inputValue(),
          "Net 45 retained",
        );
      },
    );
    const png = await sharp({
      create: { width: 900, height: 100, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    await page.locator('input[type="file"]').setInputFiles({
      name: "staged-logo.png",
      mimeType: "image/png",
      buffer: png,
    });
    const before = await state();
    const previewResponse = page.waitForResponse((response) =>
      response.url().endsWith("/receipts/preview"),
    );
    await tab("Refresh preview");
    const preview = await previewResponse;
    await check(
      "actual personalized PDF preview returns PDF bytes without persistence",
      async () => {
        assert.equal(preview.status(), 201);
        const bytes = await preview.body();
        assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
        fs.writeFileSync(path.join(output, "browser-preview.pdf"), bytes);
        const after = await state();
        assert.deepEqual(after.defaults, before.defaults);
        assert.deepEqual(after.objectKeys, before.objectKeys);
        assert.deepEqual(after.writes, before.writes);
      },
    );
    await check(
      "preview exposes an Open PDF link backed by valid PDF bytes",
      async () => {
        assert.match(
          await page
            .getByRole("link", { name: "Open PDF preview" })
            .getAttribute("href"),
          /^blob:/,
        );
      },
    );
    await page
      .getByText("Preview matches your draft.", { exact: true })
      .waitFor();
    await control({ previewDelay: 1600 });
    await tab("Refresh preview");
    await tab("Company Info");
    await field("Company Name").fill("Latest draft");
    await page.waitForTimeout(2200);
    await control({ previewDelay: 0 });
    await check("late preview cannot mark an edited draft current", async () =>
      assert.equal(
        await page
          .getByText("Preview needs refreshing to show your latest draft.", {
            exact: true,
          })
          .count(),
        1,
      ),
    );
    await tab("Language");
    await field("Document language").selectOption("uk");
    await field("Number format").selectOption("de-DE");
    await field("Time zone (e.g. Europe/Kyiv)").fill("Europe/Kyiv");
    await check(
      "cross-tab draft retains company, terms and staged logo",
      async () => {
        await tab("Company Info");
        assert.equal(await field("Company Name").inputValue(), "Latest draft");
        await tab("Receipt Design");
        assert.equal(
          await field("Payment Terms").inputValue(),
          "Net 45 retained",
        );
        assert.equal(
          await page.getByText("staged-logo.png", { exact: true }).count(),
          1,
        );
      },
    );
    await tab("Save changes");
    await page.getByText("Saved settings", { exact: true }).waitFor();
    await check(
      "one Save atomically commits company/design/language/formatting/logo",
      async () => {
        const value = (await state()).defaults;
        assert.equal(value.config.company.companyName, "Latest draft");
        assert.equal(value.config.documentLanguage, "uk");
        assert.equal(value.config.formatting.numberLocale, "de-DE");
        assert.equal(value.config.paymentTerms, "Net 45 retained");
        assert.ok(value.config.logo.assetId);
        assert.equal(value.revision, 1);
      },
    );
    await tab("Company Info");
    await field("Company Name").fill("Discard me");
    await tab("Receipt Design");
    await tab("Remove logo in draft");
    await tab("Reset design in draft");
    await tab("Discard");
    await check(
      "Discard reverses company changes, logo removal and design reset",
      async () => {
        await tab("Company Info");
        assert.equal(await field("Company Name").inputValue(), "Latest draft");
        await tab("Receipt Design");
        assert.equal(await field("Footer Title").inputValue(), "Draft footer");
        assert.equal((await state()).defaults.revision, 1);
      },
    );
    await field("Preset name").fill("Team preset");
    await tab("Save as preset");
    await page
      .getByText("Team preset · 1", { exact: true })
      .waitFor({ state: "attached" });
    await check("Save as preset leaves account defaults unchanged", async () =>
      assert.equal((await state()).defaults.revision, 1),
    );
    await field("Footer Title").fill("Preset version two");
    await tab("Update preset");
    await page
      .getByText("Team preset · 2", { exact: true })
      .waitFor({ state: "attached" });
    await check(
      "Update preset preserves its revision and keeps account defaults unchanged",
      async () =>
        assert.equal(
          (await state()).defaults.config.footerTitle,
          "Draft footer",
        ),
    );
    await tab("Discard");
    await field("Saved presets").selectOption({ label: "Team preset · 2" });
    await check(
      "selecting a preset alone does not apply or save it",
      async () => {
        assert.equal(await field("Footer Title").inputValue(), "Draft footer");
        assert.equal((await state()).defaults.revision, 1);
      },
    );
    await tab("Use preset");
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("textarea")).some(
        (value) => value.value === "Preset version two",
      ),
    );
    await check(
      "Use preset explicitly copies settings into unsaved draft",
      async () => {
        assert.equal(
          await field("Footer Title").inputValue(),
          "Preset version two",
        );
        assert.equal((await state()).defaults.revision, 1);
      },
    );
    await control({ failCommit: true });
    await tab("Save changes");
    await page.getByRole("alert").waitFor();
    await check(
      "failed DB commit preserves draft and active account defaults",
      async () => {
        assert.equal(
          await field("Footer Title").inputValue(),
          "Preset version two",
        );
        assert.equal((await state()).defaults.revision, 1);
      },
    );
    await control({ failCommit: false });
    await tab("Save changes");
    await page.getByText("Saved settings", { exact: true }).waitFor();
    const stale = await state();
    await fetch(`${origin}/api/v1/settings/document-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          ...stale.defaults.config,
          footerTitle: "Concurrent saved footer",
        },
        expectedRevision: stale.defaults.revision,
      }),
    });
    await field("Footer Title").fill("My conflict draft");
    await tab("Save changes");
    await page.getByRole("alert").waitFor();
    await check(
      "CAS conflict preserves draft with concrete reload/discard recovery",
      async () => {
        assert.match(
          await page.getByRole("alert").innerText(),
          /Configuration changed/,
        );
        assert.equal(
          await field("Footer Title").inputValue(),
          "My conflict draft",
        );
      },
    );
    await tab("Reload saved settings");
    await tab("Discard");
    await check(
      "reload then Discard adopts the newly saved version",
      async () =>
        assert.equal(
          await field("Footer Title").inputValue(),
          "Concurrent saved footer",
        ),
    );
    await page.screenshot({
      path: path.join(output, "settings-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "settings-mobile.png"),
      fullPage: true,
    });
    await check("mobile editor fits viewport", async () =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ),
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByTitle("More actions").click();
    await page.getByRole("menuitem", { name: "Customize document" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await check(
      "Orders action opens the same editor in document-only scope",
      async () => assert.match(await dialog.innerText(), /This document only/),
    );
    await dialog
      .getByLabel("Footer Title", { exact: true })
      .fill("Only this document");
    const revision = (await state()).defaults.revision;
    await dialog
      .getByRole("button", { name: "Generate this document", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await check(
      "document override generation leaves account defaults unchanged",
      async () => {
        const value = await state();
        assert.equal(value.defaults.revision, revision);
        assert.equal(value.receipts.length, 1);
        assert.equal(value.receipts[0].status, "processing");
      },
    );
    await fetch(`${origin}/fixture/run-jobs`, { method: "POST" });
    await page.reload();
    await field("Company Name").waitFor();
    await page.getByTitle("More actions").click();
    await page.getByRole("menuitem", { name: "Customize document" }).click();
    const replacementDialog = page.getByRole("dialog");
    await replacementDialog.waitFor();
    await replacementDialog
      .getByLabel("Footer Title", { exact: true })
      .fill("Explicit replacement");
    page.once("dialog", (dialog) => dialog.accept());
    await replacementDialog
      .getByRole("button", { name: "Replace document", exact: true })
      .click();
    await replacementDialog.waitFor({ state: "hidden" });
    await check(
      "explicit replacement keeps the active generated document available",
      async () => {
        const value = await state();
        assert.equal(value.receipts[0].status, "generated");
        assert.equal(value.receipts[0].replacement_status, "processing");
        const response = await fetch(
          `${origin}/api/v1/receipts/${value.receipts[0].id}/pdf`,
        );
        assert.equal(response.status, 200);
        assert.equal(
          Buffer.from(await response.arrayBuffer())
            .subarray(0, 4)
            .toString(),
          "%PDF",
        );
        assert.equal(value.defaults.revision, revision);
      },
    );
    await fetch(`${origin}/fixture/run-jobs`, { method: "POST" });
    await check(
      "replacement promotes a new active version and preserves defaults",
      async () => {
        const value = await state();
        assert.equal(value.receipts[0].active_revision, 2);
        assert.equal(value.receipts[0].replacement_status, null);
        assert.equal(value.defaults.revision, revision);
      },
    );
    await check("no browser runtime errors", async () =>
      assert.deepEqual(errors, []),
    );
    fs.writeFileSync(
      path.join(output, "browser-results.json"),
      JSON.stringify(results, null, 2),
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(output, "browser-results.json"),
      JSON.stringify({ results, error: error.stack, errors }, null, 2),
    );
    await page.screenshot({
      path: path.join(output, "browser-failure.png"),
      fullPage: true,
    });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
