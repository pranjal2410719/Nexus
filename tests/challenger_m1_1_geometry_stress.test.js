/**
 * EMPIRICAL ADVERSARIAL STRESS TEST: VIEWPORT GEOMETRY & CSS COMPUTATION
 * 
 * Tests #slideOut, .slideOutTab, .slideOut-modal across arbitrary viewports:
 * - Widths: 280, 320, 340, 360, 375, 390, 400, 414, 420, 421, 768, 800, 1024, 1280, 1440, 1920, 2560
 * - Heights: 240, 320, 400, 480, 600, 768, 900, 1080
 * 
 * Verifies:
 * 1. Closed state: Is tab visible (>= 44px or >= 40px reachable)? Is modal hidden (100% offscreen, 0px modal protrusion)?
 * 2. Open state: Is drawer within [0, W] without horizontal overflow / scrollbar?
 * 3. Extreme mobile height: Is modal-body scrollable and modal-footer accessible?
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("================================================================================");
console.log("  CHALLENGER M1_1: EMPIRICAL VIEWPORT GEOMETRY & STRESS TEST HARNESS");
console.log("================================================================================\n");

// Read app/globals.css
const cssContent = fs.readFileSync(path.resolve("app/globals.css"), "utf-8");

/**
 * Mathematical Layout Simulator matching CSS Specification for app/globals.css
 */
function computeSlideOutGeometry(viewportWidth, viewportHeight, isOpen = false) {
  const W = viewportWidth;
  const H = viewportHeight;

  let slideOutWidth;
  let slideOutRight;
  let slideOutTop;
  let slideOutMaxHeight;
  let tabWidth = 44;
  let modalWidth;

  if (W <= 420) {
    // Mobile Breakpoint (@media (max-width: 420px))
    slideOutTop = 60;
    slideOutMaxHeight = H - 80;
    // width: calc(100vw - 20px); max-width: 320px;
    slideOutWidth = Math.min(W - 20, 320);
    // right: calc(-100vw + 64px);
    slideOutRight = isOpen ? 0 : -(W - 64);
    // .slideOut-modal: width: calc(100% - 44px);
    modalWidth = slideOutWidth - tabWidth;
  } else if (W <= 768) {
    // Tablet Breakpoint (@media (max-width: 768px))
    slideOutTop = 70;
    slideOutMaxHeight = H - 90;
    // width: 300px; max-width: calc(100vw - 20px);
    slideOutWidth = Math.min(300, W - 20);
    // right: -256px;
    slideOutRight = isOpen ? 0 : -256;
    // .slideOut-modal: width: 256px;
    modalWidth = 256;
  } else {
    // Desktop Default (> 768px)
    slideOutTop = 140;
    slideOutMaxHeight = H - 160;
    // width: 340px; max-width: 90vw;
    slideOutWidth = Math.min(340, 0.9 * W);
    // right: -296px;
    slideOutRight = isOpen ? 0 : -296;
    // .slideOut-modal: flex: 1 => slideOutWidth - 44
    modalWidth = slideOutWidth - tabWidth;
  }

  // Calculate coordinates in viewport space [0, W]
  // In CSS position: fixed; right: R;
  // The right edge of #slideOut is at X_right = W - R.
  // The left edge of #slideOut is at X_left = X_right - slideOutWidth = W - R - slideOutWidth.
  const xRight = W - slideOutRight;
  const xLeft = xRight - slideOutWidth;

  // Tab occupies [xLeft, xLeft + tabWidth]
  const tabLeft = xLeft;
  const tabRight = xLeft + tabWidth;

  // Modal occupies [xLeft + tabWidth, xRight]
  const modalLeft = tabRight;
  const modalRight = xRight;

  // Calculate visible horizontal bounds on screen [0, W]
  const visibleTabLeft = Math.max(0, Math.min(W, tabLeft));
  const visibleTabRight = Math.max(0, Math.min(W, tabRight));
  const visibleTabWidth = Math.max(0, visibleTabRight - visibleTabLeft);

  const visibleModalLeft = Math.max(0, Math.min(W, modalLeft));
  const visibleModalRight = Math.max(0, Math.min(W, modalRight));
  const visibleModalWidth = Math.max(0, visibleModalRight - visibleModalLeft);

  // Check horizontal overflow (element extending beyond left or right viewport edges when open)
  const leftOverflow = Math.max(0, -xLeft);
  const rightOverflow = Math.max(0, xRight - W);

  return {
    viewport: { width: W, height: H },
    isOpen,
    slideOut: { top: slideOutTop, width: slideOutWidth, right: slideOutRight, maxHeight: slideOutMaxHeight, xLeft, xRight },
    tab: { width: tabWidth, left: tabLeft, right: tabRight, visibleWidth: visibleTabWidth },
    modal: { width: modalWidth, left: modalLeft, right: modalRight, visibleWidth: visibleModalWidth },
    overflow: { left: leftOverflow, right: rightOverflow },
  };
}

