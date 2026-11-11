import { isUUID } from "class-validator";
import { EntityManager, Repository } from "typeorm";
import { User } from "./entities/user.entity";

/**
 * Claims of every access token. `tv` is the account's `users.token_version` at signing
 * time; bumping the column (logout, password change) revokes every token signed before.
 */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly tv: number;
}

/** The column default: a brand-new account and tokens signed before the claim existed. */
export const INITIAL_TOKEN_VERSION = 0;

export const accessTokenClaims = (
  user: Pick<User, "id" | "email">,
  tokenVersion: number,
): AccessTokenClaims => ({
  sub: user.id,
  email: user.email,
  tv: tokenVersion,
});

/** Tokens signed before this release carry no `tv`; they belong to version 0. */
export const tokenVersionOf = (payload: { readonly tv?: unknown }): unknown =>
  payload.tv ?? INITIAL_TOKEN_VERSION;

export const isCurrentTokenVersion = (
  payload: { readonly tv?: unknown },
  currentVersion: number,
): boolean => tokenVersionOf(payload) === currentVersion;

/** The account's token version now, or null when there is no such account. */
export async function currentTokenVersion(
  users: Repository<User>,
  userId: string,
): Promise<number | null> {
  const row = await users
    .createQueryBuilder("user")
    .select(`"user"."token_version"`, "token_version")
    .where("user.id = :id", { id: userId })
    .getRawOne<{ token_version: number }>();
  return row ? row.token_version : null;
}

const CURRENT_VERSION_ALIAS = "current_token_version";

/**
 * The account a signature-verified access token speaks for, in one query, or null when
 * the subject is not a user id, the account is missing or inactive, or the token's
 * version is stale. The version is read as a raw column so the returned entity (which
 * becomes `req.user`) looks exactly as before and never carries it into a response.
 */
export async function findAccessTokenOwner(
  users: Repository<User>,
  payload: { readonly sub?: unknown; readonly tv?: unknown } | null | undefined,
): Promise<User | null> {
  const subject = payload?.sub;
  // users.id is a uuid column: any other subject would fail in the database (a 500)
  // instead of being the 401 it is.
  if (typeof subject !== "string" || !isUUID(subject)) {
    return null;
  }
  const { entities, raw } = await users
    .createQueryBuilder("user")
    .addSelect(`"user"."token_version"`, CURRENT_VERSION_ALIAS)
    .where("user.id = :id", { id: subject })
    .getRawAndEntities<{ [CURRENT_VERSION_ALIAS]: number }>();
  const [user] = entities;
  const [row] = raw;
  if (!user?.isActive || !row) {
    return null;
  }
  return isCurrentTokenVersion(payload, row[CURRENT_VERSION_ALIAS])
    ? user
    : null;
}

/**
 * Adds 1 to the account's token version in one statement (concurrent bumps never get
 * lost) and returns the new value, or null when there is no such account (its tokens
 * already fail the strategy). `updatedAt` is left alone: signing out is not an edit of
 * the account.
 */
export async function bumpTokenVersion(
  manager: EntityManager,
  userId: string,
): Promise<number | null> {
  const result = await manager
    .createQueryBuilder()
    .update(User)
    .set({
      token_version: () => `"token_version" + 1`,
      updatedAt: () => `"updatedAt"`,
    })
    .where("id = :id", { id: userId })
    .returning(["token_version"])
    .execute();
  const [row] = (result.raw ?? []) as Array<{ token_version: number }>;
  return row ? row.token_version : null;
}
