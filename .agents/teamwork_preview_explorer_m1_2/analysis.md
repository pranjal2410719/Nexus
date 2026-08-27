# Milestone 1 Deep Investigation: File Update, Appending & Safe Log Pruning

**Author**: Explorer 2 (Milestone 1 — File Update & Safe Log Pruning)  
**Target Repository**: Nexus (`/home/dev/Desktop/khurafati/Nexus`)  
**Working Directory**: `/home/dev/Desktop/khurafati/Nexus/.agents/teamwork_preview_explorer_m1_2`  
**Date**: 2026-08-27  

---

## 1. Executive Summary

In Milestone 1, we investigated Requirement 1 (R1): fixing the GitHub target file update defect, preserving user markdown headings in pre-existing files, and establishing a rigorous verification test harness (`test_file_update.js`).

### Core Findings:
1. **GitHub File Update Defect**:
   - When updating an existing file, the GitHub REST API (`PUT /repos/{owner}/{repo}/contents/{path}` via `octokit.repos.createOrUpdateFileContents`) strictly requires the existing file's remote Blob SHA (`params.sha`).
   - In naive implementations, 0-byte/empty files failed with **HTTP 422 Unprocessable Entity** because falsy checks (`if (!data.content)`) dropped the SHA.
   - Sequential batch commits failed with **HTTP 409 Conflict** when the file was not re-fetched between commits to obtain the evolving Blob SHA.
2. **Destructive Log Pruning Defect**:
   - Naive string splitting on generic `"## "` delimiters treated every markdown H2 section in the target file (such as `## Overview`, `## Architecture`, `## Installation`, `## API Reference`, `## License`) as a discardable log entry.
   - After 5 automated commits, all pre-existing user markdown headings and text were permanently erased, causing catastrophic data loss.
3. **The Solution**:
   - A deterministic two-zone partitioning strategy using targeted regular expressions (`/(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/` and `/(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g`).
   - Zone 1 (User Content Header) is isolated and preserved 100% untouched.
   - Zone 2 (Nexus Timestamped Log Entries) is cleanly split and pruned to the rolling `maxEntries` limit (e.g. 5 or 50 entries) without whitespace drift.
4. **Empirical Verification**:
   - Standalone verification script `test_file_update.js` executes 14 unit and mock-GitHub tests with a 100% pass rate.
   - Adversarial harness `test_adversarial_m1.js` executes 14 stress tests (1,000-entry ReDoS benchmarks, CRLF normalization, Unicode/Emoji integrity, partial batch failure recovery) with a 100% pass rate.

---

## 2. Architecture & File Lifecycle in `lib/core/` and `lib/github/`

The commit orchestration and file modification lifecycle is encapsulated within `lib/core/`:

```
lib/
├── core/
│   ├── log-pruner.ts       # Path sanitization (sanitizePath) & Safe regex log pruning (pruneEntries)
│   ├── task-generator.ts   # Synthetic DSA task selection, UTC timestamps & log entry generation
│   └── commit-engine.ts    # File retrieval (fetchCurrentFile), single commit (makeSingleCommit), batch runner (makeBatchCommits)
├── github/
│   ├── client.ts           # Octokit client factory (getOctokitClient)
│   └── repo-service.ts     # User repository listing & pagination (listUserRepos)
└── types/
    ├── commit.ts           # CommitConfig, LogEntry, SingleCommitResult, BatchResult
    └── github.ts           # Repo, GitHubUser, GitHubTokenResponse
```

### 2.1 File Content Formatting & Appending Call Chain

