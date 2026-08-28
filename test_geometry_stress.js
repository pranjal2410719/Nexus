/**
 * EMPIRICAL ADVERSARIAL TEST: FIX VERIFICATION & COMPARISON
 */

import fs from "node:fs";

function testGeometry(mode, W, H, isOpen = false) {
  let slideOutWidth, slideOutRight, slideOutTop, slideOutMaxHeight;
  const tabWidth = 44;

  if (mode === "current_worker_css") {
    if (W <= 420) {
      slideOutTop = 60;
      slideOutMaxHeight = H - 80;
      slideOutWidth = Math.min(W - 20, 320); // The culprit: max-width: 320px clamping width while right uses -100vw + 64px
      slideOutRight = isOpen ? 0 : -(W - 64);
    } else if (W <= 768) {
      slideOutTop = 70;
      slideOutMaxHeight = H - 90;
      slideOutWidth = Math.min(300, W - 20);
      slideOutRight = isOpen ? 0 : -256;
    } else {
      slideOutTop = 140;
      slideOutMaxHeight = H - 160;
      slideOutWidth = Math.min(340, 0.9 * W);
      slideOutRight = isOpen ? 0 : -296;
    }
  } else if (mode === "fix_option_1_uncapped_fluid") {
    // Option 1: Remove max-width: 320px from mobile query so width and right scale 1:1
    if (W <= 420) {
      slideOutTop = 60;
      slideOutMaxHeight = H - 80;
      slideOutWidth = W - 20; // 100vw - 20px
      slideOutRight = isOpen ? 0 : -(W - 64); // -100vw + 64px
    } else if (W <= 768) {
      slideOutTop = 70;
      slideOutMaxHeight = H - 90;
      slideOutWidth = Math.min(300, W - 20);
      slideOutRight = isOpen ? 0 : -256;
    } else {
      slideOutTop = 140;
      slideOutMaxHeight = H - 160;
      slideOutWidth = Math.min(340, 0.9 * W);
      slideOutRight = isOpen ? 0 : -296;
    }
  } else if (mode === "fix_option_2_unified_tablet_mobile") {
    // Option 2: Unified 300px drawer (width: 300px; max-width: calc(100vw - 20px); right: -256px;)
    if (W <= 420) {
      slideOutTop = 60;
      slideOutMaxHeight = H - 80;
      slideOutWidth = Math.min(300, W - 20);
      slideOutRight = isOpen ? 0 : -256;
    } else if (W <= 768) {
      slideOutTop = 70;
      slideOutMaxHeight = H - 90;
      slideOutWidth = Math.min(300, W - 20);
      slideOutRight = isOpen ? 0 : -256;
    } else {
      slideOutTop = 140;
      slideOutMaxHeight = H - 160;
      slideOutWidth = Math.min(340, 0.9 * W);
      slideOutRight = isOpen ? 0 : -296;
    }
  }

  const xRight = W - slideOutRight;
  const xLeft = xRight - slideOutWidth;
  const tabLeft = xLeft;
  const tabRight = xLeft + tabWidth;
  const modalLeft = tabRight;
  const modalRight = xRight;

  const visibleTabWidth = Math.max(0, Math.min(W, tabRight) - Math.max(0, tabLeft));
  const visibleModalWidth = Math.max(0, Math.min(W, modalRight) - Math.max(0, modalLeft));

  return { visibleTabWidth, visibleModalWidth, xLeft, xRight, slideOutWidth };
}

const widths = [320, 340, 360, 375, 390, 400, 412, 414, 420, 421, 768, 1024, 1920];

console.log("=== COMPARING LAYOUT CALCULATIONS ACROSS VIEWPORT WIDTHS ===\n");
console.log("Width | Current Worker CSS Tab Vis | Fix Opt 1 (Fluid) | Fix Opt 2 (Unified 300px)");
console.log("-".repeat(75));

for (const w of widths) {
  const cur = testGeometry("current_worker_css", w, 800, false);
  const f1 = testGeometry("fix_option_1_uncapped_fluid", w, 800, false);
  const f2 = testGeometry("fix_option_2_unified_tablet_mobile", w, 800, false);

  const curStatus = cur.visibleTabWidth === 44 ? "✔ 44px" : `✖ ${cur.visibleTabWidth}px (CLIPPED)`;
  const f1Status = f1.visibleTabWidth === 44 ? "✔ 44px" : `✖ ${f1.visibleTabWidth}px`;
  const f2Status = f2.visibleTabWidth === 44 ? "✔ 44px" : `✖ ${f2.visibleTabWidth}px`;

  console.log(`${String(w).padStart(5)}px | ${curStatus.padEnd(28)} | ${f1Status.padEnd(17)} | ${f2Status}`);
}
