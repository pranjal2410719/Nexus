# 🚀 DEPLOYING Nexus

Complete self-host guide: **GitHub OAuth App setup → environment variables → Netlify deploy → verification → troubleshooting**.

> ⏱️ Total time: ~15 minutes. Nexus is a **Next.js app** — Netlify detects it automatically, builds it, and deploys both the app and the `heartbeat` scheduled function.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Create the GitHub OAuth App](#2-create-the-github-oauth-app)
3. [Set environment variables on Netlify](#3-set-environment-variables-on-netlify)
4. [Deploy to Netlify](#4-deploy-to-netlify)
5. [Verify everything works](#5-verify-everything-works)
6. [Troubleshooting](#6-troubleshooting)
7. [Production checklist](#7-production-checklist)

---

## 1. Prerequisites

- A **GitHub account** (to create the OAuth App).
- A **Netlify account** — the free tier is enough (heartbeat runs every 15 min).
- Your project code in a git repo (GitHub, GitLab, or Bitbucket) **or** the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed locally.
- **Node.js 18.18+** locally (only needed for local build checks).

---

## 2. Create the GitHub OAuth App

This app is how users "Continue with GitHub" and authorize Nexus to commit to *their* repos. The credentials you create here become `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### 2.1 Open the developer settings

1. Go to **https://github.com/settings/developers** (logged in as the account that should *own* the app).
2. Click **"New OAuth App"** (top right). You'll see **"Register a new OAuth application"**.

### 2.2 Fill in the registration form

| Field | Value |
|---|---|
| **Application name** | `Nexus` (or your brand) |
| **Homepage URL** | `https://YOUR-SITE.netlify.app` — the URL of your deployed site, e.g. `https://nexus.netlify.app` |
| **Application description** | *(optional)* `Serverless multi-tenant commit scheduler` |
| **Authorization callback URL** | `https://YOUR-SITE.netlify.app/api/auth/callback` — ⚠️ this **must** match exactly, including the path. |

> 🔁 **You can edit this app later.** If your site URL changes, update the Homepage + Callback URLs here first, then redeploy (no code change needed).

3. Click **"Register application"**.

### 2.3 Copy your credentials

1. You land on the app's page. Immediately copy:
   - **Client ID** → becomes `GITHUB_CLIENT_ID`
   - **Client secrets → Generate a new client secret** → becomes `GITHUB_CLIENT_SECRET`
2. **Save the secret somewhere safe** (GitHub shows it only once).

> 🔐 **Never commit** the client secret or any user tokens to git. They live only in Netlify env vars.

---

## 3. Set environment variables on Netlify

Nexus needs 3 required env vars (1 optional). Set them **before or after** deploy — but before your first OAuth login attempt.

### 3.1 Generate a master key

The `BLOBS_MASTER_KEY` encrypts every user's GitHub token at rest (AES-GCM). Generate a strong one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → e.g. 9f2c4b7d1a8e3f6c9b0a2d5e8f1c4a7b6d3e9f0c1a2b3c4d5e6f7a8b9c0d1e2f3
```

Save that output — it goes into Netlify next.

### 3.2 Add the variables

In the Netlify dashboard, go to your site → **Site configuration → Environment variables → Add a variable**:

| Variable | Value | Required |
|---|---|---|
| `GITHUB_CLIENT_ID` | Client ID from §2.3 | ✅ Yes |
| `GITHUB_CLIENT_SECRET` | Client secret from §2.3 | ✅ Yes |
| `BLOBS_MASTER_KEY` | The 64-char hex string from §3.1 | ✅ Yes |
| `MANUAL_DAILY_CAP` | e.g. `50` — manual-dispatch cap per user/day | Optional (default `50`) |

Add each one as **"Single value"** (not a file). **Do not** set a `GITHUB_TOKEN` — there is no shared token anymore; every user brings their own.

---

## 4. Deploy to Netlify

Pick **one** path — Git-based (recommended) or CLI.

### 4.A Git-based deploy (recommended)

1. Push this repo to GitHub/GitLab/Bitbucket:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/nexus.git
   git push -u origin main
   ```
2. In Netlify: **Add new site → Import an existing project**.
3. Connect your Git provider and pick the repo.
4. **Build settings** — Netlify auto-detects Next.js and applies the Next.js runtime plugin:
   - **Build command:** `npm run build`
   - **Publish directory:** `.next`
   - The `heartbeat` scheduled function in `netlify/functions/` is deployed automatically alongside the app.
5. Click **Deploy site**. Netlify runs `npm run build` (installs deps, compiles routes + API handlers) and bundles the heartbeat function with esbuild.
6. After the deploy finishes, note your site URL (e.g. `https://nexus.netlify.app`).
7. **If your site URL differs from what you put in the OAuth App (§2.2), update the OAuth App now** — Homepage URL + Callback URL must point at the real deployed URL.
8. Set the env vars from §3 in **Site configuration → Environment variables** (new deploys pick them up; you may need to **Trigger deploy → Deploy site** once after adding them).

### 4.B Netlify CLI deploy

```bash
# 1. Install deps
npm install

# 2. Log in to Netlify (opens browser)
npx netlify login

# 3. Link to a new or existing site
npx netlify init

# 4. Set env vars (or do it in the dashboard — §3)
npx netlify env:set GITHUB_CLIENT_ID your_client_id
npx netlify env:set GITHUB_CLIENT_SECRET your_client_secret
npx netlify env:set BLOBS_MASTER_KEY your_64_char_hex_key
# (optional) npx netlify env:set MANUAL_DAILY_CAP 50

# 5. Deploy a preview, then promote to production
npx netlify deploy --build          # preview URL
npx netlify deploy --build --prod   # production
```

> The `--build` flag runs `npm run build` locally first. If your site URL changed, update the OAuth App callback accordingly.

### 4.C About the schedule

The heartbeat function (`netlify/functions/heartbeat.ts`) declares `schedule: "*/15 * * * *"` in its `config` export. **Netlify picks this up automatically on deploy** — nothing else to configure. Confirm it in: **Site configuration → Functions → heartbeat → Settings** (shows "Every 15 minutes").

---

## 5. Verify everything works

1. **Open your site** (`https://YOUR-SITE.netlify.app`) — you should see the Nexus landing page with a **"Continue with GitHub"** button.
2. **Click it** → you're redirected to GitHub's authorize screen (asks for `repo` scope) → authorize → you land back on the dashboard logged in.
3. **Onboarding:** pick a repo, choose a timezone, set slots, hit **Save**.
4. **Instant dispatch:** press the manual commit button → the console should show a success with a commit SHA. Open the repo on GitHub to see the commit.
5. **Logs:** in Netlify → **Logs → Functions**, you should see:
   - `[heartbeat]` summaries every 15 minutes (may take up to 15 min to appear after deploy).
   - `[commit-now]`/`[auth]` entries when you dispatch or log in.
6. **Scheduled burst:** wait for your next configured slot + up to 15 min (heartbeat window) and confirm the commit lands in your `PROGRESS_LOG.md`.

### Quick API sanity checks

```bash
# Unauthenticated → expect 401
curl -s https://YOUR-SITE.netlify.app/api/me

# OAuth start → expect a 302 redirect to github.com
curl -sI https://YOUR-SITE.netlify.app/api/auth/start | grep -i location
```

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login redirects to `/?error=missing_params` | Env vars not set, or callback URL mismatch | Add `GITHUB_CLIENT_ID`/`SECRET`; re-check the OAuth App callback URL (§2.2) and trigger a redeploy |
| `/?error=invalid_state` | OAuth `state` marker not found in the Blob store (clicked login twice, or blobs not reachable) | Retry login; ensure the site has Blobs enabled (free) |
| `/?error=oauth_failed` | The code exchange failed — wrong client secret, or callback URL not exactly `/api/auth/callback` | Verify secret, verify callback URL, redeploy |
| `/?error=server_not_configured` | `GITHUB_CLIENT_ID` or `SECRET` missing in the *server* environment | Env vars must be added to the site, then redeploy so functions pick them up |
| Login works but repo picker is empty | User's token lacks `repo` scope, or no repos on the account | Scope `repo` is requested automatically at authorize; re-login after deleting the OAuth grant |
| "Failed to decrypt token" in logs | `BLOBS_MASTER_KEY` changed after users signed up | Keys are permanent — set it once and never change it (users re-login to re-encrypt) |
| No heartbeat commits | Slot time + timezone mismatch, or `lastRun` already set for today | Check slot `HH:MM` vs the user's timezone; wait for the 15-min window; check function logs |
| Function timeout errors in heartbeat | Too many due users in one 15-min tick | Normal at scale — budget guards (`BUDGET_MS`, `MAX_USERS_PER_TICK`) protect the tick; missed users fire on the next tick (idempotent via `lastRun`) |
| `GITHUB_TOKEN` env var set | Old single-tenant leftover | Delete it — Nexus v3 has no shared token |
| Build fails with a Next.js error | Node version too old on Netlify | Set `NODE_VERSION = "20"` under `[build.environment]` in `netlify.toml` (already present) |

---

## 7. Production checklist

- [ ] OAuth App callback URL matches the **real deployed** site URL (`/api/auth/callback`).
- [ ] `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BLOBS_MASTER_KEY` set in Netlify env vars; **no secrets in the repo** (`.env` is gitignored).
- [ ] Client secret not committed anywhere in git history.
- [ ] `BLOBS_MASTER_KEY` saved somewhere safe (password manager) — losing it means users must re-login.
- [ ] First login + manual commit verified end-to-end.
- [ ] Heartbeat schedule confirmed in Netlify Functions settings (`*/15 * * * *`).
- [ ] *(Optional)* If you rename/relocate the repo, update the OAuth App URLs and redeploy.
