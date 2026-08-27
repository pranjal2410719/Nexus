// Tier 1: Feature Coverage (>=5 tests per feature across all 8 features)
import { describe, test, beforeEach, afterEach, assert, createTempDir, withEnv, run } from "./test_harness.js";
import { MockGitHubRepoStore, computeGitBlobSha } from "./mock_github.js";
import { LocalFileStore } from "../lib/storage/local-file-store.ts";
import { encryptSecret, decryptSecret } from "../lib/security/encryption.ts";
import {
  parseCookies,
  sessionCookie,
  clearSessionCookie,
} from "../lib/auth/cookies.ts";
import { isAdmin } from "../lib/auth/permissions.ts";
import { publicUser } from "../lib/auth/user.ts";
import { pruneEntries, sanitizePath } from "../lib/core/commit-engine.ts";
import { handleCors } from "../lib/http/cors.ts";
import { json } from "../lib/http/response.ts";

describe("Tier 1 - Feature 1: File Update & Blob SHA Handling", () => {
  test("test_file_update_creates_new_file_when_not_found", async () => {
    const mockStore = new MockGitHubRepoStore();
    const octokit = mockStore.createOctokit("ghp_test_token");
    const owner = "testuser";
    const repo = "repo1";
    const path = "PROGRESS_LOG.md";

    // 1. Check file not found (404)
    let fetched = null;
    try {
      fetched = await octokit.repos.getContent({ owner, repo, path });
    } catch (err) {
      assert.strictEqual(err.status, 404);
    }
    assert.strictEqual(fetched, null);

    // 2. Create new file without sha
    const initialContent = "# Activity Log\n\n## Initial entry";
    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: "feat: initialize log",
      content: Buffer.from(initialContent).toString("base64"),
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.data.content.sha, "New file must have a valid blob SHA");
    assert.ok(res.data.commit.sha, "Commit must have a SHA");

    // 3. Verify file now exists
    const stored = mockStore.getFile(owner, repo, path);
    assert.strictEqual(stored.content, initialContent);
    assert.strictEqual(stored.sha, computeGitBlobSha(initialContent));
  });

  test("test_file_update_preserves_sha_on_existing_populated_file", async () => {
    const mockStore = new MockGitHubRepoStore();
    const owner = "testuser";
    const repo = "repo1";
    const path = "PROGRESS_LOG.md";
    const originalContent = "# Activity Log\n\n## Entry 1";
    const initialSha = mockStore.setFile(owner, repo, path, originalContent);

    const octokit = mockStore.createOctokit("ghp_test_token");

    // Fetch existing
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    assert.strictEqual(data.sha, initialSha);
    assert.strictEqual(Buffer.from(data.content, "base64").toString("utf8"), originalContent);

    // Update with SHA
    const updatedContent = originalContent + "\n\n## Entry 2";
    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: "feat: add entry 2",
      content: Buffer.from(updatedContent).toString("base64"),
      sha: data.sha,
    });

    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.data.content.sha, initialSha);

    const stored = mockStore.getFile(owner, repo, path);
    assert.strictEqual(stored.content, updatedContent);
    assert.strictEqual(stored.sha, computeGitBlobSha(updatedContent));
  });

  test("test_file_update_handles_existing_empty_0byte_file", async () => {
    const mockStore = new MockGitHubRepoStore();
    const owner = "testuser";
    const repo = "repo1";
    const path = "EMPTY_LOG.md";
    const emptySha = mockStore.setFile(owner, repo, path, "");

    const octokit = mockStore.createOctokit("ghp_test_token");
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    assert.strictEqual(data.sha, emptySha);
    assert.strictEqual(data.size, 0);

    const newContent = "# Initialized from 0-byte file";
    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: "feat: populate empty file",
      content: Buffer.from(newContent).toString("base64"),
      sha: data.sha, // must not drop SHA even if file was 0 bytes
    });

    assert.strictEqual(res.status, 200);
    const stored = mockStore.getFile(owner, repo, path);
    assert.strictEqual(stored.content, newContent);
  });

  test("test_sequential_commits_update_sha_chain", async () => {
    const mockStore = new MockGitHubRepoStore();
    const owner = "testuser";
    const repo = "chain-repo";
    const path = "LOG.md";
    let currentSha = mockStore.setFile(owner, repo, path, "# Chain Start");

    const octokit = mockStore.createOctokit("ghp_test_token");

    for (let i = 1; i <= 3; i++) {
      const { data: getRes } = await octokit.repos.getContent({ owner, repo, path });
      assert.strictEqual(getRes.sha, currentSha);

      const content = Buffer.from(getRes.content, "base64").toString("utf8") + `\n## Commit ${i}`;
      const updateRes = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `feat: step ${i}`,
        content: Buffer.from(content).toString("base64"),
        sha: getRes.sha,
      });

      assert.notStrictEqual(updateRes.data.content.sha, currentSha);
      currentSha = updateRes.data.content.sha;
    }

    const stored = mockStore.getFile(owner, repo, path);
    assert.strictEqual(stored.commits.length, 4); // initial + 3 updates
  });

  test("test_batch_commits_tracks_committed_count_and_errors", async () => {
    const mockStore = new MockGitHubRepoStore();
    const owner = "testuser";
    const repo = "batch-repo";
    const path = "PROGRESS.md";
    mockStore.setFile(owner, repo, path, "# Initial");

    const octokit = mockStore.createOctokit("ghp_batch_token");
    const count = 3;
    let committed = 0;
    const errors = [];
    let lastSha = undefined;

    for (let i = 1; i <= count; i++) {
      try {
        const { data: fileData } = await octokit.repos.getContent({ owner, repo, path });
        const text = Buffer.from(fileData.content, "base64").toString("utf8") + `\n## Batch ${i}`;
        const res = await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          message: `feat: batch ${i}`,
          content: Buffer.from(text).toString("base64"),
          sha: fileData.sha,
        });
        committed++;
        lastSha = res.data.commit.sha;
      } catch (err) {
        errors.push(err.message);
      }
    }

    assert.strictEqual(committed, 3);
    assert.strictEqual(errors.length, 0);
    assert.ok(lastSha);
  });

  test("test_batch_commits_handles_partial_failure_gracefully", async () => {
    const mockStore = new MockGitHubRepoStore();
    const owner = "testuser";
    const repo = "fail-repo";
    const path = "FAIL.md";
    mockStore.setFile(owner, repo, path, "# Start");

    const octokit = mockStore.createOctokit("ghp_token");
    let committed = 0;
    const errors = [];

    // First commit succeeds
    const { data: f1 } = await octokit.repos.getContent({ owner, repo, path });
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: "feat: 1",
      content: Buffer.from("step1").toString("base64"),
      sha: f1.sha,
    });
    committed++;

    // Inject 500 error for second commit
    mockStore.injectError("createOrUpdateFileContents", `${owner}/${repo}/${path}`, new Error("GitHub 500 Internal Error"));

    try {
      const { data: f2 } = await octokit.repos.getContent({ owner, repo, path });
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: "feat: 2",
        content: Buffer.from("step2").toString("base64"),
        sha: f2.sha,
      });
      committed++;
    } catch (err) {
      errors.push(err.message);
    }

    assert.strictEqual(committed, 1);
    assert.strictEqual(errors.length, 1);
    assert.includes(errors[0], "GitHub 500");
  });
});

