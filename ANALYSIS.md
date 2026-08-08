# Nexus (gitBoss) — Deep-Scan Analysis

> Generated: 2026-08-08 · Full workspace deep-scan of the project, its architecture, and its code.

---

## 1. Overview

**Nexus** (repo folder: `gitBoss`, package name `nexus`, v3.0.0) is an **open-source, multi-tenant GitHub commit scheduler** — a Next.js 15 App Router app deployed on Netlify.

- Users sign in with **GitHub OAuth** (no passwords).
- Each user connects their **own repo**, configures daily burst slots (`HH:MM`, 1–3 commits).
- A single Netlify **scheduled heartbeat function** (every 15 min) fans out to due users and fires authentic conventional commits (`feat(dsa/trees)`, `fix(dsa/dp)`, …) with C++ implementations and complexity breakdowns, written to a rolling `PROGRESS_LOG.md`.
- Manual "instant dispatch" button, capped per day.
- Tokens are **AES-GCM encrypted at rest**; per-user data lives in **Netlify Blobs**.

**Stack:** Next.js 15 · React 19 · TypeScript 5.7 · `@octokit/rest` 20 · `@netlify/blobs` 8 · Netlify (build Node 20, esbuild functions). MIT license.

---

## 2. Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │            GITBOSS (Next.js on Netlify)      │
  ┌─────────┐       │  ┌────────────┐      ┌──────────────────┐    │
  │  User   │──────▶│  │ GitHub     │      │  Config Store    │    │
  │ (OAuth  │       │  │ OAuth App  │─────▶│  (Netlify Blobs) │    │
  │  login) │       │  └────────────┘      │  user:{id} rows  │    │
  └─────────┘       │                      └────────┬─────────┘    │
                    │  ┌────────────┐      ┌────────▼─────────┐    │
  ┌─────────┐       │  │ heartbeat  │─────▶│  Commit Engine   │    │
  │ GitHub  │◀──────│  │ */15 cron  │  due │  (per-user, with │    │
  │  API    │       │  └────────────┘ users│  user's OWN token)│   │
  └─────────┘       │                      └──────────────────┘    │
                    └──────────────────────────────────────────────┘
```

### Route map

| Route / File | Role |
|---|---|
| `app/page.tsx` | Frontend — landing + dashboard (React, SayBriefly design) |
| `app/status/page.tsx` | Service Status / health page |
| `app/api/auth/start` | Redirect to GitHub OAuth authorize |
| `app/api/auth/callback` | Exchange code → token, store user (encrypted), set session |
| `app/api/auth/logout` | Destroy session + clear cookie |
| `app/api/me` | GET own config (never the token) |
| `app/api/repos` | GET user's repo list for the picker |
| `app/api/save-config` | POST validated per-user config |
| `app/api/commit-now` | POST manual dispatch (daily cap) |
| `app/api/health` | GET self-check — store mode, env presence, store round-trip |
| `netlify/functions/heartbeat.ts` | Scheduled function `*/15 * * * *` — fan-out scheduler |
| `lib/commit-helper.ts` | Shared engine — `makeSingleCommit` / `makeBatchCommits` |
| `lib/auth.ts` | Blob store access, sessions, cookies, `publicUser` sanitizer |
| `lib/security.ts` | AES-GCM encrypt/decrypt of user tokens |
| `lib/local-blobs.ts` | File-backed store for local dev |
| `lib/http.ts` | JSON + CORS response helpers |

### Blob store layout (`store "nexus"`)

```
user:{githubId}      → JSON user config (token encrypted)
session:{sessionId}  → { userId, createdAt }
oauth:{state}        → OAuth state marker (CSRF)
counter:{id}:{date}  → daily manual-dispatch counter
```

---

## 3. File inventory

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout — metadata, GA4 tag (G-5233K47F2S), Google Fonts |
| `app/globals.css` | Full SayBriefly design system (forest ink, highlighter yellow, cream paper, sticky-note cards) |
| `app/page.tsx` | Landing + dashboard (single client component, 786 lines) |
| `app/status/page.tsx` | Health/status page (268 lines) |
| `app/api/auth/start/route.ts` | OAuth authorize redirect |
| `app/api/auth/callback/route.ts` | OAuth code → token exchange, user creation |
| `app/api/auth/logout/route.ts` | Session destroy + cookie clear |
| `app/api/commit-now/route.ts` | Manual dispatch with daily cap |
| `app/api/health/route.ts` | Store round-trip + env presence self-check |
| `app/api/me/route.ts` | Current user config (sanitized) |
| `app/api/repos/route.ts` | GitHub repo list, paginated |
| `app/api/save-config/route.ts` | Validated config save |
| `lib/commit-helper.ts` | Commit engine + rolling log prune |
| `lib/auth.ts` | Store selection, sessions, cookies |
| `lib/security.ts` | AES-GCM token encryption |
| `lib/local-blobs.ts` | Dev-only file-backed store |
| `lib/http.ts` | JSON/CORS helpers |
| `netlify/functions/heartbeat.ts` | 15-min scheduler |
| `netlify.toml` | Netlify build/functions config |
| `DEPLOYING.md` | Step-by-step self-host guide |
| `.env.example` | Env var template |

---

## 4. Critical bugs (scheduler)

### 4.1 Midnight double-fire — slots near 00:00 commit twice
**Location:** `netlify/functions/heartbeat.ts:60-72` (due-window), `:106-135` (fire loop)

`isSlotDue` uses a **±15-minute window on a circular 24h clock** (including wrap-around: `delta >= 1440 - 15`), while the idempotency guard only blocks when `slot.lastRun === today`. For slots near midnight, one physical occurrence is "due" on **two different local days**:

- Slot `00:05`: fires at the 23:55 tick of the previous day (`lastRun = day D`), then **fires again** at the 00:00 tick (`lastRun = D ≠ today = D+1`) → two commits ~5 min apart, every day.
- Slot `23:55`: fires at 23:45 (day D) and again at 00:00 (day D+1).

This contradicts the comment at `heartbeat.ts:57-58` ("catches it exactly once") and the README's "no double commits" claim.

### 4.2 "Write-ahead" marker is actually write-behind — crash ⇒ duplicate commits
**Location:** `heartbeat.ts:112` vs `:132-135`

`slot.lastRun = dayKey` is set in memory before the GitHub batch, but the blob is only persisted **after all slots of the user complete** (`store.set` at `:132-135`). If the function is killed by a timeout, crashes, or `store.set` throws (swallowed at `:138`), the marker is lost and the next tick **re-fires the same slot**. There is also **no single-flight lock** for concurrent invocations (overrun into the next 15-min slot, or Netlify retry), so two instances can both read `lastRun = null` and both fire.

### 4.3 `pruneEntries` deletes the user's legitimate content
**Location:** `lib/commit-helper.ts:100-109`

Everything containing `"## "` in the target file is treated as a log entry; only the last 5 such sections survive. A pre-existing user file that legitimately uses `## ` headings (project notes, submodules, README content) will be pruned away after 5 commits. Only `parts[0]` is preserved as the "header". **Data-loss risk for the user's real file.**

---

## 5. Race conditions

| # | Issue | Location |
|---|---|---|
| R1 | **Manual daily cap is a non-atomic read-modify-write.** Two concurrent `POST /api/commit-now` can both read `used = 0`, both commit, and both write `1` → cap exceeded. Counter also increments only *after* the commit; if that write fails the user can retry and duplicate. | `app/api/commit-now/route.ts:33-49` |
| R2 | **Heartbeat vs. commit-now concurrent writes to the same file.** Both read file + `sha`, then `createOrUpdateFileContents`; the loser gets a 409/422 with no optimistic-concurrency retry. | `lib/commit-helper.ts:148-155`, `commit-now/route.ts:42-49` |
| R3 | **LocalFileStore writes non-atomic, un-locked** (`writeFileSync` straight to target path); crash mid-write corrupts a blob. | `lib/local-blobs.ts:46-48` |

---

## 6. Security issues

| Severity | Issue | Location |
|---|---|---|
| Med | **Malformed cookie ⇒ 500.** Unguarded `decodeURIComponent` throws `URIError` on values like `%zz`; propagates uncaught through `getUserByRequest` into `me`, `repos`, `save-config`, `commit-now`. | `lib/auth.ts:98` |
| Med | **Sessions never expire server-side.** `Session.createdAt` is recorded but never checked; a stolen cookie is valid indefinitely. No revocation on re-login; logout destroys only the current session. | `lib/auth.ts:114-127`, `:150-164`; `logout/route.ts` |
| Med | **Logout is a state-changing GET** — CSRF-able via a plain link (SameSite=Lax cookies are sent on top-level GETs). | `app/api/auth/logout/route.ts` |
| Med | **No CSRF tokens** on `commit-now` / `save-config`; protection rests entirely on SameSite=Lax. | `commit-now/route.ts`, `save-config/route.ts` |
| Med | **Health `ok` misreports unconfigured store as healthy** (`roundtrip === "n/a"` passes). Leaks the raw `MANUAL_DAILY_CAP` value despite "presence flags only" claim. | `health/route.ts:41`, `:44-48` |
| Med | **No key versioning/rotation** — rotating `BLOBS_MASTER_KEY` breaks every stored token with an opaque 500. | `lib/security.ts:15-41` |
| Low-Med | **`targetFile` accepts `..` / control chars**; used directly as a GitHub contents API path (own repo only, not cross-tenant). | `save-config/route.ts:45`; `commit-helper.ts:115,150` |
| Low | Unencoded `detail` in callback error redirect; token exchange omits `state` echo / `redirect_uri`; no PKCE. | `callback/route.ts:63`, `:52-60` |
| Low | Raw `err.message` surfaced to clients (repos/commit-now); token failures report 500 not 401/403. | `repos/route.ts:44`, `commit-now/route.ts:61` |
| Low | OAuth `state` blobs accumulate forever (no TTL) despite a comment claiming otherwise. | `start/route.ts:24`; `callback/route.ts:25-26` |
| Low | No AAD binding encrypted tokens to a user; swapped records decrypt silently. | `lib/security.ts` |
| Low | `CORS_HEADERS` uses `Allow-Origin: *` with cookie auth; internally inconsistent (no credentials allowed, so harmless today but a footgun). | `lib/http.ts:2-7` |

---

## 7. Scheduler / scaling issues

| # | Issue | Location |
|---|---|---|
| S1 | **Lexicographic starvation.** `store.list({ prefix: "user:" })` yields keys in sorted order (`user:1, user:10, user:100, user:2, …`). With `MAX_USERS_PER_TICK` and the 12s budget (which stops the loop first at ~2–3 users), the first lexicographic users monopolize every tick; tail users may never be serviced. | `heartbeat.ts:84-87` |
| S2 | **`slot.count` never validated in the heartbeat.** A legacy/malformed record with `count ≤ 0` retries forever (wasted decrypt + GitHub calls every tick); a huge count blows through the budget mid-batch (budget only checked between batches). | `heartbeat.ts:117-129` |
| S3 | **Corrupt/incomplete records re-scanned every tick without counting toward the cap**, silently consuming budget. | `heartbeat.ts:96-100` |
| S4 | **Budget overshoot by a single batch** — no mid-batch abort; platform hard-kill loses the write-behind markers (see 4.2). | `heartbeat.ts:117-129` |
| S5 | Slots fire **up to 15 min early** by design (a 12:00 slot fires at the 11:45 tick). | `heartbeat.ts:70-71` |
| S6 | Timezone changes invalidate `lastRun` (same-day re-fire or skip); invalid timezone throws `RangeError`, caught and silently skipped. | `heartbeat.ts:66-67`, `:90` |
| S7 | Malformed `slot.time` silently never fires (`NaN` delta). | `heartbeat.ts:62-63` |
| S8 | Directory/submodule/git-LFS files misdetected as empty → failed create (422). | `commit-helper.ts:117-120` |

---

## 8. Frontend / UX issues

| # | Issue | Location |
|---|---|---|
| F1 | **Status page hamburger is dead on mobile** — `onClick={() => {}}`, no mobile menu exists; mobile users on `/status` get a non-functional burger and no nav. | `status/page.tsx:78-88` |
| F2 | **Manual counter lies about the server cap.** Client keeps its own `localStorage` counter keyed by client-local date; the server counter is keyed by UTC date. Across a date boundary the UI can show "Manual Today: 0" while the server returns 429. | `page.tsx:75,105,234-238` vs `commit-now/route.ts:30` |
| F3 | **`sessionCount` is meaningless** — just "manual commits this page load". | `page.tsx:72,236` |
| F4 | **Blank flash on boot** — neither hero nor dashboard renders while `/api/me` resolves. | `page.tsx:470,502` |
| F5 | **Save with empty repo fails confusingly** ("Error loading repos…" option → server 400). | `page.tsx:528-539` |
| F6 | Schedule preview shows *saved* slots, not live edits, until Save. | `page.tsx:309-310` |
| F7 | `SOURCE_URL` points to the GitHub profile, not a repo, labeled "Source ↗". | `page.tsx:43` |
| F8 | Array `key={i}` on editable slot rows / matrix cards. | `page.tsx:580,714` |

---

## 9. Documentation / config drift

| # | Issue |
|---|---|
| D1 | **`MANUAL_DAILY_CAP` default contradiction:** DEPLOYING.md says "default 50"; `.env.example` says "default 5"; code enforces **5** (`commit-now/route.ts:8`); `/status` page hardcodes "default 50". |
| D2 | **README claims "any number of daily slots … 1–10 commits each"** — implementation caps at **3 slots** and **1–3 commits** (`save-config/route.ts:61`, `page.tsx:164`). README rate-limit note says "≤ 4 slots × 10 commits". |
| D3 | README route map omits `app/status/page.tsx`. |
| D4 | README/DEPLOYING capacity math is stale — "~15s free-tier timeout"; current Netlify scheduled-function limit is 30s. `BUDGET_MS = 12s` is safe either way. |
| D5 | **Hardcoded GA tag `G-5233K47F2S`** in `layout.tsx` — not env-driven, not documented; every self-hosted instance reports to the author's GA property. SPA navigations via `next/link` also don't fire GA page_views. |
| D6 | Branding drift: folder `gitBoss`, brand "Nexus". |
| D7 | `heartbeat.ts` uses relative `../../lib` imports while routes use `@/lib` alias. |
| D8 | `LINKEDIN_POST.md` is untracked (present on disk, not committed). |

---

## 10. Environment variables

| Var | Required | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth client secret |
| `BLOBS_MASTER_KEY` | Yes | AES-GCM key encrypting tokens at rest (64-char hex recommended) |
| `MANUAL_DAILY_CAP` | No | Manual-dispatch cap per user/day (code default **5**) |
| `LOCAL_BLOBS_DIR` | No | Dev-only file-store dir (default `.data/blobs`) |
| `NETLIFY_BLOBS_CONTEXT` / `NETLIFY_API_TOKEN` | Netlify-injected | Trigger Netlify Blobs mode |
| `URL` / `NETLIFY_URL` | Netlify-injected | Base-URL resolution in auth routes |

---

## 11. Prioritized fix roadmap

### P0 — prevents duplicate/false commits and data loss
1. **Midnight double-fire** — exclude the wrap-around edge from the due-window, or carry a per-slot "lastFired" timestamp instead of a day key. `heartbeat.ts:60-72`
2. **Crash-safe idempotency** — persist the `lastRun` marker (or better, a lease/running marker) *before* the GitHub batch and remove the run-time reliance on write-behind persistence. Add a single-flight lock key. `heartbeat.ts:106-135`
3. **`pruneEntries` data loss** — only prune entries that match the known log-entry heading pattern (timestamp format), never arbitrary `## ` headings. `commit-helper.ts:100-109`

### P1 — correctness + security
4. **Atomic daily cap** — use an atomic counter (or CAS loop) in the blob store; key by the user's local date. `commit-now/route.ts:33-49`
5. **Malformed-cookie crash** — defensively wrap `decodeURIComponent`. `auth.ts:98`
6. **Session expiry + revocation** — check `createdAt` age, prune old sessions, logout-all option; make logout POST or add origin check. `auth.ts`, `logout/route.ts`
7. **Lexicographic starvation** — order user keys numerically or rotate start offset per tick. `heartbeat.ts:84`
8. **Validate `slot.count` / slot count** in the heartbeat; enforce a max slot count in `save-config`. `heartbeat.ts:117-121`, `save-config/route.ts`

### P2 — hardening + polish
9. Health `ok` requires a configured store + successful round-trip; don't leak `MANUAL_DAILY_CAP` value. `health/route.ts`
10. Encode `detail` in the callback redirect; echo `state`/`redirect_uri` in token exchange; optional PKCE. `callback/route.ts`
11. Sanitize `targetFile` path segments; bound `owner`/`repo` length. `save-config/route.ts`
12. Map auth failures to 401/403 instead of raw 500s; stop surfacing `err.message`. `repos/route.ts`, `commit-now/route.ts`
13. Fix the status-page dead hamburger and the "default 50" hardcode. `status/page.tsx`
14. Align docs (D1–D6) and make the GA tag env-driven. `layout.tsx`, `README.md`, `DEPLOYING.md`, `.env.example`

### P3 — engineering hygiene
15. Add tests, lint, and a typecheck gate (`tsc --noEmit` in build); consider a CI workflow.
16. Single Octokit instance per commit; decrypt the token once per user per tick. `commit-helper.ts:112,136`, `heartbeat.ts:116`
17. Fix `LocalFileStore` typing (`get` return type, `set` stringifies non-strings). `local-blobs.ts`
18. Numeric sorting / dedup duplicate slot times. `save-config/route.ts`

---

## 12. Positives worth preserving

- Strict per-user isolation — commits always run with the user's own token; blob keys namespaced by `githubId`.
- `publicUser` consistently strips `encryptedToken`.
- AES-GCM encryption at rest with fresh IV per payload.
- OAuth `state` validation with 10-minute expiry.
- Heartbeat per-user try/catch (one corrupt tenant can't halt the platform) and budget guards.
- `lastRun` preservation in `save-config` prevents re-arming already-fired slots.
- `HttpOnly` + `Secure` + SameSite cookies; no `Domain` set.
- Clean design system, minimal dependencies (3 runtime deps), fully self-hostable.
