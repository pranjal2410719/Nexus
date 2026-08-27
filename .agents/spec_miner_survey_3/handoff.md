# Handoff Report: Directory Restructuring & Documentation Specifications

**Agent:** Survey Explorer 3 / Spec Miner (Directory Restructuring & Docs Specialist)  
**Working Directory:** `/home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_3/`  
**Primary Deliverable:** `/home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_3/survey_structure.md`  
**Date:** 2026-08-27  

---

## 1. Observation

Direct observations from examining the Nexus codebase:

1. **Current Codebase Scale & Layout:**
   - App Router Routes: 9 API routes under `app/api/` (`admin/users`, `auth/start`, `auth/callback`, `auth/logout`, `commit-now`, `health`, `me`, `repos`, `save-config`) and 3 page routes (`app/page.tsx`, `app/admin/page.tsx`, `app/status/page.tsx`).
   - Monolithic Client Page: `app/page.tsx` is 836 lines long containing UI, inline SVG icons (`RepoIcon`, `LockIcon`), duplicate type definitions (`ScheduleSlot`, `UserConfig`, `Repo`), timezone constants, and form/console state.
   - Component Directory Placement: Presentation components (`loader.tsx`, `menu-select.tsx`) are currently located in `app/components/` inside the App Router directory rather than a root-level `components/` tree.
   - Conflated Responsibilities in `lib/auth.ts`: 190 lines combining Blob store handles, `LocalFileStore` fallback instantiation, cookie parsing/serialization, session creation/destruction, user database CRUD, admin role checking (`isAdmin`), and public DTO projection (`publicUser`).
   - Commit Engine Coupling in `lib/commit-helper.ts`: 187 lines mixing DSA mock task data arrays (`REAL_TASKS`), string parsing log truncation (`pruneEntries`), Octokit file fetching (`fetchCurrentFile`), and commit runners (`makeSingleCommit`, `makeBatchCommits`).
   - Netlify Function Import Inconsistency: `netlify/functions/heartbeat.ts` imports from `../../lib/commit-helper`, `../../lib/auth`, etc. via relative paths while API routes use `@/lib/...`.
   - Missing Centralized Type Layer: Types are repeatedly defined inline across multiple frontend and backend files.

2. **Build and Typecheck Baseline:**
   - Command `npm run typecheck` (`tsc --noEmit`) exited with code 0 (clean baseline).
   - Command `npm run build` (`next build`) exited with code 0, generating 15 static/dynamic pages successfully.

3. **User Specifications & Acceptance Criteria (`ORIGINAL_REQUEST.md`):**
   - R1: Fix file update bug when target file already exists.
   - R2: Codebase audit & cleanup (refactor inefficient code, eliminate dead code, remove unused files).
   - R3: Directory restructuring to improve readability and maintainability.
   - R4: Developer documentation (`AUDIT_REPORT.md` and `DEVELOPER_GUIDE.md` / `README.md`).

---

## 2. Logic Chain

1. **Decoupling Presentation & State (Obs 1):**
   - Because `app/page.tsx` combines 836 lines of presentation and logic, extracting `Navbar`, `MobileNav`, `HeroBanner`, `ConfigForm`, `DispatchConsole`, `ScheduleMatrix`, and `FeatureCards` into `components/dashboard/` will shrink `app/page.tsx` into a clean, declarative ~100-line orchestrator page.
   - Moving `app/components/` to `components/ui/` standardizes UI primitive reuse (`loader.tsx`, `menu-select.tsx`, `icons.tsx`) without cluttering App Router routes.

2. **Domain-Driven Modularization of `lib/` (Obs 1):**
   - Splitting `lib/auth.ts` into `lib/auth/cookies.ts`, `lib/auth/session.ts`, `lib/auth/user.ts`, `lib/auth/permissions.ts`, and `lib/storage/blob-store.ts` enforces the Single Responsibility Principle and isolates persistence from domain logic.
   - Splitting `lib/commit-helper.ts` into `lib/core/task-generator.ts`, `lib/core/log-pruner.ts`, and `lib/core/commit-engine.ts` separates mock commit content generation, safe markdown log truncation, and GitHub REST API integration.

3. **Centralized Types & Configuration (Obs 1):**
   - Creating `types/` (`user.ts`, `commit.ts`, `github.ts`, `health.ts`, `auth.ts`, `index.ts`) eliminates duplicate interface definitions across `lib/`, `app/`, `app/admin/`, and `app/status/`.
   - Creating `config/` (`constants.ts`, `site.ts`) centralizes `TIMEZONES`, `STORE_NAME`, `SESSION_COOKIE`, and default caps.

4. **Zero-Regression Migration Strategy (Obs 2):**
   - Updating `tsconfig.json` with path aliases (`@/components/*`, `@/lib/*`, `@/types/*`, `@/config/*`) allows backward-compatible alias resolution.
   - Transitional re-exports in legacy `lib/*.ts` during phase execution ensures that the application remains buildable and testable at every single step of refactoring.

5. **Definitive Documentation Blueprints (Obs 3):**
   - The specifications for `AUDIT_REPORT.md` and `DEVELOPER_GUIDE.md` defined in `survey_structure.md` provide clear, ready-to-execute templates and required sections for workers to produce the final deliverables.

---

## 3. Caveats

- Netlify scheduled function bundling: `netlify/functions/heartbeat.ts` is bundled by Netlify using `esbuild` with external `@octokit/rest`. Imports from `@/lib/*` or relative paths must continue to resolve cleanly during Netlify function bundling.
- Client Component boundaries: Components extracted from `app/page.tsx` that use hooks (`useState`, `useEffect`, `useRef`) must explicitly include the `"use client"` directive.

---

## 4. Conclusion

A comprehensive directory restructuring architecture, import transformation matrix, module boundary specification, and documentation blueprint for `AUDIT_REPORT.md` and `DEVELOPER_GUIDE.md` have been authored and verified in `/home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_3/survey_structure.md`.

The proposed layout establishes a clean, decoupled Next.js 15 architecture separating presentation (`components/`), domain engine (`lib/core/`), auth subsystem (`lib/auth/`), storage adapters (`lib/storage/`), types (`types/`), and configurations (`config/`) with zero route breaking changes.

---

## 5. Verification Method

To verify the survey findings and ensure the restructuring blueprint can be executed cleanly:

1. **Inspect Blueprint File:**
   - Confirm complete specifications in `/home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_3/survey_structure.md`.
2. **Validate Current Baseline Build:**
   - Run `npm run typecheck` (`tsc --noEmit`) -> exit code 0.
   - Run `npm run build` (`next build`) -> exit code 0, 15 pages generated.
3. **Invalidation Conditions:**
   - If proposed restructuring changes any public URL route contracts (`/api/*`, `/`, `/status`, `/admin`).
   - If any proposed import path cannot be resolved by `tsc` or Next.js build.
