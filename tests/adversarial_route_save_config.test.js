/**
 * Adversarial Route Testing for POST /api/save-config
 * Author: Challenger 2 (Empirical Challenger)
 */
process.env.NODE_ENV = "development";
process.env.BLOBS_MASTER_KEY = "test-master-key-adversarial-123456789";

import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

try {
  register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
} catch {
  // if already registered
}

const { POST, OPTIONS } = await import("../app/api/save-config/route.ts");
const { saveUser } = await import("../lib/auth/user.ts");
const { createSession } = await import("../lib/auth/session.ts");
const { SESSION_COOKIE } = await import("../config/constants.ts");

console.log("===============================================================");
console.log("  CHALLENGER 2: ADVERSARIAL ROUTE TEST FOR /api/save-config");
console.log("===============================================================\n");

let passed = 0;
let failed = 0;

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

async function resetTestUser() {
  const testUser = {
    githubId: "998877",
    githubLogin: "challenger_user",
    encryptedToken: "dummy_encrypted",
    owner: "challenger_user",
    repo: "nexus-repo",
    targetFile: "PROGRESS_LOG.md",
    timezone: "UTC",
    slots: [
      { time: "09:00", count: 2, lastRun: "2026-08-27" },
      { time: "18:00", count: 1, lastRun: null },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveUser(testUser);
}

await resetTestUser();
const sessionId = await createSession("998877");
const authCookieHeader = `${SESSION_COOKIE}=${sessionId}`;

function makeRequest(body, options = {}) {
  const method = options.method ?? "POST";
  const headers = {
    "Content-Type": "application/json",
    ...(options.unauthenticated ? {} : { Cookie: authCookieHeader }),
    ...(options.headers ?? {}),
  };

  const reqInit = {
    method,
    headers,
  };

  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    reqInit.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return new Request("http://localhost:3000/api/save-config", reqInit);
}

await asyncTest("OPTIONS returns 204 No Content with CORS headers", async () => {
  const res = await OPTIONS();
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
});

await asyncTest("GET method rejected with 405 Method Not Allowed", async () => {
  const req = makeRequest(null, { method: "GET" });
  const res = await POST(req);
  assert.strictEqual(res.status, 405);
  const data = await res.json();
  assert.ok(data.error.includes("Method not allowed"));
});

await asyncTest("Unauthenticated request rejected with 401 Unauthorized", async () => {
  const req = makeRequest({ owner: "challenger_user", repo: "nexus-repo", slots: [] }, { unauthenticated: true });
  const res = await POST(req);
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.error, "Unauthorized");
});

await asyncTest("Malformed JSON body rejected with 400 Invalid JSON body", async () => {
  const req = makeRequest("invalid-non-json{{{", { headers: { "Content-Type": "application/json" } });
  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.error, "Invalid JSON body");
});

await asyncTest("Path traversal '../etc/passwd' rejected with 400 Invalid target file path", async () => {
  const req = makeRequest({
    owner: "challenger_user",
    repo: "nexus-repo",
    targetFile: "../etc/passwd",
    slots: [],
  });
  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.error, "Invalid target file path");
});

await asyncTest("Overlong path (>200 chars) rejected with 400", async () => {
  const req = makeRequest({
    owner: "challenger_user",
    repo: "nexus-repo",
    targetFile: "a".repeat(201),
    slots: [],
  });
  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.error, "Invalid target file path");
});

await asyncTest("Empty string targetFile rejected with 400", async () => {
  const req = makeRequest({
    owner: "challenger_user",
    repo: "nexus-repo",
    targetFile: "    ",
    slots: [],
  });
  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.error, "Invalid target file path");
});

await asyncTest("Windows backslashes sanitized and persisted cleanly", async () => {
  const req = makeRequest({
    owner: "challenger_user",
    repo: "nexus-repo",
    targetFile: "docs\\sub\\PROGRESS.md",
    slots: [],
  });
  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.user.targetFile, "docs/sub/PROGRESS.md");
});

await asyncTest("Invalid owner or repository names rejected with 400", async () => {
  const badOwners = ["bad owner", "owner;rm", "owner<script>", "owner/sub"];
  for (const bad of badOwners) {
    const req = makeRequest({
      owner: bad,
      repo: "valid-repo",
      slots: [],
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400, `Should reject bad owner: ${bad}`);
    const data = await res.json();
    assert.strictEqual(data.error, "Invalid owner name");
  }
});

await asyncTest("Invalid timezone rejected with 400", async () => {
  const req = makeRequest({
    owner: "challenger_user",
    repo: "nexus-repo",
    timezone: "SolarSystem/Mars",
    slots: [],
  });
  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.error, "Invalid timezone");
});

await asyncTest("Invalid slots (bad time format or out-of-range count) rejected with 400", async () => {
  const badSlotCases = [
    { slots: [{ time: "25:00", count: 1 }] },
    { slots: [{ time: "12:60", count: 1 }] },
    { slots: [{ time: "9:00", count: 1 }] },
    { slots: [{ time: "12:00", count: 0 }] },
    { slots: [{ time: "12:00", count: 4 }] },
    { slots: [{ time: "12:00", count: -1 }] },
    { slots: [{ time: "12:00", count: 1.5 }] },
    { slots: "not-an-array" },
  ];

  for (const c of badSlotCases) {
    const req = makeRequest({
      owner: "challenger_user",
      repo: "nexus-repo",
      ...c,
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400, `Should reject invalid slot config: ${JSON.stringify(c)}`);
  }
});

await asyncTest("Preserves existing lastRun timestamp for slots whose time is unchanged", async () => {
  await resetTestUser();
  const req = makeRequest({
    owner: "challenger_user",
    repo: "nexus-repo",
    targetFile: "PROGRESS_LOG.md",
    timezone: "UTC",
    slots: [
      { time: "09:00", count: 3 }, // Was already fired on 2026-08-27
      { time: "12:00", count: 2 }, // New slot
    ],
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.user.slots.length, 2);
  const slot09 = data.user.slots.find((s) => s.time === "09:00");
  const slot12 = data.user.slots.find((s) => s.time === "12:00");

  assert.strictEqual(slot09.lastRun, "2026-08-27", "Must preserve lastRun for unchanged slot times");
  assert.strictEqual(slot09.count, 3, "Count updated to 3");
  assert.strictEqual(slot12.lastRun, null, "New slot lastRun is null");
});

console.log("\n===============================================================");
console.log(`  CHALLENGER 2 ROUTE RESULTS: ${passed} passed, ${failed} failed`);
console.log("===============================================================\n");

if (failed > 0) {
  process.exit(1);
}
