# Milestone 1: Standalone Test Suite Architecture & Verification Specification (`test_file_update.js`)

**Author**: Explorer 3 (Test Architecture & Verification Specialist)  
**Milestone**: Milestone 1 (Fix File Update Bug & Test Suite)  
**Target Repository**: Nexus (`/home/dev/Desktop/khurafati/Nexus`)  
**Date**: 2026-08-27  

---

## 1. Executive Summary

Milestone 1 focuses on resolving **Requirement 1 (GitHub File Update Bug)** and providing a bulletproof, zero-dependency, standalone verification test suite (`test_file_update.js`). 

The core defect in Nexus prior to this milestone was that generating automated commits against a new target file path succeeded (HTTP 201 Created), but attempting to update a pre-existing target file failed (HTTP 422 Unprocessable Entity or HTTP 409 Conflict). Secondary defects included destructive log pruning (erasing arbitrary user markdown headings in pre-existing files) and unsanitized file paths.

This document details the complete architectural design and executable specifications of the verification test suite in `test_file_update.js`. The test harness runs offline without live GitHub credentials, requires zero third-party test framework dependencies, and programmatically validates all six critical test cases.

---

## 2. Test Architecture Overview

### 2.1 Design Principles
1. **Zero External Test Framework Dependencies**: Built directly on Node.js standard modules (`node:assert`, `node:module`, `node:url`, `node:crypto`). No Jest, Mocha, or Vitest installations are required.
2. **Offline Hermetic Execution**: All GitHub REST API endpoints and storage operations are simulated via deterministic in-memory mock adapters mimicking real GitHub API HTTP status codes and payloads.
3. **Dual Execution Mode**: Designed to execute standalone via `node test_file_update.js` as well as integrate seamlessly with `npm test`.
4. **TypeScript Compatibility**: Uses Node's ES module loader registration (`tests/ts_loader.js`) to import and execute TypeScript source files (`lib/core/commit-engine.ts`, `lib/core/log-pruner.ts`) directly without a separate pre-compilation build step.

### 2.2 Test Architecture Diagram

```
+-------------------------------------------------------------------------------+
|                             test_file_update.js                               |
+-------------------------------------------------------------------------------+
       |                                              |
       v                                              v
+------------------------------------+  +-------------------------------------+
|      ESM TypeScript Loader         |  |         Mock Octokit Engine         |
|      (tests/ts_loader.js)          |  |   - GET /repos/.../contents/{path}  |
|  - Resolves .ts, .tsx, '@/...'     |  |   - PUT /repos/.../contents/{path}  |
|  - In-process module transpilation |  |   - Enforces SHA validation         |
+------------------------------------+  |   - Computes Git Blob SHAs          |
       |                                +-------------------------------------+
       v                                              |
+-------------------------------------------------------------------------------+
|                       Core Modules Under Verification                         |
|  1. lib/core/commit-engine.ts  (fetchCurrentFile, makeSingleCommit, makeBatch)|
|  2. lib/core/log-pruner.ts    (pruneEntries, sanitizePath)                    |
|  3. app/api/save-config/route.ts (path validation & traversal guards)         |
+-------------------------------------------------------------------------------+
       |
       v
+-------------------------------------------------------------------------------+
|                       The 6 Programmatic Test Cases                           |
|  [Case 1] Brand New File Creation        (404 -> 201 Created)                 |
|  [Case 2] Pre-existing Non-Empty File    (Blob SHA -> 200 OK)                 |
|  [Case 3] Pre-existing 0-Byte Empty File (Falsy Check Guard -> 200 OK)        |
|  [Case 4] Sequential Batch Commit Chain  (SHA Evolution across iterations)    |
|  [Case 5] Markdown Heading Preservation  (Non-destructive regex log pruning)  |
|  [Case 6] Path Traversal Rejection       (Guards against ../ attacks)         |
+-------------------------------------------------------------------------------+
```

---

## 3. Deep Dive into the 6 Mandatory Verification Cases

