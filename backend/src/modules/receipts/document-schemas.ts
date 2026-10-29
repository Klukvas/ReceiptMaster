import { z } from "zod";
import { draftSchema, selectionSchema } from "../settings/document-config";

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
