jest.mock("aws-sdk", () => {
  const mockHeadBucket = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  });
  const MockS3 = jest.fn().mockImplementation(() => ({
    headBucket: mockHeadBucket,
  }));
  return { S3: MockS3, __mockHeadBucket: mockHeadBucket };
});

import { Test, TestingModule } from "@nestjs/testing";
import { getDataSourceToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import * as AWS from "aws-sdk";
import { HealthController } from "./health.controller";
import { CacheService } from "./common/services/cache.service";

const getHeadBucketMock = (): jest.Mock => {
  return (AWS as any).__mockHeadBucket as jest.Mock;
};

describe("HealthController", () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let configService: { get: jest.Mock };
  let cacheService: { isHealthy: jest.Mock };

  const createMockRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  beforeEach(async () => {
    dataSource = {
      query: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          S3_ENDPOINT: "http://localhost:9000",
          AWS_ACCESS_KEY_ID: "test-key",
          AWS_SECRET_ACCESS_KEY: "test-secret",
          AWS_REGION: "us-east-1",
          RECEIPTS_BUCKET: "receipts",
        };
        return config[key];
      }),
    };

    cacheService = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    getHeadBucketMock().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("check — all healthy", () => {
    it("returns HTTP 200 when DB, S3, and Redis are all ok", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it("returns status 'ok' when all services are healthy", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ok" }),
      );
    });

    it("returns db: 'ok' when database query succeeds", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ db: "ok" }),
      );
    });

    it("returns s3: 'ok' when headBucket succeeds", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ s3: "ok" }),
      );
    });

    it("returns redis: 'ok' when isHealthy resolves true", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ redis: "ok" }),
      );
    });

    it("includes uptime, timestamp, and responseTimeMs fields", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      const payload = res.json.mock.calls[0][0];
      expect(payload).toHaveProperty("uptime");
      expect(typeof payload.uptime).toBe("number");
      expect(payload).toHaveProperty("timestamp");
      expect(typeof payload.timestamp).toBe("string");
      expect(payload).toHaveProperty("responseTimeMs");
      expect(typeof payload.responseTimeMs).toBe("number");
      expect(payload.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("check — DB error", () => {
    it("returns HTTP 503 when database query throws", async () => {
      dataSource.query.mockRejectedValue(new Error("DB connection refused"));
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it("returns status 'degraded' when database query throws", async () => {
      dataSource.query.mockRejectedValue(new Error("DB connection refused"));
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "degraded" }),
      );
    });

    it("returns db: 'error' when database query throws", async () => {
      dataSource.query.mockRejectedValue(new Error("DB connection refused"));
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ db: "error" }),
      );
    });

    it("still checks S3 and Redis after DB failure", async () => {
      dataSource.query.mockRejectedValue(new Error("timeout"));
      const res = createMockRes();

      await controller.check(res as any);

      expect(cacheService.isHealthy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ db: "error", s3: "ok", redis: "ok" }),
      );
    });
  });

  describe("check — S3 error", () => {
    beforeEach(() => {
      getHeadBucketMock().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("S3 unreachable")),
      });
    });

    it("returns HTTP 503 when headBucket throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it("returns status 'degraded' when headBucket throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "degraded" }),
      );
    });

    it("returns s3: 'error' when headBucket throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ s3: "error" }),
      );
    });

    it("still reports db and redis correctly when only S3 fails", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ db: "ok", s3: "error", redis: "ok" }),
      );
    });
  });

  describe("check — S3 not configured", () => {
    beforeEach(async () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          S3_ENDPOINT: "http://localhost:9000",
          AWS_ACCESS_KEY_ID: "test-key",
          AWS_SECRET_ACCESS_KEY: "test-secret",
          AWS_REGION: "us-east-1",
        };
        return config[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          { provide: getDataSourceToken(), useValue: dataSource },
          { provide: ConfigService, useValue: configService },
          { provide: CacheService, useValue: cacheService },
        ],
      }).compile();

      controller = module.get<HealthController>(HealthController);
    });

    it("returns s3: 'not_configured' when RECEIPTS_BUCKET is absent", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ s3: "not_configured" }),
      );
    });

    it("returns HTTP 200 when only S3 is unconfigured and others are healthy", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it("returns status 'ok' when only S3 is unconfigured and others are healthy", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ok" }),
      );
    });

    it("does not call headBucket when bucket is not configured", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(getHeadBucketMock()).not.toHaveBeenCalled();
    });
  });

  describe("check — Redis unhealthy (isHealthy returns false)", () => {
    beforeEach(() => {
      cacheService.isHealthy.mockResolvedValue(false);
    });

    it("returns HTTP 503 when isHealthy resolves false", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it("returns status 'degraded' when isHealthy resolves false", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "degraded" }),
      );
    });

    it("returns redis: 'error' when isHealthy resolves false", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ redis: "error" }),
      );
    });

    it("still reports db and s3 as ok when only Redis is unhealthy", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ db: "ok", s3: "ok", redis: "error" }),
      );
    });
  });

  describe("check — Redis check throws", () => {
    beforeEach(() => {
      cacheService.isHealthy.mockRejectedValue(
        new Error("Redis connection lost"),
      );
    });

    it("returns HTTP 503 when isHealthy throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it("returns status 'degraded' when isHealthy throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "degraded" }),
      );
    });

    it("returns redis: 'error' when isHealthy throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ redis: "error" }),
      );
    });

    it("still reports db and s3 as ok when only Redis throws", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ db: "ok", s3: "ok", redis: "error" }),
      );
    });
  });

  describe("check — multiple services failing", () => {
    it("returns HTTP 503 and degraded when both DB and Redis fail", async () => {
      dataSource.query.mockRejectedValue(new Error("DB down"));
      cacheService.isHealthy.mockResolvedValue(false);
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "degraded",
          db: "error",
          redis: "error",
        }),
      );
    });

    it("returns HTTP 503 when DB, S3, and Redis all fail", async () => {
      dataSource.query.mockRejectedValue(new Error("DB down"));
      getHeadBucketMock().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("S3 down")),
      });
      cacheService.isHealthy.mockRejectedValue(new Error("Redis down"));
      const res = createMockRes();

      await controller.check(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "degraded",
          db: "error",
          s3: "error",
          redis: "error",
        }),
      );
    });
  });

  describe("check — response shape", () => {
    it("responseTimeMs is a non-negative integer", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      const payload = res.json.mock.calls[0][0];
      expect(Number.isInteger(payload.responseTimeMs)).toBe(true);
      expect(payload.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("timestamp is a valid ISO 8601 string", async () => {
      const res = createMockRes();
      const before = new Date().toISOString();

      await controller.check(res as any);

      const payload = res.json.mock.calls[0][0];
      const parsed = new Date(payload.timestamp);
      expect(parsed.toISOString()).toBe(payload.timestamp);
      expect(payload.timestamp >= before).toBe(true);
    });

    it("uptime is a positive number", async () => {
      const res = createMockRes();

      await controller.check(res as any);

      const payload = res.json.mock.calls[0][0];
      expect(payload.uptime).toBeGreaterThan(0);
    });

    it("res.status is called before res.json", async () => {
      const callOrder: string[] = [];
      const res = {
        status: jest.fn().mockImplementation(() => {
          callOrder.push("status");
          return res;
        }),
        json: jest.fn().mockImplementation(() => {
          callOrder.push("json");
        }),
      };

      await controller.check(res as any);

      expect(callOrder).toEqual(["status", "json"]);
    });
  });
});
