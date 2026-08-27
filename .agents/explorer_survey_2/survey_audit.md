# Nexus Codebase Audit & Dead Code Survey Report

**Author:** Survey Explorer 2 (Codebase Audit & Dead Code Specialist)  
**Date:** 2026-08-27  
**Workspace:** `/home/dev/Desktop/khurafati/Nexus`  
**Reference Document:** `/home/dev/Desktop/khurafati/Nexus/.agents/ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

Nexus is an open-source, multi-tenant GitHub commit scheduler built with Next.js 15 (App Router), React 19, TypeScript 5.7, Netlify Blobs, and `@octokit/rest`.

This comprehensive audit investigated all 22 source and configuration files in the workspace. While the core architecture (per-user credential isolation, AES-GCM encryption at rest, and serverless scheduling) is sound in design, our audit identified:
- **1 Critical Core Engine Bug (R1)** in `lib/commit-helper.ts` that prevents updating existing empty/large files and causes destructive data loss on user markdown files via `pruneEntries`.
- **4 Critical/High Logic Bugs** including the Midnight Double-Fire clock wraparound bug, write-ahead persistence loss on function timeouts, lexicographic tenant starvation, and unhandled `URIError` cookie crashes.
- **7 Medium/Low Severity Edge Cases & Inconsistencies** across API route handlers, OAuth redirects, and health checks.
- **5 Performance Bottlenecks & Inefficiencies** including redundant Octokit instantiations, repetitive WebCrypto key imports, and unbuffered I/O.
- **Dead Code & Refactoring Opportunities** including unused/internal-only exports, misleading CORS wildcards, dead mobile buttons, and documentation/code parameter mismatches.
- **0 Existing Tests** in the repository.

---

## 2. Complete File Inventory

| Category | File Path | Lines | Size (Bytes) | Role & Status |
|---|---|---|---|---|
| **Core Lib** | `lib/commit-helper.ts` | 187 | 9,022 | Commit generation engine, GitHub API updater, rolling log pruner |
| **Core Lib** | `lib/auth.ts` | 190 | 6,043 | Netlify Blobs store accessor, session management, user isolation |
| **Core Lib** | `lib/security.ts` | 42 | 1,616 | AES-GCM encryption/decryption of GitHub tokens |
| **Core Lib** | `lib/local-blobs.ts` | 73 | 2,123 | Dev-only file-backed blob store (`.data/blobs`) |
| **Core Lib** | `lib/http.ts` | 22 | 699 | Shared HTTP response and CORS helpers |
| **Scheduler** | `netlify/functions/heartbeat.ts` | 154 | 5,650 | 15-minute scheduled function for cron fan-out |
| **UI** | `app/layout.tsx` | 37 | 1,326 | Root HTML layout, font tags, Google Analytics script |
| **UI** | `app/globals.css` | 489 | 24,236 | Global design tokens, typography, CSS styling |
| **UI** | `app/page.tsx` | 836 | 27,157 | Main dashboard and landing page (single client component) |
| **UI** | `app/admin/page.tsx` | 118 | 3,667 | Admin user list interface (restricted to admin login) |
| **UI** | `app/status/page.tsx` | 271 | 9,413 | Public service health & configuration status page |
| **Components** | `app/components/loader.tsx` | 28 | 628 | Animated 3D cube loading screen component |
| **Components** | `app/components/menu-select.tsx` | 231 | 6,396 | Custom accessible keyboard-navigable dropdown component |
| **API Route** | `app/api/auth/start/route.ts` | 37 | 1,400 | GitHub OAuth step 1 (redirect with CSRF state) |
| **API Route** | `app/api/auth/callback/route.ts` | 104 | 3,919 | GitHub OAuth step 2 (token exchange, encryption, user save) |
| **API Route** | `app/api/auth/logout/route.ts` | 12 | 368 | Session destruction & cookie clearing |
| **API Route** | `app/api/commit-now/route.ts` | 68 | 2,098 | Instant manual commit endpoint (rate-limited) |
| **API Route** | `app/api/health/route.ts` | 70 | 2,283 | Health check & store read/write roundtrip test |
| **API Route** | `app/api/me/route.ts` | 20 | 585 | Current authenticated user config endpoint |
| **API Route** | `app/api/repos/route.ts` | 51 | 1,598 | Authenticated user repo list fetcher (paginated) |
| **API Route** | `app/api/save-config/route.ts` | 92 | 2,917 | Configuration persistence & slot validator |
| **API Route** | `app/api/admin/users/route.ts` | 43 | 1,355 | Admin-only registered user directory fetcher |
| **Config** | `package.json` | 30 | 742 | Project dependencies & scripts |
| **Config** | `tsconfig.json` | 22 | 562 | TypeScript compilation rules |
| **Config** | `next.config.mjs` | 10 | 333 | Next.js serverExternalPackages settings |
| **Config** | `netlify.toml` | 17 | 489 | Netlify build & functions bundler configuration |
| **Config** | `.env.example` | 42 | 1,768 | Environment variable template |

---

## 3. Requirement 1 (R1) Deep Dive: File Update Bug on Pre-Existing Files

### 3.1 Problem Definition & Symptoms
When a user sets `targetFile` to a file that does not yet exist in their GitHub repository:
- `octokit.repos.getContent` returns a `404 Not Found`.
- `fetchCurrentFile` catches 404 and returns `{ content: "" }` (where `sha` is `undefined`).
- `octokit.repos.createOrUpdateFileContents` creates the file without `sha` successfully.

However, when `targetFile` points to a **pre-existing file**, updates fail under multiple realistic scenarios:
1. **Empty/0-byte Pre-existing Files:** GitHub API returns `data.content = ""`. Because JS evaluates `""` as falsy, `"content" in data && data.content` evaluates to `false`. `fetchCurrentFile` returns `{ content: "" }` without `sha`. When `createOrUpdateFileContents` is called on the existing file without `sha`, GitHub returns `422 Unprocessable Entity` (`sha was not supplied`) or `409 Conflict`.
2. **Files between 1 MB and 100 MB:** GitHub REST API `getContent` does not return `data.content` (it only returns `sha` and `size`). The falsy check on `data.content` causes `fetchCurrentFile` to omit `sha`, causing the subsequent update to fail with 422.
3. **Leading Slash Path Formatting:** If a user specifies `/log.md` or `/README.md`, GitHub API endpoints handle leading slashes inconsistently or fail.
4. **Destructive Truncation via `pruneEntries`:** If an existing file contains existing Markdown headings (`## Installation`, `## Usage`, `## Architecture`), `pruneEntries` splits on `(?=\n##\s)` and discards all but the last 5 sections, deleting the user's actual project documentation.

