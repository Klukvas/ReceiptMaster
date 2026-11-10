import { Test } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DocumentPreviewController } from "./document-preview.controller";
import { DocumentConfigService } from "../settings/services/document-config.service";
import { DocumentRenderService } from "./services/document-render.service";
import { Order } from "../orders/entities/order.entity";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";
import { trustReverseProxy } from "../../config/trusted-proxy";

const PREVIEW_LIMIT_PER_MINUTE = 10;
const RECEIPT_ID = "6f1d2c1e-7a53-4f43-9f3a-2f6a1c9a0b11";

// The real guard stack on the heavy routes: a signed-in user is counted by id, whatever
// address the request comes from.
describe("heavy document routes are limited per user", () => {
  let app: NestExpressApplication;
  const service = {
    generateTestReceipt: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4")),
    regenerateReceiptPdf: jest.fn().mockResolvedValue({ id: RECEIPT_ID }),
    generateReceipt: jest.fn().mockResolvedValue({ id: RECEIPT_ID }),
    generateDocument: jest.fn().mockResolvedValue({ id: RECEIPT_ID }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
      controllers: [ReceiptsController],
      providers: [{ provide: ReceiptsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: req.headers["x-test-user"] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    trustReverseProxy(app);
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  const previewAs = (user: string, address = "203.0.113.1") =>
    request(app.getHttpServer())
      .post("/receipts/test-preview")
      .set("x-test-user", user)
      .set("X-Forwarded-For", address);

  const exhaust = async (user: string) => {
    for (let i = 0; i < PREVIEW_LIMIT_PER_MINUTE; i++) {
      expect((await previewAs(user)).status).toBe(201);
    }
  };

  it("answers the 11th preview within a minute with RATE_LIMITED and Retry-After", async () => {
    await exhaust("user-a");

    const response = await previewAs("user-a");

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      errorCode: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not let one user's requests from a shared address use up another's", async () => {
    await exhaust("user-b");

    expect((await previewAs("user-c")).status).toBe(201);
  });

  it("keeps counting a user who changes address", async () => {
    await exhaust("user-d");

    expect((await previewAs("user-d", "198.51.100.77")).status).toBe(429);
  });

  it("counts every issue route in one budget of 20 a minute, not 20 per route", async () => {
    const as = (user: string, path: string, body: object = {}) =>
      request(app.getHttpServer())
        .post(path)
        .set("x-test-user", user)
        .send(body);
    const regenerate = (user: string) =>
      as(user, `/receipts/${RECEIPT_ID}/regenerate`);
    const receipt = (user: string, kind = "") =>
      as(user, `/receipts/orders/${RECEIPT_ID}/receipt${kind}`);
    const document = (user: string) =>
      as(user, `/receipts/orders/${RECEIPT_ID}/documents`, {
        type: "invoice",
        details: { paymentTermDays: 3 },
      });

    for (let i = 0; i < 8; i++)
      expect((await regenerate("user-e")).status).toBe(201);
    for (let i = 0; i < 4; i++) {
      expect((await receipt("user-e")).status).toBe(201);
      expect((await receipt("user-e", "/compact")).status).toBe(201);
      expect((await receipt("user-e", "/standard")).status).toBe(201);
    }
    // 8 + 12 = 20 issues across four routes; the fifth route is out of budget too.
    expect((await document("user-e")).status).toBe(429);
    const response = await regenerate("user-e");

    expect(response.status).toBe(429);
    expect(response.body.errorCode).toBe("RATE_LIMITED");
    // Another user's budget is untouched.
    expect((await regenerate("user-f")).status).toBe(201);
  });
});

describe("the draft preview route is limited per user", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [DocumentPreviewController],
      providers: [
        { provide: DocumentConfigService, useValue: {} },
        { provide: DocumentRenderService, useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: req.headers["x-test-user"] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  const previewAs = (user: string) =>
    request(app.getHttpServer())
      .post("/receipts/preview")
      .set("x-test-user", user)
      .send({});

  it("answers the 31st draft within a minute with RATE_LIMITED, whatever the draft says", async () => {
    // An empty draft is refused with a 400, but it still counts against the budget.
    for (let i = 0; i < 30; i++)
      expect((await previewAs("user-p")).status).toBe(400);

    const response = await previewAs("user-p");

    expect(response.status).toBe(429);
    expect(response.body.errorCode).toBe("RATE_LIMITED");
    expect((await previewAs("user-q")).status).toBe(400);
  });
});
