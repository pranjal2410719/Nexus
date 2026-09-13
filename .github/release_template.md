## 🚀 Nexus v${{version}}

### ✨ Features
- Atomic daily counter with CAS retry loop
- Fixed midnight double-fire in heartbeat scheduler
- Fixed lexicographic starvation with numeric sort
- Session expiry (30 days) and revocation
- POST-only logout (CSRF protection)
- Health endpoint no longer leaks env values
- Env-driven Google Analytics tag

### 🐛 Bug Fixes
- Fixed health `ok` requires configured store + roundtrip
- Fixed malformed-cookie crash
- Fixed slot.count validation in heartbeat
- Fixed counter keyed by user's local date
- Fixed session expiry checks on every request

### 📚 Documentation
- Added CHANGELOG.md
- Updated README.md route map and version info
- Updated DEPLOYING.md defaults

### 🔧 Engineering
- Added GitHub Actions CI and release workflows
- Added version endpoint (`/api/version`)
- Added `npm run ci:check`, `npm run lint`, `npm run release` scripts

---

## 📊 Migration Notes

**Breaking changes:**
- `GET /api/auth/logout` is now `POST /api/auth/logout`
- Health endpoint now returns `503` if store is unconfigured
- `MANUAL_DAILY_CAP` default is now `5` (was incorrectly `50` in docs)