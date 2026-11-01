import { readFileSync } from "fs";
import { join } from "path";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateRecipientDto } from "./update-recipient.dto";

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateRecipientDto, body))).map(
    (error) => error.property,
  );

type SchemaProperty = { nullable?: boolean };
type Schema = { properties: Record<string, SchemaProperty> };

// The committed contract; `yarn openapi:check` keeps it equal to the code.
const schemas = (
  JSON.parse(
    readFileSync(join(__dirname, "../../../../openapi.json"), "utf8"),
  ) as { components: { schemas: Record<string, Schema> } }
).components.schemas;

describe("UpdateRecipientDto", () => {
  it("accepts null for the optional contact fields, which clears them", async () => {
    expect(
      await errorsFor({ email: null, phone: null, address: null }),
    ).toEqual([]);
  });

  it("keeps the inherited validation for values", async () => {
    expect(await errorsFor({ email: "not-an-email" })).toEqual(["email"]);
    expect(await errorsFor({ name: "Olena", phone: "+380" })).toEqual([]);
  });

  it("documents null only where an update may clear it", () => {
    const update = schemas.UpdateRecipientDto.properties;
    const create = schemas.CreateRecipientDto.properties;
    for (const field of ["email", "phone", "address"]) {
      expect(update[field].nullable).toBe(true);
      expect(create[field].nullable).toBeUndefined();
    }
    expect(update.name.nullable).toBeUndefined();
  });
});
