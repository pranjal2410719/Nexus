# Nexus Codebase Structural & Quality Audit (R2 & R3)

**Author:** Explorer Survey 2  
**Date:** 2026-08-27  
**Scope:** Full repository audit, defect catalog, performance bottlenecks, dead code inventory, build verification, and modular restructuring plan.

---

## 1. Executive Summary

Nexus is an open-source, multi-tenant GitHub commit automation engine built on Next.js 15 (App Router), React 19, TypeScript 5.7, `@octokit/rest` 20, and `@netlify/blobs` 8. It allows authenticated users to schedule structured commits to their personal repositories with AES-GCM token encryption, tenant isolation, and a serverless heartbeat mechanism.

This deep audit surveyed all 119 file paths in the repository across frontend components, API route handlers, core services, storage abstractions, configuration files, and test harnesses. 

### Key Findings Summary:
1. **TypeScript Build Error (TS2367)**: `types/auth.ts` defines `StoreMode` as `"netlify" | "local" | "unconfigured"`, while `lib/storage/blob-store.ts` and `components/status/status-grid.tsx` use `"netlify-blobs" | "local-file" | "unconfigured"`. This causes an intentional/unintentional type mismatch error in TypeScript build verification.
2. **Synchronous File I/O in Storage Engine**: `lib/storage/local-file-store.ts` currently uses synchronous `node:fs` calls (`readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`, `unlinkSync`), blocking the Node.js event loop during local development and test execution.
3. **Redundant Octokit Client Allocations**: `makeBatchCommits` in `lib/core/commit-engine.ts` instantiates a new `Octokit` instance on every single commit burst iteration when a client instance is not pre-passed.
4. **Dead Code & Orphaned Files (~850+ lines)**:
   - 5 legacy monolithic root files in `lib/` (`lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/local-blobs.ts`, `lib/security.ts`) that were refactored into modular subdirectories (`lib/auth/`, `lib/core/`, `lib/http/`, `lib/storage/`, `lib/security/`) but never deleted.
   - 2 duplicate components in `app/components/` (`loader.tsx`, `menu-select.tsx`) which are exact duplicates of `components/ui/loader.tsx` and `components/ui/menu-select.tsx`.
5. **Test Harness Loader Registration**: `tests/run_all.js` requires standard module loader registration to seamlessly execute TypeScript files across all test tiers without manual loader flags.
6. **Package.json Scripts**: The `test` script in `package.json` is a placeholder (`echo "No tests specified"`) and should be wired to the master test runner and verification suite.

---

## 2. Complete Codebase Enumeration & Inventory

### 2.1 File & Directory Tree (Excluding `.git`, `node_modules`, `.next`, `.agents`)

