// Regression: opening the product selector in the create-order flow must not
// break the mobile layout — no horizontal overflow, the popup stays inside the
// viewport instead of running off the bottom, and options stay selectable.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, waitFor } from "./support/runner.mjs";
import { makeOrder } from "./support/fixtures.mjs";

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
];

const openCreateOrderModal = async (page) => {
  await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /create order/i }).first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  // The modal scales in; measuring mid-animation would read a transformed box.
  await page.waitForTimeout(400);
};

/** Adds line items and scrolls the body so the last selector sits low on screen. */
const pushSelectorToBottom = async (page, extraItems) => {
  for (let i = 0; i < extraItems; i += 1) {
    await page.getByRole("button", { name: /add product/i }).click();
  }
  await page
    .locator("form div.overflow-y-auto")
    .first()
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(200);
};

const openSelector = async (page, index = 0) => {
  await page.locator('input[role="combobox"]').nth(index).click();
  await waitFor(async () => (await page.locator('[role="option"]').count()) > 0, {
    label: "dropdown options",
  });
  await page.waitForTimeout(300); // let the popup settle into position
};

const metrics = (page) =>
  page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    const panel = listbox?.parentElement ?? null;
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
        top: +r.top.toFixed(1),
        bottom: +r.bottom.toFixed(1),
        width: +r.width.toFixed(1),
        height: +r.height.toFixed(1),
      };
    };
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      panel: rect(panel),
      optionCount: document.querySelectorAll('[role="option"]').length,
    };
  });

/** True when the option at `index` is the element actually painted at its own centre. */
const optionIsHittable = (page, index) =>
  page.evaluate((i) => {
    const option = document.querySelectorAll('[role="option"]')[i];
    if (!option) return { ok: false, reason: "no option" };
    const r = option.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
      return { ok: false, reason: `option centre (${x.toFixed(1)}, ${y.toFixed(1)}) is outside the ${window.innerWidth}x${window.innerHeight} viewport` };
    }
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(option === hit || option.contains(hit))) {
      return { ok: false, reason: "another element is painted over the option" };
    }
    return { ok: true };
  }, index);

const checkViewportFit = async (results, page, tag, label) => {
  await page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    if (listbox) listbox.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  const m = await metrics(page);

  results.check(
    `${tag} ${label}: no horizontal page overflow`,
    m.docScrollWidth <= m.docClientWidth,
    `documentElement.scrollWidth=${m.docScrollWidth} > clientWidth=${m.docClientWidth}`,
  );

  results.check(
    `${tag} ${label}: popup stays inside the viewport`,
    m.panel &&
      m.panel.left >= -0.5 &&
      m.panel.right <= m.innerWidth + 0.5 &&
      m.panel.top >= -0.5 &&
      m.panel.bottom <= m.innerHeight + 0.5,
    `popup box ${JSON.stringify(m.panel)} vs viewport ${m.innerWidth}x${m.innerHeight}`,
  );

  results.check(
    `${tag} ${label}: popup is wide enough to read`,
    m.panel && m.panel.width >= Math.min(200, m.innerWidth - 32),
    `popup width=${m.panel?.width} innerWidth=${m.innerWidth}`,
  );

  const first = await optionIsHittable(page, 0);
  results.check(
    `${tag} ${label}: first option is reachable`,
    first.ok,
    first.reason,
  );

  // Scroll the option list to its end; the last row must be reachable too.
  await page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    if (listbox) listbox.scrollTop = listbox.scrollHeight;
  });
  await page.waitForTimeout(150);
  const last = await optionIsHittable(page, m.optionCount - 1);
  results.check(
    `${tag} ${label}: last option is reachable`,
    last.ok,
    last.reason,
  );
};

export const run = async () => {
  const results = new Results("mobile product dropdown");

  for (const viewport of VIEWPORTS) {
    await withPage(
      { viewport: { width: viewport.width, height: viewport.height } },
      async (page) => {
        const tag = `[${viewport.name}]`;
        const state = createState([
          makeOrder({
            id: "order-1",
            recipientName: "Aurora Coffee Bar",
            receiptStatus: null,
          }),
        ]);
        await installApiMocks(page, state);
        await openCreateOrderModal(page);

        const before = await metrics(page);
        results.check(
          `${tag} baseline: modal itself does not overflow horizontally`,
          before.docScrollWidth <= before.docClientWidth,
          `documentElement.scrollWidth=${before.docScrollWidth} > clientWidth=${before.docClientWidth}`,
        );

        // 1. First selector, near the top of the modal.
        await openSelector(page);
        await checkViewportFit(results, page, tag, "top selector");

        await page.locator('[role="option"]').first().click();
        const selected = await page
          .getByRole("heading", { level: 4 })
          .first()
          .textContent()
          .catch(() => null);
        results.check(
          `${tag} clicking an option selects the product`,
          !!selected && selected.includes("Espresso Machine Pro XL"),
          `selected product card heading was ${JSON.stringify(selected)}`,
        );

        const afterSelect = await metrics(page);
        results.check(
          `${tag} no horizontal overflow after selecting a product`,
          afterSelect.docScrollWidth <= afterSelect.docClientWidth,
          `documentElement.scrollWidth=${afterSelect.docScrollWidth} > clientWidth=${afterSelect.docClientWidth}`,
        );

        // 2. A selector pushed to the bottom of a scrolled modal — the case a
        //    real user hits once the order has a few lines.
        await pushSelectorToBottom(page, 3);
        const selectorCount = await page.locator('input[role="combobox"]').count();
        await openSelector(page, selectorCount - 1);
        await checkViewportFit(results, page, tag, "bottom selector");

        // 3. The on-screen keyboard shrinks the viewport while the popup is
        //    open. The popup must reflow instead of running off the screen.
        await page.setViewportSize({
          width: viewport.width,
          height: Math.round(viewport.height * 0.55),
        });
        await page.waitForTimeout(300);
        await checkViewportFit(results, page, tag, "with keyboard open");

        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.waitForTimeout(300);

        await page.locator('[role="option"]').first().click();
        results.check(
          `${tag} bottom selector still selects a product`,
          (await page.getByRole("heading", { level: 4 }).count()) === 2,
          `expected 2 selected product cards, saw ${await page.getByRole("heading", { level: 4 }).count()}`,
        );
      },
    );
  }

  return results;
};