### 3.2 Evidence Chain & Code Analysis

**Source File:** `lib/commit-helper.ts:111-127`
```typescript
// CURRENT BUGGY CODE:
async function fetchCurrentFile(config: CommitConfig): Promise<{ content: string; sha?: string }> {
  const octokit = new Octokit({ auth: config.token });
  try {
    const { data } = await octokit.repos.getContent({
      owner: config.owner, repo: config.repo, path: config.targetFile,
    });
    if ("content" in data && data.content) {
      return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
    }
    return { content: "" }; // BUG: If data.content is "" or undefined, data.sha is lost!
  } catch (err: any) {
    if (err.status === 404) {
      return { content: "" }; // file does not exist yet — will be created
    }
    throw err;
  }
}
```

**Source File:** `lib/commit-helper.ts:100-109`
```typescript
// CURRENT BUGGY PRUNE LOGIC:
export function pruneEntries(content: string, maxEntries: number = 5): string {
  const parts = content.split(/(?=\n##\s)/g);
  if (parts.length <= maxEntries) {
    return content;
  }
  const header = parts[0].startsWith("\n## ") ? "" : parts[0];
  const entries = parts.filter(p => p.includes("## "));
  const keptEntries = entries.slice(-maxEntries);
  return (header ? header : "# DSA Practice & Build Activity Log\n") + keptEntries.join("");
}
```

