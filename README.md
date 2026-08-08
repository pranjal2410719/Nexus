# Nexus — Open Source Multi-Tenant Commit Engine

Nexus is a **serverless, multi-tenant GitHub commit scheduler** — a Next.js app deployed on Netlify. Every user connects their *own* repository, configures their own daily bursts, and Nexus fires authentic conventional commits (`feat(dsa/trees)`, `fix(dsa/dp)`, …) with verified C++ implementations and complexity breakdowns — **fully isolated per user**.

Sign in with GitHub OAuth, encrypted tokens at rest, per-user data in Netlify Blobs, and a single heartbeat scheduler that serves everyone.

> **Built by [Pranjal Yadav](https://github.com/pranjal2410719)** — open-source, self-hostable, MIT licensed.

---

## ✨ Features

- **Next.js App Router** — route handlers serve the API (`/api/*`), the frontend is a single-page React dashboard.
- **Per-user isolation** — every commit runs with *your* encrypted token against *your* repo. No shared GitHub identity, no cross-user access.
- **GitHub OAuth login** — no passwords; your GitHub account *is* your account.
- **Custom burst schedule** — set any number of daily slots (`HH:MM`) in your own timezone, 1–10 commits each.
- **Heartbeat scheduler** — one Netlify scheduled function fans out every 15 minutes to due users (scheduled functions are static, so per-user crons aren't possible — the heartbeat is the multi-tenant answer).
- **Instant dispatch** — a manual commit button on your dashboard, capped per day.
- **Rolling log pruning** — `PROGRESS_LOG.md` keeps only the last 5 entries (zero file bloat).
- **Encrypted at rest** — user GitHub tokens are AES-GCM encrypted with `BLOBS_MASTER_KEY` before hitting the Blob store.

---

## 🗺️ Architecture

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
| `app/api/auth/start` | Redirect to GitHub OAuth authorize |
| `app/api/auth/callback` | Exchange code → token, store user (encrypted), set session |
| `app/api/auth/logout` | Destroy session + clear cookie |
| `app/api/me` | GET own config (never the token) |
| `app/api/repos` | GET user's repo list for the picker |
| `app/api/save-config` | POST validated per-user config |
| `app/api/commit-now` | POST manual dispatch (daily cap) |
| `app/api/health` | GET self-check — store mode, env presence, store round-trip (never leaks secrets) |
| `netlify/functions/heartbeat.ts` | ⭐ Scheduled function `*/15 * * * *` — fan-out scheduler |
| `lib/commit-helper.ts` | Shared engine — `makeSingleCommit` / `makeBatchCommits` take an explicit user `CommitConfig` |
| `lib/auth.ts` | Blob store access, sessions, cookie handling, `publicUser` sanitizer |
| `lib/security.ts` | AES-GCM encrypt/decrypt of user tokens |
| `lib/http.ts` | JSON + CORS response helpers |

### Blob store layout

```
Store "nexus":
  user:{githubId}      → JSON user config (token encrypted)
  session:{sessionId}  → { userId, createdAt }
  oauth:{state}        → OAuth state marker (CSRF)
  counter:{id}:{date}  → daily manual-dispatch counter
```

---

## 🚀 Deploy (self-host)

Full step-by-step guide with the GitHub OAuth App setup → **see [DEPLOYING.md](DEPLOYING.md)**.

Quick summary:

1. **Create a GitHub OAuth App** at `https://github.com/settings/developers`:
   - Homepage URL: `https://YOUR-SITE.netlify.app`
   - Callback URL: `https://YOUR-SITE.netlify.app/api/auth/callback`
2. **Set env vars** on Netlify: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BLOBS_MASTER_KEY` (optional `MANUAL_DAILY_CAP`).
3. **Deploy** — Netlify detects Next.js automatically:
   ```bash
   npm install
   npm run build   # local check
   # push to your Netlify-connected repo, or: npx netlify deploy --build --prod
   ```
4. **Verify** — `curl https://YOUR-SITE.netlify.app/api/health` should return `ok: true` with the store mode and env flags; then log in with GitHub, connect a repo, and hit the instant-dispatch button.

---

## 🧑‍💻 Local development

```bash
npm install
cp .env.example .env   # then fill in REAL GitHub OAuth credentials
npm run dev            # http://localhost:3000
```

**Logging in locally:**

1. Create a **GitHub OAuth App** for localhost at `https://github.com/settings/developers`:
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback`
2. Put its `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in `.env` (plus a `BLOBS_MASTER_KEY`).
3. Click **Continue with GitHub** on the page — you'll be redirected to GitHub, authorize, and land back in the dashboard, where you can connect a repo and fire commits.

No Blobs config needed locally: outside Netlify, Nexus automatically switches to a **file-backed store** (`.data/blobs`, overridable via `LOCAL_BLOBS_DIR`) so sessions and configs persist across restarts. Production uses real Netlify Blobs via the runtime-injected env vars.

The heartbeat scheduled function runs only on Netlify (not in `next dev`); use the Netlify CLI (`npx netlify dev`) if you want to exercise it locally.

---

## 🔒 Security model

- **Isolation gate:** every endpoint resolves the user via `getUserByRequest(request)` before touching any per-user data; Blob keys are namespaced by `githubId`.
- **Encrypted at rest:** tokens are AES-GCM encrypted with `BLOBS_MASTER_KEY`; the raw token never leaves server-side code.
- **CSRF:** OAuth `state` is stored and verified in the callback; cookies are `HttpOnly` + `SameSite=Lax`.
- **Rate limits:** GitHub tokens allow 5,000 API calls/hour — a user's daily volume (≤ 4 slots × 10 commits + manual) is trivial.
- **No secrets in the repo:** `.env` is gitignored; `.env.example` holds placeholders only.

---

## ⏱️ Heartbeat capacity

Scheduled functions cap at ~15s execution on the free tier. Each commit ≈ 0.3–0.6s API time, so one tick handles ~2–3 users (5-commit bursts). With 96 ticks/day that's **200+ active users on the free plan**. On Pro it scales far higher. Budget guards (`BUDGET_MS`, `MAX_USERS_PER_TICK`) keep every tick within limits, and the `lastRun` marker makes the system idempotent — no double commits, no missed users.

---

## 📜 License

MIT — see [LICENSE](LICENSE).
