/**
 * Minimum length for a password someone sets now (register, change password).
 * Login deliberately accepts shorter input so accounts created under the old minimum of 6
 * can still sign in.
 */
export const MIN_PASSWORD_LENGTH = 8;
