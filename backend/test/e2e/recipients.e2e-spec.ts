import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import {
  createTestApp,
  closeTestApp,
  registerUser,
  authHeader,
} from "../helpers/test-app";
import { cleanDatabase } from "../helpers/db-cleanup";

describe("Recipients (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let token: string;

  const validRecipient = {
    name: "John Doe",
    email: "john@example.com",
    phone: "+380501234567",
    address: "Kyiv, Main St",
  };

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
    const auth = await registerUser(server, "recip@test.com", "password123");
    token = auth.access_token;
  });

  describe("POST /api/v1/recipients", () => {
    it("should create a recipient", async () => {
      const res = await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient)
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("John Doe");
    });

    it("should return 401 without auth", async () => {
      await request(server)
        .post("/api/v1/recipients")
        .send(validRecipient)
        .expect(401);
    });
  });

  describe("GET /api/v1/recipients", () => {
    it("should list recipients", async () => {
      await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient);

      const res = await request(server)
        .get("/api/v1/recipients")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body.data.length).toBe(1);
    });
  });

  describe("GET /api/v1/recipients/:id", () => {
    it("should get a recipient by id", async () => {
      const created = await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient);

      const res = await request(server)
        .get(`/api/v1/recipients/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.name).toBe("John Doe");
    });
  });

  describe("PATCH /api/v1/recipients/:id", () => {
    it("should update a recipient", async () => {
      const created = await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient);

      const res = await request(server)
        .patch(`/api/v1/recipients/${created.body.id}`)
        .set(authHeader(token))
        .send({ name: "Jane Doe" })
        .expect(200);

      expect(res.body.name).toBe("Jane Doe");
    });
  });

  describe("DELETE /api/v1/recipients/:id", () => {
    it("should delete a recipient", async () => {
      const created = await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient);

      await request(server)
        .delete(`/api/v1/recipients/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);
    });
  });

  describe("Multi-tenancy", () => {
    it("should isolate recipients between users", async () => {
      await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient);

      const userB = await registerUser(server, "userb@test.com", "password123");

      const res = await request(server)
        .get("/api/v1/recipients")
        .set(authHeader(userB.access_token))
        .expect(200);

      expect(res.body.data.length).toBe(0);
    });
  });
});
