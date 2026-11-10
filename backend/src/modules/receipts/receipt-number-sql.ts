/**
 * The SQL behind `receipt-number.ts`. A bare UPDATE ... RETURNING comes back from the
 * postgres driver as `[rows, count]`, so every statement here that is read as rows is
 * wrapped: a CTE UPDATE followed by a SELECT answers with the plain row array.
 */

/** Digits of the largest counter value: MAX_START_NUMBER (2e9) plus the numbers drawn after it. */
export const MAX_COUNTER_DIGITS = 10;

/** The counter column is a 32-bit integer; a longer digit run in a hand-made number cannot be a counter value. */
export const MAX_COUNTER_VALUE = 2_147_483_647;

/**
 * The highest issued value a counter is raised to. One below the integer maximum, so the
 * draw after a raise (value + 1) still fits the column; a hand-made number at the maximum
 * is ignored rather than raising the counter to a value no draw can follow.
 */
export const MAX_ACCEPTED_ISSUED_VALUE = MAX_COUNTER_VALUE - 1;

/**
 * The highest counter value among the numbers issued in one year. With the year in the
 * number (a yearly reset requires it) a number ends in "YYYY-<value>", the year being a
 * 4-digit run that does not continue a longer one.
 */
export const issuedInYear = (user: string, type: string, year: string) => `
  SELECT MAX(("m")[2]::bigint) AS "highest"
  FROM (
    SELECT regexp_match("number", '(?:^|[^0-9])([0-9]{4})-([0-9]{1,${MAX_COUNTER_DIGITS}})$') AS "m"
    FROM "receipts" WHERE "user_id" = ${user} AND "document_type" = ${type}
  ) AS "numbers"
  WHERE "m" IS NOT NULL AND ("m")[1]::int = ${year}
    AND ("m")[2]::bigint <= ${MAX_ACCEPTED_ISSUED_VALUE}`;

export const HIGHEST_ISSUED_IN_YEAR = issuedInYear("$1", "$2", "$3::int");

const RETURNED_COLUMNS = `"user_id", "document_type", "value", "prefix", "padding", "include_year", "reset_every_year", "start_number"`;

/**
 * The year counter of the draw, created by the first draw of a year above the start
 * number and above the highest number of that year already issued (the lookup runs only
 * when the row is missing), bumped by every later one. Concurrent first draws meet on the
 * primary key: the loser takes the conflict branch and bumps. Reads the format `base` row.
 */
const YEARLY_DRAW = `
  yearly AS (
    INSERT INTO "document_year_counters" ("user_id", "document_type", "year", "value")
    SELECT b."user_id", b."document_type", $3::int,
           GREATEST(b."start_number" - 1, COALESCE(f."highest", 0)) + 1
    FROM base b
    LEFT JOIN LATERAL (
      ${issuedInYear('b."user_id"', 'b."document_type"', "$3::int")}
        AND NOT EXISTS (
          SELECT 1 FROM "document_year_counters" y
          WHERE y."user_id" = b."user_id" AND y."document_type" = b."document_type"
            AND y."year" = $3::int)
    ) f ON true
    WHERE b."reset_every_year"
    ON CONFLICT ("user_id", "document_type", "year")
    DO UPDATE SET "value" = "document_year_counters"."value" + 1
    RETURNING "value"
  )`;

const DRAWN_ROW = `
  SELECT COALESCE((SELECT "value" FROM yearly), b."value") AS "value",
         b."prefix", b."padding", b."include_year", b."reset_every_year"
  FROM base b`;

// With the yearly reset on the flat counter is left alone (the draw only reads the format).
export const BUMP_COUNTER = `
  WITH base AS (
    INSERT INTO "document_counters" ("user_id", "document_type", "value")
    VALUES ($1, $2, 1)
    ON CONFLICT ("user_id", "document_type")
    DO UPDATE SET "value" = "document_counters"."value"
      + CASE WHEN "document_counters"."reset_every_year" THEN 0 ELSE 1 END
    RETURNING ${RETURNED_COLUMNS}
  ), ${YEARLY_DRAW}
  ${DRAWN_ROW}`;

// Counts from the higher of the two counters: an image rolled back and rolled forward
// again leaves `users.receipt_counter` ahead of the new table, and the older image only
// ever writes the old one. With the yearly reset on, the legacy counter is neither read nor written.
export const BUMP_WAYBILL_COUNTER = `
  WITH base AS (
    INSERT INTO "document_counters" ("user_id", "document_type", "value")
    SELECT "id", $2, "receipt_counter" + 1 FROM "users" WHERE "id" = $1
    ON CONFLICT ("user_id", "document_type")
    DO UPDATE SET "value" = CASE WHEN "document_counters"."reset_every_year"
      THEN "document_counters"."value"
      ELSE GREATEST("document_counters"."value", EXCLUDED."value" - 1) + 1 END
    RETURNING ${RETURNED_COLUMNS}
  ), ${YEARLY_DRAW}, legacy AS (
    UPDATE "users" SET "receipt_counter" = base."value"
    FROM base WHERE "users"."id" = $1 AND NOT base."reset_every_year"
  )
  ${DRAWN_ROW}`;

export const RELEASE_COUNTER = `
  WITH released AS (
    UPDATE "document_counters" SET "value" = "value" - 1
    WHERE "user_id" = $1 AND "document_type" = $2 AND "value" = $3
    RETURNING "value"
  )
  SELECT "value" FROM released`;

export const RELEASE_WAYBILL_COUNTER = `
  WITH released AS (
    UPDATE "document_counters" SET "value" = "value" - 1
    WHERE "user_id" = $1 AND "document_type" = $2 AND "value" = $3
    RETURNING "value"
  ), legacy AS (
    UPDATE "users" SET "receipt_counter" = "receipt_counter" - 1
    WHERE "id" = $1 AND "receipt_counter" = $3 AND EXISTS (SELECT 1 FROM released)
  )
  SELECT "value" FROM released`;

export const RELEASE_YEAR_COUNTER = `
  WITH released AS (
    UPDATE "document_year_counters" SET "value" = "value" - 1
    WHERE "user_id" = $1 AND "document_type" = $2 AND "year" = $4 AND "value" = $3
    RETURNING "value"
  )
  SELECT "value" FROM released`;

/** Raises the counter of one year to the numbers issued in it (and at least to the start number minus one). */
export const RAISE_YEAR_COUNTER = `
  WITH issued AS (${HIGHEST_ISSUED_IN_YEAR}),
  raised AS (
    INSERT INTO "document_year_counters" ("user_id", "document_type", "year", "value")
    SELECT $1, $2::receipts_document_type_enum, $3::int,
           GREATEST($4::int - 1, COALESCE((SELECT "highest" FROM issued), 0))
    ON CONFLICT ("user_id", "document_type", "year")
    DO UPDATE SET "value" = GREATEST("document_year_counters"."value", EXCLUDED."value")
    RETURNING "value"
  )
  SELECT "value" FROM raised`;
