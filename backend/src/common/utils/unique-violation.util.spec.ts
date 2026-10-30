import { QueryFailedError } from "typeorm";
import { isUniqueViolationOf } from "./unique-violation.util";

const driverFailure = (fields: Record<string, unknown>) =>
  new QueryFailedError(
    "INSERT",
    [],
    Object.assign(new Error("failed"), fields),
  );

describe("isUniqueViolationOf", () => {
  it("matches a 23505 on the named index", () => {
    const error = driverFailure({
      code: "23505",
      constraint: "IDX_products_user_name",
    });

    expect(isUniqueViolationOf(error, "IDX_products_user_name")).toBe(true);
  });

  it("ignores a 23505 on another constraint", () => {
    const error = driverFailure({
      code: "23505",
      constraint: "UQ_idempotency_keys_key_user",
    });

    expect(isUniqueViolationOf(error, "IDX_products_user_name")).toBe(false);
  });

  it("ignores other SQLSTATEs on the same index name", () => {
    const error = driverFailure({
      code: "23502",
      constraint: "IDX_products_user_name",
    });

    expect(isUniqueViolationOf(error, "IDX_products_user_name")).toBe(false);
  });

  it("ignores errors that are not query failures", () => {
    const error = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "IDX_products_user_name",
    });

    expect(isUniqueViolationOf(error, "IDX_products_user_name")).toBe(false);
    expect(isUniqueViolationOf(undefined, "IDX_products_user_name")).toBe(
      false,
    );
  });
});
