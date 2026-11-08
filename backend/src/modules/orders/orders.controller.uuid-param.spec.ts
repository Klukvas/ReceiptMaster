import { ParseUUIDPipe } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { OrdersController } from "./orders.controller";

// Regression: GET /orders/undefined used to reach Postgres and answer 500
// ("invalid input syntax for type uuid"); it must be refused as a 400 by the pipe.
describe("OrdersController :id params", () => {
  it.each(["findOne", "confirm", "update", "cancel", "remove"] as const)(
    "%s validates :id as a UUID",
    (method) => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        OrdersController,
        method,
      ) as Record<string, { data: string; pipes: unknown[] }>;
      const idArg = Object.values(args).find((arg) => arg.data === "id");
      expect(idArg?.pipes).toContain(ParseUUIDPipe);
    },
  );
});
