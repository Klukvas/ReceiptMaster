import "reflect-metadata";
import { randomBytes, randomUUID } from "crypto";
import { QueryRunner } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../src/modules/users/users.service";
import { User } from "../src/modules/users/entities/user.entity";
import { RefreshToken } from "../src/modules/users/entities/refresh-token.entity";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import {
  RestrictedAppDatabase,
  openRestrictedAppDatabase,
} from "./helpers/restricted-app-database";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNAUTHORIZED = {
  statusCode: 401,
  error: "Unauthorized access",
  errorCode: "UNAUTHORIZED",
};

// Refresh runs before authentication, so it has no tenant context; the service is
// still wired to the restricted role through the production query-context wrapper.
describeIsolatedPostgres(
  "refresh-token rotation on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let users: UsersService;
    let user: User;

    beforeAll(async () => {
      db = await openRestrictedAppDatabase(connection, "audit_refresh");
      users = new UsersService(
        db.app.getRepository(User),
        db.app.getRepository(RefreshToken),
        new JwtService({ secret: randomBytes(32).toString("hex") }),
        {} as ConfigService,
      );
    }, 30000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@refresh.invalid`,
        password: "fixture",
      });
    });

    const issue = async (expiresInMs = DAY_MS): Promise<string> => {
      const token = randomBytes(64).toString("hex");
      await db.admin.getRepository(RefreshToken).insert({
        token,
        user_id: user.id,
        expires_at: new Date(Date.now() + expiresInMs),
      });
      return token;
    };

    const tokensOf = () =>
      db.admin
        .getRepository(RefreshToken)
        .find({ where: { user_id: user.id }, order: { created_at: "ASC" } });

    const activeTokens = async () =>
      (await tokensOf()).filter(
        (row) => !row.revoked && row.expires_at > new Date(),
      );

    const revoked = async (token: string) =>
      (
        await db.admin
          .getRepository(RefreshToken)
          .findOneByOrFail({ token, user_id: user.id })
      ).revoked;

    it("rotates into the unchanged response format and stays single-use", async () => {
      const original = await issue();

      const response = await users.refreshToken(original);

      expect(Object.keys(response).sort()).toEqual([
        "access_token",
        "refresh_token",
        "user",
      ]);
      expect(response.user).toEqual({ id: user.id, email: user.email });
      expect(response.refresh_token).toMatch(/^[a-f0-9]{128}$/);
      expect(await revoked(original)).toBe(true);
      expect((await activeTokens()).map((row) => row.token)).toEqual([
        response.refresh_token,
      ]);
      await expect(users.refreshToken(original)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
    });

    it("one old token never produces two successful successors", async () => {
      const original = await issue();
      // Park both refreshes on the token row so they overlap deterministically.
      const blocker: QueryRunner = db.admin.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      let results: PromiseSettledResult<{ refresh_token: string }>[];
      try {
        await blocker.query(
          "SELECT id FROM refresh_tokens WHERE token = $1 FOR UPDATE",
          [original],
        );
        const pending = Promise.allSettled([
          users.refreshToken(original),
          users.refreshToken(original),
        ]);
        expect(await db.waitForLockWaiters(2)).toBeGreaterThanOrEqual(2);
        await blocker.rollbackTransaction();
        results = await pending;
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
      }

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<{ refresh_token: string }> =>
          r.status === "fulfilled",
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject(UNAUTHORIZED);
      expect(await revoked(original)).toBe(true);
      expect((await activeTokens()).map((row) => row.token)).toEqual([
        fulfilled[0].value.refresh_token,
      ]);
    });

    it("a failed successor insert rolls the rotation back", async () => {
      const original = await issue();
      const name = `fail_successor_${randomUUID().replace(/-/g, "")}`;
      // A sequence is not transactional, so the trigger fails exactly once.
      await db.admin.query(`CREATE SEQUENCE "${name}"`);
      await db.admin.query(
        `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql
         SECURITY DEFINER SET search_path = public AS $$
         BEGIN
           IF nextval('"${name}"') = 1 THEN
             RAISE EXCEPTION 'forced successor insert failure';
           END IF;
           RETURN NEW;
         END $$`,
      );
      await db.admin.query(
        `CREATE TRIGGER "${name}" BEFORE INSERT ON refresh_tokens
         FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
      );
      try {
        await expect(users.refreshToken(original)).rejects.toThrow(
          /forced successor insert failure/,
        );
        expect(await revoked(original)).toBe(false);
        expect((await tokensOf()).map((row) => row.token)).toEqual([original]);

        const retried = await users.refreshToken(original);
        expect(await revoked(original)).toBe(true);
        expect((await activeTokens()).map((row) => row.token)).toEqual([
          retried.refresh_token,
        ]);
      } finally {
        await db.admin.query(`DROP TRIGGER "${name}" ON refresh_tokens`);
        await db.admin.query(`DROP FUNCTION "${name}"()`);
        await db.admin.query(`DROP SEQUENCE "${name}"`);
      }
    });

    it("an expired token is rejected and stays unrevoked", async () => {
      const expired = await issue(-60_000);

      await expect(users.refreshToken(expired)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
      expect(await revoked(expired)).toBe(false);
      expect((await tokensOf()).map((row) => row.token)).toEqual([expired]);
    });
  },
);
