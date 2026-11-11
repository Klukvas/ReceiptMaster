import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { ThrottlerException } from "@nestjs/throttler";
import { ApiError, ApiErrorResponse } from "../errors/ApiError";

// The text of an unexpected error (SQL, driver detail, file paths) stays in the
// log; the client only ever gets this.
const INTERNAL_ERROR_MESSAGE = "Internal server error";

const BODY_TOO_LARGE = "entity.too.large";

/**
 * express's body-parser rejects a request before any handler runs with an `http-errors`
 * object, not an HttpException: a body above the size limit, an unsupported charset or
 * encoding. Its status is the client's fault and its message is meant to be shown
 * (`expose`), so it must not become a 500.
 */
type BodyParserClientError = Error & {
  status: number;
  type: string;
  expose: true;
};

function isBodyParserClientError(
  exception: unknown,
): exception is BodyParserClientError {
  if (!(exception instanceof Error)) return false;
  const candidate = exception as Partial<BodyParserClientError>;
  return (
    candidate.expose === true &&
    typeof candidate.type === "string" &&
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status < 500
  );
}

/** Every throttle in this app counts per minute; used only if the guard set no header. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/**
 * The stock ThrottlerGuard (login, register, refresh, public links, Paddle) throws a bare
 * ThrottlerException after setting `Retry-After`. Answer it in the same shape as
 * UserThrottlerGuard, so every 429 reads `{ error, errorCode: "RATE_LIMITED",
 * retryAfterSeconds }`.
 */
function rateLimitedBody(response: Response): ApiError {
  const header = Number(response.getHeader("Retry-After"));
  const retryAfterSeconds =
    Number.isFinite(header) && header > 0
      ? Math.ceil(header)
      : DEFAULT_RETRY_AFTER_SECONDS;
  return {
    error: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
    errorCode: "RATE_LIMITED",
    retryAfterSeconds,
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: ApiError;

    if (exception instanceof ApiErrorResponse) {
      // Наши кастомные ошибки
      status = exception.statusCode;
      errorResponse = exception.toJSON();
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      errorResponse = rateLimitedBody(response);
    } else if (exception instanceof HttpException) {
      // NestJS HTTP исключения
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        errorResponse = {
          error: exceptionResponse,
          errorCode: "HTTP_EXCEPTION",
        };
      } else if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as any;
        errorResponse = {
          error: responseObj.message || responseObj.error || "Unknown error",
          errorCode: responseObj.errorCode || "HTTP_EXCEPTION",
        };
      } else {
        errorResponse = {
          error: "Unknown error",
          errorCode: "HTTP_EXCEPTION",
        };
      }
    } else if (isBodyParserClientError(exception)) {
      status = exception.status;
      errorResponse =
        exception.type === BODY_TOO_LARGE
          ? {
              error: "Request body is too large",
              errorCode: "PAYLOAD_TOO_LARGE",
            }
          : { error: exception.message, errorCode: "HTTP_EXCEPTION" };
    } else if (exception instanceof Error) {
      // Обычные JavaScript ошибки
      errorResponse = {
        error: INTERNAL_ERROR_MESSAGE,
        errorCode: "INTERNAL_SERVER_ERROR",
      };
    } else {
      // Неизвестные ошибки
      errorResponse = {
        error: "Unknown error occurred",
        errorCode: "UNKNOWN_ERROR",
      };
    }

    this.logger.error("Exception caught by GlobalExceptionFilter:", {
      error: errorResponse.error,
      errorCode: errorResponse.errorCode,
      status,
      detail: exception instanceof Error ? exception.message : exception,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json(errorResponse);
  }
}
