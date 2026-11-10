// Accessibility and wording of the documents list:
//  - sortable columns carry aria-sort and the cards offer a sort control on phones;
//  - voided and failed rows say why and what to do next;
//  - a reversed date range is called out;
//  - on a phone the sort direction button names the current order and describes what a press does,
//    the two dates sit side by side, and a dialog's Close button is a 44px touch target.

import { BASE_URL, createState, installApiMocks, withPage } from "./support/harness.mjs";
import { Results } from "./support/runner.mjs";
import { documentHandlers, documentsListHandlers, listedDocument } from "./support/document-mocks.mjs";

const order = (id, number, recipient) => ({ id, order_number: number, status: "confirmed", recipient_name: recipient });

const documents = () => [
  listedDocument("h1", "act", "void", order("o1", 5, "Cedar Cafe"), { pdf_url: null, created_at: "2026-03-08T10:00:00.000Z" }),
  listedDocument("h2", "waybill", "void", order("o2", 6, "Borys Bakery"), { void_reason: "Wrong buyer", created_at: "2026-03-07T10:00:00.000Z" }),
  listedDocument("h3", "return_note", "failed", order("o3", 7, "Gum Grocers"), { created_at: "2026-03-06T10:00:00.000Z", error_message: "x" }),
];

const open = async (viewport, path, run) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.documents = documents();
    state.handlers = [...documentsListHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    return run(page);
  });

export const run = async () => {
  const results = new Results("documents-hardening");
  await open({ width: 1280, height: 900 }, "/documents", async (page) => {
    await page.getByText("ACT-h1").first().waitFor({ state: "visible" });
    const sort = await page.locator("th[aria-sort]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("aria-sort")));
    results.check("sortable columns expose aria-sort, the active one ascending or descending", sort.includes("descending") && sort.includes("none"), sort.join(","));
    const body = await page.locator("main").innerText();
    results.check("a voided row without a reason says so and what can be done", body.includes("No reason was given.") && body.includes("cannot be created for this order"), body.slice(0, 600));
    results.check("a voided row shows the typed reason", body.includes("Reason: Wrong buyer"), body.slice(0, 600));
    results.check("a failed return note points to the order", body.includes("create a new return note"), body.slice(0, 800));
  });
  await open({ width: 1280, height: 900 }, "/documents?from=2026-03-10&to=2026-03-01", async (page) => {
    await page.getByTestId("documents-range-hint").waitFor({ state: "visible", timeout: 8000 });
    results.check("a reversed date range is called out", await page.getByTestId("documents-range-hint").isVisible(), "no hint");
  });
  await open({ width: 375, height: 812 }, "/documents", async (page) => {
    await page.getByText("ACT-h1").locator("visible=true").first().waitFor({ state: "visible" });
    results.check("cards get a sort control on phones", await page.getByTestId("data-table-sort").isVisible(), "no select");
    const direction = page.getByTestId("data-table-sort-direction");
    const description = await direction.evaluate((button) =>
      document.getElementById(button.getAttribute("aria-describedby"))?.textContent ?? "",
    );
    results.check(
      "the sort direction button shows the current order as text and describes the action",
      (await direction.innerText()).trim() === "Descending" &&
        (await direction.getAttribute("aria-label")) === null &&
        description.includes("reverse"),
      `${await direction.innerText()} | ${description}`,
    );
    await direction.click();
    const switched = await page
      .waitForFunction(() => document.querySelector('[data-testid="data-table-sort-direction"]')?.textContent?.includes("Ascending"))
      .then(() => true)
      .catch(() => false);
    results.check("pressing it switches the visible order to Ascending", switched, await direction.innerText());
    await page.locator("#documents-filters-toggle").click();
    const [from, to] = await Promise.all([
      page.locator("#documents-filter-from").boundingBox(),
      page.locator("#documents-filter-to").boundingBox(),
    ]);
    results.check(
      "the two dates sit side by side on a phone",
      from && to && Math.abs(from.y - to.y) < 2 && to.x > from.x && to.x + to.width <= 375,
      JSON.stringify({ from, to }),
    );
  });
  await withPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.documents = [
      ...documents(),
      listedDocument("h4", "invoice", "generated", order("o4", 8, "Delta Deli"), { created_at: "2026-03-09T10:00:00.000Z" }),
    ];
    state.handlers = [...documentsListHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.goto(`${BASE_URL}/documents`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Void: / }).locator("visible=true").first().click();
    const close = page.locator("[data-dialog-close]").locator("visible=true").first();
    const isOpen = await close.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);
    // The dialog zooms in; measure once the animation has finished.
    await page.waitForTimeout(500);
    const box = isOpen ? await close.boundingBox() : null;
    results.check(
      "on a touch screen a dialog's Close button is at least 44px",
      box !== null && box.width >= 44 && box.height >= 44,
      JSON.stringify(box),
    );
  });
  return results;
};
