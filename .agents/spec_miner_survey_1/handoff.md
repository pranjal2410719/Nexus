# Handoff Report — Spec Miner Survey 1

> **From**: `teamwork_preview_spec_miner_survey_1`  
> **To**: Project Orchestrator (`2a331716-a17b-4bc2-bea6-09f749d9e4f4`)  
> **Date**: 2026-08-28T05:18:30Z  
> **Task**: UI Audit, Design System, Responsive Breakpoints, Accessibility, and Specification Mining Survey for Slide-Out Bug Report Panel

---

## 1. Observation

Direct code observations from inspecting the Nexus repository:

1. **Conflicting Media Queries in `app/globals.css`**:
   - Lines 554–583:
     ```css
     @media (max-width: 420px) {
       #slideOut {
         width: 100%;
         max-width: 100vw;
         right: -40px;
         top: 0;
         border-radius: 0;
         flex-direction: column;
       }
       .showSlideOut { right: 0 !important; }
       .slideOutTab { width: 100%; height: 40px; border-radius: 0; padding-top: 0; justify-content: center; align-items: center; }
       .slideOutTab-inner { flex-direction: row; gap: 8px; }
       .slideOut-modal { border-radius: 0; height: calc(100vh - 40px); max-height: none; }
     }
     ```
   - Lines 866–876 (later in cascade):
     ```css
     @media (max-width: 420px) {
       #slideOut {
         width: calc(100vw - 24px);
         right: calc(-100vw + 0px);
         top: 60px;
       }
       .bug-form-row {
         flex-direction: column;
         gap: 0;
       }
     }
     ```
   - **Verbatim Result**: At 320px viewport width, `right: calc(-100vw + 0px)` resolves to `-320px`, while `width` is `296px`. The entire panel and tab are shifted 320px offscreen to the right, making the tab completely invisible when closed.

2. **Missing Desktop Top/Bottom Anchoring in `app/globals.css`**:
   - Lines 508–520:
     ```css
     #slideOut {
       position: fixed;
       width: 340px;
       max-width: 90vw;
       right: -296px;
       z-index: 200;
       transition-property: right;
       transition-duration: 0.5s;
       transition-timing-function: cubic-bezier(0, 1, 0.5, 1);
       display: flex;
       flex-direction: row;
       pointer-events: none;
     }
     ```
   - **Verbatim Result**: No `top` or `bottom` property is declared for `#slideOut` on desktop viewports (> 768px).

3. **Accessibility Attributes in `components/dashboard/bug-report-panel.tsx`**:
   - Lines 160–166:
     ```tsx
     <div
       id="slideOut"
       ref={panelRef}
       className={open ? "showSlideOut" : ""}
       role="dialog"
       aria-modal="true"
       aria-labelledby="bugReportTitle"
     >
     ```
   - Lines 168–179:
     ```tsx
     <div
       className="slideOutTab"
       onClick={toggle}
       role="button"
       tabIndex={0}
       aria-label={open ? "Close bug report panel" : "Open bug report panel"}
       onKeyDown={(e) => {
         if (e.key === "Enter" || e.key === " ") {
           e.preventDefault();
           toggle();
         }
       }}
     >
     ```
   - **Verbatim Result**: `role="dialog"` and `aria-modal="true"` remain active in DOM when `open === false`. `slideOutTab` lacks `aria-expanded` and `aria-controls`. Interactive elements inside modal are reachable in tab order when closed. Focus is neither trapped on open nor restored on close.

4. **Component API and Root Layout Mounting**:
   - `components/dashboard/bug-report-panel.tsx:49`: `export function BugReportPanel()` takes 0 arguments.
   - `app/layout.tsx:35`: `<BugReportPanel />` mounted in root `<body>`.
   - `components/dashboard/bug-report-panel.tsx:122`: Hardcoded email `mailto:2k24.cs1l.2410719@gmail.com`.

5. **SayBriefly Design System Tokens in `app/globals.css`**:
   - Lines 3–24 define 9 color tokens (`--color-forest-ink`, `--color-highlighter-yellow`, `--color-cream-paper`, `--color-pencil-gray`, `--color-whisper-gray`, `--color-sticky-note-teal`, `--color-sticky-note-mint`, `--color-sticky-note-blush`, `--color-terracotta`), 3 font tokens (`--font-bricolage-grotesque`, `--font-inter`, `--font-roboto-mono`), and 3 shadow tokens (`--shadow-subtle`, `--shadow-subtle-2`, `--shadow-xl`).

---

## 2. Logic Chain

1. **From Observation 1**: The CSS cascade executes top-to-bottom. The second `@media (max-width: 420px)` block at lines 866–876 overwrites `#slideOut` properties from lines 554–583. On 320px screens, `calc(-100vw)` places the right offset at `-320px`. Since `#slideOut` width is 296px (`calc(100vw - 24px)`), the 44px tab cannot stick out (it ends at -24px from screen edge). Therefore, the tab is rendered entirely outside the viewport, violating Requirement R1.
2. **From Observation 2**: Missing `top` or `bottom` on desktop causes browsers to compute `top: auto`, which aligns the fixed element relative to its normal flow position. Depending on surrounding elements or scroll position, the panel can jump or obscure navbar links unexpectedly.
3. **From Observation 3**: Leaving `role="dialog"` and focusable `<input>`, `<select>`, `<textarea>`, `<button>` elements in the accessibility tree while visually offscreen causes automated tools like `axe-core` to report violations for hidden interactive controls in tab order. In addition, screen readers cannot determine whether the panel is expanded without `aria-expanded`.
4. **From Observation 4**: The lack of props prevents downstream consumers or test suites from testing open/closed states without manual click simulation or passing custom storage keys / recipient emails.
5. **From Observation 5**: The visual styles largely conform to the SayBriefly tokens, but hardcoded hexes (e.g. `#b04a1c` on hover, `#2f7d32` for ok status) should align cleanly with the token system.

---

## 3. Caveats

- Investigation was strictly read-only per instructions; no source files were modified.
- Axe-core was analyzed statically via AST/DOM code review and standard WCAG 2.1 rules.
- Local email client launch depends on OS default mail protocol handlers (`mailto:`) in browser environments.

---

## 4. Conclusion

The slide-out bug report panel is functional in basic desktop browsing scenarios, but suffers from:
1. A **critical mobile layout bug at 320px** where conflicting CSS media queries push the trigger tab completely offscreen when closed.
2. An **unanchored desktop vertical position** due to missing `top` in `#slideOut`.
3. **Axe-core accessibility failures** caused by lack of tab-order isolation when closed (`inert`/`aria-hidden`), missing `aria-expanded` on the trigger, lack of focus trap/restoration, and unannounced live validation errors.
4. **API rigidness** and hardcoded contact email in `bug-report-panel.tsx`.

All necessary remediations, breakpoint requirements, design token mappings, and interface contracts are fully documented in `/home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_1/analysis.md`.

---

## 5. Verification Method

To independently verify these findings:
1. **Inspect CSS Rules**: View `/home/dev/Desktop/khurafati/Nexus/app/globals.css` lines 508–583 and lines 851–876.
2. **Inspect Component**: View `/home/dev/Desktop/khurafati/Nexus/components/dashboard/bug-report-panel.tsx` lines 49–185.
3. **Inspect Layout & Pages**: View `/home/dev/Desktop/khurafati/Nexus/app/layout.tsx` lines 34–37.
4. **Verify Analysis Report**: Inspect `/home/dev/Desktop/khurafati/Nexus/.agents/spec_miner_survey_1/analysis.md`.
