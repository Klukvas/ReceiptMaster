import { Transform } from "class-transformer";

export const normalizeEmail = (value: unknown): unknown =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

/** Trims and lowercases the value before validation so one mailbox is one account. */
export const NormalizedEmail = (): PropertyDecorator =>
  Transform(({ value }) => normalizeEmail(value));
