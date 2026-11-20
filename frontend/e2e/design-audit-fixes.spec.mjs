// The nine follow-up audit regressions: real routes/components, synthetic HTTP only.
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import i18next from "i18next";
import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { PRODUCTS, RECIPIENTS, SUBSCRIPTION_STATUS, makeOrder, paginated } from "./support/fixtures.mjs";
import { Results, settle } from "./support/runner.mjs";

const CACHE = fileURLToPath(new URL("./.cache/design-audit-fixes-2026-11-12/", import.meta.url));
const LONG_EMAIL = `${"verylongemail".repeat(6)}@example.test`;
const NAMES = ["International Warehouse Distribution Operations Customer Services", "WAREHOUSEDISTRIBUTION".repeat(5)];
const locales = Object.fromEntries(["en", "ru", "uk"].map((language) => [language, {
  translation: JSON.parse(readFileSync(new URL(`../src/locales/${language}/translation.json`, import.meta.url), "utf8")),
}]));
const shot = async (page, name) => {
  if (!process.env.E2E_SHOT_DIR) return;
  await mkdir(process.env.E2E_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.E2E_SHOT_DIR, `${name}.png`) });
};
const setup = async (page, { anonymous = false, theme = "light", language = "en", state = createState() } = {}) => {
  page.setDefaultTimeout(7000);
  await installApiMocks(page, state);
  await page.addInitScript(({ anonymous, theme, language }) => {
    if (anonymous) { localStorage.removeItem("auth_token"); localStorage.removeItem("refresh_token"); }
    localStorage.setItem("theme", theme);
    localStorage.setItem("i18nextLng", language);
  }, { anonymous, theme, language });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    // No backend request may escape the fixture harness.
    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/v1/")) return route.abort();
    return route.fallback();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  return state;
};
const bounded = (locator) => locator.evaluate((element, viewport) => {
  const box = element.getBoundingClientRect();
  return { left: box.left, right: box.right, width: box.width, height: box.height, viewport };
}, locator.page().viewportSize().width);
const fits = (box) => box.left >= -1 && box.right <= box.viewport + 1 && box.width > 0;
const safely = async (results, name, run) => {
  try { await run(); } catch (error) { results.fail(name, error.stack ?? error.message); }
};

const orderLines = async (results, width) => withPage({ viewport: { width, height: 900 } }, async (page) => {
  const order = { ...makeOrder({ id: "audit-order", recipientName: RECIPIENTS[0].name }), status: "draft" };
  const state = createState([order]);
  await setup(page, { state, theme: width === 320 ? "dark" : "light" });
  for (const mode of ["create", "edit"]) {
    await page.goto(`${BASE_URL}/orders`);
    if (mode === "create") {
      await page.getByRole("button", { name: "Create Order", exact: true }).first().click();
      await page.locator('input[role="combobox"]:visible').first().click();
      await page.locator('[role="option"]').first().click();
    } else {
      await page.getByRole("button", { name: "More actions", exact: true }).first().click();
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    }
    if (mode === "edit") {
      const quantity = page.getByRole("spinbutton", { name: "Quantity", exact: true });
      await quantity.waitFor();
      const bounds = await bounded(quantity);
      results.check(`${width} edit: quantity field stays inside viewport`, fits(bounds), JSON.stringify(bounds));
      await quantity.fill("2");
      results.check(`${width} edit: quantity remains editable`, await quantity.inputValue() === "2");
      continue;
    }
    const heading = page.getByRole("heading", { level: 4 }).first();
    await heading.waitFor();
    await page.waitForTimeout(350);
    const geometry = await heading.evaluate((element) => {
      const info = element.parentElement;
      const controls = info.nextElementSibling;
      const a = info.getBoundingClientRect(), b = controls.getBoundingClientRect();
      const meta = info.lastElementChild;
      return { info: { width: a.width, right: a.right, bottom: a.bottom }, controls: { left: b.left, top: b.top },
        metadataFits: meta.scrollWidth <= info.clientWidth + 1 };
    });
    results.check(`${width} ${mode}: product name, price and stock have readable space without quantity overlap`,
      geometry.info.width >= 100 && geometry.metadataFits &&
      (geometry.controls.top >= geometry.info.bottom - 1 || geometry.controls.left >= geometry.info.right - 1), JSON.stringify(geometry));
    const plus = page.getByRole("button", { name: "Increase quantity", exact: true }).first();
    const plusBox = await bounded(plus);
    results.check(`${width} ${mode}: quantity target remains reachable and touch-sized`, fits(plusBox) && (width >= 640 || (plusBox.width >= 44 && plusBox.height >= 44)), JSON.stringify(plusBox));
    await plus.click();
    results.check(`${width} ${mode}: quantity still changes`, await page.getByRole("spinbutton", { name: "Quantity", exact: true }).first().inputValue() === "2");
    if (mode === "create") await shot(page, `order-${width}`);
  }
});

