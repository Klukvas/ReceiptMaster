import { ReceiptSnapshotService } from "./services/receipt-snapshot.service";
import { ReceiptArtifactService } from "./services/receipt-artifact.service";
import { DocumentConfigService } from "../settings/services/document-config.service";
import { DocumentRenderService } from "./services/document-render.service";
import { legacyConfig } from "../settings/document-config";
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
  let artifacts: {
    repair: jest.Mock;
    retire: jest.Mock;
    lockRetirements: jest.Mock;
  };
  let snapshots: {
    internal: jest.Mock;
    prepare: jest.Mock;
    validatePrepared: jest.Mock;
    candidate: jest.Mock;
    active: jest.Mock;
  };
  let documents: { read: jest.Mock; assertTemplate: jest.Mock };
  let renders: { preview: jest.Mock };
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

    artifacts = {
      lockRetirements: jest.fn(async (rows) => rows),
      retire: jest.fn().mockResolvedValue(undefined),
      repair: jest
        .fn()
        .mockRejectedValue(new Error("Frozen repair unavailable")),
    };
    snapshots = {
      internal: jest.fn(),
      prepare: jest.fn(),
      validatePrepared: jest.fn(),
      candidate: jest.fn().mockReturnValue({ pending_id: "candidate" }),
      active: jest.fn(),
    };
    documents = {
      read: jest
        .fn()
        .mockResolvedValue({ config: legacyConfig(null), revision: 0 }),
      assertTemplate: jest.fn().mockResolvedValue(undefined),
    };
    renders = {
      preview: jest.fn().mockResolvedValue(Buffer.from("%PDF preview")),
    };
    dataSource = {
      manager: {
        query: jest.fn().mockResolvedValue([{ receipt_number: "2026-000001" }]),
      },
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
        hasCustomReceiptTitle: true,
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
        { provide: ReceiptArtifactService, useValue: artifacts },
        { provide: ReceiptSnapshotService, useValue: snapshots },
        { provide: DocumentConfigService, useValue: documents },
        { provide: DocumentRenderService, useValue: renders },
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

  describe("getRetention", () => {
    it("reports the count without a replaced receipt while under the cap", async () => {
      receiptsRepo.count = jest.fn().mockResolvedValue(4);

      const result = await service.getRetention(mockUser);

      expect(result).toEqual({ limit: 10, count: 4, replaces: null });
      expect(receiptsRepo.findOne).not.toHaveBeenCalled();
    });

    it("names the oldest generated receipt once the account is at the cap", async () => {
      receiptsRepo.count = jest.fn().mockResolvedValue(10);
      receiptsRepo.findOne.mockResolvedValue({
        id: "rec-oldest",
        number: "2026-000004",
        order_id: "order-old",
      });

      const result = await service.getRetention(mockUser);

      expect(result).toEqual({
        limit: 10,
        count: 10,
        replaces: {
          id: "rec-oldest",
          number: "2026-000004",
          order_id: "order-old",
        },
      });
      expect(receiptsRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { created_at: "ASC", id: "ASC" },
        }),
      );
    });
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

  describe("generateReceipt frozen durable intent", () => {
    function transaction(existing: Partial<Receipt> | null = null) {
      const manager = {
        findOne: jest.fn(async (entity) =>
          entity === Order ? mockOrder : existing,
        ),
        findOneOrFail: jest.fn(async () => ({
          ...existing,
          status: ReceiptStatus.PROCESSING,
        })),
        create: jest.fn((_entity, value) => value),
        save: jest.fn(async (_entity, value) => ({
          id: "receipt-1",
          ...value,
        })),
        query: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      };
      snapshots.prepare.mockResolvedValue({
        html: "frozen",
        snapshot: { config: legacyConfig(null) },
      });
      snapshots.validatePrepared.mockResolvedValue(mockOrder);
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager),
      );
      return manager;
    }
    it("freezes content before committing receipt and identifier-only outbox, then publishes", async () => {
      const manager = transaction();
      const result = await service.generateReceipt("order-1", mockUser);
      expect(snapshots.prepare).toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        ReceiptGenerationOutbox,
        expect.objectContaining({
          receipt_id: "receipt-1",
          generation_id: result.generation_id,
        }),
      );
      expect(receiptQueue.dispatch).toHaveBeenCalledTimes(1);
    });
    it("does not publish when the candidate transaction rolls back", async () => {
      const manager = transaction();
      manager.save.mockRejectedValueOnce(new Error("write failed"));
      await expect(
        service.generateReceipt("order-1", mockUser),
      ).rejects.toThrow("write failed");
      expect(receiptQueue.dispatch).not.toHaveBeenCalled();
    });
    it("returns a pending generation without preparing new content or publishing again", async () => {
      const existing = {
        ...mockReceipt,
        status: ReceiptStatus.PROCESSING,
        generation_id: "old",
      };
      receiptsRepo.findOne.mockResolvedValue(existing);
      expect(await service.generateReceipt("order-1", mockUser)).toEqual(
        existing,
      );
      expect(snapshots.prepare).not.toHaveBeenCalled();
    });
    it("retries a failed frozen candidate with a new generation, preserving share-token state", async () => {
      const existing = {
        ...mockReceipt,
        status: ReceiptStatus.FAILED,
        generation_id: "old",
      };
      const manager = transaction(existing);
      receiptsRepo.findOne.mockResolvedValue(existing);
      snapshots.internal.mockResolvedValue({
        ...existing,
        pending_html: "frozen",
        pending_snapshot: {},
      });
      await service.generateReceipt("order-1", mockUser);
      expect(snapshots.prepare).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalledWith(
        Receipt,
        expect.any(Object),
        expect.objectContaining({
          status: ReceiptStatus.PROCESSING,
          generation_id: expect.not.stringMatching(/^old$/),
        }),
      );
      expect(manager.update.mock.calls[0][2]).not.toHaveProperty(
        "public_token",
      );
    });
    it.each([ReceiptStatus.GENERATED, ReceiptStatus.VOID])(
      "refuses an existing %s receipt",
      async (status) => {
        receiptsRepo.findOne.mockResolvedValue({ ...mockReceipt, status });
        await expect(
          service.generateReceipt("order-1", mockUser),
        ).rejects.toThrow(ApiErrorResponse);
      },
    );
    it("propagates authoritative preparation failure without durable writes", async () => {
      transaction();
      snapshots.prepare.mockRejectedValue(new Error("Order changed"));
      await expect(
        service.generateReceipt("order-1", mockUser),
      ).rejects.toThrow("Order changed");
      expect(dataSource.transaction).not.toHaveBeenCalled();
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
    it("retires storage intent and removes pointers in the same transaction without deleting S3", async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([]),
        find: jest.fn().mockResolvedValue([mockReceipt]),
        findOne: jest.fn().mockResolvedValue(mockOrder),
        delete: jest.fn(),
      };
      dataSource.transaction.mockImplementation((fn) => fn(manager));
      await service.deleteReceiptFilesForOrder("order-1", "user-1");
      expect(artifacts.retire).toHaveBeenCalledWith(mockReceipt, manager);
      expect(manager.delete).toHaveBeenCalledWith(Receipt, {
        id: mockReceipt.id,
        user_id: mockReceipt.user_id,
      });
      expect(pdfStorageService.deleteFile).not.toHaveBeenCalled();
    });
    it("propagates DB errors so pointer removal cannot silently lose cleanup intent", async () => {
      dataSource.transaction.mockRejectedValue(new Error("DB error"));
      await expect(
        service.deleteReceiptFilesForOrder("order-1", "user-1"),
      ).rejects.toThrow("DB error");
    });
  });

  describe("getReceiptPdf", () => {
    it("returns an existing local PDF without resolving current settings", async () => {
      receiptsRepo.findOne.mockResolvedValue(mockReceipt);
      const result = await service.getReceiptPdf("receipt-1", mockUser);
      expect(result.filename).toBe("receipt-2025-000001.pdf");
      expect(artifacts.repair).not.toHaveBeenCalled();
    });
    it("returns an existing stored PDF", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://receipts/key.pdf",
      });
      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "key.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(true);
      pdfStorageService.downloadFile.mockResolvedValue(
        Buffer.from("%PDF stored"),
      );
      expect(
        (await service.getReceiptPdf("receipt-1", mockUser)).buffer.toString(),
      ).toBe("%PDF stored");
    });
    it("repairs a missing local PDF from its frozen active snapshot", async () => {
      receiptsRepo.findOne.mockResolvedValue(mockReceipt);
      (fs.readFile as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );
      artifacts.repair.mockResolvedValue(Buffer.from("%PDF frozen"));
      const result = await service.getReceiptPdf("receipt-1", mockUser);
      expect(result.buffer.toString()).toBe("%PDF frozen");
      expect(artifacts.repair).toHaveBeenCalledWith("receipt-1", mockUser.id);
      expect(settingsService.getAllPdfSettings).not.toHaveBeenCalled();
      expect(pdfGeneratorService.generateReceiptPdf).not.toHaveBeenCalled();
    });
    it("repairs a missing stored PDF without deleting the old reference first", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://receipts/missing.pdf",
      });
      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "missing.pdf",
      });
      pdfStorageService.fileExists.mockResolvedValue(false);
      artifacts.repair.mockResolvedValue(Buffer.from("%PDF repaired"));
      await service.getReceiptPdf("receipt-1", mockUser);
      expect(pdfStorageService.deleteFile).not.toHaveBeenCalled();
    });
    it("reports reconstruction required when frozen content is unavailable", async () => {
      receiptsRepo.findOne.mockResolvedValue(mockReceipt);
      (fs.readFile as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );
      await expect(
        service.getReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow("Frozen repair unavailable");
    });
  });

  describe("generateTestReceipt", () => {
    it("returns direct in-memory preview bytes with no receipt or storage writes", async () => {
      const bytes = await service.generateTestReceipt(mockUser);
      expect(bytes.toString()).toBe("%PDF preview");
      expect(renders.preview).toHaveBeenCalledWith(
        mockUser.id,
        { config: legacyConfig(null), logoAction: "keep" },
        expect.any(Object),
      );
      expect(pdfGeneratorService.generateReceiptPdf).not.toHaveBeenCalled();
      expect(receiptsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("regenerateReceiptPdf", () => {
    it("defaults to frozen reproduction and queues a candidate while preserving the active PDF", async () => {
      const active = {
        ...mockReceipt,
        active_revision: 1,
        generation_id: "old",
      };
      snapshots.internal.mockResolvedValue(active);
      snapshots.active.mockReturnValue({ html: "frozen", snapshot: {} });
      const manager = {
        findOne: jest.fn().mockResolvedValue(active),
        update: jest.fn(),
        create: jest.fn((_entity, value) => value),
        save: jest.fn(),
        findOneOrFail: jest
          .fn()
          .mockResolvedValue({ ...active, replacement_status: "processing" }),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager),
      );
      await service.regenerateReceiptPdf("receipt-1", mockUser);
      expect(manager.update).toHaveBeenCalledWith(
        Receipt,
        expect.any(Object),
        expect.objectContaining({ replacement_status: "processing" }),
      );
      expect(manager.update.mock.calls[0][2]).not.toHaveProperty("pdf_path");
      expect(manager.update.mock.calls[0][2]).not.toHaveProperty(
        "public_token",
      );
      expect(pdfStorageService.deleteFile).not.toHaveBeenCalled();
      expect(settingsService.getAllPdfSettings).not.toHaveBeenCalled();
    });
    it("requires a revision and reconstruction confirmation for legacy replacement", async () => {
      snapshots.internal.mockResolvedValue({
        ...mockReceipt,
        active_revision: 0,
      });
      await expect(
        service.regenerateReceiptPdf("receipt-1", mockUser, {
          mode: "replace",
        }),
      ).rejects.toThrow("Expected active revision");
      await expect(
        service.regenerateReceiptPdf("receipt-1", mockUser, {
          mode: "replace",
          expectedActiveRevision: 0,
        }),
      ).rejects.toThrow("Confirm reconstruction");
    });
    it("rejects stale active revisions before rendering", async () => {
      snapshots.internal.mockResolvedValue({
        ...mockReceipt,
        active_revision: 2,
      });
      await expect(
        service.regenerateReceiptPdf("receipt-1", mockUser, {
          expectedActiveRevision: 1,
        }),
      ).rejects.toThrow("Document changed");
      expect(snapshots.prepare).not.toHaveBeenCalled();
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
      expect(paths).toBeUndefined();
      expect(artifacts.retire).toHaveBeenCalledTimes(2);
      expect(pdfStorageService.deleteFile).not.toHaveBeenCalled();
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

      await expect(
        (service as any).cleanupOldReceipts(manager, "user-1"),
      ).rejects.toThrow("DB error");
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
    it("returns a frozen public projection without reading live settings", async () => {
      const query = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...mockReceipt,
          active_snapshot: {
            publicProjection: {
              companyInfo: { companyName: "Frozen Corp" },
              order: { id: "order" },
            },
          },
        }),
      };
      receiptsRepo.createQueryBuilder = jest.fn().mockReturnValue(query);
      const result = await service.getPublicReceipt("a".repeat(64));
      expect(result.companyInfo.companyName).toBe("Frozen Corp");
      expect(settingsService.getAllPdfSettings).not.toHaveBeenCalled();
    });
    it("rejects malformed public tokens", async () => {
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

  describe("PDF recovery boundaries", () => {
    it("does not repair or rewrite a PDF on a transient storage failure", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: "object-storage://receipts/old.pdf",
      });
      pdfStorageService.parseObjectStoragePath.mockReturnValue({
        bucket: "bucket",
        key: "old.pdf",
      });
      pdfStorageService.fileExists.mockRejectedValue(
        new Error("Temporary storage outage"),
      );
      await expect(
        service.getReceiptPdf("receipt-1", mockUser),
      ).rejects.toThrow("Temporary storage outage");
      expect(artifacts.repair).not.toHaveBeenCalled();
    });
    it("uses frozen repair when active PDF metadata has no path", async () => {
      receiptsRepo.findOne.mockResolvedValue({
        ...mockReceipt,
        pdf_path: null,
      });
      artifacts.repair.mockResolvedValue(Buffer.from("%PDF frozen"));
      expect(
        (await service.getReceiptPdf("receipt-1", mockUser)).buffer.toString(),
      ).toBe("%PDF frozen");
    });
  });
});
