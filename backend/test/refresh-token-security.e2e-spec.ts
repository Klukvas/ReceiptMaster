import "reflect-metadata";
import { randomInt, randomUUID } from "crypto";
import { Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import * as bcrypt from "bcrypt";
import { UsersService } from "../src/modules/users/users.service";
import { User } from "../src/modules/users/entities/user.entity";
import {
  REPLAY_GRACE_MS,
  hashRefreshToken,
} from "../src/modules/users/refresh-tokens";
import {
  AUDIT_CLUSTER,
  describeIsolatedPostgres,
} from "./helpers/isolated-postgres";
import {
  RestrictedAppDatabase,
  openRestrictedAppDatabase,
} from "./helpers/restricted-app-database";
import {
  UNAUTHORIZED,
  issueLegacyToken,
  issueToken,
  liveTokenHashes,
  tokenRow,
  usersServiceOn,
} from "./helpers/refresh-token-fixtures";

const CURRENT_PASSWORD = "Current-password-1";

describeIsolatedPostgres(
  "refresh-token reuse, revocation and account checks on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    let db: RestrictedAppDatabase;
    let users: UsersService;
    let user: User;

    beforeAll(async () => {
      db = await openRestrictedAppDatabase(connection, "audit_refresh_sec");
      users = usersServiceOn(db);
    }, 30000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      user = await db.admin.getRepository(User).save({
        email: `${randomUUID()}@refresh.invalid`,
        password: await bcrypt.hash(CURRENT_PASSWORD, 4),
      });
    });

    afterEach(() => jest.restoreAllMocks());

    const live = () => liveTokenHashes(db, user.id);

    /** Moves a redemption back in time, past the replay grace window. */
    const ageRedemption = (token: string) =>
      db.admin.query(
        `UPDATE refresh_tokens SET redeemed_at = redeemed_at - make_interval(secs => $2)
         WHERE token_hash = $1 OR token = $3`,
        [hashRefreshToken(token), REPLAY_GRACE_MS / 1000 + 1, token],
      );

    const changePassword = () =>
      users.changePassword(user.id, {
        currentPassword: CURRENT_PASSWORD,
        newPassword: "Next-password-2",
        confirmPassword: "Next-password-2",
      });

    /**
     * Holds every refresh_tokens insert — a rotation after inserting its
     * successor, before it commits — until `release()`.
     */
    const parkSuccessorInserts = async () => {
      const lockKey = randomInt(1, 2 ** 31 - 1);
      const name = `park_successor_${randomUUID().replace(/-/g, "")}`;
      await db.admin.query(
        `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql
         SECURITY DEFINER SET search_path = public AS $$
         BEGIN
           PERFORM pg_advisory_xact_lock(${lockKey});
           RETURN NEW;
         END $$`,
      );
      await db.admin.query(
        `CREATE TRIGGER "${name}" AFTER INSERT ON refresh_tokens
         FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
      );
      const blocker: QueryRunner = db.admin.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query("SELECT pg_advisory_xact_lock($1)", [lockKey]);
      return {
        release: () => blocker.rollbackTransaction(),
        dispose: async () => {
          if (blocker.isTransactionActive) await blocker.rollbackTransaction();
          await blocker.release();
          await db.admin.query(`DROP TRIGGER "${name}" ON refresh_tokens`);
          await db.admin.query(`DROP FUNCTION "${name}"()`);
        },
      };
    };

    it("rejects an inactive user's token without redeeming it", async () => {
      const token = await issueToken(db, user.id);
      await db.admin.getRepository(User).update(user.id, { isActive: false });

      await expect(users.refreshToken(token)).rejects.toMatchObject(
        UNAUTHORIZED,
      );

      expect((await tokenRow(db, token)).revoked).toBe(false);
      expect(await live()).toEqual([hashRefreshToken(token)]);
    });

    it("answers a replay within the grace window with a plain 401 and keeps the winner's session", async () => {
      const original = await issueToken(db, user.id);
      const { refresh_token: successor } = await users.refreshToken(original);
      const warn = jest.spyOn(Logger.prototype, "warn");

      await expect(users.refreshToken(original)).rejects.toMatchObject(
        UNAUTHORIZED,
      );

      expect(await live()).toEqual([hashRefreshToken(successor)]);
      expect(warn).not.toHaveBeenCalled();
    });

    it("revokes the whole rotation family on a replay after the grace window, and only that family", async () => {
      const original = await issueToken(db, user.id);
      const otherDevice = await issueToken(db, user.id);
      const { refresh_token: second } = await users.refreshToken(original);
      const { refresh_token: third } = await users.refreshToken(second);
      await ageRedemption(original);
      const warn = jest.spyOn(Logger.prototype, "warn");

      await expect(users.refreshToken(original)).rejects.toMatchObject(
        UNAUTHORIZED,
      );

      // Committed despite the 401: the live head of the chain is gone.
      expect((await tokenRow(db, third)).revoked).toBe(true);
      expect(await live()).toEqual([hashRefreshToken(otherDevice)]);
      await expect(users.refreshToken(third)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
      const familyId = (await tokenRow(db, original)).family_id;
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(`family ${familyId}`);
      expect(warn.mock.calls[0][0]).not.toContain(original);
    });

    it("redeems a plaintext row from a rolled-back image once, into a hashed successor", async () => {
      const legacy = await issueLegacyToken(db, user.id);
      const legacyId = (await tokenRow(db, legacy)).id;

      const { refresh_token: successor } = await users.refreshToken(legacy);

      const successorRow = await tokenRow(db, successor);
      expect(successorRow.token).toBeNull();
      expect(successorRow.token_hash).toBe(hashRefreshToken(successor));
      expect(successorRow.family_id).toBe(legacyId);
      expect((await tokenRow(db, legacy)).revoked).toBe(true);
      await expect(users.refreshToken(legacy)).rejects.toMatchObject(
        UNAUTHORIZED,
      );

      await ageRedemption(legacy);
      await expect(users.refreshToken(legacy)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
      expect(await live()).toEqual([]);
    });

    it("a replay revokes the successor of a rotation of the same chain that is still committing", async () => {
      const original = await issueToken(db, user.id);
      const { refresh_token: head } = await users.refreshToken(original);
      await ageRedemption(original);
      const warn = jest.spyOn(Logger.prototype, "warn");
      const parked = await parkSuccessorInserts();
      try {
        const rotating = Promise.allSettled([users.refreshToken(head)]);
        expect(await db.waitForLockWaiters(1)).toBeGreaterThanOrEqual(1);
        const replaying = Promise.allSettled([users.refreshToken(original)]);
        expect(await db.waitForLockWaiters(2)).toBeGreaterThanOrEqual(2);
        await parked.release();

        const [[rotated], [replayed]] = await Promise.all([
          rotating,
          replaying,
        ]);
        expect(rotated.status).toBe("fulfilled");
        expect(replayed).toMatchObject({
          status: "rejected",
          reason: UNAUTHORIZED,
        });
        expect(await live()).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("revoked 1 live token(s)");
      } finally {
        await parked.dispose();
      }
    });

    it("logs out by hash, and a logged-out token is never taken for a replay", async () => {
      const active = await issueToken(db, user.id);
      const legacy = await issueLegacyToken(db, user.id);
      const spent = await issueToken(db, user.id);
      const { refresh_token: successor } = await users.refreshToken(spent);
      const redeemedAt = (await tokenRow(db, spent)).redeemed_at;
      const warn = jest.spyOn(Logger.prototype, "warn");

      await users.revokeRefreshToken(active);
      await users.revokeRefreshToken(legacy);
      await users.revokeRefreshToken(spent);

      expect(await tokenRow(db, active)).toMatchObject({
        revoked: true,
        redeemed_at: null,
      });
      expect((await tokenRow(db, legacy)).revoked).toBe(true);
      expect((await tokenRow(db, spent)).redeemed_at).toEqual(redeemedAt);
      expect(await live()).toEqual([hashRefreshToken(successor)]);
      await expect(users.refreshToken(active)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it("a password change revokes the successor of a rotation that is still committing", async () => {
      const original = await issueToken(db, user.id);
      const parked = await parkSuccessorInserts();
      try {
        const refreshing = Promise.allSettled([users.refreshToken(original)]);
        expect(await db.waitForLockWaiters(1)).toBeGreaterThanOrEqual(1);
        const changing = Promise.allSettled([changePassword()]);
        expect(await db.waitForLockWaiters(2)).toBeGreaterThanOrEqual(2);
        await parked.release();

        const [[refreshed], [changed]] = await Promise.all([
          refreshing,
          changing,
        ]);
        expect(refreshed.status).toBe("fulfilled");
        expect(changed.status).toBe("fulfilled");
        expect(await live()).toEqual([]);
      } finally {
        await parked.dispose();
      }
    });

    it("rejects a rotation that starts after a password change committed, without calling it a replay", async () => {
      const original = await issueToken(db, user.id);
      const warn = jest.spyOn(Logger.prototype, "warn");

      await changePassword();

      await expect(users.refreshToken(original)).rejects.toMatchObject(
        UNAUTHORIZED,
      );
      expect(await live()).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });
  },
);
