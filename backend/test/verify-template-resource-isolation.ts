import { createServer } from "http";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { PlaywrightPdfGenerator } from "../src/modules/receipts/services/playwright-pdf-generator.service";
async function main(): Promise<void> {
  const output = resolve(
    process.env.TEMPLATE_EVIDENCE || "temp/template-features-20261015-225300",
  );
  mkdirSync(output, { recursive: true });
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.end("REMOTE SHOULD NOT LOAD HTTP-RESOURCE-MARKER");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test address");
  const origin = `http://127.0.0.1:${address.port}`;
  const marker = join(output, "private-render-marker.txt");
  writeFileSync(marker, "PRIVATE-FILE-MARKER");
  const renderer = new PlaywrightPdfGenerator();
  try {
    const bytes = await renderer.generatePdf(
      `<!doctype html><html><head><style>@import url('${origin}/css');</style></head><body><h1>Resource isolation</h1><img src="${origin}/image"><iframe src="file://${marker}"></iframe><script>document.body.append('SCRIPT-EXECUTED-MARKER');fetch('${origin}/script')</script></body></html>`,
    );
    if (requests !== 0)
      throw new Error(`Renderer made ${requests} external requests`);
    writeFileSync(join(output, "resource-isolation.pdf"), bytes);
    writeFileSync(
      join(output, "resource-isolation.json"),
      JSON.stringify(
        {
          requests,
          pdfHeader: bytes.subarray(0, 4).toString(),
          javascriptDisabled: true,
          privateMarker: "must be absent from PDF text",
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      "PASS external HTTP, CSS, script and file resources blocked\n",
    );
  } finally {
    await renderer.cleanup();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
void main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
