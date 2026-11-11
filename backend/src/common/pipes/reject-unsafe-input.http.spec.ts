import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  Post,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IsOptional, IsString } from "class-validator";
import * as request from "supertest";
import { GlobalExceptionFilter } from "../filters/GlobalExceptionFilter";
import {
  MAX_INPUT_DEPTH,
  RejectUnsafeInputPipe,
} from "./reject-unsafe-input.pipe";

class NoteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  nested?: unknown;
}

class SearchDto {
  @IsOptional()
  @IsString()
  search?: string;
}

@Controller("inputs")
class InputsController {
  @Post()
  create(@Body() body: NoteDto) {
    return { name: body.name ?? null };
  }

  @Get()
  list(@Query() query: SearchDto) {
    return { search: query.search ?? null };
  }
}

const nestedJson = (levels: number) =>
  `{"name":"x","nested":${"[".repeat(levels)}${"]".repeat(levels)}}`;

describe("unsafe input over HTTP", () => {
  let app: INestApplication;
  let logError: jest.SpyInstance;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InputsController],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new RejectUnsafeInputPipe(),
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => logError.mockRestore());

  afterAll(async () => app.close());

  it("rejects a NUL character in a body string with 400 VALIDATION_ERROR", async () => {
    const res = await request(app.getHttpServer())
      .post("/inputs")
      .send({ name: "a\u0000b" })
      .expect(400);

    expect(res.body).toEqual({
      error: "Validation error for name: must not contain the NUL character",
      errorCode: "VALIDATION_ERROR",
    });
  });

  it("rejects a NUL character in a query parameter", async () => {
    const res = await request(app.getHttpServer())
      .get("/inputs?search=a%00b")
      .expect(400);

    expect(res.body.errorCode).toBe("VALIDATION_ERROR");
    expect(res.body.error).toContain("search");
  });

  it("rejects JSON nested 3000 levels deep with 400 instead of a stack overflow", async () => {
    const res = await request(app.getHttpServer())
      .post("/inputs")
      .set("Content-Type", "application/json")
      .send(nestedJson(3000))
      .expect(400);

    expect(res.body.errorCode).toBe("VALIDATION_ERROR");
  });

  it("accepts nesting below the limit", async () => {
    await request(app.getHttpServer())
      .post("/inputs")
      .set("Content-Type", "application/json")
      .send(nestedJson(MAX_INPUT_DEPTH - 2))
      .expect(201, { name: "x" });
  });

  it("answers a JSON body above the size limit with 413 PAYLOAD_TOO_LARGE", async () => {
    const res = await request(app.getHttpServer())
      .post("/inputs")
      .send({ name: "x".repeat(200 * 1024) })
      .expect(413);

    expect(res.body).toEqual({
      error: "Request body is too large",
      errorCode: "PAYLOAD_TOO_LARGE",
    });
  });

  it("still answers malformed JSON with 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/inputs")
      .set("Content-Type", "application/json")
      .send('{"name":')
      .expect(400);

    expect(res.body.errorCode).toBe("HTTP_EXCEPTION");
  });
});
