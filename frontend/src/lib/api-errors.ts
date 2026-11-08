import { AxiosError } from "axios";
import i18n from "./i18n";

// API Error response format from backend
export interface ApiErrorResponse {
  error: string;
  errorCode: string;
}

// Error codes from backend
export const ErrorCode = {
  // User errors
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",

  // Order errors
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_ALREADY_CONFIRMED: "ORDER_ALREADY_CONFIRMED",
  ORDER_ALREADY_CANCELLED: "ORDER_ALREADY_CANCELLED",
  ORDER_CANNOT_BE_MODIFIED: "ORDER_CANNOT_BE_MODIFIED",

  // Receipt errors
  RECEIPT_NOT_FOUND: "RECEIPT_NOT_FOUND",
  RECEIPT_ALREADY_EXISTS: "RECEIPT_ALREADY_EXISTS",
  RECEIPT_GENERATION_FAILED: "RECEIPT_GENERATION_FAILED",
  RECEIPT_PRINT_FAILED: "RECEIPT_PRINT_FAILED",
  DOCUMENT_REQUISITES_MISSING: "DOCUMENT_REQUISITES_MISSING",
  DOCUMENT_ALREADY_EXISTS: "DOCUMENT_ALREADY_EXISTS",
  DOCUMENT_TEMPLATE_UNSUPPORTED: "DOCUMENT_TEMPLATE_UNSUPPORTED",
  DOCUMENT_TYPE_NOT_SUPPORTED: "DOCUMENT_TYPE_NOT_SUPPORTED",
  DOCUMENT_AMOUNT_INVALID: "DOCUMENT_AMOUNT_INVALID",
  RECONSTRUCTION_REQUIRED: "RECONSTRUCTION_REQUIRED",
  RETURN_QUANTITY_EXCEEDED: "RETURN_QUANTITY_EXCEEDED",
  NUMBERING_START_TOO_LOW: "NUMBERING_START_TOO_LOW",
  INVOICE_DUE_DATE_BEFORE_ISSUE_DATE: "INVOICE_DUE_DATE_BEFORE_ISSUE_DATE",

  // Product errors
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_ALREADY_EXISTS: "PRODUCT_ALREADY_EXISTS",
  PRODUCT_QUANTITY_CONFLICT: "PRODUCT_QUANTITY_CONFLICT",

  // Recipient errors
  RECIPIENT_NOT_FOUND: "RECIPIENT_NOT_FOUND",
  RECIPIENT_ALREADY_EXISTS: "RECIPIENT_ALREADY_EXISTS",
  RECIPIENT_HAS_ORDERS: "RECIPIENT_HAS_ORDERS",

  // Settings errors
  SETTINGS_NOT_FOUND: "SETTINGS_NOT_FOUND",
  INVALID_SETTINGS: "INVALID_SETTINGS",

  // File errors
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_UPLOAD_FAILED: "FILE_UPLOAD_FAILED",
  FILE_DELETE_FAILED: "FILE_DELETE_FAILED",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  REQUIRED_FIELD_MISSING: "REQUIRED_FIELD_MISSING",

  // General errors
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  BAD_REQUEST: "BAD_REQUEST",
  HTTP_EXCEPTION: "HTTP_EXCEPTION",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// User-friendly error messages (fallback for when i18n is not available)
const ERROR_MESSAGES: Record<string, string> = {
  // User errors
  [ErrorCode.USER_ALREADY_EXISTS]: "User with this email already exists",
  [ErrorCode.USER_NOT_FOUND]: "User not found",
  [ErrorCode.INVALID_CREDENTIALS]: "Invalid email or password",

  // Order errors
  [ErrorCode.ORDER_NOT_FOUND]: "Order not found",
  [ErrorCode.ORDER_ALREADY_CONFIRMED]: "Order is already confirmed",
  [ErrorCode.ORDER_ALREADY_CANCELLED]: "Order is already cancelled",
  [ErrorCode.ORDER_CANNOT_BE_MODIFIED]:
    "Order cannot be modified in current status",

  // Receipt errors
  [ErrorCode.RECEIPT_NOT_FOUND]: "Receipt not found",
  [ErrorCode.RECEIPT_ALREADY_EXISTS]: "Receipt for this order already exists",
  [ErrorCode.RECEIPT_GENERATION_FAILED]: "Failed to generate receipt",
  [ErrorCode.RECEIPT_PRINT_FAILED]: "Failed to print receipt",
  [ErrorCode.DOCUMENT_REQUISITES_MISSING]:
    "Some requisites required for this document are missing",
  [ErrorCode.DOCUMENT_ALREADY_EXISTS]:
    "A document of this type already exists for this order",
  [ErrorCode.DOCUMENT_TEMPLATE_UNSUPPORTED]:
    "This design cannot be used for this document type",
  [ErrorCode.DOCUMENT_TYPE_NOT_SUPPORTED]: "This document type is not supported",
  [ErrorCode.RETURN_QUANTITY_EXCEEDED]:
    "You can return no more than is left of an item. Check the quantities and try again",
  [ErrorCode.INVOICE_DUE_DATE_BEFORE_ISSUE_DATE]:
    "The due date cannot be before the issue date",
  [ErrorCode.NUMBERING_START_TOO_LOW]:
    "The starting number cannot be lower than the next number to be issued",

  // Product errors
  [ErrorCode.PRODUCT_NOT_FOUND]: "Product not found",
  [ErrorCode.PRODUCT_ALREADY_EXISTS]: "Product with this name already exists",
  [ErrorCode.PRODUCT_QUANTITY_CONFLICT]:
    "Stock changed while you were editing; nothing was saved",

  // Recipient errors
  [ErrorCode.RECIPIENT_NOT_FOUND]: "Recipient not found",
  [ErrorCode.RECIPIENT_ALREADY_EXISTS]:
    "Recipient with this email already exists",
  [ErrorCode.RECIPIENT_HAS_ORDERS]:
    "This recipient can't be deleted: it has orders, including deleted ones kept for history",

  // Settings errors
  [ErrorCode.SETTINGS_NOT_FOUND]: "Settings not found",
  [ErrorCode.INVALID_SETTINGS]: "Invalid settings",

  // File errors
  [ErrorCode.FILE_NOT_FOUND]: "File not found",
  [ErrorCode.FILE_UPLOAD_FAILED]: "Failed to upload file",
  [ErrorCode.FILE_DELETE_FAILED]: "Failed to delete file",

  // Validation errors
  [ErrorCode.VALIDATION_ERROR]: "Validation error",
  [ErrorCode.REQUIRED_FIELD_MISSING]: "Required field is missing",

  // General errors
  [ErrorCode.INTERNAL_SERVER_ERROR]: "Internal server error",
  [ErrorCode.UNAUTHORIZED]: "Unauthorized access",
  [ErrorCode.FORBIDDEN]: "Access forbidden",
  [ErrorCode.NOT_FOUND]: "Resource not found",
  [ErrorCode.BAD_REQUEST]: "Bad request",
  [ErrorCode.HTTP_EXCEPTION]: "Server error",
  [ErrorCode.UNKNOWN_ERROR]: "Unknown error occurred",
};

// Codes that say nothing specific on their own; the server's detail is the useful part.
const GENERIC_ERROR_CODES: ReadonlySet<string> = new Set([
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.BAD_REQUEST,
  ErrorCode.HTTP_EXCEPTION,
]);

// class-validator sends an array of messages; domain errors send a single string.
function serverDetail(error: unknown): string | null {
  const parts = Array.isArray(error) ? error : [error];
  const text = parts
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("; ");
  return text || null;
}

/**
 * Locale keys are camelCase while error codes are SCREAMING_SNAKE_CASE:
 * PRODUCT_ALREADY_EXISTS → errors.productAlreadyExists.
 */
function errorTranslationKey(errorCode: string): string {
  const camelCase = errorCode
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, next: string) => next.toUpperCase());
  return `errors.${camelCase}`;
}

