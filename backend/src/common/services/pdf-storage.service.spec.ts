import { PdfStorageService } from "./pdf-storage.service";
import { ApiErrorResponse } from "../errors/ApiError";

// Mock aws-sdk
jest.mock("aws-sdk", () => {
  const mockS3 = {
    upload: jest.fn().mockReturnThis(),
    getObject: jest.fn().mockReturnThis(),
    deleteObject: jest.fn().mockReturnThis(),
    headObject: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  };
  return {
    S3: jest.fn(() => mockS3),
  };
});

describe("PdfStorageService", () => {
  let service: PdfStorageService;
  let configService: any;
  let s3Mock: any;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          S3_ENDPOINT: "https://s3.example.com",
          AWS_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: "test-key",
          AWS_SECRET_ACCESS_KEY: "test-secret",
          RECEIPTS_BUCKET: "receipts-bucket",
          TEMP_BUCKET: "temp-bucket",
        };
        return config[key];
      }),
    };

    service = new PdfStorageService(configService);
    s3Mock = (service as any).s3;
  });

  describe("parseObjectStoragePath", () => {
    it("should parse valid receipts path", () => {
      const result = service.parseObjectStoragePath(
        "object-storage://receipts/user-1/receipt.pdf",
      );

      expect(result).toEqual({
        bucket: "receipts-bucket",
        key: "receipts/user-1/receipt.pdf",
      });
    });

    it("should parse valid temp path", () => {
      const result = service.parseObjectStoragePath(
        "object-storage://temp/file.pdf",
      );

      expect(result).toEqual({
        bucket: "temp-bucket",
        key: "temp/file.pdf",
      });
    });

    it("should return null for invalid path format", () => {
      expect(service.parseObjectStoragePath("invalid/path")).toBeNull();
      expect(service.parseObjectStoragePath("")).toBeNull();
    });

    it("should return null for unknown folder", () => {
      expect(
        service.parseObjectStoragePath("object-storage://unknown/file.pdf"),
      ).toBeNull();
    });
  });

  describe("uploadReceipt", () => {
    it("should upload receipt with correct key", async () => {
      s3Mock.upload.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Location:
            "https://s3.example.com/receipts-bucket/receipts/user-1/file.pdf",
        }),
      });

      const result = await service.uploadReceipt(
        Buffer.from("pdf"),
        "file.pdf",
        "user-1",
      );

      expect(result).toContain("receipts-bucket");
    });
  });

  describe("downloadReceipt", () => {
    it("should download receipt", async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Body: Buffer.from("pdf") }),
      });

      const result = await service.downloadReceipt("file.pdf", "user-1");

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should rethrow on error", async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("Not found")),
      });

      await expect(
        service.downloadReceipt("missing.pdf", "user-1"),
      ).rejects.toThrow("Not found");
    });
  });

  describe("receiptExists", () => {
    it("should return true if receipt exists", async () => {
      s3Mock.headObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = await service.receiptExists("file.pdf", "user-1");

      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      s3Mock.headObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("S3 error")),
      });

      const result = await service.receiptExists("file.pdf", "user-1");

      expect(result).toBe(false);
    });
  });

  describe("deleteReceipt", () => {
    it("should delete receipt", async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      await service.deleteReceipt("file.pdf", "user-1");

      expect(s3Mock.deleteObject).toHaveBeenCalled();
    });

    it("should rethrow on error", async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("Delete failed")),
      });

      await expect(service.deleteReceipt("file.pdf", "user-1")).rejects.toThrow(
        "Delete failed",
      );
    });
  });

  describe("getReceiptUrl", () => {
    it("should return correct URL", () => {
      const url = service.getReceiptUrl("file.pdf", "user-1");

      expect(url).toBe(
        "https://s3.example.com/receipts-bucket/receipts/user-1/file.pdf",
      );
    });
  });

  describe("uploadTempFile", () => {
    it("should upload temp file", async () => {
      s3Mock.upload.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Location: "https://s3.example.com/temp-bucket/temp/file.pdf",
        }),
      });

      const result = await service.uploadTempFile(
        Buffer.from("pdf"),
        "file.pdf",
      );

      expect(result).toContain("temp-bucket");
    });
  });

  describe("downloadTempFile", () => {
    it("should download temp file", async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Body: Buffer.from("pdf") }),
      });

      const result = await service.downloadTempFile("file.pdf");

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should rethrow on error", async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("Not found")),
      });

      await expect(service.downloadTempFile("missing.pdf")).rejects.toThrow();
    });
  });

  describe("deleteTempFile", () => {
    it("should delete temp file", async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      await service.deleteTempFile("file.pdf");
    });

    it("should rethrow on error", async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("Delete failed")),
      });

      await expect(service.deleteTempFile("file.pdf")).rejects.toThrow();
    });
  });

  describe("downloadFileByPath", () => {
    it("should download file by object storage path", async () => {
      s3Mock.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Body: Buffer.from("pdf") }),
      });

      const result = await service.downloadFileByPath(
        "object-storage://receipts/user-1/file.pdf",
      );

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should throw for invalid path", async () => {
      await expect(service.downloadFileByPath("invalid-path")).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("deleteFileByPath", () => {
    it("should delete file by object storage path", async () => {
      s3Mock.deleteObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      await service.deleteFileByPath(
        "object-storage://receipts/user-1/file.pdf",
      );
    });

    it("should throw for invalid path", async () => {
      await expect(service.deleteFileByPath("invalid")).rejects.toThrow(
        ApiErrorResponse,
      );
    });
  });

  describe("fileExistsByPath", () => {
    it("should check file existence by path", async () => {
      s3Mock.headObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = await service.fileExistsByPath(
        "object-storage://receipts/user-1/file.pdf",
      );

      expect(result).toBe(true);
    });

    it("should return false for invalid path", async () => {
      const result = await service.fileExistsByPath("invalid");

      expect(result).toBe(false);
    });
  });
});
