import i18n from "./i18n";
import { documentError, type FieldLabel } from "./document-config";

/** `documentError` with domain refusals translated into the interface language. */
export function localizedDocumentError(
  error: unknown,
  fieldLabel?: FieldLabel,
): Promise<string> {
  return documentError(error, fieldLabel, (key) => i18n.t(key));
}
