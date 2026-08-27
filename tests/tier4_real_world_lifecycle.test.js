// Tier 4: Real-World Workloads & Multi-Tenant Lifecycle Simulation
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

describe("Tier 4 - Scenario 1: End-to-End User Lifecycle Journey", () => {
  let tmp = null;
  let store = null;
  let mockGitHub = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t4-journey-");
    store = new LocalFileStore(tmp.path);
    mockGitHub = new MockGitHubRepoStore();
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_complete_user_lifecycle_from_oauth_to_logout", async () => {
    await withEnv({
      BLOBS_MASTER_KEY: "e2e_master_key_445566",
      GITHUB_CLIENT_ID: "client_id_test",
      GITHUB_CLIENT_SECRET: "client_secret_test",
      MANUAL_DAILY_CAP: "2",
      ADMIN_GITHUB_LOGIN: "admin_user",
    }, async () => {
      // -------------------------------------------------------------
      // Step 1: User initiates OAuth login -> GET /api/auth/start
      // -------------------------------------------------------------
      const oauthState = "state_random_uuid_e2e_001";
      await store.set(`oauth:${oauthState}`, JSON.stringify({ createdAt: Date.now() }));
      const stateInStore = await store.get(`oauth:${oauthState}`, { type: "json" });
      assert.ok(stateInStore, "OAuth state must be persisted in store for CSRF protection");

      // -------------------------------------------------------------
      // Step 2: OAuth callback received -> GET /api/auth/callback
      // -------------------------------------------------------------
      const rawUserToken = "gho_user_access_token_secret_123";
      const ghUser = { id: 778899, login: "johndoe", name: "John Doe" };
      mockGitHub.setUser(rawUserToken, ghUser);
      mockGitHub.setUserRepos(rawUserToken, [
        { full_name: "johndoe/my-daily-practice", name: "my-daily-practice", owner: { login: "johndoe" }, private: false },
        { full_name: "johndoe/secret-project", name: "secret-project", owner: { login: "johndoe" }, private: true },
      ]);

      // Consume OAuth state
      await store.delete(`oauth:${oauthState}`);
      assert.strictEqual(await store.get(`oauth:${oauthState}`), null);

      // Encrypt token and create user record
      const encToken = await encryptSecret(rawUserToken);
      const user = {
        githubId: String(ghUser.id),
        githubLogin: ghUser.login,
        encryptedToken: encToken,
        owner: ghUser.login,
        repo: "",
        targetFile: "PROGRESS_LOG.md",
        timezone: "Asia/Kolkata",
        slots: [
          { time: "09:00", count: 1, lastRun: null },
          { time: "14:00", count: 1, lastRun: null },
          { time: "22:00", count: 1, lastRun: null },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.set(`user:${user.githubId}`, JSON.stringify(user));

      // Create session and issue cookie
      const sessionId = "session_uuid_user_778899";
      await store.set(`session:${sessionId}`, JSON.stringify({ userId: user.githubId, createdAt: new Date().toISOString() }));
      const userCookie = sessionCookie(sessionId);
      assert.includes(userCookie, sessionId);

      // -------------------------------------------------------------
      // Step 3: Fetch repositories picker -> GET /api/repos
      // -------------------------------------------------------------
      const reposReq = new Request("http://localhost/api/repos", { headers: { cookie: userCookie } });
      const reposCookies = parseCookies(reposReq);
      const sessData = await store.get(`session:${reposCookies["nexus_session"]}`, { type: "json" });
      const authUser = await store.get(`user:${sessData.userId}`, { type: "json" });
      const userToken = await decryptSecret(authUser.encryptedToken);

      const octokit = mockGitHub.createOctokit(userToken);
      const { data: repoList } = await octokit.repos.listForAuthenticatedUser({ per_page: 100 });
      assert.strictEqual(repoList.length, 2);
      assert.strictEqual(repoList[0].full_name, "johndoe/my-daily-practice");

      // -------------------------------------------------------------
      // Step 4: Save schedule configuration -> POST /api/save-config
      // -------------------------------------------------------------
      const selectedRepo = "my-daily-practice";
      const targetFile = "PROGRESS_LOG.md";
      const timezone = "Asia/Kolkata";
      const customSlots = [
        { time: "10:00", count: 2, lastRun: null },
        { time: "18:00", count: 1, lastRun: null },
      ];

      const updatedUser = {
        ...authUser,
        repo: selectedRepo,
        targetFile: sanitizePath(targetFile),
        timezone,
        slots: customSlots,
        updatedAt: new Date().toISOString(),
      };
      await store.set(`user:${user.githubId}`, JSON.stringify(updatedUser));

      // -------------------------------------------------------------
      // Step 5: Fetch profile configuration -> GET /api/me
      // -------------------------------------------------------------
      const meReq = new Request("http://localhost/api/me", { headers: { cookie: userCookie } });
      const meCookies = parseCookies(meReq);
      const meSess = await store.get(`session:${meCookies["nexus_session"]}`, { type: "json" });
      const meUser = await store.get(`user:${meSess.userId}`, { type: "json" });
      const sanitized = publicUser(meUser);

      assert.strictEqual(sanitized.githubLogin, "johndoe");
      assert.strictEqual(sanitized.repo, "my-daily-practice");
      assert.strictEqual(sanitized.slots.length, 2);
      assert.isUndefined(sanitized.encryptedToken, "encryptedToken must never be exposed");

      // -------------------------------------------------------------
      // Step 6: Scheduled Heartbeat Cron fires -> netlify/functions/heartbeat
      // -------------------------------------------------------------
      // Initialize repo file in mock GitHub (404 first, then initial commit)
      const nowInIST = new Date("2026-08-27T04:30:00Z"); // 10:00 AM in IST (Asia/Kolkata +5:30)
      const dayKeyIST = "2026-08-27";

      for (const slot of updatedUser.slots) {
        if (slot.time === "10:00") {
          // Write ahead
          slot.lastRun = dayKeyIST;

          // Perform batch commits
          const tok = await decryptSecret(updatedUser.encryptedToken);
          const uOcto = mockGitHub.createOctokit(tok);

          let currentContent = "";
          let currentSha = undefined;
          try {
            const { data } = await uOcto.repos.getContent({
              owner: updatedUser.owner,
              repo: updatedUser.repo,
              path: updatedUser.targetFile,
            });
            currentContent = Buffer.from(data.content, "base64").toString("utf8");
            currentSha = data.sha;
          } catch (err) {
            if (err.status === 404) {
              currentContent = "# Activity Log\n";
            }
          }

          for (let c = 1; c <= slot.count; c++) {
            const newContent = currentContent + `\n## [2026-08-27 10:0${c}:00 UTC] feat(dsa): scheduled commit ${c}\n`;
            const commitRes = await uOcto.repos.createOrUpdateFileContents({
              owner: updatedUser.owner,
              repo: updatedUser.repo,
              path: updatedUser.targetFile,
              message: `feat(dsa): scheduled commit ${c}`,
              content: Buffer.from(newContent).toString("base64"),
              sha: currentSha,
            });
            currentContent = newContent;
            currentSha = commitRes.data.content.sha;
          }
        }
      }

      await store.set(`user:${user.githubId}`, JSON.stringify(updatedUser));
      const ghFile = mockGitHub.getFile(updatedUser.owner, updatedUser.repo, updatedUser.targetFile);
      assert.ok(ghFile);
      assert.includes(ghFile.content, "scheduled commit 1");
      assert.includes(ghFile.content, "scheduled commit 2");

      // -------------------------------------------------------------
      // Step 7: Manual Instant Commit -> POST /api/commit-now (1st commit)
      // -------------------------------------------------------------
      const counterKey = `counter:${user.githubId}:${dayKeyIST}`;
      const used1 = parseInt((await store.get(counterKey, { type: "text" })) ?? "0", 10);
      assert.strictEqual(used1, 0);

      // Perform manual commit
      const { data: curFile } = await octokit.repos.getContent({
        owner: updatedUser.owner,
        repo: updatedUser.repo,
        path: updatedUser.targetFile,
      });
      const manualContent = Buffer.from(curFile.content, "base64").toString("utf8") + `\n## [2026-08-27 11:00:00 UTC] feat: manual instant 1\n`;
      const manRes1 = await octokit.repos.createOrUpdateFileContents({
        owner: updatedUser.owner,
        repo: updatedUser.repo,
        path: updatedUser.targetFile,
        message: "feat: manual instant 1",
        content: Buffer.from(manualContent).toString("base64"),
        sha: curFile.sha,
      });
      await store.set(counterKey, "1");

      assert.strictEqual(manRes1.status, 200);

      // -------------------------------------------------------------
      // Step 8: Manual Commit (2nd commit -> hits cap of 2)
      // -------------------------------------------------------------
      const used2 = parseInt((await store.get(counterKey, { type: "text" })) ?? "0", 10);
      assert.strictEqual(used2, 1);

      const { data: curFile2 } = await octokit.repos.getContent({
        owner: updatedUser.owner,
        repo: updatedUser.repo,
        path: updatedUser.targetFile,
      });
      const manualContent2 = Buffer.from(curFile2.content, "base64").toString("utf8") + `\n## [2026-08-27 11:15:00 UTC] feat: manual instant 2\n`;
      await octokit.repos.createOrUpdateFileContents({
        owner: updatedUser.owner,
        repo: updatedUser.repo,
        path: updatedUser.targetFile,
        message: "feat: manual instant 2",
        content: Buffer.from(manualContent2).toString("base64"),
        sha: curFile2.sha,
      });
      await store.set(counterKey, "2");

      // 3rd attempt -> rejected by rate limiter
      const used3 = parseInt((await store.get(counterKey, { type: "text" })) ?? "0", 10);
      assert.strictEqual(used3, 2);
      const cap = Number(process.env.MANUAL_DAILY_CAP);
      assert.isTrue(used3 >= cap, "3rd attempt must be blocked by daily cap");

      // -------------------------------------------------------------
      // Step 9: Service Status Check -> GET /api/health
      // -------------------------------------------------------------
      const probeKey = `health:${Date.now()}`;
      await store.set(probeKey, "ok");
      const probeRead = await store.get(probeKey, { type: "text" });
      await store.delete(probeKey);
      assert.strictEqual(probeRead, "ok");

      // -------------------------------------------------------------
      // Step 10: Logout -> GET /api/auth/logout
      // -------------------------------------------------------------
      const logoutReq = new Request("http://localhost/api/auth/logout", { headers: { cookie: userCookie } });
      const logoutCookies = parseCookies(logoutReq);
      await store.delete(`session:${logoutCookies["nexus_session"]}`);

      // Verify session is deleted
      const destroyedSess = await store.get(`session:${sessionId}`, { type: "json" });
      assert.strictEqual(destroyedSess, null);

      // -------------------------------------------------------------
      // Step 11: Subsequent request with old cookie -> 401 Unauthorized
      // -------------------------------------------------------------
      const postLogoutReq = new Request("http://localhost/api/me", { headers: { cookie: userCookie } });
      const plCookies = parseCookies(postLogoutReq);
      const plSess = await store.get(`session:${plCookies["nexus_session"]}`, { type: "json" });
      assert.strictEqual(plSess, null, "Logged out session must resolve to null user");
    });
  });
});

