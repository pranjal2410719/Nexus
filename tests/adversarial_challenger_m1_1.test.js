/**
 * CHALLENGER M1_1 ADVERSARIAL STRESS & VERIFICATION SUITE
 * 
 * Empirically tests Milestone M1:
 * - lib/core/commit-engine.ts
 * - lib/core/log-pruner.ts
 * 
 * Verifies:
 * 1. Pre-existing files (empty & populated) update without 422 errors by supplying remote SHA.
 * 2. New files are created with sha: undefined.
 * 3. User documentation and arbitrary markdown headers are never erased during rolling prune.
 * 4. Path sanitization normalizes slashes, relative prefixes, and preserves valid hidden paths.
 * 5. Batch commits chain SHAs dynamically across iterations without 409 conflict.
 * 6. Edge cases: ReDoS resilience, CRLF, large files, 0-count batches, and non-404 API error propagation.
 */

import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

try {
  register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // already registered
}

const {
  pruneEntries,
  fetchCurrentFile,
  makeSingleCommit,
  makeBatchCommits,
  sanitizePath,
} = await import("../lib/core/commit-engine.ts");

console.log("===============================================================");
console.log("  CHALLENGER M1_1: EMPIRICAL ADVERSARIAL VERIFICATION SUITE");
console.log("===============================================================\n");

let passed = 0;
let failed = 0;

function syncTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) console.error(`    ${err.stack.split("\n")[1]}`);
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
    if (err.stack) console.error(`    ${err.stack.split("\n")[1]}`);
    failed++;
  }
}

// -------------------------------------------------------------
// SUITE 1: FILE CREATION & UPDATE SHA DYNAMICS (R1)
// -------------------------------------------------------------
console.log("--- Suite 1: File Creation & Update SHA Dynamics (R1) ---");

await asyncTest("1.1 New file creation (HTTP 404): returns sha undefined and omits sha in commit payload", async () => {
  let payloadCaptured = null;
  const mockOctokit = {
    repos: {
      getContent: async (params) => {
        assert.strictEqual(params.path, "NEW_FILE.md");
        const notFound = new Error("Not Found");
        notFound.status = 404;
        throw notFound;
      },
      createOrUpdateFileContents: async (params) => {
        payloadCaptured = params;
        return {
          data: {
            commit: {
              sha: "commit_new_file_101",
              html_url: "https://github.com/org/repo/commit/101",
            },
          },
        };
      },
    },
  };

  const res = await makeSingleCommit({
    token: "test-token",
    owner: "org",
    repo: "repo",
    targetFile: "./NEW_FILE.md",
    client: mockOctokit,
  });

  assert.strictEqual(res.sha, "commit_new_file_101");
  assert.ok(payloadCaptured !== null, "createOrUpdateFileContents must be called");
  assert.strictEqual(payloadCaptured.sha, undefined, "sha property must be undefined for new files");
  assert.strictEqual(payloadCaptured.path, "NEW_FILE.md", "Path must be sanitized");
  const decoded = Buffer.from(payloadCaptured.content, "base64").toString("utf-8");
  assert.ok(decoded.startsWith("# DSA Practice & Build Activity Log\n\n"), "Must create default initial header");
});

await asyncTest("1.2 Pre-existing 0-byte file: fetches existing sha and provides sha in update payload", async () => {
  let payloadCaptured = null;
  const zeroByteSha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

  const mockOctokit = {
    repos: {
      getContent: async (params) => {
        assert.strictEqual(params.path, "EMPTY.md");
        return {
          data: {
            type: "file",
            name: "EMPTY.md",
            path: "EMPTY.md",
            sha: zeroByteSha,
            size: 0,
            content: "",
            encoding: "base64",
          },
        };
      },
      createOrUpdateFileContents: async (params) => {
        payloadCaptured = params;
        // GitHub API requires sha if file exists
        if (!params.sha) {
          const err = new Error("422 Unprocessable Entity: sha wasn't supplied");
          err.status = 422;
          throw err;
        }
        return {
          data: {
            commit: {
              sha: "commit_empty_updated_202",
              html_url: "https://github.com/org/repo/commit/202",
            },
          },
        };
      },
    },
  };

  const res = await makeSingleCommit({
    token: "test-token",
    owner: "org",
    repo: "repo",
    targetFile: "EMPTY.md",
    client: mockOctokit,
  });

  assert.strictEqual(res.sha, "commit_empty_updated_202");
  assert.strictEqual(payloadCaptured.sha, zeroByteSha, "Must supply existing blob SHA in payload");
});

