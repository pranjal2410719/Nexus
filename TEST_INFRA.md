# Nexus E2E Test Infrastructure & Architecture

This document defines the architecture, methodology, feature inventory, and execution specifications for the Nexus end-to-end (E2E) opaque-box test suite.

---

## 1. Test Architecture Overview

Nexus is a multi-tenant GitHub commit scheduler and developer activity engine. The E2E test harness is designed to execute comprehensively in offline, hermetic environments without external network or cloud dependencies.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 Nexus E2E Test Suite                    │
                  │                                                         │
                  │   ┌───────────────────┐       ┌─────────────────────┐   │
                  │   │  Tier 1: Features │       │  Tier 2: Boundaries │   │
                  │   │   (8 Features)    │       │   (7 Categories)    │   │
                  │   └─────────┬─────────┘       └──────────┬──────────┘   │
                  │             │                            │              │
                  │   ┌─────────▼─────────┐       ┌──────────▼──────────┐   │
                  │   │ Tier 3: Pipelines │       │   Tier 4: E2E Real  │   │
                  │   │ (Cross-Component) │       │   World Workloads   │   │
                  │   └─────────┬─────────┘       └──────────┬──────────┘   │
                  └─────────────┼────────────────────────────┼──────────────┘
                                │                            │
    ┌───────────────────────────▼────────────────────────────▼──────────────┐
    │                        Mock & Execution Harness                        │
    │  - LocalFileStore (.data/test_tmp_*)                                  │
    │  - MockGitHubRepoStore (Octokit simulator with Git blob SHA tracking) │
    │  - WebCrypto AES-GCM / Node.js standard Request & Response APIs       │
    │  - ts_resolver / ts_loader (Modular `@/` imports & extension resolver)│
    └────────────────────────────────────────────────────────────────────────┘
