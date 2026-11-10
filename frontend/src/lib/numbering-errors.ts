import { isAxiosError } from "axios";
import i18n from "./i18n";
import { ErrorCode, parseApiError } from "./api-errors";
import { PREFIX_MAX_LENGTH } from "./document-number-format";

export type NumberingField = "prefix" | "padding" | "startNumber" | "resetEveryYear";

export type NumberingRefusal = {
  /** The field the server pointed at, or null for a problem with the request as a whole. */
  field: NumberingField | null;
  message: string;
  /** Present on NUMBERING_START_TOO_LOW: the lowest start the server accepts now. */
  minStart?: number;
};

const FIELD_NAMES: readonly NumberingField[] = ["prefix", "padding", "startNumber", "resetEveryYear"];

type StartTooLowBody = { minStart?: unknown; details?: { minStart?: unknown } };

/** The lowest start the server accepts, at the body root or under `details`. */
const minStartOf = (error: unknown): number | undefined => {
  if (!isAxiosError(error)) return undefined;
  const body = error.response?.data as StartTooLowBody | undefined;
  const value = body?.minStart ?? body?.details?.minStart;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const validationMessage = (field: NumberingField | undefined): string => {
  if (field === "prefix") return i18n.t("numbering.errors.prefixRejected", { max: PREFIX_MAX_LENGTH });
  if (field === "padding") return i18n.t("numbering.errors.paddingInvalid");
  if (field === "startNumber") return i18n.t("numbering.errors.startInvalid");
  if (field === "resetEveryYear") return i18n.t("numbering.resetNeedsYear");
  return i18n.t("numbering.errors.rejected");
};

/**
 * Maps a refused numbering save to a field. A 409 NUMBERING_START_TOO_LOW belongs to the start
 * number; a 400 VALIDATION_ERROR names its field in the message ("Validation error for prefix: …").
 */
export function numberingRefusal(
  error: unknown,
  startTooLowMessage: (minStart: number) => string,
): NumberingRefusal {
  const parsed = parseApiError(error);
  if (parsed.code === ErrorCode.NUMBERING_START_TOO_LOW) {
    const minStart = minStartOf(error);
    return {
      field: "startNumber",
      message: minStart === undefined ? parsed.message : startTooLowMessage(minStart),
      minStart,
    };
  }
  if (parsed.code === ErrorCode.VALIDATION_ERROR) {
    const field = FIELD_NAMES.find((name) => new RegExp(`\\b${name}\\b`).test(parsed.message));
    // The server's sentence is English, so the text comes from the locale files by field.
    return { field: field ?? null, message: validationMessage(field) };
  }
  return { field: null, message: parsed.message };
}