/**
 * Parse API error from axios error
 */
export function parseApiError(error: unknown): {
  message: string;
  code: string;
} {
  if (!error) {
    return {
      message: "Неизвестная ошибка",
      code: ErrorCode.UNKNOWN_ERROR,
    };
  }

  // Check if it's an Axios error with API error response
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data as Partial<ApiErrorResponse>;

    if (data.error && data.errorCode) {
      const detail = serverDetail(data.error);
      if (GENERIC_ERROR_CODES.has(data.errorCode) && detail) {
        return { message: detail, code: data.errorCode };
      }

      // New format: { error, errorCode }
      const userFriendlyMessage = i18n.t(errorTranslationKey(data.errorCode), {
        defaultValue: ERROR_MESSAGES[data.errorCode] || data.error,
      });
      return {
        message: userFriendlyMessage,
        code: data.errorCode,
      };
    }

    // Legacy format: { message } or string
    if (typeof data === "string") {
      return {
        message: data,
        code: ErrorCode.UNKNOWN_ERROR,
      };
    }

    if ("message" in data && typeof data.message === "string") {
      return {
        message: data.message,
        code: ErrorCode.UNKNOWN_ERROR,
      };
    }
  }

  // Network error
  if (isAxiosError(error) && !error.response) {
    return {
      message: i18n.t("errors.networkError", {
        defaultValue: "Network error. Please check your internet connection",
      }),
      code: ErrorCode.UNKNOWN_ERROR,
    };
  }

  // Generic error with message
  if (error instanceof Error) {
    return {
      message: error.message || "Произошла ошибка",
      code: ErrorCode.UNKNOWN_ERROR,
    };
  }

  // Fallback
  return {
    message: "Неизвестная ошибка",
    code: ErrorCode.UNKNOWN_ERROR,
  };
}

