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

  describe("POST /api/v1/products with Idempotency-Key", () => {
    const post = (key: string) =>
      request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .set("Idempotency-Key", key)
        .send(validProduct);

    it("a repeated key creates one product and replays the first 201", async () => {
      const first = await post("onboarding-key-1").expect(201);
      const second = await post("onboarding-key-1").expect(201);

      expect(first.headers["x-idempotency-replayed"]).toBeUndefined();
      expect(second.headers["x-idempotency-replayed"]).toBe("true");
      expect(second.body).toEqual(first.body);

      const list = await request(server)
        .get("/api/v1/products")
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
        .get("/api/v1/products")
        .set(authHeader(token))
        .expect(200);
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe("duplicate live names (IDX_products_user_name)", () => {
    const create = (body = validProduct) =>
      request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(body);
    const listNames = async () =>
      (
        await request(server)
          .get("/api/v1/products")
          .set(authHeader(token))
          .expect(200)
      ).body.data.map((row: { name: string }) => row.name);

    it("a second create with the same name is 409 PRODUCT_ALREADY_EXISTS", async () => {
      await create().expect(201);

      const res = await create().expect(409);

      expect(res.body).toEqual({
        error: `Product with name ${validProduct.name} already exists`,
        errorCode: "PRODUCT_ALREADY_EXISTS",
      });
      expect(await listNames()).toEqual([validProduct.name]);
    });

    it("an Idempotency-Key create with a taken name is 409 and stores nothing to replay", async () => {
      await create().expect(201);
      const post = () =>
        request(server)
          .post("/api/v1/products")
          .set(authHeader(token))
          .set("Idempotency-Key", "duplicate-name-key")
          .send(validProduct);

      const first = await post().expect(409);
      const retry = await post().expect(409);

      expect(first.body.errorCode).toBe("PRODUCT_ALREADY_EXISTS");
      expect(retry.headers["x-idempotency-replayed"]).toBeUndefined();
      expect(await listNames()).toEqual([validProduct.name]);
    });

    it("a soft-deleted product's name can be used again", async () => {
      const original = await create().expect(201);
      await request(server)
        .delete(`/api/v1/products/${original.body.id}`)
        .set(authHeader(token))
        .expect(200);

      await create().expect(201);
    });

    it("renaming onto another live product's name is 409 and changes nothing", async () => {
      await create().expect(201);
      const other = await create({ ...validProduct, name: "Other" }).expect(
        201,
      );

      const res = await request(server)
        .patch(`/api/v1/products/${other.body.id}`)
        .set(authHeader(token))
        .send({ name: validProduct.name })
        .expect(409);

      expect(res.body.errorCode).toBe("PRODUCT_ALREADY_EXISTS");
      expect((await listNames()).sort()).toEqual(
        ["Other", validProduct.name].sort(),
      );
    });

    it("the same name in another tenant is allowed", async () => {
      await create().expect(201);
      const other = await registerUser(server, "other@test.com", "password123");

      await request(server)
        .post("/api/v1/products")
        .set(authHeader(other.access_token))
        .send(validProduct)
        .expect(201);
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
      expect(res.body.quantity).toBe(validProduct.quantity);
    });

    it("rejects a quantity without expectedQuantity and leaves stock alone", async () => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      const res = await request(server)
        .patch(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .send({ name: "Stale form", quantity: 7 })
        .expect(400);

      expect(res.body.errorCode).toBe("VALIDATION_ERROR");
      const current = await request(server)
        .get(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);
      expect(current.body).toMatchObject({
        name: validProduct.name,
        quantity: validProduct.quantity,
      });
    });

    it("applies a quantity only against the expected stock", async () => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);
      const url = `/api/v1/products/${created.body.id}`;

      const conflict = await request(server)
        .patch(url)
        .set(authHeader(token))
        .send({ quantity: 7, expectedQuantity: validProduct.quantity + 1 })
        .expect(409);
      expect(conflict.body).toEqual({
        error: expect.any(String),
        errorCode: "PRODUCT_QUANTITY_CONFLICT",
      });

      const applied = await request(server)
        .patch(url)
        .set(authHeader(token))
        .send({ quantity: 7, expectedQuantity: validProduct.quantity })
        .expect(200);
      expect(applied.body.quantity).toBe(7);
    });
  });

  describe("PATCH /api/v1/products/:id with null", () => {
    it.each([
      [{ name: null }],
      [{ purchase_price_cents: null }],
      [{ sale_price_cents: null }],
      [{ currency: null }],
      [{ quantity: null, expectedQuantity: 10 }],
    ])("rejects %p with 400 and changes nothing", async (body) => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      const res = await request(server)
        .patch(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .send(body)
        .expect(400);

      expect(res.body.errorCode).toBe("VALIDATION_ERROR");
      const current = await request(server)
        .get(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);
      expect(current.body).toMatchObject({
        name: validProduct.name,
        purchase_price_cents: validProduct.purchase_price_cents,
        sale_price_cents: validProduct.sale_price_cents,
        quantity: validProduct.quantity,
      });
    });

    it("still clears supplier_id with null", async () => {
      const created = await request(server)
        .post("/api/v1/products")
        .set(authHeader(token))
        .send(validProduct)
        .expect(201);

      const res = await request(server)
        .patch(`/api/v1/products/${created.body.id}`)
        .set(authHeader(token))
        .send({ supplier_id: null })
        .expect(200);

      expect(res.body.supplier_id).toBeNull();
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
