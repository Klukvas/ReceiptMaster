import { ApiErrors } from "../errors/ApiError";

/**
 * `@IsOptional` lets null through a PATCH DTO. Only the nullable columns listed
 * in `clearableFields` may be cleared with it; null for any other field is a
 * 400 here instead of a NOT NULL violation (500) in the database.
 */
export function assertNoNullForRequiredFields(
  fields: object,
  clearableFields: ReadonlySet<string>,
): void {
  const cleared = Object.entries(fields).find(
    ([key, value]) => value === null && !clearableFields.has(key),
  );
  if (cleared) {
    throw ApiErrors.VALIDATION_ERROR(
      cleared[0],
      `${cleared[0]} cannot be null`,
    );
  }
}
