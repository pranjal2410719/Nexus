## 2026-08-28T05:14:19Z

You are the Project Orchestrator for the Nexus app UI audit and bug fix task.

Working Directory: /home/dev/Desktop/khurafati/Nexus/.agents/orchestrator_3
Project Root: /home/dev/Desktop/khurafati/Nexus
Authoritative Request: /home/dev/Desktop/khurafati/Nexus/.agents/ORIGINAL_REQUEST.md

Task Summary:
Perform a comprehensive UI audit of the Nexus app’s slide‑out bug‑report panel, identify any layout, responsiveness, accessibility, or parameter conflicts, and fix the issues so the panel works correctly on both desktop and mobile devices.

Requirements:
- R1. Responsive behavior: The panel must display correctly on screen widths from 320 px up to 1920 px. The tab must remain visible when the panel is closed, and the panel must not overlap critical UI elements.
- R2. Accessibility compliance: All ARIA labels, keyboard navigation (Enter/Space/Escape), and focus management must function correctly and pass an automated axe‑core audit with zero violations.
- R3. Design‑system consistency: Colors, spacing, typography, and other visual styles must match the SayBriefly design system variables already used in the app.
- R4. State persistence (optional but preferred): When a user navigates to another page within the app, the panel should retain its open/closed state.

Acceptance Criteria:
- Visual verification across breakpoints (320 px, 768 px, 1024 px, 1920 px) shows the panel layout as intended and the tab is always visible when closed.
- Running axe-core (or equivalent automated accessibility tests) on the panel yields zero accessibility violations.
- Opening and closing the panel triggers no console errors and animates smoothly.
- (Optional) After navigating to a different route, the panel retains its previous open/closed state.

Instructions:
1. Initialize your BRIEFING.md and progress.md in your working directory (/home/dev/Desktop/khurafati/Nexus/.agents/orchestrator_3).
2. Decompose the task into milestones and dispatch specialist subagents (explorers, workers/implementers, reviewers, challengers, auditors) as needed.
3. Actively manage lifecycle, progress, and verification.
4. When complete, verify all acceptance criteria and notify me with your completion report.