/**
 * Type guard for Axios errors
 */
function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === "object" && error !== null && "isAxiosError" in error;
}

/**
 * Get user-friendly error message by error code
 */
export function getErrorMessage(errorCode: string, fallback?: string): string {
  return (
    ERROR_MESSAGES[errorCode] ||
    fallback ||
    ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR]
  );
}

/**
 * Check if error is a specific error code
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  const parsed = parseApiError(error);
  return parsed.code === code;
}

export type RequisitesError = {
  /** Requisite keys that must be filled in, e.g. `seller.iban`. */
  fields: string[];
  /** Soft requisites the document goes ahead without. */
  warnings: string[];
};

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** The missing-requisites 422 of document creation, or null for any other error. */
export function parseRequisitesError(error: unknown): RequisitesError | null {
  if (!isAxiosError(error)) return null;
  const body: unknown = error.response?.data;
  if (typeof body !== "object" || body === null) return null;
  const { errorCode, fields, warnings } = body as Record<string, unknown>;
  if (errorCode !== ErrorCode.DOCUMENT_REQUISITES_MISSING) return null;
  return {
    fields: isStringList(fields) ? fields : [],
    warnings: isStringList(warnings) ? warnings : [],
  };
}

/**
 * The field a "Validation error for X: …" response blames, as the full dotted
 * path (e.g. `details.contractRef`), or null when the error is not of that shape.
 */
export function validationField(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const body: unknown = error.response?.data;
  if (typeof body !== "object" || body === null) return null;
  // Typed refusals name their field directly ({ errorCode, field: "details.dueDate" }).
  const field = (body as { field?: unknown }).field;
  if (typeof field === "string" && /^[\w.[\]]+$/.test(field)) return field;
  const message = (body as { error?: unknown }).error;
  const parts = Array.isArray(message) ? message : [message];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const match = /^Validation error for ([\w.[\]]+): /.exec(part);
    if (match) return match[1];
  }
  return null;
}
