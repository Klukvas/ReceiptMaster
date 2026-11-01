type Env = Readonly<Record<string, string | undefined>>;

// The e2e suites TRUNCATE every application table (see db-cleanup.ts), so they
// only accept a database whose name marks it as disposable.
const TEST_DATABASE_NAME = /_test$/;

export function assertDisposableTestDatabase(env: Env = process.env): void {
  if (env.NODE_ENV !== "test") {
    throw new Error(
      `Backend e2e tests require NODE_ENV=test (got "${env.NODE_ENV ?? ""}").`,
    );
  }
  const database = env.DB_NAME ?? "";
  if (!TEST_DATABASE_NAME.test(database)) {
    throw new Error(
      `Backend e2e tests truncate every table, so DB_NAME must end in "_test" ` +
        `(got "${database}"). Point them at a disposable test database.`,
    );
  }
}
