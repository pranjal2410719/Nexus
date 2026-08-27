# Nexus Codebase Restructuring, Build System & Documentation Analysis

**Author:** Explorer 3 (Survey Specialist — Directory Restructuring, Build System & Documentation)  
**Project:** Nexus (Open Source Multi-Tenant GitHub Commit Scheduler)  
**Date:** 2026-08-27  
**Scope:** Requirements 3 & 4 (R3: Directory Restructuring & Build System, R4: Developer Guide & Audit Report)

---

## 1. Executive Summary

Nexus is a multi-tenant, serverless GitHub commit scheduler and developer activity engine built on **Next.js 15 (App Router)**, **React 19**, **TypeScript 5.7**, **Netlify Blobs**, and **Octokit REST**.

This analysis provides a comprehensive survey and blueprint for:
1. **Directory Restructuring (R3):** Transforming the legacy monolithic layout into a clean, domain-driven, modular architecture (`app/`, `components/`, `lib/`, `types/`, `config/`, `netlify/`, `tests/`) while eliminating orphan files, duplicate components, and circular references.
2. **Build System Optimization (R3):** Verifying the TypeScript compilation pipeline (`tsconfig.json`), Next.js App Router bundling (`next.config.mjs`), and Netlify Functions esbuild pipeline (`netlify.toml`), ensuring `npm run build` succeeds cleanly with zero type errors and zero runtime regressions.
3. **Documentation Blueprints (R4):** Establishing complete specifications for `DEVELOPER_GUIDE.md` (architecture, data flows, local offline development in `.data/blobs`, codebase navigation) and `AUDIT_REPORT.md` (root causes and remediations for all 7 platform defects, dead code removal log, security model).

---

## 2. Existing Codebase Audit & Architectural Deficiencies

### 2.1 File & Directory Inventory (Current State)