### 3.3 Recommended Fix for R1
1. Normalize `config.targetFile` by stripping leading slashes: `config.targetFile.replace(/^\/+/, '')`.
2. Check `!Array.isArray(data) && "sha" in data`: if `data.sha` exists, return `sha: data.sha` regardless of whether `data.content` is non-empty. If `data` is an array (directory), throw a clear descriptive error.
3. Update `pruneEntries` to only match Nexus-generated log headers (e.g. `\n## \[\d{4}-\d{2}-\d{2}`) rather than generic markdown `## ` sections, preventing data loss on user files.

---

## 4. Codebase Audit: Logic Bugs, Runtime Errors & Edge Cases

| ID | Severity | File & Line | Summary | Description & Impact |
|---|---|---|---|---|
| **BUG-01** | **P0 Critical** | `netlify/functions/heartbeat.ts:60-72` | Midnight Double-Fire Clock Wraparound | `isSlotDue` uses `delta <= 15 \|\| delta >= 1440 - 15` on a 24h clock with `lastRun === today`. A slot at `00:05` fires at `23:55` of day 1 (marked with day 1), then fires again at `00:10` of day 2 (since day 2 != day 1). Slots near midnight fire twice every day. |
| **BUG-02** | **P0 Critical** | `netlify/functions/heartbeat.ts:106-135` | Write-Ahead Marker Lost on Timeout | `slot.lastRun = dayKey` is mutated in memory before GitHub API calls, but `store.set(key, ...)` is only called after all user slots finish. If the function times out mid-batch, `store.set` never runs and the next tick repeats the commits. |
| **BUG-03** | **P1 High** | `netlify/functions/heartbeat.ts:84-87` | Lexicographic Tenant Starvation | `store.list({ prefix: "user:" })` yields keys in alphanumeric order. Under the 12s execution budget, processing stops after the first 2–3 users, starving users with higher IDs (`user:8...`, `user:9...`). |
| **BUG-04** | **P1 High** | `lib/auth.ts:98` | Malformed Cookie Header Uncaught Crash (500) | `decodeURIComponent(part.slice(idx + 1).trim())` is unguarded. Any malformed cookie (e.g. `%zz`) throws an unhandled `URIError`, causing all authenticated API routes to return 500. |
| **BUG-05** | **P1 High** | `lib/auth.ts:114-164` | Sessions Never Expire Server-Side | `Session.createdAt` is stored on login but never checked during session verification in `getUserByRequest`. Stolen cookies remain valid indefinitely. |
| **BUG-06** | **P2 Medium** | `app/page.tsx:589` | Infinite Loading Dropdown on Zero Repos | Line 589 uses `loading={!reposError && repoOptions.length === 0}` instead of the dedicated `reposLoading` state. A user with zero GitHub repositories is permanently stuck in a "Loading…" state. |
| **BUG-07** | **P2 Medium** | `app/api/commit-now/route.ts:33-49` | Non-Atomic Manual Daily Cap Counter | Read-modify-write on `counter:${user.githubId}:${today}` is non-atomic. Rapid concurrent clicks can bypass the daily cap limit. |
| **BUG-08** | **P2 Medium** | `app/page.tsx:109` vs `commit-now/route.ts:30` | Timezone Mismatch on Manual Counter | Client tracks `localStorage` manual count using client-local `toDateString()`, whereas the API route checks UTC `toISOString().slice(0, 10)`. Cross-date operations show desynchronized counters. |
| **BUG-09** | **P2 Medium** | `app/api/health/route.ts:48` | Unconfigured Store False Positive (200 OK) | When `mode === "unconfigured"`, `store.roundtrip` is `"n/a"`. `store.roundtrip !== "error"` evaluates to `true`, returning HTTP 200 OK even when the database store is non-functional. |
| **BUG-10** | **P2 Medium** | `app/status/page.tsx:81-91` | Dead Mobile Menu on `/status` Page | The mobile hamburger button on the `/status` page has `onClick={() => {}}` with no drawer component, leaving mobile visitors with no navigation. |
| **BUG-11** | **P2 Medium** | `app/status/page.tsx:59-64` | Broken Anchor Links on `/status` Page | Links to `#features` and `#schedule` are relative anchors on `/status` where those DOM elements do not exist. |
| **BUG-12** | **P2 Medium** | `app/status/page.tsx:236` | Hardcoded Cap Mismatch ("default 50") | The `/status` page displays `"default 50"` while `commit-now/route.ts:8` enforces `DEFAULT_DAILY_CAP = 5` and `.env.example` documents `5`. |
| **BUG-13** | **P3 Low** | `app/api/auth/callback/route.ts:63` | Unencoded Error Detail in OAuth Redirect | `tokenData.error` in query string is not encoded via `encodeURIComponent`, risking malformed URL redirection. |
| **BUG-14** | **P3 Low** | `app/admin/page.tsx:98-99` | Unsafe Property Access on Incomplete User Records | `u.slots.length` throws `TypeError` if a corrupted record has `slots: undefined`. `new Date(u.createdAt).toLocaleDateString()` outputs "Invalid Date" on missing dates. |
| **BUG-15** | **P3 Low** | `app/api/save-config/route.ts:51-72` | Missing Upper Bound on Schedule Slots Array | The frontend UI restricts users to 3 slots, but the backend `save-config` API route does not enforce a length check, allowing unbounded slot arrays via direct API requests. |
| **BUG-16** | **P3 Low** | `app/layout.tsx:15-25` | Hardcoded Google Analytics Tag | Google tag `G-5233K47F2S` is hardcoded in `RootLayout`. All self-hosted instances leak traffic data to the author's property. |

