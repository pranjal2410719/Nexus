## 2026-08-27T17:03:00Z
You are Worker M2-M3 (Codebase Audit, Bug Fixes, Dead Code Cleanup & Directory Restructuring Specialist).
Your working directory is: /home/dev/Desktop/khurafati/Nexus/.agents/worker_m2_m3
Original user request is at: /home/dev/Desktop/khurafati/Nexus/.agents/ORIGINAL_REQUEST.md
Project plan is at: /home/dev/Desktop/khurafati/Nexus/PROJECT.md
Audit survey report is at: /home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_2/survey_audit.md
Restructuring blueprint is at: /home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_3/survey_structure.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your mission:
Implement Requirement R2 (Codebase Audit and Cleanup) and Requirement R3 (Directory Restructuring) across the Nexus codebase.

Tasks:
1. Fix all identified audit bugs (from survey_audit.md):
   - `netlify/functions/heartbeat.ts`:
     * Fix midnight clock wraparound in `isSlotDue` (`delta >= 1440 - 15` issue).
     * Fix write-ahead marker crash safety: write the updated `slot.lastRun` / state marker to the blob store before executing the commits so that a function timeout doesn't cause repeat commit storms.
     * Ensure proper time budget check and clean error handling.
   - `lib/auth/cookies.ts` (or `lib/auth.ts`):
     * Wrap `decodeURIComponent` in a try/catch block inside `parseCookies` so malformed cookies never crash with an unhandled URIError.
   - Frontend UI fixes:
     * `app/status/page.tsx`: Fix empty mobile hamburger `onClick={() => {}}` by hooking up a working mobile navigation drawer; fix manual cap display to accurately reflect the configured cap (default 5).
     * `app/page.tsx`: Fix repository dropdown state when user has 0 repositories (prevent infinite loading spinner); ensure daily limit counter synchronizes with server-side count.
2. Restructure the codebase into the target clean modular layout (from survey_structure.md and PROJECT.md):
   - Create `types/`: `user.ts`, `commit.ts`, `github.ts`, `health.ts`, `auth.ts`, `index.ts`.
   - Create `config/`: `constants.ts`, `site.ts`.
   - Modularize `lib/`:
     * `lib/core/`: `commit-engine.ts` (keeping the verified R1 fix), `log-pruner.ts`, `task-generator.ts`
     * `lib/auth/`: `user.ts`, `session.ts`, `cookies.ts`, `permissions.ts`
     * `lib/storage/`: `blob-store.ts`, `local-file-store.ts`
     * `lib/security/`: `encryption.ts`
     * `lib/github/`: `client.ts`, `repo-service.ts`
     * `lib/http/`: `cors.ts`, `response.ts`
   - Modularize presentation components:
     * `components/ui/`: `loader.tsx`, `menu-select.tsx`, `icons.tsx`
     * `components/dashboard/`: `navbar.tsx`, `mobile-nav.tsx`, `hero-banner.tsx`, `config-form.tsx`, `dispatch-console.tsx`, `schedule-matrix.tsx`, `feature-cards.tsx`
     * `components/status/`: `health-card.tsx`, `status-grid.tsx`
     * `components/admin/`: `user-table.tsx`
   - Update `app/page.tsx`, `app/status/page.tsx`, `app/admin/page.tsx` to be lean page containers using the modular components.
   - Update all `app/api/**/route.ts` handlers and `netlify/functions/heartbeat.ts` to import from `@/lib/*`, `@/types`, and `@/config/*`.
   - Update `tsconfig.json` path mappings.
   - Delete obsolete `app/components/` and legacy root `lib/*.ts` once migration is complete.
3. Eliminate dead code:
   - Remove unused imports, redundant type declarations, dead functions, orphan files.
4. Run all verification commands:
   - `node test_file_update.js`
   - `node --experimental-strip-types --import ./tests/ts_resolver.js ./tests/run_all.js`
   - `npx tsc --noEmit`
   - `npm run build`
5. Write your handoff report to `/home/dev/Desktop/khurafati/Nexus/.agents/worker_m2_m3/handoff.md`.
6. Send a message to the orchestrator when finished.
