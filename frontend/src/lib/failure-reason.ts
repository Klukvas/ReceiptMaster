/**
 * The backend stores an English sentence in `error_message`. Known sentences map to a translation
 * key; anything else gets the generic text, so a raw server message never reaches the page.
 */
const KNOWN_REASONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/stopped/i, "documents.failureReasons.stopped"],
  [/frozen candidate missing|reconstruction/i, "documents.failureReasons.reconstruction"],
  [/generation failed|retry uses the frozen candidate/i, "documents.failureReasons.generationFailed"],
];

/** Texts that tell the user to try again, and their wording for a document that offers no retry. */
const NO_RETRY_VARIANTS: Readonly<Record<string, string>> = {
  "documents.failureReasons.generationFailed": "documents.failureReasons.generationFailedFinal",
  "documents.failureReasons.unknown": "documents.failureReasons.unknownFinal",
};

/**
 * `canRetry` is false for a document whose failure is final (a return note is issued anew
 * instead), so the reason never suggests a retry the page does not offer.
 */
export function failureReasonKey(message: string | null | undefined, canRetry = true): string {
  const known = KNOWN_REASONS.find(([pattern]) => pattern.test(message ?? ""));
  const key = known ? known[1] : "documents.failureReasons.unknown";
  return canRetry ? key : (NO_RETRY_VARIANTS[key] ?? key);
}
