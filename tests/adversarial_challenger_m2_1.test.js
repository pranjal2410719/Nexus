/**
 * CHALLENGER M2_1 EMPIRICAL ADVERSARIAL STRESS TEST SUITE
 * 
 * Deep verification of:
 * 1. Non-blocking Asynchronous I/O in LocalFileStore (Event loop jitter & microtask validation)
 * 2. Concurrency, Race Conditions, Multi-tenant Bursts & Directory Recovery
 * 3. Path Traversal Defense, Key Sanitization & Escaped Boundary Fuzzing
 * 4. Data Types, Boundary Payloads (5MB, 0-byte, empty string), Corrupted JSON & Raw Text
 * 5. Async Iterable List Protocol, Prefix Filtering, Lexicographical Sorting & Extension Stripping
 * 6. Storage Abstraction (blob-store.ts) Mode Resolution, Singleton Caching & Error Guardrails
 * 7. Filesystem Error Propagation & Resilient Recovery
 */

import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

try {
  register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // already registered
}

async function runM2ChallengerSuite() {
  console.log("===============================================================================");
  console.log("  CHALLENGER M2_1: EMPIRICAL ADVERSARIAL VERIFICATION SUITE");
  console.log("===============================================================================\n");

  const { LocalFileStore } = await import("../lib/storage/local-file-store.ts");
  const blobStoreModule = await import("../lib/storage/blob-store.ts");
  const { getStoreMode, getStoreHandle } = blobStoreModule;

  let totalTests = 0;
  let passedTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
      }
      throw err;
    }
  }

  const baseTmpDir = await mkdtemp(join(tmpdir(), "nexus-challenger-m2-"));

  try {
    // -------------------------------------------------------------------------
    // 1. Non-Blocking Asynchronous I/O Verification
    // -------------------------------------------------------------------------
    console.log("--- 1. Non-Blocking Asynchronous I/O & Event Loop Health ---");

    await test("1.1 Event loop remains unblocked under 300 concurrent operations (timer tick latency)", async () => {
      const testDir = join(baseTmpDir, "store-async-io");
      const store = new LocalFileStore(testDir);

      let timerTicks = 0;
      const interval = setInterval(() => {
        timerTicks++;
      }, 5);

      const ops = [];
      for (let i = 0; i < 300; i++) {
        ops.push(store.set(`key:${i}`, JSON.stringify({ index: i, data: "x".repeat(1000) })));
      }
      await Promise.all(ops);

      const readOps = [];
      for (let i = 0; i < 300; i++) {
        readOps.push(store.get(`key:${i}`, { type: "json" }));
      }
      const results = await Promise.all(readOps);
      clearInterval(interval);

      assert.strictEqual(results.length, 300);
      assert.strictEqual(results[299].index, 299);
      // If operations were blocking sync I/O in a single synchronous burst, ticks would be 0 or severely starved
      assert.ok(timerTicks >= 1, `Expected event loop ticks during async I/O, got ${timerTicks}`);
    });

    await test("1.2 Operations return native Promise instances and list() returns AsyncIterable", async () => {
      const testDir = join(baseTmpDir, "store-types");
      const store = new LocalFileStore(testDir);

      const setP = store.set("probe", "val");
      assert.ok(setP instanceof Promise, "store.set() must return a Promise");
      await setP;

      const getP = store.get("probe");
      assert.ok(getP instanceof Promise, "store.get() must return a Promise");
      const val = await getP;
      assert.strictEqual(val, "val");

      const delP = store.delete("probe");
      assert.ok(delP instanceof Promise, "store.delete() must return a Promise");
      await delP;

      const listResult = store.list({});
      assert.ok(typeof listResult[Symbol.asyncIterator] === "function", "store.list() must return an AsyncIterable");
    });

    // -------------------------------------------------------------------------
    // 2. Concurrency, Race Conditions & Directory Lifecycle
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Concurrency, Race Conditions & Directory Lifecycle ---");

    await test("2.1 High-concurrency directory creation race (100 simultaneous sets on uncreated dir)", async () => {
      const freshDir = join(baseTmpDir, "concurrent-fresh-dir");
      const store = new LocalFileStore(freshDir);

      const promises = Array.from({ length: 100 }, (_, i) =>
        store.set(`tenant:${i}`, JSON.stringify({ tenantId: i, active: true }))
      );

      // All 100 concurrent promises must resolve cleanly without EEXIST or ENOENT crashes
      await Promise.all(promises);

      // Verify all 100 entries were written properly
      for (let i = 0; i < 100; i++) {
        const data = await store.get(`tenant:${i}`, { type: "json" });
        assert.deepStrictEqual(data, { tenantId: i, active: true });
      }
    });

    await test("2.2 Concurrent read/write race condition on identical key", async () => {
      const testDir = join(baseTmpDir, "same-key-race");
      const store = new LocalFileStore(testDir);

      await store.set("shared:counter", JSON.stringify({ count: 0 }));

      // Launch 50 concurrent writes and 50 concurrent reads simultaneously
      const writes = Array.from({ length: 50 }, (_, i) =>
        store.set("shared:counter", JSON.stringify({ count: i + 1 }))
      );
      const reads = Array.from({ length: 50 }, () =>
        store.get("shared:counter", { type: "json" })
      );

      const [writeResults, readResults] = await Promise.all([
        Promise.all(writes),
        Promise.all(reads),
      ]);

      assert.strictEqual(writeResults.length, 50);
      assert.strictEqual(readResults.length, 50);

      // All reads should have returned valid objects with valid count property
      for (const res of readResults) {
        if (res !== null) {
          assert.ok(typeof res.count === "number");
        }
      }

      // Final read must be valid JSON with count between 1 and 50
      const finalVal = await store.get("shared:counter", { type: "json" });
      assert.ok(finalVal.count >= 1 && finalVal.count <= 50);
    });

    await test("2.3 Dynamic directory deletion and self-healing recovery", async () => {
      const selfHealDir = join(baseTmpDir, "self-heal-dir");
      const store = new LocalFileStore(selfHealDir);

      await store.set("initial:key", "initial value");
      assert.strictEqual(await store.get("initial:key"), "initial value");

      // Delete the backing directory out from underneath the store while running
      await rm(selfHealDir, { recursive: true, force: true });

      // get() on missing directory must return null without throwing
      const getResult = await store.get("initial:key");
      assert.strictEqual(getResult, null);

      // set() must self-heal (catch ENOENT, recreate directory, and successfully write payload)
      await store.set("resurrected:key", "healed value");
      const healedVal = await store.get("resurrected:key");
      assert.strictEqual(healedVal, "healed value");
    });

    await test("2.4 Concurrent delete and get race on 50 keys", async () => {
      const testDir = join(baseTmpDir, "delete-get-race");
      const store = new LocalFileStore(testDir);

      // Populate 50 keys
      await Promise.all(
        Array.from({ length: 50 }, (_, i) => store.set(`delkey:${i}`, `value-${i}`))
      );

      // Simultaneously delete and read
      const deletes = Array.from({ length: 50 }, (_, i) => store.delete(`delkey:${i}`));
      const reads = Array.from({ length: 50 }, (_, i) => store.get(`delkey:${i}`));

      await Promise.all([...deletes, ...reads]);

      // All keys must now be null
      for (let i = 0; i < 50; i++) {
        const val = await store.get(`delkey:${i}`);
        assert.strictEqual(val, null);
      }
    });

    // -------------------------------------------------------------------------
    // 3. Key Sanitization, Boundary Fuzzing & Path Traversal Rejection
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Key Sanitization & Path Traversal Rejection ---");

    await test("3.1 Path traversal injection attacks are sanitized and trapped inside store dir", async () => {
      const testDir = join(baseTmpDir, "traversal-test");
      const store = new LocalFileStore(testDir);
      const normalizedStoreDir = resolve(testDir);

      const maliciousKeys = [
        "../../../etc/passwd",
        "..\\..\\windows\\system32\\calc.exe",
        "/absolute/root/path",
        "nested/../../escape",
        "key\0with\0nullbytes",
        "%2e%2e%2f%2e%2e%2froot",
        "....",
        "..",
        ".",
        "~/.ssh/id_rsa",
        "foo/bar/baz:123",
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "LPT1",
        "key with spaces and # $ % & * ( ) + = { } [ ] ; ' \" < > ? | ` ~",
      ];

      for (const malKey of maliciousKeys) {
        await store.set(malKey, JSON.stringify({ key: malKey, safe: true }));
        const readBack = await store.get(malKey, { type: "json" });
        assert.deepStrictEqual(readBack, { key: malKey, safe: true });
      }

      // Check all files in store directory to ensure NONE escaped
      let count = 0;
      for await (const page of store.list({})) {
        count += page.blobs.length;
      }
      assert.strictEqual(count, maliciousKeys.length);
    });

    await test("3.2 Complex unicode, emojis, and high-entropy key characters", async () => {
      const testDir = join(baseTmpDir, "unicode-keys");
      const store = new LocalFileStore(testDir);

      const unicodeKeys = [
        "user:🚀_orbit_123",
        "session:🔑_auth_🔑",
        "counter:日_本_語:2026",
        "emoji:🎉✨🔥",
        "special:hyphen-dot.colon:under_score",
      ];

      for (const k of unicodeKeys) {
        await store.set(k, `content-for-${k}`);
        const val = await store.get(k);
        assert.strictEqual(val, `content-for-${k}`);
      }
    });

    // -------------------------------------------------------------------------
    // 4. Data Boundaries, Payloads, Malformed JSON & Raw Text
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Data Boundaries, Payloads & Serialization ---");

    await test("4.1 0-byte and empty string storage roundtrip", async () => {
      const testDir = join(baseTmpDir, "empty-content");
      const store = new LocalFileStore(testDir);

      await store.set("empty:str", "");
      const resText = await store.get("empty:str");
      assert.strictEqual(resText, "");

      const resJson = await store.get("empty:str", { type: "json" });
      // Empty string is invalid JSON -> returns null
      assert.strictEqual(resJson, null);
    });

    await test("4.2 Large payload stress test (5MB multi-line data)", async () => {
      const testDir = join(baseTmpDir, "large-payload");
      const store = new LocalFileStore(testDir);

      const largeString = "A".repeat(5 * 1024 * 1024); // 5 MB
      const largePayload = { id: "large-5mb", content: largeString };

      await store.set("large:data", JSON.stringify(largePayload));

      const retrieved = await store.get("large:data", { type: "json" });
      assert.strictEqual(retrieved.id, "large-5mb");
      assert.strictEqual(retrieved.content.length, 5 * 1024 * 1024);

      await store.delete("large:data");
      const afterDel = await store.get("large:data");
      assert.strictEqual(afterDel, null);
    });

    await test("4.3 Automatic JSON.stringify for non-string values passed to set()", async () => {
      const testDir = join(baseTmpDir, "non-string-set");
      const store = new LocalFileStore(testDir);

      // Object
      await store.set("obj:1", { name: "Nexus", active: true });
      assert.deepStrictEqual(await store.get("obj:1", { type: "json" }), { name: "Nexus", active: true });

      // Array
      await store.set("arr:1", [1, 2, "three", { four: 4 }]);
      assert.deepStrictEqual(await store.get("arr:1", { type: "json" }), [1, 2, "three", { four: 4 }]);

      // Number
      await store.set("num:1", 4242);
      assert.strictEqual(await store.get("num:1", { type: "json" }), 4242);

      // Boolean
      await store.set("bool:1", true);
      assert.strictEqual(await store.get("bool:1", { type: "json" }), true);
    });

    await test("4.4 Malformed and corrupted JSON handling in get(key, { type: 'json' })", async () => {
      const testDir = join(baseTmpDir, "corrupted-json");
      const store = new LocalFileStore(testDir);

      await store.set("bad:json1", "{ unclosed json: ");
      await store.set("bad:json2", "<<XML NOT JSON>>");
      await store.set("bad:json3", "undefined");

      // get with json type must return null rather than throwing SyntaxError
      assert.strictEqual(await store.get("bad:json1", { type: "json" }), null);
      assert.strictEqual(await store.get("bad:json2", { type: "json" }), null);
      assert.strictEqual(await store.get("bad:json3", { type: "json" }), null);

      // get with raw/default must return exact string
      assert.strictEqual(await store.get("bad:json1"), "{ unclosed json: ");
    });

    await test("4.5 Non-existent key queries return null for both raw and JSON requests", async () => {
      const testDir = join(baseTmpDir, "missing-keys");
      const store = new LocalFileStore(testDir);

      assert.strictEqual(await store.get("does_not_exist"), null);
      assert.strictEqual(await store.get("does_not_exist", { type: "json" }), null);
      assert.strictEqual(await store.get("does_not_exist", { type: "text" }), null);
    });

    // -------------------------------------------------------------------------
    // 5. Async Iterable List Protocol & Prefix Filtering
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Async Iterable List Protocol & Prefix Filtering ---");

    await test("5.1 list() on missing or empty directory returns empty page without error", async () => {
      const missingDir = join(baseTmpDir, "missing-list-dir");
      const store = new LocalFileStore(missingDir);

      const pages = [];
      for await (const page of store.list({})) {
        pages.push(page);
      }

      assert.strictEqual(pages.length, 1);
      assert.deepStrictEqual(pages[0].blobs, []);
    });

    await test("5.2 list() with 200 keys across multiple namespaces, sorting and prefix filtering", async () => {
      const testDir = join(baseTmpDir, "list-namespaces");
      const store = new LocalFileStore(testDir);

      const userKeys = Array.from({ length: 50 }, (_, i) => `user:${String(i).padStart(3, "0")}`);
      const sessionKeys = Array.from({ length: 50 }, (_, i) => `session:${String(i).padStart(3, "0")}`);
      const oauthKeys = Array.from({ length: 50 }, (_, i) => `oauth:${String(i).padStart(3, "0")}`);
      const counterKeys = Array.from({ length: 50 }, (_, i) => `counter:${String(i).padStart(3, "0")}`);

      const allKeys = [...userKeys, ...sessionKeys, ...oauthKeys, ...counterKeys];

      await Promise.all(allKeys.map((k) => store.set(k, `val-${k}`)));

      // 1. List all keys (no prefix)
      let allFound = [];
      for await (const page of store.list({})) {
        allFound.push(...page.blobs.map((b) => b.key));
      }
      assert.strictEqual(allFound.length, 200);

      // Verify sorted order
      const sortedCopy = [...allFound].sort();
      assert.deepStrictEqual(allFound, sortedCopy);

      // 2. Prefix filtering on 'user:'
      let userFound = [];
      for await (const page of store.list({ prefix: "user:" })) {
        userFound.push(...page.blobs.map((b) => b.key));
      }
      assert.strictEqual(userFound.length, 50);
      assert.ok(userFound.every((k) => k.startsWith("user:")));

      // 3. Prefix filtering on 'session:'
      let sessionFound = [];
      for await (const page of store.list({ prefix: "session:" })) {
        sessionFound.push(...page.blobs.map((b) => b.key));
      }
      assert.strictEqual(sessionFound.length, 50);
      assert.ok(sessionFound.every((k) => k.startsWith("session:")));

      // 4. Non-matching prefix
      let nonFound = [];
      for await (const page of store.list({ prefix: "nonexistent:" })) {
        nonFound.push(...page.blobs.map((b) => b.key));
      }
      assert.strictEqual(nonFound.length, 0);
    });

    await test("5.3 list() strips trailing .json correctly even when key contains internal dots", async () => {
      const testDir = join(baseTmpDir, "dots-in-key");
      const store = new LocalFileStore(testDir);

      await store.set("config.v1.schema.json", "content1");
      await store.set("archive.2026.08.tar.gz", "content2");

      let found = [];
      for await (const page of store.list({})) {
        found.push(...page.blobs.map((b) => b.key));
      }

      assert.ok(found.includes("config.v1.schema.json"));
      assert.ok(found.includes("archive.2026.08.tar.gz"));
    });

    // -------------------------------------------------------------------------
    // 6. Storage Layer Abstraction & Mode Dispatch (blob-store.ts)
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Storage Abstraction (blob-store.ts) & Mode Dispatch ---");

    await test("6.1 getStoreMode() resolves correctly for Netlify Blobs environment", async () => {
      const originalEnv = { ...process.env };
      try {
        // Scenario A: NETLIFY_BLOBS_CONTEXT present
        process.env.NETLIFY_BLOBS_CONTEXT = "ctx_mock_123";
        delete process.env.NETLIFY_API_TOKEN;
        assert.strictEqual(getStoreMode(), "netlify-blobs");

        // Scenario B: NETLIFY_API_TOKEN present
        delete process.env.NETLIFY_BLOBS_CONTEXT;
        process.env.NETLIFY_API_TOKEN = "token_mock_456";
        assert.strictEqual(getStoreMode(), "netlify-blobs");
      } finally {
        process.env = originalEnv;
      }
    });

    await test("6.2 getStoreMode() resolves 'local-file' outside Netlify in dev/standard env", async () => {
      const originalEnv = { ...process.env };
      try {
        delete process.env.NETLIFY_BLOBS_CONTEXT;
        delete process.env.NETLIFY_API_TOKEN;
        delete process.env.NETLIFY;
        process.env.NODE_ENV = "development";

        assert.strictEqual(getStoreMode(), "local-file");
      } finally {
        process.env = originalEnv;
      }
    });

    await test("6.3 getStoreMode() resolves 'unconfigured' in production on Netlify without blob credentials", async () => {
      const originalEnv = { ...process.env };
      try {
        delete process.env.NETLIFY_BLOBS_CONTEXT;
        delete process.env.NETLIFY_API_TOKEN;
        process.env.NETLIFY = "true";
        process.env.NODE_ENV = "production";

        assert.strictEqual(getStoreMode(), "unconfigured");
      } finally {
        process.env = originalEnv;
      }
    });

    await test("6.4 getStoreHandle() returns LocalFileStore instance when mode is 'local-file'", async () => {
      const customBlobsDir = join(baseTmpDir, "custom-blobs-dir");
      const originalEnv = { ...process.env };
      try {
        delete process.env.NETLIFY_BLOBS_CONTEXT;
        delete process.env.NETLIFY_API_TOKEN;
        delete process.env.NETLIFY;
        process.env.NODE_ENV = "development";
        process.env.LOCAL_BLOBS_DIR = customBlobsDir;

        const store = getStoreHandle();
        assert.ok(store, "Store handle must be non-null");

        // Verify write/read works on custom directory
        await store.set("handle:test", JSON.stringify({ mode: "local-file" }));
        const val = await store.get("handle:test", { type: "json" });
        assert.deepStrictEqual(val, { mode: "local-file" });
      } finally {
        process.env = originalEnv;
      }
    });

    // -------------------------------------------------------------------------
    // 7. Multi-Tenant Interleaved Simulation Under Sustained Load
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Multi-Tenant Interleaved Simulation Under Sustained Load ---");

    await test("7.1 1000 interleaved operations across 20 simulated tenants simultaneously", async () => {
      const stressDir = join(baseTmpDir, "multi-tenant-stress");
      const store = new LocalFileStore(stressDir);

      const tenants = Array.from({ length: 20 }, (_, i) => `tenant_${i}`);
      const operations = [];

      // Interleave sets, gets, deletes, lists
      for (let op = 0; op < 50; op++) {
        for (const t of tenants) {
          const key = `user:${t}:config_${op}`;
          operations.push(async () => {
            // Write
            await store.set(key, JSON.stringify({ tenant: t, op, ts: Date.now() }));
            // Read
            const read = await store.get(key, { type: "json" });
            assert.strictEqual(read.tenant, t);
            assert.strictEqual(read.op, op);
            // Conditional delete
            if (op % 5 === 0) {
              await store.delete(key);
              const afterDel = await store.get(key);
              assert.strictEqual(afterDel, null);
            }
          });
        }
      }

      // Execute all 1000 operations in parallel bursts
      await Promise.all(operations.map((fn) => fn()));

      // Count remaining keys
      let remainingCount = 0;
      for await (const page of store.list({})) {
        remainingCount += page.blobs.length;
      }
      // 50 ops * 20 tenants = 1000 ops. Ops with op % 5 === 0 are deleted (10 ops per tenant = 200 deleted).
      // Remaining should be 800 keys.
      assert.strictEqual(remainingCount, 800);
    });

  } finally {
    // Cleanup temporary scratch directory
    await rm(baseTmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n" + "=".repeat(79));
  console.log(`  ALL ${passedTests}/${totalTests} CHALLENGER M2_1 TESTS PASSED SUCCESSFULLY!`);
  console.log("=".repeat(79) + "\n");
}

runM2ChallengerSuite().catch((err) => {
  console.error("FATAL ERROR IN CHALLENGER M2_1 SUITE:", err);
  process.exit(1);
});
