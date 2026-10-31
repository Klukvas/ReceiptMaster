import "reflect-metadata";
import { randomBytes, randomUUID } from "crypto";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { installTenantContext } from "../src/common/tenancy/tenant-data-source";
import { UsersService } from "../src/modules/users/users.service";
import { User } from "../src/modules/users/entities/user.entity";
import { RefreshToken } from "../src/modules/users/entities/refresh-token.entity";
import { hashRefreshToken } from "../src/modules/users/refresh-tokens";
import {
  AUDIT_CLUSTER,
  connectIsolatedAdmin,
  createRestrictedRole,
  describeIsolatedPostgres,
  teardownIsolatedPostgres,
  typeormCredentials,
} from "./helpers/isolated-postgres";

const MIGRATIONS_DIR = join(__dirname, "../src/config/migrations");
const NEW_MIGRATION_FILE = "1792400000000-HashRefreshTokens.ts";
const NEW_MIGRATION = "HashRefreshTokens1792400000000";
const ENTITIES = [join(__dirname, "../src/**/*.entity.ts")];
const DAY_MS = 24 * 60 * 60 * 1000;

type LegacyRow = { id: string; token: string };

/**
 * The release path for hashed refresh tokens on a fresh database: the chain up
 * to the previous release, rows the previous image wrote (live, revoked and a
 * duplicated plaintext), then the new migration, the previous image's writes
 * against the new schema, the current service, the revert and a re-apply.
 */
