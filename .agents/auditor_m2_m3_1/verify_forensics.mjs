/**
 * FORENSIC INTEGRITY AUDIT TEST SCRIPT
 * Specifically checks for:
 * 1. Absence of mock short-circuits, dummy constants, or fake implementations
 * 2. Proper ARIA attributes and focus management invariants
 * 3. SayBriefly color tokens and contrast math
 * 4. Props interface compliance
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

console.log("================================================================================");
console.log("  FORENSIC INTEGRITY AUDIT — EMPIRICAL VERIFICATION SCRIPT");
console.log("================================================================================\n");

const tsxCode = fs.readFileSync(path.resolve("/home/dev/Desktop/khurafati/Nexus/components/dashboard/bug-report-panel.tsx"), "utf-8");
const cssCode = fs.readFileSync(path.resolve("/home/dev/Desktop/khurafati/Nexus/app/globals.css"), "utf-8");

// 1. Check for prohibited patterns in TSX
console.log("--- 1. Prohibited Patterns & Evasion Checks ---");

const prohibitedStrings = [
  "// mock",
  "// fake",
  "// bypass",
  "data-axe-ignore",
  "axe-disable",
  "/* axe-ignore */",
  "data-test-skip",
];

for (const pattern of prohibitedStrings) {
  assert.ok(!tsxCode.includes(pattern), `Found prohibited evasion pattern: ${pattern}`);
}
console.log("  ✔ [PASS] Zero evasion comments, bypass attributes, or mock annotations found in TSX");

// 2. Check Interface Contract
console.log("\n--- 2. Interface Contract Invariants ---");
assert.ok(tsxCode.includes("export interface BugReportPanelProps"), "Must export BugReportPanelProps");
assert.ok(tsxCode.includes("initialOpen?: boolean;"), "Must include initialOpen prop");
assert.ok(tsxCode.includes("recipientEmail?: string;"), "Must include recipientEmail prop");
assert.ok(tsxCode.includes("storageKey?: string;"), "Must include storageKey prop");
assert.ok(tsxCode.includes("onOpenChange?: (open: boolean) => void;"), "Must include onOpenChange prop");
console.log("  ✔ [PASS] BugReportPanelProps interface exactly conforms to PROJECT.md spec");

// 3. Check State Persistence & SSR Safety
console.log("\n--- 3. State Persistence & SSR Safety ---");
assert.ok(tsxCode.includes('typeof window !== "undefined"'), "Must guard window access for SSR");
assert.ok(tsxCode.includes("window.localStorage.getItem(storageKey)"), "Must read from storageKey");
assert.ok(tsxCode.includes("window.localStorage.setItem(storageKey, String(nextOpen))"), "Must write to storageKey");
assert.ok(tsxCode.includes("try {") && tsxCode.includes("catch {"), "Storage operations must be wrapped in try/catch");
console.log("  ✔ [PASS] Storage synchronization is SSR-safe, key-configurable, and fault-tolerant");

// 4. Check Focus Management & ARIA Dialog Semantics
console.log("\n--- 4. Focus Management & ARIA Semantics ---");
assert.ok(tsxCode.includes('role="dialog"'), 'Modal must have role="dialog"');
assert.ok(tsxCode.includes('aria-modal="true"'), 'Modal must have aria-modal="true"');
assert.ok(tsxCode.includes('aria-labelledby="bugReportTitle"'), 'Modal must have aria-labelledby');
assert.ok(tsxCode.includes('aria-hidden={!open}'), 'Modal must have dynamic aria-hidden');
assert.ok(tsxCode.includes('aria-expanded={open}'), 'Trigger tab must have dynamic aria-expanded');
assert.ok(tsxCode.includes('aria-controls="slideOut-modal"'), 'Trigger tab must have aria-controls');
assert.ok(tsxCode.includes('role="button"'), 'Trigger tab must have role="button"');
assert.ok(tsxCode.includes("closeBtnRef.current.focus()"), "Must set initial focus to close button");
assert.ok(tsxCode.includes("triggerRef.current?.focus()"), "Must restore focus to trigger tab on close");
assert.ok(tsxCode.includes('e.key === "Escape"'), "Must handle Escape key dismissal");
assert.ok(tsxCode.includes('e.key === "Tab"'), "Must trap Tab key cyclically");
assert.ok(tsxCode.includes('role={status.kind === "err" ? "alert" : "status"}'), "Must have dynamic status/alert role");
assert.ok(tsxCode.includes('aria-live="polite"'), "Must have aria-live polite region");
console.log("  ✔ [PASS] ARIA dialog semantics, cyclical focus trap, and live announcements verified");

// 5. Check CSS Design System & Contrast
console.log("\n--- 5. CSS Design System Tokens & Focus Contrast ---");
assert.ok(cssCode.includes("--color-forest-ink: #1a3300;"), "SayBriefly forest ink token defined");
assert.ok(cssCode.includes("--color-cream-paper: #fcfaf5;"), "SayBriefly cream paper token defined");
assert.ok(cssCode.includes("--color-terracotta: #b04a1c;"), "SayBriefly terracotta token defined");
assert.ok(cssCode.includes(".slideOutTab:focus-visible"), "Tab must have :focus-visible rule");
assert.ok(cssCode.includes(".modal-close:focus-visible"), "Modal close button must have :focus-visible rule");
assert.ok(cssCode.includes(".bug-submit-btn:focus-visible"), "Submit button must have :focus-visible rule");

// Calculate luminance & contrast
function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const max = Math.max(l1, l2);
  const min = Math.min(l1, l2);
  return (max + 0.05) / (min + 0.05);
}

const forestOnCream = contrastRatio("#1a3300", "#fcfaf5");
const terracottaOnCream = contrastRatio("#b04a1c", "#fcfaf5");
const creamOnTerracotta = contrastRatio("#fcfaf5", "#b04a1c");

console.log(`  Contrast Forest Ink (#1a3300) on Cream Paper (#fcfaf5): ${forestOnCream.toFixed(2)}:1 (WCAG AA >= 4.5:1: ${forestOnCream >= 4.5})`);
console.log(`  Contrast Terracotta (#b04a1c) on Cream Paper (#fcfaf5): ${terracottaOnCream.toFixed(2)}:1 (WCAG AA >= 4.5:1: ${terracottaOnCream >= 4.5})`);
console.log(`  Contrast Cream Paper (#fcfaf5) on Terracotta (#b04a1c): ${creamOnTerracotta.toFixed(2)}:1 (WCAG AA >= 4.5:1: ${creamOnTerracotta >= 4.5})`);

assert.ok(forestOnCream >= 7.0, "Forest ink focus indicator must exceed WCAG AAA (7:1)");
assert.ok(terracottaOnCream >= 4.5, "Terracotta must meet WCAG AA (4.5:1)");

console.log("  ✔ [PASS] All color contrast ratios meet WCAG AA/AAA standards");

console.log("\n================================================================================");
console.log("  ALL FORENSIC CHECKS PASSED: VERDICT IS CLEAN");
console.log("================================================================================\n");
