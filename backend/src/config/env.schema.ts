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

  // API
  API_PREFIX: z.string().default("api/v1"),
  API_KEY: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("24h"),

  // Receipt generation
  RECEIPT_STORAGE_PATH: z.string().default("./receipts"),
  RECEIPT_BASE_URL: z.string().default("http://localhost:3000"),
});

export type EnvConfig = z.infer<typeof envSchema>;
