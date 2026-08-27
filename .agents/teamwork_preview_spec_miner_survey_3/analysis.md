# Nexus System Architecture, Specification & E2E Testing Matrix

**Document Version:** 3.1.0  
**Author:** Spec Miner Survey 3  
**Target Project:** Nexus (`pranjal2410719/Nexus`)  
**Scope:** Complete architectural mapping, interface contracts, workflow analysis, 4-tier E2E test matrix, and file update test harness specifications.

---

## 1. Executive System Architecture

Nexus is an open-source, multi-tenant developer activity engine and GitHub commit automation scheduler built with **Next.js 15 (App Router)**, **React 19**, **TypeScript 5.7**, **@octokit/rest 20**, and **@netlify/blobs 8**.

### 1.1 High-Level Architecture Diagram

```
                     ┌─────────────────────────────────────────────────────────────┐
                     │                        NEXUS ENGINE                         │
                     │                                                             │
  ┌──────────────┐   │   ┌─────────────────────┐       ┌───────────────────────┐   │
  │ Web Browser  │───┼──▶│ Next.js App Router  │──────▶│ Multi-Tier Storage    │   │
  │ (User Client)│   │   │ Frontend & API (App)│       │ (Netlify / Local Dev) │   │
  └──────────────┘   │   └──────────┬──────────┘       └───────────┬───────────┘   │
                     │              │                              │               │
                     │   ┌──────────▼──────────┐                   │               │
  ┌──────────────┐   │   │ Security & Auth     │                   │               │
  │ Netlify Cron │───┼──▶│ (AES-GCM / Session) │                   │               │
  │ (Heartbeat)  │   │   └──────────┬──────────┘                   │               │
  └──────────────┘   │              │                              │               │
                     │   ┌──────────▼──────────────────────────────▼───────────┐   │
                     │   │ Commit Engine & Log Pruner (lib/core)               │   │
                     │   └──────────────────────────┬──────────────────────────┘   │
                     └──────────────────────────────┼──────────────────────────────┘
                                                    │
                                         ┌──────────▼──────────┐
                                         │   GitHub REST API   │
                                         │  (Per-User Token)   │
                                         └─────────────────────┘
```

### 1.2 Subsystem Decomposition

1. **Presentation Layer (`app/`, `components/`)**:
   - Next.js 15 App Router using React 19 Client and Server Components.
   - Distinct views: Main Dashboard (`app/page.tsx`), Service Status & Health Monitor (`app/status/page.tsx`), and Administrator User Directory (`app/admin/page.tsx`).
   - Reusable UI component library (`components/dashboard/`, `components/status/`, `components/admin/`, `components/ui/`).
2. **API & Route Handler Layer (`app/api/`)**:
   - HTTP Route Handlers handling OAuth lifecycle, configuration management, manual commit triggering, admin inspection, and service health checks.
   - Unified CORS and JSON response wrappers (`lib/http/`).
3. **Core Domain & Engine Layer (`lib/core/`)**:
   - `commit-engine.ts`: Multi-tenant commit dispatcher, GitHub contents CRUD, blob SHA resolution, and batch execution.
   - `log-pruner.ts`: Safe rolling log retention using timestamped regular expression splitters (`NEXUS_ENTRY_RE`), preserving arbitrary user markdown headings.
   - `task-generator.ts`: Synthetic developer practice generator across Algorithms/Data Structures (C++ implementations, complexity analysis).
4. **Authentication, Session & Permissions Layer (`lib/auth/`)**:
   - `user.ts`: Single isolation gate resolving `UserConfig` per authenticated request. `publicUser` sanitizer stripping sensitive credentials.
   - `session.ts`: Cryptographically secure session UUID generation, persistence, and invalidation.
   - `cookies.ts`: HttpOnly, Secure, SameSite=Lax cookie encoding/decoding with defensive `URIError` protection.
   - `permissions.ts`: Role-Based Access Control (RBAC) checking `ADMIN_GITHUB_LOGIN`.
5. **Security & Cryptography Layer (`lib/security/`)**:
   - `encryption.ts`: WebCrypto AES-256-GCM authenticated encryption at rest. SHA-256 key derivation from variable-length `BLOBS_MASTER_KEY` with fresh 12-byte initialization vectors (IV) per encryption.
6. **Storage Layer (`lib/storage/`)**:
   - `blob-store.ts`: Dynamic store resolution (`getStoreMode`) selecting Netlify Blobs (`STORE_NAME = "nexus-users"`) in production or `LocalFileStore` (`.data/blobs`) in local development.
   - `local-file-store.ts`: File-backed key-value store with atomic-safe serialization and directory management.
7. **Background Scheduled Worker (`netlify/functions/heartbeat.ts`)**:
   - Cron-triggered serverless function (`*/15 * * * *`).
   - Timezone-aware circular clock slot matching (24h clock with wraparound handling).
   - Write-ahead idempotency marker persistence (`lastRun = YYYY-MM-DD`).
   - Fault-isolated tenant processing loop with 12-second execution budget protection.

---

## 2. End-to-End User Workflows