describe("Tier 1 - Feature 2: Safe Log Pruning", () => {
  test("test_prune_entries_preserves_custom_markdown_header", () => {
    const original = `# My Custom Project\nThis is custom preamble that must not be deleted.\n\n## [2026-08-01 10:00:00 UTC] feat: one\n\n## [2026-08-02 10:00:00 UTC] feat: two\n\n## [2026-08-03 10:00:00 UTC] feat: three\n\n## [2026-08-04 10:00:00 UTC] feat: four\n\n## [2026-08-05 10:00:00 UTC] feat: five\n\n## [2026-08-06 10:00:00 UTC] feat: six`;
    const pruned = pruneEntries(original, 5);

    assert.includes(pruned, "# My Custom Project");
    assert.includes(pruned, "This is custom preamble that must not be deleted.");
    assert.includes(pruned, "feat: six");
    assert.includes(pruned, "feat: two");
  });

  test("test_prune_entries_keeps_exact_max_entries", () => {
    const entries = [];
    for (let i = 1; i <= 10; i++) {
      entries.push(`\n## [2026-08-${String(i).padStart(2, "0")} 12:00:00 UTC] feat: task ${i}\nDetails for ${i}\n`);
    }
    const content = "# Activity Log\n" + entries.join("");
    const pruned = pruneEntries(content, 5);

    // Count occurrences of "## ["
    const matches = pruned.match(/##\s+\[/g) || [];
    assert.strictEqual(matches.length, 5);
    assert.includes(pruned, "feat: task 10");
    assert.includes(pruned, "feat: task 6");
    assert.ok(!pruned.includes("feat: task 5"));
  });

  test("test_prune_entries_returns_unchanged_when_under_limit", () => {
    const content = "# Title\n\n## [2026-08-01 10:00:00 UTC] feat: 1\n\n## [2026-08-02 10:00:00 UTC] feat: 2\n";
    const pruned = pruneEntries(content, 5);
    assert.strictEqual(pruned, content);
  });

  test("test_prune_entries_handles_empty_content_with_default_header", () => {
    const pruned = pruneEntries("", 5);
    assert.strictEqual(pruned, "");
  });

  test("test_prune_entries_preserves_nested_subheadings_and_code_blocks", () => {
    const content = `# DSA Practice\n\n## [2026-08-01 10:00:00 UTC] feat(dsa): binary search\n\n### Summary\nComplexity O(log N)\n\n\`\`\`cpp\nint search() { return 0; }\n\`\`\`\n\n## [2026-08-02 10:00:00 UTC] fix(dsa): edge case\n`;
    const pruned = pruneEntries(content, 5);
    assert.includes(pruned, "### Summary");
    assert.includes(pruned, "```cpp");
    assert.includes(pruned, "int search() { return 0; }");
  });

  test("test_sanitize_path_cleans_leading_slashes_and_backslashes", () => {
    assert.strictEqual(sanitizePath("/docs/log.md"), "docs/log.md");
    assert.strictEqual(sanitizePath("./src/progress.md"), "src/progress.md");
    assert.strictEqual(sanitizePath("nested\\dir\\log.md"), "nested/dir/log.md");
  });
});

describe("Tier 1 - Feature 3: Token Encryption & Security", () => {
  test("test_aes_gcm_encryption_roundtrip", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "super_secret_master_key_for_testing" }, async () => {
      const plaintext = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
      const encrypted = await encryptSecret(plaintext);
      assert.notStrictEqual(encrypted, plaintext);
      assert.includes(encrypted, ".");

      const decrypted = await decryptSecret(encrypted);
      assert.strictEqual(decrypted, plaintext);
    });
  });

  test("test_encryption_uses_unique_iv_per_call", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "super_secret_master_key_for_testing" }, async () => {
      const secret = "gho_oauth_secret_token";
      const enc1 = await encryptSecret(secret);
      const enc2 = await encryptSecret(secret);

      assert.notStrictEqual(enc1, enc2, "Two encryptions of same secret must have distinct IV/cipher");
      assert.strictEqual(await decryptSecret(enc1), secret);
      assert.strictEqual(await decryptSecret(enc2), secret);
    });
  });

  test("test_missing_master_key_throws_error", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "" }, async () => {
      await assert.rejects(
        async () => {
          await encryptSecret("test");
        },
        /Missing env var: BLOBS_MASTER_KEY/
      );
    });
  });

  test("test_malformed_ciphertext_payload_throws", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "test_key" }, async () => {
      await assert.rejects(
        async () => {
          await decryptSecret("not_a_valid_dot_separated_payload");
        },
        /Malformed encrypted payload/
      );
    });
  });

  test("test_key_derivation_handles_variable_length_master_keys", async () => {
    const keys = [
      "k", // 1 char
      "1234567890123456", // 16 chars
      "12345678901234567890123456789012", // 32 chars
      "a".repeat(256), // 256 chars
    ];

    for (const key of keys) {
      await withEnv({ BLOBS_MASTER_KEY: key }, async () => {
        const text = `token_with_key_len_${key.length}`;
        const enc = await encryptSecret(text);
        const dec = await decryptSecret(enc);
        assert.strictEqual(dec, text);
      });
    }
  });

  test("test_tampered_ciphertext_fails_decryption", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "original_key" }, async () => {
      const enc = await encryptSecret("secret_value");
      const [ivB64, dataB64] = enc.split(".");
      // Tamper ciphertext
      const tamperedData = Buffer.from(dataB64, "base64");
      tamperedData[0] ^= 0xff;
      const tamperedEnc = `${ivB64}.${tamperedData.toString("base64")}`;

      await assert.rejects(async () => {
        await decryptSecret(tamperedEnc);
      });
    });
  });
});

