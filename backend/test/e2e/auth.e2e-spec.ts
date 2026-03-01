import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import {
  createTestApp,
  closeTestApp,
  registerUser,
  loginUser,
  authHeader,
} from "../helpers/test-app";
import { cleanDatabase } from "../helpers/db-cleanup";

describe("Auth (e2e)", () => {
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

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new user", async () => {
      const res = await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "password123" })
        .expect(201);

      expect(res.body).toHaveProperty("access_token");
      expect(res.body).toHaveProperty("refresh_token");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe("test@example.com");
      expect(res.body.user).not.toHaveProperty("password");
    });

    it("should return 409 for duplicate email", async () => {
      await registerUser(server, "dup@example.com", "password123");

      await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "dup@example.com", password: "password123" })
        .expect(409);
    });

    it("should return 400 for invalid email", async () => {
      await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "not-an-email", password: "password123" })
        .expect(400);
    });

    it("should return 400 for short password", async () => {
      await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "short@example.com", password: "12345" })
        .expect(400);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await registerUser(server, "login@example.com", "password123");
    });

    it("should login with correct credentials", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "login@example.com", password: "password123" })
        .expect(201);

      expect(res.body).toHaveProperty("access_token");
      expect(res.body).toHaveProperty("refresh_token");
    });

    it("should return 401 for wrong password", async () => {
      await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "login@example.com", password: "wrongpassword" })
        .expect(401);
    });

    it("should return 401 for non-existent user", async () => {
      await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "password123" })
        .expect(401);
    });
  });

  describe("GET /api/v1/auth/profile", () => {
    it("should return profile for authenticated user", async () => {
      const auth = await registerUser(
        server,
        "profile@example.com",
        "password123",
      );

      const res = await request(server)
        .get("/api/v1/auth/profile")
        .set(authHeader(auth.access_token))
        .expect(200);

      expect(res.body.email).toBe("profile@example.com");
      expect(res.body).not.toHaveProperty("password");
    });

    it("should return 401 without token", async () => {
      await request(server).get("/api/v1/auth/profile").expect(401);
    });
  });

  describe("PATCH /api/v1/auth/profile", () => {
    it("should update user profile", async () => {
      const auth = await registerUser(
        server,
        "update@example.com",
        "password123",
      );

      const res = await request(server)
        .patch("/api/v1/auth/profile")
        .set(authHeader(auth.access_token))
        .send({ email: "updated@example.com" })
        .expect(200);

      expect(res.body.email).toBe("updated@example.com");
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("should change password and allow login with new password", async () => {
      const auth = await registerUser(
        server,
        "chpwd@example.com",
        "oldpass123",
      );

      await request(server)
        .post("/api/v1/auth/change-password")
        .set(authHeader(auth.access_token))
        .send({
          currentPassword: "oldpass123",
          newPassword: "newpass123",
          confirmPassword: "newpass123",
        })
        .expect(201);

      // Login with new password should work
      await loginUser(server, "chpwd@example.com", "newpass123");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should return new tokens with valid refresh token", async () => {
      const auth = await registerUser(
        server,
        "refresh@example.com",
        "password123",
      );

      const res = await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refresh_token: auth.refresh_token })
        .expect(201);

      expect(res.body).toHaveProperty("access_token");
      expect(res.body).toHaveProperty("refresh_token");
    });

    it("should return 401 for invalid refresh token", async () => {
      await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refresh_token: "invalid-token" })
        .expect(401);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should revoke refresh token on logout", async () => {
      const auth = await registerUser(
        server,
        "logout@example.com",
        "password123",
      );

      await request(server)
        .post("/api/v1/auth/logout")
        .set(authHeader(auth.access_token))
        .send({ refresh_token: auth.refresh_token })
        .expect(201);

      // Refresh with revoked token should fail
      await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refresh_token: auth.refresh_token })
        .expect(401);
    });
  });
});
