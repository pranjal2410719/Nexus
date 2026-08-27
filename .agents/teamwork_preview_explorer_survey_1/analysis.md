# Nexus Requirement 1 (R1 - File Update Bug) Deep-Scan Analysis Report

**Date**: 2026-08-27  
**Agent**: Explorer Survey 1 (`teamwork_preview_explorer_survey_1`)  
**Mission**: Pinpoint the root cause of Requirement 1 (R1 - File Update Bug), trace exact execution paths, detail reproduction scenarios, provide exact logic fix strategies, and document code evidence.

---

## Executive Summary

In Requirement 1, the reported defect is:
> *"Providing a target file name creates and updates a new file successfully, but fails to update the file if it already exists."*

### Core Root Cause
The root cause originates in the GitHub REST API (`@octokit/rest`) contents API specification (`PUT /repos/{owner}/{repo}/contents/{path}` / `repos.createOrUpdateFileContents`):
1. **New File Creation**: When creating a file that does not yet exist on GitHub, the `sha` field **must be omitted** (`undefined`).
2. **Existing File Update**: When updating a file that already exists on GitHub (whether populated or 0 bytes), the request **strictly requires** the current Git Blob SHA (`sha: "<current-blob-sha>"`).
3. **The Failure Mode**: If the file inspection mechanism (`fetchCurrentFile` / `getContent`) fails to extract the blob `sha` (e.g., due to truthiness checks on empty content, path formatting mismatch between `getContent` and `createOrUpdateFileContents`, or unhandled response structures), `sha` evaluates to `undefined`. When `makeSingleCommit` submits the payload without `sha`, GitHub interprets the request as an attempt to create a file at a path that already exists, rejecting it with HTTP `422 Unprocessable Entity: "sha" wasn't supplied`. Conversely, for a non-existent file, `getContent` returns 404, setting `sha = undefined`, which satisfies GitHub's creation criteria and causes new file creation to succeed while existing file updates consistently fail.

---

## Complete Code Execution Paths & Architecture Flow

The handling of target files and commit operations spans 5 architectural layers:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 1. Frontend Layer: components/dashboard/config-form.tsx                          │
│    - User inputs `targetFile` (e.g. "PROGRESS_LOG.md", "./LOG.md")               │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 2. API Config Route: app/api/save-config/route.ts                                │
│    - Sanitizes path: `.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "")`        │
│    - Rejects path traversal (`..`), empty strings, length > 200                  │
│    - Persists config via `saveUser()` to Netlify Blobs / Local File Store        │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
┌───────────────────────────────────────────┐ ┌────────────────────────────────────┐
│ 3A. Manual Trigger:                       │ │ 3B. Scheduled Trigger:             │
│     app/api/commit-now/route.ts           │ │     netlify/functions/heartbeat.ts │
│     - Decrypts token                      │ │     - Checks 15-min window         │
│     - Calls `makeSingleCommit()`          │ │     - Calls `makeBatchCommits()`   │
└────────────────────┬──────────────────────┘ └──────────────────┬─────────────────┘
                     │                                           │
                     └───────────────────┬───────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 4. Core Commit Engine: lib/core/commit-engine.ts & lib/core/log-pruner.ts        │
│    - `sanitizePath()`: strips leading `./`, slashes, backslashes                 │
│    - `fetchCurrentFile()`: calls `octokit.repos.getContent()`                     │
│      • 404 -> `{ content: "", sha: undefined }` (New file)                       │
│      • 200 -> Validates regular file, decodes base64, returns `{ content, sha }` │
│    - `generateRealLogEntry()`: builds DSA log markdown and commit message        │
│    - `pruneEntries()`: retains latest 5 Nexus entries; preserves user headers    │
│    - `octokit.repos.createOrUpdateFileContents()`:                               │
│      • Injects `params.sha = sha` ONLY when `sha` is present                     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 5. GitHub Remote / Mock Engine: Octokit REST API                                 │
│    - Validates presence of `sha` on pre-existing files                           │
│    - Atomically updates blob & generates new commit SHA                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Root Cause Analysis & Flaw Breakdown