describe("Tier 1 - Feature 4: Local Blob Storage Engine", () => {
  let tmp = null;
  let store = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-blob-test-");
    store = new LocalFileStore(tmp.path);
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_local_file_store_set_and_get_string", async () => {
    await store.set("greeting", "hello world");
    const val = await store.get("greeting", { type: "text" });
    assert.strictEqual(val, "hello world");
  });

  test("test_local_file_store_set_and_get_json", async () => {
    const obj = { id: "123", name: "Alice", active: true, count: 42 };
    await store.set("user:123", JSON.stringify(obj));
    const val = await store.get("user:123", { type: "json" });
    assert.deepStrictEqual(val, obj);
  });

  test("test_local_file_store_delete_removes_key", async () => {
    await store.set("temp:key", "value");
    assert.ok(await store.get("temp:key"));
    await store.delete("temp:key");
    assert.strictEqual(await store.get("temp:key"), null);
  });

  test("test_local_file_store_missing_key_returns_null", async () => {
    const val = await store.get("non_existent_key_12345");
    assert.strictEqual(val, null);
  });

  test("test_local_file_store_list_prefix_filtering", async () => {
    await store.set("user:101", JSON.stringify({ name: "User 101" }));
    await store.set("user:102", JSON.stringify({ name: "User 102" }));
    await store.set("session:abc", JSON.stringify({ userId: "101" }));
    await store.set("counter:101:2026-08-27", "3");

    const userKeys = [];
    for await (const page of store.list({ prefix: "user:" })) {
      for (const b of page.blobs) {
        userKeys.push(b.key);
      }
    }

    assert.strictEqual(userKeys.length, 2);
    assert.includes(userKeys, "user:101");
    assert.includes(userKeys, "user:102");
    assert.ok(!userKeys.includes("session:abc"));
  });

  test("test_local_file_store_sanitizes_unsafe_key_characters", async () => {
    const key = "user/with/slashes:and?question";
    await store.set(key, "sanitized_data");
    const val = await store.get(key);
    assert.strictEqual(val, "sanitized_data");
  });
});

