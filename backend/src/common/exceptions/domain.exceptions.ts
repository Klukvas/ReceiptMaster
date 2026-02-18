import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base domain exception with a typed error code.
 */
export class DomainException extends HttpException {
  public readonly errorCode: string;

  constructor(message: string, errorCode: string, status: HttpStatus) {
    super({ error: message, errorCode }, status);
    this.errorCode = errorCode;
  }
}

// ── Order domain exceptions ────────────────────────────────

export class OrderNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      `Order with id ${id} not found`,
      "ORDER_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
  }
}

export class OrderAlreadyConfirmedException extends DomainException {
  constructor(id: string) {
    super(
      `Order ${id} is already confirmed`,
      "ORDER_ALREADY_CONFIRMED",
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class OrderAlreadyCancelledException extends DomainException {
  constructor(id: string) {
    super(
      `Order ${id} is already cancelled`,
      "ORDER_ALREADY_CANCELLED",
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class OrderCannotBeModifiedException extends DomainException {
  constructor(id: string) {
    super(
      `Order ${id} cannot be modified in current status`,
      "ORDER_CANNOT_BE_MODIFIED",
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class OrderLockedException extends DomainException {
  constructor(id: string) {
    super(
      `Order ${id} is locked and cannot be modified`,
      "ORDER_LOCKED",
      HttpStatus.BAD_REQUEST,
    );
  }
}

// ── Receipt domain exceptions ──────────────────────────────

export class ReceiptNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      `Receipt with id ${id} not found`,
      "RECEIPT_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ReceiptAlreadyExistsException extends DomainException {
  constructor(orderId: string) {
    super(
      `Receipt for order ${orderId} already exists`,
      "RECEIPT_ALREADY_EXISTS",
      HttpStatus.CONFLICT,
    );
  }
}

export class ReceiptGenerationFailedException extends DomainException {
  constructor(orderId: string) {
    super(
      `Failed to generate receipt for order ${orderId}`,
      "RECEIPT_GENERATION_FAILED",
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

// ── Product domain exceptions ──────────────────────────────

export class ProductNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      `Product with id ${id} not found`,
      "PRODUCT_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InsufficientStockException extends DomainException {
  constructor(productName: string, available: number, requested: number) {
    super(
      `Insufficient stock for "${productName}": available ${available}, requested ${requested}`,
      "INSUFFICIENT_STOCK",
      HttpStatus.BAD_REQUEST,
    );
  }
}

// ── Recipient domain exceptions ────────────────────────────

export class RecipientNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      `Recipient with id ${id} not found`,
      "RECIPIENT_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
  }
}

// ── User / Auth domain exceptions ──────────────────────────

export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      `User with id ${id} not found`,
      "USER_NOT_FOUND",
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super(
      "Invalid email or password",
      "INVALID_CREDENTIALS",
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class UserAlreadyExistsException extends DomainException {
  constructor(email: string) {
    super(
      `User with email ${email} already exists`,
      "USER_ALREADY_EXISTS",
      HttpStatus.CONFLICT,
    );
  }
}

// ── File domain exceptions ─────────────────────────────────

export class FileNotFoundException extends DomainException {
  constructor(path: string) {
    super(`File not found: ${path}`, "FILE_NOT_FOUND", HttpStatus.NOT_FOUND);
  }
}

// ── Generic domain exceptions ──────────────────────────────

export class ValidationException extends DomainException {
  constructor(field: string, message: string) {
    super(
      `Validation error for ${field}: ${message}`,
      "VALIDATION_ERROR",
      HttpStatus.BAD_REQUEST,
    );
  }
}
