import type { SignoffKind } from "../../common/services/signoff-image";

/**
 * A non-blocking note attached to the response that issued a document. The document is
 * issued either way; the warning tells the user what is missing from it. Not stored.
 */
export type DocumentWarning = {
  code: "SIGNOFF_UNAVAILABLE";
  /** The images that are set on the account but could not be printed. */
  kinds: SignoffKind[];
  message: string;
};

export function signoffUnavailableWarning(
  kinds: readonly SignoffKind[],
): DocumentWarning[] {
  if (kinds.length === 0) return [];
  return [
    {
      code: "SIGNOFF_UNAVAILABLE",
      kinds: [...kinds],
      message:
        "The signature or stamp image could not be read; the document was issued without it.",
    },
  ];
}
