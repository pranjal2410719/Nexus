# Milestone 1: Deep Investigation & Line-by-Line Fix Strategy for File Update Bug (R1) & Test Suite

**Author**: Explorer 1 (Milestone 1 — File Update Bug & Test Suite)  
**Target Repository**: Nexus (`/home/dev/Desktop/khurafati/Nexus`)  
**Date**: 2026-08-27  

---

## 1. Executive Summary

In Milestone 1, we investigate and formulate the comprehensive, line-by-line fix strategy for **Requirement 1 (File Update Bug)**:
- **Defect Symptom**: Specifying a target file path created a new file successfully on GitHub, but failed with HTTP 422 or HTTP 409 errors when attempting to update pre-existing files, 0-byte files, or sequentially committing in batch mode. Furthermore, pre-existing documentation was destroyed by naive log pruning.
- **Root Cause Resolution**:
  1. **Octokit SHA Contract**: GitHub REST API (`PUT /repos/{owner}/{repo}/contents/{path}`) requires the remote blob SHA (`params.sha`) when updating an existing file, but requires `sha: undefined` (omitted) when creating a new file.
  2. **0-Byte Empty File Bug**: Falsy checks (`if (!data.content)`) dropped `data.sha` on empty files because `data.content === ""`. The fix ensures `data.sha` is always returned regardless of content size.
  3. **HTTP 404 vs Error Propagation**: HTTP 404 cleanly indicates a non-existent file (`sha: undefined`), while non-404 errors (401, 403, 500, 503) are strictly propagated.
  4. **Batch Burst SHA Chaining**: In multi-commit bursts (`makeBatchCommits`), each commit iteration performs a fresh fetch to obtain the newly evolved blob SHA, eliminating HTTP 409 conflicts. The `Octokit` client instance is also reused across iterations.
  5. **Header Preservation & Safe Log Pruning**: Log pruning uses specific regex pattern matching on `## [YYYY-MM-DD HH:MM:SS UTC]` to isolate the user header from trailing Nexus log entries, preventing deletion of user markdown headings.
  6. **Path Sanitization & Traversal Defense**: All target file paths are normalized to POSIX paths with leading slashes/relative prefixes removed, and paths containing `..` or exceeding 200 characters are blocked.
- **Verification Harness**: Verified through standalone test suite `test_file_update.js` (14/14 tests passing) and adversarial test harness `test_adversarial_m1.js` (14/14 tests passing).

---

## 2. Deep Code Inspection & Evidence Chain

### 2.1 Commit Engine: `lib/core/commit-engine.ts`

```typescript
// Observation: lib/core/commit-engine.ts:21-56
export async function fetchCurrentFile(
  config: CommitConfig
): Promise<{ content: string; sha?: string }> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sanitized = sanitizePath(config.targetFile);
  try {
    const { data } = await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: sanitized,
    });

    if (Array.isArray(data)) {
      throw new Error(`Target path "${config.targetFile}" is a directory, not a file.`);
    }

    if (typeof data !== "object" || data === null || (data as any).type !== "file") {
      throw new Error(`Target path "${config.targetFile}" is not a regular file.`);
    }

    let content = "";
    if (typeof (data as any).content === "string") {
      content = Buffer.from((data as any).content, "base64").toString("utf-8");
    }

    return {
      content,
      sha: (data as any).sha,
    };
  } catch (err: any) {
    if (err.status === 404) {
      return { content: "" }; // file does not exist yet — will be created with sha: undefined
    }
    throw err;
  }
}
```

#### Evidence Analysis:
1. **`getContent` Response Typing**: Octokit `getContent` returns an array if `path` is a directory, or an object with `type: "file"`, `size: number`, `sha: string`, `content?: string`, `encoding?: string` if it is a regular file.
2. **Directory & Non-File Checks**: Lines 33–39 throw descriptive errors if the path is a directory (array) or a symlink/submodule (`type !== "file"`).
3. **Base64 Decoding & Empty Files**: Lines 41–44 safely check `typeof (data as any).content === "string"`. For an empty 0-byte file, `(data as any).content` is `""`, `content` becomes `""`, and line 48 returns `{ content: "", sha: (data as any).sha }`. The SHA is preserved!
4. **404 Handling**: Lines 51–53 check `err.status === 404` and return `{ content: "" }` with `sha` omitted (`undefined`), which signals to `makeSingleCommit` that this is a new file creation.
5. **Non-404 Propagation**: Line 54 re-throws any non-404 error (such as 401 Unauthorized or 403 Rate Limit) so that authorization and network errors are not masked.

