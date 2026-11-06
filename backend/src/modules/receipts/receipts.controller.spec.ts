import { ReceiptsController } from "./receipts.controller";
import { User } from "../users/entities/user.entity";
import { DocumentType } from "./entities/receipt.entity";
import { ApiErrorResponse } from "../../common/errors/ApiError";

describe("ReceiptsController", () => {
  let controller: ReceiptsController;
  let receiptsService: any;
  const mockUser = { id: "user-1" } as User;
  const mockReq = { user: mockUser };

  beforeEach(() => {
    receiptsService = {
      getAvailablePrinters: jest.fn().mockResolvedValue([]),
      generateReceipt: jest.fn().mockResolvedValue({ id: "r1" }),
      generateCompactReceipt: jest.fn().mockResolvedValue({ id: "r1" }),
      generateStandardReceipt: jest.fn().mockResolvedValue({ id: "r1" }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: "r1" }),
      getReceiptPdf: jest.fn(),
      printReceipt: jest.fn().mockResolvedValue({ success: true }),
      voidReceipt: jest.fn().mockResolvedValue({ status: "void" }),
      generateTestReceipt: jest.fn(),
      regenerateReceiptPdf: jest.fn().mockResolvedValue({ id: "r1" }),
      generatePublicToken: jest
        .fn()
        .mockResolvedValue({ token: "abc123", url: "https://app/r/abc123" }),
      revokePublicToken: jest.fn().mockResolvedValue({ id: "r1" }),
      getRetention: jest
        .fn()
        .mockResolvedValue({ limit: 10, count: 0, replaces: null }),
    };

    controller = new ReceiptsController(receiptsService);
  });

  describe("getPrinters", () => {
    it("should return list of printers", async () => {
      const result = await controller.getPrinters();
      expect(result).toEqual([]);
      expect(receiptsService.getAvailablePrinters).toHaveBeenCalled();
    });
  });

  describe("createReceipt", () => {
    it("should create receipt for order", () => {
      const _result = controller.createReceipt("order-1", mockReq);
      expect(receiptsService.generateReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
        { logoAction: "keep" },
        undefined,
      );
    });
  });

  describe("createCompactReceipt", () => {
    it("should create compact receipt", () => {
      const _result = controller.createCompactReceipt("order-1", mockReq);
      expect(receiptsService.generateReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
        { logoAction: "keep" },
        undefined,
      );
    });
  });

  describe("createStandardReceipt", () => {
    it("should create standard receipt", () => {
      const _result = controller.createStandardReceipt("order-1", mockReq);
      expect(receiptsService.generateReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
        { logoAction: "keep" },
        undefined,
      );
    });
  });

  describe("findAll", () => {
    it("should return all receipts", async () => {
      const _result = await controller.findAll(mockReq, undefined, undefined);
      expect(receiptsService.findAll).toHaveBeenCalledWith(mockUser, {
        offset: undefined,
        limit: undefined,
      });
    });
  });

  describe("retention", () => {
    it("uses the service default (waybill) when no type is given", async () => {
      await controller.retention(mockReq);
      expect(receiptsService.getRetention).toHaveBeenCalledWith(mockUser);
    });

    it("passes a valid document type through", async () => {
      await controller.retention(mockReq, "invoice");
      expect(receiptsService.getRetention).toHaveBeenCalledWith(
        mockUser,
        DocumentType.INVOICE,
      );
    });

    it.each(["bogus", "", "INVOICE"])(
      "rejects %p with 400 VALIDATION_ERROR",
      async (type) => {
        const error = await controller
          .retention(mockReq, type)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ApiErrorResponse);
        expect(error).toMatchObject({
          errorCode: "VALIDATION_ERROR",
          statusCode: 400,
        });
        expect(receiptsService.getRetention).not.toHaveBeenCalled();
      },
    );
  });

  describe("findOne", () => {
    it("should return a single receipt", () => {
      const _result = controller.findOne("r1", mockReq);
      expect(receiptsService.findOne).toHaveBeenCalledWith("r1", mockUser);
    });
  });

  describe("getPdf", () => {
    it("should serve PDF buffer with headers", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 fake pdf content");
      receiptsService.getReceiptPdf.mockResolvedValue({
        buffer: pdfBuffer,
        filename: "receipt.pdf",
      });

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getPdf("r1", mockRes, mockReq);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/pdf",
        }),
      );
      expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it("should return 400 if file is not a valid PDF", async () => {
      const notPdfBuffer = Buffer.from("This is not a PDF");
      receiptsService.getReceiptPdf.mockResolvedValue({
        buffer: notPdfBuffer,
        filename: "receipt.pdf",
      });

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getPdf("r1", mockRes, mockReq);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it("should return 500 on error", async () => {
      receiptsService.getReceiptPdf.mockRejectedValue(
        new Error("PDF not found"),
      );

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getPdf("r1", mockRes, mockReq);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe("printReceipt", () => {
    it("should send receipt to printer", async () => {
      const _result = await controller.printReceipt("r1", mockReq, "HP");

      expect(receiptsService.printReceipt).toHaveBeenCalledWith(
        "r1",
        mockUser,
        "HP",
      );
    });

    it("should work without specifying printer", async () => {
      const _result = await controller.printReceipt("r1", mockReq);

      expect(receiptsService.printReceipt).toHaveBeenCalledWith(
        "r1",
        mockUser,
        undefined,
      );
    });
  });

  describe("voidReceipt", () => {
    it("should void a receipt with reason", async () => {
      const _result = await controller.voidReceipt(
        "r1",
        { reason: "Duplicate" },
        mockReq,
      );

      expect(receiptsService.voidReceipt).toHaveBeenCalledWith(
        "r1",
        mockUser,
        "Duplicate",
      );
    });
  });

  describe("testPreview", () => {
    it("should generate and serve test PDF", async () => {
      const pdfBuffer = Buffer.from("test pdf");
      receiptsService.generateTestReceipt.mockResolvedValue(pdfBuffer);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.testPreview(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/pdf",
        }),
      );
      expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it("should return 500 on error", async () => {
      receiptsService.generateTestReceipt.mockRejectedValue(
        new Error("Gen failed"),
      );

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.testPreview(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe("regenerateReceiptPdf", () => {
    it("should regenerate PDF for receipt", async () => {
      const _result = await controller.regenerateReceiptPdf("r1", mockReq);

      expect(receiptsService.regenerateReceiptPdf).toHaveBeenCalledWith(
        "r1",
        mockUser,
        {
          mode: "reproduce",
          expectedActiveRevision: undefined,
          confirmReconstruction: undefined,
          selection: { logoAction: "keep" },
        },
        undefined,
      );
    });
  });

  describe("shareReceipt", () => {
    it("should generate a public share link", async () => {
      const result = await controller.shareReceipt("r1", mockReq);

      expect(receiptsService.generatePublicToken).toHaveBeenCalledWith(
        "r1",
        mockUser,
      );
      expect(result).toEqual({
        token: "abc123",
        url: "https://app/r/abc123",
      });
    });
  });

  describe("revokeShareReceipt", () => {
    it("should revoke public share link", async () => {
      const _result = await controller.revokeShareReceipt("r1", mockReq);

      expect(receiptsService.revokePublicToken).toHaveBeenCalledWith(
        "r1",
        mockUser,
      );
    });
  });
});

describe("ReceiptsController: POST orders/:orderId/documents", () => {
  const user = { id: "user-1" } as User;
  const req = { user };
  const service = {
    generateDocument: jest.fn().mockResolvedValue({ id: "r1" }),
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };
  const controller = new ReceiptsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it("passes the type, the design selection and the details to the service", async () => {
    await controller.createDocument("order-1", req, {
      type: "invoice",
      details: { paymentTermDays: 7 },
    });
    expect(service.generateDocument).toHaveBeenCalledWith(
      "order-1",
      user,
      DocumentType.INVOICE,
      expect.objectContaining({ logoAction: "keep" }),
      { paymentTermDays: 7 },
      undefined,
    );
  });

  it.each(["sales_receipt", "packing_list"])(
    "accepts %s without details and rejects details on it",
    async (type) => {
      await controller.createDocument("order-1", req, { type });
      expect(service.generateDocument).toHaveBeenCalledWith(
        "order-1",
        req.user,
        type,
        expect.objectContaining({ logoAction: "keep" }),
        undefined,
        undefined,
      );
      await expect(
        controller.createDocument("order-1", req, {
          type,
          details: { contractRef: "x" },
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it("defaults the details of an act and gives a waybill none", async () => {
    await controller.createDocument("order-1", req, { type: "act" });
    expect(service.generateDocument.mock.calls[0][4]).toEqual({});
    await controller.createDocument("order-1", req, { type: "waybill" });
    expect(service.generateDocument.mock.calls[1][4]).toBeUndefined();
  });

  it.each(["return_note"])(
    "refuses %s with DOCUMENT_TYPE_NOT_SUPPORTED",
    async (type) => {
      await expect(
        controller.createDocument("order-1", req, { type }),
      ).rejects.toMatchObject({
        errorCode: "DOCUMENT_TYPE_NOT_SUPPORTED",
        statusCode: 400,
      });
      expect(service.generateDocument).not.toHaveBeenCalled();
    },
  );

  it.each([{ type: "contract" }, {}, { type: 5 }])(
    "refuses %j as a validation error",
    async (body) => {
      await expect(
        controller.createDocument("order-1", req, body),
      ).rejects.toMatchObject({ errorCode: "VALIDATION_ERROR" });
    },
  );

  it("judges the details only after the type is known", async () => {
    await expect(
      controller.createDocument("order-1", req, {
        type: "invoice",
        details: { dueDate: "2026-02-30" },
      }),
    ).rejects.toMatchObject({ errorCode: "VALIDATION_ERROR" });
  });

  it("filters the list by a known type and rejects an unknown one", async () => {
    await controller.findAll(req, undefined, undefined, "invoice");
    expect(service.findAll).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ type: DocumentType.INVOICE }),
    );
    await expect(
      controller.findAll(req, undefined, undefined, "nope"),
    ).rejects.toBeInstanceOf(ApiErrorResponse);
  });
});