const entityHeaders = async (results, width) => withPage({ viewport: { width, height: 900 } }, async (page) => {
  const state = createState();
  let currentName = NAMES[0];
  const supplier = () => ({ ...RECIPIENTS[0], id: "supplier-1", name: currentName, email: LONG_EMAIL, contact_person: null, product_count: 1 });
  state.handlers.push(async (route, { path }, json) => {
    if (path === "/products") { await json(route, paginated([{ ...PRODUCTS[0], name: currentName }])); return true; }
    if (path === "/recipients") { await json(route, paginated([{ ...RECIPIENTS[0], name: currentName, email: LONG_EMAIL }])); return true; }
    if (path === "/suppliers") { await json(route, paginated([supplier()])); return true; }
    if (path === "/suppliers/supplier-1") { await json(route, supplier()); return true; }
    if (path === "/suppliers/supplier-1/products") { await json(route, paginated([])); return true; }
    return false;
  });
  await setup(page, { state });
  for (const [nameIndex, name] of NAMES.entries()) {
    currentName = name;
    for (const route of ["products", "recipients", "suppliers"]) {
      await page.goto(`${BASE_URL}/${route}`);
      const label = page.getByText(name, { exact: true }).locator("visible=true").first();
      await label.waitFor();
      if (width < 1024 && route !== "products") {
        const identity = label.locator("..").locator("..");
        const menu = identity.locator("..").getByRole("button", { name: "Actions", exact: true });
        const bounds = await bounded(menu);
        results.check(`${width} ${route} name${nameIndex}: long mobile identity leaves Actions on screen`, fits(bounds), JSON.stringify(bounds));
        results.check(`${width} ${route} name${nameIndex}: mobile card does not widen the page`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      }
      await label.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(350);
      const menu = dialog.getByRole("button", { name: "More actions", exact: true });
      const bounds = await bounded(menu);
      results.check(`${width} ${route} name${nameIndex}: drawer action menu stays inside viewport`, fits(bounds), JSON.stringify(bounds));
      if (fits(bounds)) {
        await menu.click();
        results.check(`${width} ${route} name${nameIndex}: drawer menu opens`, await dialog.getByText("Edit", { exact: true }).isVisible());
      }
      if (nameIndex === 1) await shot(page, `${route}-drawer-${width}`);
    }
  }
});

const publicSurfaces = async (results, width) => withPage({ viewport: { width, height: 900 } }, async (page) => {
  await setup(page, { anonymous: true });
  for (const auth of ["login", "register"]) {
    await page.goto(`${BASE_URL}/?auth=${auth}`);
    await page.getByRole("dialog").waitFor();
    const covered = await page.locator(".landing-nav").evaluate((nav) => {
      const box = nav.getBoundingClientRect();
      const hit = document.elementFromPoint(box.right - 20, box.top + box.height / 2);
      return !nav.contains(hit);
    });
    results.check(`${width} ${auth}: auth backdrop covers landing navigation`, covered);
    await shot(page, `auth-${auth}-${width}`);
  }
  for (const route of ["/", "/blog"]) {
    await page.goto(`${BASE_URL}${route}`);
    await page.locator(".landing-nav").waitFor();
    await page.evaluate(() => scrollTo(0, 750));
    const top = (await page.locator(".landing-nav").boundingBox()).y;
    results.check(`${width} ${route}: navigation remains at top after scrolling`, Math.abs(top) <= 1, `nav top=${top}`);
    results.check(`${width} ${route}: horizontal content remains clipped`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.goto(`${BASE_URL}/#features`);
  results.check(`${width}: anchor remains below sticky navigation`, await settle(() => page.locator("#features").evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    return top >= 68 && top < 400 && scrollY > 0;
  })));
  for (const theme of ["light", "dark"]) {
    for (const title of ["Delivery note", "Warehouse dispatch confirmation for customer delivery", "WAREHOUSEDISPATCHCONFIRMATION".repeat(7).slice(0, 200)]) {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.route("**/api/v1/public/receipts/audit-token", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
        title, documentLanguage: "en", companyInfo: { companyName: "Audit Seller" },
        receipt: { id: "public-audit", number: "W-001", document_type: "waybill", created_at: "2026-11-12T10:00:00Z",
          order: { id: "audit-order", currency: "UAH", subtotal_cents: 1000, total_cents: 1000, items: [] } },
      }) }));
      await page.goto(`${BASE_URL}/r/audit-token`);
      const button = page.getByRole("button", { name: "Download PDF", exact: true });
      await button.waitFor();
      const bounds = await bounded(button);
      const titleFits = await page.getByRole("heading", { name: title, exact: true }).evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
      results.check(`${width} ${theme} title${title.length}: title wraps and PDF action stays visible`, titleFits && fits(bounds), JSON.stringify(bounds));
      if (title.length > 100) {
        await shot(page, `waybill-${width}-${theme}`);
        await page.route("**/api/v1/public/receipts/audit-token/pdf", (route) => route.fulfill({
          contentType: "application/pdf", body: "%PDF-1.4\n%%EOF", headers: { "content-disposition": 'attachment; filename="audit.pdf"' },
        }));
        const download = page.waitForEvent("download");
        await button.click();
        const filename = (await download).suggestedFilename();
        results.check(`${width} ${theme}: PDF control still starts a download`, /\.pdf$/u.test(filename), filename);
      }
    }
  }
});