```
  [1. GitHub OAuth Login] ──▶ [2. Repo Picker & Config Save] ──▶ [3. Scheduled Auto-Commits]
             │                                                                ▲
             └──▶ [4. Manual Instant Dispatch]                                │
             │                                                                │
             └──▶ [5. Admin User Management] ──▶ [6. Service Health Check] ───┘
```

### Workflow 1: User Authentication & Onboarding
1. User visits `/` and clicks "Sign in with GitHub".
2. Frontend redirects to `GET /api/auth/start`.
3. Server generates a random UUID `state`, stores `oauth:${state}` in Blob store (10-minute TTL), and redirects user (302) to `https://github.com/login/oauth/authorize` requesting `repo` scope.
4. User authorizes application; GitHub redirects back to `GET /api/auth/callback?code=...&state=...`.
5. Server verifies state existence and expiration (`Date.now() - createdAt <= 600000ms`), deletes state token, and exchanges `code` for a GitHub `access_token` via GitHub OAuth endpoint.
6. Server fetches authenticated GitHub user profile via Octokit (`users.getAuthenticated`).
7. Server encrypts `access_token` using AES-256-GCM and persists `user:${githubId}` in Blob store. Existing preferences (repo, slots, timezone) are preserved on re-login.
8. Server creates a session UUID `session:${sessionId}` and returns a 302 redirect to `/?logged_in=1` with `Set-Cookie: nexus_session=...; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure`.

### Workflow 2: Target Configuration & Schedule Setup
1. Dashboard loads `/api/me` to retrieve authenticated user config and `/api/repos` to populate the repository selector.
2. User selects repository (e.g. `alice/my-practice`), specifies target file (`PROGRESS_LOG.md`), selects timezone (e.g. `America/New_York`), and configures 1 to 3 daily burst slots (e.g. `09:00` [2 commits], `15:00` [1 commit]).
3. User clicks "Save Configuration", issuing `POST /api/save-config`.
4. Server validates input formats (alphanumeric repo names, max 200 char path without `..`, valid IANA timezone, 1–3 valid slots with 1–3 commits).
5. Server preserves `lastRun` timestamps for unchanged slots (preventing same-day duplicate bursts), saves updated user in Blob store, and returns updated `publicUser`.

### Workflow 3: Background Scheduled Commit Burst (Heartbeat)
1. Netlify Scheduled Functions triggers `netlify/functions/heartbeat.ts` every 15 minutes (`*/15 * * * *`).
2. Scheduler queries Blob store for all `user:*` keys.
3. For each user, scheduler calculates wall-clock time in user's configured IANA timezone using `Intl.DateTimeFormat`.
4. Scheduler determines if any slot is due within a ±15-minute window on a 24-hour circular clock across today, yesterday, and tomorrow candidate offsets.
5. If due and `slot.lastRun !== targetDateKey`:
   - **Write-Ahead Guard**: Sets `slot.lastRun = targetDateKey` and writes user record to Blob store *before* executing GitHub API calls.
   - Decrypts user's `encryptedToken` in memory.
   - Instantiates Octokit client with user's personal token.
   - Executes `makeBatchCommits`:
     - Queries current file via `repos.getContent`.
     - Extracts existing blob SHA (or sets `undefined` on 404).
     - Generates synthetic C++ DSA task with markdown complexity log.
     - Appends log entry and prunes file to rolling 5 Nexus entries (`pruneEntries`).
     - Calls `repos.createOrUpdateFileContents` passing existing `sha`.
     - Chains new blob SHA into subsequent commits within the batch.
   - If all commits fail, rolls back `slot.lastRun` to previous value.
6. Execution budget timer halts user loop if elapsed time exceeds 12,000ms or processed users reach 50.

### Workflow 4: Manual Instant Dispatch
1. Authenticated user clicks "Dispatch Instant Commit" on dashboard, issuing `POST /api/commit-now`.
2. Server validates user has configured a repository.
3. Server checks daily manual commit counter `counter:${githubId}:${todayUTC}` against `MANUAL_DAILY_CAP` (default 5). If `used >= dailyCap`, returns HTTP 429 Too Many Requests.
4. Server decrypts user's token and calls `makeSingleCommit`.
5. `makeSingleCommit` resolves current file SHA, generates task, updates file via GitHub API, and returns commit SHA and URL.
6. Server increments `counter:${githubId}:${todayUTC}` in Blob store and returns JSON response with commit details.
7. Frontend updates local manual commit counter and displays live status card with direct link to GitHub commit.

### Workflow 5: Administrative Inspection
1. User navigates to `/admin`.
2. Client queries `GET /api/me` to check `user.isAdmin` flag (resolved by `ADMIN_GITHUB_LOGIN` env var).
3. If admin, client issues `GET /api/admin/users`.
4. Server validates session, verifies `isAdmin(user)`, lists all `user:*` blobs, strips encrypted tokens, sorts users by registration date descending, and returns sanitized `PublicUser[]`.

