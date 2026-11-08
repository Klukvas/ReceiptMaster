// The /documents page, at 1280px (table) and 375px (cards):
//  - every document is listed with its type, order link, recipient, status and replacement badge;
//  - row actions follow the document: download for generated (or voided with a PDF), share only for
//    generated, void for anything not yet void;
//  - filters (type, status, dates, search) are sent to the API and kept in the URL, and a reload restores them;
//  - a document that is still generating is polled until it finishes;
//  - voiding refreshes the list; empty, filtered-empty and error states are shown;
//  - the retention hint is visible and the page never scrolls sideways.

import {
  BASE_URL,
  createState,
  installApiMocks,
  withPage,
} from "./support/harness.mjs";
import { Results, settle } from "./support/runner.mjs";
import { documentHandlers, documentsListHandlers, listedDocument } from "./support/document-mocks.mjs";

const VIEWPORTS = [
  { label: "1280px", viewport: { width: 1280, height: 900 } },
  { label: "375px", viewport: { width: 375, height: 812 } },
];

const order = (id, number, recipient) => ({
  id,
  order_number: number,
  status: "confirmed",
  recipient_name: recipient,
});

const documents = () => [
  listedDocument("a1", "invoice", "generated", order("o1", 17, "Aurora Coffee Bar"), { created_at: "2026-03-10T10:00:00.000Z" }),
  listedDocument("a2", "waybill", "void", order("o2", 18, "Borys Bakery"), { pdf_url: "/pdf/a2", created_at: "2026-03-09T10:00:00.000Z", voided_at: "2026-03-09T12:00:00.000Z" }),
  listedDocument("a3", "act", "void", order("o3", 19, "Cedar Cafe"), { pdf_url: null, created_at: "2026-03-08T10:00:00.000Z" }),
  listedDocument("a4", "quote", "failed", order("o4", 20, "Delta Deli"), { created_at: "2026-03-07T10:00:00.000Z", error_message: "Generation failed. Retry uses the frozen candidate." }),
  listedDocument("a5", "sales_receipt", "processing", order("o5", 21, "Echo Eatery"), { created_at: "2026-03-06T10:00:00.000Z" }),
  listedDocument("a6", "packing_list", "generated", order("o6", 22, "Fig Foods"), { replacement_status: "processing", created_at: "2026-03-05T10:00:00.000Z" }),
  listedDocument("a7", "return_note", "generated", null, { created_at: "2026-03-04T10:00:00.000Z" }),
  listedDocument("a8", "return_note", "failed", order("o8", 23, "Gum Grocers"), { created_at: "2026-03-03T10:00:00.000Z", error_message: "Something internal exploded" }),
];

const withDocuments = async (viewport, path, stateOverrides, run) =>
  withPage({ viewport }, async (page) => {
    page.setDefaultTimeout(8000);
    const state = createState([]);
    state.documents = documents();
    Object.assign(state, stateOverrides);
    state.handlers = [...documentsListHandlers(state), ...documentHandlers(state)];
    await installApiMocks(page, state);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    return run(page, state);
  });

const visible = (locator) => locator.locator("visible=true");
const urlOf = (page) => new URL(page.url());
const lastQuery = (state) => new URLSearchParams((state.listQueries ?? []).at(-1) ?? "");
const hasNoHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const actionCount = async (page, verb, number) =>
  visible(page.getByRole("button", { name: new RegExp(`^${verb}: .* ${number}$`) })).count();

const checkListing = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocuments(viewport, "/documents", {}, async (page) => {
      await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
      const body = await page.locator("main").innerText();
      results.check(
        `${label}: documents show type, recipient and status`,
        body.includes("Invoice") && body.includes("Aurora Coffee Bar") && body.includes("Failed") && body.includes("Voided"),
        body.slice(0, 400),
      );
      const link = visible(page.getByRole("link", { name: "#17" })).first();
      results.check(
        `${label}: the order is a link that opens the orders search`,
        (await link.getAttribute("href")) === "/orders?search=17",
        String(await link.getAttribute("href")),
      );
      results.check(
        `${label}: a replacement in progress has its own badge`,
        (await visible(page.getByText("Replacing", { exact: true })).count()) === 1,
        "no replacing badge",
      );
      results.check(
        `${label}: the retention hint is shown`,
        (await page.getByTestId("documents-retention-hint").innerText()).includes("10 most recent generated waybills, quotes, sales receipts and packing lists"),
        "hint missing",
      );
      results.check(`${label}: no horizontal overflow`, await hasNoHorizontalOverflow(page), "page scrolls sideways");
    });
  }
};

