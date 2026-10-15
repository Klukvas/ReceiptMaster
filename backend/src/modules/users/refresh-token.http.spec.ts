import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import * as request from "supertest";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

describe("refresh token HTTP validation", () => {
  let app: INestApplication;
  const service = { refreshToken: jest.fn(), revokeRefreshToken: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());
  it.each([
    null,
    [],
    {},
    { refresh_token: null },
    { refresh_token: "" },
    { refresh_token: 1 },
    { refresh_token: [] },
    { refresh_token: {} },
    { refresh_token: "x".repeat(128) },
  ])("rejects %p before calling any token service", async (body) => {
    for (const endpoint of ["refresh", "logout"]) {
      const response = await request(app.getHttpServer())
        .post(`/auth/${endpoint}`)
        .set("Content-Type", "application/json")
        .send(body === null ? "null" : body);
      expect(response.status).toBe(400);
      expect(response.body.access_token).toBeUndefined();
      expect(response.body.refresh_token).toBeUndefined();
    }
    expect(service.refreshToken).not.toHaveBeenCalled();
    expect(service.revokeRefreshToken).not.toHaveBeenCalled();
  });
  it("accepts the actual randomBytes(64) hexadecimal token format", async () => {
    service.refreshToken.mockResolvedValueOnce({
      access_token: "access",
      refresh_token: "b".repeat(128),
    });
    expect(
      (
        await request(app.getHttpServer())
          .post("/auth/refresh")
          .send({ refresh_token: "a".repeat(128) })
      ).status,
    ).toBe(201);
    expect(service.refreshToken).toHaveBeenCalledWith("a".repeat(128));
  });
});
