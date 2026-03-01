import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),

  // Database
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgres"),
  DB_NAME: z.string().default("market_db"),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_POOL_MIN: z.coerce.number().default(2),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),

  // Auto migrations
  AUTO_RUN_MIGRATIONS: z.coerce.boolean().default(true),

  // API
  API_PREFIX: z.string().default("api/v1"),
  API_KEY: z.string().optional(),

  // CORS (comma-separated list of allowed origins)
  CORS_ORIGINS: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("24h"),

  // Receipt generation (URLs for generated PDFs)
  RECEIPT_BASE_URL: z.string().default("http://localhost:3000"),

  // Object Storage (Hetzner Object Storage)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("fsn1"),
  S3_ENDPOINT: z.string().optional(),
  LOGOS_BUCKET: z.string().optional(),
  RECEIPTS_BUCKET: z.string().optional(),
  TEMP_BUCKET: z.string().optional(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_OWNER_USER_ID: z.string().uuid().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Paddle Billing
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_PRO_PRICE_ID: z.string().optional(),
  PADDLE_BUSINESS_PRICE_ID: z.string().optional(),
  PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
});

export type EnvConfig = z.infer<typeof envSchema>;
