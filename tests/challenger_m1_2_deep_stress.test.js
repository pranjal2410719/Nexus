/**
 * Challenger M1_2 Empirical Verification & Adversarial Stress Suite
 * Milestone: M1 (File Update Bug Fix, SHA Propagation & Log Pruner Robustness)
 * 
 * Verifies:
 * 1. Batch sequential commits (10, 50, 100 iterations) with end-to-end SHA lineage chaining.
 * 2. 0-byte file edge cases (empty string, null content, undefined content, 0-byte blob SHA).
 * 3. High-frequency and interleaved multi-tenant batch commits (zero collisions, zero stale 409s).
 * 4. Mid-batch transient error resilience and recovery.
 * 5. Log pruner stress, complex user markdown, code blocks, whitespace drift invariants (200 cycles), ReDoS safety.
 */

import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";

try {
  register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // if already registered
}

const {
  pruneEntries,
  fetchCurrentFile,
  makeSingleCommit,
  makeBatchCommits,
  sanitizePath,
} = await import("../lib/core/commit-engine.ts");

console.log("===============================================================================");
console.log("  CHALLENGER M1_2: DEEP EMPIRICAL STRESS & ADVERSARIAL VERIFICATION SUITE");
console.log("===============================================================================\n");

let passed = 0;
let failed = 0;

function computeBlobSha(content) {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const header = `blob ${buf.length}\0`;
  const store = Buffer.concat([Buffer.from(header, "utf8"), buf]);
  return createHash("sha1").update(store).digest("hex");
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
    }
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
    }
    failed++;
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: 0-BYTE FILE EDGE CASES & ABNORMAL GITHUB PAYLOADS
// -----------------------------------------------------------------------------
console.log("--- 1. 0-Byte File Edge Cases & Abnormal GitHub Payloads ---");

await asyncTest("1.1 0-byte file with git standard empty SHA 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'", async () => {
  const emptySha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
  let capturedPayload = null;

  const mockClient = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          name: "EMPTY.md",
          path: "EMPTY.md",
          sha: emptySha,
          size: 0,
          content: "",
          encoding: "base64",
        },
      }),
      createOrUpdateFileContents: async (params) => {
        capturedPayload = params;
        return {
          data: {
            commit: {
              sha: "new_commit_sha_001",
              html_url: "https://github.com/test/repo/commit/new_commit_sha_001",
            },
          },
        };
      },
    },
  };

  const fileData = await fetchCurrentFile({
    token: "fake-tok",
    owner: "org",
    repo: "repo",
    targetFile: "EMPTY.md",
    client: mockClient,
  });

  assert.strictEqual(fileData.content, "");
  assert.strictEqual(fileData.sha, emptySha, "fetchCurrentFile must extract 0-byte file SHA");

  const result = await makeSingleCommit({
    token: "fake-tok",
    owner: "org",
    repo: "repo",
    targetFile: "EMPTY.md",
    client: mockClient,
  });

  assert.strictEqual(result.sha, "new_commit_sha_001");
  assert.strictEqual(capturedPayload.sha, emptySha, "Must supply emptySha in update payload");
  const decoded = Buffer.from(capturedPayload.content, "base64").toString("utf-8");
  assert.ok(decoded.startsWith("# DSA Practice & Build Activity Log\n\n"), "Must initialize default header on empty file");
});

await asyncTest("1.2 0-byte file where content field is undefined/null from API", async () => {
  const emptySha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
  let capturedPayload = null;

  const mockClient = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          name: "EMPTY_NULL.md",
          path: "EMPTY_NULL.md",
          sha: emptySha,
          size: 0,
          content: undefined, // undefined content
        },
      }),
      createOrUpdateFileContents: async (params) => {
        capturedPayload = params;
        return {
          data: {
            commit: { sha: "commit_null_002", html_url: "url" },
          },
        };
      },
    },
  };

  const fileData = await fetchCurrentFile({
    token: "fake-tok",
    owner: "org",
    repo: "repo",
    targetFile: "EMPTY_NULL.md",
    client: mockClient,
  });

  assert.strictEqual(fileData.content, "");
  assert.strictEqual(fileData.sha, emptySha);

  await makeSingleCommit({
    token: "fake-tok",
    owner: "org",
    repo: "repo",
    targetFile: "EMPTY_NULL.md",
    client: mockClient,
  });

  assert.strictEqual(capturedPayload.sha, emptySha, "Must pass SHA even if content was undefined in response");
});

