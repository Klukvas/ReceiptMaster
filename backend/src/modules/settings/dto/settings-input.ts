import { z } from "zod";
import { ApiErrors } from "../../../common/errors/ApiError";
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
    })
    .refine(
      (value) => Object.values(value).some((field) => field !== undefined),
      "At least one company field is required",
    ),
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