---

## 5. Performance, Memory & Inefficiencies

| ID | Location | Inefficiency | Recommended Optimization |
|---|---|---|---|
| **PERF-01** | `lib/commit-helper.ts:112, 136` | **Redundant Octokit Instantiations:** A new `Octokit` instance is instantiated inside `fetchCurrentFile` and again inside `makeSingleCommit`. In a 3-commit batch, 6 Octokit instances are created and garbage collected. | Pass a single `Octokit` client instance across helper methods. |
| **PERF-02** | `lib/security.ts:8-38` | **Repetitive Key Derivation & Key Import:** `deriveKey()` and `webcrypto.subtle.importKey()` are executed on every single encryption and decryption operation rather than caching the imported `CryptoKey`. | Cache the imported `CryptoKey` in memory after derivation. |
| **PERF-03** | `netlify/functions/heartbeat.ts:116` | **Repeated Token Decryption in Loop:** `decryptSecret(user.encryptedToken)` is called inside the inner slot loop for every slot of a user. | Decrypt the user's token once before iterating over their slots. |
| **PERF-04** | `lib/local-blobs.ts:47` | **Synchronous Unbuffered Disk I/O:** `writeFileSync` and `readFileSync` block the Node.js event loop during local development blob operations. | Use async `fs.promises` (`readFile`, `writeFile`, `mkdir`). |
| **PERF-05** | `app/api/repos/route.ts:23-39` | **Eager 10-Page Pagination:** Always requests up to 1,000 repos on initial load even for users who only have 2 repos. | Stop pagination early if `data.length < 100`. (Already partially done, but should have a fast limit). |

---

## 6. Dead Code, Unused Exports & Refactoring Candidates

