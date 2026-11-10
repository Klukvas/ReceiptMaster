import { registerDecorator, ValidationOptions } from "class-validator";

/**
 * Minimum length for a password someone sets now (register, change password).
 * Login deliberately accepts shorter input so accounts created under the old minimum of 6
 * can still sign in.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * bcrypt hashes only the first 72 BYTES, so a longer new password would silently match
 * any password sharing its first 72 bytes. Counted in UTF-8 bytes, not characters:
 * a Cyrillic letter is 2 bytes, so 36 Cyrillic characters is the most that fits.
 */
export const MAX_PASSWORD_BYTES = 72;

export const PASSWORD_TOO_LONG_MESSAGE =
  `Password must be at most ${MAX_PASSWORD_BYTES} bytes in UTF-8 ` +
  `(Latin letters and digits take 1 byte each, Cyrillic letters 2, emoji 4)`;

export const fitsPasswordByteLimit = (value: unknown): boolean =>
  typeof value === "string" &&
  Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES;

/** A new password must fit in what bcrypt actually hashes. */
export function MaxPasswordBytes(
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: "maxPasswordBytes",
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: PASSWORD_TOO_LONG_MESSAGE, ...options },
      validator: { validate: fitsPasswordByteLimit },
    });
}