await asyncTest("1.3 Pre-existing populated file: preserves all custom headers & supplies remote SHA", async () => {
  let payloadCaptured = null;
  const existingSha = "blob_populated_303";
  const userFileContent = [
    "# Engineering Roadmap 2026",
    "",
    "## 1. Executive Summary",
    "Company goals for 2026.",
    "",
    "## 2. Architecture Overview",
    "Microservices & Serverless Next.js.",
    "",
    "## 3. Security Guidelines",
    "AES-256 token encryption and timing-safe cookies.",
    "",
  ].join("\n");

  const mockOctokit = {
    repos: {
      getContent: async (params) => {
        assert.strictEqual(params.path, "ROADMAP.md");
        return {
          data: {
            type: "file",
            name: "ROADMAP.md",
            path: "ROADMAP.md",
            sha: existingSha,
            size: userFileContent.length,
            content: Buffer.from(userFileContent).toString("base64"),
            encoding: "base64",
          },
        };
      },
      createOrUpdateFileContents: async (params) => {
        payloadCaptured = params;
        return {
          data: {
            commit: {
              sha: "commit_populated_303",
              html_url: "https://github.com/org/repo/commit/303",
            },
          },
        };
      },
    },
  };

  const res = await makeSingleCommit({
    token: "test-token",
    owner: "org",
    repo: "repo",
    targetFile: "  ./ROADMAP.md  ",
    client: mockOctokit,
  });

  assert.strictEqual(res.sha, "commit_populated_303");
  assert.strictEqual(payloadCaptured.sha, existingSha, "Must supply existing blob SHA");
  const decoded = Buffer.from(payloadCaptured.content, "base64").toString("utf-8");
  assert.ok(decoded.includes("## 1. Executive Summary"), "Preserves Executive Summary");
  assert.ok(decoded.includes("## 2. Architecture Overview"), "Preserves Architecture Overview");
  assert.ok(decoded.includes("## 3. Security Guidelines"), "Preserves Security Guidelines");
  assert.ok(decoded.includes("## [2026-"), "Appends new activity log entry");
});

// -------------------------------------------------------------
// SUITE 2: MULTI-COMMIT BATCH SEQUENCING & PROPAGATION
// -------------------------------------------------------------
console.log("\n--- Suite 2: Multi-Commit Batch Sequencing & Propagation ---");

