import { CacheService } from "./cache.service";

// Mock ioredis with default export
const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock("ioredis", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

describe("CacheService", () => {
  let service: CacheService;
  let redis: any;
  let configService: any;

  beforeEach(() => {
    // Reset all mock functions on the shared instance
    Object.values(mockRedisInstance).forEach((fn: any) => {
      if (typeof fn?.mockReset === "function") fn.mockReset();
    });
    mockRedisInstance.quit.mockResolvedValue(undefined);
    mockRedisInstance.connect.mockResolvedValue(undefined);

    configService = {
      get: jest.fn((key: string, defaultVal?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: "localhost",
          REDIS_PORT: 6379,
        };
        return config[key] ?? defaultVal;
      }),
    };

    service = new CacheService(configService);
    redis = (service as any).redis;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe("get", () => {
    it("should return parsed value", async () => {
      redis.get.mockResolvedValue(JSON.stringify({ foo: "bar" }));

      const result = await service.get<{ foo: string }>("key1");

      expect(result).toEqual({ foo: "bar" });
      expect(redis.get).toHaveBeenCalledWith("key1");
    });

    it("should return null if key not found", async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.get("missing");

      expect(result).toBeNull();
    });

    it("should return null on error", async () => {
      redis.get.mockRejectedValue(new Error("Redis error"));

      const result = await service.get("key");

      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should set value with default TTL", async () => {
      await service.set("key1", { data: true });

      expect(redis.set).toHaveBeenCalledWith(
        "key1",
        JSON.stringify({ data: true }),
        "EX",
        300,
      );
    });

    it("should set value with custom TTL", async () => {
      await service.set("key1", "value", 60);

      expect(redis.set).toHaveBeenCalledWith(
        "key1",
        JSON.stringify("value"),
        "EX",
        60,
      );
    });

    it("should not throw on error", async () => {
      redis.set.mockRejectedValue(new Error("Redis error"));

      await expect(service.set("key", "value")).resolves.toBeUndefined();
    });
  });

  describe("del", () => {
    it("should delete key", async () => {
      await service.del("key1");

      expect(redis.del).toHaveBeenCalledWith("key1");
    });

    it("should not throw on error", async () => {
      redis.del.mockRejectedValue(new Error("Redis error"));

      await expect(service.del("key")).resolves.toBeUndefined();
    });
  });

  describe("delByPattern", () => {
    it("should scan and delete matching keys", async () => {
      redis.scan
        .mockResolvedValueOnce(["5", ["key1", "key2"]])
        .mockResolvedValueOnce(["0", ["key3"]]);
      redis.del.mockResolvedValue(1);

      await service.delByPattern("prefix:*");

      expect(redis.scan).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledTimes(2);
    });

    it("should handle no matching keys", async () => {
      redis.scan.mockResolvedValue(["0", []]);

      await service.delByPattern("nonexistent:*");

      expect(redis.scan).toHaveBeenCalledTimes(1);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it("should not throw on error", async () => {
      redis.scan.mockRejectedValue(new Error("Redis error"));

      await expect(service.delByPattern("pattern:*")).resolves.toBeUndefined();
    });
  });

  describe("isHealthy", () => {
    it("should return true when ping returns PONG", async () => {
      redis.ping.mockResolvedValue("PONG");

      const result = await service.isHealthy();

      expect(result).toBe(true);
    });

    it("should return false when ping returns unexpected value", async () => {
      redis.ping.mockResolvedValue("NOT_PONG");

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });

    it("should return false on error", async () => {
      redis.ping.mockRejectedValue(new Error("Connection refused"));

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe("getClient", () => {
    it("should return redis instance", () => {
      const client = service.getClient();

      expect(client).toBe(redis);
    });
  });

  describe("onModuleDestroy", () => {
    it("should call redis quit", async () => {
      await service.onModuleDestroy();

      expect(redis.quit).toHaveBeenCalled();
    });
  });
});