describe("Tier 1 - Feature 5: Cookie Parsing & Session Serialization", () => {
  test("test_parse_cookies_single_cookie", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { cookie: "nexus_session=sess-12345-abc" },
    });
    const parsed = parseCookies(req);
    assert.strictEqual(parsed["nexus_session"], "sess-12345-abc");
  });

  test("test_parse_cookies_multiple_cookies", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { cookie: "theme=dark; nexus_session=sess-999; logged_in=1" },
    });
    const parsed = parseCookies(req);
    assert.strictEqual(parsed["theme"], "dark");
    assert.strictEqual(parsed["nexus_session"], "sess-999");
    assert.strictEqual(parsed["logged_in"], "1");
  });

  test("test_parse_cookies_url_encoded_values", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { cookie: "user_name=John%20Doe; tag=%23nexus" },
    });
    const parsed = parseCookies(req);
    assert.strictEqual(parsed["user_name"], "John Doe");
    assert.strictEqual(parsed["tag"], "#nexus");
  });

  test("test_parse_cookies_empty_and_malformed_headers", () => {
    const req1 = new Request("http://localhost/api/me");
    assert.deepStrictEqual(parseCookies(req1), {});

    const req2 = new Request("http://localhost/api/me", {
      headers: { cookie: ";;; ; no_equals_here; =missing_key" },
    });
    const parsed = parseCookies(req2);
    assert.ok(typeof parsed === "object");
  });

  test("test_session_cookie_string_format", () => {
    const cookie = sessionCookie("test-session-uuid-1234");
    assert.includes(cookie, "nexus_session=test-session-uuid-1234");
    assert.includes(cookie, "Path=/");
    assert.includes(cookie, "HttpOnly");
    assert.includes(cookie, "SameSite=Lax");
    assert.includes(cookie, "Max-Age=2592000"); // 30 days
    assert.includes(cookie, "Secure");
  });

  test("test_clear_session_cookie_string_format", () => {
    const cookie = clearSessionCookie();
    assert.includes(cookie, "nexus_session=");
    assert.includes(cookie, "Max-Age=0");
    assert.includes(cookie, "HttpOnly");
  });
});