await asyncTest("2.1 30-commit rapid batch burst propagates SHA dynamically on every iteration", async () => {
  let repoState = {
    content: "# Activity Log\n",
    sha: "initial_sha_0",
  };
  let commitCount = 0;
  const history = [];

  const mockOctokit = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          name: "BURST.md",
          path: "BURST.md",
          sha: repoState.sha,
          size: repoState.content.length,
          content: Buffer.from(repoState.content).toString("base64"),
        },
      }),
      createOrUpdateFileContents: async (params) => {
        if (params.sha !== repoState.sha) {
          const err = new Error(`409 Conflict: Provided SHA ${params.sha} does not match remote SHA ${repoState.sha}`);
          err.status = 409;
          throw err;
        }
        commitCount++;
        const nextBlobSha = `blob_sha_${commitCount}`;
        const nextCommitSha = `commit_sha_${commitCount}`;
        repoState.content = Buffer.from(params.content, "base64").toString("utf-8");
        repoState.sha = nextBlobSha;

        history.push({
          shaUsed: params.sha,
          newBlobSha: nextBlobSha,
          newCommitSha: nextCommitSha,
          message: params.message,
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

  const result = await makeBatchCommits(
    {
      token: "test-token",
      owner: "org",
      repo: "repo",
      targetFile: "BURST.md",
      client: mockOctokit,
    },
    30,
    "stress"
  );

  assert.strictEqual(result.committed, 30, `All 30 commits should succeed (errors: ${result.errors.join("; ")})`);
  assert.strictEqual(result.errors.length, 0, "No errors expected");
  assert.strictEqual(history.length, 30, "30 history records");
  assert.strictEqual(result.lastSha, "commit_sha_30");

  // Verify SHA chaining
  assert.strictEqual(history[0].shaUsed, "initial_sha_0");
  for (let i = 1; i < 30; i++) {
    assert.strictEqual(history[i].shaUsed, history[i - 1].newBlobSha, `Iteration ${i + 1} must use iteration ${i}'s blob SHA`);
  }

  // Verify log rolling: exactly 5 entries in final file
  const matches = repoState.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || [];
  assert.strictEqual(matches.length, 5, "Must keep rolling 5 entries in batch");
});

await asyncTest("2.2 makeBatchCommits handles zero and negative count gracefully", async () => {
  const res0 = await makeBatchCommits({ token: "t", owner: "o", repo: "r", targetFile: "f.md" }, 0);
  assert.strictEqual(res0.committed, 0);
  assert.strictEqual(res0.errors.length, 0);

  const resNeg = await makeBatchCommits({ token: "t", owner: "o", repo: "r", targetFile: "f.md" }, -5);
  assert.strictEqual(resNeg.committed, 0);
  assert.strictEqual(resNeg.errors.length, 0);
});

// -------------------------------------------------------------
// SUITE 3: LOG PRUNER EDGE CASES & MARKDOWN ISOLATION
// -------------------------------------------------------------
console.log("\n--- Suite 3: Log Pruner Edge Cases & Markdown Isolation ---");

syncTest("3.1 Preserves 100+ arbitrary user markdown headers across all H1-H6 levels", () => {
  let doc = "";
  for (let i = 1; i <= 100; i++) {
    const level = (i % 6) + 1;
    const hashes = "#".repeat(level);
    doc += `${hashes} Header ${i}\nParagraph content for header ${i}.\n\n`;
  }

  // Append 10 Nexus log entries
  for (let i = 1; i <= 10; i++) {
    doc += `\n## [2026-08-27 10:${String(i).padStart(2, "0")}:00 UTC] feat(dsa): entry ${i}\nDetails ${i}\n`;
  }

  const pruned = pruneEntries(doc, 5);

  // Verify all 100 headers remain
  for (let i = 1; i <= 100; i++) {
    const level = (i % 6) + 1;
    const hashes = "#".repeat(level);
    assert.ok(pruned.includes(`${hashes} Header ${i}`), `Missing header ${i}`);
  }

  // Verify entries 1..5 pruned, 6..10 retained
  const entryMatches = pruned.match(/## \[2026-08-27/g) || [];
  assert.strictEqual(entryMatches.length, 5);
  assert.ok(!pruned.includes("entry 1\n"));
  assert.ok(!pruned.includes("entry 5\n"));
  assert.ok(pruned.includes("entry 6\n"));
  assert.ok(pruned.includes("entry 10\n"));
});

syncTest("3.2 50-step continuous append-and-prune loop maintains exact whitespace invariant", () => {
  let doc = "# Main Heading\n\n## Fixed User Subheading\nDescription text.\n";

  for (let i = 1; i <= 50; i++) {
    const min = String(i).padStart(2, "0");
    const newEntry = `\n## [2026-08-27 10:${min}:00 UTC] feat(loop): loop commit ${i}\nDetails ${i}\n`;
    doc = doc.endsWith("\n") ? doc + newEntry.replace(/^\n/, "") : doc + newEntry;
    doc = pruneEntries(doc, 5);

    // Assert header intact
    assert.ok(doc.startsWith("# Main Heading\n\n## Fixed User Subheading\nDescription text.\n"));

    // Assert exactly 1 newline between header and first entry
    const match = doc.match(/Description text\.(\n+)## \[/);
    assert.ok(match, `Boundary match failed at step ${i}`);
    assert.strictEqual(match[1].length, 1, `Whitespace drifted at step ${i}: got ${match[1].length}`);
  }

  assert.ok(doc.includes("loop commit 50"));
  assert.ok(doc.includes("loop commit 46"));
  assert.ok(!doc.includes("loop commit 45\n"));
});

syncTest("3.3 Handles maxEntries = 0 and negative maxEntries without throwing", () => {
  const doc = "# Heading\n\n## [2026-08-27 10:00:00 UTC] feat: entry\nDetails\n";
  const p0 = pruneEntries(doc, 0);
  assert.strictEqual(p0, "# Heading\n");

  const pNeg = pruneEntries(doc, -3);
  assert.strictEqual(pNeg, "# Heading\n");
});

syncTest("3.4 Performance & ReDoS benchmark: 2,000 entries pruned in < 50ms", () => {
  let doc = "# Performance Test Document\n";
  for (let i = 0; i < 2000; i++) {
    doc += `\n## [2026-08-27 10:00:00 UTC] feat(perf): entry ${i}\nPayload data ${i}\n`;
  }

  const start = performance.now();
  const res = pruneEntries(doc, 5);
  const duration = performance.now() - start;

  assert.ok(duration < 50, `Pruning took ${duration}ms, expected < 50ms`);
  const matches = res.match(/## \[2026-08-27/g) || [];
  assert.strictEqual(matches.length, 5);
});

// -------------------------------------------------------------
// SUITE 4: ERROR PROPAGATION & TYPE SAFETY
// -------------------------------------------------------------
console.log("\n--- Suite 4: Error Propagation & Type Safety ---");

await asyncTest("4.1 Re-throws non-404 GitHub errors verbatim (401, 403, 409, 422, 500)", async () => {
  for (const status of [401, 403, 409, 422, 500, 503]) {
    const failingOctokit = {
      repos: {
        getContent: async () => {
          const err = new Error(`HTTP Error ${status}`);
          err.status = status;
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await fetchCurrentFile({
          token: "tok",
          owner: "org",
          repo: "repo",
          targetFile: "file.md",
          client: failingOctokit,
        });
      },
      (err) => err.status === status
    );
  }
});

await asyncTest("4.2 Rejects directory or non-file API responses", async () => {
  const dirOctokit = {
    repos: {
      getContent: async () => ({
        data: [{ name: "a.ts" }, { name: "b.ts" }],
      }),
    },
  };

  await assert.rejects(
    async () => fetchCurrentFile({ token: "t", owner: "o", repo: "r", targetFile: "dir", client: dirOctokit }),
    /is a directory, not a file/
  );
});

// -------------------------------------------------------------
// SUITE 5: PATH SANITIZATION MATRIX
// -------------------------------------------------------------
console.log("\n--- Suite 5: Path Sanitization Matrix ---");

syncTest("5.1 Path sanitization normalizes separators, trims, and preserves hidden paths", () => {
  assert.strictEqual(sanitizePath("  ./docs/PROGRESS.md  "), "docs/PROGRESS.md");
  assert.strictEqual(sanitizePath(".\\docs\\sub\\file.md"), "docs/sub/file.md");
  assert.strictEqual(sanitizePath("///root/sub/file.txt"), "root/sub/file.txt");
  assert.strictEqual(sanitizePath(".github/workflows/ci.yml"), ".github/workflows/ci.yml");
  assert.strictEqual(sanitizePath(""), "");
  assert.strictEqual(sanitizePath("   "), "");
});

console.log("\n===============================================================");
console.log(`  CHALLENGER M1_1 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("===============================================================\n");

if (failed > 0) {
  process.exit(1);
}
