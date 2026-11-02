// Orders UI quality: failures are visible, filtered empty states offer a way out, order
// dialogs are real dialogs, and touch targets / colors meet the documented minimums.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { PRODUCTS, makeOrder } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 700 } };
const MIN_TOUCH_TARGET = 44;
const MIN_CONTRAST = 4.5;
const FAILURE_MESSAGE = "Order service exploded";

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const draftOrder = (id, number = 1) => ({
  ...makeOrder({ id, recipientName: `Buyer ${number}`, orderNumber: number }),
  status: "draft",
});

const failWith500 = (route) =>
  json(route, { error: FAILURE_MESSAGE, errorCode: "INTERNAL_ERROR" }, 500);

/** Mocks run after the shared ones so they win; `emptyWhenFiltered` serves 0 rows for a status filter. */
const setup = async (page, { orders, emptyWhenFiltered = false } = {}) => {
  const list = orders ?? [draftOrder("d1-0000-4000-8000-000000000000")];
  await installApiMocks(page, createState(list));
  await page.route("**/api/v1/orders?*", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const filtered = new URL(route.request().url()).searchParams.has("status");
    const rows = emptyWhenFiltered && filtered ? [] : list;
    return json(route, { data: rows, total: rows.length, offset: 0, limit: 10 });
  });
  await page.route("**/api/v1/products/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const product = PRODUCTS.find((candidate) => candidate.id === id);
    return product ? json(route, product) : route.fallback();
  });
  await page.route("**/api/v1/settings/auto-receipt*", (route) =>
    json(route, { data: { enabled: false } }),
  );
};

const waitForRows = (page) => page.getByText("Buyer 1").first().waitFor({ state: "attached" });

const confirmFailureIsVisible = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page);
    await page.route("**/api/v1/orders/*/confirm", failWith500);
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: /confirm/i }).click();
    const shown = await page
      .getByText(FAILURE_MESSAGE)
      .first()
      .waitFor()
      .then(() => true, () => false);
    results.check("a 500 on Confirm shows the error message", shown, "no message rendered");
  });
};

const deleteFailureStaysInDialog = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page);
    await page.route("**/api/v1/orders/*", (route) =>
      route.request().method() === "DELETE" ? failWith500(route) : route.fallback(),
    );
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    const inlineAlert = dialog.getByRole("alert");
    const shown = await inlineAlert
      .waitFor()
      .then(() => true, () => false);
    const text = shown ? await inlineAlert.innerText() : "";
    results.check(
      "a failed Delete keeps the dialog open with an inline alert",
      shown && text.includes(FAILURE_MESSAGE),
      text || "no alert in dialog",
    );
    results.check(
      "the Delete button stays usable as a retry",
      await dialog.getByRole("button", { name: "Delete", exact: true }).isEnabled(),
      "button disabled",
    );
  });
};

const filteredEmptyState = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page, { emptyWhenFiltered: true });
    await page.goto(`${BASE_URL}/orders?status=cancelled`);
    await page.getByText("No orders match these filters").first().waitFor();
    const clearAll = page.getByRole("button", { name: "Clear all" });
    results.check(
      "a filter with no results offers Clear all, not the first-order CTA",
      (await clearAll.count()) > 0 &&
        (await page.getByText("Create your first order").count()) === 0,
      "missing Clear all or first-order CTA still shown",
    );
    await clearAll.last().click();
    await waitForRows(page);
    results.check(
      "Clear all brings the orders back",
      (await page.getByText("No orders match these filters").count()) === 0,
      "still empty",
    );
  });
};

const detailsDialog = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page);
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    await page.getByRole("button", { name: "View" }).first().click();
    const dialog = page.getByRole("dialog", { name: /Order Details/ });
    await dialog.waitFor();
    for (let press = 0; press < 12; press += 1) await page.keyboard.press("Tab");
    const focusInside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"]')),
    );
    results.check("order details is a named dialog that traps focus", focusInside, "focus escaped");
    await page.keyboard.press("Escape");
    results.check(
      "Escape closes order details",
      await dialog.waitFor({ state: "detached" }).then(() => true, () => false),
      "dialog still open",
    );
  });
};

const editFormInlineError = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page);
    let nativeDialogs = 0;
    page.on("dialog", (nativeDialog) => {
      nativeDialogs += 1;
      void nativeDialog.dismiss();
    });
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    await page.getByRole("button", { name: "More actions" }).first().click();
    await page.getByRole("menuitem", { name: /edit/i }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Order" });
    await dialog.waitFor();
    // Native validation would stop the submit before the app's own check runs.
    await dialog.locator("form").evaluate((form) => {
      form.noValidate = true;
    });
    await dialog.locator('input[type="number"]').first().fill("0");
    await dialog.getByRole("button", { name: "Save" }).click();
    const inlineAlert = dialog.getByRole("alert");
    const shown = await inlineAlert.first().waitFor().then(() => true, () => false);
    results.check(
      "the edit form reports an empty order inline, without a native dialog",
      shown && nativeDialogs === 0,
      `inline alert: ${shown}, native dialogs: ${nativeDialogs}`,
    );
    results.check(
      "the typed quantity survives the error",
      (await dialog.locator('input[type="number"]').first().inputValue()) === "0",
      "input was reset",
    );
  });
};

