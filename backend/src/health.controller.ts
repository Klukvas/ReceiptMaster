import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import * as AWS from "aws-sdk";
import { CacheService } from "./common/services/cache.service";

@Controller("health")
export class HealthController {
  private readonly s3: AWS.S3;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.s3 = new AWS.S3({
      endpoint: this.configService.get("S3_ENDPOINT"),
      accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
      secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
      region: this.configService.get("AWS_REGION"),
      s3ForcePathStyle: true,
    });
  }

  @Get()
  async check(@Res() res: Response) {
    const startTime = Date.now();
    const checks: Record<string, string> = {};
    let allHealthy = true;

    // DB check
    try {
      await Promise.race([
        this.dataSource.query("SELECT 1"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000),
        ),
      ]);
      checks.db = "ok";
    } catch {
      checks.db = "error";
      allHealthy = false;
    }

    // S3 check
    const bucket = this.configService.get("RECEIPTS_BUCKET");
    if (bucket) {
      try {
        await Promise.race([
          this.s3.headBucket({ Bucket: bucket }).promise(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 3000),
          ),
        ]);
        checks.s3 = "ok";
      } catch {
        checks.s3 = "error";
        allHealthy = false;
      }
    } else {
      checks.s3 = "not_configured";
    }

    // Redis check
    try {
      const healthy = await Promise.race([
        this.cacheService.isHealthy(),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 3000),
        ),
      ]);
      checks.redis = healthy ? "ok" : "error";
      if (!healthy) allHealthy = false;
    } catch {
      checks.redis = "error";
      allHealthy = false;
    }

    const statusCode = allHealthy
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json({
      status: allHealthy ? "ok" : "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      ...checks,
    });
  }
}
