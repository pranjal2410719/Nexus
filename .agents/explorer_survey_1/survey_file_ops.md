# Nexus Codebase Architecture & File Operations Survey Report

**Author:** Survey Explorer 1 (Codebase Architecture & File Update Bug Specialist)  
**Date:** 2026-08-27  
**Working Directory:** `/home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_1`  
**Target Focus:** Application Architecture, Workflow Engine, File Operations, and Requirement R1 (File Update Bug Root Cause Analysis)

---

## 1. Executive Summary

Nexus (`nexus` v3.0.0) is a multi-tenant, open-source GitHub commit scheduler and developer activity simulation engine built with Next.js 15 (App Router), React 19, TypeScript 5.7, Octokit REST API, and Netlify Blobs.

The core workflow allows authenticated users to link a personal GitHub repository, specify a target file (e.g., `PROGRESS_LOG.md`), configure daily commit bursts in their local timezone, and let automated background cron jobs (or manual triggers) push realistic conventional commits (DSA implementations, complexity breakdowns, refactorings) into their target file.

### Primary Finding for Requirement R1 (File Update Bug)
When a target file does **not** exist in the repository, Nexus successfully creates and updates it. However, when the user specifies a **pre-existing file** (particularly an empty file or a file with falsy content / missing payload), Nexus fails with GitHub API error `422 Unprocessable Entity` ("sha was not supplied") or `409 Conflict`.

**The Root Cause:** In `lib/commit-helper.ts:117-120`, the `fetchCurrentFile()` function uses the conditional check:
```typescript
if ("content" in data && data.content) {
  return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
}
return { content: "" };
```
When a file already exists on GitHub with an empty body (`content: ""`), `data.content` evaluates to `false` in JavaScript. The function bypasses the block and returns `{ content: "" }` without `sha: data.sha`. When `octokit.repos.createOrUpdateFileContents()` is subsequently invoked with `sha: undefined`, GitHub rejects the update request because updating an existing file strictly requires the current blob SHA. Conversely, creating a new file (which returns 404 from `getContent`) expects `sha: undefined`, which is why new files succeed while existing files fail.

Additionally, `pruneEntries()` in `lib/commit-helper.ts:100-109` naively splits on all `\n## ` headings, causing destructive truncation of legitimate user markdown sections in pre-existing files.

---

## 2. System Architecture & Workflow Engine Deep Dive

```
+---------------------------------------------------------------------------------------------------+
|                                      NEXUS NEXT.JS RUNTIME                                        |
|                                                                                                   |
|  +--------------------------------+           +------------------------------------------------+  |
|  |     Frontend Client UI         |           |             API Route Handlers                 |  |
|  |  - Dashboard: app/page.tsx     | --------> |  - Auth: /api/auth/start, callback, logout     |  |
|  |  - Admin: app/admin/page.tsx   |  (HTTP)   |  - User Config: /api/me, /api/repos            |  |
|  |  - Status: app/status/page.tsx |           |  - Config Save: /api/save-config               |  |
|  |  - Design: SayBriefly CSS      |           |  - Manual Trigger: /api/commit-now             |  |
|  +--------------------------------+           +------------------------------------------------+  |
|                                                                        |                          |
|                                                                        v                          |
|  +---------------------------------------------------------------------------------------------+  |
|  |                                  Netlify Blobs Storage Layer                                |  |
|  |  Store: "nexus" (or LocalFileStore in .data/blobs/ for dev)                                 |  |
|  |  - `user:{githubId}`         -> JSON UserConfig (Encrypted OAuth Token, Slots, Repo, Target)|  |
|  |  - `session:{sessionId}`     -> JSON Session (userId, createdAt)                            |  |
|  |  - `oauth:{state}`           -> CSRF state token with 10m TTL                               |  |
|  |  - `counter:{githubId}:{utc}` -> Daily manual commit counter                                |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                     ^                                  |                          |
|                                     |                                  v                          |
|  +--------------------------------+ |         +------------------------------------------------+  |
|  | Netlify Scheduled Heartbeat    | |         |           Shared Commit Helper Engine          |  |
|  | netlify/functions/heartbeat.ts |-+         |                 lib/commit-helper.ts           |  |
|  | Schedule: */15 * * * *         |           |  - generateRealLogEntry()                      |  |
|  | - Paginate users               |           |  - fetchCurrentFile()                          |  |
|  | - Check timezone & slot delta  |---------> |  - pruneEntries()                              |  |
|  | - Fan out with user token      |           |  - makeSingleCommit()                          |  |
|  | - Mark slot.lastRun            |           |  - makeBatchCommits()                          |  |
|  +--------------------------------+           +------------------------------------------------+  |
|                                                                        |                          |
+------------------------------------------------------------------------|--------------------------+
                                                                         | (Octokit REST)
                                                                         v
                                                        +---------------------------------+
                                                        |        GitHub REST API          |
                                                        |  - octokit.repos.getContent     |
                                                        |  - octokit.repos.createOrUpdate |
                                                        |  - target repo / targetFile     |
                                                        +---------------------------------+
```

