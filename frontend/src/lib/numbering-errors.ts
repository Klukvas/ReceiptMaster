import { isAxiosError } from "axios";
import { ErrorCode, parseApiError } from "./api-errors";

export type NumberingField = "prefix" | "padding" | "startNumber";

export type NumberingRefusal = {
  /** The field the server pointed at, or null for a problem with the request as a whole. */
  field: NumberingField | null;
  message: string;
  /** Present on NUMBERING_START_TOO_LOW: the lowest start the server accepts now. */
  minStart?: number;
};

const FIELD_NAMES: readonly NumberingField[] = ["prefix", "padding", "startNumber"];

const minStartOf = (error: unknown): number | undefined => {
  if (!isAxiosError(error)) return undefined;
  const value = (error.response?.data as { minStart?: unknown } | undefined)?.minStart;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
    return { field: field ?? null, message: parsed.message };
  }
  return { field: null, message: parsed.message };
}