```
/home/dev/Desktop/khurafati/Nexus
├── .data/
│   └── blobs/                     # Local file store JSON blob persistence
├── app/
│   ├── admin/
│   │   └── page.tsx               # Admin user management view
│   ├── api/
│   │   ├── admin/
│   │   │   └── users/
│   │   │       └── route.ts       # GET: List registered users (Admin only)
│   │   ├── auth/
│   │   │   ├── callback/
│   │   │   │   └── route.ts       # GET: GitHub OAuth callback & token exchange
│   │   │   ├── logout/
│   │   │   │   └── route.ts       # GET: Session destruction & cookie clearance
│   │   │   └── start/
│   │   │       └── route.ts       # GET: GitHub OAuth initiation redirect
│   │   ├── commit-now/
│   │   │   └── route.ts           # POST: Instant manual commit dispatch
│   │   ├── health/
│   │   │   └── route.ts           # GET: Service & storage health self-check
│   │   ├── me/
│   │   │   └── route.ts           # GET: Authenticated user session & config
│   │   ├── repos/
│   │   │   └── route.ts           # GET: User repository picker list
│   │   └── save-config/
│   │       └── route.ts           # POST: Save repository, slots, and timezone
│   ├── components/                # ⚠️ DUPLICATE ORPHAN DIRECTORY
│   │   ├── loader.tsx             # Duplicate of components/ui/loader.tsx
│   │   └── menu-select.tsx        # Duplicate of components/ui/menu-select.tsx
│   ├── globals.css                # Global stylesheet & design system
│   ├── layout.tsx                 # Next.js root layout with metadata & fonts
│   ├── page.tsx                   # Main landing & dashboard UI
│   └── status/
│       └── page.tsx               # Public service status & metrics view
├── components/
│   ├── admin/
│   │   └── user-table.tsx         # Admin registered user table component
│   ├── dashboard/
│   │   ├── config-form.tsx        # Schedule & repository configuration form
│   │   ├── dispatch-console.tsx   # Instant manual commit terminal console
│   │   ├── feature-cards.tsx      # Feature surface showcase cards
│   │   ├── hero-banner.tsx        # Public landing hero banner
│   │   ├── mobile-nav.tsx         # Responsive mobile navigation drawer
│   │   ├── navbar.tsx             # Top navigation bar
│   │   └── schedule-matrix.tsx    # Active burst schedule preview matrix
│   ├── status/
│   │   ├── health-card.tsx        # Health card container with refresh control
│   │   └── status-grid.tsx        # Store & environment indicator grid
│   └── ui/
│       ├── icons.tsx              # SVG icon primitives (Repo, Lock, GitHub, Check)
│       ├── loader.tsx             # 3D isometric animated loader screen
│       └── menu-select.tsx        # Custom accessible keyboard-driven dropdown
├── config/
│   ├── constants.ts               # Core limits, default files, timezones, cookie keys
│   └── site.ts                    # Site branding and metadata constants
├── lib/
│   ├── auth/
│   │   ├── cookies.ts             # Cookie parsing, session cookie serialization
│   │   ├── permissions.ts         # Admin role authorization check
│   │   ├── session.ts             # Session creation & destruction in blob store
│   │   └── user.ts                # User lookup, persistence & public sanitization
│   ├── auth.ts                    # ⚠️ DEAD CODE: Legacy monolithic auth module
│   ├── commit-helper.ts           # ⚠️ DEAD CODE: Legacy commit engine module
│   ├── core/
│   │   ├── commit-engine.ts       # File fetching, single & batch commit execution
│   │   ├── log-pruner.ts          # Safe path sanitization & log pruning regex
│   │   └── task-generator.ts      # Authentic DSA practice task log generator
│   ├── github/
│   │   ├── client.ts              # Octokit factory helper
│   │   └── repo-service.ts        # GitHub user repository pagination service
│   ├── http/
│   │   ├── cors.ts                # CORS preflight & headers handler
│   │   └── response.ts            # Standardized JSON response helper
│   ├── http.ts                    # ⚠️ DEAD CODE: Legacy HTTP helper
│   ├── local-blobs.ts             # ⚠️ DEAD CODE: Legacy local file store
│   ├── security/
│   │   └── encryption.ts          # AES-256-GCM token encryption at rest
│   ├── security.ts                # ⚠️ DEAD CODE: Legacy security helper
│   └── storage/
│       ├── blob-store.ts          # Netlify Blobs / Local File store resolver
│       └── local-file-store.ts    # JSON-file backed blob store implementation
├── netlify/
│   └── functions/
│       └── heartbeat.ts           # 15-minute cron heartbeat scheduler function
├── tests/
│   ├── adversarial_challenger2_m1.test.js  # Adversarial security & edge cases
│   ├── adversarial_route_save_config.test.js # Route input fuzzing test suite
│   ├── mock_github.js             # Mock Octokit API fixture for offline tests
│   ├── run_all.js                 # Master test suite runner (Tiers 1-4)
│   ├── test_file_update.js        # Dedicated R1 file update verification suite
│   ├── test_harness.js            # Lightweight async test runner & assertion engine
│   ├── tier1_feature_coverage.test.js      # Feature coverage suite (44 tests)
│   ├── tier2_boundary_cases.test.js        # Boundary & corner cases (20 tests)
│   ├── tier3_cross_feature.test.js         # Cross-feature pipelines (5 tests)
│   ├── tier4_real_world_lifecycle.test.js  # End-to-end user lifecycles (3 tests)
│   ├── ts_loader.js               # Node.js ESM loader for TypeScript resolution
│   └── ts_resolver.js             # Loader registration script
├── types/
│   ├── auth.ts                    # Auth, session, cookie & StoreMode types
│   ├── commit.ts                  # Commit configuration & result interfaces
│   ├── github.ts                  # GitHub repo, user & token types
│   ├── health.ts                  # Service health report interfaces
│   ├── index.ts                   # Centralized barrel export for all types
│   └── user.ts                    # UserConfig, PublicUser, AdminUser, ScheduleSlot
├── .env.example                   # Environment variable template
├── .gitignore                     # Git ignore definitions
├── ANALYSIS.md                    # Prior deep-scan architectural analysis
├── DEPLOYING.md                   # Netlify deployment manual
├── LICENSE                        # MIT License
├── netlify.toml                   # Netlify build & functions configuration
├── next-env.d.ts                  # Next.js TypeScript declarations
├── next.config.mjs                # Next.js server external packages configuration
├── ORIGINAL_REQUEST.md            # Authoritative user requirements
├── package-lock.json              # Dependency lockfile
├── package.json                   # Project manifest, scripts, and dependencies
├── PROJECT.md                     # Project architecture & milestone tracking
├── README.md                      # Project documentation & feature manual
├── TEST_INFRA.md                  # Test infrastructure specifications
├── TEST_READY.md                  # Test readiness verification report
├── test_adversarial_m1.js         # Root adversarial test runner
├── test_file_update.js            # Root R1 verification script
└── tsconfig.json                  # TypeScript compiler options & path mappings
```

