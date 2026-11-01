import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import type {
  RequestBodyObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { componentRef } from "./zod-openapi";

/**
 * Documentation-only decorators for routes whose bodies are validated with Zod
 * (`@Body() body: unknown`), which Swagger cannot introspect. They change no runtime
 * behaviour. Names are checked against the shared component registry at compile time
 * and every `$ref` is resolved when the document is built.
 */
export type SharedSchemaName =
  | "ApiErrorResponse"
  | "MessageResponse"
  | "DocumentConfig"
  | "DocumentConfigOverrides"
  | "DocumentDraft"
  | "DocumentConfigSaveRequest"
  | "DocumentPresetCreateRequest"
  | "DocumentPresetUpdateRequest"
  | "DocumentRevisionRequest"
  | "DocumentSelectionRequest"
  | "ReceiptRegenerationRequest"
  | "DocumentPreviewRequest"
  | "DocumentConfigVersion"
  | "DocumentConfigVersionResponse"
  | "DocumentPresetSummary"
  | "DocumentPresetListResponse"
  | "DocumentPreset"
  | "DocumentPresetResponse"
  | "DocumentPresetDeletedResponse"
  | "ReceiptProjection"
  | "ReceiptListResponse"
  | "ReceiptVoidRequest"
  | "ReceiptShareResponse"
  | "AutoReceiptRequest"
  | "AutoReceiptResponse"
  | "FooterUpdateRequest"
  | "BillingConfigResponse"
  | "LogoUploadResponse";

const LOGO_MEDIA_TYPES = "image/png, image/jpeg, image/gif, image/svg+xml";
const MAX_DRAFT_PAYLOAD_BYTES = 64 * 1024;

/** Adds a request body to the operation while keeping any `@ApiOperation` summary. */
function ApiRequestBody(requestBody: RequestBodyObject): MethodDecorator {
  return (_target, _key, descriptor) => {
    const operation = Reflect.getMetadata(
      DECORATORS.API_OPERATION,
      descriptor.value,
    );
    Reflect.defineMetadata(
      DECORATORS.API_OPERATION,
      { ...operation, requestBody },
      descriptor.value,
    );
    return descriptor;
  };
}

export const ApiJsonBody = (
  name: SharedSchemaName,
  { required = true }: { required?: boolean } = {},
): MethodDecorator =>
  ApiRequestBody({
    required,
    content: { "application/json": { schema: componentRef(name) } },
  });

/**
 * The document draft envelope (`DocumentMultipart`): plain JSON when no logo is sent,
 * or multipart with the same JSON in a `payload` field plus an optional `logo` file.
 */
export const ApiDocumentDraftBody = (
  name: SharedSchemaName,
  { required = true }: { required?: boolean } = {},
): MethodDecorator => {
  const envelope: SchemaObject = {
    type: "object",
    properties: {
      payload: {
        type: "string",
        maxLength: MAX_DRAFT_PAYLOAD_BYTES,
        description: `JSON-encoded ${name} (at most 64 KiB)`,
      },
      logo: {
        type: "string",
        format: "binary",
        description:
          "Logo file, at most 5 MiB; required when logoAction is replace and forbidden otherwise",
      },
    },
    required: ["payload"],
    additionalProperties: false,
  };
  return ApiRequestBody({
    required,
    content: {
      "application/json": { schema: componentRef(name) },
      "multipart/form-data": {
        schema: envelope,
        encoding: { logo: { contentType: LOGO_MEDIA_TYPES } },
      },
    },
  });
};

export const ApiLogoUploadBody = (): MethodDecorator =>
  ApiRequestBody({
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            logo: {
              type: "string",
              format: "binary",
              description: "PNG, JPEG, GIF or SVG, at most 5 MiB",
            },
          },
          required: ["logo"],
          additionalProperties: false,
        },
        encoding: { logo: { contentType: LOGO_MEDIA_TYPES } },
      },
    },
  });

export const ApiDataResponse = (
  status: number,
  name: SharedSchemaName,
  description: string,
): MethodDecorator & ClassDecorator =>
  ApiResponse({ status, description, schema: componentRef(name) });

export const ApiPdfResponse = (
  status: number,
  description: string,
): MethodDecorator & ClassDecorator =>
  ApiResponse({
    status,
    description,
    content: {
      "application/pdf": { schema: { type: "string", format: "binary" } },
    },
  });

/** Every error leaves GlobalExceptionFilter as `{ error, errorCode }`. */
export const ApiFailureResponses = (
  failures: Readonly<Record<number, string>>,
): MethodDecorator =>
  applyDecorators(
    ...Object.entries(failures).map(([status, description]) =>
      ApiResponse({
        status: Number(status),
        description,
        schema: componentRef("ApiErrorResponse"),
      }),
    ),
  );