```
[Trigger: POST /api/commit-now OR netlify/functions/heartbeat]
                           │
                           ▼
               makeSingleCommit(config)
                           │
                           ├─► sanitizePath(config.targetFile)
                           │
                           ├─► fetchCurrentFile(normalizedConfig)
                           │      │
                           │      ├─► octokit.repos.getContent({ owner, repo, path })
                           │      │      ├─► 200 OK: extract base64 content AND blob SHA
                           │      │      └─► 404 Not Found: return { content: "", sha: undefined }
                           │      │
                           │      └─► validate: reject directory (Array) or non-file (symlink/submodule)
                           │
                           ├─► generateRealLogEntry()
                           │      │
                           │      ├─► Select task from REAL_TASKS (C++ DSA code + complexity summary)
                           │      ├─► Generate UTC timestamp: "YYYY-MM-DD HH:MM:SS UTC"
                           │      └─► Build structured entry: "\n## [YYYY-MM-DD HH:MM:SS UTC] feat(scope): desc\n\n..."
                           │
                           ├─► Format & Append:
                           │      ├─ If currentContent is empty:
                           │      │     newContent = "# DSA Practice & Build Activity Log\n\n" + logContent.trimStart()
                           │      └─ If currentContent exists:
                           │            newContent = currentContent (+ "\n" if missing) + logContent.trimStart()
                           │
                           ├─► pruneEntries(newContent, maxEntries = 5)
                           │      │
                           │      ├─ Partition into Zone 1 (Header) & Zone 2 (Nexus Entries)
                           │      ├─ Slice Zone 2 to last maxEntries
                           │      └─ Reassemble without leading newline drift
                           │
                           └─► octokit.repos.createOrUpdateFileContents({
                                  owner, repo, path, message,
                                  content: Buffer.from(newContent).toString("base64"),
                                  sha: existingSha // included ONLY if file pre-existed
                               })
```

---

## 3. Deep Root-Cause Analysis: Naive String Splitting vs Safe Regex Pruning

### 3.1 The Naive Pruning Bug (`content.split("\n## ")`)

In the naive implementation, pruning was implemented as:

```typescript
// ❌ BUGGY NAIVE IMPLEMENTATION:
function pruneEntriesNaive(content: string, maxEntries: number = 5): string {
  const parts = content.split("\n## ");
  if (parts.length <= maxEntries + 1) return content;
  const header = parts[0];
  const kept = parts.slice(-maxEntries);
  return header + "\n## " + kept.join("\n## ");
}
```

### 3.2 Concrete Reproduction & Data Loss Walkthrough

Consider a developer connecting an existing repository whose `README.md` contains standard documentation sections:

```markdown
# Nexus Developer Workspace

## Project Overview
Nexus is an automated commit orchestrator.

## Architecture
Built with Next.js 15 and Netlify Functions.

## Installation
Run npm install to configure dependencies.

## Configuration
Set GITHUB_CLIENT_ID and BLOBS_MASTER_KEY.

## API Reference
GET /api/me returns user profile.

## License
MIT License
```

#### Step-by-Step Execution Failure:
1. The user's pre-existing `README.md` contains **6 distinct `## ` headings**.
2. Naive splitting on `"\n## "` splits the document into 7 parts:
   - `parts[0]`: `# Nexus Developer Workspace`
   - `parts[1]`: `Project Overview\nNexus is...`
   - `parts[2]`: `Architecture\nBuilt with...`
   - `parts[3]`: `Installation\nRun npm...`
   - `parts[4]`: `Configuration\nSet GITHUB...`
   - `parts[5]`: `API Reference\nGET /api...`
   - `parts[6]`: `License\nMIT License`
3. When Nexus fires 5 commits, 5 timestamped entries are appended to the document:
   - `parts[7]`: `[2026-08-27 10:01:00 UTC] feat(dsa): entry 1...`
   - `parts[8]`: `[2026-08-27 10:02:00 UTC] feat(dsa): entry 2...`
   - `parts[9]`: `[2026-08-27 10:03:00 UTC] feat(dsa): entry 3...`
   - `parts[10]`: `[2026-08-27 10:04:00 UTC] feat(dsa): entry 4...`
   - `parts[11]`: `[2026-08-27 10:05:00 UTC] feat(dsa): entry 5...`
4. Now `parts.length = 12`. Since `12 > 5 + 1`:
   - `parts.slice(-5)` extracts `[parts[7], parts[8], parts[9], parts[10], parts[11]]` (the 5 Nexus commits).
   - `parts[0]` is `# Nexus Developer Workspace`.
   - The returned string is `parts[0]` + `"\n## "` + the 5 Nexus commits.
5. **CATASTROPHIC DATA LOSS**: `parts[1]` through `parts[6]` (`Project Overview`, `Architecture`, `Installation`, `Configuration`, `API Reference`, `License`) **have been completely erased from the user's repository**.

### 3.3 Secondary Failure Modes of Naive Splitting
- **Code Block Corruption**: If a code snippet inside the markdown file contains a comment like `## comment` or `# ## pattern`, naive splitting breaks inside the code block, corrupting syntax.
- **Whitespace Accumulation**: Repeated `join("\n## ")` cycles introduce newline drift or malformed heading prefixes (`\n\n\n## `) over sequential commits.

---

## 4. The Regex-Based Two-Zone Pruning Algorithm