---

## 3. Quality & Bug Audit

### 3.1 Defect Catalog

| ID | Location | Severity | Category | Description | Recommended Remediation |
|---|---|---|---|---|---|
| **BUG-01** | `types/auth.ts:1` vs `components/status/status-grid.tsx:27-30` | **High** | TypeScript / Build | `StoreMode` in `types/auth.ts` is typed as `"netlify" \| "local" \| "unconfigured"`, but `blob-store.ts` and `status-grid.tsx` use `"netlify-blobs" \| "local-file" \| "unconfigured"`. In TypeScript strict mode, comparing against `"netlify-blobs"` produces a TS2367 unreachable comparison error. | Align `types/auth.ts` `StoreMode` definition to `"netlify-blobs" \| "local-file" \| "unconfigured"`. |
| **BUG-02** | `lib/storage/local-file-store.ts:8,31,47,52,61` | **Medium** | Performance / Concurrency | Storage operations use synchronous Node.js `fs` methods (`readFileSync`, `writeFileSync`, `unlinkSync`, `readdirSync`). In serverless / concurrent requests, synchronous filesystem I/O blocks the event loop. | Refactor `LocalFileStore` to use asynchronous non-blocking `node:fs/promises` (`readFile`, `writeFile`, `unlink`, `readdir`, `mkdir`). |
| **BUG-03** | `lib/core/commit-engine.ts:118-137` | **Low-Med** | Performance / Resource | `makeBatchCommits` does not reuse an Octokit client if not pre-passed in `config.client`, creating `count` redundant `Octokit` instances. | Instantiate `const octokit = config.client ?? new Octokit({ auth: config.token })` once at the top of `makeBatchCommits` and pass into every iteration. |
| **BUG-04** | `tests/run_all.js:1-5` | **Medium** | Test Toolchain | `tests/run_all.js` dynamically imports sub-suites without registering `ts_loader.js` inline. If run via `node tests/run_all.js` directly, TypeScript imports fail unless `--import` flag is passed. | Add module loader registration `register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"))` inside `tests/run_all.js`. |
| **BUG-05** | `package.json:11` | **Low-Med** | Toolchain | The `"test"` script is a no-op placeholder (`echo "No tests specified"`). | Update `"test"` script to execute the verification suite: `node test_file_update.js` and add `test:all` for `node --import ./tests/ts_resolver.js tests/run_all.js`. |
| **BUG-06** | `lib/auth.ts:7` vs `config/constants.ts:1` | **Low** | Config Consistency | `lib/auth.ts` hardcoded `STORE_NAME = "nexus"`, whereas `config/constants.ts` defines `STORE_NAME = "nexus-users"`. (Mitigated by deleting dead file `lib/auth.ts`). | Delete `lib/auth.ts` and ensure all storage references import from `@/config/constants`. |

---

## 4. Performance & Efficiency Analysis

