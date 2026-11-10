import { isAxiosError } from "axios";
import type { TFunction } from "i18next";
import { validationField } from "../../lib/api-errors";

/** Reasons the system itself writes (backend ORDER_CANCELLED_VOID_REASON); anything else was typed by a person. */
const SYSTEM_VOID_REASONS: ReadonlySet<string> = new Set(["order_cancelled"]);

export const voidReasonText = (t: TFunction, reason: string): string =>
  SYSTEM_VOID_REASONS.has(reason) ? t(`documents.voidReasons.${reason}`) : reason;

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

/** The document's state no longer allows voiding (still generating, failed); trying again cannot help. */
export function isNotVoidableRefusal(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== HTTP_CONFLICT) return false;
  const code = (error.response.data as { errorCode?: unknown } | undefined)?.errorCode;
  return code === "DOCUMENT_NOT_VOIDABLE";
}

/**
 * True when a refused void blames the reason field: either by name ("Validation error for reason")
 * or as a class-validator sentence that starts with it ("reason must be shorter than …").
 */
export function isVoidReasonRefusal(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== HTTP_BAD_REQUEST) return false;
  if (validationField(error) === "reason") return true;
  const message = (error.response.data as { error?: unknown } | undefined)?.error;
  const parts = Array.isArray(message) ? message : [message];
  return parts.some((part) => typeof part === "string" && /^reason\b/.test(part));
}
