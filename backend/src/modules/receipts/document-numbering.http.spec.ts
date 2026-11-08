import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { ApiErrors } from "../../common/errors/ApiError";
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { DocumentNumberingController } from "./document-numbering.controller";
import { DocumentNumberingService } from "./document-numbering.service";

describe("document numbering over HTTP", () => {
  let app: INestApplication;
  const service = { list: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [DocumentNumberingController],
      providers: [{ provide: DocumentNumberingService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { id: "user-1" };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    // The production pipe: it must not turn this route's own refusals into something else.
    const { ValidationPipe } = await import("@nestjs/common");
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useLogger(false);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  const body = { prefix: "РФ-", padding: 6, includeYear: true };

  it("returns the settings of the account", async () => {
    service.list.mockResolvedValue({ types: [] });
    const response = await request(app.getHttpServer())
      .get("/settings/document-numbering")
      .expect(200);
    expect(response.body).toEqual({ types: [] });
    expect(service.list).toHaveBeenCalledWith("user-1");
  });

  it("saves a format for a type", async () => {
    service.update.mockResolvedValue({ documentType: "invoice" });

    await request(app.getHttpServer())
      .put("/settings/document-numbering/invoice")
      .send({ ...body, startNumber: 43 })
      .expect(200);

    expect(service.update).toHaveBeenCalledWith(
      "user-1",
      "invoice",
      expect.objectContaining({ prefix: "РФ-", padding: 6, startNumber: 43 }),
    );
  });

  it.each([
    [{ ...body, prefix: "A1" }, "prefix"],
    [{ ...body, prefix: "A/B" }, "prefix"],
    [{ ...body, padding: 12 }, "padding"],
    [{ ...body, startNumber: 0 }, "startNumber"],
    [{ ...body, startNumber: 3_000_000_000 }, "startNumber"],
  ])(
    "answers 400 VALIDATION_ERROR naming the field for %j",
    async (payload, field) => {
      const response = await request(app.getHttpServer())
        .put("/settings/document-numbering/invoice")
        .send(payload)
        .expect(400);

      expect(response.body.errorCode).toBe("VALIDATION_ERROR");
      expect(response.body.error).toContain(field);
      expect(service.update).not.toHaveBeenCalled();
    },
  );

  it("answers 400 for an unknown document type", async () => {
    const response = await request(app.getHttpServer())
      .put("/settings/document-numbering/receipt")
      .send(body)
      .expect(400);
    expect(response.body.errorCode).toBe("VALIDATION_ERROR");
  });

  it("answers 409 with the lowest allowed start", async () => {
    service.update.mockRejectedValue(ApiErrors.NUMBERING_START_TOO_LOW(44));

    const response = await request(app.getHttpServer())
      .put("/settings/document-numbering/act")
      .send({ ...body, startNumber: 5 })
      .expect(409);

    expect(response.body).toEqual({
      error: expect.stringContaining("44"),
      errorCode: "NUMBERING_START_TOO_LOW",
      minStart: 44,
    });
  });
});
