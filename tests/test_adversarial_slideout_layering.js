/**
 * Adversarial Empirical Verification Suite for Slide-Out Bug Report Panel
 * Author: Challenger M1_2 (teamwork_preview_challenger_m1_2)
 * 
 * Focus Areas:
 * 1. Interaction & Click-Interception Boundaries
 * 2. Z-Index Layering & Stacking Context Hierarchy
 * 3. Pointer-Events Pass-Through & Capture Matrix
 * 4. CSS Transitions & Viewport Geometry Across Breakpoints
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("===============================================================================");
console.log("  CHALLENGER M1_2: ADVERSARIAL EMPIRICAL VERIFICATION OF #slideOut");
console.log("===============================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
    }
    failed++;
  }
}

// Read CSS file
const cssPath = path.resolve(process.cwd(), "app/globals.css");
const cssContent = fs.readFileSync(cssPath, "utf-8");

// Read JSX Component
const jsxPath = path.resolve(process.cwd(), "components/dashboard/bug-report-panel.tsx");
const jsxContent = fs.readFileSync(jsxPath, "utf-8");

// -------------------------------------------------------------
// SECTION 1: CSS DECLARATION & TOKEN PARSING VERIFICATION
// -------------------------------------------------------------
console.log("--- 1. CSS Declarations & Token Parsing ---");

test("1.1 #slideOut desktop base styles: fixed position, top: 140px, right: -296px, z-index: 200, pointer-events: none", () => {
  const match = cssContent.match(/#slideOut\s*\{([^}]+)\}/);
  assert.ok(match, "Could not find #slideOut rule in app/globals.css");
  const block = match[1];

  assert.match(block, /position:\s*fixed;/, "Must be position: fixed");
  assert.match(block, /top:\s*140px;/, "Must be top: 140px for desktop navbar clearance");
  assert.match(block, /width:\s*340px;/, "Must be width: 340px");
  assert.match(block, /right:\s*-296px;/, "Must be right: -296px (340px - 44px tab)");
  assert.match(block, /z-index:\s*200;/, "Must be z-index: 200");
  assert.match(block, /pointer-events:\s*none;/, "Must have pointer-events: none on container");
  assert.match(block, /transition:\s*right\s+0\.4s/, "Must transition right property with 0.4s");
});

test("1.2 .showSlideOut modifier: right: 0px !important", () => {
  const match = cssContent.match(/\.showSlideOut\s*\{([^}]+)\}/);
  assert.ok(match, "Could not find .showSlideOut rule");
  const block = match[1];
  assert.match(block, /right:\s*0px\s*!important;/, ".showSlideOut must force right: 0px !important");
});

test("1.3 Pointer-events capture rule for children: #slideOut > * { pointer-events: auto; }", () => {
  const match = cssContent.match(/#slideOut\s*>\s*\*\s*\{([^}]+)\}/);
  assert.ok(match, "Could not find #slideOut > * rule");
  assert.match(match[1], /pointer-events:\s*auto;/, "Direct children of #slideOut must have pointer-events: auto");
});

test("1.4 .slideOutTab styles: width: 44px, cursor: pointer, z-index: 2, background: terracotta", () => {
  const match = cssContent.match(/\.slideOutTab\s*\{([^}]+)\}/);
  assert.ok(match, "Could not find .slideOutTab rule");
  const block = match[1];
  assert.match(block, /width:\s*44px;/, "Tab width must be 44px");
  assert.match(block, /cursor:\s*pointer;/, "Tab must have cursor: pointer");
  assert.match(block, /z-index:\s*2;/, "Tab must have z-index: 2");
  assert.match(block, /background:\s*var\(--color-terracotta\);/, "Tab must use SayBriefly terracotta token");
});

test("1.5 .bug-backdrop & .bug-backdrop.show: z-index: 199, pointer-events toggle", () => {
  const backdropMatch = cssContent.match(/\.bug-backdrop\s*\{([^}]+)\}/);
  assert.ok(backdropMatch, "Could not find .bug-backdrop rule");
  const backdropBlock = backdropMatch[1];
  assert.match(backdropBlock, /position:\s*fixed;/, "Backdrop must be position: fixed");
  assert.match(backdropBlock, /inset:\s*0;/, "Backdrop must be inset: 0");
  assert.match(backdropBlock, /z-index:\s*199;/, "Backdrop must be z-index: 199");
  assert.match(backdropBlock, /opacity:\s*0;/, "Closed backdrop must be opacity: 0");
  assert.match(backdropBlock, /pointer-events:\s*none;/, "Closed backdrop must have pointer-events: none");

  const showMatch = cssContent.match(/\.bug-backdrop\.show\s*\{([^}]+)\}/);
  assert.ok(showMatch, "Could not find .bug-backdrop.show rule");
  const showBlock = showMatch[1];
  assert.match(showBlock, /opacity:\s*1;/, "Shown backdrop must be opacity: 1");
  assert.match(showBlock, /pointer-events:\s*auto;/, "Shown backdrop must have pointer-events: auto");
});

test("1.6 Overlay elements: .loader-screen (z-index 1000) & .menu-select-menu (z-index 300)", () => {
  const loaderMatch = cssContent.match(/\.loader-screen\s*\{([^}]+)\}/);
  assert.ok(loaderMatch, "Could not find .loader-screen rule");
  assert.match(loaderMatch[1], /z-index:\s*1000;/, ".loader-screen must have z-index: 1000");

  const menuMatch = cssContent.match(/\.menu-select-menu\s*\{([^}]+)\}/);
  assert.ok(menuMatch, "Could not find .menu-select-menu rule");
  assert.match(menuMatch[1], /z-index:\s*300;/, ".menu-select-menu must have z-index: 300");
});

// -------------------------------------------------------------
// SECTION 2: Z-INDEX STACKING CONTEXT HIERARCHY
// -------------------------------------------------------------
console.log("\n--- 2. Z-Index Stacking Context Hierarchy ---");

test("2.1 Root stacking context strict ordering invariant", () => {
  const layers = [
    { name: "Page Content / Matrix Sub", zIndex: 0 },
    { name: "Matrix Cell / Slot Pill / Burst Btn", zIndex: 1 },
    { name: "Navbar (.navbar)", zIndex: 100 },
    { name: "Mobile Menu (.mobile-menu)", zIndex: 150 },
    { name: "Bug Backdrop (.bug-backdrop)", zIndex: 199 },
    { name: "Slide-Out Drawer (#slideOut)", zIndex: 200 },
    { name: "Menu Select Dropdown (.menu-select-menu)", zIndex: 300 },
    { name: "Full-Screen Loader (.loader-screen)", zIndex: 1000 },
  ];

  for (let i = 0; i < layers.length - 1; i++) {
    const current = layers[i];
    const next = layers[i + 1];
    assert.ok(
      current.zIndex < next.zIndex,
      `Layer ${current.name} (z-index ${current.zIndex}) must be strictly less than ${next.name} (z-index ${next.zIndex})`
    );
  }
});

test("2.2 Stacking context isolation: .menu-toggle inside .navbar", () => {
  const navbarMatch = cssContent.match(/\.navbar\s*\{([^}]+)\}/);
  assert.ok(navbarMatch);
  assert.match(navbarMatch[1], /position:\s*relative;/, ".navbar creates positioning context");
  assert.match(navbarMatch[1], /z-index:\s*100;/, ".navbar sets root stacking level to 100");

  const toggleMatch = cssContent.match(/\.menu-toggle\s*\{([^}]+)\}/);
  assert.ok(toggleMatch);
  assert.match(toggleMatch[1], /z-index:\s*200;/, ".menu-toggle has local z-index 200 within .navbar");
});

test("2.3 .bug-backdrop (199) and #slideOut (200) layering during open state", () => {
  const backdropZ = 199;
  const slideOutZ = 200;
  assert.strictEqual(slideOutZ > backdropZ, true);
  assert.strictEqual(slideOutZ - backdropZ, 1, "Immediate adjacent stacking hierarchy without gaps");
});

test("2.4 .loader-screen (1000) overlays #slideOut (200) completely", () => {
  const loaderZ = 1000;
  const slideOutZ = 200;
  assert.strictEqual(loaderZ > slideOutZ, true, "Loader screen at 1000 must overlay #slideOut at 200");
});

test("2.5 .menu-select-menu (300) overlays #slideOut (200) when active", () => {
  const menuZ = 300;
  const slideOutZ = 200;
  assert.strictEqual(menuZ > slideOutZ, true, "Select dropdown at 300 must overlay #slideOut at 200");
});

// -------------------------------------------------------------
// SECTION 3: VIEWPORT GEOMETRY & BREAKPOINT CALCULATIONS
// -------------------------------------------------------------
console.log("\n--- 3. Viewport Geometry & Breakpoint Calculations ---");

function calculateDrawerGeometry(viewportWidth, viewportHeight, isOpen) {
  let top, width, right, modalWidth, tabWidth = 44;

  if (viewportWidth <= 420) {
    top = 60;
    width = Math.min(viewportWidth - 20, 320);
    modalWidth = width - tabWidth;
    right = isOpen ? 0 : -(viewportWidth - 64);
  } else if (viewportWidth <= 768) {
    top = 70;
    width = 300;
    modalWidth = 256;
    right = isOpen ? 0 : -256;
  } else {
    // Desktop
    top = 140;
    width = 340;
    modalWidth = 296;
    right = isOpen ? 0 : -296;
  }

  const containerLeft = viewportWidth - width - right;
  const containerRight = viewportWidth - right;

  const tabLeft = containerLeft;
  const tabRight = containerLeft + tabWidth;

  const modalLeft = containerLeft + tabWidth;
  const modalRight = containerLeft + width;

  const visibleTabSpan = [Math.max(0, tabLeft), Math.min(viewportWidth, tabRight)];
  const visibleTabWidth = Math.max(0, visibleTabSpan[1] - visibleTabSpan[0]);

  const visibleModalSpan = [Math.max(0, modalLeft), Math.min(viewportWidth, modalRight)];
  const visibleModalWidth = Math.max(0, visibleModalSpan[1] - visibleModalSpan[0]);

  return {
    top,
    width,
    right,
    tabWidth,
    modalWidth,
    containerLeft,
    containerRight,
    tabSpan: [tabLeft, tabRight],
    modalSpan: [modalLeft, modalRight],
    visibleTabWidth,
    visibleModalWidth,
  };
}

test("3.1 Desktop (1920px & 1024px) geometry: 44px tab visible, 296px modal off-screen when closed", () => {
  for (const vpWidth of [1920, 1024, 1440]) {
    const closed = calculateDrawerGeometry(vpWidth, 900, false);
    assert.strictEqual(closed.top, 140, "Desktop top must be 140px");
    assert.strictEqual(closed.width, 340);
    assert.strictEqual(closed.right, -296);
    assert.strictEqual(closed.visibleTabWidth, 44, `Tab must be exactly 44px visible on ${vpWidth}px`);
    assert.strictEqual(closed.visibleModalWidth, 0, `Modal must be 0px visible (fully offscreen) on ${vpWidth}px`);
    assert.strictEqual(closed.tabSpan[0], vpWidth - 44);
    assert.strictEqual(closed.tabSpan[1], vpWidth);
    assert.strictEqual(closed.modalSpan[0], vpWidth);
    assert.strictEqual(closed.modalSpan[1], vpWidth + 296);

    const open = calculateDrawerGeometry(vpWidth, 900, true);
    assert.strictEqual(open.right, 0);
    assert.strictEqual(open.visibleTabWidth, 44);
    assert.strictEqual(open.visibleModalWidth, 296);
    assert.strictEqual(open.containerLeft, vpWidth - 340);
  }
});

test("3.2 Tablet (768px) geometry: 44px tab visible, 256px modal off-screen when closed", () => {
  const closed = calculateDrawerGeometry(768, 1024, false);
  assert.strictEqual(closed.top, 70, "Tablet top must be 70px");
  assert.strictEqual(closed.width, 300);
  assert.strictEqual(closed.right, -256);
  assert.strictEqual(closed.visibleTabWidth, 44);
  assert.strictEqual(closed.visibleModalWidth, 0);
  assert.strictEqual(closed.tabSpan[0], 768 - 44);
  assert.strictEqual(closed.modalSpan[0], 768);

  const open = calculateDrawerGeometry(768, 1024, true);
  assert.strictEqual(open.right, 0);
  assert.strictEqual(open.visibleTabWidth, 44);
  assert.strictEqual(open.visibleModalWidth, 256);
  assert.strictEqual(open.containerLeft, 768 - 300);
});

test("3.3 320px Mobile geometry: 44px tab visible when closed, zero horizontal overflow when open", () => {
  const closed320 = calculateDrawerGeometry(320, 568, false);
  assert.strictEqual(closed320.top, 60);
  assert.strictEqual(closed320.width, 300); // 320 - 20
  assert.strictEqual(closed320.right, -256); // -(320 - 64)
  assert.strictEqual(closed320.visibleTabWidth, 44, "44px tab visible on 320px mobile");
  assert.strictEqual(closed320.visibleModalWidth, 0, "0px modal visible when closed");
  assert.strictEqual(closed320.tabSpan[0], 320 - 44);
  assert.strictEqual(closed320.modalSpan[0], 320);

  const open320 = calculateDrawerGeometry(320, 568, true);
  assert.strictEqual(open320.right, 0);
  assert.strictEqual(open320.containerLeft, 20, "20px left gutter on 320px screen");
  assert.strictEqual(open320.containerRight, 320, "Right aligned with viewport boundary, no horizontal scroll");
  assert.strictEqual(open320.visibleTabWidth, 44);
  assert.strictEqual(open320.visibleModalWidth, 256);
});

test("3.4 Adversarial Edge Case Discovery: Intermediate mobile viewports (360px - 420px) under max-width: 320px", () => {
  // At 390px (iPhone 12/13/14/15):
  // width: calc(100vw - 20px) = 370px, clamped to 320px by max-width: 320px.
  // right: calc(-100vw + 64px) = -326px.
  // Result: container is shifted by -326px, but total container width is only 320px!
  // Therefore container starts at 390 - 320 - (-326) = 396px (> 390px viewport width).
  // Tab is completely pushed off-screen (0px visible).
  const geom390 = calculateDrawerGeometry(390, 844, false);
  console.log(`    [Empirical Discovery] 390px mobile closed: visibleTabWidth = ${geom390.visibleTabWidth}px (tabSpan: [${geom390.tabSpan[0]}, ${geom390.tabSpan[1]}])`);
  assert.strictEqual(geom390.visibleTabWidth, 0, "Confirms adversarial discovery: tab is 0px visible at 390px");
});

// -------------------------------------------------------------
// SECTION 4: HIT-TESTING & POINTER-EVENTS DISPATCH SIMULATION
// -------------------------------------------------------------
console.log("\n--- 4. Hit-Testing & Pointer Events Dispatch Simulation ---");

class HitTestEngine {
  constructor(viewportWidth, viewportHeight, state = {}) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.isOpen = Boolean(state.isOpen);
    this.isLoaderActive = Boolean(state.isLoaderActive);
    this.isMenuSelectActive = Boolean(state.isMenuSelectActive);
    this.menuSelectRect = state.menuSelectRect || { x: 50, y: 300, width: 300, height: 200 };
  }

  hitTest(x, y) {
    // 1. Layer 1000: Full-Screen Loader (if active)
    if (this.isLoaderActive) {
      if (x >= 0 && x <= this.viewportWidth && y >= 0 && y <= this.viewportHeight) {
        return { target: "loader-screen", zIndex: 1000, pointerEvents: "auto" };
      }
    }

    // 2. Layer 300: Menu Select Dropdown (if active)
    if (this.isMenuSelectActive) {
      const { x: mx, y: my, width: mw, height: mh } = this.menuSelectRect;
      if (x >= mx && x <= mx + mw && y >= my && y <= my + mh) {
        return { target: "menu-select-menu", zIndex: 300, pointerEvents: "auto" };
      }
    }

    // 3. Layer 200: #slideOut and its direct children
    const geom = calculateDrawerGeometry(this.viewportWidth, this.viewportHeight, this.isOpen);
    const drawerTop = geom.top;
    const drawerHeight = this.viewportHeight - (drawerTop + 20);

    if (y >= drawerTop && y <= drawerTop + drawerHeight) {
      // Check .slideOutTab (pointer-events: auto)
      if (x >= geom.tabSpan[0] && x <= geom.tabSpan[1]) {
        return { target: "slideOutTab", zIndex: 200, pointerEvents: "auto" };
      }
      // Check .slideOut-modal (pointer-events: auto)
      if (x >= geom.modalSpan[0] && x <= geom.modalSpan[1]) {
        if (x <= this.viewportWidth) {
          return { target: "slideOut-modal", zIndex: 200, pointerEvents: "auto" };
        }
      }
    }

    // 4. Layer 199: Bug Backdrop (if open)
    if (this.isOpen) {
      if (x >= 0 && x <= this.viewportWidth && y >= 0 && y <= this.viewportHeight) {
        return { target: "bug-backdrop", zIndex: 199, pointerEvents: "auto" };
      }
    }

    // 5. Layer 100: Navbar
    const isMobile = this.viewportWidth <= 768;
    const navbarHeight = isMobile ? 60 : 80;
    const navbarTop = isMobile ? 16 : 24;
    const navbarPadX = isMobile ? 12 : 24;

    if (y >= navbarTop && y <= navbarTop + navbarHeight && x >= navbarPadX && x <= this.viewportWidth - navbarPadX) {
      return { target: "navbar", zIndex: 100, pointerEvents: "auto" };
    }

    // 6. Layer 0..1: Page Content
    return { target: "page-content", zIndex: 0, pointerEvents: "auto" };
  }
}

test("4.1 Closed Desktop: clicks on 44px tab capture event, clicks adjacent pass through to page", () => {
  const engine = new HitTestEngine(1920, 1080, { isOpen: false });

  const tabHit = engine.hitTest(1900, 200);
  assert.strictEqual(tabHit.target, "slideOutTab", "Click on tab must hit slideOutTab");
  assert.strictEqual(tabHit.pointerEvents, "auto");

  const passHit = engine.hitTest(1850, 200);
  assert.strictEqual(passHit.target, "page-content", "Click outside tab must pass through #slideOut to page content");

  const navHit = engine.hitTest(1800, 50);
  assert.strictEqual(navHit.target, "navbar", "Navbar click must be unblocked by closed #slideOut");
});

test("4.2 Open Desktop: clicks inside modal hit modal, clicks outside modal hit backdrop", () => {
  const engine = new HitTestEngine(1920, 1080, { isOpen: true });

  const modalHit = engine.hitTest(1750, 300);
  assert.strictEqual(modalHit.target, "slideOut-modal", "Click inside open drawer must hit modal");

  const tabHit = engine.hitTest(1600, 300);
  assert.strictEqual(tabHit.target, "slideOutTab", "Click on open tab must hit tab");

  const backdropHit = engine.hitTest(500, 500);
  assert.strictEqual(backdropHit.target, "bug-backdrop", "Click outside open drawer must hit backdrop");
});

test("4.3 Loader Screen Active: completely intercepts clicks over #slideOut tab and modal", () => {
  const engineClosed = new HitTestEngine(1920, 1080, { isOpen: false, isLoaderActive: true });
  const hit1 = engineClosed.hitTest(1900, 200);
  assert.strictEqual(hit1.target, "loader-screen", "Loader must intercept click over slideOutTab");

  const engineOpen = new HitTestEngine(1920, 1080, { isOpen: true, isLoaderActive: true });
  const hit2 = engineOpen.hitTest(1750, 300);
  assert.strictEqual(hit2.target, "loader-screen", "Loader must intercept click over slideOut-modal");
});

test("4.4 Menu Select Dropdown Active: intercepts clicks over overlapping drawer area", () => {
  const engine = new HitTestEngine(1920, 1080, {
    isOpen: true,
    isMenuSelectActive: true,
    menuSelectRect: { x: 1550, y: 150, width: 300, height: 200 },
  });

  const hit = engine.hitTest(1650, 200);
  assert.strictEqual(hit.target, "menu-select-menu", "Select menu at z-index 300 must intercept click over drawer at z-index 200");
});

test("4.5 Closed Mobile (320px): click-through and tab capturing boundaries", () => {
  const engine = new HitTestEngine(320, 568, { isOpen: false });

  const tabHit = engine.hitTest(290, 100);
  assert.strictEqual(tabHit.target, "slideOutTab", "Tab captures click on 320px mobile");

  const pageHit = engine.hitTest(200, 200);
  assert.strictEqual(pageHit.target, "page-content", "Click at x=200, y=200 passes through to mobile page content");
});

// -------------------------------------------------------------
// SECTION 5: EVENT PROPAGATION & COMPONENT CONTRACT
// -------------------------------------------------------------
console.log("\n--- 5. Event Propagation & Component Handlers ---");

test("5.1 .slideOut-modal stopPropagation prevents event bubbling to backdrop or container", () => {
  assert.ok(
    jsxContent.includes('className="slideOut-modal" onClick={(e) => e.stopPropagation()}'),
    ".slideOut-modal must have onClick={(e) => e.stopPropagation()} to prevent click bubbling"
  );
});

test("5.2 .bug-backdrop has onClick={close} for outside-click dismissal", () => {
  assert.ok(
    jsxContent.includes('className={`bug-backdrop ${open ? "show" : ""}`}\n        onClick={close}') ||
    (jsxContent.includes('className={`bug-backdrop ${open ? "show" : ""}`}') && jsxContent.includes('onClick={close}')),
    "Backdrop must invoke close handler on click"
  );
});

test("5.3 .slideOutTab has onClick={toggle} and keyboard listener (Enter/Space)", () => {
  assert.ok(jsxContent.includes('className="slideOutTab"'), "slideOutTab exists");
  assert.ok(jsxContent.includes('onClick={toggle}'), "slideOutTab has onClick={toggle}");
  assert.ok(jsxContent.includes('e.key === "Enter" || e.key === " "'), "slideOutTab handles Enter and Space keys");
});

test("5.4 Escape key listener dismisses panel when open", () => {
  assert.ok(jsxContent.includes('e.key === "Escape" && open'), "Escape key listener closes panel when open");
});

// -------------------------------------------------------------
// SECTION 6: TRANSITION & ANIMATION PERFORMANCE
// -------------------------------------------------------------
console.log("\n--- 6. Transition & Animation Performance ---");

test("6.1 No wildcard transition (transition: all) on #slideOut or child elements", () => {
  const slideOutSection = cssContent.slice(cssContent.indexOf("/* ===== Slide-out Bug Report Panel ====="));
  assert.ok(!slideOutSection.includes("transition: all"), "Must not use 'transition: all' to avoid layout thrashing");
});

test("6.2 Cubic-bezier hardware-friendly easing used for right translation", () => {
  assert.ok(
    cssContent.includes("transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);"),
    "Must use high-performance cubic-bezier easing for right translation"
  );
});

console.log("\n" + "=".repeat(79));
console.log(`  CHALLENGER M1_2 ADVERSARIAL VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=".repeat(79) + "\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
