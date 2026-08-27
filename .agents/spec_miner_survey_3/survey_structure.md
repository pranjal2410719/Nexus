# Directory Restructuring Survey & Architectural Blueprint

**Project:** Nexus (Open Source Multi-Tenant GitHub Commit Scheduler)  
**Author:** Survey Explorer 3 / Spec Miner (Directory Restructuring & Docs Specialist)  
**Date:** 2026-08-27  
**Version:** 1.0.0  

---

## 1. Executive Summary & Existing Codebase Inventory

Nexus is a serverless, multi-tenant GitHub commit scheduler built with Next.js 15 App Router, React 19, TypeScript 5.7, Netlify Blobs, and `@octokit/rest`. 

### Existing File & Directory Inventory (Current State)

```
Nexus/
├── .data/
│   └── blobs/                     # Local development file-backed JSON store
├── .env.example                   # Environment variable template
├── .gitignore                     # Git ignore rules
├── ANALYSIS.md                    # Historical deep scan analysis
├── DEPLOYING.md                   # Netlify deployment guide
├── LICENSE                        # MIT license
├── ORIGINAL_REQUEST.md            # Orchestrator user request & mission specs
├── README.md                      # Primary project overview
├── next-env.d.ts                  # Next.js TypeScript declarations
├── next.config.mjs                # Next.js configuration (serverExternalPackages: @netlify/blobs)
├── netlify.toml                   # Netlify build and scheduled function config
├── package.json                   # Project dependencies and npm scripts
├── tsconfig.json                  # TypeScript compiler options and path mappings
├── app/
│   ├── layout.tsx                 # Root HTML layout, GA tag, Google Fonts
│   ├── globals.css                # Monolithic SayBriefly design system stylesheet (550+ lines)
│   ├── page.tsx                   # Monolithic client dashboard + landing page (836 lines)
│   ├── admin/
│   │   └── page.tsx               # Admin user directory page (118 lines)
│   ├── status/
│   │   └── page.tsx               # System status and health monitor page (271 lines)
│   ├── components/
│   │   ├── loader.tsx             # 3D cube animated loader
│   │   └── menu-select.tsx        # Custom keyboard-accessible dropdown select (231 lines)
│   └── api/
│       ├── admin/
│       │   └── users/route.ts     # Admin user list endpoint (protected by isAdmin check)
│       ├── auth/
│       │   ├── callback/route.ts  # OAuth code-to-token exchange and user initialization
│       │   ├── logout/route.ts    # Session termination and cookie clearance
│       │   └── start/route.ts     # OAuth authorization redirect with CSRF state token
│       ├── commit-now/route.ts    # Instant manual commit trigger (daily rate capped)
│       ├── health/route.ts        # Self-test endpoint (store probe, env presence)
│       ├── me/route.ts            # Authenticated user config retrieval
│       ├── repos/route.ts         # User GitHub repository listing
│       └── save-config/route.ts   # User schedule and target repository configuration
├── lib/
│   ├── auth.ts                    # User model, session management, cookie utils, store handle
│   ├── commit-helper.ts           # Commit engine, DSA task fixtures, log pruner, Octokit commit calls
│   ├── http.ts                    # CORS headers, JSON Response wrapper, OPTIONS handler
│   ├── local-blobs.ts             # File-backed mock blob store for offline dev
│   └── security.ts                # AES-GCM encryption/decryption using WebCrypto and BLOBS_MASTER_KEY
└── netlify/
    └── functions/
        └── heartbeat.ts           # 15-minute cron fan-out commit scheduler
```

---

## 2. Architectural Audit & Current Codebase Deficiencies

### 2.1 Monolithic Component Anti-Pattern (`app/page.tsx`)
- **Size & Scope:** 836 lines containing landing page hero, dashboard panels, form state, repository selector, schedule slot arrays, manual dispatch console, localStorage counter synchronization, inline SVG icons (`RepoIcon`, `LockIcon`), inline type declarations (`ScheduleSlot`, `UserConfig`, `Repo`), and inline timezone lists.
- **Maintainability Hazard:** Modifying the landing page layout risks breaking dashboard logic; state management is tightly coupled with UI presentation.