To guarantee 100% preservation of all pre-existing user content while rolling Nexus automated log entries at `maxEntries`, we formulate the **Two-Zone Partitioning Strategy**.

### 4.1 Regular Expression Definitions

```typescript
// 1. Locates the very first Nexus timestamped entry in the document
const NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/;

// 2. Positive lookahead: splits between successive Nexus entries without consuming characters
const NEXUS_SPLIT_RE = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g;
```

### 4.2 Algorithm Step-by-Step Specification

```typescript
export function pruneEntries(content: string, maxEntries: number = 5): string {
  if (!content) return content;

  // Step 1: Detect if any Nexus log entries exist in the document
  const match = content.match(NEXUS_ENTRY_RE);
  if (!match || match.index === undefined) {
    // Zero Nexus entries exist -> Document is 100% user content -> Return unchanged
    return content;
  }

  // Step 2: Calculate boundary between Zone 1 (User Header) and Zone 2 (Nexus Log Entries)
  const firstEntryIndex = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const header = content.slice(0, firstEntryIndex);

  // Step 3: Handle boundary condition where maxEntries <= 0
  if (maxEntries <= 0) {
    return header ? header.trimEnd() + "\n" : "";
  }

  // Step 4: Extract Zone 2 (Nexus Entries) and split with positive lookahead
  const entriesText = content.slice(firstEntryIndex);
  const entries = entriesText.split(NEXUS_SPLIT_RE);

  // Step 5: If current count is within limit, retain full document
  if (entries.length <= maxEntries) {
    return content;
  }

  // Step 6: Keep only the trailing maxEntries
  const keptEntries = entries.slice(-maxEntries);

  // Step 7: Prevent newline accumulation by stripping leading newlines from the first kept entry
  keptEntries[0] = keptEntries[0].replace(/^\n+/, "");

  // Step 8: Reassemble Zone 1 (Header) + Zone 2 (Kept Entries)
  const joined = keptEntries.join("");
  if (!header) {
    return joined;
  }
  return header.endsWith("\n") ? header + joined : header + "\n" + joined;
}
```

### 4.3 Key Mathematical & Structural Invariants
| Invariant | Guarantee |
|---|---|
| **Immutable Zone 1** | Any text before the first `## [YYYY-MM-DD HH:MM:SS UTC]` entry is preserved character-for-character, regardless of how many `## ` headings, code blocks, or emojis it contains. |
| **Non-Destructive Splitting** | `NEXUS_SPLIT_RE` uses a zero-width positive lookahead `(?=\n## ...)`. No delimiters are eaten or transformed during `split()`. |
| **Whitespace Stability** | Slicing entries from the middle of Zone 2 exposes a leading `\n` on `keptEntries[0]`. Stripping it via `keptEntries[0].replace(/^\n+/, "")` ensures the distance between `header` and entry 1 remains constant over $N$ commits. |
| **ReDoS Immunity** | Both regexes are linear time $O(L)$, using non-backtracking character classes (`\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC`). Benchmark: 1,000 entries parse in < 5ms. |

---

## 5. Summary of `lib/core/` and `lib/github/` Source Files

### 5.1 `lib/core/log-pruner.ts`
- Exports `sanitizePath(path: string): string`
  - Normalizes backslashes: `path.replace(/\\/g, "/")`
  - Removes relative `./` or `/`: `path.replace(/^\.?\/+/, "")`
- Exports `pruneEntries(content: string, maxEntries: number = 5): string`

### 5.2 `lib/core/task-generator.ts`
- Exports `REAL_TASKS`: Curated list of realistic DSA problems (Trees, DP, Graphs, Strings, Arrays, Backtracking).
- Exports `getTimestamp()`: ISO-compliant `YYYY-MM-DD HH:MM:SS UTC` timestamp string.
- Exports `generateRealLogEntry()`: Returns `{ commitMessage, logContent }`.

### 5.3 `lib/core/commit-engine.ts`
- Exports `fetchCurrentFile(config: CommitConfig): Promise<{ content: string; sha?: string }>`
  - Handles 404 (new file) -> returns `{ content: "", sha: undefined }`
  - Handles 200 with 0-byte file -> returns `{ content: "", sha: "<blob_sha>" }`
  - Rejects directories (`Array.isArray(data)`) and non-files (`type !== "file"`)