### 2.1 Multi-Tenant Isolation & Security
- **Credential Storage (`lib/security.ts`):** User GitHub OAuth access tokens are encrypted with AES-256-GCM using `BLOBS_MASTER_KEY` (derived via SHA-256 into a 32-byte key) with a unique 12-byte initialization vector (IV) per record: `${iv_base64}.${cipher_base64}`.
- **Data Boundary (`lib/auth.ts`):** All user configurations are keyed by `user:${githubId}`. No central GitHub bot token is used; every commit action is executed with the respective user's personal OAuth token against their owned repository.
- **Client Sanitization:** `publicUser()` strips `encryptedToken` before sending user state to `/api/me` or `/api/admin/users`.

### 2.2 Storage Engine (`lib/auth.ts`, `lib/local-blobs.ts`)
- **Production:** Netlify Blobs (`getStore("nexus")`) initialized via ambient Netlify runtime environment variables (`NETLIFY_BLOBS_CONTEXT`, `NETLIFY_API_TOKEN`).
- **Development Fallback:** `LocalFileStore` writes JSON blobs directly to `.data/blobs/<sanitized_key>.json`, supporting full end-to-end local testing without cloud dependencies.

### 2.3 Workflow Scheduling Engine (`netlify/functions/heartbeat.ts`)
- Configured to fire every 15 minutes via Netlify Scheduled Functions (`*/15 * * * *`).
- Execution Flow:
  1. Opens blob stream `store.list({ prefix: "user:", paginate: true })`.
  2. For each user, calculates the current wall-clock time in the user's IANA timezone (`Intl.DateTimeFormat`).
  3. Evaluates `isSlotDue(slot, now, timezone)` using a ±15-minute angular window on a 24-hour clock.
  4. Checks idempotency: skips if `slot.lastRun === today`.
  5. If due, sets `slot.lastRun = dayKey`, decrypts the user token, and calls `makeBatchCommits()` for `slot.count` (1–3 commits).
  6. Persists updated `user` record to Netlify Blobs.
  7. Enforces a 12-second execution time budget (`BUDGET_MS = 12000`) and a 50-user cap per tick.

---

## 3. End-to-End File Operations Pipeline

### 3.1 Target File Configuration
1. User enters `targetFile` in dashboard (`app/page.tsx:595-603`), default `PROGRESS_LOG.md`.
2. Sent via `POST /api/save-config`:
   ```typescript
   // app/api/save-config/route.ts:40
   const targetFile = String(body.targetFile ?? "PROGRESS_LOG.md").trim().replace(/^\/+/, "");
   ```
3. Validated: `targetFile.length <= 200`. Persisted in `user.targetFile`.

### 3.2 Commit Dispatch Flow (`app/api/commit-now/route.ts` & `netlify/functions/heartbeat.ts`)
1. Resolves user configuration (`owner`, `repo`, `targetFile`, `encryptedToken`).
2. Decrypts OAuth token via `decryptSecret()`.
3. Calls `makeSingleCommit()` or `makeBatchCommits()`.

### 3.3 Target File Fetch & Update Logic (`lib/commit-helper.ts`)
1. **`fetchCurrentFile(config)`**:
   - Calls `octokit.repos.getContent({ owner: config.owner, repo: config.repo, path: config.targetFile })`.
   - On 404: Returns `{ content: "" }` (no SHA).
   - On 200: Checks `"content" in data && data.content`. Decodes base64 buffer and returns `{ content, sha: data.sha }`.
2. **`generateRealLogEntry()`**:
   - Randomly picks a structured task from `REAL_TASKS` (DSA Trees, DP, Graphs, Strings, Arrays, Backtracking).
   - Formats a Markdown section with timestamp, module, status, summary, and C++ code block.
