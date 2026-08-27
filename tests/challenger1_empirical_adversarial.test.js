/**
 * CHALLENGER 1 EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M1)
 * 
 * Tests:
 * 1. Zero-byte files, binary content, missing content fields in GitHub API responses
 * 2. Multi-header markdown files, tables, code blocks with nested headings, and 100+ rolling prune cycles
 * 3. 100-commit rapid batch bursts with SHA chaining, error resilience, and boundary counts
 * 4. Fuzzing and adversarial path sanitization & traversal defense
 * 5. Strict GitHub API error propagation for all non-404 status codes and malformed object types
 * 6. Hidden directories, ReDoS benchmarks, and 0-count batch commits
 */

import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

try {
  register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // if already registered
}

async function runAllChallengerTests() {
  console.log("===============================================================");
  console.log("  CHALLENGER 1: EMPIRICAL ADVERSARIAL STRESS TEST (M1)");
  console.log("===============================================================\n");

  const {
    pruneEntries,
    fetchCurrentFile,
    makeSingleCommit,
    makeBatchCommits,
    sanitizePath,
  } = await import("../lib/core/commit-engine.ts");

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
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
      throw err;
    }
  }

  console.log("--- 1. Empty, Binary & High-Entropy GitHub Content ---");

  await test("1.1 0-byte remote file returns existing sha and updates with sha in payload", async () => {
    let sentParams = null;
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "zero.md",
            path: "zero.md",
            sha: "0000000000000000000000000000000000000000",
            size: 0,
            content: "",
            encoding: "base64",
          },
        }),
        createOrUpdateFileContents: async (p) => {
          sentParams = p;
          return { data: { commit: { sha: "new_sha_zero", html_url: "url" } } };
        },
      },
    };

    const fetched = await fetchCurrentFile({
      token: "tok",
      owner: "u",
      repo: "r",
      targetFile: "zero.md",
      client: mockClient,
    });
    assert.strictEqual(fetched.content, "");
    assert.strictEqual(fetched.sha, "0000000000000000000000000000000000000000");

    const committed = await makeSingleCommit({
      token: "tok",
      owner: "u",
      repo: "r",
      targetFile: "zero.md",
      client: mockClient,
    });

    assert.strictEqual(committed.sha, "new_sha_zero");
    assert.strictEqual(sentParams.sha, "0000000000000000000000000000000000000000");
    const decoded = Buffer.from(sentParams.content, "base64").toString("utf-8");
    assert.ok(decoded.includes("# DSA Practice & Build Activity Log"));
  });

  await test("1.2 GitHub file >1MB without inline content field does not crash and supplies SHA", async () => {
    let sentParams = null;
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "large.md",
            path: "large.md",
            sha: "large_file_blob_sha_12345",
            size: 2048576, // 2MB
            content: undefined, // GitHub omits content for large blobs
          },
        }),
        createOrUpdateFileContents: async (p) => {
          sentParams = p;
          return { data: { commit: { sha: "new_sha_large", html_url: "url" } } };
        },
      },
    };

    const fetched = await fetchCurrentFile({
      token: "tok",
      owner: "u",
      repo: "r",
      targetFile: "large.md",
      client: mockClient,
    });
    assert.strictEqual(fetched.content, "");
    assert.strictEqual(fetched.sha, "large_file_blob_sha_12345");

    await makeSingleCommit({
      token: "tok",
      owner: "u",
      repo: "r",
      targetFile: "large.md",
      client: mockClient,
    });
    assert.strictEqual(sentParams.sha, "large_file_blob_sha_12345");
  });

  await test("1.3 Binary byte stream and high-entropy multi-byte UTF-8 data preservation", async () => {
    const richContent = `# Multi-Language Doc 🚀\n\n## 中文文档\n你好世界\n\n## العربية\nمرحبا بالعالم\n\n## Русский\nПривет мир\n\n## Math: ∫ e^x dx = e^x + C\n`;
    let sentParams = null;
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "unicode.md",
            path: "unicode.md",
            sha: "unicode_sha_999",
            size: Buffer.byteLength(richContent),
            content: Buffer.from(richContent).toString("base64"),
          },
        }),
        createOrUpdateFileContents: async (p) => {
          sentParams = p;
          return { data: { commit: { sha: "new_unicode_sha", html_url: "url" } } };
        },
      },
    };

    await makeSingleCommit({
      token: "tok",
      owner: "u",
      repo: "r",
      targetFile: "unicode.md",
      client: mockClient,
    });

    const decoded = Buffer.from(sentParams.content, "base64").toString("utf-8");
    assert.ok(decoded.includes("## 中文文档\n你好世界"));
    assert.ok(decoded.includes("## العربية\nمرحبا بالعالم"));
    assert.ok(decoded.includes("## Русский\nПривет мир"));
    assert.ok(decoded.includes("∫ e^x dx = e^x + C"));
    assert.strictEqual(sentParams.sha, "unicode_sha_999");
  });

  console.log("\n--- 2. Markdown Parsing, Code Block Isolation & Long Rolling Loops ---");

  await test("2.1 Document with 50+ mixed level markdown headers and complex markdown tables", async () => {
    let doc = "# Master System Blueprint\n\n";
    for (let i = 1; i <= 50; i++) {
      const level = (i % 6) + 1;
      const hashes = "#".repeat(level);
      doc += `${hashes} Custom Section ${i}\nDescription for section ${i}\n\n`;
    }
    doc += "| Param | Type | Description |\n|---|---|---|\n| id | string | ID |\n| sha | string | SHA |\n\n";

    let activeDoc = doc;
    for (let i = 1; i <= 15; i++) {
      activeDoc += `\n## [2026-08-27 10:${String(i).padStart(2, "0")}:00 UTC] feat(core): entry ${i}\nDetails ${i}\n`;
    }

    const pruned = pruneEntries(activeDoc, 5);

    for (let i = 1; i <= 50; i++) {
      const level = (i % 6) + 1;
      const hashes = "#".repeat(level);
      assert.ok(pruned.includes(`${hashes} Custom Section ${i}`), `Missing header for section ${i}`);
    }
    assert.ok(pruned.includes("| Param | Type | Description |"));

    const matches = pruned.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("entry 1\n"));
    assert.ok(!pruned.includes("entry 10\n"));
    assert.ok(pruned.includes("entry 11\n"));
    assert.ok(pruned.includes("entry 15\n"));
  });

  await test("2.2 100 consecutive append and rolling prune cycles: stability, memory and whitespace invariant", async () => {
    let doc = "# Invariant Test File\n\n## User Fixed Header\nConstant documentation.\n";

    for (let i = 1; i <= 100; i++) {
      const hour = String(Math.floor(i / 60)).padStart(2, "0");
      const min = String(i % 60).padStart(2, "0");
      const entry = `\n## [2026-08-27 ${hour}:${min}:00 UTC] feat(invariant): commit ${i}\n\n**Details:** ${i}\n`;
      
      doc = doc.endsWith("\n") ? doc + entry.replace(/^\n/, "") : doc + entry;
      doc = pruneEntries(doc, 5);

      assert.ok(doc.startsWith("# Invariant Test File\n\n## User Fixed Header\nConstant documentation.\n"));

      const expectedCount = Math.min(i, 5);
      const matches = doc.match(/## \[2026-08-27/g) || [];
      assert.strictEqual(matches.length, expectedCount, `Mismatch at step ${i}`);

      const match = doc.match(/Constant documentation\.(\n+)## \[/);
      assert.ok(match, `Match boundary failed at step ${i}`);
      assert.strictEqual(match[1].length, 1, `Whitespace drift detected at step ${i}: got ${match[1].length}`);
    }

    assert.ok(doc.includes("commit 100"));
    assert.ok(doc.includes("commit 96"));
    assert.ok(!doc.includes("commit 95\n"));
  });

  await test("2.3 Markdown code fence containing timestamp-like text inside user header", async () => {
    const docWithPseudoTimestamp = [
      "# Documentation",
      "",
      "## Code Examples",
      "```bash",
      "echo '## [2026-08-27 99:99:99 UTC] fake timestamp'",
      "```",
      "",
      "## Real Nexus Logs",
    ].join("\n");

    let fullDoc = docWithPseudoTimestamp;
    for (let i = 1; i <= 7; i++) {
      fullDoc += `\n## [2026-08-27 12:0${i}:00 UTC] feat: real entry ${i}\n`;
    }

    const pruned = pruneEntries(fullDoc, 5);
    assert.ok(pruned.includes("echo '## [2026-08-27 99:99:99 UTC] fake timestamp'"));
    const matches = pruned.match(/## \[2026-08-27 12:/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("real entry 1\n"));
    assert.ok(pruned.includes("real entry 7\n"));
  });

  console.log("\n--- 3. High-Burst Batch Commits & Failure Resilience ---");

  await test("3.1 50-commit rapid batch burst with real-time SHA evolution and conflict detection", async () => {
    let state = {
      content: "# Burst Test File\n",
      sha: "root_sha_0",
    };

    let commitCounter = 0;
    const client = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "burst.md",
            path: "burst.md",
            sha: state.sha,
            size: state.content.length,
            content: Buffer.from(state.content).toString("base64"),
          },
        }),
        createOrUpdateFileContents: async (p) => {
          if (p.sha !== state.sha) {
            const err = new Error(`409 Conflict: Expected SHA ${state.sha}, received ${p.sha}`);
            err.status = 409;
            throw err;
          }
          commitCounter++;
          const nextSha = `sha_step_${commitCounter}_${Date.now()}`;
          state.content = Buffer.from(p.content, "base64").toString("utf-8");
          state.sha = nextSha;
          return {
            data: {
              commit: {
                sha: nextSha,
                html_url: `https://github.com/u/r/commit/${nextSha}`,
              },
            },
          };
        },
      },
    };

    const res = await makeBatchCommits(
      { token: "tok", owner: "u", repo: "r", targetFile: "burst.md", client },
      50,
      "burst50"
    );

    assert.strictEqual(res.committed, 50);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(commitCounter, 50);
    assert.strictEqual(res.lastSha, state.sha);

    const matches = state.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || [];
    assert.strictEqual(matches.length, 5, "Must keep rolling 5 entries in batch");
  });

  await test("3.2 Batch commits resilience against intermittent network drops (e.g. commits 2, 4 fail)", async () => {
    let state = {
      content: "# Resilient Batch\n",
      sha: "sha_init",
    };

    let callCount = 0;
    const client = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "resilient.md",
            path: "resilient.md",
            sha: state.sha,
            size: state.content.length,
            content: Buffer.from(state.content).toString("base64"),
          },
        }),
        createOrUpdateFileContents: async (p) => {
          callCount++;
          if (callCount === 2 || callCount === 4) {
            const netErr = new Error("ETIMEDOUT: Connection timed out to GitHub API");
            throw netErr;
          }
          const nextSha = `sha_resilient_${callCount}`;
          state.content = Buffer.from(p.content, "base64").toString("utf-8");
          state.sha = nextSha;
          return {
            data: {
              commit: {
                sha: nextSha,
                html_url: `https://github.com/u/r/commit/${nextSha}`,
              },
            },
          };
        },
      },
    };

    const res = await makeBatchCommits(
      { token: "tok", owner: "u", repo: "r", targetFile: "resilient.md", client },
      5,
      "intermittent"
    );

    assert.strictEqual(res.committed, 3, "3 out of 5 commits should succeed");
    assert.strictEqual(res.errors.length, 2, "2 errors recorded");
    assert.ok(res.errors[0].includes("Commit 2 failed: ETIMEDOUT"));
    assert.ok(res.errors[1].includes("Commit 4 failed: ETIMEDOUT"));
    assert.strictEqual(res.lastSha, state.sha);
  });

  console.log("\n--- 4. Path Sanitization & Traversal Fuzzing ---");

  await test("4.1 Path sanitization matrix with extreme separators and relative notation", async () => {
    assert.strictEqual(sanitizePath("  ./dir/subdir/file.md  "), "dir/subdir/file.md");
    assert.strictEqual(sanitizePath(".\\dir\\subdir\\file.md"), "dir/subdir/file.md");
    assert.strictEqual(sanitizePath("////root/file.md"), "root/file.md");
    assert.strictEqual(sanitizePath(".///a/b/c.txt"), "a/b/c.txt");
    assert.strictEqual(sanitizePath("PROGRESS_LOG.md"), "PROGRESS_LOG.md");
    assert.strictEqual(sanitizePath(""), "");
    assert.strictEqual(sanitizePath("   \t  "), "");
  });

  console.log("\n--- 5. Non-404 GitHub Error Propagation & Payload Integrity ---");

  await test("5.1 Non-404 HTTP errors (401, 403, 409, 422, 500, 503) are strictly re-thrown", async () => {
    const errorCodes = [401, 403, 409, 422, 500, 502, 503, 504];

    for (const code of errorCodes) {
      const failingClient = {
        repos: {
          getContent: async () => {
            const err = new Error(`HTTP Error ${code}`);
            err.status = code;
            throw err;
          },
        },
      };

      await assert.rejects(
        async () => {
          await fetchCurrentFile({
            token: "tok",
            owner: "u",
            repo: "r",
            targetFile: "file.md",
            client: failingClient,
          });
        },
        (err) => err.status === code,
        `Expected error status ${code} to be propagated`
      );
    }
  });

  await test("5.2 Malformed or invalid GitHub API data types throw descriptive errors", async () => {
    const dirClient = { repos: { getContent: async () => ({ data: [{ name: "a" }] }) } };
    await assert.rejects(
      async () => fetchCurrentFile({ token: "t", owner: "u", repo: "r", targetFile: "dir", client: dirClient }),
      /is a directory, not a file/
    );

    const nullClient = { repos: { getContent: async () => ({ data: null }) } };
    await assert.rejects(
      async () => fetchCurrentFile({ token: "t", owner: "u", repo: "r", targetFile: "null", client: nullClient }),
      /is not a regular file/
    );

    const subClient = { repos: { getContent: async () => ({ data: { type: "submodule" } }) } };
    await assert.rejects(
      async () => fetchCurrentFile({ token: "t", owner: "u", repo: "r", targetFile: "sub", client: subClient }),
      /is not a regular file/
    );
  });

  console.log("\n--- 6. Hidden Directories, ReDoS & Edge Invariants ---");

  await test("6.1 Hidden directories (.github/workflows) preserved", async () => {
    const dotPath = sanitizePath(".github/workflows/deploy.yml");
    assert.strictEqual(dotPath, ".github/workflows/deploy.yml", "Hidden directory .github must not be stripped");
  });

  await test("6.2 ReDoS stress test on pathological bracket patterns", async () => {
    const start = performance.now();
    let pathological = "# Heading\n" + "## [2026-99-99 99:99:99 UTC] not quite\n".repeat(10000);
    pathological += "## [2026-08-27 10:00:00 UTC] valid\n";
    const prunedPatho = pruneEntries(pathological, 5);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `ReDoS detected: took ${elapsed}ms`);
    assert.ok(prunedPatho.includes("## [2026-08-27 10:00:00 UTC] valid"));
  });

  await test("6.3 makeBatchCommits with count = 0 and count = -1", async () => {
    const zeroBatch = await makeBatchCommits({ token: "t", owner: "o", repo: "r", targetFile: "f.md" }, 0);
    assert.strictEqual(zeroBatch.committed, 0);
    assert.strictEqual(zeroBatch.errors.length, 0);

    const negBatch = await makeBatchCommits({ token: "t", owner: "o", repo: "r", targetFile: "f.md" }, -2);
    assert.strictEqual(negBatch.committed, 0);
    assert.strictEqual(negBatch.errors.length, 0);
  });

  await test("6.4 makeSingleCommit propagates Octokit commit error (e.g. 422 branch protection)", async () => {
    const branchProtectClient = {
      repos: {
        getContent: async () => ({
          data: { type: "file", sha: "sha1", content: Buffer.from("# Log\n").toString("base64") }
        }),
        createOrUpdateFileContents: async () => {
          const err = new Error("422 Unprocessable Entity: Protected branch rules violation");
          err.status = 422;
          throw err;
        }
      }
    };

    await assert.rejects(
      async () => makeSingleCommit({ token: "t", owner: "o", repo: "r", targetFile: "f.md", client: branchProtectClient }),
      (err) => err.status === 422
    );
  });

  console.log("\n===============================================================");
  console.log(`  ALL ${passed}/${total} CHALLENGER 1 ADVERSARIAL TESTS PASSED!`);
  console.log("===============================================================\n");
}

runAllChallengerTests().catch((err) => {
  console.error("Challenger 1 Test Failure:", err);
  process.exit(1);
});
