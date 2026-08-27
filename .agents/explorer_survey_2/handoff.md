# Handoff Report — Codebase Audit & Dead Code Specialist (Survey Explorer 2)

**Author:** Survey Explorer 2  
**Date:** 2026-08-27  
**Working Directory:** `/home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_2`  
**Handoff Type:** Hard  

---

## 1. Observation

1. **R1 File Update Bug & SHA Omission in `lib/commit-helper.ts:111-127`:**
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
   When a target file exists on GitHub with 0 bytes (empty file) or between 1MB–100MB, `data.content` is `""` or `undefined`. The expression `"content" in data && data.content` evaluates to `false`. `fetchCurrentFile` returns `{ content: "" }` without `sha`. When `octokit.repos.createOrUpdateFileContents` is called on the existing file at `lib/commit-helper.ts:148-155` without a `sha`, the GitHub API rejects the request with HTTP 422 (`sha was not supplied`) or 409 Conflict.

2. **Data-Loss in `pruneEntries` (`lib/commit-helper.ts:100-109`):**
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
   `parts.split(/(?=\n##\s)/g)` splits arbitrary Markdown headings (`## Installation`, `## Features`). Any user file with more than 5 Markdown `## ` sections loses all previous headings when Nexus appends a commit.

3. **Midnight Double-Fire Wraparound Bug (`netlify/functions/heartbeat.ts:60-72`):**
   `isSlotDue` evaluates `((nowMin - slotMin) % 1440 + 1440) % 1440 <= 15 || delta >= 1425`. For a `00:05` slot, at `23:55` on day D-1, `delta` is 1430 (>= 1425), firing and recording `lastRun = D-1`. At `00:10` on day D, `lastRun !== D`, and `delta` is 5 (<= 15), firing a second time on day D.

4. **Unhandled URIError on Malformed Cookies (`lib/auth.ts:98`):**
   `decodeURIComponent(part.slice(idx + 1).trim())` is uncaught. A malformed cookie string crashes all authenticated endpoints with an unhandled 500.

5. **Infinite Dropdown Spinner on 0 Repositories (`app/page.tsx:589`):**
   Line 589 binds `loading={!reposError && repoOptions.length === 0}` instead of using the `reposLoading` state. Users with 0 repositories see a perpetual loading spinner.

6. **Dead Mobile Menu on Status Page (`app/status/page.tsx:81-91`):**
   Mobile hamburger toggle button contains `onClick={() => {}}` with no mobile menu panel.

7. **Zero Project Tests:**
   `package.json:11` specifies `"test": "echo \"No tests specified\" && exit 0"`.

---

## 2. Logic Chain

1. From **Observation 1**, GitHub API's `createOrUpdateFileContents` requires the file's current git blob `sha` whenever a file already exists in the repository.
2. Because `fetchCurrentFile` gated the return of `sha` behind `data.content` truthiness, any existing file with empty content (`""`) or missing content field (large files) caused `sha` to be omitted (`undefined`), directly producing the R1 bug where pre-existing files cannot be updated.
3. From **Observation 2**, `pruneEntries` indiscriminately splits on all `\n## ` headings. Therefore, configuring an existing repository file (such as a README or dev notes) results in destructive truncation of user content.
4. From **Observations 3–7**, multiple high-impact logic bugs, edge cases, dead UI handlers, and performance bottlenecks were cataloged and documented in `survey_audit.md`.

---

## 3. Caveats

1. **GitHub API Network Testing:** Live GitHub API calls require actual user tokens (`GITHUB_CLIENT_ID`, `BLOBS_MASTER_KEY`); unit test verification for R1 can be done via mocked responses or test harness scripts (`test_file_update.js`).
2. **Netlify Scheduled Function Environment:** `netlify/functions/heartbeat.ts` runs inside the Netlify scheduled functions runtime; local testing uses synthetic invocations.

---

## 4. Conclusion

- The root cause of the R1 file update failure is an incorrect truthiness check on `data.content` in `lib/commit-helper.ts:117` combined with destructive `pruneEntries` splitting.
- The codebase is structurally clean (TypeScript builds with 0 errors; Next.js 15 production build succeeds cleanly), but contains 16 distinct bugs and edge cases that should be remediated during the worker implementation phase.
- A full inventory of bugs, performance bottlenecks, dead code, and restructuring recommendations is saved in `/home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_2/survey_audit.md`.

---

## 5. Verification Method

1. **TypeScript Compilation:**
   ```bash
   npx tsc --noEmit
   ```
2. **Next.js Production Build:**
   ```bash
   npm run build
   ```
3. **R1 Bug Reproduction & Verification Test:**
   Inspect and run `test_file_update.js` (to be created by the worker agent) verifying that empty files, large files, and existing markdown files return valid SHAs and preserve user content.
4. **File Inspection:**
   Inspect `/home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_2/survey_audit.md`.
