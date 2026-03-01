import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp, closeTestApp } from "../helpers/test-app";

describe("Health (e2e)", () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    server = ctx.server;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("GET /api/v1/health", () => {
    it("should return health status with expected fields", async () => {
      const res = await request(server).get("/api/v1/health");

      // 200 if all services healthy, 503 if Redis/S3 unavailable in test env
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("db", "ok");
    });

    it("should not require authentication", async () => {
      const res = await request(server).get("/api/v1/health");
      expect([200, 503]).toContain(res.status);
    });
  });
});
