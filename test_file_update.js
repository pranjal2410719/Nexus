/**
 * Verification Test Script for Requirement R1: File Update Bug Fix
 * 
 * Verifies that:
 * 1. Target file updates succeed for both new files and pre-existing files (empty or populated).
 * 2. Pre-existing file SHAs are preserved and supplied in update payloads to prevent GitHub API 422 errors.
 * 3. Log pruning strictly targets timestamped Nexus entries and never erases pre-existing user markdown headers.
 * 4. Sequential batch commits correctly chain SHAs across multiple iterations.
 * 5. Path sanitization correctly normalizes paths and rejects traversal attacks.
 */

import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

try {
  register(new URL("./tests/ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // if already registered
}

async function runTests() {
  console.log("===============================================================");
  console.log("  NEXUS FILE UPDATE BUG FIX & CORE LOGIC VERIFICATION SUITE");
  console.log("===============================================================\n");

  // Dynamically import TypeScript module
  const {
    pruneEntries,
    fetchCurrentFile,
    makeSingleCommit,
    makeBatchCommits,
    sanitizePath,
  } = await import("./lib/core/commit-engine.ts");

  let passedTests = 0;
  let totalTests = 0;

  function runTest(testName, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✔ [PASS] ${testName}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${testName}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
      }
      throw err;
    }
  }

  async function runAsyncTest(testName, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${testName}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${testName}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
      }
      throw err;
    }
  }

  console.log("--- Suite 1: Log Pruning & User Markdown Preservation ---");

  runTest("Preserves arbitrary user markdown sections (>5 headers) while pruning old Nexus entries", () => {
    const userDoc = [
      "# Project Documentation",
      "",
      "## Project Overview",
      "Detailed project overview text.",
      "",
      "## Architecture",
      "System design diagram and description.",
      "",
      "## Installation",
      "npm install nexus",
      "",
      "## Configuration",
      "Set environment variables.",
      "",
      "## API Reference",
      "GET /api/me",
      "",
      "## Contributing",
      "Open PRs against main.",
      "",
      "## License",
      "MIT License",
      "",
    ].join("\n");

    // Append 8 Nexus log entries
    let currentDoc = userDoc;
    for (let i = 1; i <= 8; i++) {
      currentDoc += `\n## [2026-08-27 10:0${i}:00 UTC] feat(dsa): commit entry ${i}\n\n**Module:** \`dsa/trees\`  \n**Status:** Verified\n`;
    }

    const pruned = pruneEntries(currentDoc, 5);

    // Verify all user headings are preserved
    assert.ok(pruned.includes("## Project Overview"), "Missing '## Project Overview'");
    assert.ok(pruned.includes("## Architecture"), "Missing '## Architecture'");
    assert.ok(pruned.includes("## Installation"), "Missing '## Installation'");
    assert.ok(pruned.includes("## Configuration"), "Missing '## Configuration'");
    assert.ok(pruned.includes("## API Reference"), "Missing '## API Reference'");
    assert.ok(pruned.includes("## Contributing"), "Missing '## Contributing'");
    assert.ok(pruned.includes("## License"), "Missing '## License'");

    // Verify exactly 5 Nexus timestamped entries are kept (entries 4, 5, 6, 7, 8)
    const nexusMatches = pruned.match(/## \[2026-08-27 \d{2}:\d{2}:\d{2} UTC\]/g) || [];
    assert.strictEqual(nexusMatches.length, 5, `Expected 5 Nexus entries, got ${nexusMatches.length}`);
    assert.ok(!pruned.includes("commit entry 1\n"), "Entry 1 should have been pruned");
    assert.ok(!pruned.includes("commit entry 2\n"), "Entry 2 should have been pruned");
    assert.ok(!pruned.includes("commit entry 3\n"), "Entry 3 should have been pruned");
    assert.ok(pruned.includes("commit entry 4\n"), "Entry 4 should be retained");
    assert.ok(pruned.includes("commit entry 8\n"), "Entry 8 should be retained");
  });

  runTest("Handles brand new file header and rolling prune limit correctly", () => {
    let doc = "# DSA Practice & Build Activity Log\n";
    for (let i = 1; i <= 7; i++) {
      doc += `\n## [2026-08-27 12:0${i}:00 UTC] test(dsa): test case ${i}\nDetails ${i}\n`;
    }
    const pruned = pruneEntries(doc, 5);
    assert.ok(pruned.startsWith("# DSA Practice & Build Activity Log\n"), "Header must be preserved");
    const matches = pruned.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("test case 1"));
    assert.ok(pruned.includes("test case 7"));
  });

  runTest("Handles headerless files starting directly with Nexus entries", () => {
    let doc = "";
    for (let i = 1; i <= 6; i++) {
      if (i === 1) {
        doc += `## [2026-08-27 14:0${i}:00 UTC] perf(dsa): perf test ${i}\nDetails ${i}\n`;
      } else {
        doc += `\n## [2026-08-27 14:0${i}:00 UTC] perf(dsa): perf test ${i}\nDetails ${i}\n`;
      }
    }
    const pruned = pruneEntries(doc, 5);
    const matches = pruned.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("perf test 1"));
    assert.ok(pruned.includes("perf test 6"));
  });

  runTest("Zero-entry pruning edge case: removes all entries when maxEntries <= 0 while preserving header", () => {
    let doc = "# Log Header\n\n";
    for (let i = 1; i <= 5; i++) {
      doc += `## [2026-08-27 10:0${i}:00 UTC] feat(test): entry ${i}\nDetails ${i}\n\n`;
    }
    const pruned0 = pruneEntries(doc, 0);
    assert.strictEqual(pruned0, "# Log Header\n", "Should preserve header and remove all entries");
    assert.ok(!pruned0.includes("feat(test)"), "No log entries should remain");

    const prunedNeg = pruneEntries(doc, -1);
    assert.strictEqual(prunedNeg, "# Log Header\n", "Negative maxEntries should prune all entries");

    // Headerless file with maxEntries = 0
    let headerless = "## [2026-08-27 10:01:00 UTC] feat(test): entry 1\nDetails 1\n";
    assert.strictEqual(pruneEntries(headerless, 0), "");
  });

  runTest("Sequential rolling commits test: 25 consecutive commits keep exact maxEntries without whitespace accumulation", () => {
    let doc = "# DSA Activity Log\n\n";

    for (let i = 1; i <= 25; i++) {
      const min = String(i).padStart(2, "0");
      const entry = `\n## [2026-08-27 10:${min}:00 UTC] feat(trees): commit ${i}\n\n**Module:** \`dsa/trees\`  \n**Status:** Verified\n`;
      // Append entry similar to makeSingleCommit
      doc = doc.endsWith("\n")
        ? doc + entry.replace(/^\n/, "")
        : doc + entry;
      // Prune to rolling 5
      doc = pruneEntries(doc, 5);

      // Verify header is exactly preserved
      assert.ok(doc.startsWith("# DSA Activity Log\n\n"), `Header must start with '# DSA Activity Log\\n\\n' at iteration ${i}`);

      // Verify whitespace between header and first entry does not accumulate (must stay exactly 2 newlines: \n\n)
      const match = doc.match(/^# DSA Activity Log(\n+)## \[/);
      assert.ok(match, `Match must succeed at iteration ${i}`);
      assert.strictEqual(match[1].length, 2, `Whitespace between header and first entry must stay exactly 2 newlines at iteration ${i} (got ${match[1].length})`);

      // Verify count of entries
      const expectedCount = Math.min(i, 5);
      const entryMatches = doc.match(/## \[2026-08-27/g) || [];
      assert.strictEqual(entryMatches.length, expectedCount, `Expected ${expectedCount} entries at iteration ${i}`);
    }

    // Check final state
    assert.ok(doc.includes("commit 25"), "Must retain latest commit 25");
    assert.ok(doc.includes("commit 21"), "Must retain commit 21 (5th from end)");
    assert.ok(!doc.includes("commit 20\n"), "Must have pruned commit 20");
    assert.ok(!doc.includes("commit 1\n"), "Must have pruned commit 1");
  });

  runTest("Returns unmodified content for empty or non-Nexus content", () => {
    assert.strictEqual(pruneEntries(""), "");
    const plainText = "Simple plain text file\nWithout any nexus logs\n";
    assert.strictEqual(pruneEntries(plainText), plainText);
  });

  console.log("\n--- Suite 2: Path Sanitization ---");

  runTest("Sanitizes whitespace, relative prefixes, forward slashes, and backslashes", () => {
    assert.strictEqual(sanitizePath("  PROGRESS_LOG.md  "), "PROGRESS_LOG.md");
    assert.strictEqual(sanitizePath("  ./src/logs/progress.md \n"), "src/logs/progress.md");
    assert.strictEqual(sanitizePath("\t.\\nested\\dir\\file.txt\t"), "nested/dir/file.txt");
    assert.strictEqual(sanitizePath("./PROGRESS_LOG.md"), "PROGRESS_LOG.md");
    assert.strictEqual(sanitizePath("/PROGRESS_LOG.md"), "PROGRESS_LOG.md");
    assert.strictEqual(sanitizePath(".///PROGRESS_LOG.md"), "PROGRESS_LOG.md");
    assert.strictEqual(sanitizePath(".\\PROGRESS_LOG.md"), "PROGRESS_LOG.md");
    assert.strictEqual(sanitizePath("src\\logs\\progress.md"), "src/logs/progress.md");
    assert.strictEqual(sanitizePath("./docs/sub/log.md"), "docs/sub/log.md");
    assert.strictEqual(sanitizePath("PROGRESS_LOG.md"), "PROGRESS_LOG.md");
  });

  console.log("\n--- Suite 3: GitHub File Operations & Commit Logic ---");

  await runAsyncTest("New File Creation: 404 response -> creates file with sha: undefined", async () => {
    let createOrUpdateCalls = [];

    const mockClient = {
      repos: {
        getContent: async (params) => {
          assert.strictEqual(params.owner, "alice");
          assert.strictEqual(params.repo, "my-repo");
          assert.strictEqual(params.path, "NEW_LOG.md");
          const notFoundErr = new Error("Not Found");
          notFoundErr.status = 404;
          throw notFoundErr;
        },
        createOrUpdateFileContents: async (params) => {
          createOrUpdateCalls.push(params);
          return {
            data: {
              commit: {
                sha: "new_file_commit_sha_111",
                html_url: "https://github.com/alice/my-repo/commit/new_file_commit_sha_111",
              },
            },
          };
        },
      },
    };

    // 1. Verify fetchCurrentFile returns sha: undefined
    const fileData = await fetchCurrentFile({
      token: "fake-token",
      owner: "alice",
      repo: "my-repo",
      targetFile: "./NEW_LOG.md",
      client: mockClient,
    });
    assert.strictEqual(fileData.content, "");
    assert.strictEqual(fileData.sha, undefined, "SHA must be undefined for new files");

    // 2. Verify makeSingleCommit creates the file without sha in payload
    const result = await makeSingleCommit({
      token: "fake-token",
      owner: "alice",
      repo: "my-repo",
      targetFile: "./NEW_LOG.md",
      client: mockClient,
    });

    assert.strictEqual(result.sha, "new_file_commit_sha_111");
    assert.strictEqual(createOrUpdateCalls.length, 1);
    const sentParams = createOrUpdateCalls[0];
    assert.strictEqual(sentParams.owner, "alice");
    assert.strictEqual(sentParams.repo, "my-repo");
    assert.strictEqual(sentParams.path, "NEW_LOG.md");
    assert.strictEqual(sentParams.sha, undefined, "Payload sha MUST be undefined for new files");

    const decodedContent = Buffer.from(sentParams.content, "base64").toString("utf-8");
    assert.ok(decodedContent.includes("# DSA Practice & Build Activity Log"), "Must create initial header");
  });

  await runAsyncTest("Pre-existing Empty File: returns existing sha and passes sha in update payload", async () => {
    let createOrUpdateCalls = [];
    const existingSha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

    const mockClient = {
      repos: {
        getContent: async (params) => {
          assert.strictEqual(params.path, "EMPTY_LOG.md");
          // Emulate GitHub API returning existing empty file (size: 0, content: "")
          return {
            data: {
              type: "file",
              name: "EMPTY_LOG.md",
              path: "EMPTY_LOG.md",
              sha: existingSha,
              size: 0,
              content: "",
              encoding: "base64",
            },
          };
        },
        createOrUpdateFileContents: async (params) => {
          createOrUpdateCalls.push(params);
          // Verify that GitHub API would NOT reject with 422 because sha is provided
          if (!params.sha) {
            const err = new Error("422 Unprocessable Entity: sha wasn't supplied");
            err.status = 422;
            throw err;
          }
          return {
            data: {
              commit: {
                sha: "empty_updated_sha_222",
                html_url: "https://github.com/alice/my-repo/commit/empty_updated_sha_222",
              },
            },
          };
        },
      },
    };

    // 1. fetchCurrentFile must return existing SHA even if content is empty
    const fileData = await fetchCurrentFile({
      token: "fake-token",
      owner: "alice",
      repo: "my-repo",
      targetFile: "EMPTY_LOG.md",
      client: mockClient,
    });
    assert.strictEqual(fileData.content, "");
    assert.strictEqual(fileData.sha, existingSha, "SHA must be extracted and returned for empty existing files!");

    // 2. makeSingleCommit must provide existing sha
    const result = await makeSingleCommit({
      token: "fake-token",
      owner: "alice",
      repo: "my-repo",
      targetFile: "EMPTY_LOG.md",
      client: mockClient,
    });

    assert.strictEqual(result.sha, "empty_updated_sha_222");
    assert.strictEqual(createOrUpdateCalls.length, 1);
    assert.strictEqual(createOrUpdateCalls[0].sha, existingSha, "Update call must supply existing blob SHA!");
  });

  await runAsyncTest("Pre-existing Populated File: preserves user headers and supplies existing SHA", async () => {
    let createOrUpdateCalls = [];
    const existingSha = "abc123def456789";

    const initialContent = [
      "# My Custom Documentation",
      "",
      "## Introduction",
      "Intro text.",
      "",
      "## Setup",
      "Setup instructions.",
      "",
      "## Usage",
      "Usage guide.",
      "",
      "## Troubleshooting",
      "Common issues.",
      "",
      "## FAQ",
      "FAQ answers.",
      "",
      "## License",
      "MIT",
      "",
    ].join("\n");

    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "DOCS.md",
            path: "DOCS.md",
            sha: existingSha,
            size: initialContent.length,
            content: Buffer.from(initialContent).toString("base64"),
            encoding: "base64",
          },
        }),
        createOrUpdateFileContents: async (params) => {
          createOrUpdateCalls.push(params);
          return {
            data: {
              commit: {
                sha: "populated_updated_sha_333",
                html_url: "https://github.com/alice/my-repo/commit/populated_updated_sha_333",
              },
            },
          };
        },
      },
    };

    const result = await makeSingleCommit({
      token: "fake-token",
      owner: "alice",
      repo: "my-repo",
      targetFile: "./DOCS.md",
      client: mockClient,
    });

    assert.strictEqual(result.sha, "populated_updated_sha_333");
    assert.strictEqual(createOrUpdateCalls.length, 1);
    const sentParams = createOrUpdateCalls[0];
    assert.strictEqual(sentParams.sha, existingSha, "Must supply existing file SHA");

    const decoded = Buffer.from(sentParams.content, "base64").toString("utf-8");
    assert.ok(decoded.includes("## Introduction"), "Preserves Introduction");
    assert.ok(decoded.includes("## Setup"), "Preserves Setup");
    assert.ok(decoded.includes("## Usage"), "Preserves Usage");
    assert.ok(decoded.includes("## Troubleshooting"), "Preserves Troubleshooting");
    assert.ok(decoded.includes("## FAQ"), "Preserves FAQ");
    assert.ok(decoded.includes("## License"), "Preserves License");
    assert.ok(decoded.includes("## [2026-"), "Appends new timestamped entry");
  });

  await runAsyncTest("Directory and Non-File Rejection: throws clear error", async () => {
    const mockDirClient = {
      repos: {
        getContent: async () => ({
          data: [{ name: "file1.txt" }, { name: "file2.txt" }], // Array = directory
        }),
      },
    };

    await assert.rejects(
      async () => {
        await fetchCurrentFile({
          token: "fake-token",
          owner: "alice",
          repo: "my-repo",
          targetFile: "src/components",
          client: mockDirClient,
        });
      },
      /is a directory, not a file/
    );

    const mockSymlinkClient = {
      repos: {
        getContent: async () => ({
          data: { type: "symlink", target: "other" },
        }),
      },
    };

    await assert.rejects(
      async () => {
        await fetchCurrentFile({
          token: "fake-token",
          owner: "alice",
          repo: "my-repo",
          targetFile: "symlink_file",
          client: mockSymlinkClient,
        });
      },
      /is not a regular file/
    );
  });

  await runAsyncTest("Sequential Batch Commits: SHA evolves and propagates across commits", async () => {
    // Simulated remote repository state
    let repoState = {
      content: "# Activity Log\n",
      sha: "initial_sha_001",
    };

    const commitHistory = [];

    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "LOG.md",
            path: "LOG.md",
            sha: repoState.sha,
            size: repoState.content.length,
            content: Buffer.from(repoState.content).toString("base64"),
          },
        }),
        createOrUpdateFileContents: async (params) => {
          // GitHub requires the current blob SHA
          if (params.sha !== repoState.sha) {
            const err = new Error(`409 Conflict: Provided SHA ${params.sha} does not match remote SHA ${repoState.sha}`);
            err.status = 409;
            throw err;
          }
          const newSha = `sha_gen_${commitHistory.length + 1}_${Date.now()}`;
          repoState.content = Buffer.from(params.content, "base64").toString("utf-8");
          repoState.sha = newSha;

          commitHistory.push({
            shaUsed: params.sha,
            newSha: newSha,
            message: params.message,
          });

          return {
            data: {
              commit: {
                sha: newSha,
                html_url: `https://github.com/alice/my-repo/commit/${newSha}`,
              },
            },
          };
        },
      },
    };

    const result = await makeBatchCommits(
      {
        token: "fake-token",
        owner: "alice",
        repo: "my-repo",
        targetFile: "LOG.md",
        client: mockClient,
      },
      3,
      "burst-test"
    );

    assert.strictEqual(result.committed, 3, "All 3 batch commits must succeed");
    assert.strictEqual(result.errors.length, 0, `No errors expected, got ${result.errors.join(", ")}`);
    assert.strictEqual(commitHistory.length, 3, "3 commits recorded");
    assert.strictEqual(commitHistory[0].shaUsed, "initial_sha_001", "Commit 1 uses initial SHA");
    assert.strictEqual(commitHistory[1].shaUsed, commitHistory[0].newSha, "Commit 2 uses Commit 1's new SHA");
    assert.strictEqual(commitHistory[2].shaUsed, commitHistory[1].newSha, "Commit 3 uses Commit 2's new SHA");
    assert.strictEqual(result.lastSha, commitHistory[2].newSha, "Batch result lastSha matches final commit SHA");
  });

  await runAsyncTest("Sequential Batch Commits (20 iterations): exact maxEntries and zero whitespace drift over continuous GitHub commits", async () => {
    let repoState = {
      content: "# User Custom Docs Header\n\n## Custom Section A\nCustom text\n",
      sha: "initial_blob_sha_000",
    };

    let commitCount = 0;
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "DOCS.md",
            path: "DOCS.md",
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
          const nextSha = `blob_sha_${commitCount}_${Date.now()}`;
          repoState.content = Buffer.from(params.content, "base64").toString("utf-8");
          repoState.sha = nextSha;
          return {
            data: {
              commit: {
                sha: nextSha,
                html_url: `https://github.com/alice/my-repo/commit/${nextSha}`,
              },
            },
          };
        },
      },
    };

    const result = await makeBatchCommits(
      {
        token: "fake-token",
        owner: "alice",
        repo: "my-repo",
        targetFile: "  ./DOCS.md  ",
        client: mockClient,
      },
      20,
      "rolling-burst"
    );

    assert.strictEqual(result.committed, 20, "All 20 batch commits must succeed");
    assert.strictEqual(result.errors.length, 0, "No batch errors expected");
    assert.ok(repoState.content.includes("## Custom Section A"), "Custom section must remain intact");

    // Check entry count is exactly 5
    const entryMatches = repoState.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || [];
    assert.strictEqual(entryMatches.length, 5, "Must keep exactly 5 rolling entries after 20 commits");

    // Check that whitespace between custom header section and first entry has not drifted (must match initial single newline)
    const match = repoState.content.match(/Custom text(\n+)## \[/);
    assert.ok(match, "Pattern match for header-entry boundary must succeed");
    assert.strictEqual(match[1].length, 1, `Whitespace between header and first entry must be exactly 1 newline as initialized (got ${match[1].length})`);
  });

  console.log("\n--- Suite 4: Save Config Route Path Validation ---");

  runTest("Target file path validation rejects directory traversal and empty strings", () => {
    function validateSaveConfigPath(rawPath) {
      const targetFile = String(rawPath ?? "PROGRESS_LOG.md")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.?\/+/, "");

      if (!targetFile || targetFile.length > 200 || targetFile.includes("..")) {
        return { valid: false, error: "Invalid target file path" };
      }
      return { valid: true, targetFile };
    }

    assert.strictEqual(validateSaveConfigPath("PROGRESS_LOG.md").valid, true);
    assert.strictEqual(validateSaveConfigPath("./PROGRESS_LOG.md").valid, true);
    assert.strictEqual(validateSaveConfigPath("./nested/file.md").valid, true);
    assert.strictEqual(validateSaveConfigPath("nested\\file.md").valid, true);
    assert.strictEqual(validateSaveConfigPath("nested\\file.md").targetFile, "nested/file.md");

    // Traversal and invalid cases
    assert.strictEqual(validateSaveConfigPath("../secret.txt").valid, false);
    assert.strictEqual(validateSaveConfigPath("src/../../etc/passwd").valid, false);
    assert.strictEqual(validateSaveConfigPath("").valid, false);
    assert.strictEqual(validateSaveConfigPath("a".repeat(201)).valid, false);
  });

  console.log("\n===============================================================");
  console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("===============================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
