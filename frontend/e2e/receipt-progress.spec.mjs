// Regression: the receipt "generating" UI must leave the loading state on its
// own once the matching receipt completes (or fails) — no page refresh — and it
// must not clear a different order that is still generating.

import {
  BASE_URL,
  createState,
  installApiMocks,
  startReceiptSocketServer,
  withPage,
} from "./support/harness.mjs";
import { Results, settle, waitFor } from "./support/runner.mjs";
import { makeOrder } from "./support/fixtures.mjs";

const DESKTOP = { width: 1280, height: 900 };

// Mirrors ReceiptProgressPanel: a failed card dismisses itself after 20s, and
// the watchdog gives up on a card after 3 failed lookups (one every ~8s). The
// races below are only visible on the far side of those deadlines.
const FAILED_DISMISS_MS = 20000;
const MAX_LOOKUP_FAILURES = 3;
const LOOKUP_GIVE_UP_WINDOW_MS = 12000;
const GRACE_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fails as soon as the predicate stops holding; passes if it holds past `deadline`. */
const holdsUntil = async (predicate, deadline) => {
  for (;;) {
    if (!(await predicate())) return false;
    if (Date.now() > deadline) return true;
    await sleep(250);
  }
};

// `receipt-processing` is the class the order row's spinner badge already
// carries, so the assertions hang off production markup rather than test hooks.
// The DataTable renders a table and a card list, only one of which is visible,
// so every count is scoped to what the user can actually see.
const processingBadges = (page) =>
  page.locator("span.receipt-processing:visible").count();

const generatingToasts = (page) =>
  page.locator('span:text-is("Generating receipt...")').count();

const panelText = async (page) => {
  const panel = page.locator("div.fixed.bottom-4.right-4");
  if ((await panel.count()) === 0) return "";
  return (await panel.first().innerText()).replace(/\s+/g, " ").trim();
};

const gotoOrders = async (page) => {
  await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
  await page.getByText("Aurora Coffee Bar").first().waitFor({ state: "visible" });
};