- Exports `makeSingleCommit(config: CommitConfig, messageSuffix?: string): Promise<SingleCommitResult>`
  - Fetches current file and SHA
  - Appends formatted log entry
  - Prunes to rolling limit (5)
  - Transmits base64 payload to GitHub API with existing SHA if present
- Exports `makeBatchCommits(config: CommitConfig, count: number, label?: string): Promise<BatchResult>`
  - Sequential loop calling `makeSingleCommit` per iteration
  - Guarantees fresh SHA resolution on each step, eliminating 409 conflicts

### 5.4 `lib/github/client.ts` & `lib/github/repo-service.ts`
- `getOctokitClient(token)`: Centralized Octokit factory
- `listUserRepos(token, fallbackOwner)`: Paginated fetch of user repositories

---

## 6. Verification Results

### 6.1 Verification Test Suite (`test_file_update.js`)
Executed via `node test_file_update.js`:

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

### 6.2 Adversarial Test Suite (`test_adversarial_m1.js`)
Executed via `node test_adversarial_m1.js`:

```
===============================================================
  ADVERSARIAL STRESS & EDGE-CASE TEST HARNESS (M1)
===============================================================

--- Group 1: Pruning Regex & Boundary Conditions ---
  ✔ [PASS] 1.1 Huge log entries (1,000 entries) performance & ReDoS stress test
  ✔ [PASS] 1.2 Pruning with CRLF (\r\n) line endings across entries
  ✔ [PASS] 1.3 Pruning with maxEntries = 1 and maxEntries = 0 boundary values
  ✔ [PASS] 1.4 Pruning when user markdown has headings with numbers and brackets
  ✔ [PASS] 1.5 Code block containing nested markdown headings inside log entry details

--- Group 2: Unicode, Multibyte & Content Edge Cases ---
  ✔ [PASS] 2.1 Unicode multilingual content & Emojis preservation across commit content
  ✔ [PASS] 2.2 Whitespace-only files & files with diverse newline combinations

--- Group 3: Path Sanitization Edge Cases ---
  ✔ [PASS] 3.1 Sanitization of deeply nested paths and mixed separators
  ✔ [PASS] 3.2 Filenames with regex special characters and unusual valid characters

--- Group 4: Commit Helper Lifecycle & Failure Modes ---
  ✔ [PASS] 4.1 Pre-existing file with non-base64 or empty data structure in GitHub response
  ✔ [PASS] 4.2 GitHub API 401 Unauthorized / 403 Forbidden is NOT masked as 404
  ✔ [PASS] 4.3 Batch commits: partial failure recovery (Commit 1 ok, 2 fails, 3 ok)
  ✔ [PASS] 4.4 Rapid consecutive burst (10 commits) with rolling log truncation

--- Group 5: Save-Config Security & Input Validation ---
  ✔ [PASS] 5.1 Fuzzing targetFile with various adversarial strings

===============================================================
  RESULT: 14 PASSED, 0 FAILED
===============================================================
```

---

## 7. Actionable Implementation Guidance & Code Diffs for Worker

For Milestone 1 completion, the Worker must ensure that:
1. `lib/core/log-pruner.ts` contains the safe regex-based `pruneEntries` and `sanitizePath` functions.
2. `lib/core/commit-engine.ts` implements SHA preservation on 0-byte files, sequential re-fetching during batch commits, and safe path normalization.
3. `app/api/save-config/route.ts` validates `targetFile` against directory traversal (`..`), empty inputs, and lengths > 200 chars.
4. `test_file_update.js` is present at the repository root and passes cleanly with 0 failures.

### Reference Implementation Diffs:

#### Diff 1: `lib/core/log-pruner.ts`
```typescript
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

#### Diff 2: `lib/core/commit-engine.ts` (0-byte SHA extraction & Batch loop)
```typescript
// In fetchCurrentFile():
let content = "";
if (typeof (data as any).content === "string") {
  content = Buffer.from((data as any).content, "base64").toString("utf-8");
}
return {
  content,
  sha: (data as any).sha, // Crucial: always extract SHA regardless of content length
};

// In makeBatchCommits():
for (let i = 1; i <= count; i++) {
  try {
    // Each iteration calls makeSingleCommit -> fresh fetchCurrentFile -> latest SHA
    const { sha, commitUrl } = await makeSingleCommit(config, `[${label} ${i}/${count}]`);
    lastSha = sha;
    lastCommitUrl = commitUrl;
    committed++;
  } catch (err: any) {
    errors.push(`Commit ${i} failed: ${err.message}`);
  }
}
```
