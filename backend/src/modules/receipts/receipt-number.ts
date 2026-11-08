import { EntityManager } from "typeorm";
import { DocumentType } from "./entities/receipt.entity";
import { issueDateIn } from "./frozen-document";

/** The year printed in a number: the calendar year in the document's time zone. */
export function documentYear(now: Date, timeZone: string): number {
  return Number(issueDateIn(now, timeZone).slice(0, 4));
}

/** How a counter value is printed; stored next to the counter in `document_counters`. */
export interface NumberFormat {
  prefix: string;
  padding: number;
  includeYear: boolean;
}

/** What accounts that never touched the setting have always got: "2026-000042". */
export const DEFAULT_NUMBER_FORMAT: NumberFormat = {
  prefix: "",
  padding: 6,
  includeYear: true,
};

/**
 * Prints a counter value, e.g. "РФ-2026-000043". The prefix never ends with a digit, so
 * the number always ends in one digit run that is exactly the value: different formats
 * cannot print the same text for different values.
 */
export function formatDocumentNumber(
  format: NumberFormat,
  value: number,
  year: number,
): string {
  const yearPart = format.includeYear ? `${year}-` : "";
  return `${format.prefix}${yearPart}${String(value).padStart(format.padding, "0")}`;
}

export interface DrawnNumber {
  number: string;
  /** The counter value behind the number, for `releaseDocumentNumber`. */
  value: number;
}

/** Digits of the largest counter value: MAX_START_NUMBER (2e9) plus the numbers drawn after it. */
const MAX_COUNTER_DIGITS = 10;

/** The counter column is a 32-bit integer; a longer digit run in a hand-made number cannot be a counter value. */
const MAX_COUNTER_VALUE = 2_147_483_647;

interface CounterRow {
  value: number;
  prefix: string;
  padding: number;
  include_year: boolean;
}

/**
 * The next document number for an account and document type, e.g. "2026-000007".
 *
 * Every type counts on its own, per account, so a number says nothing about how many
 * documents other accounts or other types have. The counter row is bumped in a single
 * upsert: concurrent generations queue on that row (including the very first insert) and
 * never get the same number, and a number is never reused even when the document it was
 * handed to is evicted by the retention cap. The format is read in the same statement as
 * the value, so a prefix change racing a draw yields a whole old or whole new number.
 * The unique index on (user_id, document_type, number) is the backstop.
 *
 * Waybills also keep `users.receipt_counter` in step for one release, and count from the
 * higher of the two counters, so an image rolled back (and forward again) without reverting
 * the migration does not hand out numbers that already exist.
 */
export async function nextDocumentNumber(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  options: { timeZone: string; now?: Date },
): Promise<DrawnNumber> {
  const rows: CounterRow[] = await manager.query(
    type === DocumentType.WAYBILL ? BUMP_WAYBILL_COUNTER : BUMP_COUNTER,
    [userId, type],
  );
  if (rows.length === 0)
    throw new Error(`Could not bump the ${type} counter for user ${userId}`);
  const [row] = rows;
  const value = Number(row.value);
  const number = formatDocumentNumber(
    {
      prefix: row.prefix,
      padding: Number(row.padding),
      includeYear: row.include_year,
    },
    value,
    documentYear(options.now ?? new Date(), options.timeZone),
  );
  return { number, value };
}

/**
 * Gives back a number that never reached a committed document, so a refused or failed
 * generation does not leave a gap in the sequence. Works by value, not by text, so it is
 * independent of the format. Only possible while the counter still stands at that value:
 * if another generation took the next one in the meantime, the gap stays (renumbering
 * later documents would be worse).
 */
export async function releaseDocumentNumber(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  value: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(value) || value < 1) return false;
  const rows: unknown[] = await manager.query(
    type === DocumentType.WAYBILL ? RELEASE_WAYBILL_COUNTER : RELEASE_COUNTER,
    [userId, type, value],
  );
  return rows.length > 0;
}

// A bare UPDATE ... RETURNING comes back from the postgres driver as `[rows, count]`, so
// every statement here that is read as rows is wrapped: a CTE UPDATE followed by a SELECT
// answers with the plain row array.
const RELEASE_COUNTER = `
  WITH released AS (
    UPDATE "document_counters" SET "value" = "value" - 1
    WHERE "user_id" = $1 AND "document_type" = $2 AND "value" = $3
    RETURNING "value"
  )
  SELECT "value" FROM released`;

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
  RETURNING "value", "prefix", "padding", "include_year"`;

// Counts from the higher of the two counters: an image rolled back and rolled forward
// again leaves `users.receipt_counter` ahead of the new table, and the older image only
// ever writes the old one.
const BUMP_WAYBILL_COUNTER = `
  WITH bumped AS (
    INSERT INTO "document_counters" ("user_id", "document_type", "value")
    SELECT "id", $2, "receipt_counter" + 1 FROM "users" WHERE "id" = $1
    ON CONFLICT ("user_id", "document_type")
    DO UPDATE SET "value" = GREATEST("document_counters"."value", EXCLUDED."value" - 1) + 1
    RETURNING "value", "prefix", "padding", "include_year"
  ), legacy AS (
    UPDATE "users" SET "receipt_counter" = bumped."value"
    FROM bumped WHERE "users"."id" = $1
  )
  SELECT "value", "prefix", "padding", "include_year" FROM bumped`;

/**
 * Self-heal for a counter that fell behind the numbers actually issued (a restored backup,
 * a hand-edited row, an old image): raises it to the highest counter value found in the
 * account's numbers of that type. Locks the counter row first, then (waybill) the user row,
 * the order the draw takes them in. Never lowers anything.
 */
export async function raiseCounterToIssued(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
): Promise<number> {
  await manager.query(
    `INSERT INTO "document_counters" ("user_id", "document_type") VALUES ($1, $2)
     ON CONFLICT ("user_id", "document_type") DO NOTHING`,
    [userId, type],
  );
  await manager.query(
    `SELECT 1 FROM "document_counters" WHERE "user_id" = $1 AND "document_type" = $2 FOR UPDATE`,
    [userId, type],
  );
  // The counter value is the trailing digit run of a number (see formatDocumentNumber);
  // read all of it: the start number allows 10 digits (MAX_START_NUMBER is 2e9).
  const [{ highest }]: Array<{ highest: string | null }> = await manager.query(
    `SELECT MAX(("m")[1]::bigint) AS highest
     FROM (
       SELECT regexp_match("number", '([0-9]{1,${MAX_COUNTER_DIGITS}})$') AS "m" FROM "receipts"
       WHERE "user_id" = $1 AND "document_type" = $2
     ) AS "numbers" WHERE "m" IS NOT NULL AND ("m")[1]::bigint <= ${MAX_COUNTER_VALUE}`,
    [userId, type],
  );
  const issued = Number(highest ?? 0);
  const [{ value }]: Array<{ value: number }> = await manager.query(
    `WITH raised AS (
       UPDATE "document_counters" SET "value" = GREATEST("value", $3)
       WHERE "user_id" = $1 AND "document_type" = $2 RETURNING "value"
     )
     SELECT "value" FROM raised`,
    [userId, type, issued],
  );
  if (type === DocumentType.WAYBILL)
    await manager.query(
      `UPDATE "users" SET "receipt_counter" = GREATEST("receipt_counter", $2) WHERE "id" = $1`,
      [userId, value],
    );
  return Number(value);
}
