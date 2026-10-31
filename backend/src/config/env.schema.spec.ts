import { envSchema } from "./env.schema";
const base = { JWT_SECRET: "test-only-validation-value-32-characters" };
const publicOrigin = { FRONTEND_URL: "https://example.test" };
const billing = {
  BILLING_ENABLED: true,
  PADDLE_API_KEY: "test-value",
  PADDLE_WEBHOOK_SECRET: "test-value",
  PADDLE_PRO_PRICE_ID: "pri_test_pro",
  PADDLE_BUSINESS_PRICE_ID: "pri_test_business",
  PADDLE_ENVIRONMENT: "production",
  ...publicOrigin,
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

describe("production public origin", () => {
  const production = { ...base, NODE_ENV: "production" };

  it("accepts the origin the release sets, with billing off", () => {
    expect(
      envSchema.parse({
        ...production,
        FRONTEND_URL: "https://receiptmaster.org",
      }).FRONTEND_URL,
    ).toBe("https://receiptmaster.org");
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "http://localhost:5173",
    "https://localhost",
    "http://receiptmaster.org",
    "https://receiptmaster.org/",
    "https://receiptmaster.org/app",
  ])("refuses to start production with FRONTEND_URL %p", (value) => {
    const result = envSchema.safeParse({ ...production, FRONTEND_URL: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path }) => path)).toContainEqual([
      "FRONTEND_URL",
    ]);
  });

  it.each(["development", "test"])(
    "leaves %s free to omit it or point at a local frontend",
    (nodeEnv) => {
      for (const value of [undefined, "", "http://localhost:5173"]) {
        expect(
          envSchema.safeParse({
            ...base,
            NODE_ENV: nodeEnv,
            FRONTEND_URL: value,
          }).success,
        ).toBe(true);
      }
    },
  );
});

describe("explicit billing switch", () => {
  it("starts production without Paddle configuration when billing is off or omitted", () => {
    const production = { ...base, ...publicOrigin, NODE_ENV: "production" };
    expect(
      envSchema.parse({ ...production, BILLING_ENABLED: "false" }),
    ).toMatchObject({ BILLING_ENABLED: false });
    expect(envSchema.parse(production)).toMatchObject({
      BILLING_ENABLED: false,
    });
    expect(
      envSchema.parse({
        ...production,
        BILLING_ENABLED: "false",
        PADDLE_API_KEY: "",
        PADDLE_WEBHOOK_SECRET: "",
        PADDLE_PRO_PRICE_ID: "",
        PADDLE_BUSINESS_PRICE_ID: "",
        PADDLE_ENVIRONMENT: "",
      }),
    ).toMatchObject({ BILLING_ENABLED: false });
  });
  it.each(["yes", "0", "", 1])("rejects invalid billing flag %p", (value) => {
    expect(
      envSchema.safeParse({ ...base, BILLING_ENABLED: value }).success,
    ).toBe(false);
  });
});