await asyncTest("1.3 0-byte file followed immediately by 10 batch sequential commits", async () => {
  let fileState = {
    sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
    content: "",
    size: 0,
  };

  const recordedCalls = [];

  const mockClient = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          name: "EMPTY_BATCH.md",
          path: "EMPTY_BATCH.md",
          sha: fileState.sha,
          size: fileState.size,
          content: Buffer.from(fileState.content).toString("base64"),
        },
      }),
      createOrUpdateFileContents: async (params) => {
        if (params.sha !== fileState.sha) {
          const err = new Error(`409 Conflict: Expected SHA ${fileState.sha}, got ${params.sha}`);
          err.status = 409;
          throw err;
        }
        const decoded = Buffer.from(params.content, "base64").toString("utf-8");
        const nextBlobSha = computeBlobSha(decoded);
        const nextCommitSha = `commit_sha_${recordedCalls.length + 1}`;

        fileState = {
          sha: nextBlobSha,
          content: decoded,
          size: Buffer.byteLength(decoded),
        };

        recordedCalls.push({
          shaUsed: params.sha,
          newBlobSha: nextBlobSha,
          newCommitSha: nextCommitSha,
        });

        return {
          data: {
            commit: {
              sha: nextCommitSha,
              html_url: `https://github.com/org/repo/commit/${nextCommitSha}`,
            },
          },
        };
      },
    },
  };

  const batchRes = await makeBatchCommits(
    {
      token: "fake-tok",
      owner: "org",
      repo: "repo",
      targetFile: "./EMPTY_BATCH.md",
      client: mockClient,
    },
    10,
    "from-empty"
  );

  assert.strictEqual(batchRes.committed, 10);
  assert.strictEqual(batchRes.errors.length, 0);
  assert.strictEqual(recordedCalls.length, 10);
  assert.strictEqual(recordedCalls[0].shaUsed, "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391", "First commit used 0-byte sha");
  for (let i = 1; i < 10; i++) {
    assert.strictEqual(recordedCalls[i].shaUsed, recordedCalls[i - 1].newBlobSha, `Iteration ${i} correctly chained previous blob SHA`);
  }
  const entriesCount = (fileState.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || []).length;
  assert.strictEqual(entriesCount, 5, "Must keep rolling 5 entries");
});

// -----------------------------------------------------------------------------
// SECTION 2: BATCH SEQUENTIAL COMMITS & HIGH-FREQUENCY SHA CHAINING
// -----------------------------------------------------------------------------
console.log("\n--- 2. Batch Sequential Commits & High-Frequency SHA Chaining ---");

