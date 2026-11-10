import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { ApiErrors } from "../errors/ApiError";

/** Far deeper than any request body this API accepts; a JSON settings config is ~4 levels. */
export const MAX_INPUT_DEPTH = 32;

const NUL = "\u0000";
const CHECKED_SOURCES: ReadonlySet<ArgumentMetadata["type"]> = new Set([
  "body",
  "query",
  "param",
]);

type Pending = { value: unknown; path: string; depth: number };

const isPlainContainer = (value: unknown): value is object => {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const childPath = (parent: string, key: string, isIndex: boolean): string => {
  if (isIndex) return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
};

/**
 * Runs before the ValidationPipe on every body, query and route parameter.
 *
 * - Postgres text cannot hold U+0000, so a NUL anywhere reached the database as a 500.
 * - ValidationPipe walks a body recursively; JSON nested a few thousand levels deep
 *   overflowed the stack (a 500). The walk here is iterative and stops at
 *   `MAX_INPUT_DEPTH`, so the recursive one never sees such a body.
 *
 * Both answer 400 VALIDATION_ERROR naming the offending field.
 */
@Injectable()
export class RejectUnsafeInputPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (CHECKED_SOURCES.has(metadata.type)) {
      assertSafeInput(value, metadata.data ?? "");
    }
    return value;
  }
}

export function assertSafeInput(input: unknown, rootPath: string): void {
  const pending: Pending[] = [{ value: input, path: rootPath, depth: 0 }];
  while (pending.length > 0) {
    const { value, path, depth } = pending.pop() as Pending;
    if (typeof value === "string") {
      if (value.includes(NUL)) {
        throw ApiErrors.VALIDATION_ERROR(
          path || "body",
          "must not contain the NUL character",
        );
      }
      continue;
    }
    if (!isPlainContainer(value)) continue;
    if (depth >= MAX_INPUT_DEPTH) {
      throw ApiErrors.VALIDATION_ERROR(
        path || "body",
        `must not be nested deeper than ${MAX_INPUT_DEPTH} levels`,
      );
    }
    const isArray = Array.isArray(value);
    for (const [key, item] of Object.entries(value)) {
      const itemPath = childPath(path, key, isArray);
      if (key.includes(NUL)) {
        throw ApiErrors.VALIDATION_ERROR(
          itemPath,
          "must not contain the NUL character",
        );
      }
      pending.push({ value: item, path: itemPath, depth: depth + 1 });
    }
  }
}
