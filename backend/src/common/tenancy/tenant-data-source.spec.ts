import { DataSource } from "typeorm";
import { installTenantContext } from "./tenant-data-source";
import { runWithTenant } from "./tenant-context";

describe("tenant connection error handling", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  it("discards a connection after rollback failure while preserving the query error", async () => {
    const failure = new Error("query failed");
    const rollback = new Error("rollback failed");
    const runner = {
      isTransactionActive: false,
      query: jest.fn(async (sql: string) => {
        if (sql === "SELECT broken") throw failure;
        if (sql === "ROLLBACK") throw rollback;
        return [];
      }),
      releasePostgresConnection: jest.fn().mockResolvedValue(undefined),
      stream: jest.fn(),
    };
    const source = installTenantContext({
      createQueryRunner: () => runner,
    } as unknown as DataSource);
    await expect(
      runWithTenant(userId, () =>
        source.createQueryRunner().query("SELECT broken"),
      ),
    ).rejects.toBe(failure);
    expect(runner.releasePostgresConnection).toHaveBeenCalledWith(rollback);
  });
  it("recovers a runner's serialized query chain after a failed request", async () => {
    const runner = {
      isTransactionActive: false,
      query: jest.fn(async (sql: string) => {
        if (sql === "SELECT broken") throw new Error("query failed");
        return [sql];
      }),
      release: jest.fn(),
      stream: jest.fn(),
    };
    const source = installTenantContext({
      createQueryRunner: () => runner,
    } as unknown as DataSource);
    const wrapped = source.createQueryRunner();
    await expect(
      runWithTenant(userId, () => wrapped.query("SELECT broken")),
    ).rejects.toThrow("query failed");
    expect(
      await runWithTenant(userId, () => wrapped.query("SELECT good")),
    ).toEqual(["SELECT good"]);
    await expect(wrapped.stream("SELECT good")).rejects.toThrow(
      "Streaming queries",
    );
  });
  it.each(["ROLLBACK", "COMMIT"])(
    "discards the connection if explicit %s fails",
    async (control) => {
      const failure = new Error(`${control} failed`);
      const runner = {
        isTransactionActive: true,
        query: jest.fn().mockRejectedValue(failure),
        releasePostgresConnection: jest.fn().mockResolvedValue(undefined),
        stream: jest.fn(),
      };
      const source = installTenantContext({
        createQueryRunner: () => runner,
      } as unknown as DataSource);
      await expect(
        runWithTenant(userId, () => source.createQueryRunner().query(control)),
      ).rejects.toBe(failure);
      expect(runner.releasePostgresConnection).toHaveBeenCalledWith(failure);
    },
  );

  it("preserves the original query error even if rollback and connection cleanup both fail", async () => {
    const failure = new Error("original query failure");
    const runner = {
      isTransactionActive: false,
      query: jest.fn(async (sql: string) => {
        if (sql === "SELECT broken") throw failure;
        if (sql === "ROLLBACK") throw new Error("rollback failed");
        return [];
      }),
      releasePostgresConnection: jest
        .fn()
        .mockRejectedValue(new Error("cleanup failed")),
      databaseConnection: { end: jest.fn().mockResolvedValue(undefined) },
      stream: jest.fn(),
    };
    const source = installTenantContext({
      createQueryRunner: () => runner,
    } as unknown as DataSource);
    await expect(
      runWithTenant(userId, () =>
        source.createQueryRunner().query("SELECT broken"),
      ),
    ).rejects.toBe(failure);
    expect(runner.databaseConnection.end).toHaveBeenCalled();
  });

  it("discards an implicit transaction whose COMMIT outcome is unknown", async () => {
    const failure = new Error("COMMIT failed");
    const runner = {
      isTransactionActive: false,
      query: jest.fn(async (sql: string) => {
        if (sql === "COMMIT") throw failure;
        return [];
      }),
      releasePostgresConnection: jest.fn().mockResolvedValue(undefined),
      stream: jest.fn(),
    };
    const source = installTenantContext({
      createQueryRunner: () => runner,
    } as unknown as DataSource);
    await expect(
      runWithTenant(userId, () =>
        source.createQueryRunner().query("SELECT good"),
      ),
    ).rejects.toBe(failure);
    expect(runner.releasePostgresConnection).toHaveBeenCalledWith(failure);
  });
});
