import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import {
  createTestApp,
  closeTestApp,
  registerUser,
  authHeader,
} from "../helpers/test-app";
import { cleanDatabase } from "../helpers/db-cleanup";

describe("Suppliers (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let token: string;

  const validSupplier = {
    name: "Test Supplier",
    email: "supplier@example.com",
    phone: "+380501234567",
    address: "Kyiv, Ukraine",
    contactPerson: "Ivan",
    notes: "Main supplier",
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
    const auth = await registerUser(server, "suppliers@test.com", "password123");
    token = auth.access_token;
  });

  describe("POST /api/v1/suppliers", () => {
    it("should create a supplier", async () => {
      const res = await request(server)
        .post("/api/v1/suppliers")
        .set(authHeader(token))
        .send(validSupplier)
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("Test Supplier");
    });
  });

  describe("GET /api/v1/suppliers", () => {
    it("should list suppliers", async () => {
      await request(server)
        .post("/api/v1/suppliers")
        .set(authHeader(token))
        .send(validSupplier);

      const res = await request(server)
        .get("/api/v1/suppliers")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body.data.length).toBe(1);
    });
  });

  describe("GET /api/v1/suppliers/:id", () => {
    it("should get a supplier by id", async () => {
      const created = await request(server)
        .post("/api/v1/suppliers")
        .set(authHeader(token))
        .send(validSupplier);

      const res = await request(server)
        .get(`/api/v1/suppliers/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.name).toBe("Test Supplier");
    });
  });

  describe("PATCH /api/v1/suppliers/:id", () => {
    it("should update a supplier", async () => {
      const created = await request(server)
        .post("/api/v1/suppliers")
        .set(authHeader(token))
        .send(validSupplier);

      const res = await request(server)
        .patch(`/api/v1/suppliers/${created.body.id}`)
        .set(authHeader(token))
        .send({ name: "Updated Supplier" })
        .expect(200);

      expect(res.body.name).toBe("Updated Supplier");
    });
  });

  describe("DELETE /api/v1/suppliers/:id", () => {
    it("should delete a supplier", async () => {
      const created = await request(server)
        .post("/api/v1/suppliers")
        .set(authHeader(token))
        .send(validSupplier);

      await request(server)
        .delete(`/api/v1/suppliers/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);
    });
  });

  describe("Multi-tenancy", () => {
    it("should isolate suppliers between users", async () => {
      await request(server)
        .post("/api/v1/suppliers")
        .set(authHeader(token))
        .send(validSupplier);

      const userB = await registerUser(server, "userb@test.com", "password123");

      const res = await request(server)
        .get("/api/v1/suppliers")
        .set(authHeader(userB.access_token))
        .expect(200);

      expect(res.body.data.length).toBe(0);
    });
  });
});
