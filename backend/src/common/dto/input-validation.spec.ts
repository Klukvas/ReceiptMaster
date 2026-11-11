import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProductDto } from "../../modules/products/dto/create-product.dto";
import { UpdateProductDto } from "../../modules/products/dto/update-product.dto";
import { CreateOrderDto } from "../../modules/orders/dto/create-order.dto";
import { UpdateOrderDto } from "../../modules/orders/dto/update-order.dto";
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

describe("recipient requisites", () => {
  const validate$ = async (body: Record<string, unknown>) =>
    failingProperties(
      plainToInstance(CreateRecipientDto, { name: "Acme", ...body }),
    );

  it("normalises the IBAN before validating it", async () => {
    const dto = plainToInstance(CreateRecipientDto, {
      name: "Acme",
      iban: " ua21 3223 1300 0002 6007 2335 6600 1\u00a0",
    });

    expect(dto.iban).toBe("UA213223130000026007233566001");
    expect(await failingProperties(dto)).toHaveLength(0);
  });

  it("rejects a bad checksum, a foreign IBAN and a huge string", async () => {
    expect(await validate$({ iban: "UA223223130000026007233566001" })).toEqual([
      "iban",
    ]);
    expect(await validate$({ iban: "DE89370400440532013000" })).toEqual([
      "iban",
    ]);
    expect(await validate$({ iban: "9".repeat(100000) })).toEqual(["iban"]);
  });

  it("names the check digits when only they are wrong, and the format otherwise", async () => {
    const ibanMessage = async (iban: string) => {
      const [error] = await validate(
        plainToInstance(CreateRecipientDto, { name: "Acme", iban }),
      );
      return Object.values(error.constraints ?? {});
    };

    expect(await ibanMessage("UA223223130000026007233566001")).toEqual([
      "iban check digits do not match: check the IBAN for a typo",
    ]);
    expect(await ibanMessage("UA2232231300000260072335660")).toEqual([
      "iban must be a valid Ukrainian IBAN (UA + 27 digits)",
    ]);
  });

  it("accepts 8 or 10 digit tax ids and rejects letters and other lengths", async () => {
    expect(await validate$({ tax_id: "12345678" })).toEqual([]);
    expect(await validate$({ tax_id: " 1234567890 " })).toEqual([]);
    expect(await validate$({ tax_id: "123456789" })).toEqual(["tax_id"]);
    expect(await validate$({ tax_id: "1234567a" })).toEqual(["tax_id"]);
  });

  it("limits the free-text requisites", async () => {
    expect(await validate$({ bank_name: "x".repeat(201) })).toEqual([
      "bank_name",
    ]);
    expect(await validate$({ legal_name: "x".repeat(256) })).toEqual([
      "legal_name",
    ]);
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

  it.each(["purchase_price_cents", "sale_price_cents", "quantity"])(
    "rejects a fractional %s, which an integer column cannot store",
    async (field) => {
      const created = product({ [field]: 1.5 });
      const updated = plainToInstance(UpdateProductDto, { [field]: 1.5 });

      expect(await failingProperties(created)).toContain(field);
      expect(await failingProperties(updated)).toContain(field);
    },
  );
});

describe("order item numeric ranges", () => {
  const productId = "123e4567-e89b-42d3-a456-426614174000";
  const itemErrors = async (overrides: Record<string, unknown>) => {
    const body = {
      recipientId: productId,
      items: [{ productId, qty: 1, ...overrides }],
    };
    const results = await Promise.all([
      validate(plainToInstance(CreateOrderDto, body)),
      validate(plainToInstance(UpdateOrderDto, body)),
    ]);
    return results.map((errors) =>
      errors.flatMap((error) =>
        (error.children ?? []).flatMap((child) =>
          (child.children ?? []).map((field) => field.property),
        ),
      ),
    );
  };

  it.each([
    ["qty", 1.5],
    ["qty", MAX_INT4 + 1],
    ["unitPriceCents", 0.5],
    ["unitPriceCents", MAX_INT4 + 1],
  ])("rejects %s = %p on create and update", async (field, value) => {
    expect(await itemErrors({ [field]: value })).toEqual([[field], [field]]);
  });

  it("accepts a unit price at the int4 limit", async () => {
    expect(await itemErrors({ unitPriceCents: MAX_INT4 })).toEqual([[], []]);
  });
});
