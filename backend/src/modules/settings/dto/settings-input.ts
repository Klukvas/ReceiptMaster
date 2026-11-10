import { z } from "zod";
import { ApiErrors } from "../../../common/errors/ApiError";
import {
  TAX_ID_KINDS,
  isValidTaxId,
  isValidVatId,
} from "../../../common/utils/ua-requisites.util";
import { TEMPLATE_METADATA } from "../../receipts/templates/metadata";

const text = (max: number) => z.string().max(max);
const website = text(500).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return (
      !url.username &&
      !url.password &&
      /^https?:$/.test(url.protocol) &&
      url.hostname.includes(".") &&
      !/[\s:]/.test(url.hostname)
    );
  } catch {
    return false;
  }
}, "Must be an HTTP(S) website");

// Requisites are nullable (null = not specified) and an empty string means the same.
const requisiteText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const vatId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine(
    (value) => value === null || isValidVatId(value),
    "Must be 10 or 12 digits",
  )
  .optional();

export const settingsInput = {
  template: z.object({
    templateId: z
      .string()
      .min(1)
      .refine(
        (id) => Object.prototype.hasOwnProperty.call(TEMPLATE_METADATA, id),
        "Unknown template",
      ),
  }),
  language: z.object({ language: z.enum(["en", "ru", "uk"]) }),
  autoReceipt: z.object({ enabled: z.boolean() }).strict(),
  title: z.object({ title: text(200) }),
  footerTitle: z.object({ footerTitle: text(500) }),
  footerSubtitle: z.object({ footerSubtitle: text(500) }),
  footer: z.object({ footerTitle: text(500), footerSubtitle: text(500) }),
  color: z.object({
    primaryColor: z.union([
      z.literal(""),
      z
        .string()
        .regex(/^#[0-9a-f]{6}$/i, "Must be a valid hex color (#RRGGBB)"),
    ]),
  }),
  payment: z.object({ paymentTerms: text(500) }),
  delivery: z.object({ deliveryTerms: text(500) }),
  company: z
    .object({
      companyName: text(200).optional(),
      companyAddress: text(500).optional(),
      companyEmail: z
        .union([z.literal(""), z.string().email().max(254)])
        .optional(),
      companyPhone: text(100).optional(),
      companyTaxId: text(100).optional(),
      companyIban: text(100).optional(),
      companySwift: text(100).optional(),
      companyWebsite: website.optional(),
      companyTagline: text(500).optional(),
      companyTaxIdKind: z.enum(TAX_ID_KINDS).nullable().optional(),
      companyLegalForm: requisiteText(64),
      companyBankName: requisiteText(200),
      companyVatPayer: z.boolean().nullable().optional(),
      companyVatId: vatId,
      companySignatoryName: requisiteText(255),
      companySignatoryPosition: requisiteText(255),
      defaultPaymentTermDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .nullable()
        .optional(),
    })
    .refine(
      (value) => Object.values(value).some((field) => field !== undefined),
      "At least one company field is required",
    )
    .superRefine((value, context) => {
      // The stored tax id is historical free text, so the format is only enforced when
      // the caller sends a kind together with a number.
      const { companyTaxIdKind: kind, companyTaxId: taxId } = value;
      if (kind && taxId && !isValidTaxId(taxId, kind)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companyTaxId"],
          message:
            kind === "edrpou"
              ? "ЄДРПОУ must be 8 digits"
              : "РНОКПП must be 10 digits",
        });
      }
    }),
};

export function parseSettingsInput<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw ApiErrors.VALIDATION_ERROR(
      issue.path.join(".") || "body",
      issue.message,
    );
  }
  return result.data;
}
