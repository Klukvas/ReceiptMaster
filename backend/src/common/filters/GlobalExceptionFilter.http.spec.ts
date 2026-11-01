import { Controller, Get, INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { QueryFailedError } from "typeorm";
import { GlobalExceptionFilter } from "./GlobalExceptionFilter";
import { ApiErrors } from "../errors/ApiError";

const SQL = 'UPDATE "recipients" SET "name" = $1 WHERE "id" = $2';
const DRIVER_MESSAGE =
  'null value in column "name" of relation "recipients" violates not-null constraint';

@Controller("failures")
class FailingController {
  @Get("database")
  database(): never {
    throw new QueryFailedError(SQL, [null, "rec-1"], new Error(DRIVER_MESSAGE));
  }

  @Get("runtime")
  runtime(): never {
    throw new Error("ENOENT: no such file '/srv/app/storage/secret.pem'");
  }

  @Get("deliberate")
  deliberate(): never {
    throw ApiErrors.RECEIPT_PRINT_FAILED("receipt-1");
  }
}

describe("GlobalExceptionFilter over HTTP", () => {
  let app: INestApplication;
  let logError: jest.SpyInstance;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FailingController],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => logError.mockRestore());

  afterAll(async () => app.close());

  it("answers a database error with a generic 500 and logs the SQL detail", async () => {
    const res = await request(app.getHttpServer())
      .get("/failures/database")
      .expect(500);

    expect(res.body).toEqual({
      error: "Internal server error",
      errorCode: "INTERNAL_SERVER_ERROR",
    });
    expect(res.text).not.toMatch(/recipients|not-null|UPDATE/);
    expect(logError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ detail: DRIVER_MESSAGE }),
    );
  });

  it("answers any other unexpected error with the same generic 500", async () => {
    const res = await request(app.getHttpServer())
      .get("/failures/runtime")
      .expect(500);

    expect(res.body).toEqual({
      error: "Internal server error",
      errorCode: "INTERNAL_SERVER_ERROR",
    });
    expect(res.text).not.toContain("secret.pem");
  });

  it("keeps the message of a deliberate ApiErrorResponse", async () => {
    const res = await request(app.getHttpServer())
      .get("/failures/deliberate")
      .expect(500);

    expect(res.body).toEqual({
      error: "Failed to print receipt receipt-1",
      errorCode: "RECEIPT_PRINT_FAILED",
    });
  });
});
