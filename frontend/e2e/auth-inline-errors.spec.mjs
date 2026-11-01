// Registration and login errors appear under the field that caused them (not only in a
// toast), the field is marked invalid for assistive tech, and the public receipt reads in
// the seller's document language rather than the visitor's.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const VIEWPORT = { viewport: { width: 1280, height: 900 } };

const json = (route, status, body) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const fieldAlert = (dialog, id) => dialog.locator(`#${id}-error`);

const textOf = async (locator) =>
  (await locator.count()) ? (await locator.innerText()).trim() : "";

const isInvalid = async (dialog, id) =>
  (await dialog.locator(`#${id}`).getAttribute("aria-invalid")) === "true";

const openRegister = async (page) => {
  await page.goto(`${BASE_URL}/?auth=register`);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return dialog;
};

const registerErrors = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/auth/register", (route) =>
      json(route, 409, {
        error: "User with this email already exists",
        errorCode: "USER_ALREADY_EXISTS",
      }),
    );
    const dialog = await openRegister(page);

    await dialog.locator("button[type=submit]").click();
    results.check(
      "register: empty submit marks email and password invalid with a message each",
      (await isInvalid(dialog, "email")) &&
        (await isInvalid(dialog, "password")) &&
        (await textOf(fieldAlert(dialog, "email"))) !== "" &&
        (await textOf(fieldAlert(dialog, "password"))) !== "",
    );
    results.check(
      "register: focus moves to the first invalid field",
      await page.evaluate(() => document.activeElement?.id === "email"),
    );

    await dialog.locator("#email").fill("not-an-email");
    results.check(
      "register: editing a field clears only its own error",
      (await fieldAlert(dialog, "email").count()) === 0 &&
        (await fieldAlert(dialog, "password").count()) === 1,
    );
    await dialog.locator("button[type=submit]").click();
    results.check(
      "register: a malformed email reads as an email problem",
      (await textOf(fieldAlert(dialog, "email"))).includes("valid email"),
      await textOf(fieldAlert(dialog, "email")),
    );

    await dialog.locator("#email").fill("taken@example.com");
    await dialog.locator("#password").fill("Short1!");
    await dialog.locator("#confirmPassword").fill("Different1!");
    await dialog.locator("button[type=submit]").click();
    results.check(
      "register: a 7-character password and a mismatch are both explained",
      (await textOf(fieldAlert(dialog, "password"))).includes("8") &&
        (await textOf(fieldAlert(dialog, "confirmPassword"))).includes("do not match"),
      JSON.stringify([
        await textOf(fieldAlert(dialog, "password")),
        await textOf(fieldAlert(dialog, "confirmPassword")),
      ]),
    );

    await dialog.locator("#password").fill("Longenough1!");
    await dialog.locator("#confirmPassword").fill("Longenough1!");
    await dialog.locator("button[type=submit]").click();
    await fieldAlert(dialog, "email").waitFor();
    results.check(
      "register: an already-registered email is shown on the email field",
      (await textOf(fieldAlert(dialog, "email"))).includes("already exists") &&
        (await isInvalid(dialog, "email")),
      await textOf(fieldAlert(dialog, "email")),
    );
  });
};

const loginErrors = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/auth/login", (route) =>
      json(route, 401, {
        error: "Invalid email or password",
        errorCode: "INVALID_CREDENTIALS",
      }),
    );
    await page.goto(`${BASE_URL}/?auth=login`);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    await dialog.locator("button[type=submit]").click();
    results.check(
      "login: empty submit marks both fields invalid",
      (await isInvalid(dialog, "email")) && (await isInvalid(dialog, "password")),
    );

    await dialog.locator("#email").fill("someone@example.com");
    await dialog.locator("#password").fill("wrong-password");
    await dialog.locator("button[type=submit]").click();
    const banner = dialog.getByRole("alert").filter({ hasText: "Invalid email or password" });
    await banner.first().waitFor();
    results.check(
      "login: wrong credentials show one message for the form, not for a field",
      (await banner.count()) === 1 && !(await isInvalid(dialog, "email")),
    );
  });
};

const PUBLIC_RECEIPT = {
  money: true,
  documentLanguage: "ru",
  formatting: {
    dateFormat: "numeric",
    numberFormat: "ru-RU",
    timeZone: "Europe/Kyiv",
  },
  receipt: {
    id: "r1",
    number: "2026-000001",
    created_at: "2026-10-28T10:00:00.000Z",
    order: {
      id: "o1",
      currency: "UAH",
      subtotal_cents: 15000,
      total_cents: 15000,
      items: [
        {
          id: "i1",
          product_name: "Cups",
          qty: 1,
          unit_price_cents: 15000,
          line_total_cents: 15000,
        },
      ],
      recipient: { name: "Olena" },
    },
  },
  companyInfo: { companyName: "Walk Test Co" },
};

