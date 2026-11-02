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