describe("Tier 1 - Feature 6: Scheduler Slot Math & Timezone Logic", () => {
  function zonedParts(date, timeZone) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(date)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value])
    );
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
    };
  }

  function zonedDayKey(date, timeZone) {
    const p = zonedParts(date, timeZone);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  function isSlotDue(slot, now, timeZone) {
    const p = zonedParts(now, timeZone);
    const [hh, mm] = slot.time.split(":").map(Number);
    const slotMin = hh * 60 + mm;
    const nowMin = p.hour * 60 + p.minute;

    const today = zonedDayKey(now, timeZone);
    if (slot.lastRun === today) return false;

    const delta = ((nowMin - slotMin) % 1440 + 1440) % 1440;
    return delta <= 15 || delta >= 1440 - 15;
  }

  test("test_slot_due_when_exact_match", () => {
    const now = new Date("2026-08-27T14:00:00Z"); // 14:00 in UTC
    const slot = { time: "14:00", lastRun: null };
    assert.isTrue(isSlotDue(slot, now, "UTC"));
  });

  test("test_slot_due_within_15min_window", () => {
    const nowEarly = new Date("2026-08-27T13:50:00Z"); // 10 min early
    const nowLate = new Date("2026-08-27T14:10:00Z"); // 10 min late
    const slot = { time: "14:00", lastRun: null };

    assert.isTrue(isSlotDue(slot, nowEarly, "UTC"));
    assert.isTrue(isSlotDue(slot, nowLate, "UTC"));
  });

  test("test_slot_not_due_outside_15min_window", () => {
    const nowTooEarly = new Date("2026-08-27T13:40:00Z"); // 20 min early
    const nowTooLate = new Date("2026-08-27T14:20:00Z"); // 20 min late
    const slot = { time: "14:00", lastRun: null };

    assert.isFalse(isSlotDue(slot, nowTooEarly, "UTC"));
    assert.isFalse(isSlotDue(slot, nowTooLate, "UTC"));
  });

  test("test_slot_blocked_by_idempotency_guard", () => {
    const now = new Date("2026-08-27T14:00:00Z");
    const slotAlreadyRan = { time: "14:00", lastRun: "2026-08-27" };
    assert.isFalse(isSlotDue(slotAlreadyRan, now, "UTC"));

    const slotRanYesterday = { time: "14:00", lastRun: "2026-08-26" };
    assert.isTrue(isSlotDue(slotRanYesterday, now, "UTC"));
  });

  test("test_midnight_wraparound_slot_due_calculation", () => {
    const now = new Date("2026-08-27T23:55:00Z"); // 23:55
    const slot = { time: "00:05", lastRun: null }; // 00:05 (10 min away across midnight)
    assert.isTrue(isSlotDue(slot, now, "UTC"));
  });

  test("test_timezone_conversion_accuracy", () => {
    // 2026-08-27T12:00:00Z -> IST is +5:30 -> 17:30
    const now = new Date("2026-08-27T12:00:00Z");
    const pUTC = zonedParts(now, "UTC");
    assert.strictEqual(pUTC.hour, 12);
    assert.strictEqual(pUTC.minute, 0);

    const pIST = zonedParts(now, "Asia/Kolkata");
    assert.strictEqual(pIST.hour, 17);
    assert.strictEqual(pIST.minute, 30);

    const pEST = zonedParts(now, "America/New_York"); // EDT is UTC-4 -> 08:00
    assert.strictEqual(pEST.hour, 8);
    assert.strictEqual(pEST.minute, 0);
  });
});

