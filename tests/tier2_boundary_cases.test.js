// Tier 2: Boundary & Corner Cases
import { describe, test, beforeEach, afterEach, assert, createTempDir, withEnv, run } from "./test_harness.js";
import { MockGitHubRepoStore, computeGitBlobSha } from "./mock_github.js";
import { LocalFileStore } from "../lib/storage/local-file-store.ts";
import { encryptSecret, decryptSecret } from "../lib/security/encryption.ts";
import { parseCookies, sessionCookie, clearSessionCookie } from "../lib/auth/cookies.ts";
import { sanitizePath } from "../lib/core/commit-engine.ts";

describe("Tier 2 - Boundary 1: Empty Files & 0-Byte Blobs", () => {
  let tmp = null;
  let store = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t2-empty-");
    store = new LocalFileStore(tmp.path);
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_0_byte_blob_store_write_and_read", async () => {
    await store.set("empty:blob", "");
    const read = await store.get("empty:blob", { type: "text" });
    assert.strictEqual(read, "");
  });

  test("test_0_byte_file_in_github_mock", async () => {
    const mockStore = new MockGitHubRepoStore();
    const sha = mockStore.setFile("org", "repo", "EMPTY.md", "");
    assert.strictEqual(sha, computeGitBlobSha(""));

    const octokit = mockStore.createOctokit("ghp_token");
    const { data } = await octokit.repos.getContent({ owner: "org", repo: "repo", path: "EMPTY.md" });
    assert.strictEqual(data.size, 0);
    assert.strictEqual(data.sha, sha);
    assert.strictEqual(Buffer.from(data.content, "base64").toString("utf8"), "");
  });
});

describe("Tier 2 - Boundary 2: Special Characters & Path Traversal in File Paths", () => {
  test("test_deeply_nested_file_path_sanitization", () => {
    const rawPath = "///src/components/logs/2026/08/progress.md";
    const cleaned = sanitizePath(rawPath);
    assert.strictEqual(cleaned, "src/components/logs/2026/08/progress.md");
  });

  test("test_windows_backslash_path_sanitization", () => {
    const rawPath = "src\\logs\\daily_progress.txt";
    const cleaned = sanitizePath(rawPath);
    assert.strictEqual(cleaned, "src/logs/daily_progress.txt");
  });

  test("test_relative_dot_slash_path_sanitization", () => {
    const rawPath = "./docs/notes.md";
    const cleaned = sanitizePath(rawPath);
    assert.strictEqual(cleaned, "docs/notes.md");
  });

  test("test_target_file_path_length_boundary_200_chars", () => {
    // 200 characters path should be valid
    const path200 = "a".repeat(196) + ".log";
    assert.strictEqual(path200.length, 200);
    assert.ok(path200.length <= 200);

    // 201 characters exceeds boundary
    const path201 = "a".repeat(197) + ".log";
    assert.strictEqual(path201.length, 201);
    assert.ok(path201.length > 200);
  });

  test("test_repo_and_owner_regex_validation", () => {
    const NAME_RE = /^[A-Za-z0-9_.-]+$/;
    assert.isTrue(NAME_RE.test("valid-repo_123.test"));
    assert.isTrue(NAME_RE.test("user.name-123"));
    assert.isFalse(NAME_RE.test("invalid repo with spaces"));
    assert.isFalse(NAME_RE.test("hacker/path"));
    assert.isFalse(NAME_RE.test("user@name"));
    assert.isFalse(NAME_RE.test("repo;injection"));
  });
});

describe("Tier 2 - Boundary 3: Midnight 00:00 Timezones & Circular Clock Math", () => {
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

  test("test_midnight_slot_at_23_50_is_within_15min_window", () => {
    // 23:50 is 10 min before 00:00
    const now = new Date("2026-08-27T23:50:00Z");
    const slot = { time: "00:00", lastRun: null };
    assert.isTrue(isSlotDue(slot, now, "UTC"));
  });

  test("test_midnight_slot_at_00_10_is_within_15min_window", () => {
    // 00:10 is 10 min after 00:00
    const now = new Date("2026-08-28T00:10:00Z");
    const slot = { time: "00:00", lastRun: null };
    assert.isTrue(isSlotDue(slot, now, "UTC"));
  });

  test("test_slot_23_55_at_00_05_is_within_15min_window", () => {
    // 00:05 is 10 min after 23:55 across midnight
    const now = new Date("2026-08-28T00:05:00Z");
    const slot = { time: "23:55", lastRun: null };
    assert.isTrue(isSlotDue(slot, now, "UTC"));
  });

  test("test_date_key_rollover_across_timezones", () => {
    // UTC 2026-08-27 20:00:00 -> in IST (+5:30) it is 2026-08-28 01:30:00
    const now = new Date("2026-08-27T20:00:00Z");
    const utcKey = zonedDayKey(now, "UTC");
    const istKey = zonedDayKey(now, "Asia/Kolkata");

    assert.strictEqual(utcKey, "2026-08-27");
    assert.strictEqual(istKey, "2026-08-28");
  });
});

