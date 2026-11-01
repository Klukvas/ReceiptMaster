import "reflect-metadata";
import { randomUUID } from "crypto";
import { QueryRunner } from "typeorm";
import { UsersService } from "../src/modules/users/users.service";
import { User } from "../src/modules/users/entities/user.entity";
import { hashRefreshToken } from "../src/modules/users/refresh-tokens";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import {
  RestrictedAppDatabase,
  openRestrictedAppDatabase,
} from "./helpers/restricted-app-database";
import {
  DAY_MS,
  UNAUTHORIZED,
  issueToken,
  liveTokenHashes,
  tokenRow,
  tokensOf,
  usersServiceOn,
} from "./helpers/refresh-token-fixtures";

describeIsolatedPostgres(
  "refresh-token rotation on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let users: UsersService;
    let user: User;

    beforeAll(async () => {
      db = await openRestrictedAppDatabase(connection, "audit_refresh");
      users = usersServiceOn(db);
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

    const issue = (expiresInMs = DAY_MS) =>
      issueToken(db, user.id, { expiresInMs });
    const activeTokens = () => liveTokenHashes(db, user.id);
    const storedHashes = async () =>
      (await tokensOf(db, user.id)).map((row) => row.token_hash);
    const revoked = async (token: string) =>
      (await tokenRow(db, token)).revoked;

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
      expect(await activeTokens()).toEqual([
        hashRefreshToken(response.refresh_token),
      ]);
      await expect(users.refreshToken(original)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
    });

    it("stores the successor as a hash only, in the redeemed token's family", async () => {
      const original = await issue();

      const { refresh_token } = await users.refreshToken(original);

      const [redeemed, successor] = await Promise.all([
        tokenRow(db, original),
        tokenRow(db, refresh_token),
      ]);
      expect(successor.token).toBeNull();
      expect(successor.token_hash).toBe(hashRefreshToken(refresh_token));
      expect(successor.family_id).toBe(redeemed.family_id);
      expect(redeemed.redeemed_at).toBeInstanceOf(Date);
      const plaintextHits = await db.admin.query(
        "SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE token = $1 OR token = $2",
        [original, refresh_token],
      );
      expect(plaintextHits[0].n).toBe(0);
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
          "SELECT id FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE",
          [hashRefreshToken(original)],
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
      expect(await activeTokens()).toEqual([
        hashRefreshToken(fulfilled[0].value.refresh_token),
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
        expect(await storedHashes()).toEqual([hashRefreshToken(original)]);

        const retried = await users.refreshToken(original);
        expect(await revoked(original)).toBe(true);
        expect(await activeTokens()).toEqual([
          hashRefreshToken(retried.refresh_token),
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
      expect(await storedHashes()).toEqual([hashRefreshToken(expired)]);
    });
  },
);
