import { z } from "zod";
import {
  documentConfigSchema,
  draftSchema,
  selectionSchema,
} from "../modules/settings/document-config";
import { TEMPLATE_METADATA } from "../modules/receipts/templates/metadata";
import { SCHEMA_OVERRIDES } from "./api-components";
import { isOmittable, zodComponents, zodToOpenApi } from "./zod-openapi";

// The assertions walk nested properties, so the converter's union type is viewed
// as a recursive record instead of `any`.
type Schema = { readonly [key: string]: Schema };
const convert = (schema: z.ZodTypeAny): Schema =>
  zodToOpenApi(schema, { overrides: SCHEMA_OVERRIDES }) as unknown as Schema;

describe("zodToOpenApi on the real document schemas", () => {
  const config = convert(documentConfigSchema);

  it("documents every DocumentConfig field as required and closed", () => {
    expect(Object.keys(config.properties)).toEqual(
      Object.keys(documentConfigSchema.shape),
    );
    expect(config.required).toEqual(Object.keys(documentConfigSchema.shape));
    expect(config.additionalProperties).toBe(false);
    expect(config.properties.company.additionalProperties).toBe(false);
  });

  it("documents the template lookup as the template IDs", () => {
    expect(config.properties.templateId).toEqual({
      type: "string",
      enum: Object.keys(TEMPLATE_METADATA),
    });
  });

  it("keeps unions, literals, nullables and integer bounds", () => {
    expect(config.properties.schemaVersion).toEqual({
      type: "integer",
      enum: [1],
    });
    expect(config.properties.title.oneOf).toHaveLength(2);
    expect(config.properties.title.oneOf[1].required).toEqual(["mode", "text"]);
    expect(config.properties.logo.properties.assetId).toEqual({
      type: "string",
      format: "uuid",
      nullable: true,
    });
    expect(config.properties.logo.properties.size.anyOf).toEqual([
      { type: "string", enum: ["auto"] },
      { type: "integer", minimum: 24, maximum: 200 },
    ]);
  });

  it("refuses a flagged regex unless an override documents it", () => {
    expect(() => zodToOpenApi(documentConfigSchema)).toThrow(
      /regex with flags "i" at \$\.primaryColor/,
    );
  });

  it("treats defaulted fields as optional and records the default", () => {
    const draft = convert(draftSchema);
    expect(draft.required).toEqual(["config"]);
    expect(draft.properties.logoAction).toEqual({
      type: "string",
      enum: ["keep", "replace", "remove"],
      default: "keep",
    });
  });

  it("documents a refined object by its base shape, with nothing required", () => {
    const selection = convert(selectionSchema);
    expect(selection.type).toBe("object");
    expect(selection.required).toBeUndefined();
    expect(selection.properties.presetRevision).toEqual({
      type: "integer",
      minimum: 0,
      exclusiveMinimum: true,
    });
    const overrides = selection.properties.overrides;
    expect(overrides.required).toBeUndefined();
    expect(overrides.properties.company.required).toBeUndefined();
    expect(overrides.properties.templateId.enum).toEqual(
      Object.keys(TEMPLATE_METADATA),
    );
  });
});

describe("zodComponents", () => {
  it("references other components by $ref and wraps nullable refs", () => {
    const item = z.object({ id: z.string() });
    const components = zodComponents({
      Item: item,
      Holder: z.object({ item, maybe: item.nullable() }),
    }) as Record<string, Schema>;
    expect(components.Item.properties.id).toEqual({ type: "string" });
    expect(components.Holder.properties.item).toEqual({
      $ref: "#/components/schemas/Item",
    });
    expect(components.Holder.properties.maybe).toEqual({
      allOf: [{ $ref: "#/components/schemas/Item" }],
      nullable: true,
    });
  });

  it("rejects one schema instance registered under two names", () => {
    const shared = z.string();
    expect(() => zodComponents({ A: shared, B: shared })).toThrow(
      /own Zod schema instance/,
    );
  });
});

describe("isOmittable", () => {
  it.each([
    ["optional", z.string().optional(), true],
    ["defaulted", z.string().default("x"), true],
    ["optional then nullable", z.string().optional().nullable(), true],
    ["nullable then optional", z.string().nullable().optional(), true],
    ["defaulted then nullable", z.string().default("x").nullable(), true],
    ["nullable", z.string().nullable(), false],
    ["required", z.string(), false],
    ["refined required", z.string().refine(Boolean), false],
  ])("%s", (_name, schema, expected) => {
    expect(isOmittable(schema)).toBe(expected);
  });

  it("documents optional().nullable() as optional and nullable", () => {
    const schema = convert(
      z.object({ note: z.string().optional().nullable() }),
    );
    expect(schema.required).toBeUndefined();
    expect(schema.properties.note).toEqual({ type: "string", nullable: true });
  });

  it("refuses a refinement around an optional value instead of guessing", () => {
    expect(() =>
      zodToOpenApi(
        z.object({
          note: z
            .string()
            .optional()
            .refine((v) => v !== ""),
        }),
      ),
    ).toThrow(/optional or defaulted value at \$\.note/);
  });
});

describe("unsupported constructs fail loudly", () => {
  it.each([
    ["dates", z.object({ at: z.date() }), /ZodDate at \$\.at/],
    ["transforms", z.string().transform(Number), /ZodEffects\(transform\)/],
    ["passthrough objects", z.object({}).passthrough(), /passthrough/],
    ["unknown string checks", z.string().url(), /ZodString check "url"/],
    ["number checks", z.number().multipleOf(5), /ZodNumber check "multipleOf"/],
  ])("%s", (_name, schema, message) => {
    expect(() => zodToOpenApi(schema)).toThrow(message);
  });
});