const checkRowActions = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocuments(viewport, "/documents", {}, async (page) => {
      await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
      const matrix = {
        "INV-a1": { Download: 1, Share: 1, Void: 1 },
        "WAY-a2": { Download: 1, Share: 0, Void: 0 },
        "ACT-a3": { Download: 0, Share: 0, Void: 0 },
        "QUO-a4": { Download: 0, Share: 0, Void: 0 },
        "SAL-a5": { Download: 0, Share: 0, Void: 0 },
        "PAC-a6": { Download: 1, Share: 1, Void: 0 },
      };
      const verbs = { Download: "Download", Share: "Share", Void: "Void" };
      const mismatches = [];
      for (const [number, expected] of Object.entries(matrix)) {
        for (const [key, verb] of Object.entries(verbs)) {
          const found = await actionCount(page, verb, number);
          if (found !== expected[key]) mismatches.push(`${number} ${verb}: ${found} != ${expected[key]}`);
        }
      }
      results.check(
        `${label}: download, share and void follow the document's status`,
        mismatches.length === 0,
        mismatches.join("; "),
      );
    });
  }
};

const checkActions = async (results) => {
  await withDocuments(VIEWPORTS[0].viewport, "/documents", {}, async (page, state) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    await visible(page.getByRole("button", { name: "Download: Invoice INV-a1" })).click();
    const downloaded = await settle(() => state.requests.includes("GET /receipts/a1/pdf"));
    results.check("download requests the PDF of that document", downloaded, state.requests.join(" | "));

    await visible(page.getByRole("button", { name: "Share: Invoice INV-a1" })).click();
    const shared = await settle(() => (state.shared ?? []).includes("a1"));
    results.check("share creates a link for that document", shared, JSON.stringify(state.shared));
    await page.keyboard.press("Escape");

    await visible(page.getByRole("button", { name: "Void: Invoice INV-a1" })).click();
    await page.getByRole("button", { name: "Void", exact: true }).last().click();
    const voided = await settle(() => (state.voided ?? []).some((entry) => entry.id === "a1"));
    results.check("voiding sends the void request", voided, JSON.stringify(state.voided));
    const refreshed = await settle(
      async () => (await actionCount(page, "Void", "INV-a1")) === 0,
    );
    results.check("the list refreshes after a void", refreshed, "void button still offered for a1");
  });
};

const checkFilters = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocuments(viewport, "/documents", {}, async (page, state) => {
      await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
      await page.getByLabel("Type", { exact: true }).selectOption("invoice");
      await settle(() => lastQuery(state).get("type") === "invoice");
      results.check(
        `${label}: the type filter is sent and kept in the URL`,
        lastQuery(state).get("type") === "invoice" && urlOf(page).searchParams.get("type") === "invoice",
        `${state.listQueries?.at(-1)} ${page.url()}`,
      );
      const rows = await page.locator("main").innerText();
      results.check(`${label}: other types disappear`, !rows.includes("WAY-a2") && rows.includes("INV-a1"), rows.slice(0, 300));

      await page.getByLabel("Status", { exact: true }).selectOption("generated");
      await page.getByLabel("From date").fill("2026-03-01");
      await page.getByLabel("To date").fill("2026-03-31");
      await settle(() => lastQuery(state).get("endDate") === "2026-03-31");
      const query = lastQuery(state);
      results.check(
        `${label}: status and UTC-day range are sent as startDate/endDate`,
        query.get("status") === "generated" && query.get("startDate") === "2026-03-01" && query.get("endDate") === "2026-03-31",
        state.listQueries?.at(-1),
      );
      const params = urlOf(page).searchParams;
      results.check(
        `${label}: the URL carries status, from and to`,
        params.get("status") === "generated" && params.get("from") === "2026-03-01" && params.get("to") === "2026-03-31",
        page.url(),
      );

      await page.getByRole("button", { name: "Clear filters" }).click();
      await settle(() => !lastQuery(state).get("type"));
      results.check(
        `${label}: clearing the filters empties the URL and the query`,
        !urlOf(page).searchParams.get("type") && !lastQuery(state).get("status") && !lastQuery(state).get("startDate"),
        `${state.listQueries?.at(-1)} ${page.url()}`,
      );

      await page.getByPlaceholder("Search by number or recipient").fill("Borys");
      await settle(() => lastQuery(state).get("search") === "Borys");
      results.check(
        `${label}: search is sent and kept in the URL`,
        lastQuery(state).get("search") === "Borys" && urlOf(page).searchParams.get("search") === "Borys",
        `${state.listQueries?.at(-1)} ${page.url()}`,
      );
    });
  }

  await withDocuments(
    VIEWPORTS[0].viewport,
    "/documents?type=act&status=void&from=2026-03-01&search=Cedar&type2=ignored",
    {},
    async (page, state) => {
      await visible(page.getByText("ACT-a3")).first().waitFor({ state: "visible" });
      const query = new URLSearchParams(state.listQueries?.[0] ?? "");
      results.check(
        "a link with filters opens the list already filtered",
        query.get("type") === "act" && query.get("status") === "void" && query.get("startDate") === "2026-03-01" && query.get("search") === "Cedar",
        state.listQueries?.[0],
      );
      results.check(
        "the controls show the filters from the URL",
        (await page.getByLabel("Type", { exact: true }).inputValue()) === "act" &&
          (await page.getByLabel("Status", { exact: true }).inputValue()) === "void" &&
          (await page.getByLabel("From date").inputValue()) === "2026-03-01",
        "controls not seeded",
      );
    },
  );

  await withDocuments(VIEWPORTS[0].viewport, "/documents?type=bogus&status=nope&from=yesterday", {}, async (page, state) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    const query = new URLSearchParams(state.listQueries?.[0] ?? "");
    results.check(
      "unknown URL filter values are ignored",
      !query.get("type") && !query.get("status") && !query.get("startDate"),
      state.listQueries?.[0],
    );
  });
};

