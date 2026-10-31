import * as crypto from "crypto";
import { EntityManager } from "typeorm";
import { RefreshToken } from "./entities/refresh-token.entity";

const REFRESH_TOKEN_EXPIRATION_DAYS = 30;

/**
 * How long after a redemption the same token may come back as a lost race
 * rather than a replay. Tabs share one stored session and refresh on their own;
 * the losing tab gets a plain 401 and adopts the winner's session
 * (frontend/src/lib/auth-session.ts). Retried requests land here as well.
 */
export const REPLAY_GRACE_MS = 30_000;

/** The token is 512 random bits, so a fast unsalted hash leaves a leaked table useless. */
export const hashRefreshToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Hash first; plaintext only for rows that predate hashing or come from a rolled-back image. */
const PRESENTED_TOKEN =
  "(token_hash = :tokenHash OR (token_hash IS NULL AND token = :token))";

const presentedTokenParams = (token: string) => ({
  tokenHash: hashRefreshToken(token),
  token,
});

export type RefreshTokenState = Pick<
  RefreshToken,
  "id" | "user_id" | "family_id" | "redeemed_at"
>;

/** A rolled-back image writes rows without a family; their successors adopt the row's id. */
export const familyOf = (row: Pick<RefreshToken, "id" | "family_id">): string =>
  row.family_id ?? row.id;

/**
 * A redeemed token presented after the grace window: someone kept a copy the
 * chain has moved past. Tokens revoked without a rotation (logout, password
 * change, family revocation, rows from before redeemed_at) are never replays.
 */
export const isReplay = (
  row: Pick<RefreshToken, "redeemed_at">,
  now: Date,
): boolean =>
  row.redeemed_at !== null &&
  now.getTime() - row.redeemed_at.getTime() > REPLAY_GRACE_MS;

/** Stores only the hash; the plaintext exists once, in the response. */
export async function issueRefreshToken(
  manager: EntityManager,
  userId: string,
  familyId: string = crypto.randomUUID(),
): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRATION_DAYS);
  await manager.getRepository(RefreshToken).insert({
    token_hash: hashRefreshToken(token),
    family_id: familyId,
    user_id: userId,
    expires_at: expiresAt,
  });
  return token;
}

export function findPresentedToken(
  manager: EntityManager,
  token: string,
): Promise<RefreshTokenState | null> {
  return manager
    .getRepository(RefreshToken)
    .createQueryBuilder("refresh_token")
    .select([
      "refresh_token.id",
      "refresh_token.user_id",
      "refresh_token.family_id",
      "refresh_token.redeemed_at",
    ])
    .where(PRESENTED_TOKEN, presentedTokenParams(token))
    .getOne();
}

/**
 * Single use: of concurrent redemptions only the first conditional UPDATE
 * matches; the rest wait for it to commit, re-check and match nothing.
 */
export async function redeemRefreshToken(
  manager: EntityManager,
  id: string,
  now: Date,
): Promise<boolean> {
  const result = await manager
    .createQueryBuilder()
    .update(RefreshToken)
    .set({ revoked: true, redeemed_at: now })
    .where("id = :id", { id })
    .andWhere("revoked = false")
    .andWhere("expires_at > :now", { now })
    .returning(["id"])
    .execute();
  // UpdateResult.raw holds the RETURNING rows (not the driver's [rows, count]).
  return ((result.raw ?? []) as unknown[]).length > 0;
}

/** Returns how many live tokens of the family it revoked. */
export async function revokeRefreshTokenFamily(
  manager: EntityManager,
  familyId: string,
): Promise<number> {
  const result = await manager
    .createQueryBuilder()
    .update(RefreshToken)
    .set({ revoked: true })
    .where("family_id = :familyId", { familyId })
    .andWhere("revoked = false")
    .returning(["id"])
    .execute();
  return ((result.raw ?? []) as unknown[]).length;
}

export async function revokePresentedToken(
  manager: EntityManager,
  token: string,
): Promise<void> {
  await manager
    .createQueryBuilder()
    .update(RefreshToken)
    .set({ revoked: true })
    .where(PRESENTED_TOKEN, presentedTokenParams(token))
    .andWhere("revoked = false")
    .execute();
}