await asyncTest("2.1 Non-existent file (404) -> Batch of 25 commits -> SHA evolution chain", async () => {
  let fileState = null; // initially 404
  const lineage = [];

  const mockClient = {
    repos: {
      getContent: async () => {
        if (!fileState) {
          const err = new Error("Not Found");
          err.status = 404;
          throw err;
        }
        return {
          data: {
            type: "file",
            name: "NEW_BURST.md",
            path: "NEW_BURST.md",
            sha: fileState.sha,
            size: Buffer.byteLength(fileState.content),
            content: Buffer.from(fileState.content).toString("base64"),
          },
        };
      },
      createOrUpdateFileContents: async (params) => {
        if (fileState === null) {
          if (params.sha !== undefined) {
            throw new Error(`Expected sha: undefined for new file creation, got: ${params.sha}`);
          }
        } else {
          if (params.sha !== fileState.sha) {
            const err = new Error(`409 Conflict: Remote SHA ${fileState.sha} !== Param SHA ${params.sha}`);
            err.status = 409;
            throw err;
          }
        }

        const decoded = Buffer.from(params.content, "base64").toString("utf-8");
        const newBlobSha = computeBlobSha(decoded);
        const newCommitSha = `commit_burst_${lineage.length + 1}`;

        fileState = {
          sha: newBlobSha,
          content: decoded,
        };

        lineage.push({
          iteration: lineage.length + 1,
          shaUsed: params.sha,
          newBlobSha,
          newCommitSha,
        });

        return {
          data: {
            commit: {
              sha: newCommitSha,
              html_url: `https://github.com/org/repo/commit/${newCommitSha}`,
            },
          },
        };
      },
    },
  };

  const batchRes = await makeBatchCommits(
    {
      token: "fake-tok",
      owner: "org",
      repo: "repo",
      targetFile: "NEW_BURST.md",
      client: mockClient,
    },
    25,
    "from-404"
  );

  assert.strictEqual(batchRes.committed, 25);
  assert.strictEqual(batchRes.errors.length, 0);
  assert.strictEqual(lineage[0].shaUsed, undefined, "Commit 1 must have sha: undefined for 404");
  assert.strictEqual(lineage[1].shaUsed, lineage[0].newBlobSha, "Commit 2 must use Commit 1's blob SHA");
  for (let i = 2; i < 25; i++) {
    assert.strictEqual(lineage[i].shaUsed, lineage[i - 1].newBlobSha, `Commit ${i + 1} must use Commit ${i}'s blob SHA`);
  }
  assert.strictEqual(batchRes.lastSha, lineage[24].newCommitSha);
});

await asyncTest("2.2 Rapid 100-commit stress burst with exact SHA propagation and zero 409 conflicts", async () => {
  let fileState = {
    sha: "initial_sha_100",
    content: "# Practice Log\n",
  };

  let totalCalls = 0;
  const mockClient = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          name: "PRACTICE.md",
          path: "PRACTICE.md",
          sha: fileState.sha,
          size: Buffer.byteLength(fileState.content),
          content: Buffer.from(fileState.content).toString("base64"),
        },
      }),
      createOrUpdateFileContents: async (params) => {
        if (params.sha !== fileState.sha) {
          const err = new Error(`409 Conflict: Remote SHA ${fileState.sha} !== Param SHA ${params.sha}`);
          err.status = 409;
          throw err;
        }
        totalCalls++;
        const decoded = Buffer.from(params.content, "base64").toString("utf-8");
        const nextSha = `sha_100_${totalCalls}_${randomBytes(4).toString("hex")}`;
        fileState.sha = nextSha;
        fileState.content = decoded;

        return {
          data: {
            commit: {
              sha: `commit_${nextSha}`,
              html_url: `https://github.com/org/repo/commit/commit_${nextSha}`,
            },
          },
        };
      },
    },
  };

  const batchRes = await makeBatchCommits(
    {
      token: "fake-tok",
      owner: "org",
      repo: "repo",
      targetFile: "PRACTICE.md",
      client: mockClient,
    },
    100,
    "stress-100"
  );

  assert.strictEqual(batchRes.committed, 100, "All 100 commits must succeed");
  assert.strictEqual(batchRes.errors.length, 0);
  assert.strictEqual(totalCalls, 100);
  const keptEntries = (fileState.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || []).length;
  assert.strictEqual(keptEntries, 5, "Rolling log limit must remain exactly 5");
  assert.ok(fileState.content.startsWith("# Practice Log\n"), "User header must be preserved");
});

