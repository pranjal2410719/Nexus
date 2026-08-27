import { register } from "node:module";
import { pathToFileURL } from "node:url";

try {
  register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {}

import assert from "node:assert/strict";
import { rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const { LocalFileStore } = await import("../lib/storage/local-file-store.ts");
const { getStoreMode, getStoreHandle } = await import("../lib/storage/blob-store.ts");
const { makeBatchCommits, makeSingleCommit, fetchCurrentFile } = await import("../lib/core/commit-engine.ts");
const { MockGitHubRepoStore } = await import("./mock_github.js");

const TEST_STORAGE_DIR = join(process.cwd(), ".data", "test_challenger_m2_2_blobs");

async function cleanupStorage() {
  try {
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  } catch {}
}

async function run() {
  console.log("===============================================================================");
  console.log("  CHALLENGER M2_2: EMPIRICAL VERIFICATION OF MILESTONE M2 & E2E INTEGRITY");
  console.log("===============================================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  await cleanupStorage();

  console.log("--- 1. Octokit Client Reuse & Batch Engine Invariants ---");

  await test("1.1 makeBatchCommits reuses explicit config.client without recreation", async () => {
    const mockStore = new MockGitHubRepoStore();
    let clientAccessCount = 0;
    const trackingClient = {
      repos: {
        getContent: async (params) => {
          clientAccessCount++;
          return mockStore.createOctokit("test-token").repos.getContent(params);
        },
        createOrUpdateFileContents: async (params) => {
          clientAccessCount++;
          return mockStore.createOctokit("test-token").repos.createOrUpdateFileContents(params);
        },
      },
    };

    const config = {
      token: "test-token",
      owner: "m2challenger",
      repo: "client-reuse-repo",
      targetFile: "ACTIVITY.md",
      client: trackingClient,
    };

    const batchRes = await makeBatchCommits(config, 5, "reuse-test");
    assert.equal(batchRes.committed, 5, "All 5 commits should succeed");
    assert.equal(batchRes.errors.length, 0, "No errors in batch");
    assert.ok(clientAccessCount >= 10, "trackingClient was called for each get + commit step");
    assert.equal(mockStore.callLog.length, 10, "10 total GitHub API operations logged");
  });

  await test("1.2 makeBatchCommits propagates client to fetchCurrentFile and makeSingleCommit", async () => {
    const mockStore = new MockGitHubRepoStore();
    const usedClients = new Set();

    const trackingClient = {
      id: "singleton-octokit-" + Math.random(),
      repos: {
        getContent: async (params) => {
          usedClients.add(trackingClient.id);
          return mockStore.createOctokit("test-token").repos.getContent(params);
        },
        createOrUpdateFileContents: async (params) => {
          usedClients.add(trackingClient.id);
          return mockStore.createOctokit("test-token").repos.createOrUpdateFileContents(params);
        },
      },
    };

    const config = {
      token: "test-token",
      owner: "m2challenger",
      repo: "client-identity-repo",
      targetFile: "LOG.md",
      client: trackingClient,
    };

    await makeBatchCommits(config, 10, "identity-test");
    assert.equal(usedClients.size, 1, "Only a single Octokit client identity was used across all 10 commits");
    assert.ok(usedClients.has(trackingClient.id), "The exact passed client instance was used");
  });

  await test("1.3 makeSingleCommit utilizes config.client when provided", async () => {
    const mockStore = new MockGitHubRepoStore();
    let singleCommitCalls = 0;
    const client = {
      repos: {
        getContent: async (p) => {
          singleCommitCalls++;
          return mockStore.createOctokit("tok").repos.getContent(p);
        },
        createOrUpdateFileContents: async (p) => {
          singleCommitCalls++;
          return mockStore.createOctokit("tok").repos.createOrUpdateFileContents(p);
        },
      },
    };

    const config = {
      token: "tok",
      owner: "m2challenger",
      repo: "single-commit-repo",
      targetFile: "SINGLE.md",
      client,
    };

    const res = await makeSingleCommit(config);
    assert.ok(res.sha, "Commit returns new SHA");
    assert.equal(singleCommitCalls, 2, "Single commit executed exactly 1 getContent and 1 createOrUpdateFileContents");
  });

  await test("1.4 20 batch sequential commits update blob SHA at each step with client reuse", async () => {
    const mockStore = new MockGitHubRepoStore();
    const client = mockStore.createOctokit("batch-token");
    const config = {
      token: "batch-token",
      owner: "m2challenger",
      repo: "sha-chain-repo",
      targetFile: "nested/path/to/CHAIN.md",
      client,
    };

    const res = await makeBatchCommits(config, 20, "chain-test");
    assert.equal(res.committed, 20, "All 20 sequential commits succeeded");
    assert.equal(res.errors.length, 0);

    const finalFile = mockStore.getFile("m2challenger", "sha-chain-repo", "nested/path/to/CHAIN.md");
    assert.ok(finalFile);
    assert.equal(finalFile.commits.length, 20, "Exact 20 commits recorded in mock git history");
  });

  console.log("\n--- 2. LocalFileStore Async Concurrency & Stress ---");

  await test("2.1 High concurrency: 200 parallel writes across distinct keys", async () => {
    await cleanupStorage();
    const store = new LocalFileStore(TEST_STORAGE_DIR);

    const keys = Array.from({ length: 200 }, (_, i) => `tenant:${i}:config`);
    const writePromises = keys.map((k, i) =>
      store.set(k, JSON.stringify({ tenantId: i, timestamp: Date.now(), data: `payload-${i}` }))
    );

    await Promise.all(writePromises);

    // Verify all 200 exist
    const readPromises = keys.map(async (k, i) => {
      const data = (await store.get(k, { type: "json" }));
      assert.ok(data, `Key ${k} should exist`);
      assert.equal(data.tenantId, i);
    });
    await Promise.all(readPromises);
  });

  await test("2.2 High concurrency on single key: 50 concurrent writes without corruption", async () => {
    const store = new LocalFileStore(TEST_STORAGE_DIR);
    const key = "contention:single_key";

    const promises = Array.from({ length: 50 }, (_, i) =>
      store.set(key, JSON.stringify({ writeIndex: i, text: `race-${i}` }))
    );

    await Promise.all(promises);

    const finalData = (await store.get(key, { type: "json" }));
    assert.ok(finalData, "Single key must parse cleanly as JSON");
    assert.ok(typeof finalData.writeIndex === "number", "Write index must be valid number");
  });

  await test("2.3 Concurrent set, get, and delete operations", async () => {
    const store = new LocalFileStore(TEST_STORAGE_DIR);
    const setKeys = Array.from({ length: 50 }, (_, i) => `crud:key_${i}`);

    // Populate
    await Promise.all(setKeys.map((k, i) => store.set(k, `initial-${i}`)));

    // Concurrently read some, delete some, write some
    const ops = [];
    for (let i = 0; i < 50; i++) {
      if (i % 3 === 0) {
        ops.push(store.delete(`crud:key_${i}`));
      } else if (i % 3 === 1) {
        ops.push(store.get(`crud:key_${i}`));
      } else {
        ops.push(store.set(`crud:key_${i}`, `updated-${i}`));
      }
    }

    await Promise.all(ops);

    // Check deleted keys
    for (let i = 0; i < 50; i += 3) {
      const val = await store.get(`crud:key_${i}`);
      assert.equal(val, null, `Deleted key crud:key_${i} must return null`);
    }
  });

  await test("2.4 Async list pagination and prefix filtering over 100 items", async () => {
    const store = new LocalFileStore(TEST_STORAGE_DIR);
    for (let i = 0; i < 100; i++) {
      const prefix = i < 30 ? "prefixA" : i < 70 ? "prefixB" : "prefixC";
      await store.set(`${prefix}:${i}`, `content-${i}`);
    }

    const collectedA = [];
    for await (const page of store.list({ prefix: "prefixA" })) {
      for (const item of page.blobs) {
        collectedA.push(item.key);
      }
    }
    assert.equal(collectedA.length, 30, "prefixA list should return exactly 30 items");

    const collectedB = [];
    for await (const page of store.list({ prefix: "prefixB" })) {
      for (const item of page.blobs) {
        collectedB.push(item.key);
      }
    }
    assert.equal(collectedB.length, 40, "prefixB list should return exactly 40 items");
  });

  await test("2.5 Directory recovery: removing directory on disk recovers on next set()", async () => {
    const store = new LocalFileStore(TEST_STORAGE_DIR);
    await store.set("recovery:1", "data-1");
    assert.equal(await store.get("recovery:1"), "data-1");

    // Externally remove directory
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });

    // Writing again should automatically recreate directory and succeed
    await store.set("recovery:2", "data-2");
    assert.equal(await store.get("recovery:2"), "data-2");
  });

  await test("2.6 Safe key encoding handles complex characters and symbols", async () => {
    const store = new LocalFileStore(TEST_STORAGE_DIR);
    const crazyKey = "oauth:session:user#123@domain!$%^&*()+=~`{}[]|;:'\",<>?/";
    await store.set(crazyKey, "secret-oauth-payload");
    const retrieved = await store.get(crazyKey);
    assert.equal(retrieved, "secret-oauth-payload");
  });

  await test("2.7 Large payload stress: 2MB JSON object stored and retrieved", async () => {
    const store = new LocalFileStore(TEST_STORAGE_DIR);
    const largeObj = {
      title: "Large payload",
      items: Array.from({ length: 10000 }, (_, i) => ({ id: i, text: "entry " + i, score: i * 1.5 })),
    };
    await store.set("large:payload:1", JSON.stringify(largeObj));
    const result = (await store.get("large:payload:1", { type: "json" }));
    assert.equal(result.items.length, 10000);
    assert.equal(result.items[9999].text, "entry 9999");
  });

  console.log("\n--- 3. Type Safety & StoreMode Alignment ---");

  await test("3.1 getStoreMode resolves correctly based on environment", async () => {
    const origNetlifyBlobsContext = process.env.NETLIFY_BLOBS_CONTEXT;
    const origNetlifyApiToken = process.env.NETLIFY_API_TOKEN;
    const origNetlify = process.env.NETLIFY;
    const origNodeEnv = process.env.NODE_ENV;

    try {
      // 1. Netlify blobs context present -> netlify-blobs
      process.env.NETLIFY_BLOBS_CONTEXT = "some-context";
      delete process.env.NETLIFY_API_TOKEN;
      assert.equal(getStoreMode(), "netlify-blobs");

      // 2. Netlify API token present -> netlify-blobs
      delete process.env.NETLIFY_BLOBS_CONTEXT;
      process.env.NETLIFY_API_TOKEN = "some-token";
      assert.equal(getStoreMode(), "netlify-blobs");

      // 3. Local development without Netlify -> local-file
      delete process.env.NETLIFY_BLOBS_CONTEXT;
      delete process.env.NETLIFY_API_TOKEN;
      delete process.env.NETLIFY;
      process.env.NODE_ENV = "development";
      assert.equal(getStoreMode(), "local-file");

      // 4. Production outside Netlify with NETLIFY set -> unconfigured
      process.env.NODE_ENV = "production";
      process.env.NETLIFY = "true";
      assert.equal(getStoreMode(), "unconfigured");
    } finally {
      process.env.NETLIFY_BLOBS_CONTEXT = origNetlifyBlobsContext;
      process.env.NETLIFY_API_TOKEN = origNetlifyApiToken;
      process.env.NETLIFY = origNetlify;
      process.env.NODE_ENV = origNodeEnv;
    }
  });

  console.log("\n--- 4. Dead Code & Import Integrity Audit ---");

  await test("4.1 Deleted legacy files physically do not exist on disk", async () => {
    const deletedFiles = [
      join(process.cwd(), "lib", "auth.ts"),
      join(process.cwd(), "lib", "commit-helper.ts"),
      join(process.cwd(), "lib", "http.ts"),
      join(process.cwd(), "lib", "local-blobs.ts"),
      join(process.cwd(), "lib", "security.ts"),
      join(process.cwd(), "app", "components", "loader.tsx"),
      join(process.cwd(), "app", "components", "menu-select.tsx"),
      join(process.cwd(), "app", "components"),
    ];

    for (const p of deletedFiles) {
      let exists = true;
      try {
        await readFile(p);
      } catch (err) {
        if (err.code === "ENOENT" || err.code === "EISDIR") {
          try {
            await readdir(p);
          } catch (dErr) {
            if (dErr.code === "ENOENT" || dErr.code === "ENOTDIR") {
              exists = false;
            }
          }
        }
      }
      assert.equal(exists, false, `File/Directory ${p} should NOT exist`);
    }
  });

  await cleanupStorage();

  console.log("\n" + "=".repeat(79));
  console.log(`  CHALLENGER M2_2 RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(79) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
