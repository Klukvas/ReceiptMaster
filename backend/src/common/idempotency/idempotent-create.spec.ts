import { EntityManager } from "typeorm";
import {
  createIdempotently,
  idempotencyKeyOf,
  scopedIdempotencyKey,
} from "./idempotent-create";
import { IdempotencyKey } from "../../modules/orders/entities/idempotency-key.entity";

type FakeManager = {
  readonly manager: EntityManager;
  readonly query: jest.Mock;
  readonly findOne: jest.Mock;
  readonly delete: jest.Mock;
  readonly insert: jest.Mock;
};

const fakeManager = (
  stored: Partial<IdempotencyKey> | null = null,
  isTransactionActive = true,
): FakeManager => {
  const query = jest.fn().mockResolvedValue([]);
  const findOne = jest.fn().mockResolvedValue(stored);
  const remove = jest.fn().mockResolvedValue({ affected: 1 });
  const insert = jest.fn().mockResolvedValue({ identifiers: [] });
  const manager = {
    queryRunner: { isTransactionActive },
    query,
    findOne,
    delete: remove,
    insert,
  } as unknown as EntityManager;
  return { manager, query, findOne, delete: remove, insert };
};

const request = { scope: "product", key: "key-1", userId: "user-1" } as const;
const HOUR_MS = 3600 * 1000;

describe("createIdempotently", () => {
  it("creates once and stores the JSON response for 24 hours under the scoped key", async () => {
    const fake = fakeManager();
    const createdAt = new Date("2026-10-29T10:00:00.000Z");
    const create = jest.fn().mockResolvedValue({ id: "p-1", createdAt });

    const result = await createIdempotently(fake.manager, request, create);

    expect(result).toEqual({
      replayed: false,
      data: { id: "p-1", createdAt },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const key = scopedIdempotencyKey("product", "key-1");
    expect(fake.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [key],
    );
    expect(fake.findOne).toHaveBeenCalledWith(IdempotencyKey, {
      where: { key, user_id: "user-1" },
    });
    const [entity, row] = fake.insert.mock.calls[0];
    expect(entity).toBe(IdempotencyKey);
    expect(row).toMatchObject({
      key,
      user_id: "user-1",
      response: { id: "p-1", createdAt: "2026-10-29T10:00:00.000Z" },
      status_code: 201,
    });
    expect(row.order_id).toBeUndefined();
    const ttl = row.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23.9 * HOUR_MS);
    expect(ttl).toBeLessThanOrEqual(24 * HOUR_MS);
  });

  it("takes the key lock before running the create", async () => {
    const fake = fakeManager();
    const order: string[] = [];
    fake.query.mockImplementation(async () => order.push("lock"));
    fake.findOne.mockImplementation(async () => {
      order.push("lookup");
      return null;
    });
    await createIdempotently(fake.manager, request, async () => {
      order.push("create");
      return { id: "p-1" };
    });
    expect(order).toEqual(["lock", "lookup", "create"]);
  });

  it("replays an unexpired stored response without creating", async () => {
    const fake = fakeManager({
      id: "row-1",
      response: { id: "p-1", name: "Coffee" },
      expires_at: new Date(Date.now() + HOUR_MS),
    });
    const create = jest.fn();

    const result = await createIdempotently(fake.manager, request, create);

    expect(result).toEqual({
      replayed: true,
      data: { id: "p-1", name: "Coffee" },
    });
    expect(create).not.toHaveBeenCalled();
    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
  });

  it("an expired stored response is dropped and the create runs again", async () => {
    const fake = fakeManager({
      id: "row-1",
      response: { id: "p-old" },
      expires_at: new Date(Date.now() - 1000),
    });
    const create = jest.fn().mockResolvedValue({ id: "p-new" });

    const result = await createIdempotently(fake.manager, request, create);

    expect(result).toEqual({ replayed: false, data: { id: "p-new" } });
    expect(fake.delete).toHaveBeenCalledWith(IdempotencyKey, { id: "row-1" });
    expect(fake.insert).toHaveBeenCalledTimes(1);
  });

  it("a failed create stores nothing", async () => {
    const fake = fakeManager();
    const failure = new Error("quota");
    await expect(
      createIdempotently(fake.manager, request, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["too long", "k".repeat(256)],
    ["whitespace", "two words"],
    ["joined duplicate headers", "a, b"],
    ["non-ASCII", "ключ"],
  ])("rejects a %s key with 400 before locking", async (_label, key) => {
    const fake = fakeManager();
    await expect(
      createIdempotently(fake.manager, { ...request, key }, jest.fn()),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "VALIDATION_ERROR" });
    expect(fake.query).not.toHaveBeenCalled();
  });

  it("accepts a 255-character key", async () => {
    const fake = fakeManager();
    await expect(
      createIdempotently(
        fake.manager,
        { ...request, key: "k".repeat(255) },
        async () => ({ id: "p-1" }),
      ),
    ).resolves.toMatchObject({ replayed: false });
  });

  it("refuses to run outside a transaction, where the lock would not hold", async () => {
    const fake = fakeManager(null, false);
    await expect(
      createIdempotently(fake.manager, request, jest.fn()),
    ).rejects.toThrow(/inside a transaction/);
    expect(fake.query).not.toHaveBeenCalled();
  });
});

describe("scopedIdempotencyKey", () => {
  it("separates scopes, fits varchar(255) and never equals the raw key", () => {
    const longest = "k".repeat(255);
    const product = scopedIdempotencyKey("product", longest);
    const recipient = scopedIdempotencyKey("recipient", longest);
    expect(product).not.toBe(recipient);
    expect(product).toMatch(/^product:[0-9a-f]{64}$/);
    expect(recipient.length).toBeLessThanOrEqual(255);
    expect(scopedIdempotencyKey("product", "abc")).not.toBe("abc");
  });
});

describe("idempotencyKeyOf", () => {
  it("reads the header, and leaves it undefined when absent", () => {
    expect(idempotencyKeyOf({ "idempotency-key": "abc" })).toBe("abc");
    expect(idempotencyKeyOf({})).toBeUndefined();
  });

  it("refuses repeated values and invalid keys with 400", () => {
    for (const value of [["a", "b"], "two words", "k".repeat(256), ""]) {
      expect(() =>
        idempotencyKeyOf({ "idempotency-key": value } as never),
      ).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  });
});