### Workflow 6: Service Status & Health Monitoring
1. User or uptime probe visits `/status` or calls `GET /api/health`.
2. Endpoint checks active store mode (`netlify-blobs`, `local-file`, or `unconfigured`).
3. Executes active storage write/read/delete probe key (`health:${timestamp}`).
4. Checks presence of environment variables (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BLOBS_MASTER_KEY`, `MANUAL_DAILY_CAP`).
5. Returns HTTP 200 OK (if healthy) or HTTP 503 Service Unavailable (if any core variable missing or store probe fails) with zero secret leakage.

---

## 3. External & Internal Interface Specifications

### 3.1 HTTP API Endpoints

| Endpoint | Method | Auth Required | Request Body | Response Body | Status Codes | Error Scenarios |
|---|---|---|---|---|---|---|
| `/api/auth/start` | GET | None | None | 302 Redirect to GitHub OAuth | 302, 500 | 500 if `GITHUB_CLIENT_ID` missing |
| `/api/auth/callback` | GET | None | Query params: `code`, `state` | 302 Redirect to `/?logged_in=1` + `Set-Cookie` | 302 | 302 with `?error=missing_params`, `invalid_state`, `state_expired`, `oauth_failed` |
| `/api/auth/logout` | GET | Session Cookie | None | 302 Redirect to `/` + Clear Cookie | 302 | Session destroyed or ignored if expired |
| `/api/me` | GET / OPTIONS | Session Cookie | None | `{ user: PublicUser }` | 200, 401, 204 | 401 if unauthenticated / invalid session |
| `/api/repos` | GET / OPTIONS | Session Cookie | None | `{ repos: Repo[] }` | 200, 401, 500, 204 | 401 if unauthenticated; 500 if GitHub token revoked |
| `/api/save-config` | POST / OPTIONS | Session Cookie | `{ owner, repo, targetFile, timezone, slots }` | `{ success: true, user: PublicUser }` | 200, 400, 401, 405, 204 | 400 on invalid repo/path/tz/slots; 401 if unauthenticated; 405 on non-POST |
| `/api/commit-now` | POST / OPTIONS | Session Cookie | None | `{ success: true, message, quote, commitUrl, sha, todayCount }` | 200, 400, 401, 405, 429, 500, 204 | 400 if repo unset; 429 if cap exceeded; 500 on GitHub error |
| `/api/health` | GET / OPTIONS | None | None | `HealthReport` (ok, service, node, store, env) | 200, 503, 204 | 503 if missing required env vars or store probe fails |
| `/api/admin/users` | GET / OPTIONS | Admin Session | None | `{ users: PublicUser[] }` | 200, 401, 403, 500, 204 | 401 if unauthenticated; 403 if non-admin |

### 3.2 Storage Keys & Schemas (`STORE_NAME = "nexus-users"`)

```
user:{githubId}      -> JSON stringified UserConfig object
session:{sessionId}  -> JSON { userId: string, createdAt: string }
oauth:{state}        -> JSON { createdAt: number }
counter:{id}:{date}  -> String integer representing daily manual commits used
health:{timestamp}   -> Ephemeral string "ok" for self-check probe
```

---

## 4. UI Components & State Management

| Component File | Role & Visual Presentation | Key Props / State | User Interactions |
|---|---|---|---|
| `app/page.tsx` | Dashboard & Landing Page Container | `user`, `repos`, `slots`, `timezone`, `targetFile`, `dispatch`, `todayCount` | Form edits, instant commit trigger, OAuth redirect |
| `components/dashboard/navbar.tsx` | Global top navigation bar | `user`, `menuOpen`, `onToggleMenu`, `sourceUrl` | Navigation links, Mobile menu toggle, Sign In / Sign Out |
| `components/dashboard/mobile-nav.tsx` | Responsive sliding mobile menu | `open`, `onClose`, `user`, `sourceUrl` | Backdrop click, Escape key close, Navigation |
| `components/dashboard/hero-banner.tsx` | Unauthenticated landing hero | `visible` | Call-to-action "Connect GitHub Account" |
| `components/dashboard/config-form.tsx` | Step 1 Repository & Burst Schedule form | `repoVal`, `targetFile`, `timezone`, `slots`, `saveStatus` | Dropdown selection, slot addition/removal, time/count radio adjustment, Save |
| `components/dashboard/dispatch-console.tsx` | Step 2 Instant Dispatch Terminal Console | `dispatch`, `sessionCount`, `todayCount`, `manualLimitMsg` | "Dispatch Instant Commit" button click, live commit link preview |
| `components/dashboard/schedule-matrix.tsx` | Visual preview of configured bursts | `slots`, `timezone` | Displays scheduled burst cards with local wall times |
| `components/dashboard/feature-cards.tsx` | Architectural feature cards | None | Informational SayBriefly design cards |
| `components/status/health-card.tsx` | Service Status health dashboard | `health`, `healthLoading`, `healthError`, `healthCheckedAt` | "Refresh Status" button |
| `components/status/status-grid.tsx` | Detailed environment & store matrix | `health` | Renders chips for Store, Runtime, OAuth, Encryption, Cap |
| `components/admin/user-table.tsx` | Admin user directory data table | `users: AdminUser[]` | Read-only listing of registered tenants |
| `components/ui/menu-select.tsx` | Accessible custom keyboard-navigable select | `value`, `onChange`, `options`, `disabled`, `loading` | Arrow navigation, Enter/Space select, Escape close |
| `components/ui/loader.tsx` | Animated terminal-style loading indicator | `label` | Visual loading feedback |
| `components/ui/icons.tsx` | SVG Icon library (Repo, Lock, Chevron, Check) | Standard SVG props | Vector icon graphics |

---

## 5. Critical Bug Analysis & Exact Remediation Specifications

### 5.1 Bug 1: Pre-Existing Target File Update Bug (Requirement R1)
- **Defect Mechanism**: When updating a pre-existing file in GitHub via Octokit `createOrUpdateFileContents`, omitting the `sha` parameter causes GitHub REST API to reject the request with `HTTP 422 Unprocessable Entity ("sha wasn't supplied")`. Previously, if a target file existed (especially if 0-byte or previously initialized), `fetchCurrentFile` failed to propagate the existing blob SHA, or treated empty files as new files (`sha = undefined`).
- **Remediation Specification**:
  1. `fetchCurrentFile` must query `repos.getContent`. If HTTP 200, return `{ content, sha: data.sha }` regardless of file size (`size === 0` must retain SHA).
  2. If HTTP 404, return `{ content: "", sha: undefined }`.
  3. `makeSingleCommit` must assign `params.sha = sha` whenever `sha` is defined.
  4. In `makeBatchCommits`, the new blob SHA returned in the commit response must be chained into subsequent commits to prevent `HTTP 409 Conflict`.

### 5.2 Bug 2: Log Pruner Markdown Header Erasure (Requirement R1)
- **Defect Mechanism**: Older pruning logic used `content.split("## ")` and retained only the last 5 chunks, treating chunk 0 as the header. If a user had legitimate documentation with markdown subheadings (`## Architecture`, `## Installation`, `## API`), any file with >5 sections had user content permanently erased.
- **Remediation Specification**:
  1. Implement strict timestamped regex targeting: `NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/`.
  2. Split entries exclusively on `NEXUS_SPLIT_RE = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g`.
  3. Everything preceding the first Nexus timestamped entry is preserved verbatim as the immutable user header.
  4. Keep only the last `maxEntries` of Nexus entries.
  5. If `maxEntries <= 0`, strip all Nexus entries while preserving user header.
  6. Strip leading newlines on first kept entry to prevent whitespace accumulation across rolling iterations.

### 5.3 Bug 3: Midnight Circular Clock Double-Fire (Requirement R2)
- **Defect Mechanism**: The scheduler's circular 24h clock calculation `delta >= 1440 - 15` matched slots at `00:05` on both `23:55` of day D (matching day D+1 candidate) and `00:00` of day D+1 (matching today candidate). Because `slot.lastRun` was compared against today's date, it fired twice.
- **Remediation Specification**:
  1. `getDueTargetDateKey(slot, now, timeZone)` evaluates three discrete candidate day keys: Today, Tomorrow (if within +15m near 23:50), and Yesterday (if within -15m near 00:05).
  2. Returns the specific `targetDateKey` corresponding to the candidate.
  3. Prevents execution if `slot.lastRun === targetDateKey`.

### 5.4 Bug 4: Scheduler Write-Behind Marker Loss (Requirement R2)
- **Defect Mechanism**: Storing `slot.lastRun` only after completing all commits caused function timeouts or unhandled exceptions to drop the run marker, resulting in duplicate commit bursts on the next tick.
- **Remediation Specification**:
  1. Implement **Write-Ahead Logging**: Persist `slot.lastRun = targetDateKey` to Blob store *before* executing the GitHub commit batch.
  2. If the commit batch fails with 0 successful commits, explicitly rollback `slot.lastRun` to allow subsequent retries.

### 5.5 Bug 5: Cookie `URIError` on Malformed Percent-Encoding (Requirement R2)
- **Defect Mechanism**: In `lib/auth/cookies.ts`, calling raw `decodeURIComponent(part)` crashed with an unhandled `URIError` when receiving malformed cookie values (e.g. `%zz`).
- **Remediation Specification**: Wrap `decodeURIComponent` in a `try/catch` block falling back to raw string.

### 5.6 Bug 6: `StoreMode` TypeScript Type Mismatch (Requirement R2)
- **Defect Mechanism**: `types/auth.ts` declared `StoreMode = "netlify" | "local" | "unconfigured"` while `lib/storage/blob-store.ts` declared `StoreMode = "netlify-blobs" | "local-file" | "unconfigured"`, generating `TS2367: This comparison appears to be unintentional` in `components/status/status-grid.tsx`.
- **Remediation Specification**: Unify `StoreMode` declaration across `types/auth.ts`, `types/health.ts`, and `lib/storage/blob-store.ts` to `"netlify-blobs" | "local-file" | "unconfigured"`.

### 5.7 Bug 7: Target File Path Traversal Vulnerability (Requirement R2)
- **Defect Mechanism**: Unsanitized target file paths in `POST /api/save-config` allowed relative path traversal vectors (`../secret.txt`).
- **Remediation Specification**: Normalize path, replace `\` with `/`, strip leading `/` and `./`, reject strings containing `..`, empty paths, and paths exceeding 200 characters.

---

## 6. Comprehensive 4-Tier E2E Test Suite Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│                     NEXUS 4-TIER E2E TEST MATRIX                       │
├────────────────────────────────┬───────────────────────────────────────┤
│ Tier 1: Feature Coverage       │ 8 Features, >=5 tests/feat (44 tests) │
│ Tier 2: Boundaries & Corners   │ 7 Categories (20 tests)               │
│ Tier 3: Cross-Feature Pipes    │ 5 Multi-Component Pipelines (5 tests) │
│ Tier 4: Real-World Workloads   │ 3 End-to-End Scenarios (3 tests)      │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 6.1 Tier 1: Feature Coverage Matrix (44 Tests across 8 Features)

| Feature # | Feature Name | Description & Invariants | Test Cases & Assertions |
|---|---|---|---|
| **F1** | File Update & Blob SHA Handling | File creation on 404, SHA preservation on existing files, 0-byte file handling, sequential SHA chaining, batch commit tracking, partial failure recovery | 1. `test_file_update_creates_new_file_when_not_found`<br>2. `test_file_update_preserves_sha_on_existing_populated_file`<br>3. `test_file_update_handles_existing_empty_0byte_file`<br>4. `test_sequential_commits_update_sha_chain`<br>5. `test_batch_commits_tracks_committed_count_and_errors`<br>6. `test_batch_commits_recovers_from_partial_failure` |
| **F2** | Safe Log Pruning & Path Sanitization | Custom header preservation (>5 user headings), rolling N-entry pruning, zero/negative maxEntries pruning, empty content handling, path sanitization | 1. `test_prune_entries_preserves_user_header_and_limits_entries`<br>2. `test_prune_entries_with_zero_or_negative_max_entries`<br>3. `test_prune_entries_on_empty_or_non_nexus_content`<br>4. `test_prune_entries_preserves_arbitrary_markdown_headings`<br>5. `test_sanitize_path_normalizes_slashes_and_whitespace`<br>6. `test_sanitize_path_preserves_nested_structures` |
| **F3** | Token Encryption & Key Derivation | AES-256-GCM round-trip, per-call unique 12-byte IVs, missing master key rejection, malformed payload detection, SHA-256 key derivation, ciphertext tamper detection | 1. `test_encrypt_decrypt_round_trip`<br>2. `test_encryption_uses_unique_iv_per_call`<br>3. `test_encryption_throws_on_missing_master_key`<br>4. `test_decryption_throws_on_malformed_payload`<br>5. `test_key_derivation_handles_variable_length_master_keys`<br>6. `test_decryption_fails_on_tampered_ciphertext` |
| **F4** | Local Blob Storage Engine | String & JSON set/get, key deletion, non-existent key null safety, prefix filtering, safe path character sanitization | 1. `test_local_store_set_and_get_string`<br>2. `test_local_store_set_and_get_json`<br>3. `test_local_store_delete_key`<br>4. `test_local_store_get_nonexistent_key_returns_null`<br>5. `test_local_store_list_with_prefix_filtering`<br>6. `test_local_store_sanitizes_special_characters_in_keys` |
| **F5** | Cookie Parsing & Session Serialization | Single/multiple cookie parsing, URL-decoded value parsing, empty/malformed header resilience, 30-day session cookie generation, session clearing headers | 1. `test_parse_cookies_single_and_multiple`<br>2. `test_parse_cookies_handles_url_encoded_values`<br>3. `test_parse_cookies_handles_empty_or_malformed_header`<br>4. `test_session_cookie_formats_proper_attributes`<br>5. `test_clear_session_cookie_expires_immediately`<br>6. `test_parse_cookies_with_whitespace_and_special_chars` |
| **F6** | Scheduler Slot Math & Timezone Logic | Exact match evaluation, +/-15min window calculations, outside window rejection, idempotency same-day blocking, 00:00/23:55 midnight circular clock math, multi-timezone wall-clock conversion | 1. `test_slot_due_exact_match`<br>2. `test_slot_due_within_15_minute_window`<br>3. `test_slot_not_due_outside_15_minute_window`<br>4. `test_slot_not_due_if_already_run_today`<br>5. `test_slot_due_midnight_wrap_around_2355_to_0005`<br>6. `test_zoned_parts_calculates_correct_wall_clock_time` |
| **F7** | Health Route & Store Probe | All-env 200 OK verification, missing env 503 error handling, storage probe round-trip, zero secret leakage, CORS preflight verification | 1. `test_health_check_returns_200_when_all_configured`<br>2. `test_health_check_returns_503_when_master_key_missing`<br>3. `test_health_check_store_probe_roundtrip`<br>4. `test_health_check_never_leaks_secrets` |
| **F8** | User Permissions & Admin Access | `publicUser` token sanitization, `ADMIN_GITHUB_LOGIN` match & non-admin rejection, session lifecycle create/lookup/destroy | 1. `test_public_user_strips_encrypted_token`<br>2. `test_is_admin_matches_configured_login`<br>3. `test_is_admin_returns_false_when_unset_or_mismatched`<br>4. `test_public_user_preserves_all_non_sensitive_fields` |

### 6.2 Tier 2: Boundary & Corner Cases (20 Tests across 7 Categories)

| Category # | Category Name | Boundary Conditions Tested | Expected Behavior |
|---|---|---|---|
| **B1** | Empty Files & 0-Byte Blobs | 0-byte file in blob store, 0-byte file in GitHub repository | Preserves blob SHA, initializes without throwing, handles empty text cleanly |
| **B2** | File Path Boundaries & Traversal | Exactly 200 char path, 201 char path, `../` traversal, backslashes `\`, leading slashes `///` | 200 chars allowed, 201 chars rejected, `..` rejected, backslashes normalized to `/`, leading slashes stripped |
| **B3** | Midnight & Timezone Rollover | 00:00 and 23:55 slot checks at 23:50, 00:05, and across UTC/IST/EST boundaries | Matches candidate day key without double-firing on date boundaries |
| **B4** | Malformed Cookie Decoding | Malformed percent-encoding `%zz`, multiple `=` in cookie value, spaces around keys/values | Does not throw `URIError`, parses key-value pairs defensively |
| **B5** | Missing Environment Variables | Missing `BLOBS_MASTER_KEY`, missing `ADMIN_GITHUB_LOGIN` | `encryptSecret` throws descriptive error, `isAdmin` returns false safely |
| **B6** | Rate Limiting Boundaries | Cap of 0, boundary at 4/5, custom `MANUAL_DAILY_CAP` | Rejects commit on cap limit with HTTP 429, increments counter accurately |
| **B7** | Corrupted Storage Records | Corrupted JSON in `user:*` and `session:*` blobs | `getUserById` returns null, scheduler skips corrupt record without halting |

### 6.3 Tier 3: Cross-Feature Integration Pipelines (5 Pipelines)

1. **Pipeline 1 (Token Encryption -> Storage -> Commit -> Safe Pruning)**:
   - Verifies AES-256-GCM encryption of token, persistence in LocalFileStore, retrieval, decryption, commit dispatch via mock Octokit, and rolling pruning of 5 entries while keeping user headers intact.
2. **Pipeline 2 (Session Cookie -> Auth Request -> RBAC Admin Authorization)**:
   - Verifies session issuance, HTTP cookie header parsing, user resolution, admin verification against `ADMIN_GITHUB_LOGIN`, and tenant enumeration with sanitized credentials.
3. **Pipeline 3 (Config Save -> Scheduler Tick -> Write-Ahead Idempotency)**:
   - Verifies `save-config` slot sanitization, scheduler due-slot evaluation, write-ahead marker update in storage, commit execution, and idempotency blocking on subsequent tick.
4. **Pipeline 4 (Manual Commit Burst -> Rate Limit Threshold Enforcement)**:
   - Verifies consecutive instant commit requests, daily counter increments, and 429 rejection once `MANUAL_DAILY_CAP` is reached.
5. **Pipeline 5 (OAuth State Creation -> CSRF Callback Verification -> Replay Rejection)**:
   - Verifies generation of OAuth state with timestamp, verification during callback, deletion upon consumption, and rejection of replayed state tokens.

### 6.4 Tier 4: Real-World Workload Scenarios (3 Scenarios)

1. **Scenario 1: Complete 11-Step User Lifecycle Journey**:
   - Executes full user journey: (1) OAuth Start -> (2) OAuth Callback code exchange & token encryption -> (3) Repo listing -> (4) Schedule configuration save -> (5) Dashboard profile load (`/api/me`) -> (6) Scheduled cron execution -> (7) 1st Manual commit -> (8) 2nd Manual commit (hitting daily cap) -> (9) Service health check probe -> (10) Logout session destruction -> (11) Subsequent request 401 unauthorized barrier.
2. **Scenario 2: Multi-Tenant Fan-Out Simulation across 5 Timezones**:
   - Deploys 5 simultaneous tenants across `UTC`, `Asia/Kolkata`, `America/New_York`, `America/Los_Angeles`, and off-schedule tenant; verifies exact wall-clock triggering at 14:00 UTC and zero cross-tenant interference.
3. **Scenario 3: Fault Injection & Platform Resilience**:
   - Injects mixed tenant workloads: healthy tenant, corrupted JSON record, and 503 GitHub API error. Verifies system catches per-tenant errors and continues servicing remaining tenants without platform crash.

---

## 7. Programmatic Test Harness Specification (`test_file_update.js`)

To satisfy **Requirement R1 Bug Fix Verification**, a standalone verification script `test_file_update.js` is specified with the following requirements:

### 7.1 Loader & Execution Requirements
- Run via Node.js ESM with loader hooks for TypeScript modules:
  ```bash
  node --experimental-strip-types --import ./tests/ts_resolver.js ./test_file_update.js
  ```
- Must execute completely offline without requiring a live GitHub account or active Netlify deployment.

### 7.2 Core Verification Suites

```
test_file_update.js
├── Suite 1: Log Pruning & User Markdown Preservation
│   ├── Test 1.1: Preserves arbitrary markdown sections (>5 headers) while pruning old Nexus entries
│   ├── Test 1.2: Handles brand new file header and rolling prune limit (5 entries)
│   ├── Test 1.3: Handles headerless files starting directly with Nexus entries
│   ├── Test 1.4: Zero-entry pruning edge case (maxEntries <= 0 keeps header only)
│   ├── Test 1.5: Sequential rolling commits (25 consecutive commits without whitespace drift)
│   └── Test 1.6: Returns unmodified content for empty or non-Nexus content
├── Suite 2: Path Sanitization
│   └── Test 2.1: Sanitizes whitespace, relative prefixes, forward slashes, and backslashes
├── Suite 3: GitHub File Operations & Commit Logic
│   ├── Test 3.1: New File Creation: 404 response -> creates file with sha: undefined
│   ├── Test 3.2: Pre-existing Empty File: returns existing sha and passes sha in update payload
│   ├── Test 3.3: Pre-existing Populated File: preserves user headers and supplies existing SHA
│   ├── Test 3.4: Directory and Non-File Rejection: throws descriptive error
│   ├── Test 3.5: Sequential Batch Commits (3 iterations): SHA evolves and propagates across commits
│   └── Test 3.6: Sequential Batch Commits (20 iterations): exact maxEntries and zero whitespace drift
└── Suite 4: Save Config Route Path Validation
    └── Test 4.1: Target file path validation rejects directory traversal (..) and empty strings
```

---

## 8. Specification Discovery Tables

### 8.1 Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Core Engine | Target File Update & Blob SHA | Fetches target file from GitHub and creates/updates file passing existing blob SHA | `CommitConfig` (token, owner, repo, targetFile, client) | `{ content, sha }` & `SingleCommitResult` | Throws 404 handled -> `sha: undefined`; throws on directory / non-file | `lib/core/commit-engine.ts:21-112` |
| 2 | Core Engine | Sequential Batch Commits | Executes N consecutive commits chaining resulting SHAs across iterations | `CommitConfig`, `count: number`, `label: string` | `BatchResult` (committed, errors, lastSha, lastCommitUrl) | Collects errors per commit in `errors[]` array | `lib/core/commit-engine.ts:118-140` |
| 3 | Core Engine | Safe Rolling Log Pruner | Retains last N timestamped entries (`NEXUS_ENTRY_RE`) while keeping user markdown headers intact | `content: string`, `maxEntries: number` | `string` (pruned content) | Returns input on non-Nexus content; handles `maxEntries <= 0` | `lib/core/log-pruner.ts:8-46` |
| 4 | Core Engine | File Path Sanitization | Normalizes forward/backward slashes and removes leading relative dots and slashes | `path: string` | `string` (clean relative path) | Strips whitespace and leading `./`, `///`, `\` | `lib/core/log-pruner.ts:1-3` |
| 5 | Security | AES-256-GCM Token Encryption | Encrypts secrets at rest using WebCrypto AES-GCM with SHA-256 derived key and fresh 12-byte IV | `plain: string` | `string` (`${ivB64}.${cipherB64}`) | Throws on missing `BLOBS_MASTER_KEY` | `lib/security/encryption.ts:15-32` |
| 6 | Security | AES-256-GCM Token Decryption | Decrypts base64-encoded IV and ciphertext payload | `payload: string` | `string` (decrypted plain text) | Throws on malformed payload or tampered ciphertext | `lib/security/encryption.ts:34-53` |
| 7 | Storage | Blob Store Mode Resolution | Detects whether Netlify runtime or local development filesystem store is active | Environment variables | `"netlify-blobs" \| "local-file" \| "unconfigured"` | Throws when getting handle on unconfigured production | `lib/storage/blob-store.ts:16-55` |
| 8 | Storage | Local File-Backed Store | Development file store storing keys in `.data/blobs/*.json` | `key: string`, `value: any` | Text / JSON / AsyncIterable of keys | Handles missing dir/files gracefully (ENOENT -> null) | `lib/storage/local-file-store.ts:14-71` |
| 9 | Auth | GitHub OAuth Start | Initiates OAuth flow with random CSRF state token stored in blob store (10m TTL) | `Request` | 302 Redirect to GitHub Authorize | 500 if `GITHUB_CLIENT_ID` missing | `app/api/auth/start/route.ts:10-36` |
| 10 | Auth | GitHub OAuth Callback | Exchanges authorization code for token, stores user, and creates session cookie | Query params (`code`, `state`) | 302 Redirect with `Set-Cookie` | Redirects to `/?error=...` on invalid state/token | `app/api/auth/callback/route.ts:20-108` |
| 11 | Auth | Session Management & Cookies | Parses, sets 30-day HttpOnly cookie, and destroys session on logout | `Request`, `sessionId: string` | Cookie string / null | Defensive parsing catches `URIError` on malformed cookies | `lib/auth/session.ts`, `lib/auth/cookies.ts` |
| 12 | Auth | User Configuration Isolation | Resolves authenticated tenant from session cookie and strips sensitive encrypted token | `Request` | `UserConfig` / `PublicUser` | Returns null / 401 if unauthenticated | `lib/auth/user.ts:27-57` |
| 13 | Auth | Admin Role Permissions | Evaluates if authenticated user matches `ADMIN_GITHUB_LOGIN` | `UserConfig` | `boolean` | Returns false if env var unset or login mismatches | `lib/auth/permissions.ts:7-10` |
| 14 | GitHub API | Repository Service | Fetches paginated list of repositories accessible to authenticated user | `token: string`, `fallbackOwner: string` | `Repo[]` (name, full_name, owner, private) | Surfaces GitHub API errors | `lib/github/repo-service.ts:4-29` |
| 15 | Configuration | User Schedule Config Save | Validates repo, targetFile (<=200, no `..`), timezone, and 1-3 slots (1-3 count); preserves lastRun | `Request` JSON payload | `{ success: true, user: PublicUser }` | 400 on validation failure; 401 on unauthorized; 405 on non-POST | `app/api/save-config/route.ts:21-96` |
| 16 | Dispatch | Instant Commit Trigger | Fires single manual commit with daily cap counter enforcement (`counter:id:date`) | `Request` | `{ success: true, sha, commitUrl, todayCount }` | 400 if repo unset; 429 if cap exceeded; 500 on error | `app/api/commit-now/route.ts:11-64` |
| 17 | Health | Service Health & Self-Check | Performs store round-trip probe, checks env presence flags without secret leakage | None | `HealthReport` | 503 if env var missing or store probe fails | `app/api/health/route.ts:13-66` |
| 18 | Admin | Registered Users Directory | Lists all registered tenants sorted by creation date for administrator | Admin `Request` | `{ users: PublicUser[] }` | 401 if unauthenticated; 403 if non-admin | `app/api/admin/users/route.ts:9-42` |
| 19 | Scheduler | 15-Min Netlify Heartbeat | Multi-tenant cron (`*/15 * * * *`) with circular clock math, write-ahead markers, and 12s budget | Scheduled trigger | `{ ok: true, usersProcessed, slotsFired, commitsCommitted }` | Per-tenant try/catch prevents cascade failures | `netlify/functions/heartbeat.ts:109-205` |

### 8.2 Discovered Edge Cases & Observed Behaviors

| # | Feature | Input / Condition | Observed Behavior |
|---|---|---|---|
| 1 | File Update | Pre-existing 0-byte file (`size === 0`, `content === ""`) | Successfully returns existing blob SHA; GitHub update payload supplies SHA, avoiding 422 Unprocessable Entity error. |
| 2 | File Update | Target path is a directory (array of contents returned from GitHub) | Throws explicit `Error('Target path "..." is a directory, not a file.')`. |
| 3 | File Update | Target path is a symlink or submodule (`type !== "file"`) | Throws explicit `Error('Target path "..." is not a regular file.')`. |
| 4 | Log Pruning | User file containing >5 arbitrary `## ` headings before Nexus entries | Verbatim preserves all user headings; only prunes oldest timestamped Nexus entries. |
| 5 | Log Pruning | `maxEntries = 0` or negative number | Cleanses all Nexus log entries while retaining user header without throwing. |
| 6 | Log Pruning | Headerless log file starting directly with `## [YYYY-MM-DD...]` | Prunes oldest entries cleanly without inserting undefined header or drifting newlines. |
| 7 | Log Pruning | 25 consecutive rolling commits | Preserves header, retains exactly 5 latest entries, and maintains constant 2-newline spacing between header and first entry. |
| 8 | Path Sanitization | `\nested\dir\file.md` and `./PROGRESS_LOG.md` | Normalizes to `nested/dir/file.md` and `PROGRESS_LOG.md`. |
| 9 | Path Validation | Traversal attempts (`../secret.txt`, `dir/../../etc/passwd`) | Detected by `targetFile.includes("..")` and rejected with HTTP 400. |
| 10 | Path Validation | Path string exceeding 200 characters | Rejected by `targetFile.length > 200` with HTTP 400. |
| 11 | Clock Math | Slot at `00:05` checked at `23:55` previous day | Candidate tomorrow evaluation matches `targetDateKey` as tomorrow's date key, firing once and marking `slot.lastRun`. Next tick at `00:00` sees `slot.lastRun === todayKey` and does not re-fire. |
| 12 | Clock Math | Slot at `23:55` checked at `00:05` next day | Candidate yesterday evaluation matches `targetDateKey` as yesterday's date key, preventing double-firing. |
| 13 | Cookie Parsing | Cookie value with malformed percent-encoding (e.g. `%zz`) | `decodeURIComponent` throws `URIError`; caught in try/catch and falls back to raw string without crashing server. |
| 14 | Cookie Parsing | Cookie value containing `=` signs | Split by first `=` index (`indexOf("=")`) properly preserving value with embedded `=` characters. |
| 15 | Encryption | Master key of arbitrary length (e.g. 5 chars or 128 chars) | SHA-256 digest derives consistent 32-byte AES key; encrypts and decrypts without error. |
| 16 | Encryption | Ciphertext payload with tampered base64 bits | WebCrypto AES-GCM authentication tag mismatch throws decryption error, preventing ciphertext forgery. |
| 17 | Config Save | Changing slot times while keeping other slot times intact | Unchanged slot times retain their existing `lastRun` date key, preventing re-arming of already-fired slots. |
| 18 | Manual Cap | Hitting `MANUAL_DAILY_CAP` limit (e.g. 5 commits in a day) | Endpoint returns HTTP 429 Too Many Requests with descriptive message; resets next day. |
| 19 | Storage | Corrupt JSON record in `user:*` blob during scheduler run | Heartbeat skips corrupt record inside inner try/catch without crashing or halting other tenants. |
| 20 | Health Probe | Unconfigured master key in production | Health endpoint returns HTTP 503 with status report and zero secret exposure. |
