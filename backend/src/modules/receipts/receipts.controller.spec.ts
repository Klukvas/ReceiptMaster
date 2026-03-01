import { ReceiptsController } from "./receipts.controller";
import { User } from "../users/entities/user.entity";

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
      findAll: jest.fn().mockResolvedValue([]),
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
      const result = controller.createReceipt("order-1", mockReq);
      expect(receiptsService.generateReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
      );
    });
  });

  describe("createCompactReceipt", () => {
    it("should create compact receipt", () => {
      const result = controller.createCompactReceipt("order-1", mockReq);
      expect(receiptsService.generateCompactReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
      );
    });
  });

  describe("createStandardReceipt", () => {
    it("should create standard receipt", () => {
      const result = controller.createStandardReceipt("order-1", mockReq);
      expect(receiptsService.generateStandardReceipt).toHaveBeenCalledWith(
        "order-1",
        mockUser,
      );
    });
  });

  describe("findAll", () => {
    it("should return all receipts", () => {
      const result = controller.findAll(mockReq, undefined, undefined);
      expect(receiptsService.findAll).toHaveBeenCalledWith(mockUser, {
        offset: undefined,
        limit: undefined,
      });
    });
  });

  describe("findOne", () => {
    it("should return a single receipt", () => {
      const result = controller.findOne("r1", mockReq);
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
      const result = await controller.printReceipt("r1", mockReq, "HP");

      expect(receiptsService.printReceipt).toHaveBeenCalledWith(
        "r1",
        mockUser,
        "HP",
      );
    });

    it("should work without specifying printer", async () => {
      const result = await controller.printReceipt("r1", mockReq);

      expect(receiptsService.printReceipt).toHaveBeenCalledWith(
        "r1",
        mockUser,
        undefined,
      );
    });
  });

  describe("voidReceipt", () => {
    it("should void a receipt with reason", async () => {
      const result = await controller.voidReceipt(
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
      const result = await controller.regenerateReceiptPdf("r1", mockReq);

      expect(receiptsService.regenerateReceiptPdf).toHaveBeenCalledWith(
        "r1",
        mockUser,
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
      const result = await controller.revokeShareReceipt("r1", mockReq);

      expect(receiptsService.revokePublicToken).toHaveBeenCalledWith(
        "r1",
        mockUser,
      );
    });
  });
});
