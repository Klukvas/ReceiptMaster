import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProductDto } from "../../modules/products/dto/create-product.dto";
import { CreateRecipientDto } from "../../modules/recipients/dto/create-recipient.dto";
import { CreateSupplierDto } from "../../modules/suppliers/dto/create-supplier.dto";
import { MAX_INT4 } from "./trimmed-string";

const failingProperties = async (dto: object): Promise<string[]> =>
  (await validate(dto)).map((error) => error.property);

describe("free-text input validation", () => {
  it("rejects a supplier whose name is only spaces", async () => {
    const dto = plainToInstance(CreateSupplierDto, { name: "    " });

    expect(await failingProperties(dto)).toContain("name");
  });

  it("rejects a recipient whose name is only spaces", async () => {
    const dto = plainToInstance(CreateRecipientDto, { name: "  " });

    expect(await failingProperties(dto)).toContain("name");
  });

  it("rejects a product whose name is only spaces", async () => {
    const dto = plainToInstance(CreateProductDto, {
      name: " ",
      purchase_price_cents: 1,
      sale_price_cents: 2,
      quantity: 1,
      currency: "UAH",
    });

    expect(await failingProperties(dto)).toContain("name");
  });

  it("rejects over-long names instead of letting the database fail with a 500", async () => {
    const dto = plainToInstance(CreateSupplierDto, { name: "x".repeat(256) });

    expect(await failingProperties(dto)).toContain("name");
  });

  it("trims a valid supplier name", async () => {
    const dto = plainToInstance(CreateSupplierDto, { name: "  Acme  " });

    expect(dto.name).toBe("Acme");
    expect(await failingProperties(dto)).toHaveLength(0);
  });

  it("rejects a malformed supplier phone", async () => {
    const dto = plainToInstance(CreateSupplierDto, {
      name: "Acme",
      phone: "abc-not-a-phone",
    });

    expect(await failingProperties(dto)).toContain("phone");
  });
});

describe("product numeric ranges", () => {
  const product = (overrides: Record<string, unknown>) =>
    plainToInstance(CreateProductDto, {
      name: "Apple",
      purchase_price_cents: 100,
      sale_price_cents: 200,
      quantity: 5,
      currency: "UAH",
      ...overrides,
    });

  it.each(["purchase_price_cents", "sale_price_cents", "quantity"])(
    "rejects %s above the database integer limit",
    async (field) => {
      const dto = product({ [field]: MAX_INT4 + 1 });

      expect(await failingProperties(dto)).toContain(field);
    },
  );

  it("accepts values at the limit", async () => {
    const dto = product({ quantity: MAX_INT4 });

    expect(await failingProperties(dto)).toHaveLength(0);
  });
});
