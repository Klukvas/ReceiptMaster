import { z } from "zod";
import { draftSchema, selectionSchema } from "../settings/document-config";
import { DocumentType } from "./entities/receipt.entity";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-02-30` matches the shape but is not a day; Date rolls it over, so compare back. */
export function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

const calendarDate = z
  .string()
  .refine(isRealCalendarDate, "Must be a calendar date (YYYY-MM-DD)");

/** Invoice terms: an explicit due date or a number of days from issue, never both. */
export const invoiceDetailsSchema = z
  .object({
    dueDate: calendarDate.optional(),
    paymentTermDays: z.number().int().min(1).max(365).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.dueDate === undefined || value.paymentTermDays === undefined,
    "Choose dueDate or paymentTermDays, not both",
  );

export const actDetailsSchema = z
  .object({
    contractRef: z.string().trim().min(1).max(200).optional(),
    period: z
      .object({ from: calendarDate, to: calendarDate })
      .strict()
      .refine((value) => value.from <= value.to, "from must not be after to")
      .optional(),
  })
  .strict();

/** Body of POST /receipts/:id/regenerate (JSON or the multipart `payload` field). */
export const regenerationSchema = selectionSchema
  .innerType()
  .extend({
    mode: z.enum(["reproduce", "replace"]).default("reproduce"),
    expectedActiveRevision: z.number().int().min(0).max(2147483646).optional(),
    confirmReconstruction: z.boolean().optional(),
  })
  .strict();

/** Body of POST /receipts/preview (JSON or the multipart `payload` field). */
export const previewSchema = draftSchema
  .extend({ orderId: z.string().uuid().optional() })
  .strict();

const designFields = selectionSchema.innerType().shape;

/** Types accepted by the generic endpoint; the rest are rejected before the body is read. */
export const documentTypeProbe = z
  .object({ type: z.nativeEnum(DocumentType) })
  .passthrough();

const generationBase = (type: DocumentType) =>
  z.object({ type: z.literal(type), ...designFields }).strict();

/**
 * Body of POST /receipts/orders/:orderId/documents (JSON or the multipart `payload`
 * field). The union cannot carry the refine per member, so it is applied to the whole.
 */
export const documentGenerationSchema = z
  .discriminatedUnion("type", [
    generationBase(DocumentType.WAYBILL),
    generationBase(DocumentType.INVOICE).extend({
      details: invoiceDetailsSchema.default({}),
    }),
    generationBase(DocumentType.ACT).extend({
      details: actDetailsSchema.default({}),
    }),
    generationBase(DocumentType.SALES_RECEIPT),
    generationBase(DocumentType.PACKING_LIST),
  ])
  .refine((v) => !v.config || !v.presetId, "Choose a config or a preset");