```
Nexus/
├── .data/blobs/                       # Local file-backed JSON store for offline dev
├── .env.example                       # Environment variable template
├── .gitignore                         # Git ignore definitions
├── ANALYSIS.md                        # Historical analysis document
├── DEPLOYING.md                       # Netlify deployment manual
├── LICENSE                            # MIT License
├── ORIGINAL_REQUEST.md                # Orchestrator prompt & specifications
├── PROJECT.md                         # Architecture specification & roadmap
├── README.md                          # Project documentation
├── TEST_INFRA.md                      # E2E test suite architecture & feature inventory
├── TEST_READY.md                      # E2E readiness summary
├── next-env.d.ts                      # Next.js TypeScript definitions
├── next.config.mjs                    # Next.js configuration
├── netlify.toml                       # Netlify build & scheduled functions config
├── package.json                       # Dependencies & npm scripts
├── tsconfig.json                      # TypeScript compiler configuration & path mappings
├── test_adversarial_m1.js             # Adversarial edge case test runner
├── test_file_update.js                # Core R1 file update verification test
├── app/
│   ├── layout.tsx                     # Root HTML layout, GA script, fonts
│   ├── globals.css                    # SayBriefly design system stylesheet (550+ lines)
│   ├── page.tsx                       # Dashboard & landing page (client component)
│   ├── admin/page.tsx                 # Admin user directory page
│   ├── status/page.tsx                # System status & health monitor page
│   ├── components/                    # [ORPHAN / DEAD CODE] Duplicate components
│   │   ├── loader.tsx                 # [DEAD CODE] Superseded by components/ui/loader.tsx
│   │   └── menu-select.tsx            # [DEAD CODE] Superseded by components/ui/menu-select.tsx
│   └── api/
│       ├── admin/users/route.ts       # Admin user listing endpoint
│       ├── auth/
│       │   ├── callback/route.ts      # OAuth code-to-token exchange & user bootstrap
│       │   ├── logout/route.ts        # Session destruction & cookie clearance
│       │   └── start/route.ts         # OAuth authorize redirect & CSRF state generator
│       ├── commit-now/route.ts        # Instant manual commit trigger
│       ├── health/route.ts            # Self-check probe & env flag validator
│       ├── me/route.ts                # Authenticated user config retrieval
│       ├── repos/route.ts             # GitHub repository picker endpoint
│       └── save-config/route.ts       # Schedule & target repo configuration endpoint
├── components/
│   ├── admin/
│   │   └── user-table.tsx             # Admin user listing table
│   ├── dashboard/
│   │   ├── config-form.tsx            # Schedule configuration form
│   │   ├── dispatch-console.tsx       # Instant commit button & terminal display
│   │   ├── feature-cards.tsx          # Landing page feature cards
│   │   ├── hero-banner.tsx            # Landing page unauthenticated hero
│   │   ├── mobile-nav.tsx             # Mobile sliding drawer navigation
│   │   ├── navbar.tsx                 # Top navigation header
│   │   └── schedule-matrix.tsx        # Visual schedule slot card matrix
│   ├── status/
│   │   ├── health-card.tsx            # Status overview card
│   │   └── status-grid.tsx            # Diagnostics metric chips
│   └── ui/
│       ├── icons.tsx                  # SVG icon library (RepoIcon, LockIcon, GitHubIcon, CheckIcon)
│       ├── loader.tsx                 # 3D animated cube loader
│       └── menu-select.tsx            # Keyboard-accessible custom dropdown
├── config/
│   ├── constants.ts                   # Store names, cookie names, defaults, timezones
│   └── site.ts                        # Site metadata, branding, source repo URL
├── lib/
│   ├── auth.ts                        # [DEAD CODE] Monolithic auth/store file
│   ├── commit-helper.ts               # [DEAD CODE] Monolithic commit engine file
│   ├── http.ts                        # [DEAD CODE] Monolithic HTTP helper file
│   ├── local-blobs.ts                 # [DEAD CODE] Monolithic local store file
│   ├── security.ts                    # [DEAD CODE] Monolithic WebCrypto file
│   ├── auth/                          # Modular Auth Subsystem
│   │   ├── cookies.ts                 # Safe cookie parser & session cookie headers
│   │   ├── permissions.ts             # Admin access authorization (isAdmin)
│   │   ├── session.ts                 # Session creation & destruction
│   │   └── user.ts                    # User persistence & publicUser sanitizer
│   ├── core/                          # Modular Commit Engine Subsystem
│   │   ├── commit-engine.ts           # Core commit orchestration & SHA chaining
│   │   ├── log-pruner.ts              # Rolling log pruner & path sanitization
│   │   └── task-generator.ts          # DSA commit task fixture catalog & timestamp generator
│   ├── github/                        # Modular GitHub Integration
│   │   ├── client.ts                  # Octokit instance factory
│   │   └── repo-service.ts            # Paginated user repository service
│   ├── http/                          # Modular HTTP Subsystem
│   │   ├── cors.ts                    # Standard CORS headers & preflight handler
│   │   └── response.ts                # JSON Response builder
│   ├── security/                      # Modular Cryptographic Subsystem
│   │   └── encryption.ts              # AES-256-GCM WebCrypto token encryption/decryption
│   └── storage/                       # Modular Storage Adapter Layer
│       ├── blob-store.ts              # Netlify Blobs / Local store selector & cache
│       └── local-file-store.ts        # File-backed local store implementation
├── netlify/
│   └── functions/
│       └── heartbeat.ts               # 15-minute cron fan-out commit scheduler
├── tests/                             # 4-Tier E2E Hermetic Test Suite
│   ├── adversarial_challenger2_m1.test.js
│   ├── adversarial_route_save_config.test.js
│   ├── mock_github.js                 # High-fidelity Octokit REST API & Git SHA simulator
│   ├── run_all.js                     # Master test suite runner
│   ├── test_harness.js                # Zero-dependency test runner with assertions & hooks
│   ├── tier1_feature_coverage.test.js # Tier 1: 8 feature test suites (44 tests)
│   ├── tier2_boundary_cases.test.js   # Tier 2: Boundary & corner cases (20 tests)
│   ├── tier3_cross_feature.test.js    # Tier 3: Cross-component pipelines (5 tests)
│   ├── tier4_real_world_lifecycle.test.js # Tier 4: Real-world lifecycle workloads (3 tests)
│   ├── ts_loader.js                   # Node ESM TypeScript loader
│   └── ts_resolver.js                 # Path alias (@/*) module resolver
└── types/                             # Centralized TypeScript Domain Types
    ├── auth.ts                        # SessionData, StoreMode
    ├── commit.ts                      # CommitConfig, LogEntry, SingleCommitResult, BatchResult
    ├── github.ts                      # Repo, GitHubUser, GitHubTokenResponse
    ├── health.ts                      # HealthReport, HealthEnv, StoreStatus
    ├── user.ts                        # UserConfig, ScheduleSlot, PublicUser, AdminUser
    └── index.ts                       # Central barrel export
```

---

### 2.2 Key Structural Deficiencies Identified

