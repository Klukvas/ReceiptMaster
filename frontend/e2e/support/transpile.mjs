// Loads a TypeScript source file as a CommonJS module for Node-only parity checks.

import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * @param {string} path absolute path of the .ts file
 * @param {Record<string, unknown>} [stubs] module id → exports for its imports
 */
export const loadTsModule = (path, stubs = {}) => {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const module = { exports: {} };
  const requireStub = (id) => {
    if (id in stubs) return stubs[id];
    throw new Error(`${path} imports ${id} at runtime; add a stub for it`);
  };
  new Function("module", "exports", "require", outputText)(
    module,
    module.exports,
    requireStub,
  );
  return module.exports;
};
