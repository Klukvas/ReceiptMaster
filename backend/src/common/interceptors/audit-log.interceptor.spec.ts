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
    path = "/api/v1/resource",
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
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

  it("masks requisites at any depth but keeps their field names", (done) => {
    const context = createMockContext(
      "PUT",
      "SettingsController",
      "update",
      { id: "u1" },
      {},
      {
        password: "secret",
        iban: "UA213223130000026007233566001",
        tax_id: "12345678",
        legal_address: "Kyiv",
        details: { contractRef: "No 5" },
        config: { company: { companyVatId: "123", companyName: "Acme" } },
        recipients: [{ legalName: "LLC", name: "Bob" }],
      },
    );

    interceptor.intercept(context, createMockNext()).subscribe({
      complete: () => {
        expect(auditLogService.log.mock.calls[0][0].newValues).toEqual({
          password: "***",
          iban: "***",
          tax_id: "***",
          legal_address: "***",
          details: { contractRef: "***" },
          config: { company: { companyVatId: "***", companyName: "Acme" } },
          recipients: [{ legalName: "***", name: "***" }],
        });
        done();
      },
    });
  });

  describe("multipart document requests", () => {
    const logged = (body: Record<string, unknown>) => {
      const context = createMockContext(
        "POST",
        "ReceiptsController",
        "createDocument",
        { id: "u1" },
        {},
        body,
      );
      interceptor.intercept(context, createMockNext()).subscribe();
      return auditLogService.log.mock.calls[0][0].newValues;
    };

    it("masks requisites inside the JSON payload string", () => {
      const newValues = logged({
        payload: JSON.stringify({
          type: "invoice",
          details: { contractRef: "No 5", buyerIban: "UA21" },
          config: {
            company: { companyTaxId: "12345678", companyName: "Acme" },
          },
        }),
      });

      expect(newValues).toEqual({
        payload: {
          type: "invoice",
          details: { contractRef: "***", buyerIban: "***" },
          config: { company: { companyTaxId: "***", companyName: "Acme" } },
        },
      });
    });

    it("hides a payload that is not JSON instead of logging it raw", () => {
      expect(logged({ payload: "iban=UA213223130000026007233566001" })).toEqual(
        {
          payload: "***",
        },
      );
    });
  });

  describe("personal data", () => {
    const logged = (
      controllerName: string,
      body: Record<string, unknown>,
      path?: string,
      handlerName = "create",
    ) => {
      const context = createMockContext(
        "POST",
        controllerName,
        handlerName,
        { id: "u1" },
        {},
        body,
        path,
      );
      interceptor.intercept(context, createMockNext()).subscribe();
      return auditLogService.log.mock.calls[0][0];
    };

    it.each([
      ["TelegramController", "/tg/webhook"],
      ["TelegramController", "/tg/order"],
      ["PaddleController", "/paddle/webhook"],
      // Express matches routes case-insensitively, so these reach the same handlers.
      ["TelegramController", "/TG/Webhook"],
      ["PaddleController", "/PADDLE/webhook"],
    ])("records %s %s without its body", (controllerName, path) => {
      const entry = logged(
        controllerName,
        { message: { chat: { id: 1 }, text: "my address" } },
        path,
      );

      expect(entry.newValues).toBeUndefined();
      expect(entry.action).toBe("CREATE");
    });

    it("masks a recipient's contact fields and keeps the rest", () => {
      expect(
        logged("RecipientsController", {
          name: "Іван Петренко",
          email: "ivan@example.com",
          phone: "+380501234567",
          address: "Kyiv",
          notes: "VIP",
        }).newValues,
      ).toEqual({
        name: "***",
        email: "***",
        phone: "***",
        address: "***",
        notes: "VIP",
      });
    });

    it("masks a recipient's contact fields whatever their JSON type", () => {
      expect(
        logged("RecipientsController", {
          name: "Іван",
          phone: 380501234567,
          address: { city: "Kyiv", street: "Khreshchatyk 1" },
          email: null,
        }).newValues,
      ).toEqual({ name: "***", phone: "***", address: "***", email: null });
    });

    it("masks a supplier's contact fields and notes and keeps the rest", () => {
      expect(
        logged("SuppliersController", {
          name: "ФОП Петренко",
          email: "supplier@example.com",
          phone: "+380501234567",
          address: "Kyiv",
          contactPerson: "Іван Іванов",
          notes: "calls after 18:00",
          isActive: true,
        }).newValues,
      ).toEqual({
        name: "***",
        email: "***",
        phone: "***",
        address: "***",
        contactPerson: "***",
        notes: "***",
        isActive: true,
      });
    });

    it("masks the reason of a void", () => {
      expect(
        logged(
          "ReceiptsController",
          { reason: "Ivan returned the goods" },
          undefined,
          "voidReceipt",
        ).newValues,
      ).toEqual({ reason: "***" });
    });

    it("keeps a product name, which is not personal data", () => {
      expect(
        logged("ProductsController", { name: "Widget", price: 5 }).newValues,
      ).toEqual({ name: "Widget", price: 5 });
    });

    it("masks company contacts and SWIFT but keeps visibility switches", () => {
      expect(
        logged("SettingsController", {
          config: {
            company: {
              companyEmail: "a@b.c",
              companyPhone: "+380",
              companySwift: "PBANUA2X",
              companyName: "Acme",
            },
            contacts: { recipientPhone: 380501234567 },
            visibility: {
              companyEmail: true,
              recipientPhone: false,
              companyAddress: true,
              companyTaxId: false,
              companyIban: true,
            },
          },
        }).newValues,
      ).toEqual({
        config: {
          company: {
            companyEmail: "***",
            companyPhone: "***",
            companySwift: "***",
            companyName: "Acme",
          },
          contacts: { recipientPhone: "***" },
          visibility: {
            companyEmail: true,
            recipientPhone: false,
            companyAddress: true,
            companyTaxId: false,
            companyIban: true,
          },
        },
      });
    });

    it("masks the free text of document details", () => {
      expect(
        logged("ReceiptsController", {
          details: {
            reason: "customer refused, see note",
            completionText: "Work done for Ivan",
            paymentTerms: "Ivan pays after delivery",
            deliveryTerms: "to Ivan's home, Kyiv",
            paymentTermDays: 3,
          },
          reason: "kept outside details",
        }).newValues,
      ).toEqual({
        details: {
          reason: "***",
          completionText: "***",
          paymentTerms: "***",
          deliveryTerms: "***",
          paymentTermDays: 3,
        },
        reason: "kept outside details",
      });
    });
  });

  describe("keys named after Object.prototype members", () => {
    const PROTOTYPE_KEYS = [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ];

    // JSON.parse makes `__proto__` an own data property, as express.json does.
    const bodyWith = (json: string) => JSON.parse(json) as Record<string, any>;

    it.each(PROTOTYPE_KEYS)("logs a body with a top-level %s key", (key) => {
      const body = bodyWith(`{"name":"x","${key}":{"a":1}}`);
      const context = createMockContext(
        "POST",
        "RecipientsController",
        "create",
        { id: "u1" },
        {},
        body,
      );
      const received: unknown[] = [];

      interceptor
        .intercept(context, createMockNext({ id: "r-1" }))
        .subscribe((value) => received.push(value));

      expect(received).toEqual([{ id: "r-1" }]);
      const entry = auditLogService.log.mock.calls[0][0];
      expect(entry.newValues?.name).toBe("***");
      expect(
        Object.getOwnPropertyDescriptor(entry.newValues, key)?.value,
      ).toEqual({ a: 1 });
    });

    it.each(PROTOTYPE_KEYS)("logs a body with a nested %s key", (key) => {
      const body = bodyWith(
        `{"recipient":{"${key}":{"email":"a@b.c"}},"items":[{"${key}":1}]}`,
      );
      const context = createMockContext(
        "POST",
        "OrdersController",
        "create",
        { id: "u1" },
        {},
        body,
      );

      interceptor.intercept(context, createMockNext()).subscribe();

      expect(auditLogService.log).toHaveBeenCalledTimes(1);
    });

    it("still answers with the handler's result when the audit entry cannot be built", () => {
      auditLogService.log.mockImplementation(() => {
        throw new Error("boom");
      });
      const context = createMockContext(
        "PATCH",
        "OrdersController",
        "cancel",
        { id: "u1" },
        { id: "o-1" },
        {},
      );
      const received: unknown[] = [];
      const errors: unknown[] = [];

      interceptor.intercept(context, createMockNext({ ok: true })).subscribe({
        next: (value) => received.push(value),
        error: (error) => errors.push(error),
      });

      expect(received).toEqual([{ ok: true }]);
      expect(errors).toEqual([]);
    });
  });
});
