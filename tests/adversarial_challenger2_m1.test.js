/**
 * Adversarial Empirical Verification Suite for Milestone M1 (File Update & Sanitization)
 * Author: Challenger 2 (Empirical Challenger)
 */
import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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

console.log("===============================================================");
console.log("  CHALLENGER 2: ADVERSARIAL STRESS HARNESS FOR MILESTONE M1");
console.log("===============================================================\n");

let passed = 0;
let failed = 0;

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

console.log("--- 1. Path Sanitization & Security Edge Cases ---");

test("sanitizePath handles multiple leading slashes and backslashes", () => {
  assert.strictEqual(sanitizePath("///root/file.md"), "root/file.md");
  assert.strictEqual(sanitizePath(".///./file.md"), "./file.md");
  assert.strictEqual(sanitizePath(".\\\\file.md"), "file.md");
  assert.strictEqual(sanitizePath("C:\\Windows\\System32\\test.log"), "C:/Windows/System32/test.log");
  assert.strictEqual(sanitizePath("nested/dir/file.txt"), "nested/dir/file.txt");
});

test("Route targetFile validation blocks traversal attacks and abnormal strings", () => {
  function validatePath(raw) {
    const targetFile = String(raw ?? "PROGRESS_LOG.md")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.?\/+/, "");
    if (!targetFile || targetFile.length > 200 || targetFile.includes("..")) {
      return { valid: false, targetFile };
    }
    return { valid: true, targetFile };
  }

  // Traversal vectors
  assert.strictEqual(validatePath("../etc/passwd").valid, false);
  assert.strictEqual(validatePath("..\\..\\windows\\system32").valid, false);
  assert.strictEqual(validatePath("nested/../../secret").valid, false);
  assert.strictEqual(validatePath("....//file.md").valid, false);
  assert.strictEqual(validatePath("dir/..").valid, false);
  assert.strictEqual(validatePath("../").valid, false);

  // Empty & whitespace
  assert.strictEqual(validatePath("").valid, false);
  assert.strictEqual(validatePath("   ").valid, false);
  assert.strictEqual(validatePath("/").valid, false);
  assert.strictEqual(validatePath("./").valid, false);
  assert.strictEqual(validatePath(".///").valid, false);

  // Length boundaries
  assert.strictEqual(validatePath("a".repeat(200)).valid, true);
  assert.strictEqual(validatePath("a".repeat(201)).valid, false);

  // Null/undefined fallback
  assert.strictEqual(validatePath(null).valid, true);
  assert.strictEqual(validatePath(null).targetFile, "PROGRESS_LOG.md");
  assert.strictEqual(validatePath(undefined).valid, true);
  assert.strictEqual(validatePath(undefined).targetFile, "PROGRESS_LOG.md");
});

console.log("\n--- 2. GitHub Error Handling & Payload Robustness ---");