### 1. The GitHub Blob SHA Obligation
- **GitHub API Rule**: `PUT /repos/{owner}/{repo}/contents/{path}` creates a file when no `sha` is provided. If a file already exists at `path`, passing no `sha` returns HTTP 422 (`"sha" wasn't supplied`). Passing an outdated `sha` returns HTTP 409 (`sha does not match current`).
- **Asymmetry**: When a user creates a new file, `fetchCurrentFile` catches 404 and returns `sha: undefined`. `makeSingleCommit` sends no `sha`, and GitHub creates the file. But when a file already exists, any bug in `fetchCurrentFile` that yields `sha: undefined` turns what should be an update into an invalid create attempt, throwing HTTP 422.

### 2. The 0-Byte / Empty Pre-Existing File Edge Case
- When a user initializes an empty repository or creates an empty file (`touch PROGRESS_LOG.md`), GitHub returns:
  ```json
  {
    "type": "file",
    "size": 0,
    "content": "",
    "sha": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
  }
  ```
- Naive implementations checking `if (!data.content)` or returning early without capturing `data.sha` cause `sha` to be lost for empty files, triggering 422 on the very first update to a newly created empty file.

### 3. Path Discrepancies (`./file.md` vs `file.md`)
- Users often enter `./PROGRESS_LOG.md` or `src\logs\log.md`.
- If `getContent` uses a raw unsanitized path while GitHub normalizes paths or vice-versa, `getContent` returns 404 (file not found), prompting the engine to omit `sha`. However, when `createOrUpdateFileContents` runs, GitHub resolves the normalized repository path, detects an existing file, and throws 422 due to the missing `sha`.

### 4. Non-Destructive Markdown Pruning vs. User Header Destruction
- In naive implementations of rolling log truncation, `pruneEntries` split files on `\n## ` and retained only the last 5 sections.
- If a target file pre-existed with documentation (e.g. `## Overview`, `## Architecture`, `## Setup`, `## API`), updating the file deleted all user headings, destroying user content.
- The robust fix uses a strict regex `/(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/` to prune only automated Nexus log entries while preserving all user markdown content.

### 5. Multi-Commit Sequential Batch Chaining
- In `makeBatchCommits(config, count)`, if commits 1 to `count` are executed in a loop, each commit changes the remote Git Blob SHA.
- If the SHA is cached or not re-fetched via `fetchCurrentFile` on each iteration, commit 1 succeeds, but commit 2 fails with HTTP 409 Conflict because the old SHA is stale.

---

## Code Evidence & File Map

| File Path | Lines | Key Responsibility & Behavior |
|---|---|---|
| `lib/core/commit-engine.ts` | 21–56 | `fetchCurrentFile`: queries GitHub `repos.getContent`, validates `data.type === "file"`, extracts `data.sha` even if empty, returns `{ content: "", sha: undefined }` on 404. |
| `lib/core/commit-engine.ts` | 62–112 | `makeSingleCommit`: normalizes `targetFile`, fetches content & SHA, generates log entry, prunes entries, conditionally attaches `params.sha = sha` if present, and invokes `repos.createOrUpdateFileContents`. |
| `lib/core/commit-engine.ts` | 118–140 | `makeBatchCommits`: executes sequential commits in a loop, re-fetching the updated SHA on each iteration to prevent 409 conflicts. |
| `lib/core/log-pruner.ts` | 1–3 | `sanitizePath`: normalizes `./`, `/`, `\`, and whitespace from file paths. |
| `lib/core/log-pruner.ts` | 5–46 | `pruneEntries`: matches timestamped Nexus entries `NEXUS_ENTRY_RE` and preserves all custom user headers and markdown structure. |
| `app/api/save-config/route.ts` | 43–52 | Sanitizes and validates `targetFile` against length limits and directory traversal (`..`). |
| `app/api/commit-now/route.ts` | 41–50 | Resolves user config, decrypts token, and invokes `makeSingleCommit`. |
| `netlify/functions/heartbeat.ts` | 13–17, 160–170 | Decrypts token and invokes `makeBatchCommits` for all due schedule slots. |
| `lib/commit-helper.ts` | 1–267 | Legacy / un-restructured copy of the commit engine (candidates for cleanup in R2/R3). |

---

## Code Snippets from Codebase

### 1. Safe File & SHA Fetching (`lib/core/commit-engine.ts:21-56`)
```typescript
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

### 2. Conditional SHA Injection on Commit (`lib/core/commit-engine.ts:86-106`)
```typescript
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
```

