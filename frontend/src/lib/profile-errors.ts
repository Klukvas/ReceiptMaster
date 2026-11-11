import { isAxiosError } from "axios";

/** A translation key with its values, for a profile refusal the server words only in English. */
export type ProfileError = { key: string; options?: Record<string, number> };

/** Every sentence of a refusal body: `{ error }` may be one string or class-validator's list. */
function serverSentences(error: unknown): string[] {
  if (!isAxiosError(error)) return [];
  const body: unknown = error.response?.data;
  if (typeof body !== "object" || body === null) return [];
  const record = body as { error?: unknown; message?: unknown };
  return [record.error, record.message]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");
}

type Rule = {
  pattern: RegExp;
  error: (match: RegExpExecArray) => ProfileError;
};

/**
 * Refusals of PATCH /auth/profile and POST /auth/change-password, by their English sentence
 * ("Validation error for currentPassword: Current password is incorrect", "email must be an
 * email", "Password must be at least 8 characters long", …).
 */
const RULES: readonly Rule[] = [
  { pattern: /email must be an email/i, error: () => ({ key: "profile.errors.emailInvalid" }) },
  { pattern: /current password is incorrect/i, error: () => ({ key: "profile.errors.currentPasswordWrong" }) },
  { pattern: /must be different from the current/i, error: () => ({ key: "profile.errors.newPasswordSame" }) },
  { pattern: /do not match/i, error: () => ({ key: "errors.passwordsDoNotMatch" }) },
  {
    pattern: /at least (\d+) characters/i,
    error: (match) => ({ key: "errors.passwordTooShort", options: { min: Number(match[1]) } }),
  },
  {
    pattern: /at most (\d+) bytes/i,
    error: (match) => ({ key: "errors.passwordTooLong", options: { max: Number(match[1]) } }),
  },
];

/** The localized text for a profile or password refusal, or null when it is not one of these. */
export function profileError(error: unknown): ProfileError | null {
  for (const sentence of serverSentences(error)) {
    for (const rule of RULES) {
      const match = rule.pattern.exec(sentence);
      if (match) return rule.error(match);
    }
  }
  return null;
}
