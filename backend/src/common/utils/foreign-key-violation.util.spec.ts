import { QueryFailedError } from "typeorm";
import { isForeignKeyViolationOf } from "./foreign-key-violation.util";

const failure = (driverError: Record<string, unknown>) =>
  new QueryFailedError(
    "INSERT",
    [],
    Object.assign(new Error("x"), driverError),
  );

describe("isForeignKeyViolationOf", () => {
  it("matches a foreign key violation on the named constraint", () => {
    const error = failure({
      code: "23503",
      constraint: "FK_products_supplier",
    });
    expect(isForeignKeyViolationOf(error, "FK_products_supplier")).toBe(true);
  });

  it("ignores another constraint, another code and non-query errors", () => {
    expect(
      isForeignKeyViolationOf(
        failure({ code: "23503", constraint: "FK_other" }),
        "FK_products_supplier",
      ),
    ).toBe(false);
    expect(
      isForeignKeyViolationOf(
        failure({ code: "23505", constraint: "FK_products_supplier" }),
        "FK_products_supplier",
      ),
    ).toBe(false);
    expect(
      isForeignKeyViolationOf(new Error("x"), "FK_products_supplier"),
    ).toBe(false);
  });
});
