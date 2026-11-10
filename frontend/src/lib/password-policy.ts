/** Must match MIN_PASSWORD_LENGTH in backend/src/modules/users/dto/password-policy.ts. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Must match MAX_PASSWORD_BYTES in backend/src/modules/users/dto/password-policy.ts (register and
 * change password): bcrypt hashes only the first 72 bytes, so the limit counts UTF-8 bytes, not
 * characters. A Latin letter or digit is 1 byte, a Cyrillic letter 2, an emoji 4.
 */
export const MAX_PASSWORD_BYTES = 72;

const encoder = new TextEncoder();

/** The password's size as the server counts it. */
export const passwordByteLength = (password: string): number => encoder.encode(password).length;

export const exceedsPasswordBytes = (password: string): boolean =>
  passwordByteLength(password) > MAX_PASSWORD_BYTES;
