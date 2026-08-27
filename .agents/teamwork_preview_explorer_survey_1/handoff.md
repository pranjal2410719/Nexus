# Handoff Report — Requirement 1 (R1 - File Update Bug Investigation)

**Agent**: Explorer Survey 1 (`teamwork_preview_explorer_survey_1`)  
**Date**: 2026-08-27  
**Task**: Root Cause Investigation of File Update Bug (R1)  
**Target Recipient**: Project Orchestrator (`e6744fa1-a720-4bab-bc81-77e23582b12e`) & Implementer

---

## 1. Observation

1. **GitHub REST API Payload Requirements**:
   Under GitHub's Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`), creating a new file requires omitting the `sha` field or passing `undefined`. Updating an existing file requires providing the current blob `sha` (`sha: string`). Failing to supply `sha` on an existing file triggers HTTP `422 Unprocessable Entity` (`"Invalid request. \"sha\" wasn't supplied."`), while providing a stale `sha` triggers HTTP `409 Conflict`.

2. **Commit Engine Implementation (`lib/core/commit-engine.ts:21-56`)**:
   `fetchCurrentFile(config: CommitConfig)`:
   - Calls `octokit.repos.getContent({ owner: config.owner, repo: config.repo, path: sanitized })`.
   - On HTTP 404 (catch block line 51-54): returns `{ content: "" }` with `sha: undefined`.
   - On HTTP 200: validates `Array.isArray(data)` (line 33-35) and `(data as any).type !== "file"` (line 37-39).
   - Decodes base64 content and returns `{ content, sha: (data as any).sha }` (lines 46-49).

3. **Commit Creation & Update Execution (`lib/core/commit-engine.ts:62-112`)**:
   `makeSingleCommit(config: CommitConfig, messageSuffix?: string)`:
   - Sanitizes path: `const sanitized = sanitizePath(config.targetFile);` (line 67).
   - Calls `fetchCurrentFile(normalizedConfig)` (line 70).
   - Constructs params for `repos.createOrUpdateFileContents` (lines 86-99).
   - Injects `sha` conditionally:
     ```typescript
     if (sha) {
       params.sha = sha;
     }
     ```
   - Invokes `await octokit.repos.createOrUpdateFileContents(params)` (line 105).

4. **Batch Sequential Chaining (`lib/core/commit-engine.ts:118-140`)**:
   `makeBatchCommits(config: CommitConfig, count: number)`:
   - Loops `1..count` calling `makeSingleCommit(config)` on each iteration (line 130), thereby re-fetching the updated SHA for each sequential commit.

5. **Path Normalization & Regex Pruning (`lib/core/log-pruner.ts:1-46`)**:
   - `sanitizePath`: `return path.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");` (line 1-3).
   - `pruneEntries`: matches timestamped entries via `NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/` (line 5), preserving all preceding user markdown headers (lines 20-22, 41-45).

6. **Entry Points & Configuration Routes**:
   - `app/api/save-config/route.ts:43-52`: Target file sanitization and validation (`length <= 200`, no `..`).
   - `app/api/commit-now/route.ts:41-49`: Manual dispatch handler calling `makeSingleCommit`.
   - `netlify/functions/heartbeat.ts:160-170`: Cron scheduler calling `makeBatchCommits`.
   - `components/dashboard/config-form.tsx:70-78`: UI target file input field.

7. **Test Verification Suite**:
   - `test_file_update.js`: 651 lines of tests covering new file creation (sha: undefined), pre-existing empty file update (0-byte file sha preservation), populated file update (custom header preservation), directory rejection, path sanitization, and 25 rolling sequential commits.

---

## 2. Logic Chain

1. **Step 1 (API Contract Asymmetry)**:
   From Observation 1, creating a new file requires `sha = undefined`, whereas updating an existing file requires `sha = <blob_sha>`.