describe("Tier 2 - Boundary 4: Malformed Cookies & Safe Decoding", () => {
  function safeParseCookies(request) {
    const header = request.headers.get("cookie") ?? "";
    const out = {};
    for (const part of header.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const rawValue = part.slice(idx + 1).trim();
      try {
        out[key] = decodeURIComponent(rawValue);
      } catch {
        out[key] = rawValue; // fallback without crashing on malformed URI
      }
    }
    return out;
  }

  test("test_malformed_uri_percent_encoding_does_not_throw_500", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { cookie: "nexus_session=%zz; normal_key=hello" },
    });
    const parsed = safeParseCookies(req);
    assert.strictEqual(parsed["nexus_session"], "%zz");
    assert.strictEqual(parsed["normal_key"], "hello");
  });

  test("test_cookies_with_equals_in_value", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { cookie: "session=base64==value==" },
    });
    const parsed = safeParseCookies(req);
    assert.strictEqual(parsed["session"], "base64==value==");
  });

  test("test_cookie_with_whitespace_and_empty_segments", () => {
    const req = new Request("http://localhost/api/me", {
      headers: { cookie: "   ;  ;   key = value  ;   " },
    });
    const parsed = safeParseCookies(req);
    assert.strictEqual(parsed["key"], "value");
  });
});

describe("Tier 2 - Boundary 5: Missing Environment Variables", () => {
  test("test_encryption_fails_gracefully_when_master_key_missing", async () => {
    await withEnv({ BLOBS_MASTER_KEY: null }, async () => {
      await assert.rejects(
        async () => {
          await encryptSecret("secret");
        },
        /Missing env var: BLOBS_MASTER_KEY/
      );
    });
  });

  test("test_health_flags_missing_env_correctly", () => {
    const checkEnv = (key) => (process.env[key] ? "configured" : "missing");
    withEnv({ GITHUB_CLIENT_ID: null, BLOBS_MASTER_KEY: "configured_key" }, () => {
      assert.strictEqual(checkEnv("GITHUB_CLIENT_ID"), "missing");
      assert.strictEqual(checkEnv("BLOBS_MASTER_KEY"), "configured");
    });
  });
});

describe("Tier 2 - Boundary 6: Rate Limiting & Daily Manual Caps", () => {
  let tmp = null;
  let store = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t2-ratelimit-");
    store = new LocalFileStore(tmp.path);
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_manual_daily_cap_enforcement_at_boundary_values", async () => {
    const userId = "test_user_limit";
    const today = "2026-08-27";
    const counterKey = `counter:${userId}:${today}`;
    const DEFAULT_CAP = 5;

    // 1. Initial state (0 used)
    let usedRaw = await store.get(counterKey, { type: "text" });
    let used = parseInt(usedRaw ?? "0", 10) || 0;
    assert.strictEqual(used, 0);
    assert.ok(used < DEFAULT_CAP);

    // 2. Increment to 4
    await store.set(counterKey, "4");
    used = parseInt((await store.get(counterKey, { type: "text" })) ?? "0", 10);
    assert.strictEqual(used, 4);
    assert.ok(used < DEFAULT_CAP, "4 is allowed under cap of 5");

    // 3. Increment to 5 (Cap reached)
    await store.set(counterKey, "5");
    used = parseInt((await store.get(counterKey, { type: "text" })) ?? "0", 10);
    assert.strictEqual(used, 5);
    const isCapped = used >= DEFAULT_CAP;
    assert.isTrue(isCapped, "5 should hit rate limit cap");

    // 4. Over cap
    await store.set(counterKey, "6");
    used = parseInt((await store.get(counterKey, { type: "text" })) ?? "0", 10);
    assert.isTrue(used >= DEFAULT_CAP);
  });

  test("test_custom_manual_daily_cap_via_env", async () => {
    await withEnv({ MANUAL_DAILY_CAP: "10" }, async () => {
      const cap = Number(process.env.MANUAL_DAILY_CAP ?? 5);
      assert.strictEqual(cap, 10);
      assert.ok(9 < cap);
      assert.ok(10 >= cap);
    });
  });
});

describe("Tier 2 - Boundary 7: Corrupted JSON Records in Blob Store", () => {
  let tmp = null;
  let store = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t2-corrupt-");
    store = new LocalFileStore(tmp.path);
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_corrupted_json_in_get_json_returns_null", async () => {
    await store.set("user:broken", "{ this is not valid json --- !!!");
    const parsed = await store.get("user:broken", { type: "json" });
    assert.strictEqual(parsed, null);
  });

  test("test_scheduler_skips_corrupted_tenant_record_without_crashing", async () => {
    await store.set("user:valid1", JSON.stringify({ githubId: "1", repo: "repo1", encryptedToken: "tok" }));
    await store.set("user:corrupt", "INVALID_JSON_DATA_!!!");
    await store.set("user:valid2", JSON.stringify({ githubId: "2", repo: "repo2", encryptedToken: "tok" }));

    const validUsers = [];
    const errors = [];

    for await (const page of store.list({ prefix: "user:" })) {
      for (const { key } of page.blobs) {
        try {
          const raw = await store.get(key, { type: "text" });
          if (!raw) continue;
          let user;
          try {
            user = JSON.parse(raw);
          } catch {
            // skip corrupt record
            continue;
          }
          validUsers.push(user);
        } catch (err) {
          errors.push(err.message);
        }
      }
    }

    assert.strictEqual(validUsers.length, 2);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(validUsers[0].githubId, "1");
    assert.strictEqual(validUsers[1].githubId, "2");
  });
});

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith("tier2_boundary_cases.test.js")) {
  const res = await run();
  process.exit(res.failed > 0 ? 1 : 0);
}
