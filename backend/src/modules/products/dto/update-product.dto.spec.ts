import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateProductDto } from "./update-product.dto";

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateProductDto, body))).map(
    (error) => error.property,
  );

describe("UpdateProductDto", () => {
  it("accepts a rename alone and a quantity with its expected stock", async () => {
    expect(await errorsFor({ name: "Renamed" })).toEqual([]);
    expect(await errorsFor({ quantity: 15, expectedQuantity: 8 })).toEqual([]);
  });

  it.each([-1, 1.5, "8"])(
    "rejects expectedQuantity %p",
    async (expectedQuantity) => {
      expect(await errorsFor({ quantity: 15, expectedQuantity })).toEqual([
        "expectedQuantity",
      ]);
    },
  );
});
