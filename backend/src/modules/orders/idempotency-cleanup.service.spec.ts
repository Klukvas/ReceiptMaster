import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { IdempotencyCleanupService } from "./idempotency-cleanup.service";
import { IdempotencyKey } from "./entities/idempotency-key.entity";

describe("IdempotencyCleanupService", () => {
  let service: IdempotencyCleanupService;
  let idempotencyKeyRepo: any;

  beforeEach(async () => {
    idempotencyKeyRepo = {
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyCleanupService,
        {
          provide: getRepositoryToken(IdempotencyKey),
          useValue: idempotencyKeyRepo,
        },
      ],
    }).compile();

    service = module.get<IdempotencyCleanupService>(IdempotencyCleanupService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("cleanupExpiredKeys", () => {
    it("should delete expired idempotency keys", async () => {
      idempotencyKeyRepo.delete.mockResolvedValue({ affected: 5 });

      await service.cleanupExpiredKeys();

      expect(idempotencyKeyRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expect.anything(),
        }),
      );
    });

    it("should handle no expired keys gracefully", async () => {
      idempotencyKeyRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.cleanupExpiredKeys()).resolves.toBeUndefined();
    });

    it("should not throw on deletion failure", async () => {
      idempotencyKeyRepo.delete.mockRejectedValue(new Error("DB error"));

      await expect(service.cleanupExpiredKeys()).resolves.toBeUndefined();
    });
  });
});
