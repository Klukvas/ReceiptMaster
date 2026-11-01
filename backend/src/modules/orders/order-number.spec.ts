import { EntityManager } from "typeorm";
import { nextOrderNumber } from "./order-number";

describe("nextOrderNumber", () => {
  const managerReturning = (next: unknown) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: "" }])
      .mockResolvedValueOnce([{ next }]);
    return { manager: { query } as unknown as EntityManager, query };
  };

  it("takes the account's lock before reading the highest number", async () => {
    const { manager, query } = managerReturning("5");

    await nextOrderNumber(manager, "user-1");

    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[0][1]).toEqual(["order-number", "user-1"]);
    expect(query.mock.calls[1][1]).toEqual(["user-1"]);
  });

  it("returns the next number as a number (Postgres sends bigints as strings)", async () => {
    const { manager } = managerReturning("5");

    await expect(nextOrderNumber(manager, "user-1")).resolves.toBe(5);
  });

  it("counts soft-deleted orders so a number is never reused", async () => {
    const { manager, query } = managerReturning("1");

    await nextOrderNumber(manager, "user-1");

    expect(query.mock.calls[1][0]).not.toContain("deleted_at");
  });
});
