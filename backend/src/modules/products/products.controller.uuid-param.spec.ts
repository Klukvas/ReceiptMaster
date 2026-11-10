import { ParseUUIDPipe } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { ProductsController } from "./products.controller";

// Regression: a malformed :id used to reach Postgres ("invalid input syntax for type
// uuid") and answer 500; the pipe refuses it as a 400 first.
describe("ProductsController :id params", () => {
  it.each(["findOne", "update", "remove"] as const)(
    "%s validates :id as a UUID",
    (method) => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ProductsController,
        method,
      ) as Record<string, { data: string; pipes: unknown[] }>;
      const idArg = Object.values(args).find((arg) => arg.data === "id");
      expect(idArg?.pipes).toContain(ParseUUIDPipe);
    },
  );
});
