# Project: Nexus Audit, Bug Fix, Restructuring, and Documentation

## Architecture
Nexus is a multi-tenant automated GitHub contribution scheduler built on Next.js 15 App Router, TypeScript, and Netlify Functions.
- **Frontend / Presentation**: Next.js App Router (`app/`), Tailwind CSS, Radix UI primitive components (`components/ui/`, `components/dashboard/`, `components/status/`, `components/admin/`).
- **API & Routing Layer**: Next.js App Router API endpoints (`app/api/auth/*`, `app/api/save-config`, `app/api/commit-now`, `app/api/repos`, `app/api/me`, `app/api/health`, `app/api/admin/*`).
- **Core Domain Services**:
  - `lib/core/commit-engine.ts`: Commit creation, batch execution, and blob SHA management.
  - `lib/core/log-pruner.ts`: Non-destructive markdown log truncation preserving user headers.
- **Security & Session**:
  - `lib/security/encryption.ts`: AES-256-GCM encryption with 12-byte IVs and SHA-256 key derivation.
  - `lib/auth/session.ts`: Cookie-based session extraction, CSRF validation, user authentication.
- **Storage Layer**:
  - `lib/storage/blob-store.ts`: Dual-mode storage provider dispatching to Netlify Blobs or Local File Store.
  - `lib/storage/local-file-store.ts`: Asynchronous file-backed key-value store for local development and offline testing.
- **Background Cron Engine**:
  - `netlify/functions/heartbeat.ts`: Multi-tenant cron evaluation with 24-hour circular clock matching, candidate day offsets, and write-ahead execution locking.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | GitHub File Update & SHA Handling | Support both creating new files and updating existing files without 422 Unprocessable Entity or 409 Conflict | M1 | ORIGINAL_REQUEST R1 |
| 2 | Non-Destructive Markdown Pruning | Target only timestamped Nexus entries while leaving arbitrary user markdown headers intact | M1 | Survey 1 & 3 |
| 3 | Core Type Safety & Build Cleanliness | Align `StoreMode` across `types/auth.ts`, `types/health.ts`, and `lib/storage/blob-store.ts` to eliminate TS2367 | M2 | Survey 2 |
| 4 | Asynchronous Storage Layer | Refactor `LocalFileStore` from synchronous `node:fs` calls to non-blocking `node:fs/promises` | M2 | Survey 2 |
| 5 | Octokit Client Re-use | Optimize batch commit execution to reuse instantiated Octokit clients across sequential calls | M2 | Survey 2 |
| 6 | Dead Code & Duplicate Elimination | Delete unused legacy files (`lib/auth.ts`, `lib/commit-helper.ts`, `lib/http.ts`, `lib/local-blobs.ts`, `lib/security.ts`, `app/components/`) | M2 | ORIGINAL_REQUEST R2 |
| 7 | Directory Restructuring | Organize project into modular directories (`app/`, `components/{dashboard,status,admin,ui}`, `lib/{auth,core,github,http,security,storage}`, `types/`, `config/`, `netlify/`) | M3 | ORIGINAL_REQUEST R3 |
| 8 | Build Validation | Verify `npm run build` / `npx next build` succeeds cleanly without errors or broken imports | M3 | ORIGINAL_REQUEST Acceptance |
| 9 | Comprehensive Audit Report | Generate `AUDIT_REPORT.md` documenting all identified bugs, refactored code, removed dead code, and restructuring | M4 | ORIGINAL_REQUEST Acceptance |
| 10 | Developer Guide Documentation | Generate `DEVELOPER_GUIDE.md` documenting architecture, directory structure, workflows, and developer instructions | M4 | ORIGINAL_REQUEST R4 |
| 11 | Programmatic Test Verification | Provide `test_file_update.js` verifying pre-existing file updates | M1 / M5 | ORIGINAL_REQUEST Acceptance |
| 12 | 4-Tier E2E Test Suite | 72+ tests across Feature Coverage, Boundary Cases, Cross-Feature Pipelines, and Real-World Lifecycle Scenarios | M5 | Survey 3 |
| 13 | Adversarial Coverage Hardening | White-box adversarial testing (Tier 5) closing test gaps and proving resilience | M5 | Project Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | File Update Bug Fix & Core Engine | Fix GitHub SHA handling, path sanitization, markdown header preservation, verify with `test_file_update.js` | none | DONE |
| M2 | Codebase Audit, Refactoring & Cleanup | Fix `StoreMode` type bug, refactor `LocalFileStore` to async I/O, optimize Octokit instantiation, remove dead code | M1 | DONE |
| M3 | Directory Restructuring & Build Verification | Validate clean directory structure, update package.json scripts, execute `npm run build` | M2 | PLANNED |
| M4 | Documentation & Audit Report | Author `DEVELOPER_GUIDE.md` and `AUDIT_REPORT.md` | M3 | PLANNED |
| M5 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Run all E2E test tiers (1-4) and execute Tier 5 adversarial stress testing | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### `lib/core/commit-engine.ts` ↔ `Octokit`
- `fetchCurrentFile(config: CommitConfig)`: Returns `{ content: string, sha?: string }`.
  - HTTP 404: Returns `{ content: "", sha: undefined }`.
  - HTTP 200: Returns `{ content: decodedContent, sha: data.sha }` (even for 0-byte files).