### 2.2 Duplicated & Fragmented Type Definitions
- Types such as `ScheduleSlot`, `UserConfig`, and `Repo` are defined in `lib/auth.ts` and redefined in `app/page.tsx`, `app/admin/page.tsx`, and `app/status/page.tsx`.
- Missing central domain types directory (`types/`), leading to potential interface drift when fields are added or modified.

### 2.3 Layer Blurring in `lib/auth.ts`
- `lib/auth.ts` conflates multiple distinct responsibilities:
  1. Blob store factory and caching logic (`getStoreHandle`, `getStoreMode`)
  2. Fallback local filesystem store creation (`LocalFileStore`)
  3. HTTP cookie serialization and parsing (`parseCookies`, `sessionCookie`, `clearSessionCookie`)
  4. Session lifecycle management (`createSession`, `destroySession`)
  5. User persistence and retrieval (`getUserById`, `saveUser`, `getUserByRequest`)
  6. Admin authorization policy (`isAdmin`)
  7. Public API data sanitization (`publicUser`)

### 2.4 Monolithic Commit Helper (`lib/commit-helper.ts`)
- Contains hardcoded DSA C++ practice tasks (`REAL_TASKS`), string manipulation log pruning logic (`pruneEntries`), and Octokit GitHub REST API commit orchestration.
- The file update logic in `fetchCurrentFile` fails on existing files if the content structure or SHA resolution encounters edge cases.

### 2.5 Component Directory Placement
- `app/components/` is situated inside Next.js `app/` App Router folder. While Next.js App Router allows co-located components, putting shared presentation components inside `components/` outside `app/` is the established clean architecture standard in the React/Next.js ecosystem.

### 2.6 Inconsistent Import Path Formats
- `netlify/functions/heartbeat.ts` uses relative paths (`../../lib/commit-helper`, `../../lib/auth`), whereas Next.js routes use `@/lib/...`.
- Establishing standardized alias paths in `tsconfig.json` ensures modular cross-referencing.

---

## 3. Clean Architecture & Next.js Best Practice Recommendations

