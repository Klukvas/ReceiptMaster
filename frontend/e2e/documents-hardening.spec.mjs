// Accessibility and wording of the documents list:
//  - sortable columns carry aria-sort and the cards offer a sort control on phones;
//  - voided and failed rows say why and what to do next;
//  - a reversed date range is called out.

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
    results.check("cards get a sort control on phones", await page.locator("#data-table-sort").isVisible(), "no select");
  });
  return results;
};