---

### 2.2 Single Commit Execution: `lib/core/commit-engine.ts:62-112`

```typescript
export async function makeSingleCommit(
  config: CommitConfig,
  messageSuffix?: string
): Promise<SingleCommitResult> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sanitized = sanitizePath(config.targetFile);
  const normalizedConfig = { ...config, targetFile: sanitized, client: octokit };

  const { content: currentContent, sha } = await fetchCurrentFile(normalizedConfig);

  const { commitMessage, logContent } = generateRealLogEntry();
  const fullMessage = messageSuffix ? `${commitMessage} ${messageSuffix}` : commitMessage;

  let newContent: string;
  if (currentContent && currentContent.length > 0) {
    newContent = currentContent.endsWith("\n")
      ? currentContent + logContent.replace(/^\n/, "")
      : currentContent + logContent;
  } else {
    newContent = `# DSA Practice & Build Activity Log\n\n${logContent.replace(/^\n/, "")}`;
  }

  newContent = pruneEntries(newContent, 5);

  const params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
  } = {
    owner: normalizedConfig.owner,
    repo: normalizedConfig.repo,
    path: normalizedConfig.targetFile,
    message: fullMessage,
    content: Buffer.from(newContent).toString("base64"),
  };

  if (sha) {
    params.sha = sha;
  }

  const { data } = await octokit.repos.createOrUpdateFileContents(params);

  return {
    commitMessage: fullMessage,
    sha: data.commit?.sha ?? "",
    commitUrl: data.commit?.html_url ?? "",
  };
}
```

#### Evidence Analysis:
1. **Dynamic Parameter Payload**: Lines 86–103 construct the `createOrUpdateFileContents` params. If `sha` is present (from `fetchCurrentFile`), `params.sha = sha` is attached. If `sha` is `undefined` (new file), `params.sha` is completely omitted.
2. **Initial Content vs Append**: Lines 75–82 check if `currentContent` has length. If empty (new or empty file), it bootstraps the markdown header `# DSA Practice & Build Activity Log`. If populated, it appends the new entry without corrupting existing lines.
3. **Safe Pruning Application**: Line 84 applies `pruneEntries(newContent, 5)` to enforce rolling window retention.

---

### 2.3 Batch Commits & Sequential SHA Evolution: `lib/core/commit-engine.ts:118-140`

```typescript
export async function makeBatchCommits(
  config: CommitConfig,
  count: number,
  label: string = "batch"
): Promise<BatchResult> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sharedConfig = { ...config, client: octokit };

  let committed = 0;
  const errors: string[] = [];
  let lastSha: string | undefined;
  let lastCommitUrl: string | undefined;

  for (let i = 1; i <= count; i++) {
    try {
      const { sha, commitUrl } = await makeSingleCommit(sharedConfig, `[${label} ${i}/${count}]`);
      lastSha = sha;
      lastCommitUrl = commitUrl;
      committed++;
    } catch (err: any) {
      errors.push(`Commit ${i} failed: ${err.message}`);
    }
  }

  return { committed, errors, lastSha, lastCommitUrl };
}
```

#### Evidence Analysis:
1. **Sequential SHA Chaining**: Because `makeSingleCommit` is called on each iteration `i` (1..`count`), it calls `fetchCurrentFile` afresh. When Commit 1 completes, GitHub updates the file's blob SHA. On iteration 2, `fetchCurrentFile` retrieves the new blob SHA and passes it to `createOrUpdateFileContents`.
2. **Octokit Client Optimization**: Passing `sharedConfig` with `client: octokit` ensures that Octokit client instance is reused across the entire batch rather than re-instantiated on every iteration.
3. **Fault Tolerance**: If one commit fails (e.g. temporary network blip), the loop captures the error in `errors` array and allows subsequent commits to attempt recovery.

---

### 2.4 Safe Log Pruning & Header Preservation: `lib/core/log-pruner.ts`