```
┌─────────────────────────────────────────────────────────────┐
│                       PRESENTATION                          │
│   Next.js App Router (app/*) + Modular Components (components/*)│
├──────────────────────────────┬──────────────────────────────┤
│          API LAYER           │          SERVICES            │
│   Route Handlers (app/api/*) │   Scheduler, GitHub Client   │
├──────────────────────────────┴──────────────────────────────┤
│                         CORE DOMAIN                         │
│       Commit Engine, Task Generators, Log Pruners, Auth      │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE & DATA                    │
│   Storage Adapters (Netlify Blobs / Local File), WebCrypto  │
├─────────────────────────────────────────────────────────────┤
│                 CROSS-CUTTING / CONTRACTS                   │
│          Types (types/*), Constants & Config (config/*)     │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Principles for Restructuring:
1. **Single Responsibility Principle (SRP):** Split large multi-concern files into focused, single-purpose modules.
2. **Domain-Driven Directory Organization:** Group related functionality into domain folders (`core/`, `auth/`, `storage/`, `crypto/`, `ui/`, `dashboard/`).
3. **Strict Separation of Presentation vs Business Logic:** Extract UI components into dedicated subfolders (`components/dashboard/`, `components/ui/`, `components/status/`, `components/admin/`).
4. **Single Source of Truth for Types:** Consolidate all shared TypeScript interfaces into a centralized `@/types` package.
5. **Zero Breaking Changes to Next.js Routes:** Preserve all public API endpoints (`/api/auth/*`, `/api/commit-now`, `/api/health`, `/api/me`, `/api/repos`, `/api/save-config`, `/api/admin/users`) and frontend routes (`/`, `/status`, `/admin`).

---

## 4. Target Restructured Directory Layout

```
Nexus/
├── app/                                  # Next.js 15 App Router Routes
│   ├── admin/
│   │   └── page.tsx                      # Admin page (lean container)
│   ├── api/                              # REST API Route Handlers (unchanged URL contract)
│   │   ├── admin/
│   │   │   └── users/route.ts
│   │   ├── auth/
│   │   │   ├── callback/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── start/route.ts
│   │   ├── commit-now/route.ts
│   │   ├── health/route.ts
│   │   ├── me/route.ts
│   │   ├── repos/route.ts
│   │   └── save-config/route.ts
│   ├── status/
│   │   └── page.tsx                      # Status page (lean container)
│   ├── globals.css                       # Global design system stylesheet
│   ├── layout.tsx                        # Root layout with fonts & GA
│   └── page.tsx                          # Dashboard + Landing page (lean orchestrator)
│
├── components/                           # Clean Component Hierarchy
│   ├── admin/
│   │   └── user-table.tsx                # Admin user listing table & badges
│   ├── dashboard/
│   │   ├── config-form.tsx               # Repository, target file, timezone form
│   │   ├── dispatch-console.tsx          # Manual instant commit button & console display
│   │   ├── feature-cards.tsx             # Landing feature highlights
│   │   ├── hero-banner.tsx               # Logged-out landing hero section
│   │   ├── mobile-nav.tsx                # Mobile sliding navigation drawer
│   │   ├── navbar.tsx                    # Shared navigation header
│   │   └── schedule-matrix.tsx           # Schedule burst matrix preview & editor
│   ├── status/
│   │   ├── health-card.tsx               # Service status panel
│   │   └── status-grid.tsx               # Diagnostic metrics & presence chips
│   └── ui/
│       ├── icons.tsx                     # Reusable SVG icon library (RepoIcon, LockIcon, etc.)
│       ├── loader.tsx                    # 3D animated cube loader
│       └── menu-select.tsx               # Accessible custom dropdown component
│
├── lib/                                  # Business Logic & Infrastructure
│   ├── auth/                             # Auth Domain & Session Subsystem
│   │   ├── cookies.ts                    # Cookie serialization & parsing
│   │   ├── permissions.ts                # Admin authorization check (isAdmin)
│   │   ├── session.ts                    # Session creation & destruction
│   │   └── user.ts                       # User lookup, persistence, sanitization (publicUser)
│   ├── core/                             # Commit Workflow Engine
│   │   ├── commit-engine.ts              # Core commit creation (single & batch)
│   │   ├── log-pruner.ts                 # Safe rolling log pruner
│   │   └── task-generator.ts             # Realistic commit task generator & fixtures
│   ├── github/                           # GitHub API Integration
│   │   ├── client.ts                     # Octokit instance factory
│   │   └── repo-service.ts               # Repository listing and pagination helper
│   ├── http/                             # HTTP & Network Utilities
│   │   ├── cors.ts                       # CORS headers & preflight handler
│   │   └── response.ts                   # Standardized JSON response helpers
│   ├── security/                         # Cryptographic Subsystem
│   │   └── encryption.ts                 # AES-GCM WebCrypto token encryption/decryption
│   └── storage/                          # Persistence Adapter Layer
│       ├── blob-store.ts                 # Netlify Blobs / Local store selector & cache
│       └── local-file-store.ts           # File-backed local store implementation
│
├── types/                                # Centralized Type Definitions
│   ├── auth.ts                           # Session, StoreMode, Cookie types
│   ├── commit.ts                         # CommitConfig, LogEntry, CommitResult, BatchResult
│   ├── github.ts                         # Repo, GitHubUser, GitHubTokenResponse
│   ├── health.ts                         # HealthReport, HealthEnv, StoreStatus
│   ├── user.ts                           # UserConfig, ScheduleSlot, PublicUser
│   └── index.ts                          # Central barrel export
│
├── config/                               # Static Configurations & Constants
│   ├── constants.ts                      # Timezones list, store names, cookie names, defaults
│   └── site.ts                           # Site metadata, source repo URLs, branding
│
├── netlify/
│   └── functions/
│       └── heartbeat.ts                  # Scheduled fan-out commit cron function
│
├── .env.example
├── .gitignore
├── DEPLOYING.md
├── LICENSE
├── README.md
├── AUDIT_REPORT.md                       # Comprehensive audit & remediation report (New)
├── DEVELOPER_GUIDE.md                    # Architecture, navigation, and developer manual (New)
├── next-env.d.ts
├── next.config.mjs
├── netlify.toml
├── package.json
└── tsconfig.json
```

---

## 5. Comprehensive Import Path & Dependency Impact Analysis

### 5.1 `tsconfig.json` Path Mappings Update
To support modular alias resolution cleanly across both Next.js and Netlify Functions:

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

### 5.2 Import Path Transformation Matrix

| Existing Path | New Path | Old Import Example | New Import Example | Affected Files |
|---|---|---|---|---|
| `lib/commit-helper.ts` | `lib/core/commit-engine.ts`<br>`lib/core/log-pruner.ts`<br>`lib/core/task-generator.ts` | `import { makeSingleCommit } from "@/lib/commit-helper";` | `import { makeSingleCommit } from "@/lib/core/commit-engine";` | `app/api/commit-now/route.ts`<br>`netlify/functions/heartbeat.ts`<br>`test_file_update.js` |
| `lib/auth.ts` | `lib/auth/user.ts`<br>`lib/auth/session.ts`<br>`lib/auth/cookies.ts`<br>`lib/auth/permissions.ts`<br>`lib/storage/blob-store.ts` | `import { getUserByRequest, publicUser } from "@/lib/auth";` | `import { getUserByRequest, publicUser } from "@/lib/auth/user";` | `app/api/me/route.ts`<br>`app/api/admin/users/route.ts`<br>`app/api/save-config/route.ts`<br>`app/api/repos/route.ts` |
| `lib/local-blobs.ts` | `lib/storage/local-file-store.ts` | `import { LocalFileStore } from "./local-blobs";` | `import { LocalFileStore } from "@/lib/storage/local-file-store";` | `lib/storage/blob-store.ts` |
| `lib/security.ts` | `lib/security/encryption.ts` | `import { decryptSecret } from "@/lib/security";` | `import { decryptSecret } from "@/lib/security/encryption";` | `app/api/commit-now/route.ts`<br>`app/api/repos/route.ts`<br>`app/api/auth/callback/route.ts`<br>`netlify/functions/heartbeat.ts` |
| `lib/http.ts` | `lib/http/cors.ts`<br>`lib/http/response.ts` | `import { CORS_HEADERS, json } from "@/lib/http";` | `import { CORS_HEADERS, handleCors } from "@/lib/http/cors";`<br>`import { json } from "@/lib/http/response";` | All API routes |
| `app/components/loader.tsx` | `components/ui/loader.tsx` | `import { Loader } from "./components/loader";` | `import { Loader } from "@/components/ui/loader";` | `app/page.tsx`<br>`app/admin/page.tsx`<br>`app/status/page.tsx` |
| `app/components/menu-select.tsx` | `components/ui/menu-select.tsx` | `import { MenuSelect } from "./components/menu-select";` | `import { MenuSelect } from "@/components/ui/menu-select";` | `app/page.tsx` |
| Inline types in `lib/auth.ts`, `app/page.tsx` | `types/user.ts`<br>`types/commit.ts`<br>`types/auth.ts`<br>`types/github.ts` | `interface UserConfig { ... }` in each file | `import type { UserConfig, ScheduleSlot } from "@/types";` | `app/page.tsx`<br>`app/admin/page.tsx`<br>`app/status/page.tsx`<br>All routes |

---

## 6. Subsystem Refactoring & Module Boundary Specifications

### 6.1 Core Commit Workflow Engine (`lib/core/`)
- **`task-generator.ts`:** Holds the `REAL_TASKS` fixture catalog, random selector, and timestamp formatter (`getTimestamp()`). Returns structured `LogEntry` objects.
- **`log-pruner.ts`:** Implements safe log truncating (`pruneEntries`). Must only prune valid log markdown sections matching standard timestamp patterns without wiping pre-existing user markdown headers.
- **`commit-engine.ts`:** Orchestrates `fetchCurrentFile`, `makeSingleCommit`, and `makeBatchCommits`.
  - **Critical Bug Fix:** In `fetchCurrentFile`, properly resolve GitHub contents API responses, capture `sha` regardless of whether content is non-empty, and handle base64 encoding/decoding without data loss.

### 6.2 Storage & Persistence Layer (`lib/storage/`)
- **`blob-store.ts`:** Manages Netlify Blobs handle creation (`getStoreHandle`), environment detection (`getStoreMode`), and store caching.
- **`local-file-store.ts`:** File-backed store adapter implementing Netlify Blobs interface for local development in `.data/blobs`.

### 6.3 Auth & User Domain (`lib/auth/`)
- **`cookies.ts`:** Safe cookie parsing (`parseCookies` with try/catch on `decodeURIComponent`), session cookie builders (`sessionCookie`, `clearSessionCookie`).
- **`session.ts`:** Session lifecycle (`createSession`, `destroySession`).
- **`user.ts`:** Persistence of user config (`getUserById`, `saveUser`, `getUserByRequest`, `publicUser`).
- **`permissions.ts`:** Access control helpers (`isAdmin`).

### 6.4 Cryptographic Subsystem (`lib/security/`)
- **`encryption.ts`:** `encryptSecret` and `decryptSecret` with key derivation from `BLOBS_MASTER_KEY` via WebCrypto AES-GCM.

### 6.5 GitHub API Client Layer (`lib/github/`)
- **`client.ts`:** Factory creating typed `Octokit` instances from user tokens.
- **`repo-service.ts`:** Paginated user repository fetching with error mapping.

### 6.6 Component Hierarchy Decomposition (`components/`)
- **`components/ui/`:** Reusable UI primitives: `loader.tsx`, `menu-select.tsx`, `icons.tsx` (centralized SVG icons).
- **`components/dashboard/`:**
  - `navbar.tsx`: Top navbar with auth state and navigation links.
  - `mobile-nav.tsx`: Slide-out responsive mobile navigation modal.
  - `hero-banner.tsx`: Landing view for unauthenticated visitors.
  - `config-form.tsx`: Step 1 configuration panel (repo picker, target file, timezone, slot editor).
  - `dispatch-console.tsx`: Step 2 manual instant commit button with live console terminal output.
  - `schedule-matrix.tsx`: Scheduled burst matrix visualizer cards.
  - `feature-cards.tsx`: Feature highlight sticky cards.
- **`components/status/`:**
  - `health-card.tsx`: Status overview card.
  - `status-grid.tsx`: Store, runtime, OAuth, and encryption diagnostics grid.
- **`components/admin/`:**
  - `user-table.tsx`: Registered users table with user metadata badges.

---

## 7. Migration & Step-by-Step Execution Plan

To execute the directory restructuring with zero downtime, zero broken imports, and continuous build validation:

```
Phase 1: Types & Configurations (Foundation)
├── Create `types/` (auth.ts, commit.ts, github.ts, health.ts, user.ts, index.ts)
├── Create `config/` (constants.ts, site.ts)
└── Update `tsconfig.json` path mappings

Phase 2: Core & Utility Libraries (Domain Layer)
├── Create `lib/http/` (cors.ts, response.ts)
├── Create `lib/security/` (encryption.ts)
├── Create `lib/storage/` (local-file-store.ts, blob-store.ts)
├── Create `lib/auth/` (cookies.ts, permissions.ts, session.ts, user.ts)
├── Create `lib/github/` (client.ts, repo-service.ts)
└── Create `lib/core/` (task-generator.ts, log-pruner.ts, commit-engine.ts with Bug Fix)

Phase 3: Backward Compatibility & Re-exports
├── Provide transitional re-exports in `lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/security.ts`
└── Run `npm run typecheck` to verify backward compatibility

Phase 4: API Routes & Scheduler Migration
├── Update all `app/api/**/route.ts` handlers to use new `@/lib/*` and `@/types` imports
├── Update `netlify/functions/heartbeat.ts` to use new modular imports
└── Run `npm run typecheck` to ensure all backend handlers compile cleanly

Phase 5: Component Decomposition & Frontend Refactoring
├── Create `components/ui/` (`loader.tsx`, `menu-select.tsx`, `icons.tsx`)
├── Create `components/dashboard/` (`navbar.tsx`, `mobile-nav.tsx`, `hero-banner.tsx`, `config-form.tsx`, `dispatch-console.tsx`, `schedule-matrix.tsx`, `feature-cards.tsx`)
├── Create `components/status/` (`health-card.tsx`, `status-grid.tsx`)
├── Create `components/admin/` (`user-table.tsx`)
├── Refactor `app/page.tsx`, `app/status/page.tsx`, and `app/admin/page.tsx` into clean, lean page containers
├── Remove obsolete `app/components/`
└── Remove obsolete legacy root `lib/*.ts` once all references are updated

Phase 6: Verification & Test Script Execution
├── Run `npm run typecheck`
├── Run `npm run build`
└── Execute `node test_file_update.js` to verify file update bug fix
```

---

## 8. Detailed Specification for `AUDIT_REPORT.md`

`AUDIT_REPORT.md` must be generated at the workspace root and serve as the definitive audit documentation. It must include the following sections and contents:

### Structure of `AUDIT_REPORT.md`

1. **Executive Summary & Audit Scope:**
   - Audit date, version (3.1.0), stack components.
   - Comprehensive audit scorecard (Security, Reliability, Architecture, Performance, Maintainability).
2. **Defect Log & Root Cause Analysis:**
   - **Bug 1: File Update Failure on Pre-existing Target Files (R1):**
     - *Observation:* When target file already exists in repository, commit helper fails or overwrites improperly due to missing `sha` handling or bad base64 response decoding.
     - *Root Cause:* In `fetchCurrentFile`, `octokit.repos.getContent` response parsing only returns `sha` if `"content" in data && data.content`. For files with empty or specific formats, `sha` is lost, causing GitHub API 422/409 Conflict.
     - *Remediation:* Correct `sha` propagation and content decoding; verify with `test_file_update.js`.
   - **Bug 2: Midnight Double-Fire Scheduler Defect:**
     - *Observation:* Slots near midnight (e.g. 00:05 or 23:55) trigger twice in two consecutive 15-minute ticks.
     - *Root Cause:* 24-hour wrap-around math (`delta >= 1440 - 15`) matches both before and after midnight on differing local date keys.
     - *Remediation:* Strict boundary math and unified UTC timestamp tracking.
   - **Bug 3: Write-Ahead Marker Crash Safety:**
     - *Observation:* Idempotency marker (`lastRun`) held in memory and only written to Netlify Blobs after all slots finish.
     - *Root Cause:* Function timeout mid-batch causes marker loss, re-firing commits on next tick.
     - *Remediation:* Write-ahead blob persistence before dispatching batch commits.
   - **Bug 4: Data Loss in Log Pruner (`pruneEntries`):**
     - *Observation:* Any pre-existing markdown file using `## ` headers had its contents erased after 5 commits.
     - *Root Cause:* Blind splitting on `\n## ` without verifying log entry signature.
     - *Remediation:* Regex-targeted log entry parsing preserving all user headers and custom content.
   - **Bug 5: URI Malformed Crash in Cookie Parser:**
     - *Observation:* Malformed cookie values throw unhandled `URIError` crashing API routes with 500.
     - *Root Cause:* Unguarded `decodeURIComponent(part)`.
     - *Remediation:* Safe decoding wrapper with fallback.
   - **Bug 6: Status Page Mobile Menu Deadlock:**
     - *Observation:* Mobile hamburger on `/status` had no click handler (`onClick={() => {}}`).
     - *Root Cause:* Missing mobile navigation state.
     - *Remediation:* Integrated shared `MobileNav` component.
   - **Bug 7: Manual Daily Cap Counter Timezone Drift:**
     - *Observation:* LocalStorage counter keyed by client date while server counter keyed by UTC date.
     - *Remediation:* Unified counter synchronization with server response.
3. **Dead Code & Inefficiency Cleanup Log:**
   - Table of all deleted dead code, unused imports, redundant types, and hardcoded constants.
4. **Directory Restructuring & Architectural Transformation:**
   - Side-by-side Before/After directory layout comparison.
   - Module decoupling analysis (Presentation, Domain, Persistence, Types, Config).
5. **Security, Rate-Limiting & Secrets Audit:**
   - AES-GCM token encryption verification.
   - Admin authorization check validation (`isAdmin`).
   - Env var presence audit without secret leakage.
6. **Build & Test Verification Results:**
   - Output of `npm run typecheck`.
   - Output of `npm run build`.
   - Output of `test_file_update.js` verification script.

---

## 9. Detailed Specification for `DEVELOPER_GUIDE.md` (or Updated `README.md`)

`DEVELOPER_GUIDE.md` must provide comprehensive documentation for engineers working on or extending Nexus. It must include:

### Structure of `DEVELOPER_GUIDE.md`

1. **System Architecture Overview:**
   - Multi-tenant isolation model: Every user config stored separately; commits dispatched using the user's personal OAuth access token.
   - Data flow diagrams for:
     - User OAuth Login & Session Creation
     - Scheduled Fan-Out Heartbeat Execution (`netlify/functions/heartbeat.ts`)
     - Manual Instant Commit Dispatch (`/api/commit-now`)
     - Config Save & Timezone Validation (`/api/save-config`)
2. **Restructured Codebase Navigation Map:**
   - Detailed guide explaining where every module lives and where to add new features:
     - Where to add new DSA/coding commit tasks -> `lib/core/task-generator.ts`
     - Where to modify commit formatting & log structure -> `lib/core/commit-engine.ts`
     - Where to adjust storage backends (e.g. Postgres, Redis, DynamoDB) -> `lib/storage/`
     - Where to add new dashboard widgets -> `components/dashboard/`
     - Where to update UI components & styling -> `components/ui/` & `app/globals.css`
     - Where to add new API routes -> `app/api/`
     - Where to update data models -> `types/`
3. **Local Development Environment Setup:**
   - Step-by-step setup:
     ```bash
     git clone <repo>
     npm install
     cp .env.example .env
     npm run dev
     ```
   - Explanation of the **Local File Store Mode** (`.data/blobs`): How sessions, configs, and OAuth tokens are stored locally on disk without requiring cloud Netlify Blobs.
   - How to configure a local GitHub OAuth application (`http://localhost:3000/api/auth/callback`).
4. **Testing & Verification Workflow:**
   - Running type checks: `npm run typecheck`
   - Running production builds: `npm run build`
   - Running the commit engine test harness: `node test_file_update.js`
5. **Deployment & Self-Hosting Guide:**
   - Netlify continuous deployment setup (`netlify.toml` build commands and functions bundling).
   - Required environment variables: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BLOBS_MASTER_KEY`.
   - Optional environment variables: `MANUAL_DAILY_CAP`, `ADMIN_GITHUB_LOGIN`, `LOCAL_BLOBS_DIR`.
6. **Security & Cryptography Model:**
   - Token encryption at rest using WebCrypto AES-GCM with SHA-256 derived key from `BLOBS_MASTER_KEY`.
   - Session management via `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
   - Admin role enforcement via server-side check against `ADMIN_GITHUB_LOGIN`.

---

## 10. Verification & Quality Gates

The restructuring must satisfy the following automated verification gates:

1. **TypeScript Typecheck:** `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
2. **Next.js Production Build:** `npm run build` (`next build`) compiles all 15 static and dynamic pages with 0 warnings/errors.
3. **Core Logic Test Script:** `node test_file_update.js` executes and confirms that:
   - Creating a new file in a repository succeeds.
   - Updating an already existing file in a repository succeeds without 409/422 errors.
   - Log entries are properly formatted and appended without wiping existing content.
4. **Zero Route Regressions:** All App Router endpoints remain at their canonical URLs.
5. **Documentation Completeness:** `AUDIT_REPORT.md` and `DEVELOPER_GUIDE.md` are completely generated and cross-referenced.