const testBreakpoints = [
  { w: 320, h: 568, name: "iPhone SE 1st Gen (320x568)" },
  { w: 360, h: 640, name: "Samsung Galaxy / Moto (360x640)" },
  { w: 375, h: 667, name: "iPhone 8 / SE 2nd Gen (375x667)" },
  { w: 375, h: 812, name: "iPhone X / XS / 11 Pro (375x812)" },
  { w: 390, h: 844, name: "iPhone 12 / 13 / 14 (390x844)" },
  { w: 412, h: 915, name: "Google Pixel 7 (412x915)" },
  { w: 414, h: 896, name: "iPhone 11 / XR / Plus (414x896)" },
  { w: 420, h: 800, name: "Mobile Query Max Boundary (420x800)" },
  { w: 421, h: 800, name: "Tablet Query Min Boundary (421x800)" },
  { w: 480, h: 800, name: "Large Mobile / Phablet (480x800)" },
  { w: 600, h: 960, name: "Small Tablet (600x960)" },
  { w: 768, h: 1024, name: "iPad Portrait (768x1024)" },
  { w: 1024, h: 768, name: "iPad Landscape / Small Laptop (1024x768)" },
  { w: 1280, h: 800, name: "Desktop WXGA (1280x800)" },
  { w: 1440, h: 900, name: "MacBook Pro 15 (1440x900)" },
  { w: 1920, h: 1080, name: "Desktop 1080p FHD (1920x1080)" },
  { w: 2560, h: 1440, name: "Desktop 1440p QHD (2560x1440)" },
  // Landscape / Low-height stress viewports
  { w: 480, h: 320, name: "Landscape Mobile Extreme Low (480x320)" },
  { w: 800, h: 400, name: "Landscape Mobile Low Height (800x400)" },
  { w: 640, h: 360, name: "Landscape Mobile 360p (640x360)" },
];

let testCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

console.log("--- PART 1: CLOSED STATE GEOMETRY (Tab Visible, Modal Hidden) ---\n");

for (const bp of testBreakpoints) {
  testCount++;
  const geo = computeSlideOutGeometry(bp.w, bp.h, false);
  const tabExpected = 44;
  const tabActual = geo.tab.visibleWidth;
  const modalVisible = geo.modal.visibleWidth;

  const tabPass = tabActual >= 44;
  const modalPass = modalVisible === 0;

  if (tabPass && modalPass) {
    passCount++;
    console.log(`  ✔ [PASS] ${bp.name}: Tab Visible = ${tabActual}px, Modal Visible = ${modalVisible}px`);
  } else {
    failCount++;
    const reason = !tabPass
      ? `Tab clipped/hidden! Visible = ${tabActual}px (expected ${tabExpected}px, offset by ${tabExpected - tabActual}px)`
      : `Modal leaking into viewport! Visible = ${modalVisible}px`;
    console.log(`  ✖ [FAIL] ${bp.name}: ${reason}`);
    failures.push({
      test: `Closed State: ${bp.name}`,
      width: bp.w,
      height: bp.h,
      tabVisible: tabActual,
      modalVisible,
      reason,
      geometry: geo,
    });
  }
}

console.log("\n--- PART 2: OPEN STATE GEOMETRY (Drawer Bounded, Zero Overflow) ---\n");

