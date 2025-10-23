import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorResponse } from '../errors/ApiError';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: { error: string; errorCode: string };

    if (exception instanceof ApiErrorResponse) {
      // Наши кастомные ошибки
      status = exception.statusCode;
      errorResponse = exception.toJSON();
    } else if (exception instanceof HttpException) {
      // NestJS HTTP исключения
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        errorResponse = {
          error: exceptionResponse,
          errorCode: 'HTTP_EXCEPTION',
        };
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        errorResponse = {
          error: responseObj.message || responseObj.error || 'Unknown error',
          errorCode: responseObj.errorCode || 'HTTP_EXCEPTION',
        };
      } else {
        errorResponse = {
          error: 'Unknown error',
          errorCode: 'HTTP_EXCEPTION',
        };
      }
    } else if (exception instanceof Error) {
      // Обычные JavaScript ошибки
      errorResponse = {
        error: exception.message || 'Internal server error',
        errorCode: 'INTERNAL_SERVER_ERROR',
      };
    } else {
      // Неизвестные ошибки
      errorResponse = {
        error: 'Unknown error occurred',
        errorCode: 'UNKNOWN_ERROR',
      };
    }

    this.logger.error('Exception caught by GlobalExceptionFilter:', {
      error: errorResponse.error,
      errorCode: errorResponse.errorCode,
      status,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json(errorResponse);
  }
}