### 3.1 Case 1: Creating a Brand New Target File (HTTP 404 -> 201 Created)
- **Problem Statement**: When a target file does not yet exist in the repository, `octokit.repos.getContent` returns an HTTP 404 Not Found error. The commit engine must recognize 404 as a benign initial state and create the file without supplying a `sha` field in the payload.
- **GitHub API Contract**: `PUT /repos/{owner}/{repo}/contents/{path}` creates a new file if `sha` is `undefined`. If a dummy or empty `sha` is provided, GitHub rejects with HTTP 422.
- **Engine Logic Flow**:
  1. `fetchCurrentFile()` invokes `octokit.repos.getContent()`.
  2. The 404 error is caught:
     ```typescript
     if (err.status === 404) {
       return { content: "" }; // sha remains undefined
     }
     ```
  3. `makeSingleCommit()` receives `sha: undefined` and `currentContent: ""`.
  4. It initializes the file with `# DSA Practice & Build Activity Log\n\n${logContent}`.
  5. The parameter payload sets `params.sha = undefined`.
  6. `octokit.repos.createOrUpdateFileContents(params)` succeeds, returning HTTP 201 with commit metadata.
- **Test Specification**:
  ```javascript
  // Assertions in test_file_update.js
  const fileData = await fetchCurrentFile({ ...config, client: mockClient404 });
  assert.strictEqual(fileData.content, "");
  assert.strictEqual(fileData.sha, undefined, "SHA must be undefined for new files");

  const result = await makeSingleCommit({ ...config, client: mockClient404 });
  assert.strictEqual(result.sha, "new_file_commit_sha_111");
  assert.strictEqual(sentParams.sha, undefined, "Payload sha MUST be undefined for new files");
  assert.ok(decodedContent.includes("# DSA Practice & Build Activity Log"));
  ```

---

### 3.2 Case 2: Updating a Pre-existing Non-Empty File (Blob SHA -> 200 OK)
- **Problem Statement**: Updating an existing file requires providing the file's current Git Blob SHA (`params.sha`). If omitted, GitHub returns HTTP 422 Unprocessable Entity. If mismatched, GitHub returns HTTP 409 Conflict.
- **GitHub API Contract**: `GET /repos/{owner}/{repo}/contents/{path}` returns `{ type: "file", sha: "<blob_sha>", content: "<base64>", size: N }`. The `PUT` request must pass `sha: "<blob_sha>"`.
- **Engine Logic Flow**:
  1. `fetchCurrentFile()` retrieves file metadata and extracts `data.sha` and Base64-decoded `data.content`.
  2. `makeSingleCommit()` appends the new activity log to `currentContent`.
  3. `pruneEntries()` runs, preserving all pre-existing documentation headers while maintaining the rolling 5 timestamped entries.
  4. `makeSingleCommit()` attaches `params.sha = sha`.
  5. `createOrUpdateFileContents` sends the update payload with `params.sha` and receives HTTP 200 OK.
- **Test Specification**:
  ```javascript
  const result = await makeSingleCommit({
    targetFile: "./DOCS.md",
    client: mockClientPopulated, // returns existingSha = "abc123def456789"
  });

  assert.strictEqual(result.sha, "populated_updated_sha_333");
  assert.strictEqual(sentParams.sha, "abc123def456789", "Must supply existing file SHA");
  assert.ok(decoded.includes("## Introduction"), "Preserves Introduction");
  assert.ok(decoded.includes("## Setup"), "Preserves Setup");
  assert.ok(decoded.includes("## [2026-"), "Appends new timestamped entry");
  ```

---

### 3.3 Case 3: Updating a Pre-existing 0-Byte Empty File (Falsy Check Guard -> 200 OK)
- **Problem Statement**: When users connect a repository containing an empty file (`touch PROGRESS_LOG.md`), GitHub API returns `size: 0, content: "", sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"`. In buggy code, a naive check `if (!data.content)` evaluated `""` as falsy and returned early with `{ content: "" }`, dropping `data.sha`. Subsequent updates omitted `sha`, causing GitHub 422 errors.
- **Fixed Engine Logic Flow**:
  ```typescript
  let content = "";
  if (typeof (data as any).content === "string") {
    content = Buffer.from((data as any).content, "base64").toString("utf-8");
  }
  return {
    content,
    sha: (data as any).sha, // Always preserve SHA regardless of content length
  };
  ```
