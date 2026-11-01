import { z } from "zod";

// Customers open links built from this value. A wrong one raises no error on the server,
// so production refuses to start with anything but the bare https origin they can reach.
const isPublicOrigin = (value: string | undefined): boolean => {
  if (!value || !URL.canParse(value)) return false;
  const { protocol, hostname, origin } = new URL(value);
  return protocol === "https:" && hostname !== "localhost" && origin === value;
};

export const envSchema = z
  .object({
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
    AUTO_RUN_MIGRATIONS: z.preprocess(
      (value) => (value === "true" ? true : value === "false" ? false : value),
      z.boolean().default(true),
    ),

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

    // Explicit release capability, independent of whether credentials happen to exist.
    BILLING_ENABLED: z.preprocess(
      (value) => (value === "true" ? true : value === "false" ? false : value),
      z.boolean().default(false),
    ),

    // Paddle Billing
    PADDLE_API_KEY: z.string().optional(),
    PADDLE_WEBHOOK_SECRET: z.string().optional(),
    PADDLE_PRO_PRICE_ID: z.string().optional(),
    PADDLE_BUSINESS_PRICE_ID: z.string().optional(),
    PADDLE_ENVIRONMENT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["sandbox", "production"]).optional(),
    ),
    FRONTEND_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV !== "production") return;
    if (!isPublicOrigin(config.FRONTEND_URL))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FRONTEND_URL"],
        message: "Must be the public https origin in production",
      });
    if (!config.BILLING_ENABLED) return;
    for (const key of [
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_PRO_PRICE_ID",
      "PADDLE_BUSINESS_PRICE_ID",
    ] as const) {
      if (!config[key]?.trim())
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Required in production",
        });
    }
    if (config.PADDLE_ENVIRONMENT !== "production")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PADDLE_ENVIRONMENT"],
        message: "Must explicitly be production",
      });
  });

export type EnvConfig = z.infer<typeof envSchema>;
