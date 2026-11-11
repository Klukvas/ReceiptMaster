import { Test } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { trustReverseProxy } from "../../config/trusted-proxy";
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";

const REFRESH_LIMIT_PER_MINUTE = 20;

// The real throttler and proxy trust; supertest's loopback peer plays the
// frontend nginx, which appends the client address to X-Forwarded-For.
describe("POST /auth/refresh throttling behind the reverse proxy", () => {
  let app: NestExpressApplication;
  const service = {
    refreshToken: jest.fn().mockResolvedValue({
      access_token: "access",
      refresh_token: "b".repeat(128),
      user: { id: "user-1", email: "user@example.com" },
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    trustReverseProxy(app);
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  const refreshAs = (forwardedFor: string) =>
    request(app.getHttpServer())
      .post("/auth/refresh")
      .set("X-Forwarded-For", forwardedFor)
      .send({ refresh_token: "a".repeat(128) });

  const exhaust = async (client: string) => {
    for (let i = 0; i < REFRESH_LIMIT_PER_MINUTE; i++) {
      expect((await refreshAs(client)).status).toBe(201);
    }
  };

  it("answers a client's 21st refresh within a minute with 429", async () => {
    await exhaust("203.0.113.10");

    const response = await refreshAs("203.0.113.10");

    expect(response.status).toBe(429);
  });

  it("keeps a separate budget for each client behind the proxy", async () => {
    await exhaust("203.0.113.20");

    expect((await refreshAs("203.0.113.21")).status).toBe(201);
  });

  it("ignores addresses the client put into X-Forwarded-For itself", async () => {
    await exhaust("203.0.113.30");

    const spoofed = await refreshAs("198.51.100.99, 203.0.113.30");

    expect(spoofed.status).toBe(429);
  });
});

// The login form reads errorCode RATE_LIMITED and retryAfterSeconds (frontend api-errors.ts).
describe("login and register 429 body", () => {
  let app: NestExpressApplication;
  const service = { login: jest.fn(), register: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it.each(["login", "register"])(
    "answers the 6th %s within a minute with RATE_LIMITED and retryAfterSeconds",
    async (endpoint) => {
      const attempt = () =>
        request(app.getHttpServer()).post(`/auth/${endpoint}`).send({});
      for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(201);

      const response = await attempt();

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        error: expect.stringContaining("Too many requests"),
        errorCode: "RATE_LIMITED",
        retryAfterSeconds: expect.any(Number),
      });
      expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(Number(response.headers["retry-after"])).toBe(
        response.body.retryAfterSeconds,
      );
    },
  );
});