const checkPolling = async (results) => {
  await withDocuments(VIEWPORTS[0].viewport, "/documents", {}, async (page, state) => {
    await visible(page.getByText("SAL-a5")).first().waitFor({ state: "visible" });
    state.documents = state.documents.map((doc) =>
      doc.id === "a5" ? { ...doc, status: "generated", pdf_url: "/pdf/a5" } : { ...doc, replacement_status: null },
    );
    const finished = await settle(async () => (await actionCount(page, "Share", "SAL-a5")) === 1, { timeoutMs: 12000 });
    results.check("a generating document is polled until it finishes", finished, "still processing after 12 s");
  });
};

const checkVoidRefusal = async (results) => {
  const refusal = {
    status: 400,
    body: { error: ["reason must be shorter than or equal to 500 characters"], errorCode: "HTTP_EXCEPTION" },
  };
  await withDocuments(VIEWPORTS[0].viewport, "/documents", { voidError: refusal }, async (page, state) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    await visible(page.getByRole("button", { name: "Void: Invoice INV-a1" })).click();
    const dialog = page.getByRole("dialog");
    results.check(
      "the void reason field is limited to 500 characters",
      (await dialog.locator("textarea").getAttribute("maxlength")) === "500",
      String(await dialog.locator("textarea").getAttribute("maxlength")),
    );
    await dialog.locator("textarea").fill("because");
    await dialog.getByRole("button", { name: "Void", exact: true }).click();
    await dialog.getByRole("alert").waitFor({ state: "visible" });
    const text = await dialog.innerText();
    results.check(
      "a 400 with a list of messages shows a translated text under the reason and keeps the dialog open",
      text.includes("The reason is not accepted. Use up to 500 characters.") && !text.includes("shorter than or equal") && (await page.getByRole("dialog").count()) === 1,
      text,
    );
    state.voidError = null;
    await dialog.getByRole("button", { name: "Void", exact: true }).click();
    await settle(() => (state.voided ?? []).length === 1);
    results.check("after fixing it the void goes through", (state.voided ?? []).length === 1, JSON.stringify(state.voided));
  });
};

const checkFailedRows = async (results) => {
  for (const { label, viewport } of VIEWPORTS) {
    await withDocuments(viewport, "/documents", {}, async (page, state) => {
      await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
      const reasons = await visible(page.getByTestId("failure-reason")).allInnerTexts();
      results.check(
        `${label}: a failed document shows a translated reason, never the server's English text`,
        reasons.length === 2 &&
          reasons[0].includes("could not be generated") &&
          !reasons.join(" ").includes("frozen candidate") &&
          !reasons.join(" ").includes("exploded"),
        JSON.stringify(reasons),
      );
      results.check(
        `${label}: a failed quote can be created again, a failed return note cannot`,
        (await actionCount(page, "Create again", "QUO-a4")) === 1 && (await actionCount(page, "Create again", "RET-a8")) === 0,
        "retry buttons wrong",
      );
      await visible(page.getByRole("button", { name: /^Create again: .* QUO-a4$/ })).click();
      const sent = await settle(() => state.requests.includes("POST /receipts/orders/o4/documents"));
      results.check(`${label}: Create again asks for a new quote on that order`, sent, state.requests.join(" | "));
    });
  }
};

const checkClearFilters = async (results) => {
  await withDocuments(VIEWPORTS[0].viewport, "/documents?type=invoice&search=Aurora", {}, async (page, state) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Clear filters" }).click();
    await settle(() => !lastQuery(state).get("search") && !lastQuery(state).get("type"));
    const params = urlOf(page).searchParams;
    results.check(
      "Clear filters also empties the search box, the query and the URL",
      (await page.getByPlaceholder("Search by number or recipient").inputValue()) === "" &&
        !lastQuery(state).get("search") && !params.get("search") && !params.get("type"),
      `${state.listQueries?.at(-1)} ${page.url()}`,
    );
  });
  await withDocuments(VIEWPORTS[0].viewport, "/documents?search=Aurora", {}, async (page) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    results.check(
      "a search alone makes Clear filters available",
      (await page.getByRole("button", { name: "Clear filters" }).count()) === 1,
      "button missing",
    );
  });
};

