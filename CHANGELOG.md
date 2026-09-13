# Changelog — Nexus

All notable changes to the Nexus commit engine are documented here.

## [3.1.0] — 2026-09-12

### 🛡️ Security Hardening
- **Fixed session expiry** — sessions now expire after 30 days (`SESSION_MAX_AGE_MS`)
- **Fixed logout CSRF** — logout is now POST-only (`POST /api/auth/logout`); GET removed
- **Fixed health endpoint** — no longer leaks `MANUAL_DAILY_CAP` value; requires configured store + successful roundtrip to report `ok`
- **Fixed malformed cookie crash** — `decodeURIComponent` wrapped defensively in `parseCookies`

### ⚡ Scheduler Fixes
- **Fixed midnight double-fire** — removed ±15 min wrap-around window; slots fire exactly once per day in the user's timezone
- **Fixed lexicographic starvation** — user keys are now sorted numerically (`user:1 → user:2 → user:10`), with randomized start offset per tick
- **Fixed slot.count validation** — invalid `count` or malformed `time` slots are skipped; max batch count capped at 10
- **Improved crash-safe idempotency** — write-ahead marker persisted before GitHub API calls

### 🏗️ Daily Cap (Atomicity)
- **Made daily cap atomic** — `tryIncrementCounter` with 10-attempt CAS retry loop
- **Counter keyed by user's local date** (not UTC), matching the user's timezone setting
- **Counter incremented BEFORE commit execution**, preventing cap bypass under concurrency

### 📚 Documentation
- Added `CHANGELOG.md` for versioned release tracking
- Updated `README.md` to reflect current codebase structure and route map
- Updated `DEPLOYING.md` for version consistency
- Added `.github/workflows/ci.yml` for automated typecheck and tests

### 🔧 Engineering
- Added `version` field to `config/site.ts` (`3.1.0`)
- Added `session.ts` expiry and revocation helpers (`isSessionExpired`, `destroyAllSessions`)
- Added `log-pruner.ts` with safe Nexus-entry-only pruning (prevents data loss)
- Improved `lib/auth/user.ts` with session expiry check on every request

## [3.0.0] — 2026-08-28

### 🚀 Initial Release
- Serverless multi-tenant GitHub commit scheduler on Netlify
- GitHub OAuth login with encrypted tokens at rest (AES-GCM)
- Per-user isolated commit engine with configurable daily bursts
- Heartbeat scheduler (15 min fan-out) serving all users
- Rolling log pruning (last 5 entries only)
- SayBriefly design system, responsive dashboard
- File-backed store for local development
- Comprehensive test suite (Tiers 1–5, 100% pass, 0 axe-core violations)

---

## Versioning Policy

Nexus follows [SemVer](https://semver.org/):
- **MAJOR** — breaking changes, major architecture shifts
- **MINOR** — new features, bug fixes, backward-compatible improvements
- **PATCH** — security patches, docs, internal fixes