await asyncTest("fetchCurrentFile strictly propagates non-404 GitHub errors", async () => {
  const statusCodes = [400, 401, 403, 409, 422, 500, 502, 503];

  for (const status of statusCodes) {
    const mockClient = {
      repos: {
        getContent: async () => {
          const err = new Error(`GitHub API Error: ${status}`);
          err.status = status;
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await fetchCurrentFile({
          token: "tok",
          owner: "test",
          repo: "repo",
          targetFile: "file.md",
          client: mockClient,
        });
      },
      (err) => err.status === status,
      `Should have thrown status ${status} without swallowing`
    );
  }
});

await asyncTest("fetchCurrentFile rejects null data, directories, and non-file objects", async () => {
  const invalidResponses = [
    { data: null },
    { data: undefined },
    { data: "string-response" },
    { data: [] },
    { data: [{ name: "subfile.txt" }] },
    { data: { type: "dir", name: "folder" } },
    { data: { type: "submodule", sha: "123" } },
    { data: { type: "symlink", target: "/etc/passwd" } },
  ];

  for (const resp of invalidResponses) {
    const mockClient = {
      repos: {
        getContent: async () => resp,
      },
    };

    await assert.rejects(
      async () => {
        await fetchCurrentFile({
          token: "tok",
          owner: "test",
          repo: "repo",
          targetFile: "file.md",
          client: mockClient,
        });
      },
      /is a directory, not a file|is not a regular file/,
      `Should reject response: ${JSON.stringify(resp)}`
    );
  }
});

await asyncTest("makeSingleCommit correctly omits sha on 404 (new file) and includes sha on existing file", async () => {
  let calls = [];

  const mockClientNew = {
    repos: {
      getContent: async () => {
        const err = new Error("Not Found");
        err.status = 404;
        throw err;
      },
      createOrUpdateFileContents: async (params) => {
        calls.push(params);
        return { data: { commit: { sha: "sha_new_123", html_url: "url_new" } } };
      },
    },
  };

  const resNew = await makeSingleCommit({
    token: "tok",
    owner: "alice",
    repo: "repo",
    targetFile: "LOG.md",
    client: mockClientNew,
  });

  assert.strictEqual(resNew.sha, "sha_new_123");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].sha, undefined, "New file MUST NOT have sha in createOrUpdateFileContents payload");
  assert.strictEqual(calls[0].path, "LOG.md");

  // Existing file
  calls = [];
  const mockClientExisting = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          sha: "blob_sha_existing_999",
          content: Buffer.from("existing content\n").toString("base64"),
          size: 17,
        },
      }),
      createOrUpdateFileContents: async (params) => {
        calls.push(params);
        return { data: { commit: { sha: "sha_updated_456", html_url: "url_updated" } } };
      },
    },
  };

  const resExisting = await makeSingleCommit({
    token: "tok",
    owner: "alice",
    repo: "repo",
    targetFile: "./LOG.md",
    client: mockClientExisting,
  });

  assert.strictEqual(resExisting.sha, "sha_updated_456");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].sha, "blob_sha_existing_999", "Existing file MUST supply sha");
  assert.strictEqual(calls[0].path, "LOG.md", "Target path must be sanitized in payload");
});

console.log("\n--- 3. Sequential 10-Commit Chaining & Concurrency ---");

await asyncTest("makeBatchCommits completes 10 sequential commits chaining SHAs without 409 conflict", async () => {
  let currentFileState = {
    sha: "initial_base_blob_sha",
    content: "# Activity Log\n",
  };
  const history = [];

  const mockClient = {
    repos: {
      getContent: async () => ({
        data: {
          type: "file",
          sha: currentFileState.sha,
          content: Buffer.from(currentFileState.content).toString("base64"),
          size: currentFileState.content.length,
        },
      }),
      createOrUpdateFileContents: async (params) => {
        if (params.sha !== currentFileState.sha) {
          const err = new Error(`409 Conflict: Remote has ${currentFileState.sha} but received ${params.sha}`);
          err.status = 409;
          throw err;
        }
        const newBlobSha = `blob_sha_${history.length + 1}`;
        const newCommitSha = `commit_sha_${history.length + 1}`;
        currentFileState.sha = newBlobSha;
        currentFileState.content = Buffer.from(params.content, "base64").toString("utf-8");

        history.push({
          shaUsed: params.sha,
          newBlobSha,
          newCommitSha,
          message: params.message,
        });

        return {
          data: {
            commit: {
              sha: newCommitSha,
              html_url: `https://github.com/alice/repo/commit/${newCommitSha}`,
            },
          },
        };
      },
    },
  };

  const batchRes = await makeBatchCommits(
    {
      token: "tok",
      owner: "alice",
      repo: "repo",
      targetFile: "BURST_TEST.md",
      client: mockClient,
    },
    10,
    "burst"
  );

  assert.strictEqual(batchRes.committed, 10);
  assert.strictEqual(batchRes.errors.length, 0);
  assert.strictEqual(history.length, 10);
  assert.strictEqual(batchRes.lastSha, "commit_sha_10");

  // Verify SHA lineage
  for (let i = 1; i < history.length; i++) {
    assert.strictEqual(
      history[i].shaUsed,
      history[i - 1].newBlobSha,
      `Step ${i + 1} must use Step ${i}'s blob SHA`
    );
  }
});