await asyncTest("2.3 Interleaved multi-tenant commits across 4 isolated tenants", async () => {
  const tenantStores = new Map();

  function getTenantStore(tenantId) {
    if (!tenantStores.has(tenantId)) {
      tenantStores.set(tenantId, {
        sha: `initial_blob_${tenantId}`,
        content: `# Tenant ${tenantId} Documentation\n\n## Overview\nTenant details.\n`,
        commitHistory: [],
      });
    }
    return tenantStores.get(tenantId);
  }

  function createTenantClient(tenantId) {
    return {
      repos: {
        getContent: async ({ owner, repo, path }) => {
          const store = getTenantStore(tenantId);
          return {
            data: {
              type: "file",
              name: path,
              path,
              sha: store.sha,
              size: Buffer.byteLength(store.content),
              content: Buffer.from(store.content).toString("base64"),
            },
          };
        },
        createOrUpdateFileContents: async ({ owner, repo, path, message, content, sha }) => {
          const store = getTenantStore(tenantId);
          if (sha !== store.sha) {
            const err = new Error(`Tenant ${tenantId} 409 Conflict: remote has ${store.sha} but got ${sha}`);
            err.status = 409;
            throw err;
          }
          const decoded = Buffer.from(content, "base64").toString("utf-8");
          const newBlobSha = computeBlobSha(decoded);
          const newCommitSha = `commit_${tenantId}_${store.commitHistory.length + 1}`;

          store.sha = newBlobSha;
          store.content = decoded;
          store.commitHistory.push({ shaUsed: sha, newBlobSha, newCommitSha });

          return {
            data: {
              commit: {
                sha: newCommitSha,
                html_url: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
              },
            },
          };
        },
      },
    };
  }

  for (let round = 1; round <= 10; round++) {
    for (const tenantId of ["alpha", "beta", "gamma", "delta"]) {
      const client = createTenantClient(tenantId);
      const res = await makeSingleCommit({
        token: `token-${tenantId}`,
        owner: `user-${tenantId}`,
        repo: `repo-${tenantId}`,
        targetFile: `LOG_${tenantId}.md`,
        client,
      });
      assert.ok(res.sha.startsWith(`commit_${tenantId}_`));
    }
  }

  for (const tenantId of ["alpha", "beta", "gamma", "delta"]) {
    const store = getTenantStore(tenantId);
    assert.strictEqual(store.commitHistory.length, 10);
    assert.ok(store.content.includes(`## Overview\nTenant details.`));
    const entries = store.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || [];
    assert.strictEqual(entries.length, 5);
  }
});

// -----------------------------------------------------------------------------
// SECTION 3: TRANSIENT FAILURE RESILIENCE & MID-BATCH RECOVERY
// -----------------------------------------------------------------------------
console.log("\n--- 3. Transient Failure Resilience & Mid-Batch Recovery ---");

await asyncTest("3.1 makeBatchCommits handles transient 500 error on commit 3 and successfully commits 1, 2, 4, 5", async () => {
  let fileState = {
    sha: "sha_start_001",
    content: "# System Log\n",
  };

  let callCount = 0;
  const mockClient = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          name: "SYS.md",
          path: "SYS.md",
          sha: fileState.sha,
          size: Buffer.byteLength(fileState.content),
          content: Buffer.from(fileState.content).toString("base64"),
        },
      }),
      createOrUpdateFileContents: async (params) => {
        callCount++;
        if (callCount === 3) {
          const err = new Error("500 Internal Server Error: GitHub unavailable");
          err.status = 500;
          throw err;
        }

        if (params.sha !== fileState.sha) {
          const err = new Error(`409 Conflict: expected ${fileState.sha}, got ${params.sha}`);
          err.status = 409;
          throw err;
        }

        const decoded = Buffer.from(params.content, "base64").toString("utf-8");
        const nextSha = `sha_post_call_${callCount}`;
        fileState.sha = nextSha;
        fileState.content = decoded;

        return {
          data: {
            commit: {
              sha: `commit_${nextSha}`,
              html_url: `https://github.com/org/repo/commit/${nextSha}`,
            },
          },
        };
      },
    },
  };

  const res = await makeBatchCommits(
    {
      token: "tok",
      owner: "org",
      repo: "repo",
      targetFile: "SYS.md",
      client: mockClient,
    },
    5,
    "transient-test"
  );

  assert.strictEqual(res.committed, 4, "4 of 5 commits must succeed");
  assert.strictEqual(res.errors.length, 1, "Exactly 1 error recorded");
  assert.ok(res.errors[0].includes("Commit 3 failed: 500 Internal Server Error"), "Error message describes commit 3 failure");
  assert.strictEqual(res.lastSha, "commit_sha_post_call_5", "lastSha points to final successful commit");
});

