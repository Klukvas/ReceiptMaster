import { PublicReceiptsController } from "./public-receipts.controller";

describe("PublicReceiptsController", () => {
  let controller: PublicReceiptsController;
  let receiptsService: any;

  beforeEach(() => {
    receiptsService = {
      getPublicReceipt: jest.fn().mockResolvedValue({
        receipt: { id: "r1", number: "2025-000001" },
        companyInfo: { companyName: "Test Corp" },
      }),
      getPublicReceiptPdf: jest.fn(),
    };

    controller = new PublicReceiptsController(receiptsService);
  });

  describe("getPublicReceipt", () => {
    it("should return receipt data for valid token", async () => {
      const result = await controller.getPublicReceipt("valid-token");

      expect(receiptsService.getPublicReceipt).toHaveBeenCalledWith(
        "valid-token",
      );
      expect(result).toEqual({
        receipt: { id: "r1", number: "2025-000001" },
        companyInfo: { companyName: "Test Corp" },
      });
    });

    it("should propagate errors for invalid token", async () => {
      receiptsService.getPublicReceipt.mockRejectedValue(
        new Error("Not found"),
      );

      await expect(
        controller.getPublicReceipt("bad-token"),
      ).rejects.toThrow("Not found");
    });
  });

  describe("getPublicReceiptPdf", () => {
    it("should serve PDF buffer with correct headers", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 content");
      receiptsService.getPublicReceiptPdf.mockResolvedValue({
        buffer: pdfBuffer,
        filename: "receipt-2025-000001.pdf",
      });

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getPublicReceiptPdf("valid-token", mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="receipt-2025-000001.pdf"',
        }),
      );
      expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it("should return error status when PDF not found", async () => {
      const error = { statusCode: 404, message: "Receipt not found" };
      receiptsService.getPublicReceiptPdf.mockRejectedValue(error);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getPublicReceiptPdf("bad-token", mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Receipt not found" }),
      );
    });

    it("should return 500 for unknown errors", async () => {
      receiptsService.getPublicReceiptPdf.mockRejectedValue(
        new Error("Unexpected"),
      );

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getPublicReceiptPdf("token", mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
