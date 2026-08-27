// Nexus E2E Test Harness — Zero-dependency async test framework and assertion library.
import { strict as nodeAssert } from "node:assert";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

class TestRunner {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      suites: [],
      startTime: 0,
      endTime: 0,
    };
  }

  describe(name, fn) {
    const suite = {
      name,
      tests: [],
      beforeEachHooks: [],
      afterEachHooks: [],
      beforeAllHooks: [],
      afterAllHooks: [],
    };
    this.suites.push(suite);
    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  test(name, fn, opts = {}) {
    if (!this.currentSuite) {
      this.describe("Default Suite", () => {
        this.test(name, fn, opts);
      });
      return;
    }
    this.currentSuite.tests.push({
      name,
      fn,
      skip: Boolean(opts.skip),
    });
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachHooks.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachHooks.push(fn);
    }
  }

  beforeAll(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeAllHooks.push(fn);
    }
  }

  afterAll(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterAllHooks.push(fn);
    }
  }

  async run() {
    this.results.startTime = Date.now();
    console.log("\n" + "=".repeat(70));
    console.log("  NEXUS E2E TEST RUNNER");
    console.log("=".repeat(70));

    for (const suite of this.suites) {
      console.log(`\n📦 Suite: \x1b[1m\x1b[36m${suite.name}\x1b[0m`);
      const suiteResult = { name: suite.name, tests: [], passed: 0, failed: 0, skipped: 0 };

      // Run beforeAll hooks
      for (const hook of suite.beforeAllHooks) {
        await hook();
      }

      for (const testItem of suite.tests) {
        this.results.total++;
        if (testItem.skip) {
          this.results.skipped++;
          suiteResult.skipped++;
          console.log(`  \x1b[33m- [SKIP]\x1b[0m ${testItem.name}`);
          suiteResult.tests.push({ name: testItem.name, status: "skipped" });
          continue;
        }

        // Run beforeEach hooks
        for (const hook of suite.beforeEachHooks) {
          await hook();
        }

        const tStart = Date.now();
        try {
          await testItem.fn();
          const duration = Date.now() - tStart;
          this.results.passed++;
          suiteResult.passed++;
          console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${testItem.name} \x1b[90m(${duration}ms)\x1b[0m`);
          suiteResult.tests.push({ name: testItem.name, status: "passed", duration });
        } catch (err) {
          const duration = Date.now() - tStart;
          this.results.failed++;
          suiteResult.failed++;
          console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${testItem.name} \x1b[90m(${duration}ms)\x1b[0m`);
          console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
          if (err.stack) {
            const stackLines = err.stack.split("\n").slice(1, 4).join("\n    ");
            console.log(`    \x1b[90m${stackLines}\x1b[0m`);
          }
          suiteResult.tests.push({ name: testItem.name, status: "failed", error: err, duration });
        }

        // Run afterEach hooks
        for (const hook of suite.afterEachHooks) {
          try {
            await hook();
          } catch (hookErr) {
            console.error(`    \x1b[31m[afterEach hook error]: ${hookErr.message}\x1b[0m`);
          }
        }
      }

      // Run afterAll hooks
      for (const hook of suite.afterAllHooks) {
        try {
          await hook();
        } catch (hookErr) {
          console.error(`    \x1b[31m[afterAll hook error]: ${hookErr.message}\x1b[0m`);
        }
      }

      this.results.suites.push(suiteResult);
    }

    this.results.endTime = Date.now();
    this.printSummary();
    return this.results;
  }

  printSummary() {
    const elapsed = ((this.results.endTime - this.results.startTime) / 1000).toFixed(2);
    console.log("\n" + "-".repeat(70));
    console.log(`  TEST SUMMARY: ${this.results.passed}/${this.results.total} passed in ${elapsed}s`);
    if (this.results.failed > 0) {
      console.log(`  \x1b[31mFAILURES: ${this.results.failed} test(s) failed\x1b[0m`);
    } else {
      console.log(`  \x1b[32mALL TESTS PASSED CLEANLY (exit code 0)\x1b[0m`);
    }
    if (this.results.skipped > 0) {
      console.log(`  \x1b[33mSKIPPED: ${this.results.skipped} test(s)\x1b[0m`);
    }
    console.log("-".repeat(70) + "\n");
  }
}

// Global runner instance
const defaultRunner = new TestRunner();

export const describe = (name, fn) => defaultRunner.describe(name, fn);
export const test = (name, fn, opts) => defaultRunner.test(name, fn, opts);
export const it = test;
export const beforeEach = (fn) => defaultRunner.beforeEach(fn);
export const afterEach = (fn) => defaultRunner.afterEach(fn);
export const beforeAll = (fn) => defaultRunner.beforeAll(fn);
export const afterAll = (fn) => defaultRunner.afterAll(fn);
export const run = () => defaultRunner.run();
export const getRunner = () => defaultRunner;
export const createRunner = () => new TestRunner();

// Enhanced assertions
export const assert = {
  ...nodeAssert,
  strictEqual: nodeAssert.strictEqual,
  notStrictEqual: nodeAssert.notStrictEqual,
  deepStrictEqual: nodeAssert.deepStrictEqual,
  ok: nodeAssert.ok,
  match: nodeAssert.match,
  doesNotMatch: nodeAssert.doesNotMatch,
  throws: nodeAssert.throws,
  rejects: nodeAssert.rejects,
  includes: (haystack, needle, message) => {
    if (typeof haystack === "string" || Array.isArray(haystack)) {
      if (!haystack.includes(needle)) {
        nodeAssert.fail(message || `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
      }
    } else {
      nodeAssert.fail(message || `Cannot check includes on non-string/non-array: ${typeof haystack}`);
    }
  },
  greaterThan: (actual, expected, message) => {
    if (!(actual > expected)) {
      nodeAssert.fail(message || `Expected ${actual} to be greater than ${expected}`);
    }
  },
  lessThanOrEqual: (actual, expected, message) => {
    if (!(actual <= expected)) {
      nodeAssert.fail(message || `Expected ${actual} to be <= ${expected}`);
    }
  },
  isTrue: (value, message) => nodeAssert.strictEqual(value, true, message),
  isFalse: (value, message) => nodeAssert.strictEqual(value, false, message),
  isUndefined: (value, message) => nodeAssert.strictEqual(value, undefined, message),
  isDefined: (value, message) => nodeAssert.notStrictEqual(value, undefined, message),
};

// Utilities for isolated testing
export function createTempDir(prefix = "nexus-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: () => {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    },
  };
}

export async function withEnv(envVars, fn) {
  const originalEnv = {};
  for (const [k, v] of Object.entries(envVars)) {
    originalEnv[k] = process.env[k];
    if (v === undefined || v === null) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }
  try {
    return await fn();
  } finally {
    for (const [k, original] of Object.entries(originalEnv)) {
      if (original === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = original;
      }
    }
  }
}
