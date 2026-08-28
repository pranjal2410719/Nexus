## 2026-08-28T11:03:28Z

You are teamwork_preview_worker_m2_m3, working directory: /home/dev/Desktop/khurafati/Nexus/.agents/worker_m2_m3
Project Root: /home/dev/Desktop/khurafati/Nexus
Authoritative Request: /home/dev/Desktop/khurafati/Nexus/.agents/ORIGINAL_REQUEST.md
Project Scope: /home/dev/Desktop/khurafati/Nexus/PROJECT.md
Survey 3 Accessibility Analysis: /home/dev/Desktop/khurafati/Nexus/.agents/explorer_survey_3/analysis.md
Spec Miner Survey 1 Analysis: /home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_1/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You exclusively own: `/home/dev/Desktop/khurafati/Nexus/components/dashboard/bug-report-panel.tsx` and any minor accessibility styling in `/home/dev/Desktop/khurafati/Nexus/app/globals.css`.

TASK: Implement Milestones 2 & 3 (Accessibility Compliance, Focus Management, Design System & State Persistence).
1. Read the survey analysis reports.
2. In `components/dashboard/bug-report-panel.tsx`:
   - Implement `BugReportPanelProps`:
     ```typescript
     export interface BugReportPanelProps {
       initialOpen?: boolean;
       recipientEmail?: string;
       storageKey?: string;
       onOpenChange?: (open: boolean) => void;
     }
     ```
   - State Persistence (Requirement R4): SSR-safe `localStorage` synchronization using `storageKey ?? "nexus_bug_panel_open"` with try/catch guard, ensuring client-side route transitions and reloads preserve open/closed state.
   - ARIA & Accessibility (Requirement R2):
     * Trigger tab `.slideOutTab`: `role="button"`, `tabIndex={0}`, `aria-expanded={open}`, `aria-controls="slideOut-modal"`, `aria-label={open ? "Close bug report panel" : "Open bug report panel"}`, Enter and Space key handler.
     * Container & Modal: Separate trigger tab from the modal dialog. On `#slideOut-modal`, set `role="dialog"`, `aria-modal="true"`, `aria-labelledby="bugReportTitle"`, `aria-hidden={!open}`. When closed, ensure interior interactive elements cannot receive focus (using `tabIndex={open ? 0 : -1}` / `inert={!open}`).
     * Initial Focus: When opened, automatically shift focus to the close button (`.modal-close`) or first form control.
     * Focus Trapping: When opened, intercept `Tab` and `Shift+Tab` to trap focus cyclically within the modal's focusable elements (`.modal-close`, `select#bug-type`, `select#bug-severity`, `input#bug-title`, `textarea#bug-description`, `input#bug-email`, `.bug-submit-btn`), preventing focus from leaking to background page elements.
     * Focus Restoration: When closed (via Escape key, close button, or backdrop click), restore focus to `.slideOutTab`.
     * Form Semantics: Connect submit button to the `<form id="bug-report-form">` (or place inside the form), and add `role="status"` / `role="alert"` with `aria-live="polite"` to the status/error message container.
   - Design System (Requirement R3):
     * Use SayBriefly CSS tokens (`var(--color-terracotta)`, `var(--color-forest-ink)`, `var(--color-cream-paper)`, `var(--color-pencil-gray)`, `var(--color-whisper-gray)`).
     * Ensure focus rings have high contrast (`outline: 2px solid var(--color-forest-ink); outline-offset: 2px;`).
     * Ensure all text elements meet WCAG AA >= 4.5:1 contrast.
3. Run verification:
   - `npm run typecheck`
   - `npm test`
   - `npm run test:all`
4. Document all changes and verification outputs in `/home/dev/Desktop/khurafati/Nexus/.agents/worker_m2_m3/handoff.md`.
5. Send completion message via send_message.
