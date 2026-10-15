const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.SETTINGS_ORIGIN || "http://127.0.0.1:4318";
const results = [];
const section = (p, title) =>
  p
    .getByRole("heading", { name: title, exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
const state = async () =>
  await (await fetch(origin + "/__fixture/state")).json();
const fail = async (data) =>
  fetch(origin + "/__fixture/fail", {
    method: "POST",
    body: JSON.stringify(data),
  });
const wait = async (p) => p.waitForTimeout(350);
async function verifyTemplateSave(p, templateId, title, isCustom) {
  const templates = section(p, "Template Selection");
  await templates
    .getByRole("heading", { name: templateId.toUpperCase(), exact: true })
    .click();
  await fail({ "GET /api/v1/settings/receipt-design": true });
  await templates.getByRole("button", { name: "Save", exact: true }).click();
  await p.getByRole("button", { name: "Retry", exact: true }).first().waitFor();
  const confirmed = await p.evaluate(() =>
    window.settingsFixture.queryClient.getQueryData([
      "settings",
      "receipt-design",
    ]),
  );
  assert.equal((await state()).design.templateId, templateId);
  assert.equal(confirmed.templateId, templateId);
  assert.equal(confirmed.receiptTitle, title);
  assert.equal(confirmed.hasCustomReceiptTitle, isCustom);
  assert.ok(await p.getByRole("alert").count());
  await p.getByRole("button", { name: "Retry", exact: true }).first().click();
  await wait(p);
  assert.ok(await p.getByRole("alert").count());
  await fail({ "GET /api/v1/settings/receipt-design": false });
  await p.getByRole("button", { name: "Retry", exact: true }).first().click();
  await wait(p);
  const assertSaved = async () => {
    const titleInput = section(p, "Receipt Title").locator("input");
    assert.equal(await titleInput.inputValue(), title);
    const s = section(p, "Template Selection");
    const card = s
      .getByRole("heading", { name: templateId.toUpperCase(), exact: true })
      .locator('xpath=ancestor::div[contains(@class,"group relative")][1]');
    const classes = await card.getAttribute("class");
    assert.ok(classes.includes("border-accent-base"));
    const save = s.getByRole("button", { name: "Save", exact: true });
    assert.equal(await save.isDisabled(), true);
  };
  await assertSaved();
  await p.reload();
  await wait(p);
  await assertSaved();
}
let browser;
async function scenario(name, fn, tab = "receipt", design = {}) {
  await fetch(origin + "/__fixture/reset", {
    method: "POST",
    body: JSON.stringify({ design }),
  });
  const context = await browser.newContext();
  const p = await context.newPage();
  p.setDefaultTimeout(1800);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/*", (r) =>
    r.request().url().startsWith(origin) ||
    r.request().url().startsWith("blob:")
      ? r.continue()
      : r.abort(),
  );
  try {
    await p.goto(origin + "/?tab=" + tab);
    await p.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    await wait(p);
    assert.deepEqual(errors, [], "fixture startup errors");
    await fn(p);
    assert.deepEqual(errors, []);
    if (process.env.SETTINGS_SCREENSHOTS) {
      fs.mkdirSync(process.env.SETTINGS_SCREENSHOTS, { recursive: true });
      await p.screenshot({
        path:
          process.env.SETTINGS_SCREENSHOTS +
          "/" +
          name.replace(/[^a-z0-9]+/gi, "-").slice(0, 90) +
          ".png",
        fullPage: true,
      });
    }
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
    console.log("FAIL", name, e.message);
  }
  await context.close();
}
(async () => {
  browser = await chromium.launch({
    executablePath:
      process.env.E2E_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    chromiumSandbox: true,
  });
  await scenario(
    "company loads nine fields; name-only save preserves eight; reload/cancel",
    async (p) => {
      const before = (await state()).company;
      for (const [key, value] of Object.entries(before))
        assert.equal(
          await p.locator(`input[name="${key}"]`).inputValue(),
          value,
        );
      const s = section(p, "Company Information");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await s.locator('[name="companyName"]').fill("New LLC");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.deepEqual((await state()).company, {
        ...before,
        companyName: "New LLC",
      });
      await p.reload();
      await wait(p);
      assert.equal(
        await p.locator('[name="companyName"]').inputValue(),
        "New LLC",
      );
      await section(p, "Company Information")
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await p.locator('[name="companyName"]').fill("cancel");
      await section(p, "Company Information")
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      assert.equal(
        await p.locator('[name="companyName"]').inputValue(),
        "New LLC",
      );
    },
    "company",
  );
  await scenario(
    "invalid company email cannot submit from Save click",
    async (p) => {
      const s = section(p, "Company Information");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await p.locator('[name="companyEmail"]').fill("invalid");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal(
        (await state()).requests.filter((r) => r.method === "POST").length,
        0,
      );
      assert.equal(
        await p
          .locator('[name="companyEmail"]')
          .evaluate((e) => e.validity.valid),
        false,
      );
    },
    "company",
  );
  await scenario(
    "company initial load error disables edit; Retry hydrates",
    async (p) => {
      await fail({ "GET /api/v1/settings/company-info": true });
      await p.reload();
      await wait(p);
      assert.ok(await p.getByRole("alert").count());
      assert.equal(
        await section(p, "Company Information")
          .getByRole("button", { name: "Edit", exact: true })
          .count(),
        0,
      );
      await fail({ "GET /api/v1/settings/company-info": false });
      await p.getByRole("button", { name: "Retry", exact: true }).click();
      await wait(p);
      assert.equal(
        await p.locator('[name="companyName"]').inputValue(),
        "Saved LLC",
      );
    },
    "company",
  );
  await scenario(
    "title draft survives unrelated color Save and failed refetch",
    async (p) => {
      const s = section(p, "Receipt Title");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await s.locator("input").fill("Unsaved title");
      const color = section(p, "Brand Color");
      await color.locator('input[type="text"]').fill("#123456");
      const save = color.getByRole("button", { name: "Save", exact: true });
      if (await save.count()) await save.click();
      await wait(p);
      assert.equal(await s.locator("input").inputValue(), "Unsaved title");
      assert.equal((await state()).design.primaryColor, "#123456");
      await fail({ "GET /api/v1/settings/receipt-design": true });
      await p.evaluate(() =>
        window.settingsFixture.queryClient.invalidateQueries({
          queryKey: ["settings", "receipt-design"],
        }),
      );
      await wait(p);
      assert.ok(await s.getByRole("alert").count());
      await s.getByRole("button", { name: "Retry", exact: true }).click();
      await wait(p);
      assert.ok(await s.getByRole("alert").count());
      await fail({ "GET /api/v1/settings/receipt-design": false });
      await s.getByRole("button", { name: "Retry", exact: true }).click();
      await wait(p);
      assert.equal(await s.getByRole("alert").count(), 0);
      assert.equal(await s.locator("input").inputValue(), "Unsaved title");
    },
  );
  await scenario(
    "footer single atomic POST failure retains both drafts and retry",
    async (p) => {
      await fail({
        "POST /api/v1/settings/footer": true,
        "POST /api/v1/settings/footer-subtitle": true,
      });
      const s = section(p, "Footer Customization");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await s.locator('[name="footerTitle"]').fill("New footer");
      await s.locator('[name="footerSubtitle"]').fill("New subtitle");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal((await state()).design.footerTitle, "Thank you!");
      assert.equal(
        await s.locator('[name="footerTitle"]').inputValue(),
        "New footer",
      );
      assert.equal(
        await s.getByRole("button", { name: "Save", exact: true }).isEnabled(),
        true,
      );
      await fail({ "POST /api/v1/settings/footer": false });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal((await state()).design.footerSubtitle, "New subtitle");
      assert.equal(
        (await state()).requests.filter(
          (r) => r.method === "POST" && r.path.endsWith("/footer"),
        ).length,
        2,
      );
    },
  );
  await scenario(
    "color default, invalid feedback, failed Save retry, cancel and reload",
    async (p) => {
      const s = section(p, "Brand Color"),
        input = s.locator('input[type="text"]');
      assert.equal(await input.inputValue(), "#3B82F6");
      await input.fill("#zzzzzz");
      assert.ok(await s.getByRole("alert").count());
      assert.equal(
        await s.getByRole("button", { name: "Save", exact: true }).isDisabled(),
        true,
      );
      await input.fill("#123456");
      await fail({ "POST /api/v1/settings/primary-color": true });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.ok(await s.getByRole("alert").count());
      assert.equal(await input.inputValue(), "#123456");
      assert.equal((await state()).design.primaryColor, "");
      await fail({ "POST /api/v1/settings/primary-color": false });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      await input.fill("#654321");
      await s.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await input.inputValue(), "#123456");
      await p.reload();
      await wait(p);
      assert.equal(
        await section(p, "Brand Color")
          .locator('input[type="text"]')
          .inputValue(),
        "#123456",
      );
    },
  );
  await scenario(
    "terms independent draft, Save failure retry, cancel and reload",
    async (p) => {
      const s = section(p, "Proforma Settings");
      const payment = s.locator("textarea").nth(0),
        delivery = s.locator("textarea").nth(1);
      await payment.fill("Net 60");
      await delivery.fill("Unsaved delivery");
      const buttons = s.getByRole("button", { name: "Save", exact: true });
      if (await buttons.count()) await buttons.nth(0).click();
      else await payment.blur();
      await wait(p);
      assert.equal(await delivery.inputValue(), "Unsaved delivery");
      await fail({ "POST /api/v1/settings/delivery-terms": true });
      await s.getByRole("button", { name: "Save", exact: true }).nth(1).click();
      await wait(p);
      assert.ok(await s.getByRole("alert").count());
      assert.equal(await delivery.inputValue(), "Unsaved delivery");
      await fail({ "POST /api/v1/settings/delivery-terms": false });
      await s.getByRole("button", { name: "Save", exact: true }).nth(1).click();
      await wait(p);
      await delivery.fill("cancel");
      await s
        .getByRole("button", { name: "Cancel", exact: true })
        .nth(1)
        .click();
      assert.equal(await delivery.inputValue(), "Unsaved delivery");
      await p.reload();
      await wait(p);
      assert.equal(
        await section(p, "Proforma Settings")
          .locator("textarea")
          .nth(1)
          .inputValue(),
        "Unsaved delivery",
      );
    },
  );
  await scenario(
    "initial receipt design error disables all writes; Retry recovers",
    async (p) => {
      await fail({ "GET /api/v1/settings/receipt-design": true });
      await p.reload();
      await wait(p);
      assert.ok(await p.getByRole("alert").count());
      assert.equal(
        await p.getByRole("button", { name: "Edit", exact: true }).count(),
        0,
      );
      await fail({ "GET /api/v1/settings/receipt-design": false });
      await p
        .getByRole("button", { name: "Retry", exact: true })
        .first()
        .click();
      await wait(p);
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Invoice",
      );
    },
  );
  await scenario(
    "receipt language updates automatic title and gallery while UI stays en",
    async (p) => {
      await p.getByRole("button", { name: "Русский", exact: false }).click();
      await section(p, "Receipt Language")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await wait(p);
      await p
        .getByRole("button", { name: "Receipt Design", exact: true })
        .click();
      await wait(p);
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Инвойс",
      );
      const previews = (await state()).requests.filter((r) =>
        r.path.includes("preview-template"),
      );
      assert.ok(previews.length);
      assert.ok(previews.every((r) => r.query.includes("language=ru")));
      assert.equal(
        await p.evaluate(() => window.settingsFixture.i18n.language),
        "en",
      );
    },
    "language",
    { receiptTitle: "", hasCustomReceiptTitle: false, templateLanguage: "en" },
  );
  await scenario(
    "specialized automatic title and explicit Invoice custom provenance",
    async (p) => {
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Накладная",
      );
      const s = section(p, "Receipt Title");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await s.locator("input").fill("Invoice");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      await p.reload();
      await wait(p);
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Invoice",
      );
    },
    "receipt",
    {
      receiptTitle: "",
      hasCustomReceiptTitle: false,
      templateId: "delivery",
      templateLanguage: "ru",
    },
  );
  await scenario(
    "successful POST then failed GET keeps confirmed color and terms draft through Retry",
    async (p) => {
      const s = section(p, "Proforma Settings");
      await s.locator("textarea").nth(1).fill("Delivery draft");
      const c = section(p, "Brand Color");
      await c.locator('input[type="text"]').fill("#123456");
      await fail({ "GET /api/v1/settings/receipt-design": true });
      await c.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal((await state()).design.primaryColor, "#123456");
      assert.equal(
        await s.locator("textarea").nth(1).inputValue(),
        "Delivery draft",
      );
      await fail({ "GET /api/v1/settings/receipt-design": false });
      await p
        .getByRole("button", { name: "Retry", exact: true })
        .first()
        .click();
      await wait(p);
      assert.equal(
        await section(p, "Brand Color")
          .locator('input[type="text"]')
          .inputValue(),
        "#123456",
      );
      assert.equal(
        await s.locator("textarea").nth(1).inputValue(),
        "Delivery draft",
      );
    },
  );
  await scenario(
    "company Save failure keeps draft; unrelated refetch and Cancel preserve saved fields",
    async (p) => {
      const s = section(p, "Company Information");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await p.locator('[name="companyName"]').fill("Company draft");
      await fail({ "POST /api/v1/settings/company-info": true });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal(
        await p.locator('[name="companyName"]').inputValue(),
        "Company draft",
      );
      assert.equal(
        await s.getByRole("button", { name: "Save", exact: true }).isEnabled(),
        true,
      );
      await p.evaluate(() =>
        window.settingsFixture.queryClient.invalidateQueries({
          queryKey: ["companyInfo"],
        }),
      );
      await wait(p);
      assert.equal(
        await p.locator('[name="companyName"]').inputValue(),
        "Company draft",
      );
      await s.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await p.locator('[name="companyName"]').inputValue(),
        "Saved LLC",
      );
      assert.equal((await state()).company.companyName, "Saved LLC");
    },
    "company",
  );
  await scenario(
    "title failed Save retains draft, Retry succeeds, blank title restores document language",
    async (p) => {
      const s = section(p, "Receipt Title");
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await s.locator("input").fill("Custom draft");
      await fail({ "POST /api/v1/settings/receipt-title": true });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal(await s.locator("input").inputValue(), "Custom draft");
      assert.equal(
        await s.getByRole("button", { name: "Save", exact: true }).isEnabled(),
        true,
      );
      await fail({ "POST /api/v1/settings/receipt-title": false });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      await s.getByRole("button", { name: "Edit", exact: true }).click();
      await s.locator("input").fill("");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal(await s.locator("input").inputValue(), "Проформа-инвойс");
      await p.reload();
      await wait(p);
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Проформа-инвойс",
      );
    },
    "receipt",
    { templateId: "proforma", templateLanguage: "ru" },
  );
  await scenario(
    "delayed older response cannot accept a newer color Save until it completes",
    async (p) => {
      const s = section(p, "Brand Color"),
        input = s.locator('input[type="text"]');
      let releaseOld;
      let reachedOld;
      const held = new Promise((resolve) => {
        releaseOld = resolve;
      });
      const reached = new Promise((resolve) => {
        reachedOld = resolve;
      });
      await p.route("**/settings/primary-color", async (route) => {
        const response = await route.fetch();
        reachedOld();
        await held;
        await route.fulfill({ response });
      });
      await input.fill("#112233");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await reached;
      assert.equal(await input.isDisabled(), true);
      assert.equal(
        await s.getByRole("button", { name: /Saving/ }).isDisabled(),
        true,
      );
      releaseOld();
      await p.waitForFunction(
        () =>
          !document.querySelector('input[type="color"]').closest("fieldset")
            .disabled,
      );
      await p.unroute("**/settings/primary-color");
      await input.fill("#334455");
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal((await state()).design.primaryColor, "#334455");
      await p.reload();
      await wait(p);
      assert.equal(
        await section(p, "Brand Color")
          .locator('input[type="text"]')
          .inputValue(),
        "#334455",
      );
    },
  );
  await scenario(
    "logo uses image MIME and failed replacement leaves the old image visible",
    async (p) => {
      await fetch(origin + "/__fixture/reset", {
        method: "POST",
        body: JSON.stringify({ hasLogo: true }),
      });
      await p.reload();
      await wait(p);
      assert.equal(
        await p.getByText("Logo active", { exact: true }).isVisible(),
        true,
      );
      assert.equal(
        await p
          .locator('img[alt="Company logo"]')
          .evaluate((image) => image.complete && image.naturalWidth === 10),
        true,
      );
      await p
        .getByRole("button", { name: "Replace Logo", exact: true })
        .click();
      const jpeg = await require("sharp")({
        create: { width: 12, height: 6, channels: 3, background: "red" },
      })
        .jpeg()
        .toBuffer();
      await p.locator('input[type="file"]').setInputFiles({
        name: "replacement.jpg",
        mimeType: "image/jpeg",
        buffer: jpeg,
      });
      await fail({ "POST /api/v1/settings/logo/upload": true });
      await p.getByRole("button", { name: "Upload Logo", exact: true }).click();
      await wait(p);
      assert.equal(
        await p.getByText("Logo active", { exact: true }).isVisible(),
        true,
      );
      assert.equal((await state()).hasLogo, true);
      assert.equal(
        await p
          .locator('img[alt="Company logo"]')
          .evaluate((image) => image.complete && image.naturalWidth === 10),
        true,
      );
    },
    "company",
  );
  await scenario(
    "language error Cancel and Retry keep explicit custom Invoice through reload",
    async (p) => {
      const s = section(p, "Receipt Language");
      await p.getByRole("button", { name: "Русский", exact: false }).click();
      await fail({ "POST /api/v1/settings/template-language": true });
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      assert.equal((await state()).design.templateLanguage, "en");
      await s.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await s.getByRole("button", { name: "Save", exact: true }).isDisabled(),
        true,
      );
      await fail({ "POST /api/v1/settings/template-language": false });
      await p.getByRole("button", { name: "Русский", exact: false }).click();
      await s.getByRole("button", { name: "Save", exact: true }).click();
      await wait(p);
      await p
        .getByRole("button", { name: "Receipt Design", exact: true })
        .click();
      await wait(p);
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Invoice",
      );
      await p.goto(origin + "/?tab=receipt");
      await wait(p);
      assert.equal(
        await section(p, "Receipt Title").locator("input").inputValue(),
        "Invoice",
      );
      assert.equal((await state()).design.templateLanguage, "ru");
    },
    "language",
    {
      templateLanguage: "en",
      receiptTitle: "Invoice",
      hasCustomReceiptTitle: true,
    },
  );
  for (const [language, titles] of Object.entries({
    en: ["Proforma Invoice", "Delivery Note", "Invoice"],
    ru: ["Проформа-инвойс", "Накладная", "Инвойс"],
    uk: ["Проформа-інвойс", "Видаткова накладна", "Інвойс"],
  })) {
    await scenario(
      `template POST survives failed GET with automatic ${language} titles and reload`,
      async (p) => {
        for (const [i, templateId] of [
          "proforma",
          "delivery",
          "standard",
        ].entries())
          await verifyTemplateSave(p, templateId, titles[i], false);
        assert.equal(
          await p.evaluate(() => window.settingsFixture.i18n.language),
          "en",
        );
      },
      "receipt",
      {
        receiptTitle: "",
        hasCustomReceiptTitle: false,
        templateLanguage: language,
      },
    );
  }
  await scenario(
    "template POST and failed GET preserve explicit custom Invoice provenance",
    async (p) => {
      await verifyTemplateSave(p, "proforma", "Invoice", true);
      await verifyTemplateSave(p, "delivery", "Invoice", true);
    },
    "receipt",
    {
      receiptTitle: "Invoice",
      hasCustomReceiptTitle: true,
      templateLanguage: "uk",
    },
  );
  for (const operation of ["upload", "delete"]) {
    await scenario(
      `delayed logo ${operation} blocks conflicting requests and replacement controls`,
      async (p) => {
        await fetch(origin + "/__fixture/reset", {
          method: "POST",
          body: JSON.stringify({ hasLogo: true }),
        });
        await p.reload();
        await wait(p);
        const s = section(p, "Company Logo");
        const replace = s.getByRole("button", {
          name: "Replace Logo",
          exact: true,
        });
        const remove = s.getByRole("button", { name: /Delete Logo|Deleting/ });
        const upload = s.getByRole("button", { name: /Upload Logo|Uploading/ });
        const cancel = s.getByRole("button", { name: "Cancel", exact: true });
        const fileInput = s.locator('input[type="file"]');
        await replace.click();
        const png = await require("sharp")({
          create: { width: 10, height: 10, channels: 3, background: "red" },
        })
          .png()
          .toBuffer();
        await s.locator('input[type="file"]').setInputFiles({
          name: "replacement.png",
          mimeType: "image/png",
          buffer: png,
        });
        let release, reached;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        const started = new Promise((resolve) => {
          reached = resolve;
        });
        const requests = [];
        await p.route("**/settings/logo/*", async (route) => {
          const kind = route.request().url().split("/").pop();
          requests.push(kind);
          if (kind === operation) {
            reached();
            await held;
          }
          // Synthetic responses: no storage, API or printer outside the fixture.
          await route.fulfill({ json: { message: "updated" } });
        });
        try {
          if (operation === "upload") await upload.click();
          else {
            await remove.click();
            await p
              .getByRole("dialog")
              .getByRole("button", { name: "Delete", exact: true })
              .click();
          }
          await Promise.race([
            started,
            p.waitForTimeout(1800).then(() => {
              throw new Error("Logo request did not reach route");
            }),
          ]);
          await wait(p);
          for (const control of [replace, remove, upload, cancel, fileInput])
            assert.equal(await control.isDisabled(), true);
          await remove.dispatchEvent("click");
          await upload.dispatchEvent("click");
          await s.locator('input[type="file"]').evaluate((input) => {
            const files = new DataTransfer();
            files.items.add(
              new File(["ignored"], "conflicting.png", { type: "image/png" }),
            );
            input.files = files.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.parentElement
              .querySelector('[class*="border-dashed"]')
              .dispatchEvent(
                new DragEvent("drop", {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: files,
                }),
              );
          });
          await wait(p);
          assert.equal(
            await s.getByText("replacement.png", { exact: true }).count(),
            1,
          );
          assert.equal(await p.getByRole("dialog").count(), 0);
          assert.deepEqual(requests, [operation]);
        } finally {
          release();
        }
        await wait(p);
        const nextControl = operation === "upload" ? replace : upload;
        assert.equal(await nextControl.isEnabled(), true);
        assert.deepEqual(requests, [operation]);
      },
      "company",
    );
  }
  await browser.close();
  const report = process.env.SETTINGS_REPORT;
  if (report) fs.writeFileSync(report, JSON.stringify(results, null, 2));
  console.log(
    `${results.filter((x) => x.passed).length}/${results.length} passed`,
  );
  process.exitCode = results.some((x) => !x.passed) ? 1 : 0;
})();