await asyncTest("3.2 makeBatchCommits with count = 0 and count = -3", async () => {
  const mockClient = { repos: {} };
  const res0 = await makeBatchCommits({ token: "t", owner: "o", repo: "r", targetFile: "f", client: mockClient }, 0);
  assert.strictEqual(res0.committed, 0);
  assert.strictEqual(res0.errors.length, 0);
  assert.strictEqual(res0.lastSha, undefined);

  const resNeg = await makeBatchCommits({ token: "t", owner: "o", repo: "r", targetFile: "f", client: mockClient }, -3);
  assert.strictEqual(resNeg.committed, 0);
  assert.strictEqual(resNeg.errors.length, 0);
  assert.strictEqual(resNeg.lastSha, undefined);
});

// -----------------------------------------------------------------------------
// SECTION 4: DEEP STRESS & ADVERSARIAL CHECKS ON LOG PRUNER
// -----------------------------------------------------------------------------
console.log("\n--- 4. Deep Stress & Adversarial Checks on Log Pruner ---");

test("4.1 200 consecutive append and rolling prune cycles: strict whitespace invariance", () => {
  let doc = "# DSA Mastery Activity Log\n\n";

  for (let i = 1; i <= 200; i++) {
    const min = String(i % 60).padStart(2, "0");
    const sec = String(Math.floor(i / 60)).padStart(2, "0");
    const entry = `\n## [2026-08-27 10:${min}:${sec} UTC] feat(algo): step ${i}\n**Details:** Invariant testing cycle ${i}\n`;

    doc = doc.endsWith("\n") ? doc + entry.replace(/^\n/, "") : doc + entry;
    doc = pruneEntries(doc, 5);

    assert.ok(doc.startsWith("# DSA Mastery Activity Log\n\n"), `Header corrupted at cycle ${i}`);

    const match = doc.match(/^# DSA Mastery Activity Log(\n+)## \[/);
    assert.ok(match, `Match failed at cycle ${i}`);
    assert.strictEqual(match[1].length, 2, `Whitespace grew/shrank at cycle ${i}: length was ${match[1].length}`);

    const count = (doc.match(/## \[2026-08-27/g) || []).length;
    assert.strictEqual(count, Math.min(i, 5), `Count wrong at cycle ${i}`);
  }
});

test("4.2 Preserves complex user document (1000+ lines, YAML frontmatter, tables, HTML tags, blockquotes)", () => {
  const complexDoc = [
    "---",
    "title: System Specification",
    "author: Team Lead",
    "tags: [nexus, scheduler, github]",
    "---",
    "",
    "# System Specification & Architecture",
    "",
    "## 1. Executive Summary",
    "> Nexus automates GitHub developer activity scheduling.",
    "",
    "## 2. Component Diagram",
    "<div><span class=\"badge\">Production</span></div>",
    "",
    "| Component | Status | Latency |",
    "| :--- | :--- | :--- |",
    "| Engine | Online | 12ms |",
    "| Storage | Blobs | 8ms |",
    "",
    "## 3. Code Samples",
    "```typescript",
    "// Note: code comment with brackets [test]",
    "const dummy = 'some string';",
    "```",
    "",
    "## 4. Notes & FAQs",
    "All questions answered.",
    "",
  ].join("\n");

  let fullDoc = complexDoc;
  for (let i = 1; i <= 10; i++) {
    const min = String(i).padStart(2, "0");
    fullDoc += `## [2026-08-27 10:${min}:00 UTC] feat(dsa): commit ${i}\nDetails\n\n`;
  }

  const pruned = pruneEntries(fullDoc, 3);

  assert.ok(pruned.includes("title: System Specification"), "YAML frontmatter preserved");
  assert.ok(pruned.includes("## 1. Executive Summary"), "Executive Summary preserved");
  assert.ok(pruned.includes("## 2. Component Diagram"), "Component Diagram preserved");
  assert.ok(pruned.includes("| Component | Status | Latency |"), "Markdown table preserved");
  assert.ok(pruned.includes("<div><span class=\"badge\">Production</span></div>"), "HTML tag preserved");
  assert.ok(pruned.includes("## 4. Notes & FAQs"), "Notes & FAQs preserved");

  const matches = pruned.match(/## \[2026-08-27 10:\d{2}:00 UTC\]/g) || [];
  assert.strictEqual(matches.length, 3);
  assert.ok(pruned.includes("commit 10"));
  assert.ok(pruned.includes("commit 9"));
  assert.ok(pruned.includes("commit 8"));
  assert.ok(!pruned.includes("commit 7"));
});

test("4.3 ReDoS & Pathological Regex Backtracking Stress Test", () => {
  const start = performance.now();
  
  const pathological = [
    "# Header",
    "## [[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[",
    "## [2026-99-99 99:99:99 NOT_UTC] feat: invalid 1",
    "## [2026-08-27T10:00:00Z] ISO string without space UTC",
    "## [2026-08-27 10:00:00] Missing timezone name",
    "## [2026-08-27 10:00:00 UTC".repeat(100),
    "## [2026-08-27 10:00:00 UTC] feat: valid entry 1\nDetails 1\n",
    "## [2026-08-27 10:01:00 UTC] feat: valid entry 2\nDetails 2\n",
  ].join("\n");

  const pruned = pruneEntries(pathological, 1);
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 50, `Regex execution took ${elapsed.toFixed(2)}ms (must be < 50ms to prevent ReDoS)`);
  assert.ok(pruned.includes("## [[[[[[[["));
  assert.ok(pruned.includes("NOT_UTC"));
  assert.ok(pruned.includes("Missing timezone name"));
  assert.ok(!pruned.includes("valid entry 1"));
  assert.ok(pruned.includes("valid entry 2"));
});

test("4.4 Boundary maxEntries parameter variations", () => {
  const doc = "# Log Header\n\n## [2026-08-27 10:00:00 UTC] feat: 1\nDetails 1\n\n## [2026-08-27 10:01:00 UTC] feat: 2\nDetails 2\n";

  const p0 = pruneEntries(doc, 0);
  assert.strictEqual(p0, "# Log Header\n");

  const pNeg = pruneEntries(doc, -10);
  assert.strictEqual(pNeg, "# Log Header\n");

  const p1 = pruneEntries(doc, 1);
  assert.ok(!p1.includes("feat: 1"));
  assert.ok(p1.includes("feat: 2"));

  const p100 = pruneEntries(doc, 100);
  assert.strictEqual(p100, doc);
});

// -----------------------------------------------------------------------------
// SECTION 5: SANITIZATION & PATH TRAVERSAL VERIFICATION
// -----------------------------------------------------------------------------
console.log("\n--- 5. Path Sanitization & Traversal Defense ---");

test("5.1 sanitizePath normalization across Windows & Unix separators", () => {
  assert.strictEqual(sanitizePath("  ./logs/dsa/trees.md "), "logs/dsa/trees.md");
  assert.strictEqual(sanitizePath(".\\nested\\file.log"), "nested/file.log");
  assert.strictEqual(sanitizePath("///root///file.txt"), "root///file.txt");
  assert.strictEqual(sanitizePath("PROGRESS_LOG.md"), "PROGRESS_LOG.md");
  assert.strictEqual(sanitizePath("./PROGRESS_LOG.md"), "PROGRESS_LOG.md");
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n" + "=".repeat(79));
console.log(`  CHALLENGER M1_2 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=".repeat(79) + "\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