```typescript
// Observation: lib/core/log-pruner.ts:1-46
export function sanitizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
}

const NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/;
const NEXUS_SPLIT_RE = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g;

export function pruneEntries(content: string, maxEntries: number = 5): string {
  if (!content) return content;

  const match = content.match(NEXUS_ENTRY_RE);
  if (!match || match.index === undefined) {
    return content;
  }

  // Where the first Nexus entry starts
  const firstEntryIndex = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const header = content.slice(0, firstEntryIndex);

  if (maxEntries <= 0) {
    return header ? header.trimEnd() + "\n" : "";
  }

  const entriesText = content.slice(firstEntryIndex);

  // Split entries (each subsequent entry starts with \n## [...)
  const entries = entriesText.split(NEXUS_SPLIT_RE);

  if (entries.length <= maxEntries) {
    return content;
  }

  const keptEntries = entries.slice(-maxEntries);
  // Strip leading newline from the first kept entry to prevent newline drift
  keptEntries[0] = keptEntries[0].replace(/^\n+/, "");

  const joined = keptEntries.join("");
  if (!header) {
    return joined;
  }
  return header.endsWith("\n") ? header + joined : header + "\n" + joined;
}
```

#### Evidence Analysis:
1. **Targeted Entry Identification**: `NEXUS_ENTRY_RE` specifically targets `## [YYYY-MM-DD HH:MM:SS UTC]`. Generic user headings (e.g. `## Project Overview`, `## Architecture`, `## Installation`) will never match this pattern.
2. **Header Isolation**: `header = content.slice(0, firstEntryIndex)` isolates all preceding content (including all user documentation sections).
3. **Rolling Window Slicing**: `entries.slice(-maxEntries)` preserves exactly the newest `maxEntries` Nexus log entries.
4. **Newline Drift Prevention**: Line 39 `keptEntries[0] = keptEntries[0].replace(/^\n+/, "")` prevents whitespace accumulation over dozens of consecutive commits.

---

### 2.5 Input Sanitization & Path Traversal Guards: `app/api/save-config/route.ts:43-51`

```typescript
  const targetFile = String(body.targetFile ?? "PROGRESS_LOG.md")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "");
...
  if (!targetFile || targetFile.length > 200 || targetFile.includes("..")) return json({ error: "Invalid target file path" }, 400);
```

#### In-Depth Security Assessment:
- Defense Layer 1 (API Input Validation): Blocks empty paths, paths > 200 chars, and paths containing `..` (e.g. `../../etc/passwd`).
- Defense Layer 2 (Engine Sanitization): `sanitizePath` strips leading `./`, `.///`, and backslashes `\\`.
- Defense-in-depth Recommendation: In `fetchCurrentFile`, add explicit check to reject path traversal if called from internal services:
```typescript
if (!sanitized || sanitized.includes("..")) {
  throw new Error(`Invalid target file path "${config.targetFile}": path traversal is forbidden.`);
}
```

---

## 3. Comprehensive Line-by-Line Fix Strategy

The following table summarizes the exact mechanics and edge cases for the Worker implementation:

| Mechanism / Edge Case | Buggy Pattern / Pitfall | Robust Fix Pattern | Exact File & Line |
|---|---|---|---|
| **New File Creation** | Sending `sha: ""` or `sha: null` in payload causing GitHub 422 | `fetchCurrentFile` returns `{ content: "" }` with `sha: undefined`. In `makeSingleCommit`, only attach `params.sha` if `sha` is truthy. | `lib/core/commit-engine.ts:51-53, 101-103` |
| **0-Byte / Empty File** | `if (!data.content) return { content: "" };` drops `data.sha` | Safely decode `data.content` if string, and always return `sha: (data as any).sha`. | `lib/core/commit-engine.ts:41-49` |
| **Populated Existing File** | Missing `sha` parameter in `createOrUpdateFileContents` causing GitHub 422 | Always retrieve `sha` from `fetchCurrentFile` and pass `params.sha = sha`. | `lib/core/commit-engine.ts:70, 101-103` |
| **Directory Target Path** | `octokit.repos.getContent` returning Array -> crash or bad payload | `if (Array.isArray(data)) throw new Error('Target path is a directory')` | `lib/core/commit-engine.ts:33-35` |
| **Non-Regular File / Symlink** | `data.type !== "file"` causing corrupted updates | `if (typeof data !== "object" \|\| data === null \|\| data.type !== "file") throw new Error(...)` | `lib/core/commit-engine.ts:37-39` |
| **Batch Commits (2+ commits)** | Reusing stale SHA from first commit causing HTTP 409 Conflict | Call `fetchCurrentFile` at the start of every single commit in the batch loop. | `lib/core/commit-engine.ts:70, 128-137` |
| **Client Reuse in Batch** | Re-creating `new Octokit({ auth })` on each batch commit | Pass `sharedConfig = { ...config, client: octokit }` to all iterations. | `lib/core/commit-engine.ts:119-120` |
| **User Markdown Deletion** | Splitting on generic `"## "` deletes user headers | Split only on `/(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g`, keeping preceding text as `header`. | `lib/core/log-pruner.ts:5-46` |
| **Path Traversal Attacks** | Paths like `../secret.txt` or `dir/../../` accepted | Validate `!targetFile \|\| targetFile.includes("..") \|\| targetFile.length > 200` and normalize via `sanitizePath`. | `lib/core/log-pruner.ts:1-3`, `app/api/save-config/route.ts:43-51` |

