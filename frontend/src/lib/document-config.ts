import { isAxiosError } from "axios";
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
export type DocumentConfig = {
  schemaVersion: 1;
  company: Record<(typeof companyFields)[number], string>;
  templateId: string;
  documentLanguage: "en" | "ru" | "uk";
  title: { mode: "automatic" } | { mode: "custom"; text: string };
  footerTitle: string;
  footerSubtitle: string;
  primaryColor: string;
  paymentTerms: string;
  deliveryTerms: string;
  logo: {
    assetId: string | null;
    visible: boolean;
    size: "auto" | number;
    alignment: "auto" | "left" | "center" | "right";
  };
  visibility: Record<(typeof contactFields)[number], boolean>;
  formatting: {
    numberLocale: DocumentLocale;
    currencyDisplay: "symbol" | "narrowSymbol" | "code";
    dateLocale: "document" | DocumentLocale;
    dateStyle: "numeric" | "short" | "medium" | "long";
    timeStyle: "none" | "short" | "medium";
    hourCycle: "h12" | "h23";
    timeZone: string;
  };
};
export type ConfigVersion = { config: DocumentConfig; revision: number };
export type DocumentDraft = {
  config: DocumentConfig;
  logoAction: "keep" | "replace" | "remove";
};
export type PresetSummary = {
  id: string;
  name: string;
  revision: number;
  updated_at: string;
};
export type Preset = PresetSummary & { config: DocumentConfig };
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

/** Keep validation/conflict details, including PDF endpoints' blob error responses. */
export async function documentError(error: unknown): Promise<string> {
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
      if (typeof value === "string") return value.slice(0, 500);
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