- **Test Specification**:
  ```javascript
  const fileData = await fetchCurrentFile({
    targetFile: "EMPTY_LOG.md",
    client: mockClientEmpty, // size: 0, content: "", sha: "e69de..."
  });
  assert.strictEqual(fileData.content, "");
  assert.strictEqual(fileData.sha, "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");

  const result = await makeSingleCommit({
    targetFile: "EMPTY_LOG.md",
    client: mockClientEmpty,
  });
  assert.strictEqual(sentParams.sha, "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  ```

---

### 3.4 Case 4: Sequential Batch Updates (Multi-Commit SHA Evolution)
- **Problem Statement**: When scheduled bursts run (e.g. 3 to 20 commits in a single execution), each commit modifies the file and produces a new Blob SHA. If subsequent commits in the loop use stale SHAs, GitHub rejects them with HTTP 409 Conflict.
- **Engine Logic Flow**:
  1. `makeBatchCommits(config, count, label)` executes a loop `1..count`.
  2. In each iteration, `makeSingleCommit()` calls `fetchCurrentFile()`.
  3. `fetchCurrentFile()` fetches the latest remote state and Blob SHA produced by the immediately preceding commit.
  4. Remote mock verifies that `params.sha === currentRemoteState.sha`.
  5. Test tracks commit history and validates the exact lineage: $SHA_0 \to SHA_1 \to SHA_2 \to \dots \to SHA_N$.
- **Test Specification**:
  ```javascript
  const result = await makeBatchCommits(config, 3, "burst-test");
  assert.strictEqual(result.committed, 3);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(commitHistory[0].shaUsed, "initial_sha_001");
  assert.strictEqual(commitHistory[1].shaUsed, commitHistory[0].newSha);
  assert.strictEqual(commitHistory[2].shaUsed, commitHistory[1].newSha);

  // 20-iteration continuous commit test
  const result20 = await makeBatchCommits(config, 20, "rolling-burst");
  assert.strictEqual(result20.committed, 20);
  assert.strictEqual(result20.errors.length, 0);
  assert.strictEqual(countNexusEntries(repoState.content), 5, "Exactly 5 rolling entries kept");
  ```

---

### 3.5 Case 5: Markdown Heading Preservation (Targeted Regex Log Pruning)
- **Problem Statement**: Naive pruning implementations split content on `"## "` and retained only the last 5 chunks. If a user file contained documentation sections (e.g. `## Overview`, `## Architecture`, `## Installation`, `## Config`, `## API`, `## Contributing`, `## License`), naive pruning erased sections 1 through 3 after 5 commits.
- **Engine Logic Flow**:
  1. `lib/core/log-pruner.ts` defines explicit regex patterns targeting Nexus timestamp headers:
     - Header start: `NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/`
     - Entry split: `NEXUS_SPLIT_RE = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g`
  2. Everything prior to the first Nexus timestamped entry is isolated as `header` and protected from truncation.
  3. Only the timestamped entries are sliced to `maxEntries` (default 5).
  4. Leading newlines are normalized to prevent newline drift (`\n\n` accumulation) across successive commits.
- **Test Specification**:
  ```javascript
  // 7 custom user headings + 8 Nexus log entries
  const pruned = pruneEntries(userDocWith8NexusEntries, 5);

  // All 7 user sections must remain intact
  assert.ok(pruned.includes("## Project Overview"));
  assert.ok(pruned.includes("## Architecture"));
  assert.ok(pruned.includes("## Installation"));
  assert.ok(pruned.includes("## Configuration"));
  assert.ok(pruned.includes("## API Reference"));
  assert.ok(pruned.includes("## Contributing"));
  assert.ok(pruned.includes("## License"));

  // Exactly 5 Nexus timestamped entries retained; entries 1-3 pruned
  const matches = pruned.match(/## \[2026-08-27 \d{2}:\d{2}:\d{2} UTC\]/g) || [];
  assert.strictEqual(matches.length, 5);
  assert.ok(!pruned.includes("commit entry 1\n"));
  assert.ok(pruned.includes("commit entry 8\n"));
  ```