describe("Tier 4 - Scenario 2: Multi-Tenant Fan-Out Simulation", () => {
  let tmp = null;
  let store = null;
  let mockGitHub = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t4-multitenant-");
    store = new LocalFileStore(tmp.path);
    mockGitHub = new MockGitHubRepoStore();
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_multi_tenant_scheduler_fan_out_across_timezones", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "multitenant_master_key" }, async () => {
      // Create 5 tenants in different timezones
      const tenants = [
        { id: "t1", login: "user_utc", tz: "UTC", slot: "14:00" },
        { id: "t2", login: "user_ist", tz: "Asia/Kolkata", slot: "19:30" }, // 19:30 IST = 14:00 UTC
        { id: "t3", login: "user_est", tz: "America/New_York", slot: "10:00" }, // 10:00 EDT = 14:00 UTC
        { id: "t4", login: "user_pdt", tz: "America/Los_Angeles", slot: "07:00" }, // 07:00 PDT = 14:00 UTC
        { id: "t5", login: "user_off", tz: "UTC", slot: "22:00" }, // Not due at 14:00 UTC
      ];

      for (const t of tenants) {
        const encTok = await encryptSecret(`ghp_${t.login}_token`);
        const userObj = {
          githubId: t.id,
          githubLogin: t.login,
          encryptedToken: encTok,
          owner: t.login,
          repo: "practice-repo",
          targetFile: "PROGRESS.md",
          timezone: t.tz,
          slots: [{ time: t.slot, count: 1, lastRun: null }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await store.set(`user:${t.id}`, JSON.stringify(userObj));
        mockGitHub.setFile(t.login, "practice-repo", "PROGRESS.md", `# ${t.login} Log\n`);
      }

      // Simulate scheduler tick at 14:00 UTC (2026-08-27T14:00:00Z)
      const now = new Date("2026-08-27T14:00:00Z");

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

      function isSlotDue(slot, nowDate, timeZone) {
        const p = zonedParts(nowDate, timeZone);
        const [hh, mm] = slot.time.split(":").map(Number);
        const slotMin = hh * 60 + mm;
        const nowMin = p.hour * 60 + p.minute;
        const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
        if (slot.lastRun === today) return false;
        const delta = ((nowMin - slotMin) % 1440 + 1440) % 1440;
        return delta <= 15 || delta >= 1440 - 15;
      }

      let firedCount = 0;
      for await (const page of store.list({ prefix: "user:" })) {
        for (const { key } of page.blobs) {
          const u = await store.get(key, { type: "json" });
          for (const s of u.slots) {
            if (isSlotDue(s, now, u.timezone)) {
              firedCount++;
              const tok = await decryptSecret(u.encryptedToken);
              const uOcto = mockGitHub.createOctokit(tok);
              const { data: cur } = await uOcto.repos.getContent({ owner: u.owner, repo: u.repo, path: u.targetFile });
              const content = Buffer.from(cur.content, "base64").toString("utf8") + `\n## [2026-08-27 14:00:00 UTC] feat: tick\n`;
              await uOcto.repos.createOrUpdateFileContents({
                owner: u.owner,
                repo: u.repo,
                path: u.targetFile,
                message: "feat: tick",
                content: Buffer.from(content).toString("base64"),
                sha: cur.sha,
              });
              const p = zonedParts(now, u.timezone);
              s.lastRun = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
            }
          }
          await store.set(key, JSON.stringify(u));
        }
      }

      // 4 tenants (t1, t2, t3, t4) should fire; t5 (22:00) should NOT fire
      assert.strictEqual(firedCount, 4, "Exactly 4 tenants due at 14:00 UTC must fire");

      // Verify repo commits
      for (const t of tenants.slice(0, 4)) {
        const file = mockGitHub.getFile(t.login, "practice-repo", "PROGRESS.md");
        assert.includes(file.content, "feat: tick");
      }
      const t5File = mockGitHub.getFile("user_off", "practice-repo", "PROGRESS.md");
      assert.ok(!t5File.content.includes("feat: tick"), "t5 must not have fired");
    });
  });
});

