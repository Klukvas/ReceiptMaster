import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import {
  createTestApp,
  closeTestApp,
  registerUser,
  authHeader,
} from "../helpers/test-app";
import { cleanDatabase } from "../helpers/db-cleanup";

describe("Orders (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let token: string;
  let productId: string;
  let recipientId: string;

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
    const auth = await registerUser(server, "orders@test.com", "password123");
    token = auth.access_token;

    // Create a product
    const prodRes = await request(server)
      .post("/api/v1/products")
      .set(authHeader(token))
      .send({
        name: "Order Product",
        purchase_price_cents: 5000,
        sale_price_cents: 9900,
        quantity: 100,
        currency: "UAH",
      })
      .expect(201);
    productId = prodRes.body.id;

    // Create a recipient
    const recipRes = await request(server)
      .post("/api/v1/recipients")
      .set(authHeader(token))
      .send({ name: "Order Recipient" })
      .expect(201);
    recipientId = recipRes.body.id;
  });

  describe("POST /api/v1/orders", () => {
    it("should create an order", async () => {
      const res = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({
          recipientId,
          items: [{ productId, qty: 2 }],
        })
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("status", "draft");
      expect(res.body).toHaveProperty("total_cents");
    });

    it("should return 401 without auth", async () => {
      await request(server)
        .post("/api/v1/orders")
        .send({
          recipientId,
          items: [{ productId, qty: 1 }],
        })
        .expect(401);
    });

    it("should return 400 for empty items", async () => {
      await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({
          recipientId,
          items: [],
        })
        .expect(400);
    });

    it("should return 404 for invalid recipient", async () => {
      await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({
          recipientId: "00000000-0000-0000-0000-000000000000",
          items: [{ productId, qty: 1 }],
        })
        .expect(404);
    });

    it("should reduce product stock on order creation", async () => {
      await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({
          recipientId,
          items: [{ productId, qty: 5 }],
        })
        .expect(201);

      const productRes = await request(server)
        .get(`/api/v1/products/${productId}`)
        .set(authHeader(token))
        .expect(200);

      expect(productRes.body.quantity).toBe(95);
    });
  });

  describe("Idempotency", () => {
    it("should return same response for duplicate idempotency key", async () => {
      const key = "unique-key-12345";
      const orderData = {
        recipientId,
        items: [{ productId, qty: 1 }],
      };

      const first = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .set("Idempotency-Key", key)
        .send(orderData)
        .expect(201);

      const second = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .set("Idempotency-Key", key)
        .send(orderData);

      expect(second.body.id).toBe(first.body.id);
      expect(second.headers["x-idempotency-replayed"]).toBe("true");
    });
  });

  describe("GET /api/v1/orders", () => {
    it("should return paginated orders", async () => {
      await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 1 }] });

      const res = await request(server)
        .get("/api/v1/orders")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body.data.length).toBe(1);
    });
  });

  describe("GET /api/v1/orders/:id", () => {
    it("should return an order by id", async () => {
      const created = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 1 }] });

      const res = await request(server)
        .get(`/api/v1/orders/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
    });
  });

  describe("PATCH /api/v1/orders/:id/confirm", () => {
    it("should confirm an order", async () => {
      const created = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 1 }] });

      const res = await request(server)
        .patch(`/api/v1/orders/${created.body.id}/confirm`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.status).toBe("confirmed");
    });
  });

  describe("PATCH /api/v1/orders/:id/cancel", () => {
    it("should cancel an order", async () => {
      const created = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 1 }] });

      const res = await request(server)
        .patch(`/api/v1/orders/${created.body.id}/cancel`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.status).toBe("cancelled");
    });
  });

  describe("DELETE /api/v1/orders/:id", () => {
    it("should delete an order", async () => {
      const created = await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 1 }] });

      await request(server)
        .delete(`/api/v1/orders/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);
    });
  });

  describe("Dashboard endpoints", () => {
    beforeEach(async () => {
      await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 2 }] });
    });

    it("GET /api/v1/orders/dashboard/daily-revenue", async () => {
      const res = await request(server)
        .get("/api/v1/orders/dashboard/daily-revenue")
        .set(authHeader(token))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it("GET /api/v1/orders/dashboard/status-summary", async () => {
      const res = await request(server)
        .get("/api/v1/orders/dashboard/status-summary")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("draft");
    });

    it("GET /api/v1/orders/dashboard/total-revenue", async () => {
      const res = await request(server)
        .get("/api/v1/orders/dashboard/total-revenue")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("total_revenue_cents");
    });
  });

  describe("Multi-tenancy", () => {
    it("should isolate orders between users", async () => {
      await request(server)
        .post("/api/v1/orders")
        .set(authHeader(token))
        .send({ recipientId, items: [{ productId, qty: 1 }] });

      const userB = await registerUser(server, "userb@test.com", "password123");

      const res = await request(server)
        .get("/api/v1/orders")
        .set(authHeader(userB.access_token))
        .expect(200);

      expect(res.body.data.length).toBe(0);
    });
  });
});