---

## 4. Exact Proposed Code Diffs for Worker

### 4.1 Proposed Change 1: `lib/core/commit-engine.ts`

Ensure `fetchCurrentFile`, `makeSingleCommit`, and `makeBatchCommits` have defense-in-depth traversal guards and optimal client sharing:

```typescript
// Proposed lib/core/commit-engine.ts
import { Octokit } from "@octokit/rest";
import type {
  CommitConfig,
  SingleCommitResult,
  BatchResult,
  LogEntry,
} from "@/types/commit";
import { generateRealLogEntry, getTimestamp } from "./task-generator";
import { sanitizePath, pruneEntries } from "./log-pruner";

export { sanitizePath, pruneEntries, generateRealLogEntry, getTimestamp };
export type { CommitConfig, SingleCommitResult, BatchResult, LogEntry };

/**
 * Safely fetches the current target file content and its GitHub Blob SHA.
 * Guarantees that sha is returned whenever the file exists on GitHub (even if empty).
 */
export async function fetchCurrentFile(
  config: CommitConfig
): Promise<{ content: string; sha?: string }> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sanitized = sanitizePath(config.targetFile);

  if (!sanitized || sanitized.includes("..")) {
    throw new Error(`Invalid target file path "${config.targetFile}": path traversal is forbidden.`);
  }

  try {
    const { data } = await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: sanitized,
    });

    if (Array.isArray(data)) {
      throw new Error(`Target path "${config.targetFile}" is a directory, not a file.`);
    }

    if (typeof data !== "object" || data === null || (data as any).type !== "file") {
      throw new Error(`Target path "${config.targetFile}" is not a regular file.`);
    }

    let content = "";
    if (typeof (data as any).content === "string") {
      content = Buffer.from((data as any).content, "base64").toString("utf-8");
    }

    return {
      content,
      sha: (data as any).sha,
    };
  } catch (err: any) {
    if (err.status === 404) {
      return { content: "" }; // file does not exist yet — will be created with sha: undefined
    }
    throw err;
  }
}

/**
 * Makes a single commit to the target file. Returns message/sha/url for UI feedback.
 * Correctly passes existing blob SHA when updating, or undefined when creating new files.
 */
export async function makeSingleCommit(
  config: CommitConfig,
  messageSuffix?: string
): Promise<SingleCommitResult> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sanitized = sanitizePath(config.targetFile);
  const normalizedConfig = { ...config, targetFile: sanitized, client: octokit };

  const { content: currentContent, sha } = await fetchCurrentFile(normalizedConfig);

  const { commitMessage, logContent } = generateRealLogEntry();
  const fullMessage = messageSuffix ? `${commitMessage} ${messageSuffix}` : commitMessage;

  let newContent: string;
  if (currentContent && currentContent.length > 0) {
    newContent = currentContent.endsWith("\n")
      ? currentContent + logContent.replace(/^\n/, "")
      : currentContent + logContent;
  } else {
    newContent = `# DSA Practice & Build Activity Log\n\n${logContent.replace(/^\n/, "")}`;
  }

  newContent = pruneEntries(newContent, 5);

  const params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
  } = {
    owner: normalizedConfig.owner,
    repo: normalizedConfig.repo,
    path: normalizedConfig.targetFile,
    message: fullMessage,
    content: Buffer.from(newContent).toString("base64"),
  };

  if (sha) {
    params.sha = sha;
  }

  const { data } = await octokit.repos.createOrUpdateFileContents(params);

  return {
    commitMessage: fullMessage,
    sha: data.commit?.sha ?? "",
    commitUrl: data.commit?.html_url ?? "",
  };
}