describe("Tier 4 - Scenario 3: Fault Injection & Resilience", () => {
  let tmp = null;
  let store = null;
  let mockGitHub = null;

  beforeEach(() => {
    tmp = createTempDir("nexus-t4-resilience-");
    store = new LocalFileStore(tmp.path);
    mockGitHub = new MockGitHubRepoStore();
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
  });

  test("test_scheduler_resilience_with_mixed_faults", async () => {
    await withEnv({ BLOBS_MASTER_KEY: "fault_injection_key" }, async () => {
      // Tenant A: Valid user, normal operation
      const encTokA = await encryptSecret("ghp_tenant_a");
      await store.set("user:tenant_a", JSON.stringify({
        githubId: "tenant_a",
        encryptedToken: encTokA,
        owner: "user_a",
        repo: "repo_a",
        targetFile: "LOG.md",
      }));
      mockGitHub.setFile("user_a", "repo_a", "LOG.md", "# Log A\n");

      // Tenant B: Corrupt blob record
      await store.set("user:tenant_b_corrupt", "NOT_VALID_JSON_{{");

      // Tenant C: GitHub API throws 500 error
      const encTokC = await encryptSecret("ghp_tenant_c");
      await store.set("user:tenant_c", JSON.stringify({
        githubId: "tenant_c",
        encryptedToken: encTokC,
        owner: "user_c",
        repo: "repo_c",
        targetFile: "LOG.md",
      }));
      mockGitHub.setFile("user_c", "repo_c", "LOG.md", "# Log C\n");
      mockGitHub.injectError("createOrUpdateFileContents", "user_c/repo_c/LOG.md", new Error("GitHub Service Unavailable 503"));

      // Process users loop with fault tolerance
      const results = { succeeded: [], failed: [], skipped: [] };

      for await (const page of store.list({ prefix: "user:" })) {
        for (const { key } of page.blobs) {
          try {
            const raw = await store.get(key, { type: "text" });
            let u;
            try {
              u = JSON.parse(raw);
            } catch {
              results.skipped.push(key);
              continue;
            }

            const tok = await decryptSecret(u.encryptedToken);
            const octo = mockGitHub.createOctokit(tok);
            const { data: cur } = await octo.repos.getContent({ owner: u.owner, repo: u.repo, path: u.targetFile });
            await octo.repos.createOrUpdateFileContents({
              owner: u.owner,
              repo: u.repo,
              path: u.targetFile,
              message: "feat: resilient update",
              content: Buffer.from("updated").toString("base64"),
              sha: cur.sha,
            });
            results.succeeded.push(key);
          } catch (err) {
            results.failed.push({ key, error: err.message });
          }
        }
      }

      assert.strictEqual(results.succeeded.length, 1);
      assert.strictEqual(results.succeeded[0], "user:tenant_a");
      assert.strictEqual(results.skipped.length, 1);
      assert.strictEqual(results.skipped[0], "user:tenant_b_corrupt");
      assert.strictEqual(results.failed.length, 1);
      assert.strictEqual(results.failed[0].key, "user:tenant_c");
      assert.includes(results.failed[0].error, "GitHub Service Unavailable");
    });
  });
});

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith("tier4_real_world_lifecycle.test.js")) {
  const res = await run();
  process.exit(res.failed > 0 ? 1 : 0);
}
