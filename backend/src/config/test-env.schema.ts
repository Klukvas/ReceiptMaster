import { z } from "zod";

export const testEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("test"),
  PORT: z.coerce.number().default(3001),

  // Database
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgres"),
  DB_NAME: z.string().default("market_db_test"),

  // API
  API_PREFIX: z.string().default("api/v1"),
  API_KEY: z.string().optional(),

  // JWT
  JWT_SECRET: z
    .string()
    .default("test-jwt-secret-key-for-testing-at-least-32-characters-long"),
  JWT_EXPIRES_IN: z.string().default("24h"),

  // Receipt generation
  RECEIPT_STORAGE_PATH: z.string().default("./receipts"),
  RECEIPT_BASE_URL: z.string().default("http://localhost:3001"),
});

export type TestEnvConfig = z.infer<typeof testEnvSchema>;