const profile = async (results, width, language) => withPage({ viewport: { width, height: 900 } }, async (page) => {
  const state = createState();
  let failing = true;
  state.handlers.push(async (route, { path }, json) => {
    if (path !== "/subscription/status") return false;
    await json(route, failing ? {} : SUBSCRIPTION_STATUS, failing ? 500 : 200); return true;
  });
  await setup(page, { state, language, theme: language === "ru" ? "dark" : "light" });
  await page.goto(`${BASE_URL}/profile`);
  const t = i18next.createInstance(); await t.init({ lng: language, resources: locales });
  const error = page.getByText(t.t("subscription.loadFailed"), { exact: true });
  const hasError = await settle(() => error.isVisible(), { timeoutMs: 10000 });
  results.check(`${width} ${language}: failed subscription shows actionable error`, hasError);
  if (hasError) {
    failing = false;
    await page.getByRole("button", { name: t.t("common.retry"), exact: true }).click();
    results.check(`${width} ${language}: subscription retry restores actual plan`, await settle(() => page.getByText("Pro", { exact: true }).first().isVisible()));
  }
  for (const key of ["profile.editProfile", "profile.changePassword"]) {
    await page.getByRole("button", { name: t.t(key), exact: true }).first().click();
    const cancel = page.getByRole("button", { name: t.t("common.cancel"), exact: true });
    await cancel.scrollIntoViewIfNeeded();
    const box = await bounded(cancel);
    results.check(`${width} ${language} ${key}: form buttons stay inside screen`, fits(box), JSON.stringify(box));
    await shot(page, `profile-${width}-${language}-${key.split(".")[1]}`);
    await cancel.click();
  }
});

export const run = async () => {
  await mkdir(CACHE, { recursive: true });
  const results = new Results("design audit fixes");
  for (const width of [320, 375, 1440]) {
    await safely(results, `orders ${width}`, () => orderLines(results, width));
    await safely(results, `entities ${width}`, () => entityHeaders(results, width));
    await safely(results, `public ${width}`, () => publicSurfaces(results, width));
    for (const language of width === 320 ? ["en", "ru", "uk"] : ["en"])
      await safely(results, `profile ${width} ${language}`, () => profile(results, width, language));
  }
  const t = i18next.createInstance(); await t.init({ lng: "en", resources: locales });
  for (const [key, singular, plural] of [["orders.selectedCount", "1 order selected", "2 orders selected"],
    ["orders.batchApproveMessage", "1 selected order?", "2 selected orders?"],
    ["orders.batchDeleteMessage", "delete 1 order?", "delete 2 orders?"],
    ["products.bulkDeleteMessage", "delete 1 product?", "delete 2 products?"]]) {
    results.check(`${key}: singular`, t.t(key, { count: 1 }).includes(singular), t.t(key, { count: 1 }));
    results.check(`${key}: plural`, t.t(key, { count: 2 }).includes(plural), t.t(key, { count: 2 }));
  }
  for (const language of ["en", "ru", "uk"]) {
    const hint = t.getFixedT(language)("numbering.prefixHint", { prefix: "INV-", example: "INV-000001" });
    results.check(`${language}: prefix hint explains automatic separator`, /automatically|автоматич|автоматически/u.test(hint), hint);
  }
  return results;
};
