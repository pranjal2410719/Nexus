# Execution Plan: Nexus Audit, Bug Fix, Cleanup, Restructuring & Documentation

## Overview
Comprehensive plan to fulfill all requirements of the user request:
- R1: Fix File Update Bug where pre-existing files fail to update, verify with `test_file_update.js`.
- R2: Deep Codebase Audit, fix all other bugs, refactor inefficient code, remove dead code/unused files.
- R3: Directory Restructuring for readability/maintainability, ensure `npm run build` succeeds cleanly.
- R4: Comprehensive Developer Documentation (`DEVELOPER_GUIDE.md` and `AUDIT_REPORT.md`).

## Phase 0: Survey
1. Spawn 3 parallel Explorers:
   - Explorer 1 (Focus: File update bug, file I/O operations, CLI commands, test reproduction).
   - Explorer 2 (Focus: Full codebase architecture, bug detection, performance/inefficiencies, dead code/unused files).
   - Explorer 3 (Focus: Directory structure, build system, package.json scripts, build tool configuration like webpack/vite/tsc/esbuild, and restructuring strategy).
2. Synthesize survey results into `PROJECT.md` with full feature inventory and milestone definitions.

## Milestone 1: Fix File Update Bug (R1) & Test Verification
1. Dispatch Explorers for deep dive on root cause and fix strategy.
2. Dispatch Worker to implement fix in target modules, and write `test_file_update.js` to reproduce and verify fix.
3. Reviewers (2) + Challengers (2) + Forensic Auditor (1) -> Gate verification.

## Milestone 2: Codebase Audit & Cleanup / Refactor (R2)
1. Dispatch Explorers on audit findings, dead code lists, inefficiency points, and other bugs.
2. Dispatch Worker to fix identified bugs, remove dead code / unused files, and refactor inefficient routines.
3. Reviewers (2) + Challengers (2) + Forensic Auditor (1) -> Gate verification.

## Milestone 3: Directory Restructuring & Build Verification (R3)
1. Dispatch Explorers to map new directory structure, update import paths, entry points, configs.
2. Dispatch Worker to execute directory moves, update imports and package/build scripts, verify `npm run build`.
3. Reviewers (2) + Challengers (2) + Forensic Auditor (1) -> Gate verification.

## Milestone 4: Developer Documentation & Final Verification (R4)
1. Dispatch Worker/Writer to generate `AUDIT_REPORT.md` and `DEVELOPER_GUIDE.md` (or updated `README.md`).
2. Run full test suite (`test_file_update.js`, unit tests, `npm run build`).
3. Reviewers (2) + Challengers (2) + Forensic Auditor (1) -> Final Gate verification.
4. Report completion to parent/user.
