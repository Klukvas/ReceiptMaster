import { RequestMethod, Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { MetadataScanner } from "@nestjs/core";
import { OpenAPIObject } from "@nestjs/swagger";
import { DECORATORS } from "@nestjs/swagger/dist/constants";

/** Helpers for the contract exporter: route completeness and drift reporting. */
const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export function serializeDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** `METHOD /path/{param}`, the same form Swagger uses for path keys. */
export function routeKey(
  method: string,
  controllerPath: string,
  handlerPath: string,
): string {
  const joined = `/${controllerPath}/${handlerPath}`
    .replace(/\/+/g, "/")
    .replace(/(.)\/$/, "$1");
  return `${method.toUpperCase()} ${joined.replace(/:(\w+)/g, "{$1}")}`;
}

const asPaths = (value: unknown): string[] =>
  Array.isArray(value) ? value : [typeof value === "string" ? value : ""];

/** Every routed handler Swagger is expected to document (excluded ones skipped). */
export function listControllerRoutes(
  controllers: Iterable<Type<unknown>>,
): string[] {
  const scanner = new MetadataScanner();
  return [...new Set(controllers)].flatMap((controller) => {
    const excluded = Reflect.getMetadata(
      DECORATORS.API_EXCLUDE_CONTROLLER,
      controller,
    );
    if (excluded?.[0] === true) return [];
    const prototype = controller.prototype;
    const controllerPaths = asPaths(
      Reflect.getMetadata(PATH_METADATA, controller),
    );
    return scanner.getAllMethodNames(prototype).flatMap((name) => {
      const handler = prototype[name];
      const method: RequestMethod | undefined = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      );
      if (method === undefined) return [];
      if (
        Reflect.getMetadata(DECORATORS.API_EXCLUDE_ENDPOINT, handler)?.disable
      )
        return [];
      if (method === RequestMethod.ALL)
        throw new Error(
          `${controller.name}.${name}: @All routes are not supported`,
        );
      const handlerPaths = asPaths(Reflect.getMetadata(PATH_METADATA, handler));
      return controllerPaths.flatMap((base) =>
        handlerPaths.map((path) => routeKey(RequestMethod[method], base, path)),
      );
    });
  });
}

export function listDocumentedOperations(document: OpenAPIObject): string[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => item[method]).map(
      (method) => `${method.toUpperCase()} ${path}`,
    ),
  );
}

/** Multiset difference: entries of `left` not matched one-for-one in `right`. */
export function multisetDifference(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const remaining = right.reduce(
    (counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1),
    new Map<string, number>(),
  );
  return left.filter((key) => {
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

type Entries = Readonly<Record<string, unknown>>;

function operationsOf(document: OpenAPIObject): Entries {
  return Object.fromEntries(
    Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => item[method]).map((method) => [
        `${method.toUpperCase()} ${path}`,
        item[method],
      ]),
    ),
  );
}

const propertiesOf = (schema: unknown): Entries => {
  const properties = (schema as { properties?: unknown } | undefined)
    ?.properties;
  return properties && typeof properties === "object"
    ? (properties as Entries)
    : {};
};

/** Top-level property changes of a changed schema, e.g. ` (+note, ~total)`. */
function propertyDetail(stored: unknown, fresh: unknown): string {
  const before = propertiesOf(stored);
  const after = propertiesOf(fresh);
  const changes = [
    ...Object.keys(after)
      .filter((key) => !(key in before))
      .map((key) => `+${key}`),
    ...Object.keys(before)
      .filter((key) => !(key in after))
      .map((key) => `-${key}`),
    ...Object.keys(after)
      .filter(
        (key) =>
          key in before &&
          JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      )
      .map((key) => `~${key}`),
  ];
  return changes.length > 0 ? ` (${changes.join(", ")})` : "";
}

function diffEntries(
  label: string,
  stored: Entries,
  fresh: Entries,
  detail: (stored: unknown, fresh: unknown) => string = () => "",
): string[] {
  const same = (key: string) =>
    JSON.stringify(stored[key]) === JSON.stringify(fresh[key]);
  return [
    ...Object.keys(fresh)
      .filter((key) => !(key in stored))
      .map((key) => `  + ${label} ${key}`),
    ...Object.keys(stored)
      .filter((key) => !(key in fresh))
      .map((key) => `  - ${label} ${key}`),
    ...Object.keys(fresh)
      .filter((key) => key in stored && !same(key))
      .map((key) => `  ~ ${label} ${key}${detail(stored[key], fresh[key])}`),
  ];
}

/** Human-readable summary of how the committed contract differs from the code. */
export function describeContractDrift(
  stored: OpenAPIObject,
  fresh: OpenAPIObject,
): string[] {
  const changes = [
    ...diffEntries("operation", operationsOf(stored), operationsOf(fresh)),
    ...diffEntries(
      "component",
      stored.components?.schemas ?? {},
      fresh.components?.schemas ?? {},
      propertyDetail,
    ),
  ];
  return changes.length > 0
    ? changes
    : ["  ~ document metadata or formatting (no operation/component changes)"];
}
