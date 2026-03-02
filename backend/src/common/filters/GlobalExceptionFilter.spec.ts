import { HttpException, HttpStatus } from "@nestjs/common";
import { GlobalExceptionFilter } from "./GlobalExceptionFilter";
import { ApiErrorResponse } from "../errors/ApiError";

describe("GlobalExceptionFilter", () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    };
  });

  it("should handle ApiErrorResponse", () => {
    const exception = new ApiErrorResponse("Custom error", "CUSTOM_CODE", 422);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(422);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Custom error",
      errorCode: "CUSTOM_CODE",
    });
  });

  it("should handle HttpException with string response", () => {
    const exception = new HttpException("Not found", HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Not found",
      errorCode: "HTTP_EXCEPTION",
    });
  });

  it("should handle HttpException with object response", () => {
    const exception = new HttpException(
      { message: "Bad request", errorCode: "VALIDATION_FAILED" },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Bad request",
      errorCode: "VALIDATION_FAILED",
    });
  });

  it("should handle HttpException with object response using error field", () => {
    const exception = new HttpException(
      { error: "Some error" },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Some error" }),
    );
  });

  it("should handle HttpException with empty object response", () => {
    const exception = new HttpException({}, HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Unknown error",
      errorCode: "HTTP_EXCEPTION",
    });
  });

  it("should handle regular Error", () => {
    const exception = new Error("Something broke");

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Something broke",
      errorCode: "INTERNAL_SERVER_ERROR",
    });
  });

  it("should handle unknown exception types", () => {
    filter.catch("string error", mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Unknown error occurred",
      errorCode: "UNKNOWN_ERROR",
    });
  });

  it("should handle null exception", () => {
    filter.catch(null, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
