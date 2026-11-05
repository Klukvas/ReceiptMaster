import { EntityManager } from "typeorm";
import { DocumentType } from "./entities/receipt.entity";

/**
 * The next document number for an account and document type, e.g. "2026-000007".
 *
 * Every type counts on its own, per account, so a number says nothing about how many
 * documents other accounts or other types have. The counter row is bumped in a single
 * upsert: concurrent generations queue on that row (including the very first insert) and
 * never get the same number, and a number is never reused even when the document it was
 * handed to is evicted by the retention cap. The unique index on
 * (user_id, document_type, number) is the backstop.
 *
 * Waybills also keep `users.receipt_counter` in step for one release, and count from the
 * higher of the two counters, so an image rolled back (and forward again) without reverting
 * the migration does not hand out numbers that already exist.
 */
export async function nextDocumentNumber(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
): Promise<string> {
  const rows: Array<{ value: number }> = await manager.query(
    type === DocumentType.WAYBILL ? BUMP_WAYBILL_COUNTER : BUMP_COUNTER,
    [userId, type],
  );
  if (rows.length === 0)
    throw new Error(`Could not bump the ${type} counter for user ${userId}`);
  const year = new Date().getUTCFullYear();
  return `${year}-${String(rows[0].value).padStart(6, "0")}`;
}

/**
 * Gives back a number that never reached a committed document, so a refused or failed
 * generation does not leave a gap in the sequence. Only possible while the counter still
 * stands at that number: if another generation took the next one in the meantime, the gap
 * stays (renumbering later documents would be worse).
 */
export async function releaseDocumentNumber(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  number: string,
): Promise<boolean> {
  const value = Number(/^\d{4}-(\d+)$/.exec(number)?.[1]);
  if (!Number.isSafeInteger(value) || value < 1) return false;
  const rows: unknown[] = await manager.query(
    type === DocumentType.WAYBILL ? RELEASE_WAYBILL_COUNTER : RELEASE_COUNTER,
    [userId, type, value],
  );
  return rows.length > 0;
}

const RELEASE_COUNTER = `
  UPDATE "document_counters" SET "value" = "value" - 1
  WHERE "user_id" = $1 AND "document_type" = $2 AND "value" = $3
  RETURNING "value"`;

const RELEASE_WAYBILL_COUNTER = `
  WITH released AS (
    UPDATE "document_counters" SET "value" = "value" - 1
    WHERE "user_id" = $1 AND "document_type" = $2 AND "value" = $3
    RETURNING "value"
  ), legacy AS (
    UPDATE "users" SET "receipt_counter" = "receipt_counter" - 1
    WHERE "id" = $1 AND "receipt_counter" = $3 AND EXISTS (SELECT 1 FROM released)
  )
  SELECT "value" FROM released`;

const BUMP_COUNTER = `
  INSERT INTO "document_counters" ("user_id", "document_type", "value")
  VALUES ($1, $2, 1)
  ON CONFLICT ("user_id", "document_type")
  DO UPDATE SET "value" = "document_counters"."value" + 1
  RETURNING "value"`;

// Counts from the higher of the two counters: an image rolled back and rolled forward
// again leaves `users.receipt_counter` ahead of the new table, and the older image only
// ever writes the old one.
const BUMP_WAYBILL_COUNTER = `
  WITH bumped AS (
    INSERT INTO "document_counters" ("user_id", "document_type", "value")
    SELECT "id", $2, "receipt_counter" + 1 FROM "users" WHERE "id" = $1
    ON CONFLICT ("user_id", "document_type")
    DO UPDATE SET "value" = GREATEST("document_counters"."value", EXCLUDED."value" - 1) + 1
    RETURNING "value"
  ), legacy AS (
    UPDATE "users" SET "receipt_counter" = bumped."value"
    FROM bumped WHERE "users"."id" = $1
  )
  SELECT "value" FROM bumped`;
