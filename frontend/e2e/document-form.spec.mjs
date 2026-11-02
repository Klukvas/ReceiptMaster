// The document settings form as a person meets it: one Documents page in plain sections, a preview
// that updates by itself, optional things folded away, and a dialog that is not restyled by the
// table cell it was opened from. Only the HTTP API is mocked.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const CONFIG = {
  schemaVersion: 1,
  company: {
    companyName: "Aurora Coffee Bar",
    companyAddress: "12 Khreshchatyk St, Kyiv",
    companyEmail: "hello@aurora.coffee",
    companyPhone: "",
    companyTaxId: "",
    companyIban: "",
    companySwift: "",
    companyWebsite: "",
    companyTagline: "",
  },
  templateId: "standard",
  documentLanguage: "uk",
  title: { mode: "automatic" },
  footerTitle: "",
  footerSubtitle: "",
  primaryColor: "#3B82F6",
  paymentTerms: "",
  deliveryTerms: "",
  logo: { assetId: null, visible: true, size: "auto", alignment: "auto" },
  visibility: Object.fromEntries(
    [
      "companyAddress",
      "companyEmail",
      "companyPhone",
      "companyTaxId",
      "companyIban",
      "companySwift",
      "companyWebsite",
      "recipientEmail",
      "recipientPhone",
      "recipientAddress",
    ].map((field) => [field, true]),
  ),
  formatting: {
    numberLocale: "uk-UA",
    currencyDisplay: "symbol",
    dateLocale: "document",
    dateStyle: "numeric",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: "Europe/Kyiv",
  },
};
const capabilities = (terms) => ({
  revision: 1,
  companyFields: [
    "companyName",
    "companyAddress",
    "companyEmail",
    "companyPhone",
    "companyWebsite",
    "companyTagline",
  ],
  recipientFields: ["recipientEmail", "recipientPhone", "recipientAddress"],
  money: true,
  accent: true,
  terms,
  generatedAt: true,
  paper: "A4",
  logo: {
    minWidth: 24,
    maxWidth: 200,
    maxHeight: 80,
    alignments: ["auto", "left", "center", "right"],
  },
});
const TEMPLATES = [
  {
    id: "standard",
    name: "Standard",
    description: "",
    locked: false,
    capabilities: capabilities(false),
  },
  {
    id: "proforma",
    name: "Proforma Invoice",
    description: "",
    locked: false,
    capabilities: capabilities(true),
  },
];
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

/** previews: how the mocked server answers each POST /receipts/preview, in order (default 200). */
const install = async (page, state, { previewStatuses = [] } = {}) => {
  const previews = { count: 0 };
  await installApiMocks(page, state);
  await page.addInitScript(() =>
    localStorage.setItem("onboarding_dismissed", "1"),
  );
  await page.route("**/api/v1/settings/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/settings/document-config")
      return json(route, { data: { config: CONFIG, revision: 3 } });
    if (path === "/settings/templates") return json(route, { data: TEMPLATES });
    if (path === "/settings/document-presets") return json(route, { data: [] });
    return route.fallback();
  });
  await page.route("**/api/v1/receipts/preview", (route) => {
    const status = previewStatuses[previews.count] ?? 200;
    previews.count += 1;
    return status === 200
      ? route.fulfill({ status, contentType: "application/pdf", body: PDF })
      : json(
          route,
          { error: "Too many requests", errorCode: "THROTTLED" },
          status,
        );
  });
  return previews;
};

const desktop = { viewport: { width: 1280, height: 900 } };

