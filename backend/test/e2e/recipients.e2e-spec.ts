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

  describe("POST /api/v1/recipients with Idempotency-Key", () => {
    const post = (key: string) =>
      request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .set("Idempotency-Key", key)
        .send(validRecipient);

    it("a repeated key creates one recipient and replays the first 201", async () => {
      const first = await post("onboarding-key-1").expect(201);
      const second = await post("onboarding-key-1").expect(201);

      expect(first.headers["x-idempotency-replayed"]).toBeUndefined();
      expect(second.headers["x-idempotency-replayed"]).toBe("true");
      expect(second.body).toEqual(first.body);

      const list = await request(server)
        .get("/api/v1/recipients")
        .set(authHeader(token))
        .expect(200);
      expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([
        first.body.id,
      ]);
    });

    it("rejects an invalid key with 400 and creates nothing", async () => {
      const res = await post("two words").expect(400);
      expect(res.body.errorCode).toBe("VALIDATION_ERROR");
      await post("k".repeat(256)).expect(400);

      const list = await request(server)
        .get("/api/v1/recipients")
        .set(authHeader(token))
        .expect(200);
      expect(list.body.data).toHaveLength(0);
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

    it("rejects a null name with 400 VALIDATION_ERROR and keeps the name", async () => {
      const created = await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient)
        .expect(201);

      const res = await request(server)
        .patch(`/api/v1/recipients/${created.body.id}`)
        .set(authHeader(token))
        .send({ name: null })
        .expect(400);

      expect(res.body).toEqual({
        error: "Validation error for name: name cannot be null",
        errorCode: "VALIDATION_ERROR",
      });
      const current = await request(server)
        .get(`/api/v1/recipients/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);
      expect(current.body.name).toBe(validRecipient.name);
    });

    it("still clears email, phone and address with null", async () => {
      const created = await request(server)
        .post("/api/v1/recipients")
        .set(authHeader(token))
        .send(validRecipient)
        .expect(201);

      const res = await request(server)
        .patch(`/api/v1/recipients/${created.body.id}`)
        .set(authHeader(token))
        .send({ email: null, phone: null, address: null })
        .expect(200);

      expect(res.body).toMatchObject({
        name: validRecipient.name,
        email: null,
        phone: null,
        address: null,
      });
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