const checkDesktopFit = async (results) => {
  await withDocuments(VIEWPORTS[0].viewport, "/documents", {}, async (page) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    const fit = await page.evaluate(() => {
      const wrapper = document.querySelector("table")?.parentElement;
      const lastAction = [...document.querySelectorAll("table tbody tr")][0]?.querySelector("td:last-child button");
      const rect = lastAction?.getBoundingClientRect();
      return {
        scrolls: wrapper ? wrapper.scrollWidth > wrapper.clientWidth + 1 : null,
        actionInside: rect ? rect.right <= window.innerWidth && rect.left >= 0 : false,
      };
    });
    results.check("at 1280px the actions column is visible without sideways scrolling", fit.scrolls === false && fit.actionInside, JSON.stringify(fit));
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/documents-1280.png` });
  });
};

const checkMidWidth = async (results) => {
  await withDocuments({ width: 640, height: 900 }, "/documents", {}, async (page) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    results.check("640px: no horizontal overflow", await hasNoHorizontalOverflow(page), "page scrolls sideways");
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/documents-640.png` });
  });
  await withDocuments({ width: 375, height: 812 }, "/documents", {}, async (page) => {
    await visible(page.getByText("INV-a1")).first().waitFor({ state: "visible" });
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/documents-375.png` });
  });
};

const checkTimeZone = async (results) => {
  const late = listedDocument("z1", "invoice", "generated", order("oz", 30, "Zed Zone"), { created_at: "2026-03-10T23:30:00.000Z" });
  await withDocuments(VIEWPORTS[0].viewport, "/documents", { documents: [late], timeZone: "Pacific/Kiritimati" }, async (page) => {
    await visible(page.getByText("INV-z1")).first().waitFor({ state: "visible" });
    const body = await page.locator("main").innerText();
    results.check(
      "table dates use the document time zone (UTC+14 moves 23:30Z to the next day)",
      body.includes("11/03/2026, 13:30") && body.includes("Pacific/Kiritimati"),
      body.slice(0, 500),
    );
  });
  await withDocuments(VIEWPORTS[0].viewport, "/documents", { documents: [late] }, async (page) => {
    await visible(page.getByText("INV-z1")).first().waitFor({ state: "visible" });
    results.check(
      "the filter bar says which time zone the days are counted in",
      (await page.getByTestId("documents-timezone-hint").innerText()).includes("UTC"),
      await page.getByTestId("documents-timezone-hint").innerText(),
    );
  });
};

const checkStates = async (results) => {
  await withDocuments(VIEWPORTS[0].viewport, "/documents", { documents: [] }, async (page) => {
    await page.getByText("No documents yet.").first().waitFor({ state: "visible" });
    results.check(
      "an account without documents sees the empty state with a way to orders",
      (await page.getByRole("link", { name: "Go to orders" }).count()) > 0,
      "no link to orders",
    );
  });
  await withDocuments(VIEWPORTS[0].viewport, "/documents?status=failed&type=invoice", {}, async (page) => {
    await page.getByText("No documents match these filters").first().waitFor({ state: "visible" });
    results.pass("filters that match nothing say so");
  });
  await withDocuments(VIEWPORTS[0].viewport, "/documents", { listError: true }, async (page, state) => {
    const alert = page.getByRole("alert").first();
    await alert.waitFor({ state: "visible" });
    state.listError = false;
    await page.getByRole("button", { name: "Retry" }).first().click();
    const recovered = await settle(async () => (await visible(page.getByText("INV-a1")).count()) > 0);
    results.check("a failed load shows an error with Retry that recovers", recovered, "list did not recover");
  });
};

const checkNavigation = async (results) => {
  await withDocuments(VIEWPORTS[0].viewport, "/documents", {}, async (page) => {
    const link = page.getByRole("link", { name: "Documents", exact: true }).first();
    await link.waitFor({ state: "visible" });
    results.check(
      "the sidebar links to /documents",
      (await link.getAttribute("href")) === "/documents",
      String(await link.getAttribute("href")),
    );
  });
};

export const run = async () => {
  const results = new Results("documents page");
  await checkNavigation(results);
  await checkListing(results);
  await checkRowActions(results);
  await checkActions(results);
  await checkFilters(results);
  await checkPolling(results);
  await checkVoidRefusal(results);
  await checkFailedRows(results);
  await checkClearFilters(results);
  await checkDesktopFit(results);
  await checkMidWidth(results);
  await checkTimeZone(results);
  await checkStates(results);
  return results;
};
