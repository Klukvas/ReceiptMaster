// The API ends a receipts socket whose token was revoked (a logout or password change on any
// device). The app must not stay without live updates: once the API client stores a newer
// token, the socket reconnects with it, and never retries with the refused one.

import {
  BASE_URL,
  createState,
  installApiMocks,
  startReceiptSocketServer,
  withPage,
} from "./support/harness.mjs";
import { Results, waitFor } from "./support/runner.mjs";

export const run = async () => {
  const results = new Results("receipt socket after revocation");
  const socket = await startReceiptSocketServer();
  try {
    await withPage({ viewport: { width: 1280, height: 900 } }, async (page) => {
      await installApiMocks(page, createState());
      await page.goto(`${BASE_URL}/orders`, { waitUntil: "domcontentloaded" });
      await socket.waitForClient();

      socket.disconnectAll();
      await page.waitForTimeout(4000);
      results.check(
        "after a server-side disconnect the socket waits instead of retrying the refused token",
        socket.handshakeTokens().length === 1,
        JSON.stringify(socket.handshakeTokens()),
      );

      await page.evaluate(() => localStorage.setItem("auth_token", "refreshed-token"));
      const reconnected = await waitFor(() => socket.handshakeTokens().length === 2, {
        timeoutMs: 10000,
        label: "a reconnect with the refreshed token",
      }).catch(() => false);
      results.check(
        "once a newer token is stored the socket reconnects with it",
        reconnected && socket.handshakeTokens()[1] === "refreshed-token",
        JSON.stringify(socket.handshakeTokens()),
      );
    });
  } finally {
    await socket.close();
  }
  return results;
};