const publicReceiptLanguage = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/public/receipts/tok", (route) =>
      json(route, 200, PUBLIC_RECEIPT),
    );
    await page.goto(`${BASE_URL}/r/tok`);
    await page.getByRole("button", { name: /Скачать PDF/ }).waitFor();
    // Headings are upper-cased by CSS, so compare without case.
    const text = (await page.locator("body").innerText()).toLowerCase();
    results.check(
      "public receipt: labels use the seller's document language (ru)",
      text.includes("покупатель") &&
        text.includes("итого") &&
        !text.includes("bill to") &&
        !text.includes("download pdf"),
      text.slice(0, 300),
    );
    results.check(
      "public receipt: the page language follows the document language",
      (await page.evaluate(() => document.documentElement.lang)) === "ru",
    );
  });
};

const productFormErrors = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/products", (route) =>
      route.request().method() === "POST"
        ? json(route, 409, {
            error: "Product with this name already exists",
            errorCode: "PRODUCT_ALREADY_EXISTS",
          })
        : route.fallback(),
    );
    await page.goto(`${BASE_URL}/products?create=1`);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    await dialog.locator("button[type=submit]").click();
    results.check(
      "product form: an empty submit explains every required field inline",
      (await textOf(fieldAlert(dialog, "product-name"))) !== "" &&
        (await textOf(fieldAlert(dialog, "product-purchase-price"))) !== "" &&
        (await textOf(fieldAlert(dialog, "product-sale-price"))) !== "" &&
        (await textOf(fieldAlert(dialog, "product-quantity"))) !== "",
    );
    results.check(
      "product form: focus moves to the first invalid field",
      await page.evaluate(() => document.activeElement?.id === "product-name"),
    );

    await dialog.locator("#product-name").fill("Cups");
    await dialog.locator("#product-purchase-price").fill("10");
    await dialog.locator("#product-sale-price").fill("20");
    await dialog.locator("#product-quantity").fill("3");
    await dialog.locator("button[type=submit]").click();
    await fieldAlert(dialog, "product-name").waitFor();
    results.check(
      "product form: a taken name is shown on the name field",
      (await textOf(fieldAlert(dialog, "product-name"))).includes("already exists"),
      await textOf(fieldAlert(dialog, "product-name")),
    );
  });
};

const recipientFormErrors = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.route("**/api/v1/recipients", (route) =>
      route.request().method() === "POST"
        ? json(route, 409, {
            error: "Recipient with this email already exists",
            errorCode: "RECIPIENT_ALREADY_EXISTS",
          })
        : route.fallback(),
    );
    await page.goto(`${BASE_URL}/recipients?create=1`);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    await dialog.locator("#recipient-email").fill("nope");
    await dialog.locator("#recipient-phone").fill("call me");
    await dialog.locator("button[type=submit]").click();
    results.check(
      "recipient form: missing name, bad email and bad phone are each explained",
      (await textOf(fieldAlert(dialog, "recipient-name"))) !== "" &&
        (await textOf(fieldAlert(dialog, "recipient-email"))).includes("valid email") &&
        (await textOf(fieldAlert(dialog, "recipient-phone"))) !== "",
    );

    await dialog.locator("#recipient-name").fill("Olena");
    await dialog.locator("#recipient-email").fill("olena@example.com");
    await dialog.locator("#recipient-phone").fill("+380 50 123 4567");
    await dialog.locator("button[type=submit]").click();
    await fieldAlert(dialog, "recipient-email").waitFor();
    results.check(
      "recipient form: a duplicate email is shown on the email field",
      (await textOf(fieldAlert(dialog, "recipient-email"))).includes("already exists"),
      await textOf(fieldAlert(dialog, "recipient-email")),
    );
  });
};

