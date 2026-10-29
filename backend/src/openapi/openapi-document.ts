import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { sharedComponents } from "./api-components";
import { OpenApiSchema } from "./zod-openapi";

const SCHEMA_REF_PREFIX = "#/components/schemas/";

/** One document definition for both the served Swagger UI and the committed contract. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("ReceiptMaster API")
    .setDescription(
      "Multi-tenant SaaS API for managing products, recipients, orders, receipts, and analytics.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer",
    )
    .addApiKey({ type: "apiKey", name: "X-API-Key", in: "header" }, "api-key")
    .build();
  return withSharedComponents(
    SwaggerModule.createDocument(app, config),
    sharedComponents(),
  );
}

export function withSharedComponents(
  document: OpenAPIObject,
  shared: Readonly<Record<string, OpenApiSchema>>,
): OpenAPIObject {
  const generated = document.components?.schemas ?? {};
  const collisions = Object.keys(shared).filter((name) => name in generated);
  if (collisions.length > 0)
    throw new Error(
      `Shared OpenAPI components clash with generated ones: ${collisions.join(", ")}`,
    );
  const merged: OpenAPIObject = {
    ...document,
    components: {
      ...document.components,
      schemas: { ...generated, ...shared },
    },
  };
  const dangling = unresolvedSchemaRefs(merged);
  if (dangling.length > 0)
    throw new Error(
      `OpenAPI document references missing components: ${dangling.join(", ")}`,
    );
  return merged;
}

export function unresolvedSchemaRefs(document: OpenAPIObject): string[] {
  const known = new Set(Object.keys(document.components?.schemas ?? {}));
  const refs = collectRefs(document);
  return [...new Set(refs)]
    .filter(
      (ref) =>
        !ref.startsWith(SCHEMA_REF_PREFIX) ||
        !known.has(ref.slice(SCHEMA_REF_PREFIX.length)),
    )
    .sort();
}

function collectRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectRefs);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "$ref" && typeof child === "string" ? [child] : collectRefs(child),
  );
}
