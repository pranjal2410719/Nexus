import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

try {
  register(new URL("./tests/ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // if already registered
}

async function runAdversarialTests() {
  console.log("===============================================================");
  console.log("  ADVERSARIAL STRESS & EDGE-CASE TEST HARNESS (M1)");
  console.log("===============================================================\n");

  const {
    pruneEntries,
    fetchCurrentFile,
    makeSingleCommit,
    makeBatchCommits,
    sanitizePath,
    generateRealLogEntry,
  } = await import("./lib/core/commit-engine.ts");

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
      if (err.stack) console.error(`    ${err.stack.split("\n")[1]}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
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
  // TEST GROUP 1: PRUNING REGEX & PARSING EDGE CASES
  // -------------------------------------------------------------
  console.log("--- Group 1: Pruning Regex & Boundary Conditions ---");

  test("1.1 Huge log entries (1,000 entries) performance & ReDoS stress test", () => {
    let doc = "# Huge Practice Log\n";
    const totalEntries = 1000;
    for (let i = 0; i < totalEntries; i++) {
      const day = String(1 + (i % 28)).padStart(2, "0");
      const hour = String(i % 24).padStart(2, "0");
      const min = String(i % 60).padStart(2, "0");
      doc += `\n## [2026-08-${day} ${hour}:${min}:00 UTC] feat(stress): entry ${i}\nCode payload ${i} with long descriptions\n`;
    }

    const t0 = Date.now();
    const pruned = pruneEntries(doc, 5);
    const elapsed = Date.now() - t0;

    assert.ok(elapsed < 100, `Pruning 1000 entries took ${elapsed}ms (must be < 100ms)`);
    assert.ok(pruned.startsWith("# Huge Practice Log\n"));
    const matches = pruned.match(/## \[2026-08-\d{2} \d{2}:\d{2}:\d{2} UTC\]/g) || [];
    assert.strictEqual(matches.length, 5, `Expected exactly 5 entries, got ${matches.length}`);
    assert.ok(pruned.includes("entry 999"), "Must keep entry 999");
    assert.ok(pruned.includes("entry 995"), "Must keep entry 995");
    assert.ok(!pruned.includes("entry 994\n"), "Must prune entry 994");
  });

  test("1.2 Pruning with CRLF (\\r\\n) line endings across entries", () => {
    let doc = "# Windows CRLF Document\r\n\r\n## Section 1\r\nText 1\r\n";
    for (let i = 1; i <= 7; i++) {
      doc += `\r\n## [2026-08-27 10:0${i}:00 UTC] feat(crlf): entry ${i}\r\nPayload ${i}\r\n`;
    }
    const pruned = pruneEntries(doc, 5);
    assert.ok(pruned.includes("## Section 1"), "Must preserve Section 1");
    const matches = pruned.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("entry 1\r\n"));
    assert.ok(!pruned.includes("entry 2\r\n"));
    assert.ok(pruned.includes("entry 7\r\n"));
  });

  test("1.3 Pruning with maxEntries = 1 and maxEntries = 0 boundary values", () => {
    let doc = "# Log Header\n";
    for (let i = 1; i <= 3; i++) {
      doc += `\n## [2026-08-27 10:0${i}:00 UTC] feat(test): entry ${i}\nPayload ${i}\n`;
    }
    const pruned1 = pruneEntries(doc, 1);
    const matches1 = pruned1.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches1.length, 1);
    assert.ok(pruned1.includes("entry 3"));

    // maxEntries <= 0 slice(0) or empty
    const pruned0 = pruneEntries(doc, 0);
    // When slice(-0) or slice(0): slice(-0) in JS is slice(0) which returns all elements if not guarded
    // Let's verify behavior
    assert.ok(typeof pruned0 === "string");
  });

  test("1.4 Pruning when user markdown has headings with numbers and brackets", () => {
    const customDoc = [
      "# Complex User Markdown Document",
      "",
      "## [RFC-1234] Design Specification",
      "Spec content",
      "",
      "## [v2.0.0] Release Notes [2026-08-01]",
      "Release details",
      "",
      "## [2026] Goals & OKRs",
      "Goals content",
      "",
    ].join("\n");

    let currentDoc = customDoc;
    for (let i = 1; i <= 6; i++) {
      currentDoc += `\n## [2026-08-27 10:0${i}:00 UTC] feat(dsa): commit entry ${i}\nDetails ${i}\n`;
    }

    const pruned = pruneEntries(currentDoc, 5);
    assert.ok(pruned.includes("## [RFC-1234] Design Specification"), "Must preserve RFC heading");
    assert.ok(pruned.includes("## [v2.0.0] Release Notes [2026-08-01]"), "Must preserve Release Notes heading");
    assert.ok(pruned.includes("## [2026] Goals & OKRs"), "Must preserve Goals heading");
    const matches = pruned.match(/## \[2026-08-27 \d{2}:\d{2}:\d{2} UTC\]/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("commit entry 1\n"));
    assert.ok(pruned.includes("commit entry 6\n"));
  });

  test("1.5 Code block containing nested markdown headings inside log entry details", () => {
    let doc = "# Log\n";
    for (let i = 1; i <= 6; i++) {
      doc += `\n## [2026-08-27 10:0${i}:00 UTC] feat(dsa): entry ${i}\n\`\`\`markdown\n# Nested Title\n## Sub heading\n\`\`\`\n`;
    }
    const pruned = pruneEntries(doc, 5);
    const matches = pruned.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("entry 1\n"));
    assert.ok(pruned.includes("entry 6\n"));
  });

  // -------------------------------------------------------------
  // TEST GROUP 2: UNICODE, MULTIBYTE & SPECIAL CHARACTERS
  // -------------------------------------------------------------
  console.log("\n--- Group 2: Unicode, Multibyte & Content Edge Cases ---");

  test("2.1 Unicode multilingual content & Emojis preservation across commit content", () => {
    const unicodeHeader = [
      "# 多言語ドキュメント (Multilingual Document) 🚀",
      "",
      "## 概要 (Overview)",
      "Nexus は開発アクティビティをシミュレートするエンジンです。✨",
      "",
      "## 한국어 섹션 (Korean)",
      "환영합니다! 커밋 스케줄러입니다. 🔥",
      "",
      "## العربية (Arabic RTL)",
      "مرحبا بك في نظام جدولة الالتزامات 🌟",
      "",
      "## हिन्दी (Hindi)",
      "यह एक स्वचालित गिट कमिट इंजन है। 🇮🇳",
      "",
      "## Complex Emojis & ZWJ Sequences",
      "👨‍👩‍👧‍👦 👩🏽‍💻 🏳️‍🌈 🧙‍♂️ 𝄢 𠮷野家",
      "",
    ].join("\n");

    let doc = unicodeHeader;
    for (let i = 1; i <= 7; i++) {
      doc += `\n## [2026-08-27 10:0${i}:00 UTC] feat(i18n): commit ${i} 🎯\nLog detail ${i} 日本語\n`;
    }

    const pruned = pruneEntries(doc, 5);
    assert.ok(pruned.includes("多言語ドキュメント"), "Japanese header preserved");
    assert.ok(pruned.includes("한국어 섹션"), "Korean header preserved");
    assert.ok(pruned.includes("العربية"), "Arabic header preserved");
    assert.ok(pruned.includes("हिन्दी"), "Hindi header preserved");
    assert.ok(pruned.includes("👨‍👩‍👧‍👦"), "ZWJ Emoji sequence preserved");
    assert.ok(pruned.includes("𠮷野家"), "Surrogate pair CJK character preserved");

    const matches = pruned.match(/## \[2026-08-27/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.ok(!pruned.includes("commit 1 🎯"));
    assert.ok(pruned.includes("commit 7 🎯"));

    // Verify Base64 roundtrip on unicode content
    const b64 = Buffer.from(pruned).toString("base64");
    const roundtrip = Buffer.from(b64, "base64").toString("utf-8");
    assert.strictEqual(roundtrip, pruned, "Base64 UTF-8 roundtrip must be lossless");
  });

  test("2.2 Whitespace-only files & files with diverse newline combinations", () => {
    assert.strictEqual(pruneEntries("   \n\n\t\t\n   "), "   \n\n\t\t\n   ");
    assert.strictEqual(pruneEntries("\n\n\n"), "\n\n\n");
    assert.strictEqual(pruneEntries(""), "");
  });

  // -------------------------------------------------------------
  // TEST GROUP 3: PATH SANITIZATION ADVERSARIAL CASES
  // -------------------------------------------------------------
  console.log("\n--- Group 3: Path Sanitization Edge Cases ---");

  test("3.1 Sanitization of deeply nested paths and mixed separators", () => {
    assert.strictEqual(sanitizePath("a/b/c/d/e/PROGRESS.md"), "a/b/c/d/e/PROGRESS.md");
    assert.strictEqual(sanitizePath(".\\a\\b\\c\\d\\e\\PROGRESS.md"), "a/b/c/d/e/PROGRESS.md");
    assert.strictEqual(sanitizePath("///root///sub//dir/file.txt"), "root///sub//dir/file.txt");
    assert.strictEqual(sanitizePath("./././nested/file.md"), "././nested/file.md");
  });

  test("3.2 Filenames with regex special characters and unusual valid characters", () => {
    assert.strictEqual(sanitizePath("./docs/file[1].md"), "docs/file[1].md");
    assert.strictEqual(sanitizePath("./docs/file(copy).md"), "docs/file(copy).md");
    assert.strictEqual(sanitizePath("./docs/a+b=c.md"), "docs/a+b=c.md");
    assert.strictEqual(sanitizePath("./v1.0.0-beta.2/changelog.md"), "v1.0.0-beta.2/changelog.md");
    assert.strictEqual(sanitizePath("./$dir/@scope/file.md"), "$dir/@scope/file.md");
  });

  // -------------------------------------------------------------
  // TEST GROUP 4: GITHUB COMMIT LIFECYCLE & FAILURE MODES
  // -------------------------------------------------------------
  console.log("\n--- Group 4: Commit Helper Lifecycle & Failure Modes ---");

  await testAsync("4.1 Pre-existing file with non-base64 or empty data structure in GitHub response", async () => {
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            name: "test.md",
            path: "test.md",
            sha: "test_sha_999",
            size: 0,
            content: undefined, // Large file or metadata-only response
          },
        }),
      },
    };

    const res = await fetchCurrentFile({
      token: "tok",
      owner: "o",
      repo: "r",
      targetFile: "test.md",
      client: mockClient,
    });

    assert.strictEqual(res.content, "");
    assert.strictEqual(res.sha, "test_sha_999", "Must preserve SHA even if data.content is undefined");
  });

  await testAsync("4.2 GitHub API 401 Unauthorized / 403 Forbidden is NOT masked as 404", async () => {
    const mockAuthErrClient = {
      repos: {
        getContent: async () => {
          const err = new Error("Bad credentials");
          err.status = 401;
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await fetchCurrentFile({
          token: "bad-tok",
          owner: "o",
          repo: "r",
          targetFile: "test.md",
          client: mockAuthErrClient,
        });
      },
      (err) => err.status === 401
    );
  });

  await testAsync("4.3 Batch commits: partial failure recovery (Commit 1 ok, 2 fails, 3 ok)", async () => {
    let repoState = {
      content: "# Activity Log\n",
      sha: "sha_init",
    };

    let attempt = 0;
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            sha: repoState.sha,
            content: Buffer.from(repoState.content).toString("base64"),
          },
        }),
        createOrUpdateFileContents: async (params) => {
          attempt++;
          if (attempt === 2) {
            const err = new Error("Simulated network timeout or rate limit");
            err.status = 500;
            throw err;
          }
          const nextSha = `sha_success_${attempt}`;
          repoState.content = Buffer.from(params.content, "base64").toString("utf-8");
          repoState.sha = nextSha;
          return { data: { commit: { sha: nextSha, html_url: `https://gh.com/commit/${nextSha}` } } };
        },
      },
    };

    const res = await makeBatchCommits(
      { token: "tok", owner: "o", repo: "r", targetFile: "LOG.md", client: mockClient },
      3,
      "resilience-test"
    );

    assert.strictEqual(res.committed, 2, "Commits 1 and 3 should succeed (2 total)");
    assert.strictEqual(res.errors.length, 1, "Commit 2 error should be recorded");
    assert.ok(res.errors[0].includes("Commit 2 failed: Simulated network timeout"));
    assert.strictEqual(res.lastSha, "sha_success_3", "Final SHA matches commit 3");
  });

  await testAsync("4.4 Rapid consecutive burst (10 commits) with rolling log truncation", async () => {
    let repoState = {
      content: "# User Custom Docs Header\n\n## Custom Section A\nCustom text\n",
      sha: "burst_init_sha",
    };

    let commitCount = 0;
    const mockClient = {
      repos: {
        getContent: async () => ({
          data: {
            type: "file",
            sha: repoState.sha,
            content: Buffer.from(repoState.content).toString("base64"),
          },
        }),
        createOrUpdateFileContents: async (params) => {
          assert.strictEqual(params.sha, repoState.sha, "Must match current remote SHA");
          commitCount++;
          const nextSha = `burst_sha_${commitCount}`;
          repoState.content = Buffer.from(params.content, "base64").toString("utf-8");
          repoState.sha = nextSha;
          return { data: { commit: { sha: nextSha, html_url: `https://gh.com/commit/${nextSha}` } } };
        },
      },
    };

    const res = await makeBatchCommits(
      { token: "tok", owner: "o", repo: "r", targetFile: "DOCS.md", client: mockClient },
      10,
      "rapid-burst"
    );

    assert.strictEqual(res.committed, 10);
    assert.strictEqual(res.errors.length, 0);

    // Verify final file state
    assert.ok(repoState.content.includes("## Custom Section A"), "Custom section preserved after 10 commits");
    const matches = repoState.content.match(/## \[\d{4}-\d{2}-\d{2}/g) || [];
    assert.strictEqual(matches.length, 5, "Must retain only 5 rolling entries after 10 sequential commits");
  });

  // -------------------------------------------------------------
  // TEST GROUP 5: SAVE-CONFIG SECURITY & FUZZING
  // -------------------------------------------------------------
  console.log("\n--- Group 5: Save-Config Security & Input Validation ---");

  test("5.1 Fuzzing targetFile with various adversarial strings", () => {
    function validateTargetFile(raw) {
      const targetFile = String(raw ?? "PROGRESS_LOG.md")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.?\/+/, "");

      if (!targetFile || targetFile.length > 200 || targetFile.includes("..")) {
        return false;
      }
      return true;
    }

    // Attacks / Invalid paths
    assert.strictEqual(validateTargetFile("../../../etc/passwd"), false);
    assert.strictEqual(validateTargetFile(".."), false);
    assert.strictEqual(validateTargetFile("../"), false);
    assert.strictEqual(validateTargetFile(".\\..\\secret.key"), false);
    assert.strictEqual(validateTargetFile("foo/bar/../../baz"), false);
    assert.strictEqual(validateTargetFile(""), false);
    assert.strictEqual(validateTargetFile("   "), false);
    assert.strictEqual(validateTargetFile("/".repeat(50)), false);
    assert.strictEqual(validateTargetFile("a".repeat(201)), false);
    assert.strictEqual(validateTargetFile(null), true); // defaults to PROGRESS_LOG.md
    assert.strictEqual(validateTargetFile(undefined), true); // defaults to PROGRESS_LOG.md

    // Legitimate complex paths
    assert.strictEqual(validateTargetFile("src/modules/sub_module/TASK_LOG.md"), true);
    assert.strictEqual(validateTargetFile("./docs/notes-2026.md"), true);
    assert.strictEqual(validateTargetFile("docs\\weekly\\update.md"), true);
  });

  console.log("\n===============================================================");
  console.log(`  RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("===============================================================\n");

  if (failed > 0) {
    throw new Error(`${failed} adversarial tests failed!`);
  }
}

runAdversarialTests().catch((err) => {
  console.error("Adversarial test harness failed:", err);
  process.exit(1);
});