### 4.1 Storage Engine Asynchronous I/O
- **Current State**: `lib/storage/local-file-store.ts` uses synchronous methods:
  - `mkdirSync(dir, { recursive: true })` in constructor
  - `readFileSync(this.path(key), "utf8")` in `get()`
  - `writeFileSync(this.path(key), ...)` in `set()`
  - `unlinkSync(this.path(key))` in `delete()`
  - `readdirSync(this.dir)` in `list()`
- **Impact**: Any concurrent incoming HTTP requests (e.g. rapid polling of `/api/me`, multiple simultaneous background crons) will block all other event-loop callbacks.
- **Remediation**: Convert to `import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises"`.

### 4.2 GitHub API Client Instantiation
- **Current State**: `makeBatchCommits(config, count)` runs a loop from `1` to `count` invoking `makeSingleCommit(config)`. If `config.client` is omitted, each call executes `new Octokit({ auth: config.token })`.
- **Impact**: Allocates 1 to 10 Octokit client objects per batch burst, each generating internal plugin trees and authorization header wrappers.
- **Remediation**: In `makeBatchCommits`, create `const octokit = config.client ?? new Octokit({ auth: config.token })` once and supply `client: octokit` in `config`.

### 4.3 Heartbeat Processing Optimization
- In `netlify/functions/heartbeat.ts`, tokens are decrypted once per tenant. However, creating `const client = getOctokitClient(token)` at the tenant level and passing it into `makeBatchCommits` eliminates Octokit client re-creation across all due slots for that tenant.

---

## 5. Dead Code & Orphaned Files Audit

### 5.1 Legacy Monolithic Files in `lib/` (To Be Removed)
When Nexus was refactored into modular subdirectories, the original root-level files in `lib/` were left in place. None of these files are imported anywhere in `app/`, `components/`, `netlify/`, or `config/`.

| File Path | Lines | Size | Purpose Replaced By |
|---|---|---|---|
| `/home/dev/Desktop/khurafati/Nexus/lib/auth.ts` | 190 | 6.0 KB | `lib/auth/user.ts`, `lib/auth/session.ts`, `lib/auth/cookies.ts`, `lib/auth/permissions.ts` |
| `/home/dev/Desktop/khurafati/Nexus/lib/commit-helper.ts` | 267 | 11.3 KB | `lib/core/commit-engine.ts`, `lib/core/log-pruner.ts`, `lib/core/task-generator.ts` |
| `/home/dev/Desktop/khurafati/Nexus/lib/http.ts` | 22 | 0.7 KB | `lib/http/cors.ts`, `lib/http/response.ts` |
| `/home/dev/Desktop/khurafati/Nexus/lib/local-blobs.ts` | 73 | 2.1 KB | `lib/storage/local-file-store.ts` |
| `/home/dev/Desktop/khurafati/Nexus/lib/security.ts` | 42 | 1.6 KB | `lib/security/encryption.ts` |
| **Total `lib/` Dead Code** | **594 lines** | **21.7 KB** | |

### 5.2 Duplicate Components in `app/components/` (To Be Removed)
Next.js App Router projects keep shared UI components in `/components` at the root. A duplicate `app/components/` directory exists with 100% duplicate implementations.

| File Path | Lines | Size | Active Replacement Used by App |
|---|---|---|---|
| `/home/dev/Desktop/khurafati/Nexus/app/components/loader.tsx` | 28 | 628 B | `components/ui/loader.tsx` (imported by `app/page.tsx`, `app/admin/page.tsx`) |
| `/home/dev/Desktop/khurafati/Nexus/app/components/menu-select.tsx` | 231 | 6.4 KB | `components/ui/menu-select.tsx` (imported by `components/dashboard/config-form.tsx`) |
| **Total `app/components/` Dead Code** | **259 lines** | **7.0 KB** | |

### 5.3 Dependency Audit in `package.json`
Every declared dependency in `package.json` was audited:
- `@netlify/blobs` (^8.1.0): Active in `lib/storage/blob-store.ts`.
- `@octokit/rest` (^20.0.2): Active in `lib/github/client.ts`, `lib/core/commit-engine.ts`, `app/api/auth/callback/route.ts`.
- `next` (^15.3.0): Core application framework.
- `react` (^19.1.0) & `react-dom` (^19.1.0): UI runtime.
- `@types/node`, `@types/react`, `@types/react-dom`, `typescript`: Dev dependencies for TS build.
- **Conclusion**: Zero unused dependencies.

