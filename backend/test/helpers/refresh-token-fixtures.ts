import { randomBytes, randomUUID } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../../src/modules/users/users.service";
import { User } from "../../src/modules/users/entities/user.entity";
import { RefreshToken } from "../../src/modules/users/entities/refresh-token.entity";
import { hashRefreshToken } from "../../src/modules/users/refresh-tokens";
import { RestrictedAppDatabase } from "./restricted-app-database";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const UNAUTHORIZED = {
  statusCode: 401,
  error: "Unauthorized access",
  errorCode: "UNAUTHORIZED",
};

// Refresh runs before authentication, so it has no tenant context; the service is
// still wired to the restricted role through the production query-context wrapper.
export const usersServiceOn = (db: RestrictedAppDatabase): UsersService =>
  new UsersService(
    db.app.getRepository(User),
    db.app.getRepository(RefreshToken),
    new JwtService({ secret: randomBytes(32).toString("hex") }),
    {} as ConfigService,
  );

/** A row as the current code writes it: hash only, in its own family by default. */
export async function issueToken(
  db: RestrictedAppDatabase,
  userId: string,
  {
    expiresInMs = DAY_MS,
    familyId = randomUUID(),
  }: { expiresInMs?: number; familyId?: string } = {},
): Promise<string> {
  const token = randomBytes(64).toString("hex");
  await db.admin.getRepository(RefreshToken).insert({
    token_hash: hashRefreshToken(token),
    family_id: familyId,
    user_id: userId,
    expires_at: new Date(Date.now() + expiresInMs),
  });
  return token;
}

/** A row as the previous image writes it (e.g. after a rollback): plaintext only. */
export async function issueLegacyToken(
  db: RestrictedAppDatabase,
  userId: string,
): Promise<string> {
  const token = randomBytes(64).toString("hex");
  await db.admin.getRepository(RefreshToken).insert({
    token,
    user_id: userId,
    expires_at: new Date(Date.now() + DAY_MS),
  });
  return token;
}

export const tokenRow = (
  db: RestrictedAppDatabase,
  token: string,
): Promise<RefreshToken> =>
  db.admin.getRepository(RefreshToken).findOneOrFail({
    where: [{ token_hash: hashRefreshToken(token) }, { token }],
  });

export const tokensOf = (
  db: RestrictedAppDatabase,
  userId: string,
): Promise<RefreshToken[]> =>
  db.admin
    .getRepository(RefreshToken)
    .find({ where: { user_id: userId }, order: { created_at: "ASC" } });

export const liveTokenHashes = async (
  db: RestrictedAppDatabase,
  userId: string,
): Promise<Array<string | null>> =>
  (await tokensOf(db, userId))
    .filter((row) => !row.revoked && row.expires_at > new Date())
    .map((row) => row.token_hash);
