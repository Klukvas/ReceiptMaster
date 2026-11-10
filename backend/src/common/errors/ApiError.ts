export interface ApiError {
  error: string;
  errorCode: string;
  [detail: string]: unknown;
}

export class ApiErrorResponse extends Error {
  public readonly error: string;
  public readonly errorCode: string;
  public readonly statusCode: number;

  /** Machine-readable extras (e.g. the missing `fields`), merged into the response body. */
  public readonly details?: Record<string, unknown>;

  constructor(
    error: string,
    errorCode: string,
    statusCode: number = 400,
    details?: Record<string, unknown>,
  ) {
    super(error);
    this.error = error;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON(): ApiError {
    return {
      error: this.error,
      errorCode: this.errorCode,
      ...this.details,
    };
  }
}

// Предопределенные ошибки
export const ApiErrors = {
  BILLING_DISABLED: () =>
    new ApiErrorResponse(
      "Payments are currently unavailable",
      "BILLING_DISABLED",
      503,
    ),
  // User errors
  USER_ALREADY_EXISTS: (email: string) =>
    new ApiErrorResponse(
      `User with email ${email} already exists`,
      "USER_ALREADY_EXISTS",
      409,
    ),
  USER_NOT_FOUND: (id: string) =>
    new ApiErrorResponse(`User with id ${id} not found`, "USER_NOT_FOUND", 404),
  INVALID_CREDENTIALS: () =>
    new ApiErrorResponse(
      "Invalid email or password",
      "INVALID_CREDENTIALS",
      401,
    ),

  IDEMPOTENCY_KEY_REUSED: () =>
    new ApiErrorResponse(
      "This Idempotency-Key was already used with a different request body",
      "IDEMPOTENCY_KEY_REUSED",
      422,
    ),

  // Order errors
  ORDER_NOT_FOUND: (id: string) =>
    new ApiErrorResponse(
      `Order with id ${id} not found`,
      "ORDER_NOT_FOUND",
      404,
    ),
  ORDER_ALREADY_CONFIRMED: (id: string) =>
    new ApiErrorResponse(
      `Order ${id} is already confirmed`,
      "ORDER_ALREADY_CONFIRMED",
      400,
    ),
  ORDER_ALREADY_CANCELLED: (id: string) =>
    new ApiErrorResponse(
      `Order ${id} is already cancelled`,
      "ORDER_ALREADY_CANCELLED",
      400,
    ),
  ORDER_CANNOT_BE_MODIFIED: (id: string) =>
    new ApiErrorResponse(
      `Order ${id} cannot be modified in current status`,
      "ORDER_CANNOT_BE_MODIFIED",
      400,
    ),
  BATCH_ORDERS_NOT_ALL_DRAFT: (ids: string[]) =>
    new ApiErrorResponse(
      `Only draft orders can be approved. Non-draft order IDs: ${ids.join(", ")}`,
      "BATCH_ORDERS_NOT_ALL_DRAFT",
      400,
    ),

  // Receipt errors
  RECEIPT_NOT_FOUND: (id: string) =>
    new ApiErrorResponse(
      `Receipt with id ${id} not found`,
      "RECEIPT_NOT_FOUND",
      404,
    ),
  RECEIPT_IS_ALREADY_VOIDED: (id: string) =>
    new ApiErrorResponse(
      `Receipt ${id} is already voided`,
      "RECEIPT_IS_ALREADY_VOIDED",
      400,
    ),
  RECEIPT_ALREADY_EXISTS: (orderId: string) =>
    new ApiErrorResponse(
      `Receipt for order ${orderId} already exists`,
      "RECEIPT_ALREADY_EXISTS",
      409,
    ),
  DOCUMENT_ALREADY_EXISTS: (orderId: string, type: string) =>
    new ApiErrorResponse(
      `A ${type} for order ${orderId} already exists`,
      "DOCUMENT_ALREADY_EXISTS",
      409,
    ),
  DOCUMENT_NOT_VOIDABLE: (id: string, type: string, status: string) =>
    new ApiErrorResponse(
      `The ${type} ${id} is ${status}, not issued, and cannot be voided: a voided ${type} closes the order's ${type} slot for good. Retry the generation instead.`,
      "DOCUMENT_NOT_VOIDABLE",
      409,
    ),
  DOCUMENT_NUMBERS_EXHAUSTED: (type: string) =>
    new ApiErrorResponse(
      `The ${type} counter has reached the largest possible number; no further ${type} number can be issued. Change the number format or contact support.`,
      "DOCUMENT_NUMBERS_EXHAUSTED",
      409,
    ),
  DOCUMENT_TYPE_NOT_SUPPORTED: (type: string) =>
    new ApiErrorResponse(
      `Document type "${type}" cannot be generated yet`,
      "DOCUMENT_TYPE_NOT_SUPPORTED",
      400,
    ),
  DOCUMENT_TEMPLATE_UNSUPPORTED: (type: string, templateId: string) =>
    new ApiErrorResponse(
      `Template "${templateId}" cannot carry this document type (${type}); choose another template`,
      "DOCUMENT_TEMPLATE_UNSUPPORTED",
      400,
    ),
  DOCUMENT_AMOUNT_INVALID: (orderId: string) =>
    new ApiErrorResponse(
      `The total or currency of order ${orderId} cannot be printed on a document; check the order's currency and amounts`,
      "DOCUMENT_AMOUNT_INVALID",
      422,
    ),
  DOCUMENT_REQUISITES_MISSING: (
    type: string,
    fields: string[],
    warnings: string[],
  ) =>
    new ApiErrorResponse(
      `Cannot generate a ${type}: fill in ${fields.join(", ")}`,
      "DOCUMENT_REQUISITES_MISSING",
      422,
      { fields, warnings },
    ),
  RETURN_QUANTITY_EXCEEDED: (
    shortfalls: Array<{
      orderItemId: string;
      requested: number;
      remaining: number;
    }>,
  ) =>
    new ApiErrorResponse(
      "Cannot return more than was sold: the quantity left to return is lower than requested",
      "RETURN_QUANTITY_EXCEEDED",
      422,
      { items: shortfalls },
    ),
  RECEIPT_GENERATION_FAILED: (orderId: string) =>
    new ApiErrorResponse(
      `Failed to generate receipt for order ${orderId}`,
      "RECEIPT_GENERATION_FAILED",
      500,
    ),

  // Product errors
  PRODUCT_NOT_FOUND: (id: string) =>
    new ApiErrorResponse(
      `Product with id ${id} not found`,
      "PRODUCT_NOT_FOUND",
      404,
    ),
  PRODUCT_ALREADY_EXISTS: (name: string) =>
    new ApiErrorResponse(
      `Product with name ${name} already exists`,
      "PRODUCT_ALREADY_EXISTS",
      409,
    ),
  PRODUCT_QUANTITY_CONFLICT: (id: string) =>
    new ApiErrorResponse(
      `Stock of product ${id} changed since it was loaded; nothing was saved`,
      "PRODUCT_QUANTITY_CONFLICT",
      409,
    ),

  // Recipient errors
  RECIPIENT_NOT_FOUND: (id: string) =>
    new ApiErrorResponse(
      `Recipient with id ${id} not found`,
      "RECIPIENT_NOT_FOUND",
      404,
    ),
  RECIPIENT_ALREADY_EXISTS: (email: string) =>
    new ApiErrorResponse(
      `Recipient with email ${email} already exists`,
      "RECIPIENT_ALREADY_EXISTS",
      409,
    ),
  RECIPIENT_HAS_ORDERS: (id: string) =>
    new ApiErrorResponse(
      `Recipient ${id} cannot be deleted: it has orders, including any deleted ones kept for history`,
      "RECIPIENT_HAS_ORDERS",
      409,
    ),

  // Supplier errors
  SUPPLIER_NOT_FOUND: (id: string) =>
    new ApiErrorResponse(
      `Supplier with id ${id} not found`,
      "SUPPLIER_NOT_FOUND",
      404,
    ),

  // Settings errors
  SETTINGS_NOT_FOUND: () =>
    new ApiErrorResponse("Settings not found", "SETTINGS_NOT_FOUND", 404),
  INVALID_SETTINGS: (field: string) =>
    new ApiErrorResponse(`Invalid settings: ${field}`, "INVALID_SETTINGS", 400),

  // File errors
  FILE_NOT_FOUND: (path: string) =>
    new ApiErrorResponse(`File not found: ${path}`, "FILE_NOT_FOUND", 404),
  FILE_UPLOAD_FAILED: (filename: string) =>
    new ApiErrorResponse(
      `Failed to upload file ${filename}`,
      "FILE_UPLOAD_FAILED",
      500,
    ),
  FILE_DELETE_FAILED: (path: string) =>
    new ApiErrorResponse(
      `Failed to delete file ${path}`,
      "FILE_DELETE_FAILED",
      500,
    ),

  // Validation errors
  VALIDATION_ERROR: (field: string, message: string) =>
    new ApiErrorResponse(
      `Validation error for ${field}: ${message}`,
      "VALIDATION_ERROR",
      400,
    ),
  /** Stable code for the client to localize; `field` names the request key at fault. */
  INVOICE_DUE_DATE_BEFORE_ISSUE_DATE: (dueDate: string, issueDate: string) =>
    new ApiErrorResponse(
      "Validation error for details.dueDate: must not be earlier than the issue date",
      "INVOICE_DUE_DATE_BEFORE_ISSUE_DATE",
      400,
      { field: "details.dueDate", dueDate, issueDate },
    ),
  NUMBERING_START_TOO_LOW: (minStart: number) =>
    new ApiErrorResponse(
      `The start number must be at least ${minStart}: lower numbers are already used`,
      "NUMBERING_START_TOO_LOW",
      409,
      { minStart },
    ),
  REQUIRED_FIELD_MISSING: (field: string) =>
    new ApiErrorResponse(
      `Required field ${field} is missing`,
      "REQUIRED_FIELD_MISSING",
      400,
    ),

  // Subscription errors
  PRODUCT_LIMIT_EXCEEDED: (limit: number) =>
    new ApiErrorResponse(
      `Product limit exceeded. Your plan allows up to ${limit} products`,
      "PRODUCT_LIMIT_EXCEEDED",
      402,
    ),
  ORDER_MONTHLY_LIMIT_EXCEEDED: (limit: number) =>
    new ApiErrorResponse(
      `Monthly order limit exceeded. Your plan allows up to ${limit} orders per month`,
      "ORDER_MONTHLY_LIMIT_EXCEEDED",
      402,
    ),
  TEMPLATE_PLAN_RESTRICTED: (templateId: string) =>
    new ApiErrorResponse(
      `Template "${templateId}" is not available on your current plan`,
      "TEMPLATE_PLAN_RESTRICTED",
      402,
    ),

  // General errors
  INTERNAL_SERVER_ERROR: (message?: string) =>
    new ApiErrorResponse(
      message || "Internal server error",
      "INTERNAL_SERVER_ERROR",
      500,
    ),
  UNAUTHORIZED: () =>
    new ApiErrorResponse("Unauthorized access", "UNAUTHORIZED", 401),
  FORBIDDEN: () => new ApiErrorResponse("Access forbidden", "FORBIDDEN", 403),
  NOT_FOUND: (resource: string) =>
    new ApiErrorResponse(`${resource} not found`, "NOT_FOUND", 404),
  BAD_REQUEST: (message: string) =>
    new ApiErrorResponse(message, "BAD_REQUEST", 400),
};
