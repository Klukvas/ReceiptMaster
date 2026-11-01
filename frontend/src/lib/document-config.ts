import { isAxiosError } from "axios";
import type { components } from "./api-types.generated";
export const companyFields = [
  "companyName",
  "companyAddress",
  "companyEmail",
  "companyPhone",
  "companyTaxId",
  "companyIban",
  "companySwift",
  "companyWebsite",
  "companyTagline",
] as const;
export const contactFields = [
  "companyAddress",
  "companyEmail",
  "companyPhone",
  "companyTaxId",
  "companyIban",
  "companySwift",
  "companyWebsite",
  "recipientEmail",
  "recipientPhone",
  "recipientAddress",
] as const;
export const documentLocales = [
  "ru-RU",
  "en-US",
  "en-GB",
  "uk-UA",
  "de-DE",
  "fr-FR",
] as const;
export type DocumentLocale = (typeof documentLocales)[number];
// Wire types come from the backend contract (yarn openapi:generate).
export type DocumentConfig = components["schemas"]["DocumentConfig"];
export type ConfigVersion = components["schemas"]["DocumentConfigVersion"];
export type DocumentDraft = components["schemas"]["DocumentDraft"];
export type PresetSummary = components["schemas"]["DocumentPresetSummary"];
export type Preset = components["schemas"]["DocumentPreset"];
export type TemplateCapabilities = {
  revision: number;
  companyFields: string[];
  recipientFields: string[];
  money: boolean;
  accent: boolean;
  terms: boolean;
  generatedAt: boolean;
  paper: "A4" | "thermal";
  logo: {
    minWidth: number;
    maxWidth: number;
    maxHeight: number;
    alignments: Array<DocumentConfig["logo"]["alignment"]>;
  };
};
export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  locked: boolean;
  capabilities: TemplateCapabilities;
};
export function documentEnvelope(payload: unknown, file?: File): FormData {
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  if (file) body.append("logo", file);
  return body;
}
export function documentMoney(
  cents: number,
  currency: string,
  config: DocumentConfig["formatting"],
): string {
  return new Intl.NumberFormat(config.numberLocale, {
    style: "currency",
    currency,
    currencyDisplay: config.currencyDisplay,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function documentDate(
  date: string,
  language: string,
  config: DocumentConfig["formatting"],
): string {
  return new Intl.DateTimeFormat(
    config.dateLocale === "document"
      ? { en: "en-US", ru: "ru-RU", uk: "uk-UA" }[language] || "en-US"
      : config.dateLocale,
    {
      ...(config.dateStyle === "numeric"
        ? ({
            year: "numeric",
            month: "numeric",
            day: "numeric",
            ...(config.timeStyle !== "none"
              ? {
                  hour: "numeric",
                  minute: config.timeStyle === "short" ? "2-digit" : "numeric",
                  ...(config.timeStyle === "medium"
                    ? { second: "numeric" }
                    : {}),
                }
              : {}),
          } as const)
        : {
            dateStyle: config.dateStyle,
            ...(config.timeStyle !== "none"
              ? { timeStyle: config.timeStyle }
              : {}),
          }),
      hourCycle: config.hourCycle,
      timeZone: config.timeZone,
    },
  ).format(new Date(date));
}

const DOCUMENT_REVISION_CONFLICT = "DOCUMENT_REVISION_CONFLICT";

/** True only for a stale-revision conflict (someone saved first), not for other 409s such as limits. */
export function isDocumentRevisionConflict(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 409) return false;
  const body: unknown = error.response.data;
  return (
    typeof body === "object" &&
    body !== null &&
    "errorCode" in body &&
    body.errorCode === DOCUMENT_REVISION_CONFLICT
  );
}

/** Resolves a config field name (e.g. companyWebsite) to its label, or undefined when unknown. */
export type FieldLabel = (field: string) => string | undefined;

/** "Validation error for config.company.companyWebsite: Use a valid website" -> "Website: Use a valid website" */
export function readableValidationMessage(
  message: string,
  fieldLabel?: FieldLabel,
): string {
  const match = /^Validation error for ([\w.[\]]+): (.+)$/.exec(message);
  if (!match) return message;
  const field = match[1].split(".").pop() ?? match[1];
  const label = fieldLabel?.(field);
  return label ? `${label}: ${match[2]}` : match[2];
}

/** Keep validation/conflict details, including PDF endpoints' blob error responses. */
export async function documentError(
  error: unknown,
  fieldLabel?: FieldLabel,
): Promise<string> {
  if (isAxiosError(error)) {
    let body: unknown = error.response?.data;
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text());
      } catch {
        body = undefined;
      }
    }
    if (body && typeof body === "object") {
      const value =
        "error" in body
          ? body.error
          : "message" in body
            ? body.message
            : undefined;
      if (typeof value === "string")
        return readableValidationMessage(value, fieldLabel).slice(0, 500);
      if (
        Array.isArray(value) &&
        value.every((part) => typeof part === "string")
      )
        return value.join(". ").slice(0, 500);
    }
  }
  return error instanceof Error
    ? error.message
    : "Could not complete the operation. Your draft is kept.";
}
