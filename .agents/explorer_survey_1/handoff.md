# Handoff Report — Survey Explorer 1

**Task:** Codebase Architecture Investigation & Root Cause Analysis of Requirement R1 (File Update Bug)  
**Agent:** Survey Explorer 1 (`explorer_survey_1`)  
**Timestamp:** 2026-08-27T16:50:00Z  
**Reference Report:** `/home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_1/survey_file_ops.md`  

---

## 1. Observation

1. **`lib/commit-helper.ts:111-127` (`fetchCurrentFile` implementation):**
   ```typescript
   async function fetchCurrentFile(config: CommitConfig): Promise<{ content: string; sha?: string }> {
     const octokit = new Octokit({ auth: config.token });
     try {
       const { data } = await octokit.repos.getContent({
         owner: config.owner, repo: config.repo, path: config.targetFile,
       });
       if ("content" in data && data.content) {
         return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
       }
       return { content: "" };
     } catch (err: any) {
       if (err.status === 404) {
         return { content: "" }; // file does not exist yet — will be created
       }
       throw err;
     }
   }
   ```
2. **`lib/commit-helper.ts:148-155` (`makeSingleCommit` Octokit update call):**
   ```typescript
   const { data } = await octokit.repos.createOrUpdateFileContents({
     owner:   config.owner,
     repo:    config.repo,
     path:    config.targetFile,
     message: fullMessage,
     content: Buffer.from(newContent).toString("base64"),
     sha,
   });
   ```
3. **`lib/commit-helper.ts:100-109` (`pruneEntries` implementation):**
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
4. **`app/api/save-config/route.ts:40` (`targetFile` extraction):**
   ```typescript
   const targetFile = String(body.targetFile ?? "PROGRESS_LOG.md").trim().replace(/^\/+/, "");
   ```
5. **GitHub REST API Specification (`createOrUpdateFileContents`):**
   - Updating an existing file requires `sha` (the blob SHA of the file being replaced). If `sha` is missing or undefined, GitHub returns HTTP 422 (`"sha" wasn't supplied`) or HTTP 409 Conflict.
   - Creating a new file expects `sha` to be omitted/undefined.

---

## 2. Logic Chain

1. **Premise 1 (From Observation 1 & 5):** When an existing file is retrieved via `octokit.repos.getContent()`, GitHub returns `data` containing `data.sha` (the blob SHA) and `data.content` (Base64 string).
2. **Premise 2 (From Observation 1):** If the file on GitHub is empty (0 bytes) or content is not populated, `data.content` is an empty string `""`. In JavaScript, `""` is falsy.
3. **Premise 3 (From Observation 1):** In `fetchCurrentFile()`, the check `if ("content" in data && data.content)` evaluates to `false` when `data.content === ""`. Therefore, the block is skipped and line 120 executes: `return { content: "" };`, silently dropping `data.sha`.
4. **Premise 4 (From Observation 2 & 5):** In `makeSingleCommit()`, `sha` is received as `undefined`. `createOrUpdateFileContents` is called with `sha: undefined` on an existing file path. GitHub rejects this with HTTP 422 / 409 error.
5. **Premise 5 (From Observation 1 & 5):** When the file does not exist, `getContent()` returns HTTP 404. `fetchCurrentFile()` catches the 404 and returns `{ content: "" }` (`sha: undefined`). GitHub allows new file creation with `sha: undefined`, explaining why new files succeed while existing files fail.
6. **Premise 6 (From Observation 3):** `pruneEntries()` naively splits on all markdown headings matching `\n## `. Any pre-existing markdown file with 6+ headings will have its legitimate non-Nexus content wiped out, keeping only the last 5 sections.

---

## 3. Caveats

1. **Network Live Mocking:** Direct external GitHub network calls were not executed against live user tokens during this read-only survey. The root cause is derived directly from static code analysis, GitHub REST API specifications, and JavaScript truthiness semantics.
2. **Git Data Blobs > 1MB:** Files larger than 1MB require calling `octokit.git.getBlob()` if content must be read. However, `data.sha` is always returned by `getContent()`, so returning `data.sha` allows updating regardless.

---

## 4. Conclusion

The bug where pre-existing files fail to update while new files succeed is caused by:
1. **`lib/commit-helper.ts:117`**: Dropping `data.sha` when `data.content` is falsy (`""`).
2. **Fix Action:** Update `fetchCurrentFile()` to validate `!Array.isArray(data) && data.type === "file"` and always return `sha: data.sha`, regardless of whether `data.content` is empty.
3. **Fix Action:** Update `pruneEntries()` to only split on Nexus timestamped log entries `/(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g`, preserving pre-existing user markdown headings.
4. **Fix Action:** Refine `targetFile` sanitization in `app/api/save-config/route.ts` to strip leading `./` and prevent path traversal.

---

## 5. Verification Method

1. **Inspect Survey Report:** Review detailed evidence and refactored code blocks in:
   `/home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_1/survey_file_ops.md`
2. **Create Automated Test Script (`test_file_update.js`):**
   - Mock `octokit.repos.getContent` returning `{ type: "file", size: 0, content: "", sha: "mock_sha_123" }`.
   - Call `makeSingleCommit()` / `fetchCurrentFile()`.
   - Assert that `createOrUpdateFileContents` receives `sha: "mock_sha_123"`.
   - Test pre-existing files with markdown headers (`## Overview`, `## Setup`) and assert content is preserved.
   - Test 404 new file creation and assert `sha: undefined`.
