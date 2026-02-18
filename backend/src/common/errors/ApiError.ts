export interface ApiError {
  error: string;
  errorCode: string;
}

export class ApiErrorResponse extends Error {
  public readonly error: string;
  public readonly errorCode: string;
  public readonly statusCode: number;

  constructor(error: string, errorCode: string, statusCode: number = 400) {
    super(error);
    this.error = error;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }

  toJSON(): ApiError {
    return {
      error: this.error,
      errorCode: this.errorCode,
    };
  }
}

// Предопределенные ошибки
export const ApiErrors = {
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
  RECEIPT_ALREADY_EXISTS: (orderId: string) =>
    new ApiErrorResponse(
      `Receipt for order ${orderId} already exists`,
      "RECEIPT_ALREADY_EXISTS",
      409,
    ),
  RECEIPT_GENERATION_FAILED: (orderId: string) =>
    new ApiErrorResponse(
      `Failed to generate receipt for order ${orderId}`,
      "RECEIPT_GENERATION_FAILED",
      500,
    ),
  RECEIPT_PRINT_FAILED: (receiptId: string) =>
    new ApiErrorResponse(
      `Failed to print receipt ${receiptId}`,
      "RECEIPT_PRINT_FAILED",
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
  REQUIRED_FIELD_MISSING: (field: string) =>
    new ApiErrorResponse(
      `Required field ${field} is missing`,
      "REQUIRED_FIELD_MISSING",
      400,
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
