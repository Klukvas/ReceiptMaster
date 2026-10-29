import { createHash } from "crypto";
import { IncomingHttpHeaders } from "http";
import { HttpStatus } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ApiErrors } from "../errors/ApiError";
import { IdempotencyKey } from "../../modules/orders/entities/idempotency-key.entity";

/** Request header as Express exposes it (lower-case), and the replay marker. */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IDEMPOTENCY_REPLAYED_HEADER = "X-Idempotency-Replayed";

export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
// Visible ASCII, no whitespace: enough for a UUID or any client token, and two
// header values joined by a proxy ("a, b") are refused instead of merged.
const VISIBLE_ASCII = /^[\x21-\x7e]+$/;

/** Swagger description shared by the routes that accept the header. */
export const IDEMPOTENCY_KEY_API_HEADER = {
  name: "Idempotency-Key",
  description:
    "Optional, 1–255 visible ASCII characters. Within 24 hours a repeated key creates nothing and replays the first 201 response with X-Idempotency-Replayed: true; only successful creates are stored.",
  required: false,
} as const;

export type IdempotencyScope = "product" | "recipient";

export type StoredResponse = Readonly<Record<string, unknown>>;

export type IdempotentCreateResult<T> =
  | { readonly replayed: false; readonly data: T }
  | { readonly replayed: true; readonly data: StoredResponse };

export type IdempotentCreateRequest = {
  readonly scope: IdempotencyScope;
  readonly key: string;
  readonly userId: string;
};

/**
 * The validated header, or undefined when absent (400 before any transaction
 * when invalid). Read from the request rather than with `@Headers()`, which
 * Swagger would document as a second, required parameter.
 */
export function idempotencyKeyOf(
  headers: IncomingHttpHeaders,
): string | undefined {
  const value = headers[IDEMPOTENCY_KEY_HEADER];
  if (value === undefined) return undefined;
  // Repeated headers are refused by validation, never merged into one key.
  const key = Array.isArray(value) ? value.join(", ") : value;
  assertValidIdempotencyKey(key);
  return key;
}

export function assertValidIdempotencyKey(key: string): void {
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !VISIBLE_ASCII.test(key)) {
    throw ApiErrors.VALIDATION_ERROR(
      "Idempotency-Key",
      `must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} visible ASCII characters`,
    );
  }
}

/**
 * The value stored in `idempotency_keys.key`. Order creates store their raw key
 * in the same `(key, user_id)`-unique column, so a scoped key carries its scope
 * and a digest: it never equals a plausible order key, a product key never
 * matches a recipient key, and it fits varchar(255) for every accepted key.
 */
export function scopedIdempotencyKey(
  scope: IdempotencyScope,
  key: string,
): string {
  return `${scope}:${createHash("sha256").update(key).digest("hex")}`;
}

/**
 * Runs `create` at most once per (scope, key, user) within 24 hours. Must be
 * called inside the caller's transaction, before any other lock it takes: the
 * key's advisory lock queues same-key requests until the first one commits or
 * rolls back, so a retry — even a concurrent one — finds the stored response
 * instead of creating a second entity. A failed create stores nothing.
 */
export async function createIdempotently<T extends object>(
  manager: EntityManager,
  request: IdempotentCreateRequest,
  create: () => Promise<T>,
): Promise<IdempotentCreateResult<T>> {
  if (!manager.queryRunner?.isTransactionActive) {
    throw new Error("createIdempotently must run inside a transaction");
  }
  assertValidIdempotencyKey(request.key);
  const key = scopedIdempotencyKey(request.scope, request.key);
  await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);

  const stored = await manager.findOne(IdempotencyKey, {
    where: { key, user_id: request.userId },
  });
  if (stored && stored.expires_at > new Date()) {
    return { replayed: true, data: stored.response };
  }
  if (stored) {
    await manager.delete(IdempotencyKey, { id: stored.id });
  }

  const created = await create();
  // Exactly the JSON the client received, so a replay returns the same data.
  const response: IdempotencyKey["response"] = JSON.parse(
    JSON.stringify(created),
  );
  await manager.insert(IdempotencyKey, {
    key,
    user_id: request.userId,
    // order_id stays NULL: only order keys point at an order.
    response,
    status_code: HttpStatus.CREATED,
    expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
  });
  return { replayed: false, data: created };
}