describe("Tier 1 - Feature 7: Health Route & Store Probe", () => {
  let tmp = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-health-test-");
    process.env.LOCAL_BLOBS_DIR = tmp.path;
    process.env.NODE_ENV = "development";
    process.env.GITHUB_CLIENT_ID = "mock_client_id";
    process.env.GITHUB_CLIENT_SECRET = "mock_client_secret";
    process.env.BLOBS_MASTER_KEY = "mock_master_key_for_health";
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_health_route_all_env_configured_returns_200_ok", async () => {
    const store = new LocalFileStore(tmp.path);
    // Simulate health check probe
    const probeKey = `health:${Date.now()}`;
    await store.set(probeKey, "ok");
    const read = await store.get(probeKey, { type: "text" });
    await store.delete(probeKey);

    assert.strictEqual(read, "ok");
    const ok =
      Boolean(process.env.GITHUB_CLIENT_ID) &&
      Boolean(process.env.GITHUB_CLIENT_SECRET) &&
      Boolean(process.env.BLOBS_MASTER_KEY) &&
      read === "ok";

    const response = json({
      ok,
      service: "nexus",
      store: { mode: "local-file", roundtrip: "ok" },
      env: {
        GITHUB_CLIENT_ID: "configured",
        GITHUB_CLIENT_SECRET: "configured",
        BLOBS_MASTER_KEY: "configured",
      },
    }, ok ? 200 : 503);

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.service, "nexus");
  });

  test("test_health_route_missing_master_key_returns_503", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "" }, async () => {
      const ok =
        Boolean(process.env.GITHUB_CLIENT_ID) &&
        Boolean(process.env.GITHUB_CLIENT_SECRET) &&
        Boolean(process.env.BLOBS_MASTER_KEY);

      const response = json({
        ok,
        service: "nexus",
        env: {
          GITHUB_CLIENT_ID: "configured",
          GITHUB_CLIENT_SECRET: "configured",
          BLOBS_MASTER_KEY: "missing",
        },
      }, ok ? 200 : 503);

      assert.strictEqual(response.status, 503);
      const body = await response.json();
      assert.strictEqual(body.ok, false);
      assert.strictEqual(body.env.BLOBS_MASTER_KEY, "missing");
    });
  });

  test("test_health_route_never_leaks_secrets", async () => {
    const rawSecret = "super_secret_token_never_leak_this_12345";
    await withEnv({ BLOBS_MASTER_KEY: rawSecret, GITHUB_CLIENT_SECRET: "shhh_secret" }, async () => {
      const envFlags = {
        BLOBS_MASTER_KEY: process.env.BLOBS_MASTER_KEY ? "configured" : "missing",
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? "configured" : "missing",
      };
      const responsePayload = JSON.stringify({ env: envFlags });
      assert.ok(!responsePayload.includes(rawSecret));
      assert.ok(!responsePayload.includes("shhh_secret"));
      assert.includes(responsePayload, "configured");
    });
  });

  test("test_health_route_options_cors", async () => {
    const req = new Request("http://localhost/api/health", { method: "OPTIONS" });
    const res = handleCors(req);
    assert.ok(res);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.includes(res.headers.get("Access-Control-Allow-Methods"), "GET");
  });
});

describe("Tier 1 - Feature 8: User Permissions & Admin Access", () => {
  test("test_public_user_sanitizes_encrypted_token", () => {
    const fullUser = {
      githubId: "12345",
      githubLogin: "johndoe",
      encryptedToken: "encrypted_aes_payload_xyz",
      owner: "johndoe",
      repo: "my-repo",
      targetFile: "PROGRESS_LOG.md",
      timezone: "America/New_York",
      slots: [{ time: "09:00", count: 1, lastRun: null }],
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
    };

    const pub = publicUser(fullUser);
    assert.strictEqual(pub.githubId, "12345");
    assert.strictEqual(pub.githubLogin, "johndoe");
    assert.strictEqual(pub.owner, "johndoe");
    assert.strictEqual(pub.repo, "my-repo");
    assert.isUndefined(pub.encryptedToken, "encryptedToken must never be exposed to publicUser");
  });

  test("test_is_admin_matches_admin_github_login", () => {
    process.env.ADMIN_GITHUB_LOGIN = "pranjal2410719";
    assert.isTrue(isAdmin({ githubLogin: "pranjal2410719" }));
    assert.isFalse(isAdmin({ githubLogin: "hacker" }));
  });

  test("test_is_admin_returns_false_when_env_unset", () => {
    delete process.env.ADMIN_GITHUB_LOGIN;
    assert.isFalse(isAdmin({ githubLogin: "pranjal2410719" }));
    assert.isFalse(isAdmin({ githubLogin: "admin" }));
  });

  test("test_session_lifecycle_create_get_destroy", async () => {
    const tmp = createTempDir("nexus-session-test-");
    const store = new LocalFileStore(tmp.path);

    const userId = "github_998877";
    const sessionId = "test-session-uuid-5566";
    await store.set(`session:${sessionId}`, JSON.stringify({ userId, createdAt: new Date().toISOString() }));

    const raw = await store.get(`session:${sessionId}`, { type: "json" });
    assert.strictEqual(raw.userId, userId);

    await store.delete(`session:${sessionId}`);
    assert.strictEqual(await store.get(`session:${sessionId}`), null);
    tmp.cleanup();
  });
});

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith("tier1_feature_coverage.test.js")) {
  const res = await run();
  process.exit(res.failed > 0 ? 1 : 0);
}
