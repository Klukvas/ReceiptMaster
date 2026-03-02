import { ApiErrorResponse, ApiErrors } from "./ApiError";

describe("ApiErrorResponse", () => {
  it("should create an error with default status code 400", () => {
    const error = new ApiErrorResponse("Test error", "TEST_ERROR");
    expect(error.error).toBe("Test error");
    expect(error.errorCode).toBe("TEST_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Test error");
  });

  it("should create an error with custom status code", () => {
    const error = new ApiErrorResponse("Not found", "NOT_FOUND", 404);
    expect(error.statusCode).toBe(404);
  });

  it("should be an instance of Error", () => {
    const error = new ApiErrorResponse("Test", "TEST");
    expect(error).toBeInstanceOf(Error);
  });

  describe("toJSON", () => {
    it("should return error and errorCode", () => {
      const error = new ApiErrorResponse("Test error", "TEST_CODE", 500);
      const json = error.toJSON();
      expect(json).toEqual({
        error: "Test error",
        errorCode: "TEST_CODE",
      });
    });

    it("should not include statusCode in JSON", () => {
      const error = new ApiErrorResponse("Test", "TEST", 500);
      const json = error.toJSON();
      expect(json).not.toHaveProperty("statusCode");
    });
  });
});

describe("ApiErrors", () => {
  describe("User errors", () => {
    it("USER_ALREADY_EXISTS should return 409", () => {
      const error = ApiErrors.USER_ALREADY_EXISTS("test@test.com");
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe("USER_ALREADY_EXISTS");
      expect(error.error).toContain("test@test.com");
    });

    it("USER_NOT_FOUND should return 404", () => {
      const error = ApiErrors.USER_NOT_FOUND("uuid-123");
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe("USER_NOT_FOUND");
    });

    it("INVALID_CREDENTIALS should return 401", () => {
      const error = ApiErrors.INVALID_CREDENTIALS();
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("INVALID_CREDENTIALS");
    });
  });

  describe("Order errors", () => {
    it("ORDER_NOT_FOUND should return 404", () => {
      const error = ApiErrors.ORDER_NOT_FOUND("order-123");
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe("ORDER_NOT_FOUND");
    });

    it("ORDER_ALREADY_CONFIRMED should return 400", () => {
      const error = ApiErrors.ORDER_ALREADY_CONFIRMED("order-123");
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("ORDER_ALREADY_CONFIRMED");
    });

    it("ORDER_ALREADY_CANCELLED should return 400", () => {
      const error = ApiErrors.ORDER_ALREADY_CANCELLED("order-123");
      expect(error.statusCode).toBe(400);
    });

    it("ORDER_CANNOT_BE_MODIFIED should return 400", () => {
      const error = ApiErrors.ORDER_CANNOT_BE_MODIFIED("order-123");
      expect(error.statusCode).toBe(400);
    });

    it("BATCH_ORDERS_NOT_ALL_DRAFT should return 400 with joined IDs", () => {
      const error = ApiErrors.BATCH_ORDERS_NOT_ALL_DRAFT(["id1", "id2"]);
      expect(error.statusCode).toBe(400);
      expect(error.error).toContain("id1, id2");
    });
  });

  describe("Receipt errors", () => {
    it("RECEIPT_NOT_FOUND should return 404", () => {
      const error = ApiErrors.RECEIPT_NOT_FOUND("r-123");
      expect(error.statusCode).toBe(404);
    });

    it("RECEIPT_ALREADY_EXISTS should return 409", () => {
      const error = ApiErrors.RECEIPT_ALREADY_EXISTS("order-123");
      expect(error.statusCode).toBe(409);
    });

    it("RECEIPT_GENERATION_FAILED should return 500", () => {
      const error = ApiErrors.RECEIPT_GENERATION_FAILED("order-123");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("Product errors", () => {
    it("PRODUCT_NOT_FOUND should return 404", () => {
      const error = ApiErrors.PRODUCT_NOT_FOUND("p-123");
      expect(error.statusCode).toBe(404);
    });

    it("PRODUCT_ALREADY_EXISTS should return 409", () => {
      const error = ApiErrors.PRODUCT_ALREADY_EXISTS("Widget");
      expect(error.statusCode).toBe(409);
      expect(error.error).toContain("Widget");
    });
  });

  describe("Settings errors", () => {
    it("SETTINGS_NOT_FOUND should return 404", () => {
      const error = ApiErrors.SETTINGS_NOT_FOUND();
      expect(error.statusCode).toBe(404);
    });

    it("INVALID_SETTINGS should return 400", () => {
      const error = ApiErrors.INVALID_SETTINGS("templateId");
      expect(error.statusCode).toBe(400);
      expect(error.error).toContain("templateId");
    });
  });

  describe("File errors", () => {
    it("FILE_NOT_FOUND should return 404", () => {
      const error = ApiErrors.FILE_NOT_FOUND("/path/to/file");
      expect(error.statusCode).toBe(404);
    });

    it("FILE_UPLOAD_FAILED should return 500", () => {
      const error = ApiErrors.FILE_UPLOAD_FAILED("test.png");
      expect(error.statusCode).toBe(500);
    });

    it("FILE_DELETE_FAILED should return 500", () => {
      const error = ApiErrors.FILE_DELETE_FAILED("/path");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("Validation errors", () => {
    it("VALIDATION_ERROR should return 400", () => {
      const error = ApiErrors.VALIDATION_ERROR("email", "Invalid format");
      expect(error.statusCode).toBe(400);
      expect(error.error).toContain("email");
      expect(error.error).toContain("Invalid format");
    });

    it("REQUIRED_FIELD_MISSING should return 400", () => {
      const error = ApiErrors.REQUIRED_FIELD_MISSING("name");
      expect(error.statusCode).toBe(400);
      expect(error.error).toContain("name");
    });
  });

  describe("General errors", () => {
    it("INTERNAL_SERVER_ERROR should return 500 with default message", () => {
      const error = ApiErrors.INTERNAL_SERVER_ERROR();
      expect(error.statusCode).toBe(500);
      expect(error.error).toBe("Internal server error");
    });

    it("INTERNAL_SERVER_ERROR should return 500 with custom message", () => {
      const error = ApiErrors.INTERNAL_SERVER_ERROR("DB connection failed");
      expect(error.error).toBe("DB connection failed");
    });

    it("UNAUTHORIZED should return 401", () => {
      const error = ApiErrors.UNAUTHORIZED();
      expect(error.statusCode).toBe(401);
    });

    it("FORBIDDEN should return 403", () => {
      const error = ApiErrors.FORBIDDEN();
      expect(error.statusCode).toBe(403);
    });

    it("NOT_FOUND should return 404", () => {
      const error = ApiErrors.NOT_FOUND("Order");
      expect(error.statusCode).toBe(404);
      expect(error.error).toContain("Order");
    });

    it("BAD_REQUEST should return 400", () => {
      const error = ApiErrors.BAD_REQUEST("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.error).toBe("Invalid input");
    });
  });
});