export const run = async () => {
  const results = new Results("document form");

  await withPage(desktop, async (page) => {
    page.setDefaultTimeout(8000);
    const previews = await install(page, createState());
    await page.goto(`${BASE_URL}/settings?tab=receipt`);
    await page.getByLabel("Company Name", { exact: true }).waitFor();

    const tabs = await page.getByRole("tab").allInnerTexts();
    results.check(
      "one Documents tab replaces Company Info, Receipt Design and Language",
      tabs.map((value) => value.trim()).join("|") ===
        "Documents|Subscription|Advanced",
      tabs.join("|"),
    );
    results.check(
      "an old ?tab=receipt link opens the Documents page",
      (await page
        .getByRole("tab", { name: "Documents" })
        .getAttribute("aria-selected")) === "true",
    );

    const headings = await page
      .getByRole("heading", { level: 3 })
      .allInnerTexts();
    const wanted = [
      "Your business",
      "Customer details",
      "Template and title",
      "Colour and logo",
      "Texts on the document",
      "Language and formats",
    ];
    const positions = wanted.map((title) => headings.indexOf(title));
    results.check(
      "the page reads as plain sections in order",
      positions.every(
        (position, index) =>
          position >= 0 && (index === 0 || position > positions[index - 1]),
      ),
      headings.join("|"),
    );

    const closed = async (summary) =>
      !(await page
        .getByText(summary, { exact: true })
        .locator("xpath=ancestor::details")
        .evaluate((element) => element.open));
    results.check(
      "optional things start folded: bank details, logo size, fine-tuning, saved sets",
      (await closed("Tax and bank details (optional)")) &&
        (await closed("Logo size and position")) &&
        (await closed("Fine-tune dates, time and currency")) &&
        (await closed("Saved sets of settings")),
    );
    results.check(
      "a template that prints no terms folds payment and delivery terms away",
      await closed("Payment and delivery terms (not used by this template)"),
    );
    await page
      .getByLabel("Template", { exact: true })
      .selectOption("proforma");
    results.check(
      "choosing a template that prints terms shows them openly",
      (await page.getByLabel("Payment terms", { exact: true }).isVisible()) &&
        (await page
          .getByText("Payment and delivery terms (not used by this template)")
          .count()) === 0,
    );

    await page.getByRole("radio", { name: "English" }).click();
    await page
      .getByLabel("Region", { exact: true })
      .selectOption({ label: "United States" });
    const example = await page.getByText(/^Example:/).innerText();
    results.check(
      "one Region choice sets how amounts and dates are written, with a live example",
      /\$|UAH/.test(example) && /AM|PM/.test(example),
      example,
    );

    await page.waitForResponse("**/api/v1/receipts/preview", {
      timeout: 15000,
    });
    results.check(
      "the preview renders by itself, without pressing anything",
      previews.count >= 1,
    );
  });

  await withPage(desktop, async (page) => {
    page.setDefaultTimeout(8000);
    // The first render succeeds; the next one is refused as too frequent.
    await install(page, createState(), {
      previewStatuses: [200, 429, 429, 429],
    });
    await page.goto(`${BASE_URL}/settings`);
    await page.getByLabel("Company Name", { exact: true }).waitFor();
    await page
      .getByText("The preview shows your changes.", { exact: true })
      .waitFor();
    await page
      .getByLabel("Company Name", { exact: true })
      .fill("Aurora Coffee Roasters");
    await page
      .getByText(/paused because you changed things quickly/)
      .waitFor({ timeout: 15000 });
    results.check(
      "hitting the preview rate limit pauses it with a plain message and an Update now button",
      (await page.getByRole("button", { name: "Update now" }).isEnabled()) &&
        (await page.getByRole("alert").count()) === 0,
    );
  });

  await withPage({ viewport: { width: 390, height: 844 } }, async (page) => {
    page.setDefaultTimeout(8000);
    const previews = await install(page, createState());
    await page.goto(`${BASE_URL}/settings`);
    await page.getByLabel("Company Name", { exact: true }).waitFor();
    await page.waitForTimeout(800);
    const toggle = page.getByRole("button", { name: "Show preview" });
    results.check(
      "on a phone the preview comes first, collapsed, and nothing is rendered until it is opened",
      (await toggle.isVisible()) &&
        previews.count === 0 &&
        (await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        )),
      String(previews.count),
    );
    await toggle.click();
    await page.waitForResponse("**/api/v1/receipts/preview", {
      timeout: 15000,
    });
    results.check(
      "opening the preview on a phone renders it",
      previews.count >= 1,
    );
  });

  await withPage(desktop, async (page) => {
    page.setDefaultTimeout(8000);
    const order = {
      ...makeOrder({
        id: "order-1",
        recipientName: "Olena",
        receiptStatus: "generated",
        receiptId: "r1",
      }),
      status: "confirmed",
    };
    order.receipts = order.receipts.map((receipt) => ({
      ...receipt,
      active_revision: 2,
    }));
    await install(page, createState([order]));
    await page.goto(`${BASE_URL}/orders`);
    await page.getByText("Olena").first().waitFor();
    await page.getByRole("button", { name: /more/i }).first().click();
    await page
      .getByRole("menuitem", { name: /customize document|update document/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const alignment = await dialog.evaluate(
      (element) => getComputedStyle(element).textAlign,
    );
    results.check(
      "the per-document dialog is not right-aligned by the table cell it opens from",
      alignment !== "right" && alignment !== "end",
      alignment,
    );
    results.check(
      "the dialog says only this document changes and has one clear action",
      (await dialog
        .getByText("Changes here apply to this document only.", {
          exact: false,
        })
        .count()) === 1 &&
        (await dialog
          .getByRole("button", { name: "Update document", exact: true })
          .count()) >= 1,
    );
  });

  return results;
};