---

## 6. Build Configuration & Toolchain Verification

### 6.1 Build Toolchain Analysis
- **Framework**: Next.js 15.3.0 with App Router.
- **TypeScript**: TypeScript 5.7.0 with `"target": "ES2022"`, `"moduleResolution": "bundler"`, `"strict": true`, `"noEmit": true`.
- **Path Aliases** (`tsconfig.json`):
  ```json
  "paths": {
    "@/*": ["./*"],
    "@/components/*": ["./components/*"],
    "@/lib/*": ["./lib/*"],
    "@/types/*": ["./types/*"],
    "@/types": ["./types/index.ts"],
    "@/config/*": ["./config/*"]
  }
  ```
- **Next.js Config** (`next.config.mjs`):
  ```js
  const nextConfig = {
    serverExternalPackages: ["@netlify/blobs"],
  };
  export default nextConfig;
  ```
- **Netlify Functions Config** (`netlify.toml`):
  - Node version: `20`
  - Plugin: `@netlify/plugin-nextjs`
  - Functions bundler: `esbuild`
  - External node modules: `["@octokit/rest"]`

### 6.2 Requirements for `npm run build` / `npx next build` to Succeed Cleanly
1. **Fix `types/auth.ts` `StoreMode` type**: Replace `"netlify" | "local"` with `"netlify-blobs" | "local-file" | "unconfigured"`.
2. **Remove Dead Duplicate Files**: Deleting `app/components/` prevents any potential namespace collisions during Next.js page compilation.
3. **Verify All Path Aliases**: Ensure no stale relative imports point to deleted files.
4. **TypeScript Zero-Error Guarantee**: Run `npm run typecheck` (`tsc --noEmit`) to confirm 0 compile errors.

---

## 7. Concrete Restructuring Plan & Path Mappings

### 7.1 Proposed Modular Directory Layout

```
/home/dev/Desktop/khurafati/Nexus
├── app/                              # Next.js App Router (Pages, Layouts & API Route Handlers)
│   ├── admin/
│   │   └── page.tsx
│   ├── api/
│   │   ├── admin/users/route.ts
│   │   ├── auth/
│   │   │   ├── callback/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── start/route.ts
│   │   ├── commit-now/route.ts
│   │   ├── health/route.ts
│   │   ├── me/route.ts
│   │   ├── repos/route.ts
│   │   └── save-config/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── status/
│       └── page.tsx
├── components/                       # Clean UI Component Tree
│   ├── admin/
│   │   └── user-table.tsx
│   ├── dashboard/
│   │   ├── config-form.tsx
│   │   ├── dispatch-console.tsx
│   │   ├── feature-cards.tsx
│   │   ├── hero-banner.tsx
│   │   ├── mobile-nav.tsx
│   │   ├── navbar.tsx
│   │   └── schedule-matrix.tsx
│   ├── status/
│   │   ├── health-card.tsx
│   │   └── status-grid.tsx
│   └── ui/
│       ├── icons.tsx
│       ├── loader.tsx
│       └── menu-select.tsx
├── config/                           # System Constants & Site Config
│   ├── constants.ts
│   └── site.ts
├── lib/                              # Domain Logic & Services (Modular Subdirectories Only)
│   ├── auth/
│   │   ├── cookies.ts
│   │   ├── permissions.ts
│   │   ├── session.ts
│   │   └── user.ts
│   ├── core/
│   │   ├── commit-engine.ts
│   │   ├── log-pruner.ts
│   │   └── task-generator.ts
│   ├── github/
│   │   ├── client.ts
│   │   └── repo-service.ts
│   ├── http/
│   │   ├── cors.ts
│   │   └── response.ts
│   ├── security/
│   │   └── encryption.ts
│   └── storage/
│       ├── blob-store.ts
│       └── local-file-store.ts
├── netlify/                          # Serverless & Scheduled Netlify Functions
│   └── functions/
│       └── heartbeat.ts
├── tests/                            # Test Suites & Harnesses
│   ├── adversarial_challenger2_m1.test.js
│   ├── adversarial_route_save_config.test.js
│   ├── mock_github.js
│   ├── run_all.js
│   ├── test_file_update.js
│   ├── test_harness.js
│   ├── tier1_feature_coverage.test.js
│   ├── tier2_boundary_cases.test.js
│   ├── tier3_cross_feature.test.js
│   ├── tier4_real_world_lifecycle.test.js
│   ├── ts_loader.js
│   └── ts_resolver.js
├── types/                            # Centralized TypeScript Declarations
│   ├── auth.ts
│   ├── commit.ts
│   ├── github.ts
│   ├── health.ts
│   ├── index.ts
│   └── user.ts
├── .env.example
├── .gitignore
├── DEPLOYING.md
├── DEVELOPER_GUIDE.md
├── LICENSE
├── netlify.toml
├── next-env.d.ts
├── next.config.mjs
├── package-lock.json
├── package.json
├── README.md
├── test_adversarial_m1.js
├── test_file_update.js
└── tsconfig.json
```