2. **Step 2 (Root Cause of Bug)**:
   When an application attempts to update an existing file without fetching or forwarding its `sha` (or drops `sha` on empty files where `content === ""`), `createOrUpdateFileContents` is sent with `sha: undefined`. GitHub interprets this as a file creation request, detects that the file already exists, and rejects the request with HTTP 422. Conversely, for a new file that does not exist, `getContent` returns 404, setting `sha = undefined`, which matches the requirement for creating a file. Hence, new file creation succeeded while existing file update failed.
3. **Step 3 (Path Mismatch Vector)**:
   From Observation 5 and Observation 6, if path sanitization is not consistently applied across `getContent` and `createOrUpdateFileContents`, relative paths (e.g. `./LOG.md`) query mismatched GitHub resources, returning 404 during fetch and failing with 422 during update.
4. **Step 4 (User Data Preservation)**:
   From Observation 5, naive markdown pruning splitting on `\n## ` deleted pre-existing user headings. The regex `NEXUS_ENTRY_RE` specifically targets automated timestamped entries, preserving all pre-existing documentation.
5. **Step 5 (Sequential Batch Safety)**:
   From Observation 4, re-querying `fetchCurrentFile` on each iteration in `makeBatchCommits` ensures that the newly created blob SHA from commit $N$ is supplied to commit $N+1$, preventing HTTP 409 Conflict.

---

## 3. Caveats

- **Legacy File Overlap**: `lib/commit-helper.ts` exists as a duplicate/legacy file alongside `lib/core/commit-engine.ts`. All active routes (`commit-now`, `heartbeat`, and test suites) currently import `lib/core/commit-engine.ts`. Removing or aliasing `lib/commit-helper.ts` is recommended during Requirement 2 & 3 cleanup.
- **Concurrent Writes (Optimistic Concurrency)**: If two concurrent dispatches (e.g. simultaneous manual dispatch and heartbeat tick) target the same user file at the exact same millisecond, the second write will receive a 409 Conflict from GitHub. An optimistic retry loop could be added if extreme concurrency is required.

---

## 4. Conclusion

- The root cause of Requirement 1 is fully identified and cataloged: GitHub Contents API requires the existing blob `sha` on updates and rejects requests with HTTP 422 if omitted.
- The robust solution in `lib/core/commit-engine.ts` and `lib/core/log-pruner.ts`:
  1. Accurately extracts `sha` for all existing files (including 0-byte/empty files).
  2. Conditionally attaches `params.sha = sha` only when present.
  3. Sanitizes all paths uniformly (`sanitizePath`).
  4. Preserves arbitrary user markdown documentation while pruning automated entries (`pruneEntries`).
  5. Chains blob SHAs sequentially across multi-commit batches.
- The standalone test script `test_file_update.js` serves as the authoritative verification harness for Requirement 1.

---

## 5. Verification Method

To independently verify the bug fix and all associated edge cases:

1. **Run Verification Script**:
   ```bash
   node test_file_update.js
   ```
   *Expected Output*: All test suites pass (Log Pruning & User Markdown Preservation, Path Sanitization, GitHub File Operations & Commit Logic, Sequential Rolling Commits).

2. **Run Milestone Adversarial Harness**:
   ```bash
   node test_adversarial_m1.js
   ```
   *Expected Output*: 100% tests passing across path sanitization, 0-byte file handling, and 10 sequential batch commits.

3. **Inspect Core Code**:
   - Inspect `lib/core/commit-engine.ts` (lines 21–112) to verify `fetchCurrentFile` and `makeSingleCommit` handling of `sha`.
   - Inspect `lib/core/log-pruner.ts` (lines 1–46) to verify `sanitizePath` and `pruneEntries`.

4. **Invalidation Conditions**:
   - If `fetchCurrentFile` returns `sha: undefined` for an existing file.
   - If `makeSingleCommit` calls `createOrUpdateFileContents` without `params.sha` when updating an existing file.
   - If `pruneEntries` deletes non-timestamped `## ` headings from user documents.