describeIsolatedPostgres(
  "refresh_tokens hashing migration on PostgreSQL",
  AUDIT_CLUSTER,
  (connection) => {
    const suffix = `${process.pid}_${Date.now()}`;
    const database = `audit_token_hash_${suffix}`;
    const role = `audit_token_hash_app_${suffix}`;
    const userId = randomUUID();
    let live: LegacyRow;
    let revoked: LegacyRow;
    let olderCopy: LegacyRow;
    let newerCopy: LegacyRow;
    let root: Client;
    let previous: DataSource;
    let current: DataSource;
    let app: DataSource;
    let users: UsersService;

    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((file) =>
      file.endsWith(".ts"),
    );

    const ownerSource = (files: string[]) =>
      new DataSource({
        type: "postgres",
        ...typeormCredentials(connection),
        database,
        // Entity metadata makes TypeORM install uuid-ossp, which the first
        // migration needs; synchronize stays off, so it never shapes the schema.
        entities: ENTITIES,
        migrations: files.map((file) => join(MIGRATIONS_DIR, file)),
        synchronize: false,
      }).initialize();

    const migrateToLatest = () => current.runMigrations({ transaction: "all" });

    const columns = () =>
      current.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'refresh_tokens'
           AND column_name IN ('token', 'token_hash', 'family_id', 'redeemed_at')
         ORDER BY column_name`,
      );

    const row = async (id: string) =>
      (
        await current.query(
          `SELECT token, token_hash, family_id, revoked, redeemed_at
           FROM refresh_tokens WHERE id = $1`,
          [id],
        )
      )[0];

    const insertLegacy = async (
      token: string,
      { isRevoked = false, createdAt = new Date() } = {},
    ): Promise<LegacyRow> => {
      const id = randomUUID();
      await previous.query(
        `INSERT INTO refresh_tokens (id, token, user_id, expires_at, revoked, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          token,
          userId,
          new Date(Date.now() + DAY_MS),
          isRevoked,
          createdAt,
        ],
      );
      return { id, token };
    };

    beforeAll(async () => {
      root = await connectIsolatedAdmin(connection);
      await root.query(`CREATE DATABASE "${database}"`);
      const rolePassword = await createRestrictedRole(root, role);

      // The schema as the previous release left it.
      previous = await ownerSource(
        migrationFiles.filter((file) => file !== NEW_MIGRATION_FILE),
      );
      await previous.runMigrations({ transaction: "all" });

      // Table-level grants made before the columns exist (as on a live server).
      await previous.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await previous.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
      );

      await previous.query(
        `INSERT INTO users (id, email, password) VALUES ($1, $2, 'fixture')`,
        [userId, `${userId}@migration.invalid`],
      );
      live = await insertLegacy(randomBytes(64).toString("hex"));
      revoked = await insertLegacy(randomBytes(64).toString("hex"), {
        isRevoked: true,
      });
      const duplicated = randomBytes(64).toString("hex");
      olderCopy = await insertLegacy(duplicated, {
        createdAt: new Date(Date.now() - DAY_MS),
      });
      newerCopy = await insertLegacy(duplicated);

      current = await ownerSource(migrationFiles);
      app = installTenantContext(
        await new DataSource({
          type: "postgres",
          host: connection.host,
          port: connection.port,
          username: role,
          password: rolePassword,
          database,
          entities: ENTITIES,
          extra: { max: 2 },
        }).initialize(),
      );
      users = new UsersService(
        app.getRepository(User),
        app.getRepository(RefreshToken),
        new JwtService({ secret: randomBytes(32).toString("hex") }),
        {} as ConfigService,
      );
    }, 60000);

    afterAll(() =>
      teardownIsolatedPostgres({
        dataSources: [app, current, previous],
        admin: root,
        databases: [database],
        roles: [role],
      }),
    );

    it("is the only pending migration and hashes every row, keeping its plaintext, in a family of its own", async () => {
      const applied = await migrateToLatest();

      expect(applied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await columns()).toEqual([
        { column_name: "family_id", data_type: "uuid", is_nullable: "YES" },
        {
          column_name: "redeemed_at",
          data_type: "timestamp with time zone",
          is_nullable: "YES",
        },
        {
          column_name: "token",
          data_type: "character varying",
          is_nullable: "YES",
        },
        {
          column_name: "token_hash",
          data_type: "character varying",
          is_nullable: "YES",
        },
      ]);
      for (const legacy of [live, revoked])
        expect(await row(legacy.id)).toEqual({
          token: legacy.token,
          token_hash: hashRefreshToken(legacy.token),
          family_id: legacy.id,
          revoked: legacy === revoked,
          redeemed_at: null,
        });
      expect(await current.showMigrations()).toBe(false);
    });

    it("keeps only the newest copy of a duplicated token reachable, so the hash is unique", async () => {
      await migrateToLatest();

      expect(await row(newerCopy.id)).toMatchObject({
        token: newerCopy.token,
        token_hash: hashRefreshToken(newerCopy.token),
        revoked: false,
      });
      expect(await row(olderCopy.id)).toMatchObject({
        token: null,
        token_hash: null,
        revoked: true,
      });
      await expect(
        current.query(
          `INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, now())`,
          [hashRefreshToken(live.token), userId],
        ),
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "UQ_refresh_tokens_token_hash",
      });
    });

    it("still serves the previous image after a rollback: plaintext writes and lookups", async () => {
      await migrateToLatest();
      const written = randomBytes(64).toString("hex");

      await app.query(
        `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
        [written, userId, new Date(Date.now() + DAY_MS)],
      );

      for (const token of [live.token, newerCopy.token, written])
        expect(
          await app.query(
            "SELECT count(*)::int AS n FROM refresh_tokens WHERE token = $1",
            [token],
          ),
        ).toEqual([{ n: 1 }]);
    });

    it("lets the current service rotate a backfilled token through the restricted role", async () => {
      await migrateToLatest();

      const { refresh_token } = await users.refreshToken(newerCopy.token);

      expect(await row(newerCopy.id)).toMatchObject({ revoked: true });
      const [successor] = await current.query(
        "SELECT token, family_id FROM refresh_tokens WHERE token_hash = $1",
        [hashRefreshToken(refresh_token)],
      );
      expect(successor).toEqual({ token: null, family_id: newerCopy.id });
    });

    it("reverts by ending hash-only sessions and keeping plaintext rows, and re-applies", async () => {
      await migrateToLatest();
      const { refresh_token } = await users.refreshToken(live.token);

      await current.undoLastMigration({ transaction: "all" });

      expect(await columns()).toEqual([
        {
          column_name: "token",
          data_type: "character varying",
          is_nullable: "NO",
        },
      ]);
      expect(
        await current.query(
          "SELECT count(*)::int AS n FROM refresh_tokens WHERE token IS NULL",
        ),
      ).toEqual([{ n: 0 }]);
      expect(
        await current.query(
          "SELECT token FROM refresh_tokens WHERE id = ANY($1::uuid[]) ORDER BY token",
          [[live.id, revoked.id]],
        ),
      ).toEqual([live.token, revoked.token].sort().map((token) => ({ token })));
      expect(await current.showMigrations()).toBe(true);

      const reapplied = await migrateToLatest();

      expect(reapplied.map((migration) => migration.name)).toEqual([
        NEW_MIGRATION,
      ]);
      expect(await row(live.id)).toMatchObject({
        token_hash: hashRefreshToken(live.token),
        family_id: live.id,
      });
      expect(
        await current.query(
          "SELECT count(*)::int AS n FROM refresh_tokens WHERE token_hash = $1",
          [hashRefreshToken(refresh_token)],
        ),
      ).toEqual([{ n: 0 }]);
    });
  },
);
