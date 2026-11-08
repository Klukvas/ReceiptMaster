import toast from "react-hot-toast";
import i18n from "./i18n";

type SignoffKind = "signature" | "stamp";

const WARNING_TOAST_MS = 12_000;

const isSignoffKind = (value: unknown): value is SignoffKind =>
  value === "signature" || value === "stamp";

/** Which images the server could not print, read from the `warnings` of an issue response (absent when none). */
export function unavailableSignoffKinds(result: unknown): SignoffKind[] {
  const warnings = (result as { warnings?: unknown } | null | undefined)?.warnings;
  if (!Array.isArray(warnings)) return [];
  const kinds = warnings.flatMap((warning) =>
    warning?.code === "SIGNOFF_UNAVAILABLE" && Array.isArray(warning.kinds)
      ? warning.kinds.filter(isSignoffKind)
      : [],
  );
  return [...new Set(kinds)];
}

/**
 * The document was issued, but without a signature or stamp whose file could not be read.
 * Said at issue time only: the warning is not stored, and the user must know to upload the image again.
 */
export function notifyIssueWarnings(result: unknown): void {
  const kinds = unavailableSignoffKinds(result);
  if (kinds.length === 0) return;
  const key = kinds.length === 2 ? "both" : kinds[0];
  toast(i18n.t(`signoff.unavailable.${key}`), { duration: WARNING_TOAST_MS, icon: "⚠️" });
}
