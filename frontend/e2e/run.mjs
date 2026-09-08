// Entry point for the e2e regression suite.
//
//   yarn --cwd frontend e2e            # every spec
//   yarn --cwd frontend e2e receipt    # only specs whose name matches
//
// Starts its own Vite dev server unless one is already listening on
// E2E_BASE_URL (default http://127.0.0.1:5231). The suite drives the real app;
// only the HTTP API and the receipt socket are mocked.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { BASE_URL, WS_PORT } from "./support/harness.mjs";

const SPECS = [
  { name: "dropdown-position", load: () => import("./dropdown-position.spec.mjs") },
  { name: "mobile-product-dropdown", load: () => import("./mobile-product-dropdown.spec.mjs") },
  { name: "receipt-socket-url", load: () => import("./receipt-socket-url.spec.mjs") },
  { name: "receipt-progress", load: () => import("./receipt-progress.spec.mjs") },
];

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STARTUP_TIMEOUT_MS = 60000;

const isServerUp = async () => {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
};

const startDevServer = async () => {
  const { port } = new URL(BASE_URL);
  const child = spawn(
    "npx",
    ["vite", "--port", port, "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: FRONTEND_DIR,
      env: { ...process.env, VITE_WS_URL: `http://127.0.0.1:${WS_PORT}` },
      stdio: "ignore",
    },
  );

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await isServerUp())) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited with code ${child.exitCode} before serving ${BASE_URL}`);
    }
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error(`Vite did not start serving ${BASE_URL} within ${STARTUP_TIMEOUT_MS}ms`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  process.stdout.write(`started a dev server on ${BASE_URL}\n`);
  return () => child.kill("SIGTERM");
};

const main = async () => {
  const filter = process.argv[2];
  const stopServer = (await isServerUp()) ? null : await startDevServer();

  let failed = 0;
  let total = 0;

  try {
    for (const spec of SPECS) {
      if (filter && !spec.name.includes(filter)) continue;
      process.stdout.write(`\n${spec.name}\n`);
      const results = await (await spec.load()).run();
      total += results.cases.length;
      failed += results.failed.length;
    }
  } finally {
    stopServer?.();
  }

  process.stdout.write(`\n${total - failed}/${total} checks passed\n`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
