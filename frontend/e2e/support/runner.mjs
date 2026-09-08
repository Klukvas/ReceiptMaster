// Minimal test harness. The repo has no frontend test runner and adding one
// would mean a dependency/lockfile change, so the specs are plain modules that
// report pass/fail through this collector.

export class Results {
  constructor(suite) {
    this.suite = suite;
    this.cases = [];
  }

  pass(name) {
    this.cases.push({ name, ok: true });
    process.stdout.write(`  PASS  ${name}\n`);
  }

  fail(name, detail) {
    this.cases.push({ name, ok: false, detail });
    process.stdout.write(`  FAIL  ${name}\n        ${detail}\n`);
  }

  check(name, condition, detail) {
    if (condition) this.pass(name);
    else this.fail(name, detail);
  }

  get failed() {
    return this.cases.filter((c) => !c.ok);
  }
}

export const waitFor = async (predicate, { timeoutMs = 5000, label = "condition" } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

export const settle = async (predicate, { timeoutMs = 5000 } = {}) => {
  try {
    await waitFor(predicate, { timeoutMs });
    return true;
  } catch {
    return false;
  }
};
