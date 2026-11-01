import { Client } from "pg";
import { teardownIsolatedPostgres } from "./helpers/isolated-postgres";

// Pure check of the failure-safe teardown with fakes; no PostgreSQL needed.
// One data source fails to close and dropping the first database fails, yet
// every remaining drop, the role drop and the client close must still run.
describe("teardownIsolatedPostgres", () => {
  const source = (destroy: () => Promise<void>) => ({
    isInitialized: true,
    destroy: jest.fn(destroy),
  });

  it("runs every remaining step and reports all failures together", async () => {
    const broken = source(async () => {
      throw new Error("destroy refused");
    });
    const healthy = source(async () => undefined);
    const statements: string[] = [];
    const end = jest.fn(async () => undefined);
    const admin = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('"first_db"')) throw new Error("drop refused");
        return { rows: [] };
      }),
      end,
    } as unknown as Client;

    const teardown = teardownIsolatedPostgres({
      dataSources: [broken, healthy],
      admin,
      databases: ["first_db", "second_db"],
      roles: ["first_role", "second_role"],
    });

    await expect(teardown).rejects.toThrow(
      /Isolated PostgreSQL teardown failed \(2 failures\): .*destroy refused.*drop refused/,
    );
    expect(broken.destroy).toHaveBeenCalledTimes(1);
    expect(healthy.destroy).toHaveBeenCalledTimes(1);
    expect(statements).toEqual([
      'DROP DATABASE IF EXISTS "first_db" WITH (FORCE)',
      'DROP DATABASE IF EXISTS "second_db" WITH (FORCE)',
      'DROP ROLE IF EXISTS "first_role"',
      'DROP ROLE IF EXISTS "second_role"',
    ]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("still closes the client when a role drop fails, rethrowing that failure", async () => {
    const end = jest.fn(async () => undefined);
    const admin = {
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith("DROP ROLE")) throw new Error("role in use");
        return { rows: [] };
      }),
      end,
    } as unknown as Client;

    await expect(
      teardownIsolatedPostgres({
        admin,
        databases: ["only_db"],
        roles: ["only_role"],
      }),
    ).rejects.toThrow("role in use");
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("skips uninitialized data sources and succeeds when nothing fails", async () => {
    const idle = { isInitialized: false, destroy: jest.fn() };
    const end = jest.fn(async () => undefined);
    const admin = {
      query: jest.fn(async () => ({ rows: [] })),
      end,
    } as unknown as Client;

    await expect(
      teardownIsolatedPostgres({ dataSources: [idle], admin }),
    ).resolves.toBeUndefined();
    expect(idle.destroy).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