3. **`pruneEntries(newContent, 5)`**:
   - Splits content on `/(?=\n##\s)/g`.
   - Truncates to keep at most 5 entries plus header.
4. **`octokit.repos.createOrUpdateFileContents()`**:
   - Sends Base64 payload, commit message, path, and `sha` (if existing).

---

## 4. Root Cause Analysis: Requirement R1 (File Update Bug)

### 4.1 Bug Identification & Location
- **Primary Source File:** `/home/dev/Desktop/khurafati/Nexus/lib/commit-helper.ts`
- **Functions:** `fetchCurrentFile()` (lines 111–127), `makeSingleCommit()` (lines 132–162), and `pruneEntries()` (lines 100–109).

### 4.2 Code-Level Logic Flaws

#### Defect 1: Falsy Check Drops Blob SHA on Existing Empty Files / Missing Content Payloads
**Location:** `lib/commit-helper.ts:117-120`
```typescript
async function fetchCurrentFile(config: CommitConfig): Promise<{ content: string; sha?: string }> {
  const octokit = new Octokit({ auth: config.token });
  try {
    const { data } = await octokit.repos.getContent({
      owner: config.owner, repo: config.repo, path: config.targetFile,
    });
    if ("content" in data && data.content) { // <--- FLAW: data.content is "" for empty files
      return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
    }
    return { content: "" }; // <--- FLAW: Drops data.sha!
  } catch (err: any) {
    if (err.status === 404) {
      return { content: "" };
    }
    throw err;
  }
}
```

**Mechanism of Failure:**
1. User targets an existing file in their repository that was created empty (e.g., via `touch PROGRESS_LOG.md` or git init) or where GitHub omits `content` (large blobs > 1MB).
2. GitHub REST API `GET /repos/{owner}/{repo}/contents/{path}` returns HTTP 200:
   ```json
   {
     "type": "file",
     "name": "PROGRESS_LOG.md",
     "path": "PROGRESS_LOG.md",
     "sha": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
     "size": 0,
     "content": "",
     "encoding": "base64"
   }
   ```
3. In `fetchCurrentFile()`:
   - `"content" in data` is `true`.
   - `data.content` is `""` (empty string), which evaluates to `false` in JavaScript truthiness.
   - `"content" in data && data.content` evaluates to `false`!
4. The execution jumps to line 120: `return { content: "" };`. **`data.sha` is completely omitted (`sha: undefined`).**
5. `makeSingleCommit()` calls:
   ```typescript
   octokit.repos.createOrUpdateFileContents({
     owner: config.owner,
     repo: config.repo,
     path: config.targetFile,
     message: fullMessage,
     content: Buffer.from(newContent).toString("base64"),
     sha: undefined, // <--- FLAW: Missing required SHA for existing file
   });
   ```
6. GitHub API receives an update request for an existing file without a `sha`. GitHub rejects this with:
   `422 Unprocessable Entity: "sha" wasn't supplied.` or `409 Conflict`.
7. **Why New Files Worked:** When a file does not exist, GitHub returns 404. `fetchCurrentFile` returns `{ content: "" }` with `sha: undefined`. GitHub allows file creation when `sha` is absent. Hence, new files succeed, but pre-existing files fail!

---

#### Defect 2: Missing Type Check for GitHub Non-File Responses (Directories, Symlinks, Submodules)
**Location:** `lib/commit-helper.ts:114-120`
`octokit.repos.getContent` returns a union type:
- File Object (`type: "file"`)
- Directory Array (`type: "dir"` or Array of objects)
- Symlink / Submodule
If a user specifies a folder path or root directory, `Array.isArray(data)` is true. The current code does not validate `data.type === "file"` and instead silently returns `{ content: "" }` without SHA, later failing cryptically on `createOrUpdateFileContents`.

---

#### Defect 3: Destructive Pruning of Pre-Existing User Content
**Location:** `lib/commit-helper.ts:100-109`
```typescript
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

**Mechanism of Failure:**
If the user points Nexus to a pre-existing Markdown file (like `README.md`, `NOTES.md`, or a project document) containing arbitrary `## Heading` sections:
1. `split(/(?=\n##\s)/g)` splits every heading in the user's file.
2. If the user had 6 or more sections (`## Architecture`, `## Installation`, `## Usage`, `## API`, `## Contributing`, `## License`), `pruneEntries` assumes they are disposable Nexus log entries and drops all sections except the last 5!
3. If the file began with `## `, `parts[0]` is discarded and replaced with `# DSA Practice & Build Activity Log\n`.
4. This results in permanent **data loss** on pre-existing user files.

