# E2E Test Infra: Nexus Slide-Out Bug Report Panel

## Test Philosophy
- Opaque-box, requirement-driven, hermetic test suite.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + Real-World Workload Scenarios + Automated Accessibility (axe-core equivalent contract checking).

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|:---:|:---:|:---:|:---:|
| 1 | Responsive Breakpoints (320px, 768px, 1024px, 1920px) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Tab Visibility in Closed State | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Accessibility & ARIA Semantics | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 4 | Keyboard Navigation & Focus Trap | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | Design System & Contrast Ratios | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 6 | State Persistence & Route Changes | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 7 | Form Validation & Submission | Acceptance Criteria | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Node.js test runner invoking `tests/test_harness.js` and `tests/run_all.js`.
- Test Files: `tests/e2e/test_bug_report_panel.js` (or comprehensive test suite under `tests/`).
- Pass/Fail Semantics: 100% assertions passing with exit code 0. Zero accessibility violations.

## Coverage Goals
- Tier 1: ≥35 test cases (≥5 per feature across 7 core features).
- Tier 2: ≥35 boundary & corner test cases (e.g. 320px edge, rapid toggling, special characters, focus wrap boundaries, empty inputs).
- Tier 3: ≥10 cross-feature combinatorial test cases (focus trap + resize, keyboard esc + storage sync, etc.).
- Tier 4: ≥5 real-world user scenarios (full bug report submission flow, route navigation with panel open, dark mode/contrast validation, full axe-core compliance matrix).
- Tier 5: Adversarial edge cases and stress tests.
