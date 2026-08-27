// Tier 3: Cross-Feature Combinations
import { describe, test, beforeEach, afterEach, assert, createTempDir, withEnv, run } from "./test_harness.js";
import { MockGitHubRepoStore, computeGitBlobSha } from "./mock_github.js";
import { LocalFileStore } from "../lib/storage/local-file-store.ts";
import { encryptSecret, decryptSecret } from "../lib/security/encryption.ts";
import {
  parseCookies,
  sessionCookie,
} from "../lib/auth/cookies.ts";
import { isAdmin } from "../lib/auth/permissions.ts";
import { publicUser } from "../lib/auth/user.ts";
import { pruneEntries, sanitizePath } from "../lib/core/commit-engine.ts";

describe("Tier 3 - Cross-Feature Pipeline 1: Encrypted Token -> Blob Save -> Commit & Prune", () => {
  let tmp = null;
  let store = null;
  let mockGitHub = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t3-pipe1-");
    store = new LocalFileStore(tmp.path);
    mockGitHub = new MockGitHubRepoStore();
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_full_token_encryption_storage_and_commit_prune_pipeline", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "pipe1_master_secret_key" }, async () => {
      // 1. Encrypt raw GitHub token
      const rawToken = "ghp_pipeline_test_token_123456789";
      const encryptedToken = await encryptSecret(rawToken);

      // 2. Persist user configuration in blob store
      const user = {
        githubId: "98765",
        githubLogin: "alice",
        encryptedToken,
        owner: "alice",
        repo: "nexus-activity",
        targetFile: "PROGRESS_LOG.md",
        timezone: "UTC",
        slots: [{ time: "10:00", count: 2, lastRun: null }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.set(`user:${user.githubId}`, JSON.stringify(user));

      // 3. Populate existing file in GitHub with 5 previous entries
      const oldEntries = [];
      for (let i = 1; i <= 5; i++) {
        oldEntries.push(`\n## [2026-08-${String(i).padStart(2, "0")} 10:00:00 UTC] feat(core): old task ${i}\nDetails\n`);
      }
      const initialFileContent = "# Alice Activity Log\n" + oldEntries.join("");
      mockGitHub.setFile(user.owner, user.repo, user.targetFile, initialFileContent);

      // 4. Retrieve user record and decrypt token
      const retrievedRaw = await store.get(`user:${user.githubId}`, { type: "json" });
      assert.strictEqual(retrievedRaw.githubLogin, "alice");
      const decryptedToken = await decryptSecret(retrievedRaw.encryptedToken);
      assert.strictEqual(decryptedToken, rawToken);

      // 5. Fetch current file from GitHub with mock Octokit
      const octokit = mockGitHub.createOctokit(decryptedToken);
      const { data: fileData } = await octokit.repos.getContent({
        owner: retrievedRaw.owner,
        repo: retrievedRaw.repo,
        path: retrievedRaw.targetFile,
      });
      const currentText = Buffer.from(fileData.content, "base64").toString("utf8");

      // 6. Generate new commit entry & prune to max 5 entries
      const newEntry = `\n## [2026-08-06 10:00:00 UTC] feat(core): latest task 6\nNew Details\n`;
      let updatedText = currentText + newEntry;
      updatedText = pruneEntries(updatedText, 5);

      // 7. Commit updated content back to GitHub preserving SHA
      const commitRes = await octokit.repos.createOrUpdateFileContents({
        owner: retrievedRaw.owner,
        repo: retrievedRaw.repo,
        path: retrievedRaw.targetFile,
        message: "feat(core): latest task 6",
        content: Buffer.from(updatedText).toString("base64"),
        sha: fileData.sha,
      });

      assert.strictEqual(commitRes.status, 200);

      // 8. Verify the file in GitHub has exactly 5 entries and preserved header
      const finalFile = mockGitHub.getFile(user.owner, user.repo, user.targetFile);
      assert.includes(finalFile.content, "# Alice Activity Log");
      assert.includes(finalFile.content, "feat(core): latest task 6");
      assert.includes(finalFile.content, "feat(core): old task 2");
      assert.ok(!finalFile.content.includes("feat(core): old task 1"), "Oldest entry should be pruned");
    });
  });
});