| ID | Location | Type | Details |
|---|---|---|---|
| **DEAD-01** | `lib/auth.ts:7-8, 91` | Unused Exports | `STORE_NAME`, `SESSION_COOKIE`, and `parseCookies` are exported but only referenced internally within `lib/auth.ts`. |
| **DEAD-02** | `lib/commit-helper.ts:13-29, 83-95` | Unused Exports | `LogEntry`, `SingleCommitResult`, `generateRealLogEntry`, and `getTimestamp` are exported but only used internally within `commit-helper.ts`. |
| **DEAD-03** | `lib/http.ts:2-7` | Misleading / Ineffective CORS | `Access-Control-Allow-Origin: *` is exported and attached to API routes that use cookie authentication. Browsers reject credentialed requests with wildcard origins. Since Nexus is a same-origin Next.js app, external CORS is unnecessary. |
| **DEAD-04** | `app/page.tsx:183-189` | Redundant Conditional Logic | `if (cur && list.some(...)) setRepoVal(cur); else if (cur) setRepoVal(cur);` contains duplicate assignments. |
| **DEAD-05** | `app/page.tsx:76` | Profile URL vs Repo URL | `SOURCE_URL = "https://github.com/pranjal2410719/"` points to a profile rather than the project repository `https://github.com/pranjal2410719/Nexus`. |
| **DEAD-06** | `package.json:11` | Placeholder Test Script | `"test": "echo \"No tests specified\" && exit 0"` — No test runner or integration tests exist in the project. |

---

## 7. Build Health, Dependencies & Project Configuration

### 7.1 Build Verification
- Running `npx tsc --noEmit` exits with code `0` (clean TypeScript compilation).
- Running `next build` produces an optimized production build with 15 routes:
  - 4 Static pages (`/`, `/_not-found`, `/admin`, `/status`)
  - 9 Serverless API routes (`/api/admin/users`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/start`, `/api/commit-now`, `/api/health`, `/api/me`, `/api/repos`, `/api/save-config`)
  - Total shared JS bundle: `103 kB`.

### 7.2 Dependencies Audit
- `@netlify/blobs: ^8.1.0` — In use in `lib/auth.ts`. Correctly configured in `next.config.mjs` as `serverExternalPackages: ["@netlify/blobs"]`.
- `@octokit/rest: ^20.0.2` — In use in `lib/commit-helper.ts`, `app/api/auth/callback/route.ts`, and `app/api/repos/route.ts`. Bundled via esbuild in `netlify.toml`.
- `next: ^15.3.0`, `react: ^19.1.0`, `react-dom: ^19.1.0` — Clean and compatible.
- `typescript: ^5.7.0`, `@types/node: ^22.15.0`, `@types/react: ^19.1.0`, `@types/react-dom: ^19.1.0` — Up to date.

---

## 8. Directory Restructuring (R3) & Verification Recommendations

### 8.1 Proposed Clean Directory Structure
```
Nexus/
├── app/
│   ├── (auth)/
│   │   └── api/
│   │       └── auth/
│   │           ├── callback/route.ts
│   │           ├── logout/route.ts
│   │           └── start/route.ts
│   ├── (dashboard)/
│   │   ├── admin/page.tsx
│   │   ├── status/page.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── admin/users/route.ts
│   │   ├── commit-now/route.ts
│   │   ├── health/route.ts
│   │   ├── me/route.ts
│   │   ├── repos/route.ts
│   │   └── save-config/route.ts
│   ├── components/
│   │   ├── loader.tsx
│   │   └── menu-select.tsx
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── core/
│   │   ├── commit-engine.ts       # Refactored commit-helper.ts
│   │   ├── security.ts            # AES-GCM encryption
│   │   └── storage.ts             # Blobs & local store abstraction
│   ├── auth.ts                    # Session & user gates
│   └── http.ts                    # Response helpers
├── netlify/
│   └── functions/
│       └── heartbeat.ts
├── tests/
│   ├── test_file_update.js        # R1 Verification Test Suite
│   └── test_scheduler.js         # Scheduler logic test
├── .env.example
├── next.config.mjs
├── package.json
└── tsconfig.json
```

### 8.2 R1 Verification Test Plan (`test_file_update.js`)
Create a test script that validates:
1. Fetching a pre-existing file with content returns the content AND the existing `sha`.
2. Fetching a pre-existing 0-byte (empty) file returns empty content AND the existing `sha`.
3. Updating an existing file provides the required `sha` and succeeds without 409/422 errors.
4. Calling `pruneEntries` on custom user markdown preserves user headings and only prunes Nexus timestamped entries.
5. Handling path variations (leading `/`, whitespace) cleanly.
