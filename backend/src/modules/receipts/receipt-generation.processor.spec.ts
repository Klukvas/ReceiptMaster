// Mock playwright before any imports
jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn(),
      close: jest.fn(),
    }),
  },
}));

jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from("fake-pdf")),
  access: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue("abc123hash"),
  })),
  randomBytes: jest.fn(() => Buffer.from("random")),
}));

// Mock react-pdf
jest.mock("@react-pdf/renderer", () => ({
  renderToBuffer: jest.fn(),
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  StyleSheet: { create: (s: any) => s },
  Font: { register: jest.fn() },
}));

import {
  ReceiptGenerationProcessor,
  ReceiptGenerationJobData,
} from "./receipt-generation.processor";
import { tenantStore } from "../../common/tenancy/tenant-context";
import { ReceiptStatus } from "./entities/receipt.entity";
import { ReceiptStyle } from "./services/pdf-generator.service";

describe("ReceiptGenerationProcessor", () => {
  let processor: ReceiptGenerationProcessor;
  let receiptsRepository: any;
  let ordersRepository: any;
  let dataSource: any;
  let pdfGeneratorService: any;
  let pdfStorageService: any;
  let settingsService: any;
  let receiptsGateway: any;

  beforeEach(() => {
    receiptsRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    ordersRepository = {
      findOne: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(),
    };

    pdfGeneratorService = {
      generateReceiptPdf: jest.fn().mockResolvedValue({
        filePath: "/path/to/receipt.pdf",
        url: "https://s3/receipt.pdf",
        html: "<html>receipt</html>",
      }),
    };

    pdfStorageService = {
      parseObjectStoragePath: jest.fn(),
      downloadFile: jest.fn(),
    };

    settingsService = {
      getAllPdfSettings: jest.fn().mockResolvedValue({
        companyInfo: { companyName: "Test Corp" },
        templateId: "standard",
        receiptTitle: "Invoice",
        templateLanguage: "en",
        footerTitle: "Thanks",
        footerSubtitle: undefined,
      }),
    };

    receiptsGateway = {
      emitProgress: jest.fn(),
      emitCompleted: jest.fn(),
      emitFailed: jest.fn(),
    };

    processor = new ReceiptGenerationProcessor(
      receiptsRepository,
      ordersRepository,
      dataSource,
      pdfGeneratorService,
      pdfStorageService,
      settingsService,
      receiptsGateway,
    );
  });

  describe("process", () => {
    const mockJob = {
      data: {
        receiptId: "receipt-1",
        orderId: "order-1",
        userId: "11111111-1111-4111-8111-111111111111",
        generationId: "generation-1",
      } as ReceiptGenerationJobData,
    };

    it("should process receipt generation successfully", async () => {
      ordersRepository.findOne.mockImplementation(async () => {
        expect(tenantStore.getStore()).toEqual({
          userId: "11111111-1111-4111-8111-111111111111",
        });
        return { id: "order-1", recipient: { name: "John" }, items: [] };
      });

      receiptsRepository.findOne.mockResolvedValue({
        id: "receipt-1",
        number: "2025-000001",
        status: ReceiptStatus.PROCESSING,
        generation_id: "generation-1",
      });

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return cb(manager);
      });

      await processor.process(mockJob as any);

      expect(receiptsGateway.emitProgress).toHaveBeenCalled();
      expect(receiptsGateway.emitCompleted).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        expect.objectContaining({
          receiptId: "receipt-1",
          orderId: "order-1",
          pdfUrl: "https://s3/receipt.pdf",
        }),
      );
    });

    it("throws for missing order so BullMQ retries", async () => {
      receiptsRepository.findOne.mockResolvedValue({
        status: ReceiptStatus.PROCESSING,
        generation_id: "generation-1",
      });
      ordersRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(mockJob as any)).rejects.toThrow(
        "Order not found",
      );
      expect(receiptsGateway.emitFailed).not.toHaveBeenCalled();
    });

    it("should return early if receipt not in PROCESSING state", async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      receiptsRepository.findOne.mockResolvedValue({
        id: "receipt-1",
        status: ReceiptStatus.GENERATED, // not PROCESSING
      });

      await processor.process(mockJob as any);

      expect(pdfGeneratorService.generateReceiptPdf).not.toHaveBeenCalled();
    });

    it("throws for a missing receipt so BullMQ retries", async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      receiptsRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(mockJob as any)).rejects.toThrow(
        "Receipt is not visible yet",
      );

      expect(pdfGeneratorService.generateReceiptPdf).not.toHaveBeenCalled();
    });

    it("should handle object storage paths", async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      receiptsRepository.findOne.mockResolvedValue({
        id: "receipt-1",
        number: "2025-000001",
        status: ReceiptStatus.PROCESSING,
        generation_id: "generation-1",
      });

      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://bucket/key.pdf",
        url: "https://s3/receipt.pdf",
        html: "<html>receipt</html>",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });

      pdfStorageService.downloadFile.mockResolvedValue(
        Buffer.from("pdf-content"),
      );

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return cb(manager);
      });

      await processor.process(mockJob as any);

      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "bucket",
        "key.pdf",
      );
    });

    it("should throw on invalid object storage path", async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      receiptsRepository.findOne.mockResolvedValue({
        id: "receipt-1",
        number: "2025-000001",
        status: ReceiptStatus.PROCESSING,
        generation_id: "generation-1",
      });

      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://invalid",
        url: "https://s3/receipt.pdf",
        html: "<html>receipt</html>",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      // process() rethrows so BullMQ can retry; the receipt is only marked
      // failed once retries are exhausted (see the onFailed tests).
      await expect(processor.process(mockJob as any)).rejects.toThrow();
    });

    it("should throw on PDF generation failure", async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      receiptsRepository.findOne.mockResolvedValue({
        id: "receipt-1",
        number: "2025-000001",
        status: ReceiptStatus.PROCESSING,
        generation_id: "generation-1",
      });

      pdfGeneratorService.generateReceiptPdf.mockRejectedValue(
        new Error("PDF gen failed"),
      );

      await expect(processor.process(mockJob as any)).rejects.toThrow(
        "PDF gen failed",
      );
    });

    it("ignores superseded generations", async () => {
      receiptsRepository.findOne.mockResolvedValue({
        status: ReceiptStatus.PROCESSING,
        generation_id: "new-generation",
      });
      await processor.process(mockJob as any);
      expect(pdfGeneratorService.generateReceiptPdf).not.toHaveBeenCalled();
      expect(receiptsRepository.update).not.toHaveBeenCalled();
    });
  });

  it("does not emit progress when its conditional generation update loses the race", async () => {
    receiptsRepository.update.mockResolvedValueOnce({ affected: 0 });
    await (processor as any).updateProgress(
      "receipt-1",
      "order-1",
      "11111111-1111-4111-8111-111111111111",
      40,
      "generating_pdf",
      "old-generation",
    );
    expect(receiptsGateway.emitProgress).not.toHaveBeenCalled();
  });

  describe("onFailed", () => {
    const jobData = {
      receiptId: "receipt-1",
      orderId: "order-1",
      userId: "11111111-1111-4111-8111-111111111111",
      generationId: "generation-1",
    } as ReceiptGenerationJobData;

    it("marks the receipt FAILED once retries are exhausted", async () => {
      receiptsRepository.update.mockImplementation(async () => {
        expect(tenantStore.getStore()).toEqual({
          userId: "11111111-1111-4111-8111-111111111111",
        });
        return { affected: 1 };
      });
      const job = {
        data: jobData,
        opts: { attempts: 3 },
        attemptsMade: 3,
      };

      await processor.onFailed(job as any, new Error("S3 unavailable"));

      expect(receiptsRepository.update).toHaveBeenCalledWith(
        {
          id: "receipt-1",
          user_id: "11111111-1111-4111-8111-111111111111",
          generation_id: "generation-1",
          status: ReceiptStatus.PROCESSING,
        },
        expect.objectContaining({
          status: ReceiptStatus.FAILED,
          error_message: "S3 unavailable",
        }),
      );
      expect(receiptsGateway.emitFailed).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        expect.objectContaining({ receiptId: "receipt-1" }),
      );
    });

    it("leaves the receipt PROCESSING while retries remain", async () => {
      const job = {
        data: jobData,
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      await processor.onFailed(job as any, new Error("transient"));

      expect(receiptsRepository.update).not.toHaveBeenCalled();
      expect(receiptsGateway.emitFailed).not.toHaveBeenCalled();
    });
  });

  describe("getReceiptStyleFromTemplateId", () => {
    it("should map known template IDs to styles", () => {
      const getStyle = (processor as any).getReceiptStyleFromTemplateId.bind(
        processor,
      );

      expect(getStyle("standard")).toBe(ReceiptStyle.STANDARD);
      expect(getStyle("compact")).toBe(ReceiptStyle.COMPACT);
      expect(getStyle("classic")).toBe(ReceiptStyle.CLASSIC);
      expect(getStyle("modern")).toBe(ReceiptStyle.MODERN);
      expect(getStyle("elegant")).toBe(ReceiptStyle.ELEGANT);
      expect(getStyle("vintage")).toBe(ReceiptStyle.VINTAGE);
      expect(getStyle("tech")).toBe(ReceiptStyle.TECH);
      expect(getStyle("wave")).toBe(ReceiptStyle.WAVE);
      expect(getStyle("minimal")).toBe(ReceiptStyle.MINIMAL);
      expect(getStyle("corporate")).toBe(ReceiptStyle.CORPORATE);
    });

    it("should default to COMPACT for unknown template IDs", () => {
      const getStyle = (processor as any).getReceiptStyleFromTemplateId.bind(
        processor,
      );

      expect(getStyle("unknown")).toBe(ReceiptStyle.COMPACT);
      expect(getStyle("")).toBe(ReceiptStyle.COMPACT);
    });
  });
});