const boxOf = (locator) => locator.evaluate((element) => {
  return {
    width: element.offsetWidth,
    height: element.offsetHeight,
    opacity: getComputedStyle(element).opacity,
  };
});

const openCreateModalWithProduct = async (page) => {
  await page.getByRole("button", { name: /create order/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(400);
  await page.locator('input[role="combobox"]').nth(0).click();
  await page.locator('[role="option"]').first().waitFor();
  await page.locator('[role="option"]').first().click();
  return dialog;
};

const lineItemTouchTargets = async (results) => {
  await withPage(PHONE, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page);
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    const dialog = await openCreateModalWithProduct(page);
    const decrease = await boxOf(dialog.getByRole("button", { name: "Decrease quantity" }));
    const increase = await boxOf(dialog.getByRole("button", { name: "Increase quantity" }));
    const remove = await boxOf(dialog.getByRole("button", { name: "Remove item" }));
    const smallest = Math.min(decrease.height, decrease.width, increase.height, increase.width, remove.height, remove.width);
    results.check(
      "line-item steppers and remove are at least 44px on a phone",
      smallest >= MIN_TOUCH_TARGET,
      JSON.stringify({ decrease, increase, remove }),
    );
    results.check(
      "the remove button is visible without hover on touch",
      Number(remove.opacity) === 1,
      `opacity ${remove.opacity}`,
    );
  });
};

const rowMenuTouchTargets = async (results) => {
  await withPage(PHONE, async (page) => {
    page.setDefaultTimeout(6000);
    await setup(page);
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    await page.getByRole("button", { name: "More actions" }).first().click();
    const items = page.getByRole("menuitem");
    await items.first().waitFor();
    await page.waitForTimeout(300);
    const heights = await items.evaluateAll((nodes) =>
      nodes.map((node) => node.offsetHeight),
    );
    results.check(
      "row menu items are at least 44px on a phone",
      heights.length > 0 && Math.min(...heights) >= MIN_TOUCH_TARGET,
      JSON.stringify(heights),
    );
    await page.mouse.wheel(0, 200);
    await page.evaluate(() => window.scrollBy(0, 120));
    results.check(
      "scrolling closes the row menu",
      await items.first().waitFor({ state: "detached" }).then(() => true, () => false),
      "menu still open after scroll",
    );
  });
};

/** Resolves any CSS color (including oklch / color-mix) to sRGB through a canvas pixel. */
const readColors = (button) => button.evaluate((element) => {
  const toRgb = (cssColor) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  };
  const style = getComputedStyle(element);
  return { text: toRgb(style.color), background: toRgb(style.backgroundColor) };
});

const luminance = ([red, green, blue]) => {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const bulkApproveContrast = async (results) => {
  for (const theme of ["light", "dark"]) {
    await withPage(DESKTOP, async (page) => {
      page.setDefaultTimeout(6000);
      await setup(page);
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.goto(`${BASE_URL}/orders`);
      await waitForRows(page);
      await page.getByRole("checkbox", { name: "Select all rows" }).check();
      const approve = page.getByRole("button", { name: "Approve", exact: true });
      await approve.waitFor();
      await page.waitForTimeout(400);
      const { text, background } = await readColors(approve);
      const ratio = contrastRatio(text, background);
      results.check(
        `bulk Approve text reaches ${MIN_CONTRAST}:1 in ${theme} theme`,
        ratio >= MIN_CONTRAST,
        `ratio ${ratio.toFixed(2)} (${text} on ${background})`,
      );
    });
  }
};

const bulkDisabledReasonVisible = async (results) => {
  await withPage(DESKTOP, async (page) => {
    page.setDefaultTimeout(6000);
    const confirmed = makeOrder({ id: "c1-0000-4000-8000-000000000000", recipientName: "Buyer 1" });
    await setup(page, { orders: [confirmed] });
    await page.goto(`${BASE_URL}/orders`);
    await waitForRows(page);
    await page.getByRole("checkbox", { name: "Select all rows" }).check();
    const hint = page.getByText("All selected orders must be in draft status");
    results.check(
      "the reason Approve is disabled is visible text",
      await hint.first().isVisible().catch(() => false),
      "hint only in a tooltip",
    );
    results.check(
      "the Clear selection icon button has an accessible name",
      (await page.getByRole("button", { name: "Clear", exact: true }).count()) > 0,
      "unlabelled",
    );
  });
};

export const run = async () => {
  const results = new Results("orders ui quality");
  await confirmFailureIsVisible(results);
  await deleteFailureStaysInDialog(results);
  await filteredEmptyState(results);
  await detailsDialog(results);
  await editFormInlineError(results);
  await lineItemTouchTargets(results);
  await rowMenuTouchTargets(results);
  await bulkApproveContrast(results);
  await bulkDisabledReasonVisible(results);
  return results;
};
