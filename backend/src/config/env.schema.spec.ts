import { envSchema } from "./env.schema";
const base = { JWT_SECRET: "test-only-validation-value-32-characters" };
const billing = {
  BILLING_ENABLED: true,
  PADDLE_API_KEY: "test-value",
  PADDLE_WEBHOOK_SECRET: "test-value",
  PADDLE_PRO_PRICE_ID: "pri_test_pro",
  PADDLE_BUSINESS_PRICE_ID: "pri_test_business",
  PADDLE_ENVIRONMENT: "production",
  FRONTEND_URL: "https://example.test",
};
describe("production billing configuration", () => {
  it.each(Object.keys(billing).filter((key) => key !== "BILLING_ENABLED"))(
    "rejects missing %s in production",
    (key) => {
      const input = {
        ...base,
        ...billing,
        NODE_ENV: "production",
        [key]: undefined,
      };
      expect(envSchema.safeParse(input).success).toBe(false);
    },
  );
  it("rejects sandbox in production and accepts complete production configuration", () => {
    expect(
      envSchema.safeParse({
        ...base,
        ...billing,
        NODE_ENV: "production",
        PADDLE_ENVIRONMENT: "sandbox",
      }).success,
    ).toBe(false);
    expect(
      envSchema.safeParse({ ...base, ...billing, NODE_ENV: "production" })
        .success,
    ).toBe(true);
    expect(envSchema.safeParse({ ...base, NODE_ENV: "test" }).success).toBe(
      true,
    );
  });
});

describe("migration startup switch", () => {
  it("parses false explicitly so restricted runtime roles can disable migrations", () => {
    expect(
      envSchema.parse({ ...base, AUTO_RUN_MIGRATIONS: "false" })
        .AUTO_RUN_MIGRATIONS,
    ).toBe(false);
    expect(
      envSchema.parse({ ...base, AUTO_RUN_MIGRATIONS: "true" })
        .AUTO_RUN_MIGRATIONS,
    ).toBe(true);
    expect(
      envSchema.safeParse({ ...base, AUTO_RUN_MIGRATIONS: "typo" }).success,
    ).toBe(false);
  });
});

describe("explicit billing switch", () => {
  it("starts production without Paddle configuration when billing is off or omitted", () => {
    expect(
      envSchema.parse({
        ...base,
        NODE_ENV: "production",
        BILLING_ENABLED: "false",
      }),
    ).toMatchObject({ BILLING_ENABLED: false });
    expect(envSchema.parse({ ...base, NODE_ENV: "production" })).toMatchObject({
      BILLING_ENABLED: false,
    });
    expect(
      envSchema.parse({
        ...base,
        NODE_ENV: "production",
        BILLING_ENABLED: "false",
        PADDLE_API_KEY: "",
        PADDLE_WEBHOOK_SECRET: "",
        PADDLE_PRO_PRICE_ID: "",
        PADDLE_BUSINESS_PRICE_ID: "",
        PADDLE_ENVIRONMENT: "",
        FRONTEND_URL: "",
      }),
    ).toMatchObject({ BILLING_ENABLED: false });
  });
  it.each(["yes", "0", "", 1])("rejects invalid billing flag %p", (value) => {
    expect(
      envSchema.safeParse({ ...base, BILLING_ENABLED: value }).success,
    ).toBe(false);
  });
});
