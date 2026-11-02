import { QueryFailedError } from "typeorm";
import {
  isUniqueViolationOf,
  isUniqueViolationOnColumn,
} from "./unique-violation.util";

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

describe("isUniqueViolationOnColumn", () => {
  const detail = "Key (email)=(a@b.c) already exists.";

  it("matches a 23505 whose detail names the column", () => {
    expect(
      isUniqueViolationOnColumn(
        driverFailure({ code: "23505", detail }),
        "email",
      ),
    ).toBe(true);
  });

  it("ignores another column, another SQLSTATE and non-query errors", () => {
    expect(
      isUniqueViolationOnColumn(
        driverFailure({
          code: "23505",
          detail: "Key (id)=(1) already exists.",
        }),
        "email",
      ),
    ).toBe(false);
    expect(
      isUniqueViolationOnColumn(
        driverFailure({ code: "23502", detail }),
        "email",
      ),
    ).toBe(false);
    expect(isUniqueViolationOnColumn(new Error(detail), "email")).toBe(false);
  });
});
