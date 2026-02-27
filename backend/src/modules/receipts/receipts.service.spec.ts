// Mock fs/promises, crypto, and child_process before any imports
jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from("fake-pdf")),
  access: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const mockExecPromise = jest
  .fn()
  .mockResolvedValue({ stdout: "Printer1\nPrinter2\n", stderr: "" });

jest.mock("child_process", () => {
  const execFn = jest.fn();
  const customSymbol =
    Symbol.for("nodejs.util.promisify.custom") ||
    require("util").promisify.custom;
  execFn[customSymbol] = (...args: any[]) => mockExecPromise(...args);
  return { exec: execFn };
});

import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken, getDataSourceToken } from "@nestjs/typeorm";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { ReceiptsService } from "./receipts.service";
import { Receipt, ReceiptStatus } from "./entities/receipt.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import {
  PdfGeneratorService,
  ReceiptStyle,
} from "./services/pdf-generator.service";
import { PdfStorageService } from "../../common/services/pdf-storage.service";
import { SettingsService } from "../settings/services/settings.service";
import { ApiErrorResponse } from "../../common/errors/ApiError";
import { User } from "../users/entities/user.entity";
import { RECEIPT_GENERATION_QUEUE } from "./receipt-generation.processor";
import * as fs from "fs/promises";