/**
 * Makes `count` sequential commits to the user's target file.
 * Automatically keeps only the last 5 entries in a rolling loop.
 */
export async function makeBatchCommits(
  config: CommitConfig,
  count: number,
  label: string = "batch"
): Promise<BatchResult> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sharedConfig = { ...config, client: octokit };

  let committed = 0;
  const errors: string[] = [];
  let lastSha: string | undefined;
  let lastCommitUrl: string | undefined;

  for (let i = 1; i <= count; i++) {
    try {
      const { sha, commitUrl } = await makeSingleCommit(sharedConfig, `[${label} ${i}/${count}]`);
      lastSha = sha;
      lastCommitUrl = commitUrl;
      committed++;
    } catch (err: any) {
      errors.push(`Commit ${i} failed: ${err.message}`);
    }
  }

  return { committed, errors, lastSha, lastCommitUrl };
}
```

---

## 5. Verification Test Suite: `test_file_update.js`

The test harness `test_file_update.js` covers 14 distinct test assertions across 4 suites:

```
===============================================================
  NEXUS FILE UPDATE BUG FIX & CORE LOGIC VERIFICATION SUITE
===============================================================

--- Suite 1: Log Pruning & User Markdown Preservation ---
  ✔ [PASS] Preserves arbitrary user markdown sections (>5 headers) while pruning old Nexus entries
  ✔ [PASS] Handles brand new file header and rolling prune limit correctly
  ✔ [PASS] Handles headerless files starting directly with Nexus entries
  ✔ [PASS] Zero-entry pruning edge case: removes all entries when maxEntries <= 0 while preserving header
  ✔ [PASS] Sequential rolling commits test: 25 consecutive commits keep exact maxEntries without whitespace accumulation
  ✔ [PASS] Returns unmodified content for empty or non-Nexus content

--- Suite 2: Path Sanitization ---
  ✔ [PASS] Sanitizes whitespace, relative prefixes, forward slashes, and backslashes

--- Suite 3: GitHub File Operations & Commit Logic ---
  ✔ [PASS] New File Creation: 404 response -> creates file with sha: undefined
  ✔ [PASS] Pre-existing Empty File: returns existing sha and passes sha in update payload
  ✔ [PASS] Pre-existing Populated File: preserves user headers and supplies existing SHA
  ✔ [PASS] Directory and Non-File Rejection: throws clear error
  ✔ [PASS] Sequential Batch Commits: SHA evolves and propagates across commits
  ✔ [PASS] Sequential Batch Commits (20 iterations): exact maxEntries and zero whitespace drift over continuous GitHub commits

--- Suite 4: Save Config Route Path Validation ---
  ✔ [PASS] Target file path validation rejects directory traversal and empty strings

===============================================================
  ALL 14/14 TESTS PASSED SUCCESSFULLY!
===============================================================
```

Additionally, `test_adversarial_m1.js` verifies 14 adversarial edge cases (huge 1000-entry ReDoS test, CRLF endings, multi-language Unicode & ZWJ emojis, and partial batch commit failure recovery).

---

## 6. Recommendations for Worker & Next Steps

1. **Verify Standalone Test**: Ensure `node test_file_update.js` is established as the primary verification artifact for Milestone 1 (as required by Acceptance Criteria #1).
2. **Apply Defense-in-Depth Traversal Guard**: Add the path traversal check in `fetchCurrentFile` within `lib/core/commit-engine.ts`.
3. **Re-export Consistency**: Keep `lib/core/commit-engine.ts` as the canonical implementation. For Milestone 2/3 cleanup, legacy `lib/commit-helper.ts` will be removed.
4. **Pass to Test Runner**: Note the loader resolution requirement for `tests/run_all.js` so Milestone 2 can link `ts_loader.js` seamlessly.
