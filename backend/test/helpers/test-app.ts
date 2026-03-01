import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard } from "@nestjs/throttler";
import * as request from "supertest";
import * as path from "path";
import * as dotenv from "dotenv";
import { AppModule } from "../../src/app.module";

// Load .env.test BEFORE anything else — force-override all values
dotenv.config({
  path: path.resolve(__dirname, "../../.env.test"),
  override: true,
});

export async function createTestApp(): Promise<{
  app: INestApplication;
  server: any;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleFixture.createNestApplication();

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get("API_PREFIX");

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.setGlobalPrefix(apiPrefix, {
    exclude: ["tg/webhook", "tg/order", "paddle/webhook"],
  });

  await app.init();

  const server = app.getHttpServer();
  return { app, server };
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  if (app) {
    await app.close();
  }
}

export async function registerUser(
  server: any,
  email: string,
  password: string,
): Promise<{ access_token: string; refresh_token: string; user: any }> {
  const res = await request(server)
    .post("/api/v1/auth/register")
    .send({ email, password })
    .expect(201);
  return res.body;
}

export async function loginUser(
  server: any,
  email: string,
  password: string,
): Promise<{ access_token: string; refresh_token: string; user: any }> {
  const res = await request(server)
    .post("/api/v1/auth/login")
    .send({ email, password })
    .expect(201);
  return res.body;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