### 7.2 Before-and-After Path Action Matrix

| Current Path | Proposed Action | Target Path | Rationale |
|---|---|---|---|
| `lib/auth.ts` | **DELETE** | — | Dead code replaced by `lib/auth/*` and `lib/storage/blob-store.ts` |
| `lib/commit-helper.ts` | **DELETE** | — | Dead code replaced by `lib/core/*` |
| `lib/http.ts` | **DELETE** | — | Dead code replaced by `lib/http/*` |
| `lib/local-blobs.ts` | **DELETE** | — | Dead code replaced by `lib/storage/local-file-store.ts` |
| `lib/security.ts` | **DELETE** | — | Dead code replaced by `lib/security/encryption.ts` |
| `app/components/loader.tsx` | **DELETE** | — | Dead duplicate of `components/ui/loader.tsx` |
| `app/components/menu-select.tsx` | **DELETE** | — | Dead duplicate of `components/ui/menu-select.tsx` |
| `app/components/` | **DELETE DIR** | — | Orphaned duplicate directory |
| `types/auth.ts` | **MODIFY** | `types/auth.ts` | Fix `StoreMode` type definition |
| `lib/storage/local-file-store.ts` | **MODIFY** | `lib/storage/local-file-store.ts` | Refactor sync `fs` to async `node:fs/promises` |
| `lib/core/commit-engine.ts` | **MODIFY** | `lib/core/commit-engine.ts` | Octokit client reuse in `makeBatchCommits` |
| `tests/run_all.js` | **MODIFY** | `tests/run_all.js` | Register `ts_loader.js` programmatically |
| `package.json` | **MODIFY** | `package.json` | Wire test scripts (`"test": "node test_file_update.js"`) |

### 7.3 Import Verification & Compatibility Check
A full grep check confirmed:
- All active route handlers (`app/api/*`) import directly from modular paths (`@/lib/auth/user`, `@/lib/http/response`, `@/lib/storage/blob-store`, `@/lib/security/encryption`, `@/lib/core/commit-engine`).
- No active application code references `lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/local-blobs.ts`, or `lib/security.ts`.
- No active code references `app/components/*`.
- Deleting the 7 dead files will produce **zero broken imports**.

---

## 8. Summary Matrix & Actionable Implementation Plan

| Step | Target Milestone | Description | Affected Files | Validation Command |
|---|---|---|---|---|
| **1** | M2 | Fix `StoreMode` in `types/auth.ts` | `types/auth.ts` | `npm run typecheck` |
| **2** | M2 | Refactor `LocalFileStore` to async `node:fs/promises` | `lib/storage/local-file-store.ts` | `node test_file_update.js` |
| **3** | M2 | Optimize Octokit client reuse | `lib/core/commit-engine.ts` | `node test_file_update.js` |
| **4** | M2 | Fix test runner loader registration | `tests/run_all.js` | `node tests/run_all.js` |
| **5** | M2 / M3 | Delete 5 legacy `lib/*.ts` and 2 duplicate `app/components/*.tsx` files | `lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/local-blobs.ts`, `lib/security.ts`, `app/components/loader.tsx`, `app/components/menu-select.tsx` | `npm run typecheck` |
| **6** | M3 | Update `package.json` scripts | `package.json` | `npm test` & `npm run build` |
| **7** | M4 | Developer Guide & Comprehensive Documentation | `DEVELOPER_GUIDE.md`, `README.md`, `AUDIT_REPORT.md` | Doc inspection |

---
*End of Analysis Report — Explorer Survey 2*
