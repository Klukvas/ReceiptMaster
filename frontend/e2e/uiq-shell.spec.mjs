// Authenticated shell: the mobile sidebar behaves as a modal drawer, collapsed sidebar links
// are named, the usage bar is readable, settings tabs live in the URL, a failed subscription
// request is not shown as "Free", error toasts are announced, and the shared Drawer and
// ConfirmModal are accessible and safe while a request is running.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { SUBSCRIPTION_STATUS } from "./support/fixtures.mjs";
import { Results } from "./support/runner.mjs";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 375, height: 812 } };

const FREE_AT_LIMIT = {
  ...SUBSCRIPTION_STATUS,
  plan: "free",
  usage: { productsCount: 10, ordersThisMonth: 4 },
  limits: { maxProducts: 10, maxOrdersPerMonth: 20, allowedTemplateIds: null },
};

const json = (route, status, body) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockStatus = (page, status, body) =>
  page.route("**/api/v1/subscription/status", (route) => json(route, status, body));

const setup = async (page, status) => {
  page.setDefaultTimeout(8000);
  await installApiMocks(page, createState());
  if (status) await mockStatus(page, status.code, status.body);
};

const focusedInsideSidebar = (page) =>
  page.evaluate(() => !!document.activeElement?.closest("#app-sidebar"));

