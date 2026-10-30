import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { Results, waitFor } from "./support/runner.mjs";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const run = async () => {
  const results = new Results("production proxy");
  const parent = resolve(frontend, "e2e/.cache");
  mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(resolve(parent, "proxy-"));
  const received = [];
  const backend = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url,
        signature: request.headers["paddle-signature"],
        body: Buffer.concat(chunks).toString(),
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
  });
  const sockets = new Server(backend);
  sockets
    .of("/receipts")
    .on("connection", (socket) =>
      socket.emit("receipt.completed", { receiptId: "test-receipt" }),
    );
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const proxyPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  let nginx;
  try {
    const certificate = spawnSync("openssl", [
      "req",
      "-x509",
      "-nodes",
      "-days",
      "1",
      "-newkey",
      "rsa:2048",
      "-keyout",
      resolve(scratch, "test.key"),
      "-out",
      resolve(scratch, "test.crt"),
      "-subj",
      "/CN=localhost",
    ]);
    if (certificate.status !== 0)
      throw Error("Could not create isolated proxy TLS fixture");
    let production = readFileSync(resolve(frontend, "nginx.conf"), "utf8");
    production = production
      .replace(
        "server backend:3000;",
        `server 127.0.0.1:${backend.address().port};`,
      )
      .replace(/server \{\s*listen 80;[\s\S]*?\n\}/, "")
      .replace("listen 443 ssl http2;", `listen 127.0.0.1:${proxyPort} ssl;`)
      .replace(
        "/etc/ssl/certs/nginx-selfsigned.crt",
        resolve(scratch, "test.crt"),
      )
      .replace(
        "/etc/ssl/private/nginx-selfsigned.key",
        resolve(scratch, "test.key"),
      )
      .replace("/usr/share/nginx/html", scratch);
    const config = resolve(scratch, "nginx.conf");
    writeFileSync(resolve(scratch, "index.html"), "SPA FALLBACK");
    // Every temp path lives in the scratch dir: packaged nginx builds default to
    // root-owned directories that an unprivileged CI user cannot create.
    const tempPaths = ["client_body", "proxy", "fastcgi", "uwsgi", "scgi"]
      .map((kind) => `${kind}_temp_path ${scratch}/${kind};`)
      .join(" ");
    writeFileSync(
      config,
      `pid ${scratch}/nginx.pid;\nerror_log ${scratch}/error.log;\nevents {}\nhttp { access_log off; ${tempPaths}\n${production}\n}`,
    );
    const binary = process.env.E2E_NGINX_BINARY || "nginx";
    const syntax = spawnSync(binary, ["-p", scratch, "-c", config, "-t"]);
    results.check(
      "16/17: Nginx production routes pass native syntax validation",
      syntax.status === 0,
      syntax.stderr?.toString(),
    );
    if (syntax.status !== 0) return results;
    nginx = spawn(binary, ["-p", scratch, "-c", config, "-g", "daemon off;"], {
      stdio: "ignore",
    });
    // Playwright's API client permits the self-signed local TLS fixture.
    const { request } = await import("playwright");
    const client = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      const url = `https://127.0.0.1:${proxyPort}`;
      await waitFor(async () => {
        try {
          return (await client.get(url)).ok();
        } catch {
          return false;
        }
      });
      const body =
        '{ "event_type": "subscription.updated", "data": {"id":"test"} }\n';
      const response = await client.post(`${url}/paddle/webhook`, {
        data: body,
        headers: {
          "content-type": "application/json",
          "paddle-signature": "ts=fixture;h1=fixture",
        },
      });
      results.check(
        "16: webhook URI, signature and raw bytes are preserved",
        response.ok() &&
          received.some(
            (item) =>
              item.path === "/paddle/webhook" &&
              item.signature === "ts=fixture;h1=fixture" &&
              item.body === body,
          ),
        JSON.stringify(received),
      );
      for (const transport of ["polling", "websocket"]) {
        const socket = io(`${url}/receipts`, {
          transports: [transport],
          rejectUnauthorized: false,
          reconnection: false,
          timeout: 3000,
        });
        const event = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 4000);
          socket.on("receipt.completed", (payload) => {
            clearTimeout(timer);
            resolve(payload.receiptId === "test-receipt");
          });
          socket.on("connect_error", () => {
            clearTimeout(timer);
            resolve(false);
          });
        });
        socket.disconnect();
        results.check(
          `17: receipt event delivered through ${transport} transport`,
          event,
          `${transport} fell into the SPA or failed the handshake`,
        );
      }
    } finally {
      await client.dispose();
    }
  } finally {
    if (nginx && nginx.exitCode === null) {
      await new Promise((resolve) => {
        nginx.once("exit", resolve);
        nginx.kill("SIGTERM");
      });
    }
    await sockets.close();
    if (backend.listening)
      await new Promise((resolve) => backend.close(resolve));
    rmSync(scratch, { recursive: true });
  }
  return results;
};
