import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Type } from "@nestjs/common";
import { ModulesContainer, NestFactory } from "@nestjs/core";
import { OpenAPIObject } from "@nestjs/swagger";
import {
  describeContractDrift,
  listControllerRoutes,
  listDocumentedOperations,
  multisetDifference,
  serializeDocument,
} from "./openapi-contract";

/**
 * Exports (or with `--check`, verifies) backend/openapi.json.
 *
 * The app is booted in Nest preview mode: modules and controllers are registered from
 * metadata but no provider or factory runs, so no database, Redis, queue worker, cron,
 * migration, webhook or storage client is ever created. The environment below is a
 * second fence: it is applied before AppModule is imported so a local .env cannot
 * point an accidental connection at real infrastructure.
 */
const EXPORT_ENVIRONMENT = {
  NODE_ENV: "test",
  AUTO_RUN_MIGRATIONS: "false",
  BILLING_ENABLED: "false",
  DB_HOST: "openapi-export.invalid",
  REDIS_HOST: "openapi-export.invalid",
} as const;
const PLACEHOLDER_JWT_SECRET = "openapi-export-placeholder-not-a-real-secret";
const SPEC_PATH = resolve(__dirname, "..", "..", "openapi.json");

async function buildDocument(): Promise<{
  document: OpenAPIObject;
  routes: string[];
}> {
  Object.assign(process.env, EXPORT_ENVIRONMENT);
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = PLACEHOLDER_JWT_SECRET;
  const { AppModule } = await import("../app.module");
  const { createOpenApiDocument } = await import("./openapi-document");
  const app = await NestFactory.create(AppModule, {
    preview: true,
    abortOnError: false,
    logger: ["error", "warn"],
  });
  const controllers = [...app.get(ModulesContainer).values()].flatMap(
    (moduleRef) =>
      [...moduleRef.controllers.values()].map(
        (wrapper) => wrapper.metatype as Type<unknown>,
      ),
  );
  return {
    document: createOpenApiDocument(app),
    routes: listControllerRoutes(controllers),
  };
}

async function run(args: readonly string[]): Promise<number> {
  const isCheck = args.includes("--check");
  const { document, routes } = await buildDocument();
  const documented = listDocumentedOperations(document);
  process.stdout.write(
    `routes=${routes.length} documented=${documented.length}\n`,
  );
  const undocumented = multisetDifference(routes, documented);
  const unrouted = multisetDifference(documented, routes);
  if (undocumented.length > 0 || unrouted.length > 0) {
    console.error(
      [
        "Controller routes and documented operations differ:",
        ...undocumented.map((key) => `  undocumented route ${key}`),
        ...unrouted.map((key) => `  documented without a route ${key}`),
      ].join("\n"),
    );
    return 1;
  }

  const serialized = serializeDocument(document);
  if (!isCheck) {
    writeFileSync(SPEC_PATH, serialized);
    process.stdout.write(`OpenAPI spec written to ${SPEC_PATH}\n`);
    return 0;
  }
  const stored = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
  if (stored === serialized) {
    process.stdout.write("backend/openapi.json matches the code\n");
    return 0;
  }
  const storedDocument: OpenAPIObject = stored
    ? JSON.parse(stored)
    : { openapi: "", info: { title: "", version: "" }, paths: {} };
  console.error(
    [
      "backend/openapi.json is out of date with the code:",
      ...describeContractDrift(storedDocument, document),
      "Run `yarn openapi:export` in backend/ and commit backend/openapi.json.",
    ].join("\n"),
  );
  return 1;
}

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("OpenAPI export failed:", error);
    process.exit(1);
  },
);