const phoneDrawer = async (results) => {
  await withPage(PHONE, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/dashboard`);
    const burger = page.getByRole("button", { name: "Open menu" });
    await burger.waitFor();
    const sidebar = page.locator("#app-sidebar");

    let reachable = false;
    await page.evaluate(() => document.body.focus());
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      if (await focusedInsideSidebar(page)) reachable = true;
    }
    results.check(
      "375: the closed off-screen sidebar is not reachable with Tab",
      !reachable && (await sidebar.getAttribute("inert")) !== null,
    );

    const box = await burger.boundingBox();
    results.check(
      "375: the burger is at least 44px with aria-expanded=false",
      box.width >= 44 && box.height >= 44 && (await burger.getAttribute("aria-expanded")) === "false",
      JSON.stringify(box),
    );

    await burger.click();
    await sidebar.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.closest("#app-sidebar"));
    const open = await sidebar.evaluate((el) => ({
      role: el.getAttribute("role"),
      modal: el.getAttribute("aria-modal"),
      inert: el.hasAttribute("inert"),
      overflow: document.body.style.overflow,
    }));
    results.check(
      "375: the open sidebar is a modal dialog, takes focus and locks page scroll",
      open.role === "dialog" && open.modal === "true" && !open.inert && open.overflow === "hidden",
      JSON.stringify(open),
    );

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#app-sidebar")?.hasAttribute("inert"));
    results.check(
      "375: Escape closes the sidebar, restores scroll and returns focus to the burger",
      (await page.evaluate(() => document.body.style.overflow)) !== "hidden" &&
        (await burger.evaluate((el) => el === document.activeElement)),
    );
  });
};

const collapsedSidebar = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    const links = page.locator("#app-sidebar nav a");
    await links.first().waitFor();
    const info = await links.evaluateAll((els) =>
      els.map((el) => ({
        name: el.getAttribute("aria-label") || el.textContent.trim(),
        current: el.getAttribute("aria-current"),
      })),
    );
    results.check(
      "1280: collapsed sidebar links have names and only the active one has aria-current",
      info.length >= 7 &&
        info.every((i) => i.name) &&
        info.filter((i) => i.current === "page").length === 1,
      JSON.stringify(info),
    );
  });
};

const subscriptionTab = async (results) => {
  await withPage(DESKTOP, async (page) => {
    await setup(page, { code: 200, body: FREE_AT_LIMIT });
    await page.goto(`${BASE_URL}/settings`);
    await page.getByRole("tab", { name: "Subscription" }).click();
    results.check(
      "1280: switching a settings tab writes it to the URL and survives reload",
      page.url().includes("tab=subscription") &&
        (await (async () => {
          await page.reload();
          return (await page.getByRole("tab", { name: "Subscription" }).getAttribute("aria-selected")) === "true";
        })()),
      page.url(),
    );

    const bar = page.getByRole("progressbar", { name: "Products" });
    await bar.waitFor();
    const fill = await bar.locator("div").evaluate((el) => getComputedStyle(el).backgroundColor);
    const alpha = fill.startsWith("rgba") ? Number(fill.split(",")[3].replace(")", "")) : 1;
    results.check(
      "1280: a full usage bar has a solid fill and progressbar semantics",
      alpha === 1 && (await bar.getAttribute("aria-valuenow")) === "10" && (await bar.getAttribute("aria-valuemax")) === "10",
      fill,
    );
  });

  await withPage(DESKTOP, async (page) => {
    await setup(page, { code: 500, body: { error: "boom" } });
    await page.goto(`${BASE_URL}/settings?tab=subscription`);
    const alert = page.getByRole("alert").filter({ hasText: "subscription" });
    await alert.waitFor({ timeout: 15000 });
    const sidebarText = await page.locator("#app-sidebar").innerText();
    results.check(
      "1280: a failed subscription request shows a retry state, not Free",
      (await alert.getByRole("button", { name: "Retry" }).count()) === 1 &&
        (await page.getByText("Your current plan").count()) === 0 &&
        !/\bFree\b/.test(sidebarText),
      sidebarText,
    );
  });
};

const drawerAndConfirm = async (results, viewport, label) => {
  await withPage(viewport, async (page) => {
    await setup(page);
    let releaseDelete;
    const held = new Promise((resolve) => (releaseDelete = resolve));
    await page.route("**/api/v1/recipients/recipient-1", async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      await held;
      return json(route, 500, { error: "cannot delete" });
    });
    await page.goto(`${BASE_URL}/recipients`);
    await page.getByText("Aurora Coffee Bar").locator("visible=true").first().click();
    const drawer = page.getByRole("dialog");
    await drawer.waitFor();
    const close = drawer.getByRole("button", { name: "Close" });
    const box = await close.boundingBox();
    const minSize = viewport.viewport.width < 640 ? 44 : 20;
    results.check(
      `${label}: the Drawer dialog has a name and its close button is labelled${minSize === 44 ? " and 44px" : ""}`,
      (await drawer.getAttribute("aria-label")) !== null && box.width >= minSize && box.height >= minSize,
      JSON.stringify(box),
    );

    await drawer.getByRole("button", { name: "More actions" }).click();
    await drawer.getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog").filter({ hasText: "Delete" }).last();
    await confirm.getByRole("button", { name: "Delete" }).last().click();
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    results.check(
      `${label}: Escape does not dismiss the confirm dialog while the request runs`,
      (await page.getByRole("dialog").filter({ hasText: "Delete" }).count()) > 0,
    );

    releaseDelete();
    const toast = page.locator('[role="alert"]').filter({ hasText: /./ }).first();
    await toast.waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const toastBox = await toast.boundingBox();
    results.check(
      `${label}: error toasts are role=alert${label === "375" ? " and sit below the 56px header" : ""}`,
      label === "375" ? toastBox.y >= 56 : true,
      JSON.stringify(toastBox),
    );
  });
};

/** The app footer's legal links wrap to two rows on a phone; each row must be a thumb-sized target. */
const footerLinkTargets = async (results) => {
  await withPage(PHONE, async (page) => {
    await setup(page);
    await page.goto(`${BASE_URL}/orders`);
    const links = page.locator("footer nav a").locator("visible=true");
    await links.first().waitFor();
    const boxes = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect()).map(({ y, height }) => ({ y, height })),
    );
    results.check(
      "375: footer legal links are at least 44px tall",
      boxes.length >= 4 && Math.min(...boxes.map((box) => box.height)) >= 44,
      JSON.stringify(boxes),
    );
  });
};

export const run = async () => {
  const results = new Results("uiq-shell");
  await phoneDrawer(results);
  await collapsedSidebar(results);
  await subscriptionTab(results);
  await drawerAndConfirm(results, DESKTOP, "1280");
  await drawerAndConfirm(results, PHONE, "375");
  await footerLinkTargets(results);
  return results;
};