const ordersSearchDeepLink = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    const searches = [];
    await installApiMocks(page, createState());
    await page.route("**/api/v1/orders?*", (route) => {
      searches.push(new URL(route.request().url()).searchParams.get("search"));
      return route.fallback();
    });
    await page.goto(`${BASE_URL}/orders?search=Olena%20Final`);
    await page.getByPlaceholder(/search orders/i).waitFor();
    await page.waitForFunction(() => !location.search.includes("search="));
    results.check(
      "orders deep link: the list opens already searched for the recipient",
      (await page.getByPlaceholder(/search orders/i).inputValue()) === "Olena Final" &&
        searches.includes("Olena Final"),
      JSON.stringify(searches),
    );
    results.check(
      "orders deep link: the search param leaves the URL so a reload starts clean",
      !(await page.evaluate(() => location.search)).includes("search"),
    );
  });
};

const russianChrome = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "ru"));
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole("button", { name: "Сменить тему" }).first().waitFor();
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("[aria-label],[title]")].map(
        (element) =>
          element.getAttribute("aria-label") || element.getAttribute("title"),
      ),
    );
    const english = ["Toggle theme", "Logout", "Sidebar", "Collapse sidebar", "Close sidebar"];
    results.check(
      "russian interface: theme, logout and sidebar controls are not English",
      !labels.some((label) => english.includes(label)),
      JSON.stringify(labels.filter((label) => english.includes(label))),
    );
  });
};

const dashboardOnPhone = async (results) => {
  await withPage({ viewport: { width: 320, height: 640 } }, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.addInitScript(() => localStorage.setItem("onboarding_dismissed", "1"));
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole("link", { name: /analytics/i }).last().waitFor();
    const layout = await page.evaluate(() => {
      const tops = [...document.querySelectorAll("main a[href*='create=1']")].map(
        (element) => Math.round(element.getBoundingClientRect().top),
      );
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        rows: new Set(tops).size,
        actions: tops.length,
      };
    });
    results.check(
      "dashboard on a 320px phone: no sideways scroll and quick actions sit two per row",
      layout.overflow <= 0 && layout.actions >= 3 && layout.rows < layout.actions,
      JSON.stringify(layout),
    );
  });
};

const touchTargets = async (results) => {
  await withPage({ viewport: { width: 375, height: 700 } }, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(page, createState());
    await page.goto(`${BASE_URL}/products`);
    await page.getByRole("button", { name: "Actions" }).first().waitFor();
    const sizes = [];
    for (const label of ["Actions", "Logout"]) {
      const box = await page
        .getByRole("button", { name: label, exact: true })
        .first()
        .boundingBox();
      sizes.push({ label, w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0) });
    }
    results.check(
      "phone: row actions and logout are at least 44px square for a thumb",
      sizes.every(({ w, h }) => w >= 44 && h >= 44),
      JSON.stringify(sizes),
    );
  });
};

const orderNumbers = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    await installApiMocks(
      page,
      createState([
        makeOrder({ id: "a-long-uuid-tail-aaaa", recipientName: "Alpha", orderNumber: 17 }),
        makeOrder({ id: "b-long-uuid-tail-bbbb", recipientName: "Beta", orderNumber: 18 }),
      ]),
    );
    await page.goto(`${BASE_URL}/orders`);
    await page.getByText("Alpha").first().waitFor();
    const text = await page.locator("tbody").innerText();
    results.check(
      "orders list: each order is quoted by its number, not a UUID fragment",
      text.includes("#17") && text.includes("#18") && !text.includes("uuid-tail"),
      text.slice(0, 200),
    );
  });
};

const recipientSorting = async (results) => {
  await withPage(VIEWPORT, async (page) => {
    page.setDefaultTimeout(6000);
    const sorts = [];
    await installApiMocks(page, createState());
    await page.route("**/api/v1/recipients?*", (route) => {
      sorts.push(new URL(route.request().url()).searchParams.get("sortBy"));
      return route.fallback();
    });
    await page.goto(`${BASE_URL}/recipients`);
    await page.getByRole("columnheader", { name: /orders/i }).first().click();
    await page.getByRole("columnheader", { name: /total spent/i }).first().click();
    await page.waitForFunction(() => true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    results.check(
      "recipients: the Orders and Total Spent headers sort by their aggregates",
      sorts.includes("order_count") && sorts.includes("total_spent_cents"),
      JSON.stringify(sorts),
    );
  });
};

export const run = async () => {
  const results = new Results("auth inline errors and public receipt language");
  await registerErrors(results);
  await loginErrors(results);
  await publicReceiptLanguage(results);
  await productFormErrors(results);
  await recipientFormErrors(results);
  await ordersSearchDeepLink(results);
  await russianChrome(results);
  await dashboardOnPhone(results);
  await touchTargets(results);
  await orderNumbers(results);
  await recipientSorting(results);
  return results;
};
