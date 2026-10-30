import {
  AUDIT_CLUSTER,
  TEMPLATE_CLUSTER,
  resolveIsolatedPostgres,
} from "./helpers/isolated-postgres";
import { assertDisposableTestDatabase } from "./helpers/test-database-guard";

// Pure checks of the guards that keep integration suites off real databases.
describe("isolated PostgreSQL opt-in", () => {
  it("skips when no opt-in is present and none is required", () => {
    expect(resolveIsolatedPostgres(AUDIT_CLUSTER, {})).toEqual({
      status: "skipped",
    });
  });

  it("fails instead of skipping when REQUIRE_PG_SUITES=1 lacks the opt-in", () => {
    const gate = resolveIsolatedPostgres(AUDIT_CLUSTER, {
      REQUIRE_PG_SUITES: "1",
      ISOLATED_PG_USER: "postgres",
    });
    expect(gate).toMatchObject({ status: "misconfigured" });
    expect(JSON.stringify(gate)).toContain("AUDIT_PG_PORT=55439");
  });

  it.each(["5432", "5433", "55447", " 55439"])(
    "refuses any port other than the isolated one (%s)",
    (port) => {
      expect(
        resolveIsolatedPostgres(AUDIT_CLUSTER, {
          AUDIT_PG_PORT: port,
          ISOLATED_PG_USER: "postgres",
        }),
      ).toMatchObject({ status: "misconfigured" });
    },
  );

  it("requires an explicit admin user instead of the OS account", () => {
    expect(
      resolveIsolatedPostgres(TEMPLATE_CLUSTER, { TEMPLATE_PG_PORT: "55447" }),
    ).toMatchObject({ status: "misconfigured" });
  });

  it("connects only to loopback with the explicit credentials", () => {
    expect(
      resolveIsolatedPostgres(TEMPLATE_CLUSTER, {
        TEMPLATE_PG_PORT: "55447",
        TEMPLATE_PG_USER: "fixture_admin",
        ISOLATED_PG_PASSWORD: "fixture",
      }),
    ).toEqual({
      status: "enabled",
      connection: {
        host: "127.0.0.1",
        port: 55447,
        user: "fixture_admin",
        password: "fixture",
      },
    });
  });
});

describe("backend e2e database guard", () => {
  it("accepts a test database in test mode", () => {
    expect(() =>
      assertDisposableTestDatabase({
        NODE_ENV: "test",
        DB_NAME: "market_db_test",
      }),
    ).not.toThrow();
  });

  it.each([
    [{ NODE_ENV: "test", DB_NAME: "market_db" }],
    [{ NODE_ENV: "test", DB_NAME: "market_db_test_copy" }],
    [{ NODE_ENV: "test" }],
    [{ NODE_ENV: "development", DB_NAME: "market_db_test" }],
  ])("refuses %j", (env) => {
    expect(() => assertDisposableTestDatabase(env)).toThrow();
  });
});
