import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { PublicReceiptsController } from "./public-receipts.controller";
import { ReceiptsService } from "./receipts.service";
import { ApiErrors } from "../../common/errors/ApiError";
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";

const receiptsHttp = { getPublicReceiptPdf: jest.fn() };

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

      await expect(controller.getPublicReceipt("bad-token")).rejects.toThrow(
        "Not found",
      );
    });
  });

  it("marks the JSON endpoint noindex", () => {
    expect(
      Reflect.getMetadata(
        "__headers__",
        PublicReceiptsController.prototype.getPublicReceipt,
      ),
    ).toEqual(
      expect.arrayContaining([
        { name: "X-Robots-Tag", value: "noindex, nofollow" },
      ]),
    );
  });

  it("keeps the JSON endpoint out of shared caches, so a revoked link stops working at once", () => {
    expect(
      Reflect.getMetadata(
        "__headers__",
        PublicReceiptsController.prototype.getPublicReceipt,
      ),
    ).toEqual(
      expect.arrayContaining([
        { name: "Cache-Control", value: "private, no-store" },
      ]),
    );
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
          "Content-Disposition":
            "inline; filename=\"receipt-2025-000001.pdf\"; filename*=UTF-8''receipt-2025-000001.pdf",
        }),
      );
      expect(mockRes.set).toHaveBeenCalledWith({
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "private, no-store",
      });
      expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it("passes a refusal on to the global filter with the noindex headers already set", async () => {
      const error = ApiErrors.NOT_FOUND("Receipt");
      receiptsService.getPublicReceiptPdf.mockRejectedValue(error);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await expect(
        controller.getPublicReceiptPdf("bad-token", mockRes),
      ).rejects.toBe(error);

      expect(mockRes.send).not.toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith({
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "private, no-store",
      });
    });
  });

  describe("PDF errors over HTTP", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
        controllers: [PublicReceiptsController],
        providers: [{ provide: ReceiptsService, useValue: receiptsHttp }],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.useGlobalFilters(new GlobalExceptionFilter());
      await app.init();
    });

    afterAll(async () => app.close());

    it("answers a revoked link with 404, an errorCode and the noindex headers", async () => {
      receiptsHttp.getPublicReceiptPdf.mockRejectedValueOnce(
        ApiErrors.NOT_FOUND("Receipt"),
      );

      const res = await request(app.getHttpServer())
        .get(`/public/receipts/${"a".repeat(64)}/pdf`)
        .expect(404);

      expect(res.body).toEqual({
        error: expect.any(String),
        errorCode: "NOT_FOUND",
      });
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });

    it("answers an unexpected failure with a generic 500 and an errorCode", async () => {
      receiptsHttp.getPublicReceiptPdf.mockRejectedValueOnce(
        new Error("s3://secret-bucket/key unreachable"),
      );

      const res = await request(app.getHttpServer())
        .get(`/public/receipts/${"a".repeat(64)}/pdf`)
        .expect(500);

      expect(res.body).toEqual({
        error: "Internal server error",
        errorCode: "INTERNAL_SERVER_ERROR",
      });
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });
  });
});
