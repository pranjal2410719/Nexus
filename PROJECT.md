# Project: Nexus Slide-Out Bug Report Panel UI Audit & Remediation

## Architecture
- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript.
- **Global Layout**: `app/layout.tsx` mounts `<BugReportPanel />` across all routes (`/`, `/status`, `/admin`).
- **Component**: `components/dashboard/bug-report-panel.tsx` (Slide-out drawer, trigger tab, bug form, status indicator).
- **Styling**: SayBriefly design system in `app/globals.css` with CSS custom properties, responsive media queries, and utility classes.
- **Testing**: Hermetic test runner in `tests/test_harness.js` and `tests/run_all.js`.

## Code Layout
- `components/dashboard/bug-report-panel.tsx` — Bug Report Panel React component, accessibility hooks, focus management, form handling, and state persistence.
- `app/globals.css` — SayBriefly design tokens, desktop & mobile CSS layout for `#slideOut`, `.slideOutTab`, `.slideOut-modal`, and form controls.
- `app/layout.tsx` — Root application layout mounting the BugReportPanel.
- `tests/test_bug_report_panel.js` (or `tests/e2e/test_bug_report_panel.js`) — E2E, accessibility, responsive, and unit test suite.
- `tests/test_infra.js` / `tests/test_harness.js` — Test framework and runner.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Responsive 320px–1920px Layout | Tab visible when closed across all breakpoints, no viewport clipping or offscreen shift | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Desktop Anchoring & Mobile Layout Fixes | Fix desktop missing top anchor and resolve conflicting @media (max-width: 420px) blocks | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Closed Tab Isolation & Invisibility Fix | Prevent off-screen inputs from leaking into tab order when panel is closed | M2 | ORIGINAL_REQUEST §R2 |
| 4 | ARIA Semantics & Role Hierarchy | Add aria-expanded, aria-controls, isolate role="dialog" and aria-modal="true" | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Focus Trapping & Restoration | Cyclic Tab trap inside open modal, initial focus on open, restore focus to tab on close | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Keyboard Controls (Esc/Enter/Space) | Escape closes panel, Enter/Space toggles trigger tab, smooth keyboard navigation | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Accessible Form & Live Status | Form submit button properly associated, role="status"/role="alert" with aria-live="polite" | M2 | ORIGINAL_REQUEST §R2 |
| 8 | SayBriefly Token & Contrast Compliance | WCAG AA >= 4.5:1 text contrast on terracotta, 3:1 focus ring, consistent SayBriefly variables | M3 | ORIGINAL_REQUEST §R3 |
| 9 | State Persistence & Component Props | SSR-safe route/session/localStorage persistence, flexible BugReportPanelProps contract | M3 | ORIGINAL_REQUEST §R4 |
| 10 | 100% E2E & Axe-Core Accessibility Pass | Automated test suite covering Tiers 1-4 with zero axe-core violations and 100% pass | M4 | ORIGINAL_REQUEST Acceptance Criteria |
| 11 | Adversarial Hardening (Tier 5) | Stress testing, edge case verification, input boundary and memory leak audits | M4 | Project Pattern Phase 2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Responsive Layout & CSS Fixes | Remove conflicting media queries in `app/globals.css`, anchor desktop `#slideOut`, fix 320px mobile layout, fix CSS typo | none | DONE |
| 2 | Accessibility & Focus Management | Implement focus trap, restoration, offscreen inert/tabindex isolation, ARIA attributes, form semantics | M1 | DONE |
| 3 | Design System & State Persistence | Fix color contrast ratios, bind SayBriefly CSS tokens, implement SSR-safe localStorage persistence & props | M2 | DONE |
| 4 | E2E Test Suite & Final Verification | Build opaque-box test suite (Tiers 1-4), verify 100% pass & 0 accessibility violations, execute Tier 5 adversarial hardening | M3 | DONE |

## Interface Contracts
### `BugReportPanelProps` (`components/dashboard/bug-report-panel.tsx`)
```typescript
export interface BugReportPanelProps {
  initialOpen?: boolean;
  recipientEmail?: string;
  storageKey?: string;
  onOpenChange?: (open: boolean) => void;
}
```

### CSS Variables & Tokens (`app/globals.css`)
```css
:root {
  --color-terracotta: #b04a1c; /* Optimized for WCAG AA >= 4.5:1 text contrast */
  --color-terracotta-hover: #963e17;
  --color-forest-ink: #1a3300;
  --color-highlighter-yellow: #ffe95c;
  --color-cream-paper: #fcfaf5;
  --color-pencil-gray: #4a4a4a;
  --color-whisper-gray: #f1f1f1;
}
```
