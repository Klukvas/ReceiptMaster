export const SIGNOFF_MAX_BYTES = 2 * 1024 * 1024;
export const SIGNOFF_ACCEPTED_TYPES = ["image/png", "image/jpeg"] as const;

export type SignoffFileProblem = "empty" | "type" | "size";

/** Client check before upload; `accept=` only filters the file dialog, it does not validate. */
export function signoffFileProblem(file: Pick<File, "type" | "size">): SignoffFileProblem | null {
  // An empty file passes the type check by name but can never be decoded; say so instead of a vague 400.
  if (file.size === 0) return "empty";
  if (!(SIGNOFF_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > SIGNOFF_MAX_BYTES) return "size";
  return null;
}
