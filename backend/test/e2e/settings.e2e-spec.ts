import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import {
  createTestApp,
  closeTestApp,
  registerUser,
  authHeader,
} from "../helpers/test-app";
import { cleanDatabase } from "../helpers/db-cleanup";

describe("Settings (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let token: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    server = ctx.server;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    const auth = await registerUser(server, "settings@test.com", "password123");
    token = auth.access_token;
  });

  describe("Template settings", () => {
    it("GET /api/v1/settings/template should return template", async () => {
      const res = await request(server)
        .get("/api/v1/settings/template")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveProperty("templateId");
    });

    it("POST /api/v1/settings/template should update template", async () => {
      await request(server)
        .post("/api/v1/settings/template")
        .set(authHeader(token))
        .send({ templateId: "standard" })
        .expect(201);

      const res = await request(server)
        .get("/api/v1/settings/template")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.templateId).toBe("standard");
    });
  });

  describe("Receipt title", () => {
    it("should get and set receipt title", async () => {
      await request(server)
        .post("/api/v1/settings/receipt-title")
        .set(authHeader(token))
        .send({ title: "My Receipt" })
        .expect(201);

      const res = await request(server)
        .get("/api/v1/settings/receipt-title")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.title).toBe("My Receipt");
    });
  });

  describe("Template language", () => {
    it("should get and set template language", async () => {
      await request(server)
        .post("/api/v1/settings/template-language")
        .set(authHeader(token))
        .send({ language: "uk" })
        .expect(201);

      const res = await request(server)
        .get("/api/v1/settings/template-language")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.language).toBe("uk");
    });
  });

  describe("Footer settings", () => {
    it("should get and set footer title", async () => {
      await request(server)
        .post("/api/v1/settings/footer-title")
        .set(authHeader(token))
        .send({ footerTitle: "Thank you!" })
        .expect(201);

      const res = await request(server)
        .get("/api/v1/settings/footer-title")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.footerTitle).toBe("Thank you!");
    });

    it("should get and set footer subtitle", async () => {
      await request(server)
        .post("/api/v1/settings/footer-subtitle")
        .set(authHeader(token))
        .send({ footerSubtitle: "Visit again" })
        .expect(201);

      const res = await request(server)
        .get("/api/v1/settings/footer-subtitle")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.footerSubtitle).toBe("Visit again");
    });
  });

  describe("Company info", () => {
    it("should get and set company info", async () => {
      await request(server)
        .post("/api/v1/settings/company-info")
        .set(authHeader(token))
        .send({
          companyName: "Test Corp",
          companyEmail: "info@testcorp.com",
        })
        .expect(201);

      const res = await request(server)
        .get("/api/v1/settings/company-info")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.companyName).toBe("Test Corp");
      expect(res.body.data.companyEmail).toBe("info@testcorp.com");
    });
  });

  describe("Onboarding", () => {
    it("should get onboarding status", async () => {
      const res = await request(server)
        .get("/api/v1/settings/onboarding-status")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("data");
    });

    it("should complete onboarding", async () => {
      await request(server)
        .post("/api/v1/settings/onboarding-complete")
        .set(authHeader(token))
        .expect(201);
    });
  });

  describe("Auth required", () => {
    it("should return 401 without auth", async () => {
      await request(server).get("/api/v1/settings/template").expect(401);
    });
  });
});
