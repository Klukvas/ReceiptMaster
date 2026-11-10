import { randomBytes } from "crypto";
import sharp = require("sharp");
import { ApiErrorResponse } from "../errors/ApiError";
import { SIGNOFF_LIMITS, normalizeSignoffImage } from "./signoff-image";

const inkOnWhite = (width: number, height: number) => ({
  create: {
    width,
    height,
    channels: 3 as const,
    background: { r: 20, g: 30, b: 160 },
  },
});

const png = (width = 400, height = 200) =>
  sharp(inkOnWhite(width, height)).png().toBuffer();
const jpeg = (width = 400, height = 200) =>
  sharp(inkOnWhite(width, height)).jpeg().toBuffer();

/** Inserts an `acTL` chunk after IHDR, which is what makes a PNG animated. */
function asAnimatedPng(source: Buffer): Buffer {
  const chunk = Buffer.alloc(20);
  chunk.writeUInt32BE(8, 0);
  chunk.write("acTL", 4, "latin1");
  chunk.writeUInt32BE(2, 8);
  chunk.writeUInt32BE(0, 12);
  const afterIhdr = 8 + 12 + 13;
  return Buffer.concat([
    source.subarray(0, afterIhdr),
    chunk,
    source.subarray(afterIhdr),
  ]);
}

async function rejection(promise: Promise<unknown>): Promise<ApiErrorResponse> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiErrorResponse);
  return error as ApiErrorResponse;
}

describe("normalizeSignoffImage", () => {
  it("accepts a PNG and returns a PNG within the kind's box", async () => {
    const result = await normalizeSignoffImage(
      await png(1600, 600),
      "image/png",
      "signature",
    );

    expect(result.width).toBeLessThanOrEqual(
      SIGNOFF_LIMITS.box.signature.width,
    );
    expect(result.height).toBeLessThanOrEqual(
      SIGNOFF_LIMITS.box.signature.height,
    );
    expect((await sharp(result.png).metadata()).format).toBe("png");
  });

  it("fits a stamp into 600 x 600 and never enlarges a small image", async () => {
    const big = await normalizeSignoffImage(
      await png(2000, 2000),
      "image/png",
      "stamp",
    );
    expect([big.width, big.height]).toEqual([600, 600]);

    const small = await normalizeSignoffImage(
      await png(64, 40),
      "image/png",
      "stamp",
    );
    expect([small.width, small.height]).toEqual([64, 40]);
  });

  it.each(["image/jpeg", "image/jpg"])(
    "accepts a JPEG declared as %s",
    async (mime) => {
      const result = await normalizeSignoffImage(
        await jpeg(),
        mime,
        "signature",
      );
      expect((await sharp(result.png).metadata()).format).toBe("png");
    },
  );

  it("strips EXIF, including GPS and a free-text field", async () => {
    const tagged = await sharp(inkOnWhite(300, 200))
      .jpeg()
      .withExif({ IFD0: { ImageDescription: "gps-and-secret-note" } })
      .toBuffer();
    expect(tagged.includes(Buffer.from("gps-and-secret-note"))).toBe(true);

    const { png: stored } = await normalizeSignoffImage(
      tagged,
      "image/jpeg",
      "signature",
    );

    expect(stored.includes(Buffer.from("gps-and-secret-note"))).toBe(false);
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
  });

  it("applies the EXIF orientation before the metadata is dropped", async () => {
    const sideways = await sharp(inkOnWhite(300, 100))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await normalizeSignoffImage(
      sideways,
      "image/jpeg",
      "signature",
    );
    expect([result.width, result.height]).toEqual([100, 300]);
  });

  const refused: Array<[string, () => Promise<Buffer>, string]> = [
    [
      "an SVG renamed .png",
      async () =>
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>1</script></svg>',
        ),
      "image/png",
    ],
    [
      "a GIF",
      async () => Buffer.from("GIF89a\x40\x00\x40\x00\x00\x00\x00;", "latin1"),
      "image/gif",
    ],
    [
      "a GIF declared as PNG",
      async () => Buffer.from("GIF89a\x40\x00\x40\x00\x00\x00\x00;", "latin1"),
      "image/png",
    ],
    ["a WebP", () => sharp(inkOnWhite(64, 64)).webp().toBuffer(), "image/webp"],
    [
      "a WebP declared as JPEG",
      () => sharp(inkOnWhite(64, 64)).webp().toBuffer(),
      "image/jpeg",
    ],
    ["an empty file", async () => Buffer.alloc(0), "image/png"],
    [
      "a file above 2 MiB",
      async () =>
        Buffer.concat([
          Buffer.from("89504e470d0a1a0a", "hex"),
          Buffer.alloc(SIGNOFF_LIMITS.maxUploadBytes),
        ]),
      "image/png",
    ],
    ["an image 10000 x 10 px", () => png(10000, 10), "image/png"],
    ["an image below the minimum side", () => png(31, 200), "image/png"],
    ["an animated PNG", async () => asAnimatedPng(await png()), "image/png"],
    [
      "bytes that are not an image",
      async () => Buffer.from("89504e470d0a1a0a0000", "hex"),
      "image/png",
    ],
    ["a PNG declared as JPEG", () => png(), "image/jpeg"],
    ["a JPEG declared as PNG", () => jpeg(), "image/png"],
    ["a PNG without a declared type", () => png(), ""],
  ];

  it.each(refused)(
    "refuses %s with a 400, not a 500",
    async (_name, make, mime) => {
      const error = await rejection(
        normalizeSignoffImage(await make(), mime || undefined, "stamp"),
      );
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("VALIDATION_ERROR");
      expect(error.message).toContain("stamp");
      expect(error.message).toContain("PNG or JPEG");
    },
  );

  it("names the kind it was asked for in the error", async () => {
    const error = await rejection(
      normalizeSignoffImage(Buffer.alloc(0), "image/png", "signature"),
    );
    expect(error.message).toContain("Validation error for signature");
  });

  it("never stores more than the output budget, even for incompressible noise", async () => {
    const noise = await sharp(randomBytes(700 * 700 * 3), {
      raw: { width: 700, height: 700, channels: 3 },
    })
      .png()
      .toBuffer();
    expect(noise.length).toBeGreaterThan(SIGNOFF_LIMITS.maxOutputBytes);

    const result = await normalizeSignoffImage(noise, "image/png", "stamp");

    expect(result.png.length).toBeLessThanOrEqual(
      SIGNOFF_LIMITS.maxOutputBytes,
    );
  });
});
