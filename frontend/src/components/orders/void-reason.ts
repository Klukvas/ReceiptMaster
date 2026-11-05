import type { TFunction } from "i18next";

/** Reasons the system itself writes (backend ORDER_CANCELLED_VOID_REASON); anything else was typed by a person. */
const SYSTEM_VOID_REASONS: ReadonlySet<string> = new Set(["order_cancelled"]);

export const voidReasonText = (t: TFunction, reason: string): string =>
  SYSTEM_VOID_REASONS.has(reason) ? t(`documents.voidReasons.${reason}`) : reason;
