import { HttpStatus } from '@nestjs/common';
import {
  DomainException,
  OrderNotFoundException,
  OrderAlreadyConfirmedException,
  OrderAlreadyCancelledException,
  OrderCannotBeModifiedException,
  OrderLockedException,
  ReceiptNotFoundException,
  ReceiptAlreadyExistsException,
  ReceiptGenerationFailedException,
  ProductNotFoundException,
  InsufficientStockException,
  RecipientNotFoundException,
  UserNotFoundException,
  InvalidCredentialsException,
  UserAlreadyExistsException,
  FileNotFoundException,
  ValidationException,
} from './domain.exceptions';

describe('DomainException', () => {
  it('should create with message, errorCode, and status', () => {
    const ex = new DomainException('test', 'TEST_CODE', HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('TEST_CODE');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    const response = ex.getResponse() as any;
    expect(response.error).toBe('test');
    expect(response.errorCode).toBe('TEST_CODE');
  });
});

describe('Order exceptions', () => {
  it('OrderNotFoundException should be 404', () => {
    const ex = new OrderNotFoundException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('ORDER_NOT_FOUND');
  });

  it('OrderAlreadyConfirmedException should be 400', () => {
    const ex = new OrderAlreadyConfirmedException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('ORDER_ALREADY_CONFIRMED');
  });

  it('OrderAlreadyCancelledException should be 400', () => {
    const ex = new OrderAlreadyCancelledException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('ORDER_ALREADY_CANCELLED');
  });

  it('OrderCannotBeModifiedException should be 400', () => {
    const ex = new OrderCannotBeModifiedException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('ORDER_CANNOT_BE_MODIFIED');
  });

  it('OrderLockedException should be 400', () => {
    const ex = new OrderLockedException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('ORDER_LOCKED');
  });
});

describe('Receipt exceptions', () => {
  it('ReceiptNotFoundException should be 404', () => {
    const ex = new ReceiptNotFoundException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('RECEIPT_NOT_FOUND');
  });

  it('ReceiptAlreadyExistsException should be 409', () => {
    const ex = new ReceiptAlreadyExistsException('order-1');
    expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(ex.errorCode).toBe('RECEIPT_ALREADY_EXISTS');
  });

  it('ReceiptGenerationFailedException should be 500', () => {
    const ex = new ReceiptGenerationFailedException('order-1');
    expect(ex.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(ex.errorCode).toBe('RECEIPT_GENERATION_FAILED');
  });
});

describe('Product exceptions', () => {
  it('ProductNotFoundException should be 404', () => {
    const ex = new ProductNotFoundException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('PRODUCT_NOT_FOUND');
  });

  it('InsufficientStockException should include details', () => {
    const ex = new InsufficientStockException('Widget', 5, 10);
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('INSUFFICIENT_STOCK');
    const response = ex.getResponse() as any;
    expect(response.error).toContain('Widget');
    expect(response.error).toContain('5');
    expect(response.error).toContain('10');
  });
});

describe('Recipient exceptions', () => {
  it('RecipientNotFoundException should be 404', () => {
    const ex = new RecipientNotFoundException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('RECIPIENT_NOT_FOUND');
  });
});

describe('User/Auth exceptions', () => {
  it('UserNotFoundException should be 404', () => {
    const ex = new UserNotFoundException('id-1');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('USER_NOT_FOUND');
  });

  it('InvalidCredentialsException should be 401', () => {
    const ex = new InvalidCredentialsException();
    expect(ex.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(ex.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('UserAlreadyExistsException should be 409', () => {
    const ex = new UserAlreadyExistsException('test@test.com');
    expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(ex.errorCode).toBe('USER_ALREADY_EXISTS');
  });
});

describe('File exceptions', () => {
  it('FileNotFoundException should be 404', () => {
    const ex = new FileNotFoundException('/path/to/file');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('FILE_NOT_FOUND');
  });
});

describe('Validation exceptions', () => {
  it('ValidationException should be 400 with field and message', () => {
    const ex = new ValidationException('email', 'must be valid');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.errorCode).toBe('VALIDATION_ERROR');
    const response = ex.getResponse() as any;
    expect(response.error).toContain('email');
    expect(response.error).toContain('must be valid');
  });
});
