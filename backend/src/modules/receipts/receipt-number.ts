import { EntityManager, QueryFailedError } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import { DocumentType } from "./entities/receipt.entity";
import { issueDateIn } from "./frozen-document";
import {
  BUMP_COUNTER,
  BUMP_WAYBILL_COUNTER,
  HIGHEST_ISSUED_IN_YEAR,
  MAX_ACCEPTED_ISSUED_VALUE,
  MAX_COUNTER_DIGITS,
  RAISE_YEAR_COUNTER,
  RELEASE_COUNTER,
  RELEASE_WAYBILL_COUNTER,
  RELEASE_YEAR_COUNTER,
} from "./receipt-number-sql";

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

/** The prefix ends in a letter or digit, so the number would run into it without a separator. */
const RUNS_INTO_NUMBER = /[\p{L}\p{N}]$/u;

/** Inserted when a prefix such as "КП" (spaces are trimmed on save) does not end in a separator. */
const PREFIX_SEPARATOR = "-";

/**
 * Prints a counter value, e.g. "РФ-2026-000043". A prefix that ends in a letter gets a
 * "-" before the rest ("КП" prints "КП-2026-000043"); one that ends in a separator
 * ("РФ-", "A.") is used as typed. The prefix never ends with a digit, so the number always
 * ends in one digit run that is exactly the value: different formats cannot print the
 * same text for different values. Applies to new draws only; issued numbers stay as printed.
 */
export function formatDocumentNumber(
  format: NumberFormat,
  value: number,
  year: number,
): string {
  const separator = RUNS_INTO_NUMBER.test(format.prefix)
    ? PREFIX_SEPARATOR
    : "";
  const yearPart = format.includeYear ? `${year}-` : "";
  return `${format.prefix}${separator}${yearPart}${String(value).padStart(format.padding, "0")}`;
}

// PostgreSQL SQLSTATE numeric_value_out_of_range.
const NUMERIC_OUT_OF_RANGE = "22003";

function isNumericOverflow(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError: { code?: unknown } = error.driverError ?? {};
  return driverError.code === NUMERIC_OUT_OF_RANGE;
}

export interface DrawnNumber {
  number: string;
  /** The counter value behind the number, for `releaseDocumentNumber`. */
  value: number;
  /** Set when the number came from a yearly counter: the year to release it from. */
  year?: number;
}

interface CounterRow {
  value: number;
  prefix: string;
  padding: number;
  include_year: boolean;
  reset_every_year: boolean;
}

async function drawCounterRows(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  year: number,
): Promise<CounterRow[]> {
  try {
    return await manager.query(
      type === DocumentType.WAYBILL ? BUMP_WAYBILL_COUNTER : BUMP_COUNTER,
      [userId, type, year],
    );
  } catch (error) {
    // The counter already stands at the integer maximum: no further number exists.
    if (isNumericOverflow(error))
      throw ApiErrors.DOCUMENT_NUMBERS_EXHAUSTED(type);
    throw error;
  }
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
 * With the yearly reset on, the same statement bumps the counter of the document's year
 * (`document_year_counters`), creating it above the start number and the numbers already
 * issued that year, so the first draw of a new year and a retry across midnight cannot
 * repeat a number or skip one.
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
  const year = documentYear(options.now ?? new Date(), options.timeZone);
  const rows = await drawCounterRows(manager, userId, type, year);
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
    year,
  );
  return { number, value, ...(row.reset_every_year ? { year } : {}) };
}

/**
 * Gives back a number that never reached a committed document, so a refused or failed
 * generation does not leave a gap in the sequence. Works by value, not by text, so it is
 * independent of the format. Only possible while the counter still stands at that value:
 * if another generation took the next one in the meantime, the gap stays (renumbering
 * later documents would be worse). A number from a yearly counter goes back to that year.
 */
export async function releaseDocumentNumber(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  value: number,
  year?: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(value) || value < 1) return false;
  const rows: unknown[] =
    year !== undefined
      ? await manager.query(RELEASE_YEAR_COUNTER, [userId, type, value, year])
      : await manager.query(
          type === DocumentType.WAYBILL
            ? RELEASE_WAYBILL_COUNTER
            : RELEASE_COUNTER,
          [userId, type, value],
        );
  return rows.length > 0;
}

/** The highest counter value among the numbers an account issued in one year (0 for none). */
export async function highestIssuedInYear(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  year: number,
): Promise<number> {
  const [{ highest }]: Array<{ highest: string | null }> = await manager.query(
    HIGHEST_ISSUED_IN_YEAR,
    [userId, type, year],
  );
  return Number(highest ?? 0);
}

/**
 * Self-heal for a counter that fell behind the numbers actually issued (a restored backup,
 * a hand-edited row, an old image): raises it to the highest counter value found in the
 * account's numbers of that type. Locks the counter row first, then (waybill) the user row,
 * the order the draw takes them in. Never lowers anything. With the yearly reset on it
 * raises the counter of `year` to the numbers issued in that year.
 */
export async function raiseCounterToIssued(
  manager: EntityManager,
  userId: string,
  type: DocumentType,
  year?: number,
): Promise<number> {
  await manager.query(
    `INSERT INTO "document_counters" ("user_id", "document_type") VALUES ($1, $2)
     ON CONFLICT ("user_id", "document_type") DO NOTHING`,
    [userId, type],
  );
  const [counter]: Array<{ reset_every_year: boolean; start_number: number }> =
    await manager.query(
      `SELECT "reset_every_year", "start_number" FROM "document_counters"
       WHERE "user_id" = $1 AND "document_type" = $2 FOR UPDATE`,
      [userId, type],
    );
  if (counter.reset_every_year && year !== undefined) {
    const [{ value }]: Array<{ value: number }> = await manager.query(
      RAISE_YEAR_COUNTER,
      [userId, type, year, counter.start_number],
    );
    return Number(value);
  }
  // The counter value is the trailing digit run of a number (see formatDocumentNumber);
  // read all of it: the start number allows 10 digits (MAX_START_NUMBER is 2e9).
  const [{ highest }]: Array<{ highest: string | null }> = await manager.query(
    `SELECT MAX(("m")[1]::bigint) AS highest
     FROM (
       SELECT regexp_match("number", '([0-9]{1,${MAX_COUNTER_DIGITS}})$') AS "m" FROM "receipts"
       WHERE "user_id" = $1 AND "document_type" = $2
     ) AS "numbers" WHERE "m" IS NOT NULL AND ("m")[1]::bigint <= ${MAX_ACCEPTED_ISSUED_VALUE}`,
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