```

### Core Harness Components
- **`tests/test_harness.js`**: Custom, zero-dependency async test framework providing `describe`, `test`, lifecycle hooks (`beforeEach`, `afterEach`), isolated temp directory management (`createTempDir`), environment variable isolation (`withEnv`), and colored TAP-compliant terminal reporting.
- **`tests/mock_github.js`**: High-fidelity GitHub REST API & Octokit simulator implementing Git blob SHA-1 calculations (`sha1("blob <size>\0<content>")`), commit tree tracking, repo contents CRUD, user authentication endpoints, and fault injection hooks.
- **`tests/ts_resolver.js` & `tests/ts_loader.js`**: Node.js ESM module loader hooks enabling seamless TypeScript execution, path alias resolution (`@/*`), and extensionless import resolution.

---

## 2. 4-Tier Test Framework

The test suite is partitioned into four distinct tiers, guaranteeing both component-level correctness and complete end-to-end system reliability:

### Tier 1: Feature Coverage (>=5 tests per feature across 8 features)
Covers all primary functional capabilities in isolation:
1. **File Update & Blob SHA Handling**: File creation on 404, SHA preservation on existing files, 0-byte file handling, sequential SHA chaining, batch commit tracking, and partial failure recovery.
2. **Safe Log Pruning**: Custom header preservation, markdown title retention, exact N-entry rolling pruning, empty content handling, sub-heading and code block integrity, and path sanitization.
3. **Token Encryption & Security**: AES-256-GCM round-trip, per-call unique 12-byte IVs, missing master key rejection, malformed payload detection, SHA-256 variable-length key derivation, and ciphertext tamper detection.
4. **Local Blob Storage Engine**: String & JSON set/get, key deletion, non-existent key null safety, prefix filtering, and safe path character sanitization.
5. **Cookie Parsing & Session Serialization**: Single/multiple cookie parsing, URL-decoded value parsing, empty/malformed header resilience, 30-day session cookie generation, and session clearing headers.
6. **Scheduler Slot Math & Timezone Logic**: Exact match evaluation, +/-15min window calculations, outside window rejection, idempotency same-day blocking, 00:00/23:55 midnight circular clock math, and multi-timezone wall-clock conversion.
7. **Health Route & Store Probe**: All-env 200 OK verification, missing env 503 error handling, storage probe round-trip, zero secret leakage, and CORS preflight verification.
8. **User Permissions & Admin Access**: `publicUser` token sanitization, `ADMIN_GITHUB_LOGIN` match & non-admin rejection, and session lifecycle create/lookup/destroy.

### Tier 2: Boundary & Corner Cases
Tests edge conditions, malformed data, and resource constraints:
- 0-byte blob storage and 0-byte file initialization
- 200-character target file path length boundaries
- Path sanitization (leading slashes, backslashes, relative paths)
- Owner and repository regex validation (`/^[A-Za-z0-9_.-]+$/`)
- Midnight 00:00 and 23:55 circular clock wraparound (10-min offsets across day boundaries)
- Timezone dayKey rollover (UTC vs IST vs EST)
- Malformed cookies (`%zz` percent-encoding, values with `=`, whitespace)
- Missing environment variables and partial configurations
- Rate limiter boundary values (0, 4, 5 cap limits) and custom `MANUAL_DAILY_CAP`
- Corrupt JSON records in blob store and graceful scheduler skipping

### Tier 3: Cross-Feature Combinations
Tests multi-module interaction pipelines:
- **Pipeline 1**: Token encryption -> Local Blob Store save -> Commit Engine fetch & update with mock Octokit -> rolling log prune -> verify persisted record
- **Pipeline 2**: Session cookie creation -> parse cookie from Request -> getUserByRequest -> verify admin authorization -> query all users from Blob store
- **Pipeline 3**: Save user config (validating slots, repo, timezone) -> simulate scheduler heartbeat evaluating due slots -> fire batch commits -> update write-ahead lastRun in blob store
- **Pipeline 4**: Concurrent manual commit burst -> daily counter increment -> rate limit threshold enforcement -> state integrity
- **Pipeline 5**: OAuth state creation -> CSRF verification on callback -> store state cleanup & token storage

### Tier 4: Real-World Workloads & Multi-Tenant Simulation
Tests full system behavior under realistic production scenarios:
- **Scenario 1 (Complete User Journey)**: 11-step lifecycle from initial OAuth authorization redirect, callback code exchange, repo list retrieval, configuration save, dashboard info retrieval, scheduled heartbeat cron execution, manual instant commit burst with daily cap enforcement, status health check, logout session destruction, and 401 unauthorized barrier.
- **Scenario 2 (Multi-Tenant Fan-Out)**: 5 tenants distributed across UTC, Asia/Kolkata, America/New_York, and America/Los_Angeles with staggered schedules; verifies exact firing at local wall-clock times, zero cross-tenant credential leakage, and idempotent same-day guards.
- **Scenario 3 (Fault Injection & Resilience)**: Mixed workload with healthy tenants, corrupted JSON records, and failing GitHub API calls (503 Service Unavailable); verifies the engine isolates failures and continues servicing remaining tenants.

---

## 3. Directory Layout

```
Nexus/
├── tests/
│   ├── test_harness.js                  # Async test framework & assertions
│   ├── mock_github.js                   # Mock Octokit & GitHub API simulator
│   ├── ts_resolver.js                   # Node.js ESM module resolver
│   ├── ts_loader.js                     # TS & @/ path loader
│   ├── tier1_feature_coverage.test.js   # Tier 1 tests (44 tests)
│   ├── tier2_boundary_cases.test.js     # Tier 2 tests (20 tests)
│   ├── tier3_cross_feature.test.js      # Tier 3 tests (5 pipelines)
│   ├── tier4_real_world_lifecycle.test.js # Tier 4 tests (3 scenarios)
│   └── run_all.js                       # Master E2E runner
├── TEST_INFRA.md                        # Test architecture documentation
└── TEST_READY.md                        # Test suite readiness & execution guide
```

---

## 4. Execution Commands

To execute the entire E2E test suite:

```bash
node --experimental-strip-types --import ./tests/ts_resolver.js ./tests/run_all.js
```

To run individual tiers:

```bash
# Tier 1: Feature Coverage
node --experimental-strip-types --import ./tests/ts_resolver.js ./tests/tier1_feature_coverage.test.js

# Tier 2: Boundary & Corner Cases
node --experimental-strip-types --import ./tests/ts_resolver.js ./tests/tier2_boundary_cases.test.js

# Tier 3: Cross-Feature Combinations
node --experimental-strip-types --import ./tests/ts_resolver.js ./tests/tier3_cross_feature.test.js

# Tier 4: Real-World Workloads
node --experimental-strip-types --import ./tests/ts_resolver.js ./tests/tier4_real_world_lifecycle.test.js
```

---

## 5. Coverage & Quality Thresholds

| Metric | Target | Actual | Status |
|---|---|---|---|
| Total Test Cases | >= 50 | 72 | PASS |
| Tier 1 Features Covered | 8 / 8 | 8 / 8 (44 tests) | PASS |
| Tier 2 Boundary Categories | >= 5 | 7 (20 tests) | PASS |
| Tier 3 Pipelines | >= 3 | 5 (5 tests) | PASS |
| Tier 4 Scenarios | >= 2 | 3 (3 tests) | PASS |
| External Cloud Dependencies | 0 | 0 (Fully offline) | PASS |
| Exit Code on Success | 0 | 0 | PASS |