### 3. Non-Destructive Markdown Pruning (`lib/core/log-pruner.ts:5-46`)
```typescript
const NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/;
const NEXUS_SPLIT_RE = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g;

export function pruneEntries(content: string, maxEntries: number = 5): string {
  if (!content) return content;

  const match = content.match(NEXUS_ENTRY_RE);
  if (!match || match.index === undefined) {
    return content;
  }

  const firstEntryIndex = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const header = content.slice(0, firstEntryIndex);

  if (maxEntries <= 0) {
    return header ? header.trimEnd() + "\n" : "";
  }

  const entriesText = content.slice(firstEntryIndex);
  const entries = entriesText.split(NEXUS_SPLIT_RE);

  if (entries.length <= maxEntries) {
    return content;
  }

  const keptEntries = entries.slice(-maxEntries);
  keptEntries[0] = keptEntries[0].replace(/^\n+/, "");

  const joined = keptEntries.join("");
  if (!header) {
    return joined;
  }
  return header.endsWith("\n") ? header + joined : header + "\n" + joined;
}
```

---

## Reproduction Scenarios & Test Verification Matrix

| Scenario # | Condition / Input | Expected Behavior | Failure Symptom If Bug Present |
|---|---|---|---|
| **Scenario 1** | Target file does not exist on GitHub (HTTP 404). | `fetchCurrentFile` returns `sha: undefined`. `createOrUpdateFileContents` called without `sha`. File created (201 Created). | Error if engine demands `sha` for new file. |
| **Scenario 2** | Pre-existing populated file with custom user documentation (`## Intro`, `## Architecture`). | `fetchCurrentFile` returns content + existing `sha`. `createOrUpdateFileContents` supplies `sha`. New commit appended; user headers preserved. | HTTP 422 if `sha` omitted; user headers deleted if naive pruning used. |
| **Scenario 3** | Pre-existing 0-byte empty file (`size: 0, content: ""`). | `fetchCurrentFile` extracts `data.sha`. `createOrUpdateFileContents` supplies `sha`. Header + initial log entry committed. | HTTP 422 if empty content causes `sha` to be omitted. |
| **Scenario 4** | Unsanitized target path (e.g. `./docs/LOG.md` or ` \nested\file.md `). | `sanitizePath` normalizes to `docs/LOG.md` and `nested/file.md` across both `getContent` and `createOrUpdateFileContents`. | HTTP 404 / 422 due to path mismatch. |
| **Scenario 5** | Sequential batch commits (`count = 5`). | Each commit iteration re-queries `fetchCurrentFile` and passes fresh `sha`. All 5 commits succeed. | HTTP 409 Conflict on commit 2 if SHA is stale/cached. |
| **Scenario 6** | Target path points to a directory or submodule. | `fetchCurrentFile` detects `Array.isArray(data)` or `data.type !== "file"` and rejects with descriptive error. | Unhandled exception or corrupt write attempt. |

---

## Recommended Verification Commands

To verify that the file update bug is completely resolved and passes all regression, adversarial, and unit suites:

```bash
# 1. Run the dedicated verification test script for Requirement 1
node test_file_update.js

# 2. Run the adversarial challenger harness
node test_adversarial_m1.js

# 3. Run all comprehensive tier suites
node tests/run_all.js

# 4. Run TypeScript typecheck to verify interface conformity
npm run typecheck
```

---

## Conclusion & Hand-Off Summary

1. The root cause of the file update bug is the asymmetry in GitHub's REST API between file creation (must not have `sha`) and file updates (must have `sha`), exacerbated by 0-byte files, path formatting mismatches, and destructive log pruning.
2. The core logic in `lib/core/commit-engine.ts` and `lib/core/log-pruner.ts` correctly handles this by:
   - Always capturing and returning Git Blob `sha` whenever a file exists (including 0-byte files).
   - Only omitting `sha` on 404 Not Found.
   - Normalizing paths before all GitHub operations via `sanitizePath`.
   - Safely pruning only timestamped Nexus log entries via `NEXUS_ENTRY_RE`, preserving user documentation.
   - Re-fetching the updated SHA between sequential commits in `makeBatchCommits`.
3. The standalone verification script `test_file_update.js` in the repository root tests all of these behaviors exhaustively.