- `makeSingleCommit(config: CommitConfig, messageSuffix?: string)`:
  - Invokes `octokit.repos.createOrUpdateFileContents` with `params.sha = sha` ONLY when `sha` is defined.
- `makeBatchCommits(config: CommitConfig, count: number)`:
  - Sequences `1..count` single commits, propagating the new blob SHA to each subsequent commit.

### `lib/storage/blob-store.ts` ↔ Store Implementations
- `getStore(options?)`: Returns `BlobStore` interface (`get(key, type)`, `set(key, val, options)`, `delete(key)`, `list(prefix)`).
- `StoreMode`: `"netlify-blobs" | "local-file" | "unconfigured"`.

## Code Layout
```
/
├── app/                      # Next.js 15 App Router pages and API routes
│   ├── admin/                # Admin user directory page
│   ├── api/                  # REST API endpoints (auth, save-config, commit-now, etc.)
│   ├── status/               # System health & storage status page
│   ├── layout.tsx            # Root layout wrapper
│   └── page.tsx              # Main dashboard view
├── components/               # React UI components
│   ├── admin/                # Admin table components
│   ├── dashboard/            # Dashboard widgets (config-form, slot-picker, etc.)
│   ├── status/               # Status & health cards
│   └── ui/                   # Shared UI primitives (buttons, modals, badges, inputs)
├── config/                   # Static app configuration
├── lib/                      # Core domain and utility modules
│   ├── auth/                 # Session extraction, CSRF, user resolution
│   ├── core/                 # Commit engine, log pruner
│   ├── github/               # Octokit client factory & repo helpers
│   ├── http/                 # HTTP response formatters
│   ├── security/             # AES-256-GCM encryption & key derivation
│   └── storage/              # Netlify Blobs & Local File Store
├── netlify/                  # Netlify Functions (heartbeat cron)
├── tests/                    # 4-Tier E2E test suite & harness
├── types/                    # TypeScript type declarations
├── AUDIT_REPORT.md           # Comprehensive codebase audit report
├── DEVELOPER_GUIDE.md        # Architecture & developer guide
├── PROJECT.md                # Master project architecture & tracking
├── TEST_INFRA.md             # Test suite specification & architecture
├── TEST_READY.md             # E2E test readiness confirmation
├── package.json              # Package dependencies and scripts
├── test_file_update.js       # Standalone file update verification script
└── tsconfig.json             # TypeScript configuration
```
