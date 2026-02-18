import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on("error", (err) => {
      this.logger.error("Redis connection error:", err.message);
    });

    this.redis.connect().catch((err) => {
      this.logger.warn("Redis initial connection failed:", err.message);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Cache GET error for key "${key}":`, error.message);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger.error(`Cache SET error for key "${key}":`, error.message);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Cache DEL error for key "${key}":`, error.message);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== "0");
    } catch (error) {
      this.logger.error(`Cache DELBYPAT error for "${pattern}":`, error.message);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  getClient(): Redis {
    return this.redis;
  }
}
