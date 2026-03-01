import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import {
  createTestApp,
  closeTestApp,
  registerUser,
  authHeader,
} from "../helpers/test-app";
import { cleanDatabase } from "../helpers/db-cleanup";

describe("Products (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let token: string;

  const validProduct = {
    name: "Test Product",
    purchase_price_cents: 5000,
    sale_price_cents: 9900,
    quantity: 50,
    currency: "UAH",
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
    const auth = await registerUser(server, "products@test.com", "password123");
    token = auth.access_token;
  });

  describe("POST /api/v1/products", () => {
    it("should create a product", async () => {
      const res = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("Test Product");
      expect(res.body.sale_price_cents).toBe(9900);
    });

    it("should return 401 without auth", async () => {
      await request(server)
        .post("/api/v1/products")
        .send(validProduct)
        .expect(401);
    });

    it("should return 400 for invalid data", async () => {
      await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ name: "Missing fields" })
        .expect(400);
    });
  });

  describe("GET /api/v1/products", () => {
    it("should return paginated products", async () => {
      // Create 3 products
      for (let i = 1; i <= 3; i++) {
        await request(server)
          .post("/api/v1/products")
          .set(authHeader(token))
          .send({ ...validProduct, name: `Product ${i}` })
          .expect(201);
      }

      const res = await request(server)
        .get("/api/v1/products")
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body.data.length).toBe(3);
    });

    it("should support search and pagination", async () => {
      await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "Apple iPhone" });
      await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "Samsung Galaxy" });

      const res = await request(server)
        .get("/api/v1/products?search=Apple&page=1&limit=10")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe("Apple iPhone");
    });
  });

  describe("GET /api/v1/products/:id", () => {
    it("should return a product by id", async () => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
    });

    it("should return 404 for non-existent product", async () => {
      await request(server)
        .get("/api/v1/products/00000000-0000-0000-0000-000000000000")
        .set(authHeader(token))
        .expect(404);
    });
  });

  describe("PATCH /api/v1/products/:id", () => {
    it("should update a product", async () => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      const res = await request(server)
        .patch(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .send({ name: "Updated Product" })
        .expect(200);

      expect(res.body.name).toBe("Updated Product");
    });
  });

  describe("DELETE /api/v1/products/:id", () => {
    it("should delete a product", async () => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      await request(server)
        .delete(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      await request(server)
        .get(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .expect(404);
    });
  });

  describe("DELETE /api/v1/products/bulk", () => {
    it("should bulk delete products", async () => {
      const p1 = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "Bulk 1" });
      const p2 = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "Bulk 2" });

      await request(server)
        .delete("/api/v1/products/bulk")
        .set(authHeader(token))
        .send({ ids: [p1.body.id, p2.body.id] })
        .expect(200);
    });
  });

  describe("GET /api/v1/products/low-stock", () => {
    it("should return low stock products", async () => {
      await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "Low Stock", quantity: 3 });
      await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "High Stock", quantity: 100 });

      const res = await request(server)
        .get("/api/v1/products/low-stock?threshold=10")
        .set(authHeader(token))
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe("Low Stock");
    });
  });

  describe("Multi-tenancy", () => {
    it("should isolate products between users", async () => {
      // User A creates a product
      await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send({ ...validProduct, name: "User A Product" })
        .expect(201);

      // Register User B
      const userB = await registerUser(server, "userb@test.com", "password123");

      // User B should not see User A's products
      const res = await request(server)
        .get("/api/v1/products")
        .set(authHeader(userB.access_token))
        .expect(200);

      expect(res.body.data.length).toBe(0);
    });
  });
});
