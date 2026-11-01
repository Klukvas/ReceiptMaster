import { Transform } from "class-transformer";

/** Trims surrounding whitespace so a name of only spaces fails `@IsNotEmpty()`. */
export const Trimmed = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

export const PHONE_PATTERN = /^\+?[\d\s().-]{5,}$/;
export const PHONE_PATTERN_MESSAGE =
  "phone must contain only digits, spaces and + ( ) . -";

/** Postgres `integer` upper bound; larger values would be rejected by the database with a 500. */
export const MAX_INT4 = 2_147_483_647;