---

#### Defect 4: Path Sanitization Edge Cases
**Location:** `app/api/save-config/route.ts:40`
```typescript
const targetFile = String(body.targetFile ?? "PROGRESS_LOG.md").trim().replace(/^\/+/, "");
```
If a user passes `./PROGRESS_LOG.md`, `\PROGRESS_LOG.md`, or paths with `..`, GitHub's REST API treats `./` as an invalid path parameter or misroutes the request. Sanitization must normalize `./` and backslashes.

---

## 5. Detailed Proposed Fix & Code Implementation

### 5.1 Proposed Fix for `lib/commit-helper.ts`

```typescript
// Proposed Refactoring for lib/commit-helper.ts

import { Octokit } from "@octokit/rest";

export interface CommitConfig {
  token: string;
  owner: string;
  repo: string;
  targetFile: string;
}

export interface SingleCommitResult {
  commitMessage: string;
  sha: string;
  commitUrl: string;
}

export interface BatchResult {
  committed: number;
  errors: string[];
  lastSha?: string;
  lastCommitUrl?: string;
}

// Regex specifically targeting Nexus log entry headings: "\n## [YYYY-MM-DD HH:MM:SS UTC]"
const NEXUS_ENTRY_DELIMITER = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g;

/**
 * Truncates only Nexus-generated log entries to keep the rolling window at `maxEntries`.
 * Preserves all pre-existing user content and non-Nexus markdown headers intact.
 */
export function pruneEntries(content: string, maxEntries: number = 5): string {
  if (!content) return content;

  // Split only on timestamped Nexus log entries
  const parts = content.split(NEXUS_ENTRY_DELIMITER);
  if (parts.length <= 1) {
    return content;
  }

  // parts[0] contains the header or pre-existing user content
  const header = parts[0];
  // Subsequent parts are the individual Nexus log entries
  const entries = parts.slice(1);

  if (entries.length <= maxEntries) {
    return content;
  }

  const keptEntries = entries.slice(-maxEntries);
  return header + keptEntries.join("");
}

/**
 * Safely fetches the current target file content and its GitHub Blob SHA.
 * Guarantees that sha is returned whenever the file exists on GitHub (even if empty).
 */
export async function fetchCurrentFile(config: CommitConfig): Promise<{ content: string; sha?: string }> {
  const octokit = new Octokit({ auth: config.token });
  try {
    const { data } = await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: config.targetFile.replace(/^\.?\/+/, ""),
    });

    // Handle non-file types returned by GitHub
    if (Array.isArray(data)) {
      throw new Error(`Target path "${config.targetFile}" is a directory, not a file.`);
    }

    if (data.type !== "file") {
      throw new Error(`Target path "${config.targetFile}" is a ${data.type}, not a regular file.`);
    }

    let content = "";
    if (typeof data.content === "string") {
      // Decode base64 content
      content = Buffer.from(data.content, "base64").toString("utf-8");
    }

    // Always return the blob SHA if the file exists!
    return {
      content,
      sha: data.sha,
    };
  } catch (err: any) {
    if (err.status === 404) {
      // File does not exist in repository yet — will be created with sha: undefined
      return { content: "" };
    }
    throw err;
  }
}

/**
 * Makes a single commit to the target file.
 * Handles both initial file creation and updating pre-existing files cleanly.
 */
export async function makeSingleCommit(
  config: CommitConfig,
  messageSuffix?: string
): Promise<SingleCommitResult> {
  const octokit = new Octokit({ auth: config.token });
  const sanitizedPath = config.targetFile.replace(/^\.?\/+/, "");
  const normalizedConfig = { ...config, targetFile: sanitizedPath };

  const { content: currentContent, sha } = await fetchCurrentFile(normalizedConfig);

  const { commitMessage, logContent } = generateRealLogEntry();
  const fullMessage = messageSuffix ? `${commitMessage} ${messageSuffix}` : commitMessage;

  let newContent: string;
  if (currentContent && currentContent.length > 0) {
    // Append to pre-existing file content
    newContent = currentContent + logContent;
  } else {
    // Brand new or blank file header
    newContent = `# DSA Practice & Build Activity Log\n\n${logContent}`;
  }

  // Prune only timestamped entries
  newContent = pruneEntries(newContent, 5);

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner:   normalizedConfig.owner,
    repo:    normalizedConfig.repo,
    path:    normalizedConfig.targetFile,
    message: fullMessage,
    content: Buffer.from(newContent).toString("base64"),
    sha, // Present for existing files; undefined for new files
  });

  return {
    commitMessage: fullMessage,
    sha: data.commit?.sha ?? "",
    commitUrl: data.commit?.html_url ?? "",
  };
}
```

### 5.2 Proposed Path Sanitization in `app/api/save-config/route.ts`

```typescript
// Refined targetFile sanitization in save-config/route.ts
const targetFile = String(body.targetFile ?? "PROGRESS_LOG.md")
  .trim()
  .replace(/\\/g, "/")
  .replace(/^\.?\/+/, "");

