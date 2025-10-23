import { AxiosError } from 'axios';

// API Error response format from backend
export interface ApiErrorResponse {
  error: string;
  errorCode: string;
}

// Error codes from backend
export enum ErrorCode {
  // User errors
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Order errors
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_ALREADY_CONFIRMED = 'ORDER_ALREADY_CONFIRMED',
  ORDER_ALREADY_CANCELLED = 'ORDER_ALREADY_CANCELLED',
  ORDER_CANNOT_BE_MODIFIED = 'ORDER_CANNOT_BE_MODIFIED',
  
  // Receipt errors
  RECEIPT_NOT_FOUND = 'RECEIPT_NOT_FOUND',
  RECEIPT_ALREADY_EXISTS = 'RECEIPT_ALREADY_EXISTS',
  RECEIPT_GENERATION_FAILED = 'RECEIPT_GENERATION_FAILED',
  RECEIPT_PRINT_FAILED = 'RECEIPT_PRINT_FAILED',
  
  // Product errors
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  PRODUCT_ALREADY_EXISTS = 'PRODUCT_ALREADY_EXISTS',
  
  // Recipient errors
  RECIPIENT_NOT_FOUND = 'RECIPIENT_NOT_FOUND',
  RECIPIENT_ALREADY_EXISTS = 'RECIPIENT_ALREADY_EXISTS',
  
  // Settings errors
  SETTINGS_NOT_FOUND = 'SETTINGS_NOT_FOUND',
  INVALID_SETTINGS = 'INVALID_SETTINGS',
  
  // File errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
  FILE_DELETE_FAILED = 'FILE_DELETE_FAILED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  
  // General errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  HTTP_EXCEPTION = 'HTTP_EXCEPTION',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// User-friendly error messages
const ERROR_MESSAGES: Record<string, string> = {
  // User errors
  [ErrorCode.USER_ALREADY_EXISTS]: 'Пользователь с таким email уже существует',
  [ErrorCode.USER_NOT_FOUND]: 'Пользователь не найден',
  [ErrorCode.INVALID_CREDENTIALS]: 'Неверный email или пароль',
  
  // Order errors
  [ErrorCode.ORDER_NOT_FOUND]: 'Заказ не найден',
  [ErrorCode.ORDER_ALREADY_CONFIRMED]: 'Заказ уже подтвержден',
  [ErrorCode.ORDER_ALREADY_CANCELLED]: 'Заказ уже отменен',
  [ErrorCode.ORDER_CANNOT_BE_MODIFIED]: 'Заказ нельзя изменить в текущем статусе',
  
  // Receipt errors
  [ErrorCode.RECEIPT_NOT_FOUND]: 'Чек не найден',
  [ErrorCode.RECEIPT_ALREADY_EXISTS]: 'Чек для этого заказа уже существует',
  [ErrorCode.RECEIPT_GENERATION_FAILED]: 'Не удалось создать чек',
  [ErrorCode.RECEIPT_PRINT_FAILED]: 'Не удалось распечатать чек',
  
  // Product errors
  [ErrorCode.PRODUCT_NOT_FOUND]: 'Товар не найден',
  [ErrorCode.PRODUCT_ALREADY_EXISTS]: 'Товар с таким названием уже существует',
  
  // Recipient errors
  [ErrorCode.RECIPIENT_NOT_FOUND]: 'Получатель не найден',
  [ErrorCode.RECIPIENT_ALREADY_EXISTS]: 'Получатель с таким email уже существует',
  
  // Settings errors
  [ErrorCode.SETTINGS_NOT_FOUND]: 'Настройки не найдены',
  [ErrorCode.INVALID_SETTINGS]: 'Неверные настройки',
  
  // File errors
  [ErrorCode.FILE_NOT_FOUND]: 'Файл не найден',
  [ErrorCode.FILE_UPLOAD_FAILED]: 'Не удалось загрузить файл',
  [ErrorCode.FILE_DELETE_FAILED]: 'Не удалось удалить файл',
  
  // Validation errors
  [ErrorCode.VALIDATION_ERROR]: 'Ошибка валидации',
  [ErrorCode.REQUIRED_FIELD_MISSING]: 'Заполните обязательное поле',
  
  // General errors
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'Внутренняя ошибка сервера',
  [ErrorCode.UNAUTHORIZED]: 'Необходима авторизация',
  [ErrorCode.FORBIDDEN]: 'Доступ запрещен',
  [ErrorCode.NOT_FOUND]: 'Ресурс не найден',
  [ErrorCode.BAD_REQUEST]: 'Неверный запрос',
  [ErrorCode.HTTP_EXCEPTION]: 'Ошибка сервера',
  [ErrorCode.UNKNOWN_ERROR]: 'Неизвестная ошибка',
};

/**
 * Parse API error from axios error
 */
export function parseApiError(error: unknown): { message: string; code: string } {
  if (!error) {
    return {
      message: 'Неизвестная ошибка',
      code: ErrorCode.UNKNOWN_ERROR,
    };
  }

  // Check if it's an Axios error with API error response
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data as Partial<ApiErrorResponse>;
    
    if (data.error && data.errorCode) {
      // New format: { error, errorCode }
      const userFriendlyMessage = ERROR_MESSAGES[data.errorCode] || data.error;
      return {
        message: userFriendlyMessage,
        code: data.errorCode,
      };
    }
    
    // Legacy format: { message } or string
    if (typeof data === 'string') {
      return {
        message: data,
        code: ErrorCode.UNKNOWN_ERROR,
      };
    }
    
    if ('message' in data && typeof data.message === 'string') {
      return {
        message: data.message,
        code: ErrorCode.UNKNOWN_ERROR,
      };
    }
  }

  // Network error
  if (isAxiosError(error) && !error.response) {
    return {
      message: 'Ошибка сети. Проверьте подключение к интернету',
      code: ErrorCode.UNKNOWN_ERROR,
    };
  }

  // Generic error with message
  if (error instanceof Error) {
    return {
      message: error.message || 'Произошла ошибка',
      code: ErrorCode.UNKNOWN_ERROR,
    };
  }

  // Fallback
  return {
    message: 'Неизвестная ошибка',
    code: ErrorCode.UNKNOWN_ERROR,
  };
}

/**
 * Type guard for Axios errors
 */
function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error;
}

/**
 * Get user-friendly error message by error code
 */
export function getErrorMessage(errorCode: string, fallback?: string): string {
  return ERROR_MESSAGES[errorCode] || fallback || ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

/**
 * Check if error is a specific error code
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  const parsed = parseApiError(error);
  return parsed.code === code;
}