describe("ReceiptsService", () => {
  let service: ReceiptsService;
  let receiptsRepo: any;
  let ordersRepo: any;
  let dataSource: any;
  let pdfGeneratorService: any;
  let pdfStorageService: any;
  let settingsService: any;
  let receiptQueue: any;
  const mockUser = { id: "user-1" } as User;

  const mockReceipt: Partial<Receipt> = {
    id: "receipt-1",
    order_id: "order-1",
    number: "2025-000001",
    status: ReceiptStatus.GENERATED,
    pdf_path: "/path/to/receipt.pdf",
    user_id: "user-1",
  };

  const mockOrder: Partial<Order> = {
    id: "order-1",
    recipient_id: "rec-1",
    status: OrderStatus.CONFIRMED,
    total_cents: 5000,
    currency: "UAH",
    user_id: "user-1",
    items: [],
    recipient: { name: "John", email: "john@test.com" } as any,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    receiptsRepo = {
      find: jest.fn().mockResolvedValue([mockReceipt]),
      findOne: jest.fn(),
      save: jest.fn((data) => Promise.resolve(data)),
      delete: jest.fn(),
    };

    ordersRepo = {
      findOne: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(),
      query: jest.fn(),
    };

    pdfGeneratorService = {
      generateReceiptPdf: jest.fn().mockResolvedValue({
        filePath: "/path/to/new-receipt.pdf",
        url: "https://s3/receipt.pdf",
      }),
    };

    pdfStorageService = {
      parseObjectStoragePath: jest.fn(),
      downloadFile: jest.fn(),
      deleteFile: jest.fn(),
      fileExists: jest.fn(),
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

    receiptQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: getRepositoryToken(Receipt), useValue: receiptsRepo },
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: PdfGeneratorService, useValue: pdfGeneratorService },
        { provide: PdfStorageService, useValue: pdfStorageService },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SettingsService, useValue: settingsService },
        {
          provide: getQueueToken(RECEIPT_GENERATION_QUEUE),
          useValue: receiptQueue,
        },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
  });

  describe("findAll", () => {
    it("should return all receipts for user", async () => {
      const result = await service.findAll(mockUser);

      expect(result).toEqual([mockReceipt]);
      expect(receiptsRepo.find).toHaveBeenCalledWith({
        where: { user_id: "user-1" },
        relations: ["order", "order.recipient"],
        order: { created_at: "DESC" },
      });
    });
  });

  describe("findOne", () => {
    it("should return a receipt with relations", async () => {
      receiptsRepo.findOne.mockResolvedValue(mockReceipt);

      const result = await service.findOne("receipt-1", mockUser);

      expect(result).toEqual(mockReceipt);
    });

    it("should throw if receipt not found", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("unknown", mockUser)).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("generateReceipt", () => {
    it("should create a receipt and enqueue PDF generation", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(mockOrder) // order lookup
            .mockResolvedValueOnce(null), // existing receipt check
          create: jest.fn((entity, data) => ({ ...data })),
          save: jest.fn((entity, data) =>
            Promise.resolve({ id: "receipt-1", ...data }),
          ),
          count: jest.fn().mockResolvedValue(0),
          find: jest.fn().mockResolvedValue([]),
          delete: jest.fn(),
        };
        return cb(manager);
      });

      dataSource.query.mockResolvedValue([{ receipt_number: "2025-000001" }]);

      const result = await service.generateReceipt("order-1", mockUser);

      expect(result).toBeDefined();
      expect(receiptQueue.add).toHaveBeenCalledWith(
        "generate",
        expect.objectContaining({
          orderId: "order-1",
          userId: "user-1",
        }),
        expect.any(Object),
      );
    });

    it("should throw if order not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await expect(
        service.generateReceipt("unknown", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if order is not confirmed", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockOrder,
            status: OrderStatus.DRAFT,
          }),
        };
        return cb(manager);
      });

      await expect(
        service.generateReceipt("order-1", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should return existing receipt if already processing", async () => {
      const processingReceipt = {
        ...mockReceipt,
        status: ReceiptStatus.PROCESSING,
      };

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(mockOrder)
            .mockResolvedValueOnce(processingReceipt),
        };
        return cb(manager);
      });

      const result = await service.generateReceipt("order-1", mockUser);

      expect(result).toEqual(processingReceipt);
    });

    it("should throw if receipt already exists (generated)", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(mockOrder)
            .mockResolvedValueOnce({
              ...mockReceipt,
              status: ReceiptStatus.GENERATED,
            }),
        };
        return cb(manager);
      });

      await expect(
        service.generateReceipt("order-1", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("generateCompactReceipt", () => {
    it("should delegate to generateReceipt", async () => {
      const spy = jest
        .spyOn(service, "generateReceipt")
        .mockResolvedValue(mockReceipt as Receipt);

      await service.generateCompactReceipt("order-1", mockUser);

      expect(spy).toHaveBeenCalledWith("order-1", mockUser);
    });
  });

  describe("generateStandardReceipt", () => {
    it("should delegate to generateReceipt", async () => {
      const spy = jest
        .spyOn(service, "generateReceipt")
        .mockResolvedValue(mockReceipt as Receipt);

      await service.generateStandardReceipt("order-1", mockUser);

      expect(spy).toHaveBeenCalledWith("order-1", mockUser);
    });
  });

  describe("voidReceipt", () => {
    it("should void a receipt and unlock order", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockReceipt,
            status: ReceiptStatus.GENERATED,
            order: mockOrder,
          }),
          save: jest.fn((entity, data) => Promise.resolve(data)),
          update: jest.fn(),
        };
        return cb(manager);
      });

      const result = await service.voidReceipt(
        "receipt-1",
        mockUser,
        "Duplicate",
      );

      expect(result.status).toBe(ReceiptStatus.VOID);
      expect(result.void_reason).toBe("Duplicate");
    });

    it("should throw if receipt not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await expect(
        service.voidReceipt("unknown", mockUser, "reason"),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if receipt already voided", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockReceipt,
            status: ReceiptStatus.VOID,
          }),
        };
        return cb(manager);
      });

      await expect(
        service.voidReceipt("receipt-1", mockUser, "reason"),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("deleteReceiptFilesForOrder", () => {
    it("should delete receipt files and records", async () => {
      receiptsRepo.find.mockResolvedValue([
        { ...mockReceipt, pdf_path: "/local/file.pdf" },
      ]);

      await service.deleteReceiptFilesForOrder("order-1");

      expect(receiptsRepo.delete).toHaveBeenCalledWith({
        order_id: "order-1",
      });
    });

    it("should handle object storage paths", async () => {
      receiptsRepo.find.mockResolvedValue([
        {
          ...mockReceipt,
          pdf_path: "object-storage://bucket/key.pdf",
        },
      ]);
      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });

      await service.deleteReceiptFilesForOrder("order-1");

      expect(pdfStorageService.deleteFile).toHaveBeenCalledWith(
        "bucket",
        "key.pdf",
      );
    });

    it("should handle no receipts gracefully", async () => {
      receiptsRepo.find.mockResolvedValue([]);

      await expect(
        service.deleteReceiptFilesForOrder("order-1"),
      ).resolves.toBeUndefined();
    });

    it("should not throw on delete error", async () => {
      receiptsRepo.find.mockRejectedValue(new Error("DB error"));

      await expect(
        service.deleteReceiptFilesForOrder("order-1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getReceiptPdf", () => {
    it("should throw if receipt has no pdf_path", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: null,
      });

      await expect(
        service.getReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should return PDF buffer from local file", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "/local/receipt.pdf",
      });

      const result = await service.getReceiptPdf("receipt-1", mockUser);

      expect(result.filename).toBe("receipt-2025-000001.pdf");
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(fs.access).toHaveBeenCalledWith("/local/receipt.pdf");
    });

    it("should return PDF buffer from object storage", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/key.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(true);
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("pdf-data"));

      const result = await service.getReceiptPdf("receipt-1", mockUser);

      expect(result.filename).toBe("receipt-2025-000001.pdf");
      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "bucket",
        "key.pdf",
      );
    });

    it("should throw on invalid object storage path", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://invalid",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      await expect(
        service.getReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow();
    });

    it("should regenerate PDF when local file not found", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "/local/missing.pdf",
        order_id: "order-1",
      });

      (fs.access as jest.Mock).mockRejectedValueOnce(
        new Error("file not found"),
      );

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      const result = await service.getReceiptPdf("receipt-1", mockUser);

      expect(result.filename).toBe("receipt-2025-000001.pdf");
      expect(pdfGeneratorService.generateReceiptPdf).toHaveBeenCalled();
      expect(receiptsRepo.save).toHaveBeenCalled();
    });

    it("should regenerate PDF when file not found in object storage", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/old.pdf",
        order_id: "order-1",
      });

      pdfStorageService.parseObjectStoragePath
        .mockReturnValueOnce({ bucket: "bucket", key: "old.pdf" })
        .mockReturnValueOnce(null); // for new local path
      pdfStorageService.fileExists.mockResolvedValue(false);

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      const result = await service.getReceiptPdf("receipt-1", mockUser);

      expect(pdfGeneratorService.generateReceiptPdf).toHaveBeenCalled();
    });

    it("should regenerate and read from object storage", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/old.pdf",
        order_id: "order-1",
      });

      pdfStorageService.parseObjectStoragePath
        .mockReturnValueOnce({ bucket: "bucket", key: "old.pdf" })
        .mockReturnValueOnce({ bucket: "new-bucket", key: "new.pdf" }); // for regenerated
      pdfStorageService.fileExists.mockResolvedValue(false);
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("new-pdf"));

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://new-bucket/new.pdf",
        url: "https://s3/new.pdf",
      });

      const result = await service.getReceiptPdf("receipt-1", mockUser);

      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "new-bucket",
        "new.pdf",
      );
    });

    it("should throw if regeneration fails with order not found", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "/local/missing.pdf",
        order_id: "order-1",
      });

      (fs.access as jest.Mock).mockRejectedValueOnce(
        new Error("file not found"),
      );
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow();
    });
  });

  describe("generateTestReceipt", () => {
    it("should generate test PDF from local file path", async () => {
      const result = await service.generateTestReceipt(mockUser);

      expect(settingsService.getAllPdfSettings).toHaveBeenCalledWith("user-1");
      expect(pdfGeneratorService.generateReceiptPdf).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
        "TEST-000001",
        { companyName: "Test Corp" },
        "user-1",
        ReceiptStyle.STANDARD,
        "Invoice",
        "en",
        "Thanks",
        undefined,
      );
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should generate test PDF from object storage", async () => {
      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://bucket/key.pdf",
        url: "https://s3/receipt.pdf",
      });
      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("pdf-data"));
      pdfStorageService.deleteFile.mockResolvedValue(undefined);

      const result = await service.generateTestReceipt(mockUser);

      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "bucket",
        "key.pdf",
      );
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should throw on invalid object storage path", async () => {
      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://invalid",
        url: "https://s3/receipt.pdf",
      });
      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      await expect(service.generateTestReceipt(mockUser)).rejects.toThrow();
    });

    it("should handle cleanup error gracefully for object storage", async () => {
      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://bucket/key.pdf",
        url: "https://s3/receipt.pdf",
      });
      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("pdf-data"));
      pdfStorageService.deleteFile.mockRejectedValue(
        new Error("delete failed"),
      );

      const result = await service.generateTestReceipt(mockUser);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should handle cleanup error gracefully for local file", async () => {
      (fs.unlink as jest.Mock).mockRejectedValueOnce(
        new Error("unlink failed"),
      );

      const result = await service.generateTestReceipt(mockUser);
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe("regenerateReceiptPdf", () => {
    it("should regenerate PDF and update receipt", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        order_id: "order-1",
      });

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      const result = await service.regenerateReceiptPdf("receipt-1", mockUser);

      expect(result.pdf_path).toBe("/path/to/new-receipt.pdf");
      expect(result.hash).toBeDefined();
    });

    it("should delete old file from object storage before regenerating", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/old.pdf",
        order_id: "order-1",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "old.pdf",
      });
      pdfStorageService.deleteFile.mockResolvedValue(undefined);

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      await service.regenerateReceiptPdf("receipt-1", mockUser);

      expect(pdfStorageService.deleteFile).toHaveBeenCalledWith(
        "bucket",
        "old.pdf",
      );
    });

    it("should handle old file deletion error gracefully", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        order_id: "order-1",
      });

      (fs.unlink as jest.Mock).mockRejectedValueOnce(
        new Error("unlink failed"),
      );

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      const result = await service.regenerateReceiptPdf("receipt-1", mockUser);
      expect(result.pdf_path).toBe("/path/to/new-receipt.pdf");
    });

    it("should throw if order not found", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: null,
        order_id: "order-1",
      });

      ordersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.regenerateReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow();
    });

    it("should read new file from object storage for hash", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: null,
        order_id: "order-1",
      });

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://bucket/new.pdf",
        url: "https://s3/new.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "new.pdf",
      });
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("new-pdf"));

      const result = await service.regenerateReceiptPdf("receipt-1", mockUser);

      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "bucket",
        "new.pdf",
      );
      expect(result.hash).toBeDefined();
    });

    it("should throw on invalid new object storage path", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: null,
        order_id: "order-1",
      });

      ordersRepo.findOne.mockResolvedValue({
        id: "order-1",
        recipient: { name: "John" },
        items: [],
      });

      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://invalid",
        url: "https://s3/new.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      await expect(
        service.regenerateReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow();
    });
  });

  describe("getReceiptStyleFromTemplateId", () => {
    it("should map known template IDs", () => {
      const getStyle = (service as any).getReceiptStyleFromTemplateId.bind(
        service,
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

    it("should fall back to COMPACT for unknown IDs", () => {
      const getStyle = (service as any).getReceiptStyleFromTemplateId.bind(
        service,
      );
      expect(getStyle("unknown")).toBe(ReceiptStyle.COMPACT);
    });
  });

  describe("generateReceiptNumber", () => {
    it("should use PostgreSQL function", async () => {
      dataSource.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ receipt_number: "2025-000042" }]);

      const result = await (service as any).generateReceiptNumber();
      expect(result).toBe("2025-000042");
    });

    it("should create function if not exists", async () => {
      dataSource.query
        .mockResolvedValueOnce([{ exists: false }])
        .mockResolvedValueOnce(undefined) // CREATE SEQUENCE
        .mockResolvedValueOnce(undefined) // CREATE FUNCTION
        .mockResolvedValueOnce([{ receipt_number: "2025-000001" }]);

      const result = await (service as any).generateReceiptNumber();
      expect(result).toBe("2025-000001");
    });

    it("should fallback to timestamp-based number on error", async () => {
      dataSource.query.mockRejectedValue(new Error("DB error"));

      const result = await (service as any).generateReceiptNumber();
      expect(result).toMatch(/^\d{4}-\d{6}$/);
    });
  });

  describe("cleanupOldReceipts", () => {
    it("should delete old receipts when limit exceeded", async () => {
      const manager = {
        count: jest.fn().mockResolvedValue(12),
        find: jest.fn().mockResolvedValue([
          { id: "r1", pdf_path: "object-storage://bucket/r1.pdf" },
          { id: "r2", pdf_path: null },
        ]),
        delete: jest.fn(),
      };

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "r1.pdf",
      });
      pdfStorageService.deleteFile.mockResolvedValue(undefined);

      await (service as any).cleanupOldReceipts(manager);

      expect(manager.delete).toHaveBeenCalled();
      expect(pdfStorageService.deleteFile).toHaveBeenCalledWith(
        "bucket",
        "r1.pdf",
      );
    });

    it("should not delete when under limit", async () => {
      const manager = {
        count: jest.fn().mockResolvedValue(5),
        find: jest.fn(),
        delete: jest.fn(),
      };

      await (service as any).cleanupOldReceipts(manager);
      expect(manager.find).not.toHaveBeenCalled();
    });

    it("should handle cleanup error gracefully", async () => {
      const manager = {
        count: jest.fn().mockRejectedValue(new Error("DB error")),
      };

      await (service as any).cleanupOldReceipts(manager);
    });

    it("should handle file deletion error in cleanup", async () => {
      const manager = {
        count: jest.fn().mockResolvedValue(12),
        find: jest
          .fn()
          .mockResolvedValue([
            { id: "r1", pdf_path: "object-storage://bucket/r1.pdf" },
          ]),
        delete: jest.fn(),
      };

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "r1.pdf",
      });
      pdfStorageService.deleteFile.mockRejectedValue(new Error("S3 error"));

      await (service as any).cleanupOldReceipts(manager);
      expect(manager.delete).toHaveBeenCalled();
    });
  });

  describe("getAvailablePrinters", () => {
    it("should return list of printers", async () => {
      const result = await service.getAvailablePrinters();
      expect(result).toEqual({ printers: ["Printer1", "Printer2"] });
    });

    it("should return empty list on error", async () => {
      mockExecPromise.mockRejectedValueOnce(new Error("exec failed"));

      const result = await service.getAvailablePrinters();
      expect(result).toEqual({ printers: [] });
    });
  });

  describe("deleteReceiptFilesForOrder - additional cases", () => {
    it("should skip receipts with no pdf_path", async () => {
      receiptsRepo.find.mockResolvedValue([{ id: "r1", pdf_path: null }]);
      receiptsRepo.delete.mockResolvedValue(undefined);

      await service.deleteReceiptFilesForOrder("order-1");

      expect(fs.unlink).not.toHaveBeenCalled();
      expect(pdfStorageService.deleteFile).not.toHaveBeenCalled();
      expect(receiptsRepo.delete).toHaveBeenCalled();
    });

    it("should handle local file deletion error", async () => {
      receiptsRepo.find.mockResolvedValue([
        { id: "r1", pdf_path: "/local/file.pdf" },
      ]);
      (fs.unlink as jest.Mock).mockRejectedValueOnce(
        new Error("unlink failed"),
      );
      receiptsRepo.delete.mockResolvedValue(undefined);

      await service.deleteReceiptFilesForOrder("order-1");
      expect(receiptsRepo.delete).toHaveBeenCalled();
    });
  });
});
