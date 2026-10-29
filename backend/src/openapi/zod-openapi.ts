import { z } from "zod";
import type {
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

/**
 * Minimal Zod -> OpenAPI 3.0 converter for the request/response schemas this API
 * actually validates with Zod. It deliberately supports only the constructs in use:
 * anything else throws, so a new construct cannot silently produce a wrong contract.
 */
export type OpenApiSchema = SchemaObject | ReferenceObject;

export interface ZodOpenApiOptions {
  /** Schema instances emitted as `$ref` to a named component instead of inline. */
  readonly refs?: ReadonlyMap<z.ZodTypeAny, string>;
  /** Fixed output for instances whose runtime check cannot be derived, e.g. a lookup-table refine. */
  readonly overrides?: ReadonlyMap<z.ZodTypeAny, SchemaObject>;
}

export const componentRef = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

export function zodToOpenApi(
  schema: z.ZodTypeAny,
  options: ZodOpenApiOptions = {},
): OpenApiSchema {
  return convert(schema, options, "$");
}

/** Whether a property may be omitted by the client (optional or defaulted). */
export function isOmittable(schema: z.ZodTypeAny, path = "$"): boolean {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault)
    return true;
  // A nullable only intercepts null; undefined still reaches the wrapped schema.
  if (schema instanceof z.ZodNullable)
    return isOmittable(schema.unwrap(), path);
  // Whether a refinement accepts undefined cannot be derived, so refuse to guess.
  if (schema instanceof z.ZodEffects && isOmittable(schema.innerType(), path))
    throw unsupported("ZodEffects around an optional or defaulted value", path);
  return false;
}

function convert(
  schema: z.ZodTypeAny,
  options: ZodOpenApiOptions,
  path: string,
): OpenApiSchema {
  const ref = options.refs?.get(schema);
  if (ref) return componentRef(ref);
  const override = options.overrides?.get(schema);
  if (override) return { ...override };

  if (schema instanceof z.ZodObject)
    return convertObject(schema, options, path);
  if (schema instanceof z.ZodString) return convertString(schema, path);
  if (schema instanceof z.ZodNumber) return convertNumber(schema, path);
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum)
    return { type: "string", enum: [...schema.options] };
  if (schema instanceof z.ZodNativeEnum) return convertNativeEnum(schema, path);
  if (schema instanceof z.ZodLiteral) return convertLiteral(schema, path);
  if (schema instanceof z.ZodArray) return convertArray(schema, options, path);
  if (schema instanceof z.ZodUnion)
    return {
      anyOf: schema.options.map((option: z.ZodTypeAny, index: number) =>
        convert(option, options, `${path}|${index}`),
      ),
    };
  if (schema instanceof z.ZodDiscriminatedUnion)
    return {
      oneOf: schema.options.map((option: z.ZodTypeAny, index: number) =>
        convert(option, options, `${path}|${index}`),
      ),
    };
  if (schema instanceof z.ZodOptional)
    return convert(schema.unwrap(), options, path);
  if (schema instanceof z.ZodNullable)
    return withKeywords(convert(schema.unwrap(), options, path), {
      nullable: true,
    });
  if (schema instanceof z.ZodDefault)
    return withKeywords(convert(schema.removeDefault(), options, path), {
      default: schema._def.defaultValue(),
    });
  if (schema instanceof z.ZodEffects) {
    // A refinement narrows its base type; the base type is the documented contract.
    if (schema._def.effect.type === "refinement")
      return convert(schema.innerType(), options, path);
    throw unsupported(`ZodEffects(${schema._def.effect.type})`, path);
  }
  throw unsupported(schema._def.typeName ?? schema.constructor.name, path);
}

/** A `$ref` cannot carry sibling keywords in OpenAPI 3.0, so wrap it in `allOf`. */
function withKeywords(
  base: OpenApiSchema,
  keywords: Partial<SchemaObject>,
): SchemaObject {
  return "$ref" in base
    ? { allOf: [base], ...keywords }
    : { ...base, ...keywords };
}

function convertObject(
  schema: z.AnyZodObject,
  options: ZodOpenApiOptions,
  path: string,
): SchemaObject {
  const { unknownKeys, catchall } = schema._def;
  if (unknownKeys === "passthrough" || !(catchall instanceof z.ZodNever))
    throw unsupported(`ZodObject(${unknownKeys})`, path);
  const entries = Object.entries(schema.shape as z.ZodRawShape);
  const properties = Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      convert(value, options, `${path}.${key}`),
    ]),
  );
  const required = entries
    .filter(([key, value]) => !isOmittable(value, `${path}.${key}`))
    .map(([key]) => key);
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(unknownKeys === "strict" ? { additionalProperties: false } : {}),
  };
}