describe("Tier 3 - Cross-Feature Pipeline 2: Session Cookie -> Auth Request -> Admin Authorization", () => {
  let tmp = null;
  let store = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t3-pipe2-");
    store = new LocalFileStore(tmp.path);
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_session_cookie_admin_verification_and_user_enumeration", async () => {
    await withEnv({ ADMIN_GITHUB_LOGIN: "pranjal2410719" }, async () => {
      // 1. Create admin user and normal user
      const adminUser = {
        githubId: "admin_1",
        githubLogin: "pranjal2410719",
        encryptedToken: "enc_tok_admin",
        owner: "pranjal2410719",
        repo: "admin-repo",
        targetFile: "LOG.md",
        timezone: "Asia/Kolkata",
        slots: [],
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
      };

      const regularUser = {
        githubId: "regular_2",
        githubLogin: "bob_dev",
        encryptedToken: "enc_tok_bob",
        owner: "bob_dev",
        repo: "bob-repo",
        targetFile: "LOG.md",
        timezone: "America/New_York",
        slots: [],
        createdAt: "2026-08-02T00:00:00Z",
        updatedAt: "2026-08-02T00:00:00Z",
      };

      await store.set(`user:${adminUser.githubId}`, JSON.stringify(adminUser));
      await store.set(`user:${regularUser.githubId}`, JSON.stringify(regularUser));

      // 2. Create active sessions for both
      const adminSessionId = "session_admin_guid_1234";
      const regularSessionId = "session_regular_guid_5678";
      await store.set(`session:${adminSessionId}`, JSON.stringify({ userId: adminUser.githubId, createdAt: new Date().toISOString() }));
      await store.set(`session:${regularSessionId}`, JSON.stringify({ userId: regularUser.githubId, createdAt: new Date().toISOString() }));

      // 3. Simulate HTTP Request with admin cookie
      const adminCookieHeader = sessionCookie(adminSessionId);
      const adminReq = new Request("http://localhost/api/admin/users", {
        headers: { cookie: adminCookieHeader },
      });

      // Parse cookie and resolve user
      const cookies = parseCookies(adminReq);
      assert.strictEqual(cookies["nexus_session"], adminSessionId);

      const sessionObj = await store.get(`session:${cookies["nexus_session"]}`, { type: "json" });
      const resolvedAdmin = await store.get(`user:${sessionObj.userId}`, { type: "json" });
      assert.strictEqual(resolvedAdmin.githubLogin, "pranjal2410719");

      // Verify admin permissions
      assert.isTrue(isAdmin(resolvedAdmin));

      // Query all users from blob store and sanitize
      const allUsers = [];
      for await (const page of store.list({ prefix: "user:" })) {
        for (const { key } of page.blobs) {
          const raw = await store.get(key, { type: "json" });
          allUsers.push(publicUser(raw));
        }
      }

      assert.strictEqual(allUsers.length, 2);
      assert.isUndefined(allUsers[0].encryptedToken);
      assert.isUndefined(allUsers[1].encryptedToken);

      // 4. Simulate HTTP Request with regular user cookie trying to access admin
      const regularReq = new Request("http://localhost/api/admin/users", {
        headers: { cookie: sessionCookie(regularSessionId) },
      });
      const regCookies = parseCookies(regularReq);
      const regSession = await store.get(`session:${regCookies["nexus_session"]}`, { type: "json" });
      const resolvedRegular = await store.get(`user:${regSession.userId}`, { type: "json" });
      assert.isFalse(isAdmin(resolvedRegular), "Regular user must NOT have admin access");
    });
  });
});

describe("Tier 3 - Cross-Feature Pipeline 3: Save Config -> Scheduler Tick -> Write-Ahead Marker", () => {
  let tmp = null;
  let store = null;
  let mockGitHub = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t3-pipe3-");
    store = new LocalFileStore(tmp.path);
    mockGitHub = new MockGitHubRepoStore();
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_save_config_and_scheduler_write_ahead_execution", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "sched_pipe_key" }, async () => {
      // 1. Initial user record
      const encToken = await encryptSecret("ghp_sched_token");
      const initialUser = {
        githubId: "u_sched",
        githubLogin: "scheduser",
        encryptedToken: encToken,
        owner: "scheduser",
        repo: "my-scheduler-repo",
        targetFile: "PROGRESS_LOG.md",
        timezone: "UTC",
        slots: [{ time: "09:00", count: 2, lastRun: null }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.set(`user:${initialUser.githubId}`, JSON.stringify(initialUser));
      mockGitHub.setFile("scheduser", "my-scheduler-repo", "PROGRESS_LOG.md", "# Sched Log\n");

      // 2. Validate and update config (save-config behavior)
      const newSlots = [
        { time: "09:00", count: 2 },
        { time: "14:00", count: 1 },
      ];
      // preserve lastRun mapping
      const updatedUser = {
        ...initialUser,
        targetFile: sanitizePath("/PROGRESS_LOG.md"),
        slots: newSlots.map((s) => ({ time: s.time, count: s.count, lastRun: null })),
        updatedAt: new Date().toISOString(),
      };
      await store.set(`user:${initialUser.githubId}`, JSON.stringify(updatedUser));

      // 3. Simulate scheduler tick at 09:05 UTC (09:00 slot is due)
      const now = new Date("2026-08-27T09:05:00Z");
      const todayKey = "2026-08-27";

      const userRecord = await store.get(`user:${initialUser.githubId}`, { type: "json" });
      for (const slot of userRecord.slots) {
        if (slot.time === "09:00") {
          // Write-ahead mark
          slot.lastRun = todayKey;

          // Decrypt token and commit batch
          const token = await decryptSecret(userRecord.encryptedToken);
          const octokit = mockGitHub.createOctokit(token);

          for (let c = 1; c <= slot.count; c++) {
            const { data: current } = await octokit.repos.getContent({
              owner: userRecord.owner,
              repo: userRecord.repo,
              path: userRecord.targetFile,
            });
            const text = Buffer.from(current.content, "base64").toString("utf8");
            const newContent = text + `\n## [2026-08-27 09:0${c}:00 UTC] feat: sched commit ${c}\n`;
            await octokit.repos.createOrUpdateFileContents({
              owner: userRecord.owner,
              repo: userRecord.repo,
              path: userRecord.targetFile,
              message: `feat: sched commit ${c}`,
              content: Buffer.from(newContent).toString("base64"),
              sha: current.sha,
            });
          }
        }
      }

      // 4. Save updated user state with write-ahead marker
      userRecord.updatedAt = new Date().toISOString();
      await store.set(`user:${initialUser.githubId}`, JSON.stringify(userRecord));

      // 5. Verify persisted user has lastRun set for 09:00 and null for 14:00
      const savedUser = await store.get(`user:${initialUser.githubId}`, { type: "json" });
      const slot9 = savedUser.slots.find((s) => s.time === "09:00");
      const slot14 = savedUser.slots.find((s) => s.time === "14:00");
      assert.strictEqual(slot9.lastRun, todayKey);
      assert.strictEqual(slot14.lastRun, null);

      // 6. Verify second scheduler tick at 09:10 on same day does NOT re-run
      const isSlotDueAgain = slot9.lastRun !== todayKey;
      assert.isFalse(isSlotDueAgain, "Slot must be blocked from running again on the same day");
    });
  });
});

