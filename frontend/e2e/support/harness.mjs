// Shared browser + network harness for the e2e regression suite.
//
// The app is driven through its real routes; only the HTTP API and the receipt
// WebSocket are mocked, so the components, hooks and services under test are the
// production ones.

import { chromium } from "playwright";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "node:http";
import {
  PRODUCTS,
  RECIPIENTS,
  SUBSCRIPTION_STATUS,
  USER,
  paginated,
} from "./fixtures.mjs";

export const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5231";
export const WS_PORT = Number(process.env.E2E_WS_PORT || 4599);

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/**
 * Installs API mocks. `state.orders` is read on every request so a test can
 * change what the backend "returns" mid-run (e.g. after a receipt completes).
 */
export const installApiMocks = async (page, state) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const method = route.request().method();

    state.requests.push(`${method} ${path}`);

    if (path === "/auth/profile") return json(route, USER);
    if (path === "/subscription/status") return json(route, SUBSCRIPTION_STATUS);
    if (path === "/products") return json(route, paginated(PRODUCTS));
    if (path === "/recipients") return json(route, paginated(RECIPIENTS));
    if (path === "/orders") return json(route, paginated(state.orders));
    if (path === "/receipts/printers") return json(route, { printers: [] });
    if (path === "/receipts") return json(route, paginated([]));
    if (path.startsWith("/receipts/orders/") && method === "POST") {
      state.generateRequests.push(path);
      return json(route, { id: "receipt-new", status: "processing" }, 202);
    }
    if (path.startsWith("/receipts/") && method === "GET") {
      const receiptId = path.slice("/receipts/".length);
      const receipt = state.receipts[receiptId];
      return receipt ? json(route, receipt) : json(route, {}, 404);
    }
    if (path.startsWith("/settings/")) return json(route, {});

    return json(route, {}, 404);
  });

  // The app boots i18n from localStorage; pin it so assertions are language-stable.
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "e2e-token");
    localStorage.setItem("refresh_token", "e2e-refresh");
    localStorage.setItem("i18nextLng", "en");
  });
};

/** Real socket.io server on the namespace `useReceiptSocket` connects to. */
export const startReceiptSocketServer = async () => {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
  const namespace = io.of("/receipts");
  const connections = [];
  namespace.on("connection", (socket) => connections.push(socket));

  await new Promise((resolve) => httpServer.listen(WS_PORT, "127.0.0.1", resolve));

  return {
    emit: (event, payload) => namespace.emit(event, payload),
    waitForClient: async (timeoutMs = 10000) => {
      const deadline = Date.now() + timeoutMs;
      while (connections.length === 0) {
        if (Date.now() > deadline) throw new Error("No socket client connected");
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    close: async () => {
      await io.close();
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
};

export const withPage = async ({ viewport }, run) => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 640,
    hasTouch: viewport.width < 640,
  });
  const page = await context.newPage();
  try {
    return await run(page);
  } finally {
    await context.close();
    await browser.close();
  }
};

export const createState = (orders = []) => ({
  orders,
  receipts: {},
  requests: [],
  generateRequests: [],
});
