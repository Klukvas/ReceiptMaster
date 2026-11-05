// The frontend keeps a verbatim copy of the backend's Ukrainian requisites
// checks (the frontend Docker context cannot import from backend). Both copies
// must give the same answer for every input, or a form would accept what the
// server rejects.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Results } from "./support/runner.mjs";
import { loadTsModule } from "./support/transpile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND = resolve(ROOT, "backend/src/common/utils/ua-requisites.util.ts");
const FRONTEND = resolve(ROOT, "frontend/src/lib/ua-requisites.ts");

// A valid UA IBAN: 29 chars, mod-97 remainder 1.
const VALID_IBAN = "UA213223130000026007233566001";
const BAD_CHECKSUM_IBAN = "UA223223130000026007233566001";

const CORPUS = [
  VALID_IBAN,
  VALID_IBAN.toLowerCase(),
  `UA21 3223 1300 0002 6007 2335 6600 1`,
  `UA21 3223 1300 0002 6007 2335 6600 1`,
  BAD_CHECKSUM_IBAN,
  "UA21",
  "",
  " ",
  "A".repeat(64),
  "A".repeat(65),
  `${VALID_IBAN}${" ".repeat(35)}`, // 64 chars: still normalised
  `${VALID_IBAN}${" ".repeat(36)}`, // 65 chars: passed through untouched
  "12345678",
  "123456789",
  "1234567890",
  "12345678901",
  "123456789012",
  "1234567890123",
  "1234567a",
  "edrpou",
  "rnokpp",
  "other",
  null,
  undefined,
  12345678,
  {},
  [],
  true,
];

const FUNCTIONS = [
  "normalizeIban",
  "isValidUaIban",
  "isValidEdrpou",
  "isValidRnokpp",
  "inferTaxIdKind",
  "isTaxIdKind",
  "isValidVatId",
];

const describe = (value) =>
  typeof value === "string" && value.length > 24
    ? `${JSON.stringify(value.slice(0, 24))}…(${value.length})`
    : JSON.stringify(value) ?? String(value);

export const run = async () => {
  const results = new Results("requisites parity");
  const backend = loadTsModule(BACKEND);
  const frontend = loadTsModule(FRONTEND);

  for (const name of FUNCTIONS) {
    const mismatches = CORPUS.filter(
      (input) =>
        JSON.stringify(backend[name](input)) !==
        JSON.stringify(frontend[name](input)),
    ).map(describe);
    results.check(
      `${name} agrees on ${CORPUS.length} inputs`,
      mismatches.length === 0,
      mismatches.join(", "),
    );
  }

  for (const kind of ["edrpou", "rnokpp"]) {
    const mismatches = CORPUS.filter(
      (input) =>
        backend.isValidTaxId(input, kind) !== frontend.isValidTaxId(input, kind),
    ).map(describe);
    results.check(
      `isValidTaxId(${kind}) agrees`,
      mismatches.length === 0,
      mismatches.join(", "),
    );
  }

  results.check(
    "the corpus really exercises both outcomes (valid IBAN accepted, bad checksum refused)",
    frontend.isValidUaIban(VALID_IBAN) === true &&
      frontend.isValidUaIban(BAD_CHECKSUM_IBAN) === false,
    "fixture IBANs no longer behave as labelled",
  );
  results.check(
    "the copies export the same names",
    JSON.stringify(Object.keys(backend).sort()) ===
      JSON.stringify(Object.keys(frontend).sort()),
    `${Object.keys(backend).sort()} vs ${Object.keys(frontend).sort()}`,
  );

  return results;
};
