import { Transform } from "class-transformer";

/** Trims surrounding whitespace so a name of only spaces fails `@IsNotEmpty()`. */
export const Trimmed = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

// Digits, spaces and + ( ) . - only; letters are what we reject, not short or partial numbers.
export const PHONE_PATTERN = /^\+?[\d\s().-]{3,}$/;
export const PHONE_PATTERN_MESSAGE =
  "phone must contain only digits, spaces and + ( ) . -";

/** Postgres `integer` upper bound; larger values would be rejected by the database with a 500. */
export const MAX_INT4 = 2_147_483_647;
