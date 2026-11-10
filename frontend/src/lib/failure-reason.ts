/**
 * The backend stores an English sentence in `error_message`. Known sentences map to a translation
 * key; anything else gets the generic text, so a raw server message never reaches the page.
 */
const KNOWN_REASONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/stopped/i, "documents.failureReasons.stopped"],
  [/frozen candidate missing|reconstruction/i, "documents.failureReasons.reconstruction"],
  [/generation failed|retry uses the frozen candidate/i, "documents.failureReasons.generationFailed"],
];

export function failureReasonKey(message: string | null | undefined): string {
  const known = KNOWN_REASONS.find(([pattern]) => pattern.test(message ?? ""));
  return known ? known[1] : "documents.failureReasons.unknown";
}