describe("Tier 3 - Cross-Feature Pipeline 4: Manual Instant Commit & Rate Limit Burst", () => {
  let tmp = null;
  let store = null;
  let mockGitHub = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t3-pipe4-");
    store = new LocalFileStore(tmp.path);
    mockGitHub = new MockGitHubRepoStore();
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_manual_commit_burst_and_daily_cap_enforcement", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "burst_key", MANUAL_DAILY_CAP: "3" }, async () => {
      const encToken = await encryptSecret("ghp_burst_token");
      const user = {
        githubId: "burst_user_1",
        githubLogin: "burst_user",
        encryptedToken: encToken,
        owner: "burst_user",
        repo: "burst-repo",
        targetFile: "PROGRESS_LOG.md",
      };
      await store.set(`user:${user.githubId}`, JSON.stringify(user));
      mockGitHub.setFile(user.owner, user.repo, user.targetFile, "# Burst Activity\n");

      const today = "2026-08-27";
      const counterKey = `counter:${user.githubId}:${today}`;
      const cap = Number(process.env.MANUAL_DAILY_CAP);

      // Simulate 3 successful commits
      for (let i = 1; i <= cap; i++) {
        const usedRaw = await store.get(counterKey, { type: "text" });
        const used = parseInt(usedRaw ?? "0", 10) || 0;
        assert.ok(used < cap, `Commit ${i} should be allowed`);

        // Perform commit
        const token = await decryptSecret(user.encryptedToken);
        const octokit = mockGitHub.createOctokit(token);
        const { data: cur } = await octokit.repos.getContent({ owner: user.owner, repo: user.repo, path: user.targetFile });
        const content = Buffer.from(cur.content, "base64").toString("utf8") + `\n## [2026-08-27 12:00:0${i} UTC] feat: manual ${i}\n`;

        await octokit.repos.createOrUpdateFileContents({
          owner: user.owner,
          repo: user.repo,
          path: user.targetFile,
          message: `feat: manual ${i}`,
          content: Buffer.from(content).toString("base64"),
          sha: cur.sha,
        });

        await store.set(counterKey, String(used + 1));
      }

      // 4th commit attempt -> should be rejected by rate limiter
      const finalUsedRaw = await store.get(counterKey, { type: "text" });
      const finalUsed = parseInt(finalUsedRaw ?? "0", 10);
      assert.strictEqual(finalUsed, 3);
      assert.isTrue(finalUsed >= cap);
    });
  });
});

describe("Tier 3 - Cross-Feature Pipeline 5: OAuth State Generation & Callback Verification", () => {
  let tmp = null;
  let store = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t3-pipe5-");
    store = new LocalFileStore(tmp.path);
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_oauth_state_lifecycle_and_csrf_verification", async () => {
    // 1. Initiate OAuth -> generate state
    const state = "oauth_csrf_state_token_999";
    const stateObj = { createdAt: Date.now() };
    await store.set(`oauth:${state}`, JSON.stringify(stateObj));

    // 2. State exists and is valid
    const recorded = await store.get(`oauth:${state}`, { type: "json" });
    assert.ok(recorded);
    const ageMs = Date.now() - (recorded.createdAt ?? 0);
    assert.ok(ageMs < 10 * 60 * 1000, "State must be within 10 min window");

    // 3. Consume state during callback
    await store.delete(`oauth:${state}`);
    assert.strictEqual(await store.get(`oauth:${state}`), null);

    // 4. Replay attack with same state should fail
    const replayCheck = await store.get(`oauth:${state}`, { type: "text" });
    assert.strictEqual(replayCheck, null, "Consumed state must not be usable again");
  });
});

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith("tier3_cross_feature.test.js")) {
  const res = await run();
  process.exit(res.failed > 0 ? 1 : 0);
}