1. **Dead Code & Orphan Files in `lib/` Root:**
   - Five legacy monolithic files (`lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/local-blobs.ts`, `lib/security.ts`) exist alongside their modern modularized counterparts (`lib/auth/*`, `lib/core/*`, `lib/http/*`, `lib/storage/*`, `lib/security/*`).
   - Grep verification confirms zero active imports reference the legacy root files.
   - **Resolution:** Remove root `lib/*.ts` files to prevent developer confusion and eliminate duplicate maintenance surfaces.

2. **Orphan Component Directory (`app/components/`):**
   - `app/components/loader.tsx` and `app/components/menu-select.tsx` exist inside `app/` but all pages import from `@/components/ui/loader` and `@/components/ui/menu-select`.
   - **Resolution:** Delete `app/components/` directory entirely.

3. **Duplication of Domain Types:**
   - Previous versions had inline interfaces in `lib/auth.ts`, `app/page.tsx`, and `app/admin/page.tsx`.
   - **Resolution:** Consolidate in `@/types` with complete barrel export in `types/index.ts`.

4. **NPM Scripts Deficiencies in `package.json`:**
   - The test script currently outputs `"No tests specified"`.
   - **Resolution:** Wire up `"test": "node test_file_update.js"`, `"test:e2e": "node tests/run_all.js"`, and `"test:all": "npm run test && npm run test:e2e"`.

---

## 3. Modular Target Directory Restructuring Plan (R3)

