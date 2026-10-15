import { z } from "zod";
import { TEMPLATE_METADATA } from "../receipts/templates/metadata";
import { UserSettings } from "./entities/user-settings.entity";
import { parseSettingsInput } from "./dto/settings-input";

export const COMPANY_FIELDS = [
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
export const CONTACT_FIELDS = [
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
export const LOCALES = [
  "ru-RU",
  "en-US",
  "en-GB",
  "uk-UA",
  "de-DE",
  "fr-FR",
] as const;
export const formattingSchema = z
  .object({
    numberLocale: z.enum(LOCALES),
    currencyDisplay: z.enum(["symbol", "narrowSymbol", "code"]),
    dateLocale: z.enum(["document", ...LOCALES]),
    dateStyle: z.enum(["numeric", "short", "medium", "long"]),
    timeStyle: z.enum(["none", "short", "medium"]),
    hourCycle: z.enum(["h12", "h23"]),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return !/^[+-]/.test(value);
        } catch {
          return false;
        }
      }, "Use a valid IANA time zone"),
  })
  .strict();
const companySchema = z
  .object({
    companyName: z.string().max(200),
    companyAddress: z.string().max(500),
    companyEmail: z.union([z.literal(""), z.string().email().max(254)]),
    companyPhone: z.string().max(100),
    companyTaxId: z.string().max(100),
    companyIban: z.string().max(100),
    companySwift: z.string().max(100),
    companyWebsite: z
      .string()
      .max(500)
      .refine(
        (value) => !value || /^(https?:\/\/)?[^\s/:]+\.[^\s]+$/i.test(value),
        "Use a valid website",
      ),
    companyTagline: z.string().max(500),
  })
  .strict();
export const documentConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    company: companySchema,
    templateId: z
      .string()
      .refine(
        (id) => Object.prototype.hasOwnProperty.call(TEMPLATE_METADATA, id),
        "Unknown template",
      ),
    documentLanguage: z.enum(["en", "ru", "uk"]),
    title: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("automatic") }).strict(),
      z
        .object({
          mode: z.literal("custom"),
          text: z
            .string()
            .max(200)
            .refine(
              (value) => value.trim().length > 0,
              "Enter a title or select Automatic title",
            ),
        })
        .strict(),
    ]),
    footerTitle: z.string().max(500),
    footerSubtitle: z.string().max(500),
    primaryColor: z.string().regex(/^#[a-f0-9]{6}$/i),
    paymentTerms: z.string().max(500),
    deliveryTerms: z.string().max(500),
    logo: z
      .object({
        assetId: z.string().uuid().nullable(),
        visible: z.boolean(),
        size: z.union([z.literal("auto"), z.number().int().min(24).max(200)]),
        alignment: z.enum(["auto", "left", "center", "right"]),
      })
      .strict(),
    visibility: z
      .object(
        Object.fromEntries(
          CONTACT_FIELDS.map((field) => [field, z.boolean()]),
        ) as Record<(typeof CONTACT_FIELDS)[number], z.ZodBoolean>,
      )
      .strict(),
    formatting: formattingSchema,
  })
  .strict();
export type RequiredShape<T> =
  T extends Array<infer U>
    ? Array<RequiredShape<U>>
    : T extends object
      ? { [K in keyof T]-?: RequiredShape<T[K]> }
      : T;
export type DocumentConfig = RequiredShape<
  z.infer<typeof documentConfigSchema>
>;
export type Formatting = DocumentConfig["formatting"];
export const draftSchema = z
  .object({
    config: documentConfigSchema,
    logoAction: z.enum(["keep", "replace", "remove"]).default("keep"),
  })
  .strict();
export const saveSchema = draftSchema
  .extend({ expectedRevision: z.number().int().min(0).max(2147483646) })
  .strict();
export const presetName = z.string().trim().min(1).max(80);
export const presetCreateSchema = draftSchema
  .extend({ name: presetName })
  .strict();
export const presetUpdateSchema = presetCreateSchema
  .extend({ expectedRevision: z.number().int().min(1).max(2147483646) })
  .strict();
export const revisionSchema = z
  .object({ expectedRevision: z.number().int().min(1).max(2147483646) })
  .strict();
export type DocumentDraft = RequiredShape<z.infer<typeof draftSchema>>;
export const selectionSchema = z
  .object({
    config: documentConfigSchema.optional(),
    presetId: z.string().uuid().optional(),
    presetRevision: z.number().int().positive().optional(),
    overrides: documentConfigSchema.deepPartial().optional(),
    logoAction: z.enum(["keep", "replace", "remove"]).default("keep"),
  })
  .strict()
  .refine((v) => !v.config || !v.presetId, "Choose a config or a preset");
export type ConfigSelection = {
  config?: DocumentConfig;
  presetId?: string;
  presetRevision?: number;
  overrides?: z.infer<typeof documentConfigSchema>;
  logoAction: "keep" | "replace" | "remove";
};
export function parseConfig<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): RequiredShape<z.output<S>> {
  return parseSettingsInput(schema, value) as RequiredShape<z.output<S>>;
}
export function legacyConfig(settings: UserSettings | null): DocumentConfig {
  const language = ["en", "ru", "uk"].includes(settings?.templateLanguage)
    ? (settings.templateLanguage as DocumentConfig["documentLanguage"])
    : "en";
  return {
    schemaVersion: 1,
    company: Object.fromEntries(
      COMPANY_FIELDS.map((field) => [field, settings?.[field] || ""]),
    ) as DocumentConfig["company"],
    templateId: settings?.templateId || "standard",
    documentLanguage: language,
    title: settings?.receiptTitle?.trim()
      ? { mode: "custom", text: settings.receiptTitle }
      : { mode: "automatic" },
    footerTitle: settings?.footerText || "",
    footerSubtitle: settings?.subFooterText || "",
    primaryColor: settings?.primaryColor || "#3B82F6",
    paymentTerms: settings?.paymentTerms || "",
    deliveryTerms: settings?.deliveryTerms || "",
    logo: { assetId: null, visible: true, size: "auto", alignment: "auto" },
    visibility: Object.fromEntries(
      CONTACT_FIELDS.map((field) => [field, true]),
    ) as DocumentConfig["visibility"],
    formatting: {
      numberLocale: "ru-RU",
      currencyDisplay: "symbol",
      dateLocale: "document",
      dateStyle: "numeric",
      timeStyle: "medium",
      hourCycle: language === "en" ? "h12" : "h23",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  };
}
export function legacyColumns(config: DocumentConfig): Partial<UserSettings> {
  return {
    ...config.company,
    templateId: config.templateId,
    templateLanguage: config.documentLanguage,
    receiptTitle: config.title.mode === "custom" ? config.title.text : null,
    footerText: config.footerTitle,
    subFooterText: config.footerSubtitle,
    primaryColor: config.primaryColor,
    paymentTerms: config.paymentTerms,
    deliveryTerms: config.deliveryTerms,
  };
}
export function mergeConfig(
  base: DocumentConfig,
  override: ConfigSelection["overrides"],
): DocumentConfig {
  if (!override) return base;
  return parseConfig(documentConfigSchema, {
    ...base,
    ...override,
    company: { ...base.company, ...override.company },
    logo: { ...base.logo, ...override.logo },
    visibility: { ...base.visibility, ...override.visibility },
    formatting: { ...base.formatting, ...override.formatting },
    title: override.title || base.title,
  });
}