function convertString(schema: z.ZodString, path: string): SchemaObject {
  return schema._def.checks.reduce<SchemaObject>(
    (result, check) => {
      switch (check.kind) {
        case "min":
          return { ...result, minLength: check.value };
        case "max":
          return { ...result, maxLength: check.value };
        case "length":
          return { ...result, minLength: check.value, maxLength: check.value };
        case "regex":
          // OpenAPI patterns carry no flags; `/x/i` must be documented by an override.
          if (check.regex.flags)
            throw unsupported(`regex with flags "${check.regex.flags}"`, path);
          return { ...result, pattern: check.regex.source };
        case "email":
          return { ...result, format: "email" };
        case "uuid":
          return { ...result, format: "uuid" };
        case "datetime":
          return { ...result, format: "date-time" };
        case "trim":
          // Normalisation before the length checks; not expressible in OpenAPI.
          return result;
        default:
          throw unsupported(`ZodString check "${check.kind}"`, path);
      }
    },
    { type: "string" },
  );
}

function convertNumber(schema: z.ZodNumber, path: string): SchemaObject {
  const isInteger = schema._def.checks.some((check) => check.kind === "int");
  return schema._def.checks.reduce<SchemaObject>(
    (result, check) => {
      switch (check.kind) {
        case "int":
          return result;
        case "min":
          return check.inclusive
            ? { ...result, minimum: check.value }
            : { ...result, minimum: check.value, exclusiveMinimum: true };
        case "max":
          return check.inclusive
            ? { ...result, maximum: check.value }
            : { ...result, maximum: check.value, exclusiveMaximum: true };
        default:
          throw unsupported(`ZodNumber check "${check.kind}"`, path);
      }
    },
    { type: isInteger ? "integer" : "number" },
  );
}

function convertLiteral(
  schema: z.ZodLiteral<unknown>,
  path: string,
): SchemaObject {
  const { value } = schema;
  if (typeof value === "string") return { type: "string", enum: [value] };
  if (typeof value === "boolean") return { type: "boolean", enum: [value] };
  if (typeof value === "number")
    return {
      type: Number.isInteger(value) ? "integer" : "number",
      enum: [value],
    };
  throw unsupported(`ZodLiteral(${typeof value})`, path);
}

function convertNativeEnum(
  schema: z.ZodNativeEnum<z.EnumLike>,
  path: string,
): SchemaObject {
  const values = Object.values(schema.enum);
  // Numeric TypeScript enums carry reverse mappings; only string enums map cleanly.
  if (!values.every((value) => typeof value === "string"))
    throw unsupported("ZodNativeEnum with non-string values", path);
  return { type: "string", enum: values };
}

function convertArray(
  schema: z.ZodArray<z.ZodTypeAny>,
  options: ZodOpenApiOptions,
  path: string,
): SchemaObject {
  const { minLength, maxLength, exactLength } = schema._def;
  return {
    type: "array",
    items: convert(schema.element, options, `${path}[]`),
    ...(minLength ? { minItems: minLength.value } : {}),
    ...(maxLength ? { maxItems: maxLength.value } : {}),
    ...(exactLength
      ? { minItems: exactLength.value, maxItems: exactLength.value }
      : {}),
  };
}

function unsupported(construct: string, path: string): Error {
  return new Error(
    `Cannot document ${construct} at ${path}: extend backend/src/openapi/zod-openapi.ts first`,
  );
}

/**
 * Converts named Zod schemas into OpenAPI components. Each component references the
 * others by `$ref` (but is itself expanded at the top level).
 */
export function zodComponents(
  definitions: Readonly<Record<string, z.ZodTypeAny>>,
  overrides: ReadonlyMap<z.ZodTypeAny, SchemaObject> = new Map(),
): Record<string, OpenApiSchema> {
  const entries = Object.entries(definitions);
  const refs = new Map(entries.map(([name, schema]) => [schema, name]));
  if (refs.size !== entries.length)
    throw new Error("Each OpenAPI component needs its own Zod schema instance");
  return Object.fromEntries(
    entries.map(([name, schema]) => {
      const others = new Map([...refs].filter(([other]) => other !== schema));
      return [name, zodToOpenApi(schema, { refs: others, overrides })];
    }),
  );
}