### 3.1 Architectural Layering Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                            │
│  - App Router: app/layout.tsx, app/page.tsx, app/admin/, app/status/    │
│  - UI Primitives: components/ui/ (loader, menu-select, icons)           │
│  - Feature Components: components/dashboard/, /status/, /admin/         │
├────────────────────────────────────┬────────────────────────────────────┤
│             API LAYER              │           BACKGROUND LAYER         │
│  - Route Handlers: app/api/**      │  - Netlify Scheduled Functions:    │
│    (auth, commit-now, me, repos,   │    netlify/functions/heartbeat.ts  │
│     save-config, health, admin)    │                                    │
├────────────────────────────────────┴────────────────────────────────────┤
│                            CORE DOMAIN LAYER                            │
│  - Commit Engine: lib/core/commit-engine.ts                             │
│  - Log Pruning: lib/core/log-pruner.ts                                  │
│  - Task Fixtures: lib/core/task-generator.ts                            │
│  - Auth & Sessions: lib/auth/ (user, session, cookies, permissions)    │
│  - GitHub Integration: lib/github/ (client, repo-service)               │
├─────────────────────────────────────────────────────────────────────────┤
│                          INFRASTRUCTURE LAYER                           │
│  - Storage Adapters: lib/storage/blob-store.ts, local-file-store.ts     │
│  - Cryptography: lib/security/encryption.ts (AES-256-GCM)               │
│  - HTTP Utilities: lib/http/cors.ts, lib/http/response.ts               │
├─────────────────────────────────────────────────────────────────────────┤
│                          CROSS-CUTTING / DATA                           │
│  - Domain Type Definitions: types/ (index, user, commit, github, etc.)  │
│  - Global Constants & Config: config/constants.ts, config/site.ts       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 File Migration & Cleanup Matrix

| Source Path | Target Action | Target Destination | Rationale |
|---|---|---|---|
| `app/components/loader.tsx` | **DELETE** | — | Redundant duplicate of `components/ui/loader.tsx` |
| `app/components/menu-select.tsx` | **DELETE** | — | Redundant duplicate of `components/ui/menu-select.tsx` |
| `lib/auth.ts` | **DELETE** | — | Superseded by `lib/auth/user.ts`, `session.ts`, `cookies.ts`, `permissions.ts` |
| `lib/commit-helper.ts` | **DELETE** | — | Superseded by `lib/core/commit-engine.ts`, `log-pruner.ts`, `task-generator.ts` |
| `lib/http.ts` | **DELETE** | — | Superseded by `lib/http/cors.ts`, `lib/http/response.ts` |
| `lib/local-blobs.ts` | **DELETE** | — | Superseded by `lib/storage/local-file-store.ts` |
| `lib/security.ts` | **DELETE** | — | Superseded by `lib/security/encryption.ts` |
| `components/ui/*` | **RETAIN** | `components/ui/` | Clean presentation primitives |
| `components/dashboard/*` | **RETAIN** | `components/dashboard/` | Decomposed dashboard widgets |
| `components/status/*` | **RETAIN** | `components/status/` | Modular status components |
| `components/admin/*` | **RETAIN** | `components/admin/` | Modular admin tables |
| `types/*` | **RETAIN** | `types/` | Centralized type contracts |
| `config/*` | **RETAIN** | `config/` | Centralized configuration constants |

---

### 3.3 Path Aliases & `tsconfig.json` Configuration

The TypeScript path mappings in `tsconfig.json` are properly configured to support modular resolution:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["./components/*"],
      "@/lib/*": ["./lib/*"],
      "@/types/*": ["./types/*"],
      "@/types": ["./types/index.ts"],
      "@/config/*": ["./config/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 4. Build System & Compilation Pipeline Analysis (R3)

### 4.1 Dependency & Runtime Stack

- **Next.js:** `^15.3.0` (App Router, Server Actions, Route Handlers)
- **React & React-DOM:** `^19.1.0`
- **TypeScript:** `^5.7.0`
- **Octokit REST:** `@octokit/rest` `^20.0.2`
- **Netlify Blobs:** `@netlify/blobs` `^8.1.0`
- **Node.js Engine:** `>=18.18.0` (Netlify build configured for Node 20)

### 4.2 Next.js Server External Packages

In `next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep @netlify/blobs as a runtime import (not bundled): on Netlify the
  // Blobs context env vars are injected at runtime, so the store must read
  // them fresh when getStore() is called.
  serverExternalPackages: ["@netlify/blobs"],
};

export default nextConfig;
```
*Why this is critical:* When deployed on Netlify, `@netlify/blobs` needs runtime access to environment variables injected into the function invocation environment (`NETLIFY_BLOBS_CONTEXT`, `NETLIFY_API_TOKEN`). Bundling the library statically into the Next.js build bundle would freeze unresolved store contexts.

### 4.3 Netlify Build & Functions Bundling

In `netlify.toml`:
```toml
[build]
  command = "npm run build"

[build.environment]
  NODE_VERSION = "20"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[functions]
  node_bundler = "esbuild"
  external_node_modules = ["@octokit/rest"]
```
*Why this is critical:* The heartbeat function (`netlify/functions/heartbeat.ts`) is compiled by Netlify via `esbuild`. Keeping `@octokit/rest` as an external node module prevents bloated Lambda function zip archives and ensures native WebCrypto / fetch bindings are utilized.

### 4.4 Recommended `package.json` Updates

```json
{
  "name": "nexus",
  "version": "3.1.0",
  "description": "Nexus — open-source, multi-tenant GitHub commit scheduler & developer practice engine on Next.js 15 & Netlify Blobs.",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "node test_file_update.js",
    "test:adversarial": "node test_adversarial_m1.js",
    "test:e2e": "node tests/run_all.js",
    "test:all": "node test_file_update.js && node tests/run_all.js"
  },
  "dependencies": {
    "@netlify/blobs": "^8.1.0",
    "@octokit/rest": "^20.0.2",
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=18.18.0"
  }
}
```

---

## 5. Specification Blueprint for `AUDIT_REPORT.md` (R4)

`AUDIT_REPORT.md` must be placed at the workspace root and serve as the definitive audit and remediation record.

### Table of Contents for `AUDIT_REPORT.md`
1. **Executive Summary & Audit Scorecard**
2. **Defect Log & Root Cause Analysis (7 Defects)**
3. **Dead Code & Orphan File Elimination Log**
4. **Directory Restructuring & Architectural Transformation**
5. **Security, Cryptography & Access Control Audit**
6. **Automated Verification & Test Execution Results**

### Key Content Details for the Defect Log:

| Defect # | Title & Requirement | Root Cause | Remediation | Verification |
|---|---|---|---|---|
| **Defect 1** | **Target File Update Failure on Pre-Existing Files (R1)** | `fetchCurrentFile` previously only returned `sha` when `"content" in data && data.content`. For empty or non-standard pre-existing files, `sha` was lost, causing GitHub API 422/409 Conflict upon update. | Return `(data as any).sha` whenever `data.type === "file"`, regardless of content length. Base64 decode safely. | `node test_file_update.js` (6/6 tests passing) |
| **Defect 2** | **Midnight Double-Fire Scheduler Defect (R2)** | Candidate slot evaluation across 24h wrap-around used ambiguous delta math that matched both before and after midnight on differing local date keys. | Implemented `getDueTargetDateKey` evaluating candidate dates (`today`, `yesterday`, `tomorrow`) with strict ±15min window checks. | `tests/tier1_feature_coverage.test.js` (Suite 6) |
| **Defect 3** | **Write-Ahead Marker Crash Safety (R2)** | Idempotency markers (`slot.lastRun`) were saved in memory and only written to Netlify Blobs after commits finished. A mid-burst timeout caused duplicate commits on the next cron tick. | Implemented write-ahead persistence (`await store.set(key, user)`) before dispatching batch commits, with rollback only on complete failure (0 committed). | `netlify/functions/heartbeat.ts:151-175` |
| **Defect 4** | **Data Loss in Rolling Log Pruner (R2)** | `pruneEntries` blindly split on `\n## ` without validating the Nexus timestamp signature, wiping user markdown headers (`## Overview`, `## Notes`). | Replaced blind split with regex `/(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g`, keeping user headers intact. | `test_adversarial_m1.js` (Group 1) |
| **Defect 5** | **Unhandled `URIError` in Cookie Parser (R2)** | Unguarded `decodeURIComponent(rawVal)` threw unhandled exceptions on malformed cookies, crashing API routes with HTTP 500. | Wrapped cookie decoding in try/catch block falling back to `rawVal`. | `lib/auth/cookies.ts:12-16` |
| **Defect 6** | **Status Page Mobile Navigation Deadlock (R2)** | Mobile hamburger button on `/status` lacked a functional click handler and state binding. | Integrated shared `MobileNav` component and escape key listeners in `app/status/page.tsx`. | `app/status/page.tsx:6-33` |
| **Defect 7** | **Daily Cap Counter Timezone Drift (R2)** | Client stored manual dispatch counts under local date keys while server stored them under UTC date keys, causing desync. | Synchronized client counters directly from API response (`todayCount` in `/api/commit-now`). | `app/page.tsx:48-60`, `app/api/commit-now/route.ts:31-59` |

---

## 6. Specification Blueprint for `DEVELOPER_GUIDE.md` (R4)

`DEVELOPER_GUIDE.md` must provide comprehensive documentation for engineers onboarding, contributing, and self-hosting Nexus.

### Table of Contents for `DEVELOPER_GUIDE.md`
1. **System Overview & Architecture**
   - Multi-tenant tenant isolation model
   - System component diagram
2. **Data Flows & Lifecycle Diagrams**
   - GitHub OAuth Authentication & Session Management
   - 15-Minute Scheduled Cron Heartbeat Execution
   - Manual Instant Commit Dispatch Pipeline
   - Config Save & Timezone Validation
3. **Codebase Navigation & Extension Map**
   - Where to add new DSA practice tasks (`lib/core/task-generator.ts`)
   - Where to adjust log formats & commit templates (`lib/core/commit-engine.ts`)
   - Where to implement alternative storage backends (Redis, PostgreSQL, DynamoDB) (`lib/storage/`)
   - Where to add dashboard widgets (`components/dashboard/`)
   - Where to define new domain models (`types/`)
4. **Local Development & Offline Emulation**
   - Zero-cloud local development with `.data/blobs`
   - Setting up local GitHub OAuth Application (`http://localhost:3000/api/auth/callback`)
   - Step-by-step setup commands:
     ```bash
     git clone https://github.com/pranjal2410719/Nexus.git
     cd Nexus
     npm install
     cp .env.example .env
     npm run dev
     ```
5. **Testing & Verification Workflow**
   - Running type checks: `npm run typecheck`
   - Running core file update tests: `npm run test`
   - Running full E2E test suites: `npm run test:e2e`
   - Running Next.js production build: `npm run build`
6. **Deployment & Self-Hosting Guide**
   - Netlify continuous deployment setup
   - Required environment variables: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BLOBS_MASTER_KEY`
   - Optional environment variables: `MANUAL_DAILY_CAP`, `ADMIN_GITHUB_LOGIN`, `LOCAL_BLOBS_DIR`
7. **Security & Cryptography Model**
   - AES-256-GCM token encryption at rest
   - HttpOnly, SameSite=Lax, Secure session cookie management
   - Zero-secret-leakage health endpoint architecture

---

## 7. Action Plan for Phase Execution

1. **Clean up Dead Code:**
   - Remove `app/components/` directory (`loader.tsx`, `menu-select.tsx`).
   - Remove legacy root files: `lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/local-blobs.ts`, `lib/security.ts`.
2. **Update `package.json` Scripts:**
   - Wire `"test"`, `"test:e2e"`, `"test:all"`, `"test:adversarial"`.
3. **Generate Documentation:**
   - Create `AUDIT_REPORT.md` at project root.
   - Create `DEVELOPER_GUIDE.md` at project root.
   - Refresh `README.md` to reference the restructured architecture.
4. **Validate Pipeline:**
   - Run `npm run typecheck` (`tsc --noEmit`).
   - Run `npm run build` (`next build`).
   - Run all test suites (`node test_file_update.js`, `node tests/run_all.js`).