---

### 3.6 Case 6: Path Traversal Rejection & Input Sanitization
- **Problem Statement**: Malicious or malformed target file inputs (e.g., `../../etc/passwd`, Windows backslashes `src\\log.md`, relative `./log.md`, leading `/log.md`) could cause security vulnerabilities or GitHub API 404/400 path resolution errors.
- **Engine & Route Logic Flow**:
  1. `sanitizePath(path)`:
     ```typescript
     export function sanitizePath(path: string): string {
       return path.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
     }
     ```
  2. Route validation in `app/api/save-config/route.ts`:
     ```typescript
     if (!targetFile || targetFile.length > 200 || targetFile.includes("..")) {
       return json({ error: "Invalid target file path" }, 400);
     }
     ```
- **Test Specification**:
  ```javascript
  // Normalization checks
  assert.strictEqual(sanitizePath("  ./src/logs/progress.md \n"), "src/logs/progress.md");
  assert.strictEqual(sanitizePath(".\\nested\\dir\\file.txt"), "nested/dir/file.txt");
  assert.strictEqual(sanitizePath("/PROGRESS_LOG.md"), "PROGRESS_LOG.md");

  // Traversal rejection checks
  assert.strictEqual(validateSaveConfigPath("../secret.txt").valid, false);
  assert.strictEqual(validateSaveConfigPath("src/../../etc/passwd").valid, false);
  assert.strictEqual(validateSaveConfigPath("").valid, false);
  assert.strictEqual(validateSaveConfigPath("a".repeat(201)).valid, false);
  ```

---

## 4. Test Suite Execution & Output Verification

### 4.1 Running the Standalone Suite
Execute from repository root:
```bash
node test_file_update.js
```

### 4.2 Verified Execution Output
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

---

## 5. Supplementary Test Coverage (`test_adversarial_m1.js`)

In addition to `test_file_update.js`, an adversarial test suite (`test_adversarial_m1.js`) verifies deep edge cases:
- **1,000-entry ReDoS stress test**: Prunes 1,000 entries in < 100ms.
- **Windows CRLF line endings (`\r\n`)**: Verified across all entry boundaries.
- **Multilingual Unicode & Emojis**: Preserves Japanese, Korean, Arabic (RTL), Hindi, surrogate pair CJK characters (`𠮷野家`), and complex ZWJ emoji sequences (`👨‍👩‍👧‍👦`).
- **HTTP Error Propagation**: Verifies that 401, 403, and 500 errors from GitHub are never swallowed or masked as 404.
- **Partial Failure Recovery**: In a 3-commit batch where commit 2 encounters a transient error, commits 1 and 3 complete successfully with error reporting.

---

## 6. Recommendations for Implementers & Downstream Milestones

1. **Package Script Integration (Milestone 3)**:
   - Update `package.json` scripts:
     ```json
     "scripts": {
       "test:r1": "node test_file_update.js",
       "test": "node test_file_update.js"
     }
     ```
2. **ES Module Declaration (Milestone 3)**:
   - Add `"type": "module"` to `package.json` to eliminate Node's `MODULE_TYPELESS_PACKAGE_JSON` warning.
3. **Master Runner Loader Integration (Milestone 2)**:
   - Ensure `tests/run_all.js` registers `ts_loader.js` prior to dynamically importing test tiers.
4. **Documentation Alignment (Milestone 4)**:
   - Ensure `AUDIT_REPORT.md` and `DEVELOPER_GUIDE.md` reference `test_file_update.js` as the primary verification artifact for Requirement 1.
