import { of } from "rxjs";
import { AuditLogInterceptor } from "./audit-log.interceptor";
import { AuditLogService } from "../services/audit-log.service";

describe("AuditLogInterceptor", () => {
  let interceptor: AuditLogInterceptor;
  let auditLogService: jest.Mocked<AuditLogService>;

  const createMockContext = (
    method: string,
    controllerName: string,
    handlerName: string,
    user?: any,
    params?: any,
    body?: any,
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          user,
          params: params || {},
          body: body || {},
          ip: "127.0.0.1",
          headers: { "user-agent": "Test Agent" },
          requestId: "req-123",
        }),
      }),
      getClass: () => ({ name: controllerName }),
      getHandler: () => ({ name: handlerName }),
    }) as any;

  const createMockNext = (data: any = {}) => ({
    handle: () => of(data),
  });

  beforeEach(() => {
    auditLogService = {
      log: jest.fn(),
    } as any;
    interceptor = new AuditLogInterceptor(auditLogService);
  });

  it("should skip logging for GET requests", (done) => {
    const context = createMockContext("GET", "OrdersController", "findAll");
    const next = createMockNext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditLogService.log).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it("should log POST requests", (done) => {
    const context = createMockContext(
      "POST",
      "OrdersController",
      "create",
      { id: "user-1" },
      {},
      { recipientId: "r-1" },
    );
    const next = createMockNext({ id: "order-1" });

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditLogService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user-1",
            action: "CREATE",
            entityType: "orders",
            ipAddress: "127.0.0.1",
          }),
        );
        done();
      },
    });
  });

  it("should log DELETE requests", (done) => {
    const context = createMockContext(
      "DELETE",
      "ProductsController",
      "remove",
      { id: "user-1" },
      { id: "prod-1" },
    );
    const next = createMockNext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditLogService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "DELETE",
            entityType: "products",
            entityId: "prod-1",
          }),
        );
        done();
      },
    });
  });

  it("should log PATCH requests as UPDATE", (done) => {
    const context = createMockContext(
      "PATCH",
      "OrdersController",
      "update",
      { id: "user-1" },
      { id: "order-1" },
      { status: "confirmed" },
    );
    const next = createMockNext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditLogService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "UPDATE",
            entityType: "orders",
          }),
        );
        done();
      },
    });
  });

  it("should log PUT requests", (done) => {
    const context = createMockContext(
      "PUT",
      "SettingsController",
      "updateTemplate",
      { id: "user-1" },
    );
    const next = createMockNext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditLogService.log).toHaveBeenCalled();
        done();
      },
    });
  });

  it("should map handler names to actions correctly", (done) => {
    const testCases = [
      { handler: "register", expected: "CREATE" },
      { handler: "createOrder", expected: "CREATE" },
      { handler: "updateProfile", expected: "UPDATE" },
      { handler: "confirmOrder", expected: "UPDATE" },
      { handler: "cancelOrder", expected: "UPDATE" },
      { handler: "deleteOrder", expected: "DELETE" },
      { handler: "removeItem", expected: "DELETE" },
      { handler: "voidReceipt", expected: "VOID" },
    ];

    let completed = 0;

    for (const tc of testCases) {
      const context = createMockContext("POST", "TestController", tc.handler, {
        id: "user-1",
      });
      const next = createMockNext();

      interceptor.intercept(context, next).subscribe({
        complete: () => {
          const logCall = auditLogService.log.mock.calls[completed][0];
          expect(logCall.action).toBe(tc.expected);
          completed++;
          if (completed === testCases.length) done();
        },
      });
    }
  });

  it("should sanitize sensitive fields from request body", (done) => {
    const context = createMockContext(
      "POST",
      "UsersController",
      "register",
      { id: "user-1" },
      {},
      { email: "test@test.com", password: "secret123", name: "Test" },
    );
    const next = createMockNext({ id: "new-user-1" });

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const logCall = auditLogService.log.mock.calls[0][0];
        expect(logCall.newValues.password).toBe("***");
        expect(logCall.newValues.email).toBe("test@test.com");
        expect(logCall.newValues.name).toBe("Test");
        done();
      },
    });
  });

  it("should not include body for DELETE requests", (done) => {
    const context = createMockContext(
      "DELETE",
      "ProductsController",
      "remove",
      { id: "user-1" },
      { id: "prod-1" },
      { someField: "value" },
    );
    const next = createMockNext();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const logCall = auditLogService.log.mock.calls[0][0];
        expect(logCall.newValues).toBeUndefined();
        done();
      },
    });
  });
});
