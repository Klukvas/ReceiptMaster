import {
  createTemplateFixture,
  ORDER_ID,
  TENANT,
} from "./template-features-fixture";
import { Order } from "../src/modules/orders/entities/order.entity";
import { Receipt } from "../src/modules/receipts/entities/receipt.entity";
import {
  TEMPLATE_METADATA,
  getTemplateCapabilities,
} from "../src/modules/receipts/templates/metadata";
import { runWithTenant } from "../src/common/tenancy/tenant-context";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { build } from "esbuild";
import { json } from "express";
async function main(): Promise<void> {
  const port = Number(process.env.TEMPLATE_FIXTURE_PORT || 4327);
  const output = resolve(
    process.env.TEMPLATE_EVIDENCE || "temp/template-features-20261015-225300",
  );
  mkdirSync(output, { recursive: true });
  const f = await createTemplateFixture(true, false);
  await build({
    entryPoints: [resolve("../frontend/e2e/fixtures/template-features.tsx")],
    bundle: true,
    outfile: join(output, "fixture.js"),
    format: "iife",
    jsx: "automatic",
    define: {
      "import.meta.env": "{}",
      "import.meta.env.VITE_BILLING_ENABLED": '"false"',
      "import.meta.env.VITE_API_URL": JSON.stringify(
        `http://127.0.0.1:${port}/api/v1`,
      ),
      "import.meta.env.VITE_API_KEY": '"fixture"',
      "import.meta.env.PROD": "false",
    },
  });
  const server = f.app.getHttpAdapter().getInstance();
  server.get("/api/v1/settings/templates", (_req, res) =>
    res.json({
      data: Object.values(TEMPLATE_METADATA).map((value) => ({
        ...value,
        locked: false,
        capabilities: getTemplateCapabilities(value.id),
      })),
    }),
  );
  server.get("/api/v1/subscription/status", (_req, res) =>
    res.json({
      plan: "business",
      usage: { productsCount: 0, ordersThisMonth: 0 },
      limits: { maxProducts: null, maxOrdersPerMonth: null },
      hasPaddleSubscription: false,
    }),
  );
  server.get("/api/v1/fixture-order", async (_req, res) => {
    const order = await f.db.manager.findOne(Order, {
      where: { id: ORDER_ID },
    });
    res.json({
      ...order,
      receipts: await f.db.manager.find(Receipt, {
        where: { order_id: ORDER_ID },
      }),
    });
  });
  server.get("/fixture/state", async (_req, res) =>
    res.json({
      defaults: await f.documents.read(TENANT),
      writes: f.memory.writes,
      objectKeys: [...f.objects.keys()],
      receipts: f.memory.rows(Receipt).map((row) => ({
        id: row.id,
        status: row.status,
        replacement_status: row.replacement_status,
        active_revision: row.active_revision,
      })),
    }),
  );
  server.post("/fixture/control", json(), async (req, res) => {
    if ("failCommit" in req.body)
      f.memory.failCommit = Boolean(req.body.failCommit);
    if ("failUpload" in req.body)
      f.failures.upload = Boolean(req.body.failUpload);
    if ("previewDelay" in req.body)
      f.failures.previewDelay = Math.min(
        3000,
        Number(req.body.previewDelay) || 0,
      );
    res.json({ ok: true });
  });
  server.post("/fixture/run-jobs", async (_req, res) => {
    for (const row of f.memory.rows(Receipt))
      if (
        row.status === "processing" ||
        row.replacement_status === "processing"
      )
        await runWithTenant(TENANT, () =>
          f.artifacts.execute(
            String(row.id),
            TENANT,
            String(row.generation_id),
          ),
        );
    res.json({ ok: true });
  });
  const assets = resolve("../frontend/dist/assets");
  server.get("/fixture.js", (_req, res) =>
    res.type("js").send(readFileSync(join(output, "fixture.js"))),
  );
  server.get("/style.css", (_req, res) =>
    res.type("css").send(
      readFileSync(
        join(
          assets,
          readdirSync(assets).find((name) => name.endsWith(".css")),
        ),
      ),
    ),
  );
  server.get("/", (_req, res) =>
    res
      .type("html")
      .send(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
      ),
  );
  writeFileSync(
    join(output, "fixture-manifest.json"),
    JSON.stringify(
      {
        port,
        url: `http://127.0.0.1:${port}`,
        source: "backend/test/serve-template-features.ts",
        entrypoint: "frontend/e2e/fixtures/template-features.tsx",
        servedJsSha256: createHash("sha256")
          .update(readFileSync(join(output, "fixture.js")))
          .digest("hex"),
        persistence:
          "synthetic in-memory DB and S3 doubles; production Nest/React/Axios/Query/HTML/Chrome renderer",
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await f.app.listen(port, "127.0.0.1");
  process.stdout.write(`Template features fixture http://127.0.0.1:${port}\n`);
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      void f.close().then(() => process.exit(0));
    });
}
void main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
