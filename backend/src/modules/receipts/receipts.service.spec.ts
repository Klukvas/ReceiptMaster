// Mock fs/promises, crypto, and child_process before any imports
jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from("fake-pdf")),
  access: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const mockExecPromise = jest.fn().mockResolvedValue({
  stdout: "printer Printer1 is idle.\nprinter Printer2 is idle.\n",
  stderr: "",
});

jest.mock("child_process", () => {
  const execFileFn = jest.fn();
  const customSymbol =
    Symbol.for("nodejs.util.promisify.custom") ||
    require("util").promisify.custom; // eslint-disable-line @typescript-eslint/no-var-requires
  execFileFn[customSymbol] = (...args: any[]) => mockExecPromise(...args);
  return { execFile: execFileFn };
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
import { ReceiptOutboxService } from "./receipt-outbox.service";
import { ReceiptGenerationOutbox } from "./entities/receipt-generation-outbox.entity";
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
      findAndCount: jest.fn().mockResolvedValue([[mockReceipt], 1]),
      findOne: jest.fn(),
      findOneOrFail: jest.fn().mockResolvedValue(mockReceipt),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn().mockImplementation(async (_where, values) => {
        receiptsRepo.findOneOrFail.mockResolvedValue({
          ...mockReceipt,
          ...values,
        });
        return { affected: 1 };
      }),
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
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: ReceiptOutboxService, useValue: receiptQueue },
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

      expect(result).toEqual({
        data: [mockReceipt],
        total: 1,
        offset: 0,
        limit: 20,
      });
      expect(receiptsRepo.findAndCount).toHaveBeenCalled();
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
    function transaction(existing: Partial<Receipt> | null = null) {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder)
          .mockResolvedValueOnce(existing),
        findOneOrFail: jest.fn().mockImplementation(async () => ({
          ...existing,
          status: ReceiptStatus.PROCESSING,
        })),
        create: jest.fn((_entity, data) => ({ ...data })),
        save: jest.fn(async (_entity, data) => ({ id: "receipt-1", ...data })),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        query: jest.fn().mockResolvedValue([{ receipt_number: "2026-000001" }]),
        count: jest.fn().mockResolvedValue(0),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager),
      );
      return manager;
    }

    it("commits the receipt and durable intent before publication", async () => {
      const manager = transaction();
      let committed = false;
      dataSource.transaction.mockImplementation(async (callback) => {
        const result = await callback(manager);
        expect(receiptQueue.dispatch).not.toHaveBeenCalled();
        committed = true;
        return result;
      });
      receiptQueue.dispatch.mockImplementation(async () =>
        expect(committed).toBe(true),
      );
      const result = await service.generateReceipt("order-1", mockUser);
      expect(result.status).toBe(ReceiptStatus.PROCESSING);
      expect(manager.save).toHaveBeenCalledWith(
        ReceiptGenerationOutbox,
        expect.objectContaining({
          receipt_id: "receipt-1",
          generation_id: result.generation_id,
        }),
      );
      expect(receiptQueue.dispatch).toHaveBeenCalledTimes(1);
    });

    it("returns the committed receipt while Redis publication is still waiting", async () => {
      const manager = transaction();
      let finishPublication: () => void;
      receiptQueue.dispatch.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishPublication = resolve;
          }),
      );
      const result = service.generateReceipt("order-1", mockUser);
      const outcome = await Promise.race([
        result.then(() => "returned"),
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 25)),
      ]);
      finishPublication?.();
      await result;
      expect(manager.save).toHaveBeenCalledWith(
        ReceiptGenerationOutbox,
        expect.any(Object),
      );
      expect(outcome).toBe("returned");
    });

    it("does not publish a rolled-back receipt", async () => {
      const manager = transaction();
      manager.save.mockRejectedValueOnce(new Error("write failed"));
      await expect(
        service.generateReceipt("order-1", mockUser),
      ).rejects.toThrow("write failed");
      expect(receiptQueue.dispatch).not.toHaveBeenCalled();
    });

    it("returns a pending generation regardless of receipt age", async () => {
      const existing = {
        ...mockReceipt,
        status: ReceiptStatus.PROCESSING,
        generation_id: "old-generation",
        created_at: new Date(0),
      };
      const manager = transaction(existing);
      expect(await service.generateReceipt("order-1", mockUser)).toEqual(
        existing,
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it("retries a failed receipt with a new durable generation", async () => {
      const manager = transaction({
        ...mockReceipt,
        status: ReceiptStatus.FAILED,
        generation_id: "old-generation",
      });
      await service.generateReceipt("order-1", mockUser);
      expect(manager.update).toHaveBeenCalledWith(
        Receipt,
        { id: "receipt-1", user_id: "user-1" },
        expect.objectContaining({
          status: ReceiptStatus.PROCESSING,
          generation_id: expect.any(String),
          public_token: null,
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        ReceiptGenerationOutbox,
        expect.objectContaining({
          generation_id: expect.not.stringMatching(/^old-generation$/),
        }),
      );
    });

    it("refuses generated and void receipts", async () => {
      for (const status of [ReceiptStatus.GENERATED, ReceiptStatus.VOID]) {
        transaction({ ...mockReceipt, status });
        await expect(
          service.generateReceipt("order-1", mockUser),
        ).rejects.toThrow(ApiErrorResponse);
      }
    });

    it("rejects missing and unconfirmed orders", async () => {
      const manager = transaction();
      manager.findOne.mockReset().mockResolvedValueOnce(null);
      await expect(
        service.generateReceipt("order-1", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
      transaction()
        .findOne.mockReset()
        .mockResolvedValueOnce({ ...mockOrder, status: OrderStatus.DRAFT });
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
      const voidedReceipt = {
        ...mockReceipt,
        status: ReceiptStatus.VOID,
        void_reason: "Duplicate",
        voided_at: expect.any(Date),
        order: mockOrder,
      };
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            ...mockReceipt,
            status: ReceiptStatus.GENERATED,
            order: mockOrder,
          }),
          findOneOrFail: jest.fn().mockResolvedValue(voidedReceipt),
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
      expect(receiptsRepo.update).toHaveBeenCalled();
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

      const _result = await service.getReceiptPdf("receipt-1", mockUser);

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

      const _result = await service.getReceiptPdf("receipt-1", mockUser);

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
        undefined,
        undefined,
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
    it("uses the current transaction connection and propagates database failures", async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([{ receipt_number: "2026-000042" }]),
      };
      expect(await (service as any).generateReceiptNumber(manager)).toBe(
        "2026-000042",
      );
      expect(dataSource.query).not.toHaveBeenCalled();
      manager.query.mockRejectedValueOnce(new Error("DB error"));
      await expect(
        (service as any).generateReceiptNumber(manager),
      ).rejects.toThrow("DB error");
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

      const paths = await (service as any).cleanupOldReceipts(
        manager,
        "user-1",
      );

      expect(manager.delete).toHaveBeenCalled();
      // cleanupOldReceipts returns S3 paths; deletion is done via deleteS3FilesInBackground
      expect(paths).toEqual([{ bucket: "bucket", key: "r1.pdf" }]);
    });

    it("should not delete when under limit", async () => {
      const manager = {
        count: jest.fn().mockResolvedValue(5),
        find: jest.fn(),
        delete: jest.fn(),
      };

      await (service as any).cleanupOldReceipts(manager, "user-1");
      expect(manager.find).not.toHaveBeenCalled();
    });

    it("should handle cleanup error gracefully", async () => {
      const manager = {
        count: jest.fn().mockRejectedValue(new Error("DB error")),
      };

      await (service as any).cleanupOldReceipts(manager, "user-1");
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

      await (service as any).cleanupOldReceipts(manager, "user-1");
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

  describe("generatePublicToken", () => {
    it("should generate a public token for a generated receipt", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        status: ReceiptStatus.GENERATED,
        public_token: null,
      });

      const configGet = jest.fn().mockReturnValue("https://app.example.com");
      (service as any).configService = { get: configGet };

      const result = await service.generatePublicToken("receipt-1", mockUser);

      expect(result.token).toBeDefined();
      expect(result.token).toHaveLength(64);
      expect(result.url).toContain("/r/");
      expect(receiptsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReceiptStatus.GENERATED }),
        { public_token: expect.any(String) },
      );
    });

    it("should return existing token if already shared", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        status: ReceiptStatus.GENERATED,
        public_token: "existing-token-abc",
      });

      const configGet = jest.fn().mockReturnValue("https://app.example.com");
      (service as any).configService = { get: configGet };

      const result = await service.generatePublicToken("receipt-1", mockUser);

      expect(result.token).toBe("existing-token-abc");
      expect(result.url).toBe("https://app.example.com/r/existing-token-abc");
      expect(receiptsRepo.save).not.toHaveBeenCalled();
    });

    it("should throw if receipt not found", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generatePublicToken("unknown", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if receipt is not GENERATED", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        status: ReceiptStatus.PROCESSING,
      });

      await expect(
        service.generatePublicToken("receipt-1", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });

    it("should throw if receipt is VOID", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        status: ReceiptStatus.VOID,
      });

      await expect(
        service.generatePublicToken("receipt-1", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("revokePublicToken", () => {
    it("should set public_token to null", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "some-token",
      });
      receiptsRepo.findOneOrFail.mockResolvedValue({
        ...mockReceipt,
        public_token: null,
      });

      await service.revokePublicToken("receipt-1", mockUser);

      expect(receiptsRepo.update).toHaveBeenCalledWith(
        { id: "receipt-1" },
        expect.objectContaining({ public_token: null }),
      );
    });

    it("should throw if receipt not found", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.revokePublicToken("unknown", mockUser),
      ).rejects.toThrow(ApiErrorResponse);
    });
  });

  describe("getPublicReceipt", () => {
    it("should return receipt data with company info", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "a".repeat(64),
        order: mockOrder,
      });

      const result = await service.getPublicReceipt("a".repeat(64));

      expect(result.receipt).toBeDefined();
      expect(result.companyInfo).toBeDefined();
      expect(result.companyInfo.companyName).toBe("Test Corp");
      expect(settingsService.getAllPdfSettings).toHaveBeenCalledWith("user-1");
    });

    it("should throw 404 if token not found", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublicReceipt("bad-token")).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("getPublicReceiptPdf", () => {
    it("should return PDF buffer from local file", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "a".repeat(64),
        pdf_path: "/local/receipt.pdf",
      });

      const result = await service.getPublicReceiptPdf("a".repeat(64));

      expect(result.filename).toBe("receipt-2025-000001.pdf");
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });

    it("should return PDF buffer from object storage", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "a".repeat(64),
        pdf_path: "object-storage://bucket/key.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(true);
      pdfStorageService.downloadFile.mockResolvedValue(
        Buffer.from("pdf-content"),
      );

      const result = await service.getPublicReceiptPdf("a".repeat(64));

      expect(result.filename).toBe("receipt-2025-000001.pdf");
      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "bucket",
        "key.pdf",
      );
    });

    it("should throw 404 if token not found", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublicReceiptPdf("bad-token")).rejects.toThrow(
        ApiErrorResponse,
      );
    });

    it("should throw if receipt has no pdf_path", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "a".repeat(64),
        pdf_path: null,
      });

      await expect(service.getPublicReceiptPdf("a".repeat(64))).rejects.toThrow(
        ApiErrorResponse,
      );
    });

    it("should throw if object storage path is invalid", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "a".repeat(64),
        pdf_path: "object-storage://invalid",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      await expect(service.getPublicReceiptPdf("a".repeat(64))).rejects.toThrow(
        ApiErrorResponse,
      );
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

  describe("findAll - pagination options", () => {
    it("should respect custom offset and limit", async () => {
      receiptsRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(mockUser, { offset: 10, limit: 50 });

      expect(receiptsRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 50 }),
      );
    });

    it("should cap limit at 100", async () => {
      receiptsRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(mockUser, { limit: 200 });

      expect(receiptsRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe("printReceipt", () => {
    beforeEach(() => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "/local/receipt.pdf",
      });
    });

    it("should print a local receipt on darwin/linux", async () => {
      mockExecPromise.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(true);
      expect(result.message).toContain("2025-000001");
    });

    it("should print with a specific printer name", async () => {
      mockExecPromise.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await service.printReceipt(
        "receipt-1",
        mockUser,
        "MyPrinter",
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("MyPrinter");
    });

    it("should reject invalid printer name", async () => {
      const result = await service.printReceipt(
        "receipt-1",
        mockUser,
        "printer; rm -rf /",
      );

      expect(result.success).toBe(false);
    });

    it("should return failure on print error", async () => {
      mockExecPromise.mockRejectedValueOnce(new Error("print failed"));

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(false);
    });

    it("should handle receipt with no pdf_path", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: null,
      });

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(false);
    });

    it("should download from object storage to temp file before printing", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/receipt.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "receipt.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(true);
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("pdf"));
      mockExecPromise.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(true);
      expect(pdfStorageService.downloadFile).toHaveBeenCalledWith(
        "bucket",
        "receipt.pdf",
      );
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should throw when object storage file does not exist", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/receipt.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "receipt.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(false);

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(false);
    });

    it("should handle stderr with non-warning content", async () => {
      mockExecPromise.mockResolvedValueOnce({
        stdout: "",
        stderr: "critical error occurred",
      });

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(false);
    });

    it("should ignore warnings in stderr", async () => {
      mockExecPromise.mockResolvedValueOnce({
        stdout: "",
        stderr: "warning: something minor",
      });

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(true);
    });

    it("should handle invalid object storage path during print", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://invalid",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      const result = await service.printReceipt("receipt-1", mockUser);

      expect(result.success).toBe(false);
    });

    it("should clean up temp file on error", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://bucket/receipt.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "receipt.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(true);
      pdfStorageService.downloadFile.mockResolvedValue(Buffer.from("pdf"));
      mockExecPromise.mockRejectedValueOnce(new Error("print failed"));

      await service.printReceipt("receipt-1", mockUser);

      // temp file cleanup should be called in finally block
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe("deleteS3FilesInBackground", () => {
    it("should not call deleteFile when paths array is empty", () => {
      (service as any).deleteS3FilesInBackground([]);

      expect(pdfStorageService.deleteFile).not.toHaveBeenCalled();
    });

    it("should call deleteFile for each path", async () => {
      pdfStorageService.deleteFile.mockResolvedValue(undefined);

      (service as any).deleteS3FilesInBackground([
        { bucket: "b1", key: "k1" },
        { bucket: "b2", key: "k2" },
      ]);

      // Wait for fire-and-forget Promise.allSettled
      await new Promise((r) => setTimeout(r, 50));

      expect(pdfStorageService.deleteFile).toHaveBeenCalledTimes(2);
      expect(pdfStorageService.deleteFile).toHaveBeenCalledWith("b1", "k1");
      expect(pdfStorageService.deleteFile).toHaveBeenCalledWith("b2", "k2");
    });

    it("should handle partial failures gracefully", async () => {
      pdfStorageService.deleteFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("S3 delete failed"));

      (service as any).deleteS3FilesInBackground([
        { bucket: "b1", key: "k1" },
        { bucket: "b2", key: "k2" },
      ]);

      // Wait for fire-and-forget Promise.allSettled
      await new Promise((r) => setTimeout(r, 50));

      expect(pdfStorageService.deleteFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("getPublicReceiptPdf - object storage file not found", () => {
    it("should throw when object storage file does not exist", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        public_token: "a".repeat(64),
        pdf_path: "object-storage://bucket/key.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(false);

      await expect(service.getPublicReceiptPdf("a".repeat(64))).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("getReceiptPdf - regeneration with invalid new S3 path", () => {
    it("should throw RECEIPT_GENERATION_FAILED when regenerated path is invalid", async () => {
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

      pdfGeneratorService.generateReceiptPdf.mockResolvedValue({
        filePath: "object-storage://invalid",
        url: "https://s3/new.pdf",
      });

      pdfStorageService.parseObjectStoragePath.mockReturnValue(null);

      await expect(
        service.getReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow();
    });
  });
});