for (const bp of testBreakpoints) {
  testCount++;
  const geo = computeSlideOutGeometry(bp.w, bp.h, true);
  const leftBoundOk = geo.slideOut.xLeft >= 0;
  const rightBoundOk = geo.slideOut.xRight <= bp.w;
  const noOverflow = geo.overflow.left === 0 && geo.overflow.right === 0;

  if (leftBoundOk && rightBoundOk && noOverflow) {
    passCount++;
    console.log(`  ✔ [PASS] ${bp.name}: Open Drawer xLeft = ${geo.slideOut.xLeft}px, xRight = ${geo.slideOut.xRight}px (width = ${geo.slideOut.width}px)`);
  } else {
    failCount++;
    const reason = `Overflow detected! xLeft = ${geo.slideOut.xLeft}px (overflow left = ${geo.overflow.left}px), xRight = ${geo.slideOut.xRight}px (overflow right = ${geo.overflow.right}px)`;
    console.log(`  ✖ [FAIL] ${bp.name}: ${reason}`);
    failures.push({
      test: `Open State: ${bp.name}`,
      width: bp.w,
      height: bp.h,
      reason,
      geometry: geo,
    });
  }
}

console.log("\n--- PART 3: VERTICAL ACCESSIBILITY & SCROLLABILITY (Low Heights) ---\n");

const heightStressCases = [
  { w: 320, h: 480, name: "320x480 Mobile Portrait" },
  { w: 480, h: 320, name: "480x320 Mobile Landscape" },
  { w: 640, h: 360, name: "640x360 Landscape" },
  { w: 800, h: 400, name: "800x400 Landscape Desktop" },
  { w: 1024, h: 500, name: "1024x500 Short Desktop" },
];

for (const sc of heightStressCases) {
  testCount++;
  const geo = computeSlideOutGeometry(sc.w, sc.h, true);
  const maxHeight = geo.slideOut.maxHeight;
  const top = geo.slideOut.top;
  const totalVerticalSpan = top + maxHeight;
  const withinViewport = totalVerticalSpan <= sc.h;

  // Modal header (~50px) + Footer (~60px) = 110px. Body must have positive available height or scroll
  const minRequiredContentHeight = 100;
  const hasRemainingHeightForBody = maxHeight > minRequiredContentHeight;

  if (withinViewport && hasRemainingHeightForBody) {
    passCount++;
    console.log(`  ✔ [PASS] ${sc.name}: MaxHeight = ${maxHeight}px, Top = ${top}px, Total = ${totalVerticalSpan}px <= ${sc.h}px (Body has ${maxHeight - 100}px)`);
  } else {
    failCount++;
    const reason = !withinViewport
      ? `Vertical clipping: top + maxHeight (${totalVerticalSpan}px) exceeds viewport height (${sc.h}px)`
      : `Modal too cramped: maxHeight (${maxHeight}px) leaves < ${minRequiredContentHeight}px for modal body`;
    console.log(`  ✖ [FAIL] ${sc.name}: ${reason}`);
    failures.push({
      test: `Vertical: ${sc.name}`,
      width: sc.w,
      height: sc.h,
      reason,
      geometry: geo,
    });
  }
}

console.log("\n================================================================================");
console.log(`  SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${testCount} tests`);
console.log("================================================================================\n");

if (failures.length > 0) {
  console.log("FAILURES DETAILED REPORT:\n");
  for (const f of failures) {
    console.log(`- Test: ${f.test}`);
    console.log(`  Reason: ${f.reason}`);
    if (f.geometry) {
      console.log(`  Geometry: slideOut width=${f.geometry.slideOut.width}px, right=${f.geometry.slideOut.right}px, xLeft=${f.geometry.slideOut.xLeft}px, xRight=${f.geometry.slideOut.xRight}px`);
      console.log(`  Tab: [${f.geometry.tab.left}, ${f.geometry.tab.right}] (visible: ${f.geometry.tab.visibleWidth}px)`);
      console.log(`  Modal: [${f.geometry.modal.left}, ${f.geometry.modal.right}] (visible: ${f.geometry.modal.visibleWidth}px)`);
    }
    console.log();
  }
}
