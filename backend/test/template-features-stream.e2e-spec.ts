import sharp = require("sharp");
import { request as httpRequest } from "http";
import { AddressInfo } from "net";
import { createTemplateFixture, TENANT } from "./template-features-fixture";

const boundary = "fix4-boundary";
function multipart(
  payload: unknown,
  file?: Buffer,
  preamble = 0,
  epilogue = 0,
): Buffer {
  return Buffer.concat([
    Buffer.alloc(preamble, "x"),
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(payload)}\r\n`,
    ),
    ...(file
      ? [
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          file,
          Buffer.from("\r\n"),
        ]
      : []),
    Buffer.from(`--${boundary}--\r\n`),
    Buffer.alloc(epilogue, "e"),
  ]);
}
function chunked(
  port: number,
  body: Buffer,
  type = `multipart/form-data; boundary=${boundary}`,
  path = "/api/v1/receipts/preview",
): Promise<{ status: number; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path,
        headers: { "Content-Type": type, "Transfer-Encoding": "chunked" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (part: Buffer) => chunks.push(part));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            bytes: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(5000, () => req.destroy(new Error("HTTP request hung")));
    req.on("error", reject);
    // Actual Transfer-Encoding: chunked; no Content-Length; multi-write boundaries.
    for (let offset = 0; offset < body.length; offset += 16381)
      req.write(body.subarray(offset, offset + 16381));
    req.end();
  });
}
describe("FIX4 raw chunked multipart through actual Nest HTTP", () => {
  let f: Awaited<ReturnType<typeof createTemplateFixture>>, port: number;
  let payload: unknown;
  beforeEach(async () => {
    f = await createTemplateFixture();
    await f.app.listen(0, "127.0.0.1");
    port = (f.app.getHttpServer().address() as AddressInfo).port;
    payload = {
      config: (await f.documents.read(TENANT)).config,
      logoAction: "keep",
    };
  });
  afterEach(async () => {
    await f.close();
  });
  it.each(["preamble", "epilogue"])(
    "rejects total %s above 6 MiB with zero persistence",
    async (kind) => {
      const before = JSON.stringify([...f.memory.tables]);
      const response = await chunked(
        port,
        multipart(
          payload,
          undefined,
          kind === "preamble" ? 7 * 1024 * 1024 : 0,
          kind === "epilogue" ? 7 * 1024 * 1024 : 0,
        ),
      );
      expect(response.status).toBe(413);
      expect(f.memory.writes).toEqual([]);
      expect(JSON.stringify([...f.memory.tables])).toBe(before);
      expect(f.objects.size).toBe(0);
    },
  );
  it("preserves valid chunked payload/logo bytes, JSON and file size limit", async () => {
    const png = await sharp({
      create: { width: 12, height: 8, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    const draft = { ...(payload as object), logoAction: "replace" };
    expect((await chunked(port, multipart(draft, png))).status).toBe(201);
    expect(
      (
        await chunked(
          port,
          Buffer.from(JSON.stringify(payload)),
          "application/json",
        )
      ).status,
    ).toBe(201);
    expect(
      (await chunked(port, multipart(draft, Buffer.alloc(5 * 1024 * 1024 + 1))))
        .status,
    ).toBe(413);
    expect(f.memory.writes).toEqual([]);
    expect(f.objects.size).toBe(0);
  });
  it("malformed multipart and client abort settle; the next valid request works", async () => {
    const errors: unknown[] = [];
    const onError = (error: unknown) => errors.push(error);
    process.on("unhandledRejection", onError);
    try {
      expect(
        (
          await chunked(
            port,
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="x.png"\r\nContent-Type: image/png\r\n\r\npartial`,
            ),
          )
        ).status,
      ).toBe(400);
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest({
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/v1/receipts/preview",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Transfer-Encoding": "chunked",
          },
        });
        req.on("error", () => resolve());
        req.on("close", resolve);
        req.setTimeout(3000, () => reject(new Error("Abort hung")));
        req.write(
          `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="x.png"\r\nContent-Type: image/png\r\n\r\npartial`,
        );
        setTimeout(() => req.destroy(), 20);
      });
      expect((await chunked(port, multipart(payload))).status).toBe(201);
      expect(errors).toEqual([]);
      expect(f.memory.writes).toEqual([]);
    } finally {
      process.off("unhandledRejection", onError);
    }
  });
});
