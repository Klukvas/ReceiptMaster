// Regressions from an axe pass over the main screens:
//  - the active sidebar link and the phone order card's View link keep 4.5:1 in the dark theme
//    (they used a fixed indigo that measured 2.4:1 on the dark sidebar);
//  - the orders status filter, the landing logo links and every navigation landmark have a name;
//  - the public document page has a <main> landmark and the phone top bar is a <header>;
//  - dashboard, analytics, settings and the phone order cards skip no heading level (they went h1 → h3);
//  - landing text on the faint/muted/status tokens keeps 4.5:1 in both themes (it measured 2–4.3:1).

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 812 } };

const PUBLIC_RECEIPT = {
  documentLanguage: "en",
  receipt: {
    id: "r1",
    number: "2026-000001",
    created_at: "2026-10-28T10:00:00.000Z",
    order: {
      id: "o1",
      currency: "UAH",
      subtotal_cents: 15000,
      total_cents: 15000,
      items: [{ id: "i1", product_name: "Cups", qty: 1, unit_price_cents: 15000, line_total_cents: 15000 }],
      recipient: { name: "Olena" },
    },
  },
  companyInfo: { companyName: "Walk Test Co" },
};

const ORDERS = [
  makeOrder({ id: "order-1", receiptId: "wb-1", receiptStatus: "generated", recipientName: "Aurora Coffee Bar" }),
];

const open = async (page, path, { theme = "light", signedIn = true } = {}) => {
  page.setDefaultTimeout(8000);
  await installApiMocks(page, createState(ORDERS));
  await page.route("**/api/v1/public/receipts/tok", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PUBLIC_RECEIPT) }),
  );
  await page.addInitScript(
    ({ th, keepToken }) => {
      localStorage.setItem("theme", th);
      localStorage.setItem("i18nextLng", "en");
      if (!keepToken) localStorage.removeItem("auth_token");
    },
    { th: theme, keepToken: signedIn },
  );
  await page.goto(`${BASE_URL}${path}`);
};

/** WCAG contrast of an element's text against the first opaque background behind it. */
const contrastOf = (locator) =>
  locator.evaluate((element) => {
    const channels = (color) => color.match(/[\d.]+/g).map(Number);
    const luminance = ([r, g, b]) => {
      const linear = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    let background = element;
    while (background && (channels(getComputedStyle(background).backgroundColor)[3] ?? 1) < 1) {
      background = background.parentElement;
    }
    const text = luminance(channels(getComputedStyle(element).color));
    const back = luminance(channels(getComputedStyle(background ?? document.body).backgroundColor));
    return (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05);
  });

const darkContrast = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, "/orders", { theme: "dark" });
    const active = page.locator('nav a[aria-current="page"] span').first();
    await active.waitFor();
    const ratio = await contrastOf(active);
    results.check("dark theme: the active sidebar link reads at 4.5:1 or more", ratio >= 4.5, ratio.toFixed(2));
  });
  await withPage(PHONE, async (page) => {
    await open(page, "/orders", { theme: "dark" });
    const view = page.getByRole("button", { name: /^View/ }).locator("visible=true").first();
    await view.waitFor();
    const ratio = await contrastOf(view);
    results.check("dark theme: the phone order card's View link reads at 4.5:1 or more", ratio >= 4.5, ratio.toFixed(2));
  });
};

const names = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await open(page, "/orders");
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().waitFor();
    const statusFilter = page.getByRole("combobox", { name: "Status" });
    results.check("the orders status filter has an accessible name", (await statusFilter.count()) === 1, String(await statusFilter.count()));
    const navNames = await page.getByRole("navigation").evaluateAll((navs) => navs.map((nav) => nav.getAttribute("aria-label")));
    results.check(
      "every navigation landmark is named, and no two share a name",
      navNames.every(Boolean) && new Set(navNames).size === navNames.length,
      JSON.stringify(navNames),
    );
  });
  await withPage(PHONE, async (page) => {
    await open(page, "/orders");
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().waitFor();
    const banners = await page.getByRole("banner").count();
    results.check("on a phone the app's top bar is a header landmark", banners === 1, String(banners));
  });
  await withPage(PHONE, async (page) => {
    await open(page, "/", { signedIn: false });
    const logos = page.getByRole("link", { name: "ReceiptMaster", exact: true });
    await logos.first().waitFor();
    results.check("on a phone both landing logo links are named", (await logos.count()) === 2, String(await logos.count()));
  });
  await withPage(PHONE, async (page) => {
    await open(page, "/r/tok", { signedIn: false });
    await page.getByText("Walk Test Co").waitFor();
    const mains = await page.getByRole("main").count();
    results.check("the public document page has one main landmark", mains === 1, String(mains));
  });
};

/** Visible headings whose level jumps more than one below the previous one (h1 → h3). */
const skippedHeadings = (page) =>
  page.evaluate(() => {
    const visible = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(
      (heading) => heading.getClientRects().length > 0,
    );
    return visible.flatMap((heading, index) => {
      const level = Number(heading.tagName[1]);
      const previous = index === 0 ? 0 : Number(visible[index - 1].tagName[1]);
      return level > previous + 1 ? [`${heading.tagName} ${heading.textContent.trim().slice(0, 40)}`] : [];
    });
  });

const headingOrder = async (results) => {
  const pages = [
    [DESKTOP, "/dashboard", "Profit Over Time"],
    [DESKTOP, "/analytics", "Profit by Product"],
    [DESKTOP, "/settings", "Requisites for documents"],
    [DESKTOP, "/settings?tab=subscription", "Your current plan"],
    [PHONE, "/orders", "Aurora Coffee Bar"],
  ];
  for (const [device, path, landmark] of pages) {
    await withPage(device, async (page) => {
      await open(page, path);
      await page.getByText(landmark).locator("visible=true").first().waitFor();
      const skipped = await skippedHeadings(page);
      results.check(`${device.viewport.width}px ${path}: no heading level is skipped`, skipped.length === 0, skipped.join(" | "));
    });
  }
};

/** Landing text drawn from the faint, muted and status tokens, each on its own background. */
const LANDING_TEXT = [
  [".landing-nav-pill a", "nav link on the pill"],
  [".landing-feat-pill", "feature pill"],
  [".landing-trusted-l", "'at a glance' caption"],
  [".landing-fo-date", "mock list date"],
  [".landing-tag-green", "green status tag"],
  [".landing-tag-amber", "amber status tag"],
  [".landing-tag-red", "red status tag"],
  [".landing-tag-indigo", "indigo status tag"],
  [".landing-tpl-category", "template category"],
];

const landingContrast = async (results) => {
  for (const theme of ["light", "dark"]) {
    await withPage(DESKTOP, async (page) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, "/", { theme, signedIn: false });
      for (const [selector, what] of LANDING_TEXT) {
        const element = page.locator(selector).first();
        await element.waitFor({ state: "attached" });
        const ratio = await contrastOf(element);
        results.check(`landing ${theme}: the ${what} reads at 4.5:1 or more`, ratio >= 4.5, ratio.toFixed(2));
      }
    });
  }
};

export const run = async () => {
  const results = new Results("a11y names and contrast");
  await darkContrast(results);
  await names(results);
  await headingOrder(results);
  await landingContrast(results);
  return results;
};
