import { z } from "zod";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import {
  documentConfigSchema,
  draftSchema,
  presetCreateSchema,
  presetUpdateSchema,
  revisionSchema,
  saveSchema,
  selectionSchema,
} from "../modules/settings/document-config";
import { settingsInput } from "../modules/settings/dto/settings-input";
import {
  previewSchema,
  regenerationSchema,
} from "../modules/receipts/document-schemas";
import { ReceiptStatus } from "../modules/receipts/entities/receipt.entity";
import { TEMPLATE_METADATA } from "../modules/receipts/templates/metadata";
import type { SharedSchemaName } from "./api-docs.decorators";
import { OpenApiSchema, zodComponents } from "./zod-openapi";

/**
 * Shared OpenAPI components. Request schemas are the exact Zod schemas the routes
 * validate with; response schemas describe what the controllers return.
 */
const data = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema });

const configVersion = z.object({
  config: documentConfigSchema,
  revision: z.number().int().min(0),
});
const presetSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  revision: z.number().int().min(1),
  updated_at: z.string().datetime(),
});
const preset = z.object({
  id: z.string().uuid(),
  name: z.string(),
  revision: z.number().int().min(1),
  config: documentConfigSchema,
});

/** Mirrors `receiptProjection()`; a unit test keeps the two in step. */
export const receiptProjectionSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  number: z.string(),
  pdf_url: z.string().nullable(),
  hash: z.string().nullable(),
  status: z.nativeEnum(ReceiptStatus),
  template_id: z.string().nullable(),
  template_version: z.number().int().nullable(),
  progress: z.number().int(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
  voided_at: z.string().datetime().nullable(),
  void_reason: z.string().nullable(),
  public_token: z.string().nullable(),
  active_revision: z.number().int(),
  replacement_status: z.enum(["processing", "failed"]).nullable(),
  replacement_error: z.string().nullable(),
});

export const SHARED_SCHEMAS = {
  ApiErrorResponse: z.object({
    error: z.union([z.string(), z.array(z.string())]),
    errorCode: z.string(),
  }),
  MessageResponse: z.object({ message: z.string() }),
  DocumentConfig: documentConfigSchema,
  DocumentConfigOverrides: selectionSchema.innerType().shape.overrides.unwrap(),
  DocumentDraft: draftSchema,
  DocumentConfigSaveRequest: saveSchema,
  DocumentPresetCreateRequest: presetCreateSchema,
  DocumentPresetUpdateRequest: presetUpdateSchema,
  DocumentRevisionRequest: revisionSchema,
  DocumentSelectionRequest: selectionSchema,
  ReceiptRegenerationRequest: regenerationSchema,
  DocumentPreviewRequest: previewSchema,
  DocumentConfigVersion: configVersion,
  DocumentConfigVersionResponse: data(configVersion),
  DocumentPresetSummary: presetSummary,
  DocumentPresetListResponse: data(z.array(presetSummary)),
  DocumentPreset: preset,
  DocumentPresetResponse: data(preset),
  DocumentPresetDeletedResponse: data(z.object({ deleted: z.literal(true) })),
  ReceiptProjection: receiptProjectionSchema,
  ReceiptListResponse: z.object({
    data: z.array(receiptProjectionSchema),
    total: z.number().int(),
    offset: z.number().int(),
    limit: z.number().int(),
  }),
  // Documentation only: the handler reads `reason` without validating it, an omitted
  // reason leaves void_reason empty, and the column holds at most 500 characters.
  ReceiptVoidRequest: z.object({ reason: z.string().max(500).optional() }),
  ReceiptShareResponse: z.object({ token: z.string(), url: z.string() }),
  AutoReceiptRequest: settingsInput.autoReceipt,
  AutoReceiptResponse: data(z.object({ enabled: z.boolean() })),
  FooterUpdateRequest: settingsInput.footer,
  BillingConfigResponse: z.object({ billingEnabled: z.boolean() }),
  LogoUploadResponse: z.object({
    message: z.string(),
    filename: z.string(),
    originalName: z.string(),
    size: z.number().int(),
    url: z.string(),
    userId: z.string().uuid(),
  }),
} satisfies Record<SharedSchemaName, z.ZodTypeAny>;

/**
 * Checks the converter cannot derive: `templateId` is a lookup refine (documented as
 * the lookup's keys) and `primaryColor` is a case-insensitive regex (OpenAPI patterns
 * have no flags, so both cases are spelled out).
 */
export const PRIMARY_COLOR_PATTERN = "^#[0-9a-fA-F]{6}$";
export const SCHEMA_OVERRIDES: ReadonlyMap<z.ZodTypeAny, SchemaObject> =
  new Map<z.ZodTypeAny, SchemaObject>([
    [
      documentConfigSchema.shape.templateId,
      { type: "string", enum: Object.keys(TEMPLATE_METADATA) },
    ],
    [
      documentConfigSchema.shape.primaryColor,
      { type: "string", pattern: PRIMARY_COLOR_PATTERN },
    ],
  ]);

export function sharedComponents(): Record<string, OpenApiSchema> {
  return zodComponents(SHARED_SCHEMAS, SCHEMA_OVERRIDES);
}
