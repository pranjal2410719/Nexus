# Original User Request

## Initial Request — 2026-08-27T17:32:25Z

You are the Project Orchestrator for the Nexus project audit, bug fixing, refactoring, restructuring, and documentation task.

Working Directory: /home/dev/Desktop/khurafati/Nexus/.agents/orchestrator_1
Project Root: /home/dev/Desktop/khurafati/Nexus
Authoritative Request: /home/dev/Desktop/khurafati/Nexus/.agents/ORIGINAL_REQUEST.md

Task Requirements:
1. R1. Fix File Update Bug: Identify and fix the issue where providing a target file name creates and updates a new file successfully, but fails to update the file if it already exists.
2. R2. Codebase Audit and Cleanup: Perform a deep audit to find other bugs. Refactor inefficient code, remove dead code, and delete any unused files.
3. R3. Directory Restructuring: Restructure the directory layout to improve readability and maintainability for developers.
4. R4. Developer Documentation: Generate comprehensive documentation explaining the system's workflows, architecture, and the newly restructured layout.

Acceptance Criteria:
- Bug Fix Verification: A small Node.js or shell script is created in the repository (e.g., test_file_update.js) that programmatically verifies a pre-existing file can be successfully updated by the system's core logic.
- Audit and Restructuring: AUDIT_REPORT.md is generated detailing all identified bugs, refactored code, removed dead code, and changes made to the directory structure. The project successfully builds (npm run build or npx next build) after restructuring and cleanup.
- Documentation: DEVELOPER_GUIDE.md (or updated README.md) is produced reflecting the new directory structure and developer instructions.

Please initialize your BRIEFING.md and progress.md in your working directory, decompose the task, dispatch specialist subagents as needed, monitor progress, and notify me when complete.

## 2026-08-28T05:13:36Z

# Teamwork Project Prompt — Draft

> Status: Step 9 — Ready for launch
> Goal: Perform a UI audit of the slide‑out bug‑report panel and fix identified issues
> Requested team: [none — teamwork routes from the description]

Perform a comprehensive UI audit of the Nexus app’s slide‑out bug‑report panel, identify any layout, responsiveness, accessibility, or parameter conflicts, and fix the issues so the panel works correctly on both desktop and mobile devices.

Working directory: ~/teamwork_projects/nexus_ui_audit

## Requirements

### R1. Responsive behavior
The panel must display correctly on screen widths from 320 px up to 1920 px. The tab must remain visible when the panel is closed, and the panel must not overlap critical UI elements.

### R2. Accessibility compliance
All ARIA labels, keyboard navigation (Enter/Space/Escape), and focus management must function correctly and pass an automated axe‑core audit with zero violations.

### R3. Design‑system consistency
Colors, spacing, typography, and other visual styles must match the SayBriefly design system variables already used in the app.

### R4. State persistence (optional but preferred)
When a user navigates to another page within the app, the panel should retain its open/closed state.

## Acceptance Criteria

- Visual verification across breakpoints (320 px, 768 px, 1024 px, 1920 px) shows the panel layout as intended and the tab is always visible when closed.
- Running `axe-core` (or equivalent) on the panel yields **zero** accessibility violations.
- Opening and closing the panel triggers no console errors and animates smoothly.
- (Optional) After navigating to a different route, the panel retains its previous open/closed state.