if (!targetFile || targetFile.length > 200 || targetFile.includes("..")) {
  return json({ error: "Invalid target file path" }, 400);
}
```

---

## 6. Verification Method & Test Specification (`test_file_update.js`)

To independently verify the fix and fulfill Requirement R1 Acceptance Criteria, a standalone verification script `test_file_update.js` can test the core file update logic against all edge cases:

### Test Cases Covered:
1. **Test Case 1: New File Creation (404 Not Found)**
   - `getContent` throws 404.
   - `fetchCurrentFile` returns `{ content: "", sha: undefined }`.
   - `createOrUpdateFileContents` is called with `sha: undefined`.
   - Result: File created successfully.

2. **Test Case 2: Pre-Existing Empty File (`size: 0, content: "", sha: "e69de29..."`)**
   - `getContent` returns 200 with `content: ""` and `sha: "e69de29..."`.
   - `fetchCurrentFile` returns `{ content: "", sha: "e69de29..." }`.
   - `createOrUpdateFileContents` receives `sha: "e69de29..."`.
   - Result: Existing file updated successfully (no 422 error).

3. **Test Case 3: Pre-Existing File with Existing Content & Markdown Headers**
   - `getContent` returns existing file containing `## Project Overview`, `## Installation`, etc.
   - `makeSingleCommit` appends new log entry.
   - `pruneEntries` preserves all original markdown headings without destructive loss.
   - `createOrUpdateFileContents` receives `sha: "existing_sha"`.
   - Result: Existing content preserved, log appended, file updated.

4. **Test Case 4: Sequential Batch Commits**
   - Iteration 1 updates file and transitions SHA from `sha1` -> `sha2`.
   - Iteration 2 receives `sha2` and updates successfully.

---

## 7. Architecture Audit Observations for Subsequent Tasks (R2–R4)

During the survey, the following additional issues were cataloged for the team's upcoming audit (R2), restructuring (R3), and documentation (R4):

1. **Heartbeat Scheduler Edge Cases (`netlify/functions/heartbeat.ts`):**
   - Midnight wrap-around bug (`delta >= 1440 - 15`) causes double-firing for slots near 00:00.
   - Write-ahead marker is persisted in memory before batch execution, but blob persistence is write-behind at the end of user processing.
2. **Session Security (`lib/auth.ts`):**
   - Session tokens have no timestamp expiration validation in `getUserByRequest()`.
   - `decodeURIComponent` in `parseCookies` lacks try/catch protection against malformed cookies.
3. **Frontend Inconsistencies (`app/status/page.tsx`, `app/page.tsx`):**
   - Status page mobile hamburger menu has an empty `onClick={() => {}}`.
   - `MANUAL_DAILY_CAP` is hardcoded as "50" in `/status` but enforced as 5 in code.
   - Hardcoded Google Analytics tag `G-5233K47F2S` in `app/layout.tsx`.
4. **Directory Structure Restructuring (R3):**
   - Project currently mixes API route handlers, shared libraries, and Netlify functions.
   - Reorganizing `lib/` into modular domains (`lib/core/`, `lib/auth/`, `lib/github/`, `lib/utils/`) will significantly improve maintainability.

---

## 8. Conclusion
The file update bug on pre-existing files is caused by the falsy check `if ("content" in data && data.content)` in `lib/commit-helper.ts:117` which drops the blob SHA when updating empty or pre-existing files. Replacing this check with type-safe response handling (`data.type === "file"` and unconditional extraction of `data.sha`) completely resolves the bug while safeguarding existing user file contents during log pruning.