console.log("\n--- 4. Log Pruner Stress & Non-Standard Markdown Formats ---");

test("pruneEntries preserves 50+ custom markdown sections while keeping only last 5 Nexus entries", () => {
  let doc = "# Huge Knowledge Base\n\n";
  for (let i = 1; i <= 50; i++) {
    doc += `## Section ${i}: Custom Topic\nContent for topic ${i} with details...\n\n`;
  }

  // Add 25 timestamped Nexus entries
  for (let i = 1; i <= 25; i++) {
    const min = String(i).padStart(2, "0");
    doc += `\n## [2026-08-27 10:${min}:00 UTC] feat(dsa/heap): task ${i}\nDetails ${i}\n`;
  }

  const pruned = pruneEntries(doc, 5);

  // Check all 50 user sections are present
  for (let i = 1; i <= 50; i++) {
    assert.ok(pruned.includes(`## Section ${i}: Custom Topic`), `Section ${i} must not be deleted!`);
  }

  // Check only the last 5 Nexus entries (21..25) exist
  for (let i = 1; i <= 20; i++) {
    const min = String(i).padStart(2, "0");
    assert.ok(!pruned.includes(`10:${min}:00 UTC`), `Nexus entry ${i} must have been pruned`);
  }
  for (let i = 21; i <= 25; i++) {
    const min = String(i).padStart(2, "0");
    assert.ok(pruned.includes(`10:${min}:00 UTC`), `Nexus entry ${i} must be retained`);
  }
});

test("pruneEntries handles complex markdown containing code blocks with internal hashes", () => {
  const doc = [
    "# Project Log",
    "## Code Reference",
    "```python",
    "## This is a comment inside code block",
    "# Another comment",
    "def hello():",
    "    return 'world'",
    "```",
    "",
    "## [2026-08-27 01:00:00 UTC] feat: entry 1",
    "Code sample 1",
    "",
    "## [2026-08-27 02:00:00 UTC] feat: entry 2",
    "Code sample 2",
  ].join("\n");

  const pruned = pruneEntries(doc, 1);
  assert.ok(pruned.includes("## Code Reference"));
  assert.ok(pruned.includes("## This is a comment inside code block"));
  assert.ok(!pruned.includes("entry 1"));
  assert.ok(pruned.includes("entry 2"));
});

test("pruneEntries handles custom headings containing brackets or timestamps without matching pattern", () => {
  const doc = [
    "# Header",
    "## [v1.0.0 Release Notes] 2026",
    "Some notes here",
    "## [Unreleased Changes]",
    "More notes",
    "## [2026-08-27] Changelog without UTC or time",
    "Changelog notes",
    "## [2026-08-27 10:00:00 UTC] feat(core): valid entry 1",
    "Entry 1",
    "## [2026-08-27 11:00:00 UTC] feat(core): valid entry 2",
    "Entry 2",
  ].join("\n");

  const pruned = pruneEntries(doc, 1);
  assert.ok(pruned.includes("## [v1.0.0 Release Notes] 2026"));
  assert.ok(pruned.includes("## [Unreleased Changes]"));
  assert.ok(pruned.includes("## [2026-08-27] Changelog without UTC or time"));
  assert.ok(!pruned.includes("valid entry 1"));
  assert.ok(pruned.includes("valid entry 2"));
});

console.log("\n===============================================================");
console.log(`  CHALLENGER 2 RESULTS: ${passed} passed, ${failed} failed`);
console.log("===============================================================\n");

if (failed > 0) {
  process.exit(1);
}