export const run = async () => {
  const results = new Results("receipt progress");
  const socket = await startReceiptSocketServer();

  try {
    // ── Case 1: single order completes ────────────────────────────────────
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
      ]);
      await installApiMocks(page, state);
      await gotoOrders(page);
      await socket.waitForClient();

      await waitFor(async () => (await processingBadges(page)) === 1, {
        label: "the order row to show the processing badge",
      });

      socket.emit("receipt.progress", {
        receiptId: "receipt-1",
        orderId: "order-1",
        progress: 40,
        stage: "generating_pdf",
      });
      await waitFor(
        async () => (await panelText(page)).includes("Generating receipt"),
        { label: "the progress toast" },
      );

      // The backend has finished: subsequent reads report a generated receipt.
      state.orders = [
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "generated",
          recipientName: "Aurora Coffee Bar",
        }),
      ];
      socket.emit("receipt.completed", {
        receiptId: "receipt-1",
        orderId: "order-1",
        pdfUrl: "https://example.test/receipt-1.pdf",
        receiptNumber: "R-0001",
      });

      results.check(
        "progress toast leaves the generating state when the receipt completes",
        await settle(
          async () => !(await panelText(page)).includes("Generating receipt"),
          { timeoutMs: 4000 },
        ),
        `toast still reads: ${JSON.stringify(await panelText(page))}`,
      );

      results.check(
        "order row drops the processing badge without a page refresh",
        await settle(async () => (await processingBadges(page)) === 0, {
          timeoutMs: 6000,
        }),
        `still ${await processingBadges(page)} processing badge(s) on screen`,
      );
    });

    // ── Case 2: one of two concurrent generations completes ───────────────
    await withPage({ viewport: DESKTOP }, async (page) => {
      const both = [
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
        makeOrder({
          id: "order-2",
          receiptId: "receipt-2",
          receiptStatus: "processing",
          recipientName: "Borealis Roastery",
        }),
      ];
      const state = createState(both);
      await installApiMocks(page, state);
      await gotoOrders(page);
      await socket.waitForClient();

      await waitFor(async () => (await processingBadges(page)) === 2, {
        label: "two processing badges",
      });

      for (const id of ["1", "2"]) {
        socket.emit("receipt.progress", {
          receiptId: `receipt-${id}`,
          orderId: `order-${id}`,
          progress: 40,
          stage: "generating_pdf",
        });
      }
      await waitFor(async () => (await generatingToasts(page)) === 2, {
        label: "two progress toasts",
      });

      // Only order-1 finished.
      state.orders = [
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "generated",
          recipientName: "Aurora Coffee Bar",
        }),
        both[1],
      ];
      socket.emit("receipt.completed", {
        receiptId: "receipt-1",
        orderId: "order-1",
        pdfUrl: "https://example.test/receipt-1.pdf",
        receiptNumber: "R-0001",
      });

      results.check(
        "the completed order stops showing the processing badge",
        await settle(async () => (await processingBadges(page)) === 1, {
          timeoutMs: 6000,
        }),
        `expected exactly 1 processing badge, saw ${await processingBadges(page)}`,
      );

      const stillGenerating = await panelText(page);
      results.check(
        "the other order keeps its generating toast",
        stillGenerating.includes("Generating receipt"),
        `panel text was ${JSON.stringify(stillGenerating)}`,
      );
    });

    // ── Case 3: generation fails ─────────────────────────────────────────
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
      ]);
      await installApiMocks(page, state);
      await gotoOrders(page);
      await socket.waitForClient();

      await waitFor(async () => (await processingBadges(page)) === 1, {
        label: "the processing badge",
      });

      state.orders = [
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "failed",
          recipientName: "Aurora Coffee Bar",
        }),
      ];
      socket.emit("receipt.failed", {
        receiptId: "receipt-1",
        orderId: "order-1",
        error: "Storage unavailable",
      });

      results.check(
        "a failed generation also clears the processing badge",
        await settle(async () => (await processingBadges(page)) === 0, {
          timeoutMs: 6000,
        }),
        `still ${await processingBadges(page)} processing badge(s) on screen`,
      );
    });

    // ── Case 4: the socket never delivers (the production symptom) ────────
    // Deployments ship without VITE_WS_URL, so the browser talks to the wrong
    // host and no receipt event ever arrives. The order row must still leave
    // the generating state on its own once the receipt is really done.
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
        makeOrder({
          id: "order-2",
          receiptId: "receipt-2",
          receiptStatus: "processing",
          recipientName: "Borealis Roastery",
        }),
      ]);
      await installApiMocks(page, state);
      await page.route("**/socket.io/**", (route) => route.abort());
      await gotoOrders(page);

      await waitFor(async () => (await processingBadges(page)) === 2, {
        label: "two processing badges",
      });

      // Only order-1 finished on the server; no socket event is delivered.
      state.orders = [
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "generated",
          recipientName: "Aurora Coffee Bar",
        }),
        state.orders[1],
      ];

      results.check(
        "processing badge clears with no socket delivery and no page refresh",
        await settle(async () => (await processingBadges(page)) === 1, {
          timeoutMs: 15000,
        }),
        `expected exactly 1 processing badge, saw ${await processingBadges(page)} after 15s`,
      );

      const rowText = (await page.locator("table").first().innerText())
        .replace(/\s+/g, " ")
        .trim();
      results.check(
        "the order still generating keeps its badge",
        rowText.includes("Borealis Roastery"),
        `table text was ${JSON.stringify(rowText)}`,
      );
    });

    // ── Case 5: progress arrives, completion is lost ──────────────────────
    // A dropped socket between the last progress frame and completion must not
    // strand the toast in "generating" forever.
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
      ]);
      await installApiMocks(page, state);
      await gotoOrders(page);
      await socket.waitForClient();

      socket.emit("receipt.progress", {
        receiptId: "receipt-1",
        orderId: "order-1",
        progress: 80,
        stage: "saving",
      });
      await waitFor(async () => (await generatingToasts(page)) === 1, {
        label: "the progress toast",
      });

      // Server finishes; the completion event never reaches the browser.
      state.orders = [
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "generated",
          recipientName: "Aurora Coffee Bar",
        }),
      ];
      state.receipts = {
        "receipt-1": {
          id: "receipt-1",
          order_id: "order-1",
          number: "R-0001",
          status: "generated",
          progress: 100,
        },
      };

      results.check(
        "toast resolves itself when the completion event is lost",
        await settle(async () => (await generatingToasts(page)) === 0, {
          timeoutMs: 20000,
        }),
        `toast still reads: ${JSON.stringify(await panelText(page))}`,
      );
    });

    // ── Case 6: retrying a failed receipt outlives its dismiss timer ──────
    // A failed card schedules its own dismissal 20s out so the error stays
    // readable. Retrying reuses the same receipt id, so that timer must not
    // delete the card the retry puts back on screen.
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
      ]);
      // The retry really is generating, so the watchdog keeps the card alive and
      // the dismiss timer is the only thing that can take it away.
      state.receipts = {
        "receipt-1": {
          id: "receipt-1",
          order_id: "order-1",
          number: "R-0001",
          status: "processing",
          progress: 40,
        },
      };
      await installApiMocks(page, state);
      await gotoOrders(page);
      await socket.waitForClient();

      socket.emit("receipt.failed", {
        receiptId: "receipt-1",
        orderId: "order-1",
        error: "Storage unavailable",
      });
      await waitFor(
        async () =>
          (await panelText(page)).includes("Receipt generation failed"),
        { label: "the failed card" },
      );
      const dismissDeadline = Date.now() + FAILED_DISMISS_MS;

      await page
        .locator('div.fixed.bottom-4.right-4 button:text-is("Retry")')
        .first()
        .click();
      await waitFor(async () => state.generateRequests.length === 1, {
        label: "the retry request",
      });

      // The backend reuses the receipt id for the new attempt.
      socket.emit("receipt.progress", {
        receiptId: "receipt-1",
        orderId: "order-1",
        progress: 20,
        stage: "generating_pdf",
      });
      await waitFor(async () => (await generatingToasts(page)) === 1, {
        label: "the retry's progress toast",
      });

      results.check(
        "the failed card's dismiss timer does not remove the retry's card",
        await holdsUntil(
          async () => (await generatingToasts(page)) === 1,
          dismissDeadline + GRACE_MS,
        ),
        `the retry's card vanished; panel reads ${JSON.stringify(await panelText(page))}`,
      );
    });

    // ── Case 7: a superseded lookup must not count against the next attempt ─
    // The watchdog drops a card after three failed lookups. When a socket event
    // lands while a lookup is in flight, that lookup belongs to an attempt that
    // is already over — carrying its tally into the retry would kill the retry's
    // card on its first failed lookup.
    await withPage({ viewport: DESKTOP }, async (page) => {
      const state = createState([
        makeOrder({
          id: "order-1",
          receiptId: "receipt-1",
          receiptStatus: "processing",
          recipientName: "Aurora Coffee Bar",
        }),
      ]);
      await installApiMocks(page, state);

      // Registered after the harness so it wins for this one URL: every lookup
      // 404s, and one can be held open to reproduce the in-flight race.
      let lookups = 0;
      let releaseHeldLookup = null;
      let holdNextLookup = false;
      await page.route("**/api/v1/receipts/receipt-1", async (route) => {
        lookups += 1;
        if (holdNextLookup) {
          holdNextLookup = false;
          await new Promise((resolve) => {
            releaseHeldLookup = resolve;
          });
        }
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: "{}",
        });
      });

      await gotoOrders(page);
      await socket.waitForClient();

      socket.emit("receipt.progress", {
        receiptId: "receipt-1",
        orderId: "order-1",
        progress: 40,
        stage: "generating_pdf",
      });
      await waitFor(async () => (await generatingToasts(page)) === 1, {
        label: "the progress toast",
      });

      // Let the card get to one lookup short of being given up on.
      await waitFor(() => lookups >= MAX_LOOKUP_FAILURES - 1, {
        timeoutMs: 30000,
        label: `${MAX_LOOKUP_FAILURES - 1} failed receipt lookups`,
      });
      holdNextLookup = true;
      await waitFor(() => releaseHeldLookup !== null, {
        timeoutMs: 30000,
        label: "a receipt lookup to be in flight",
      });

      // The socket answers while that lookup is still open: the attempt is over.
      socket.emit("receipt.failed", {
        receiptId: "receipt-1",
        orderId: "order-1",
        error: "Storage unavailable",
      });
      await waitFor(
        async () =>
          (await panelText(page)).includes("Receipt generation failed"),
        { label: "the failed card" },
      );
      releaseHeldLookup();
      await sleep(500); // let the superseded lookup finish resolving

      // The retry reuses the receipt id, and starts a tally of its own.
      socket.emit("receipt.progress", {
        receiptId: "receipt-1",
        orderId: "order-1",
        progress: 15,
        stage: "loading_order",
      });
      await waitFor(async () => (await generatingToasts(page)) === 1, {
        label: "the retry's progress toast",
      });

      results.check(
        "lookups the socket superseded do not count against the next attempt",
        await holdsUntil(
          async () => (await generatingToasts(page)) === 1,
          Date.now() + LOOKUP_GIVE_UP_WINDOW_MS,
        ),
        `the retry's card vanished; panel reads ${JSON.stringify(await panelText(page))}`,
      );
    });
  } finally {
    await socket.close();
  }

  return results;
};
