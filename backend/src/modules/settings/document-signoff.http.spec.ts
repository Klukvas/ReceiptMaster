import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request = require("supertest");
import sharp = require("sharp");
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";
import {
  SIGNOFF_LIMITS,
  SignoffKind,
  normalizeSignoffImage,
} from "../../common/services/signoff-image";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { DocumentSignoffController } from "./document-signoff.controller";
import { DocumentSignoffService } from "./services/document-signoff.service";

const png = (width = 300, height = 120) =>
  sharp({
    create: { width, height, channels: 3, background: "#1030c0" },
  })
    .png()
    .toBuffer();

describe("signature and stamp over HTTP", () => {
  let app: INestApplication;
  let stored: Partial<Record<SignoffKind, Buffer>>;

  /** Same validation as the real service, with the storage swapped for a map. */
  const fakeService = {
    get: async () => ({ signature: null, stamp: null }),
    image: async (_userId: string, kind: SignoffKind) => {
      if (!stored[kind])
        throw new (await import("@nestjs/common")).NotFoundException();
      return stored[kind];
    },
    replace: async (
      _userId: string,
      kind: SignoffKind,
      file: Express.Multer.File,
    ) => {
      const {
        png: normalized,
        width,
        height,
      } = await normalizeSignoffImage(file.buffer, file.mimetype, kind);
      stored[kind] = normalized;
      return {
        assetId: "11111111-1111-4111-8111-111111111111",
        width,
        height,
        bytes: normalized.length,
        updatedAt: new Date(0).toISOString(),
      };
    },
    remove: jest.fn(async (_userId: string, kind: SignoffKind) => {
      delete stored[kind];
    }),
  };

  beforeEach(async () => {
    stored = {};
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [DocumentSignoffController],
      providers: [{ provide: DocumentSignoffService, useValue: fakeService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { id: "fixture" };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useLogger(false);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  const put = (kind: string, file: Buffer, type = "image/png") =>
    request(app.getHttpServer())
      .put(`/settings/signoff/${kind}`)
      .attach("file", file, { filename: "scan.png", contentType: type });

  it("stores a PNG and describes it", async () => {
    const response = await put("signature", await png()).expect(200);

    expect(response.body).toEqual({
      assetId: "11111111-1111-4111-8111-111111111111",
      width: 300,
      height: 120,
      bytes: expect.any(Number),
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("limits uploads to 10 a minute per user with RATE_LIMITED", async () => {
    const file = await png();
    for (let i = 0; i < 10; i++) await put("signature", file).expect(200);

    const response = await put("signature", file).expect(429);

    expect(response.body).toMatchObject({
      errorCode: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("serves the stored image as a private, non-sniffable PNG", async () => {
    await put("stamp", await png(400, 400)).expect(200);

    const response = await request(app.getHttpServer())
      .get("/settings/signoff/stamp/image")
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect((response.body as Buffer).subarray(0, 4).toString("hex")).toBe(
      "89504e47",
    );
  });

  it("answers 404 for an image that is not set", async () => {
    await request(app.getHttpServer())
      .get("/settings/signoff/signature/image")
      .expect(404);
  });

  it("deletes with 204, again and again", async () => {
    await put("signature", await png()).expect(200);
    await request(app.getHttpServer())
      .delete("/settings/signoff/signature")
      .expect(204);
    await request(app.getHttpServer())
      .delete("/settings/signoff/signature")
      .expect(204);
    expect(fakeService.remove).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an SVG sent as image/png", () => Buffer.from("<svg/>"), "image/png"],
    [
      "a GIF",
      () => Buffer.from("GIF89a\0\0\0\0\0\0\0;", "latin1"),
      "image/gif",
    ],
    ["a PNG declared as JPEG", () => png(), "image/jpeg"],
  ])("answers 400 VALIDATION_ERROR for %s", async (_name, make, type) => {
    const response = await put("stamp", await make(), type).expect(400);
    expect(response.body).toMatchObject({ errorCode: "VALIDATION_ERROR" });
    expect(response.body.error).toContain("stamp");
  });

  it("answers 400 when no file is sent", async () => {
    const response = await request(app.getHttpServer())
      .put("/settings/signoff/signature")
      .field("note", "x")
      .expect((res) => {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });
    expect(response.body).toHaveProperty("errorCode");
  });

  it("answers 413 for a file above 2 MiB before decoding it", async () => {
    const tooBig = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.alloc(SIGNOFF_LIMITS.maxUploadBytes + 1),
    ]);
    await put("signature", tooBig).expect(413);
  });

  it("answers 400 for a kind that does not exist", async () => {
    await put("seal", await png()).expect(400);
    await request(app.getHttpServer())
      .get("/settings/signoff/seal/image")
      .expect(400);
    await request(app.getHttpServer())
      .delete("/settings/signoff/seal")
      .expect(400);
  });

  it("allows ten uploads a minute and then answers 429", async () => {
    const throttled = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [DocumentSignoffController],
      providers: [{ provide: DocumentSignoffService, useValue: fakeService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { id: "fixture" };
          return true;
        },
      })
      .compile();
    const limited = throttled.createNestApplication();
    limited.useGlobalFilters(new GlobalExceptionFilter());
    limited.useLogger(false);
    await limited.init();
    try {
      const body = await png(64, 64);
      const send = () =>
        request(limited.getHttpServer())
          .put("/settings/signoff/stamp")
          .attach("file", body, {
            filename: "s.png",
            contentType: "image/png",
          });
      for (let i = 0; i < 10; i++) await send().expect(200);
      await send().expect(429);
    } finally {
      await limited.close();
    }
  });
});
