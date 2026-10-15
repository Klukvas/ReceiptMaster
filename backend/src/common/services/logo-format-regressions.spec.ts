import sharp = require("sharp");
import { ConfigService } from "@nestjs/config";
import { LogoStorageService } from "./logo-storage.service";

// Real decoders, in-memory storage only; no network or S3 client calls.
describe("logo format contract", () => {
  let service: LogoStorageService;
  beforeEach(() => {
    service = new LogoStorageService(
      new ConfigService({
        LOGOS_BUCKET: "fixture",
        S3_ENDPOINT: "http://unused.invalid",
      }),
    );
  });
  it.each(["png", "jpeg", "gif", "svg"] as const)(
    "normalizes %s to a real PNG",
    async (format) => {
      const source =
        format === "svg"
          ? Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>',
            )
          : await sharp({
              create: {
                width: 20,
                height: 10,
                channels: 4,
                background: "#ff0000",
              },
            })
              .toFormat(format)
              .toBuffer();
      const mime = {
        png: "image/png",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
      }[format];
      const output = await service.normalizeLogo(source, mime);
      expect(await sharp(output).metadata()).toMatchObject({
        format: "png",
        width: 20,
        height: 10,
      });
      const upload = jest
        .spyOn(
          service as unknown as {
            uploadFile: (
              bucket: string,
              key: string,
              file: Buffer,
              mime: string,
            ) => Promise<string>;
          },
          "uploadFile",
        )
        .mockResolvedValue("mock://logo");
      await service.uploadLogo(source, "user", mime);
      const args = upload.mock.calls[0];
      expect(args.slice(0, 2)).toEqual(["fixture", "logos/logo-user.png"]);
      expect(args[3]).toBe("image/png");
      expect((await sharp(args[2]).metadata()).format).toBe("png");
    },
  );
  it.each([
    "<script>alert(1)</script>",
    '<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>',
    '<image href="https://example.com/a.png"/>',
    "<foreignObject><p>active</p></foreignObject>",
    '<rect onmouseover="alert(1)" width="20" height="10"/>',
    '<use href="file:///etc/passwd"/>',
    '<style>@import "https://example.com/x.css";</style>',
    '<rect width="20" height="10" fill="url(https://example.com/x.svg)"/>',
  ])("rejects active SVG with real SVG MIME: %s", async (markup) => {
    const source = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">${markup}</svg>`,
    );
    await expect(
      service.normalizeLogo(source, "image/svg+xml"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([
    '<!DOCTYPE svg [<!ENTITY data SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">&data;</svg>',
    "<svg><broken>",
    "not an image",
  ])("rejects malformed SVG %s", async (value) => {
    await expect(
      service.normalizeLogo(Buffer.from(value), "image/svg+xml"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("accepts local SVG defs/use and does not treat raster metadata as markup", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><defs><rect id="mark" width="20" height="10" fill="red"/></defs><use href="#mark"/></svg>',
    );
    expect(
      (
        await sharp(
          await service.normalizeLogo(svg, "image/svg+xml"),
        ).metadata()
      ).format,
    ).toBe("png");
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "blue" },
    })
      .withMetadata({
        exif: {
          IFD0: {
            ImageDescription:
              '<script>href="external" url(https://example.com)</script>',
          },
        },
      })
      .png()
      .toBuffer();
    expect(
      (await sharp(await service.normalizeLogo(png, "image/png")).metadata())
        .format,
    ).toBe("png");
  });
  it("rejects mismatched MIME and excessive dimensions before writing", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(
      service.normalizeLogo(png, "image/jpeg"),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.normalizeLogo(
        Buffer.from(
          '<svg width="5000" height="10" xmlns="http://www.w3.org/2000/svg"/>',
        ),
        "image/svg+xml",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("normalizes a legacy JPEG read at the fixed .png key without writing storage", async () => {
    const jpg = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "blue" },
    })
      .jpeg()
      .toBuffer();
    jest
      .spyOn(
        service as unknown as {
          downloadFile: (bucket: string, key: string) => Promise<Buffer>;
        },
        "downloadFile",
      )
      .mockResolvedValue(jpg);
    const upload = jest.spyOn(
      service as unknown as { uploadFile: () => Promise<string> },
      "uploadFile",
    );
    expect(
      (await sharp(await service.downloadLogo("user")).metadata()).format,
    ).toBe("png");
    expect(upload).not.toHaveBeenCalled();
  });
  it("keeps high entropy JPEG normalization within the upload/read PNG budget", async () => {
    let seed = 123456;
    const pixels = Buffer.alloc(2048 * 2048 * 3);
    for (let index = 0; index < pixels.length; index++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels[index] = seed & 255;
    }
    const jpeg = await sharp(pixels, {
      raw: { width: 2048, height: 2048, channels: 3 },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    expect(jpeg.length).toBeLessThan(5 * 1024 * 1024);
    let stored: Buffer | undefined;
    jest
      .spyOn(service, "uploadFile")
      .mockImplementation(async (_bucket, _key, output) => {
        stored = output;
        return "mock://logo";
      });
    jest.spyOn(service, "downloadFile").mockImplementation(async () => {
      if (!stored) throw new Error("No stored image");
      return stored;
    });
    await service.uploadLogo(jpeg, "fixture", "image/jpeg");
    expect(stored?.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    const downloaded = await service.downloadLogo("fixture");
    expect((await sharp(downloaded).metadata()).format).toBe("png");
  });
});
