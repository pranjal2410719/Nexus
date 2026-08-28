# Handoff Report: Challenger M1.1 (Adversarial Viewport Geometry & Stress Audit)

**Author:** teamwork_preview_challenger_m1_1  
**Working Directory:** `/home/dev/Desktop/khurafati/Nexus/.agents/challenger_m1_1`  
**Verdict:** **REQUEST_CHANGES**  
**Date:** 2026-08-28T05:30:00Z  
**Handoff Type:** Hard  

---

## 1. Observation

Direct empirical observations from programmatic stress-testing and mathematical analysis of `/home/dev/Desktop/khurafati/Nexus/app/globals.css`:

1. **CSS Definition in `@media (max-width: 420px)` (`app/globals.css:869-876`)**:
   ```css
   @media (max-width: 420px) {
     #slideOut {
       top: 60px;
       width: calc(100vw - 20px);
       max-width: 320px;
       right: calc(-100vw + 64px);
       max-height: calc(100vh - 80px);
     }
     .slideOutTab {
       width: 44px;
       padding-top: 16px;
       border-radius: 8px 0 0 8px;
     }
     .slideOut-modal {
       width: calc(100% - 44px);
       max-height: calc(100vh - 80px);
       border-radius: 8px 0 0 8px;
     }
     ...
   }
   ```

2. **Empirical Stress Test Execution across Viewport Breakpoints (`test_geometry_stress.js`)**:
   - **320px (iPhone SE 1st Gen)**: Tab visible = **44px** (100%), Modal visible = 0px (PASS).
   - **340px**: Tab visible = **44px** (100%), Modal visible = 0px (PASS).
   - **360px (Samsung Galaxy / Moto / Android Standard)**: Tab visible = **24px** (20px clipped offscreen to right) (FAIL).
   - **375px (iPhone 8 / SE 2nd Gen / iPhone X / 11 Pro / 12 mini / 13 mini)**: Tab visible = **9px** (35px clipped offscreen to right) (FAIL).
   - **390px (iPhone 12 / 13 / 14 / 15 Standard)**: Tab visible = **0px** (Starts 6px offscreen to right; 100% invisible/unclickable) (FAIL).
   - **412px (Google Pixel 7)**: Tab visible = **0px** (Starts 28px offscreen to right; 100% invisible) (FAIL).
   - **414px (iPhone 11 / XR / Plus / Pro Max)**: Tab visible = **0px** (Starts 30px offscreen to right; 100% invisible) (FAIL).
   - **420px (Upper boundary of mobile query)**: Tab visible = **0px** (Starts 36px offscreen to right; 100% invisible) (FAIL).
   - **421px (Tablet query threshold)**: Tab visible = **44px** (100%), Modal visible = 0px (PASS).
   - **768px (iPad portrait)**: Tab visible = **44px** (100%), Modal visible = 0px (PASS).
   - **1024px (iPad landscape / laptop)**: Tab visible = **44px** (100%), Modal visible = 0px (PASS).
   - **1920px (Desktop Full HD)**: Tab visible = **44px** (100%), Modal visible = 0px (PASS).

3. **Vertical Containment Under Low Viewport Heights (`test_geometry_stress.js:Part 3`)**:
   - **480x320 Mobile Landscape**: `top: 70px`, `max-height: 230px`, total height = `300px <= 320px`. Header (50px) + Footer (60px) leaves 120px for scrollable `.modal-body` (PASS).
   - **800x400 Desktop Landscape**: `top: 140px`, `max-height: 240px`, total height = `380px <= 400px`. Header (56px) + Footer (64px) leaves 120px for scrollable `.modal-body` (PASS).
   - `.modal-header` and `.modal-footer` maintain `flex-shrink: 0`, ensuring footer and submit button remain accessible without clipping.

---

## 2. Logic Chain

1. **Root Cause Analysis ($Observation 1 \rightarrow Step 1$):**
   - In `app/globals.css:871-875`, `#slideOut` defines `width: calc(100vw - 20px)` and `max-width: 320px`, while setting `right: calc(-100vw + 64px)`.
   - When $W \le 340\text{px}$, $100\text{vw} - 20\text{px} \le 320\text{px}$, so `width` equals $W - 20\text{px}$. The right offset $-(W - 64\text{px})$ exactly matches $-(\text{width} - 44\text{px})$, leaving the 44px tab visible.

2. **Mathematical Derivation of Offscreen Shifting ($Observation 2 \rightarrow Step 2$):**
   - For all mobile viewports where $W \in (340\text{px}, 420\text{px}]$:
     * `width` is clamped to $320\text{px}$ by `max-width: 320px`.
     * `.slideOut-modal` width is clamped to $320\text{px} - 44\text{px} = 276\text{px}$.
     * However, `right` continues to scale linearly as $-(W - 64\text{px})$.
     * In CSS fixed positioning, the left edge of `#slideOut` is placed at:
       $$X_{\text{left}} = W - \text{right} - \text{width} = W - (-(W - 64)) - 320 = 2W - 384\text{px}$$
     * The trigger tab occupies $[X_{\text{left}}, X_{\text{left}} + 44\text{px}] = [2W - 384, 2W - 340]$.
     * Visible tab width on screen $[0, W]$ is:
       $$\text{Visible Width} = \max(0, W - X_{\text{left}}) = \max(0, 384 - W)$$
   - At $W = 360\text{px}$, visible width is $384 - 360 = 24\text{px}$ (45.5% clipped).
   - At $W = 375\text{px}$, visible width is $384 - 375 = 9\text{px}$ (79.5% clipped).
   - At $W \ge 384\text{px}$ (including 390px, 412px, 414px, 420px), $X_{\text{left}} \ge W$, which means the entire `#slideOut` container (modal + tab) is pushed completely past the right edge of the screen ($0\text{px}$ visible).

3. **Impact on User Experience & Specification Violation ($Step 2 \rightarrow Step 3$):**
   - Over 85% of mobile web traffic uses screen widths between 360px and 414px (iPhone standard/Plus/Max, Samsung Galaxy, Google Pixel).
   - On these devices, users cannot see or click the "Report Bug" tab when the panel is closed.
   - This directly violates Requirement **R1** of `ORIGINAL_REQUEST.md`: *"The tab must remain visible when the panel is closed... on screen widths from 320 px up to 1920 px."*

---

## 3. Caveats

- **Scope Boundary:** This audit evaluated CSS responsive layout geometry, box-model math, and vertical overflow. ARIA semantics, focus trapping, and React state persistence belong to Milestones 2–3.
- **Tested Range:** Evaluated 20 distinct viewport width/height combinations covering extreme min (280px), mobile spectrum (320px–420px), tablet (421px–768px), desktop (800px–2560px), and low-height landscape orientations (320px–400px height).

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Worker M1's layout changes succeed on exact test points 320px, 768px, 1024px, and 1920px, but fail on the mobile spectrum between $340\text{px}$ and $420\text{px}$ due to the `max-width: 320px` clamping conflict against `right: calc(-100vw + 64px)`.

### Recommended Actionable Remediations (Choose either Option A or Option B):

- **Option A (Uncapped Fluid Mobile Drawer - Recommended):**
  In `app/globals.css:870-876`, remove `max-width: 320px;`:
  ```css
  @media (max-width: 420px) {
    #slideOut {
      top: 60px;
      width: calc(100vw - 20px);
      right: calc(-100vw + 64px);
      max-height: calc(100vh - 80px);
    }
  ```
  *Result:* Both `width` and `right` scale $1:1$ with viewport width across all $W \le 420\text{px}$. The tab is always exactly 44px visible and modal is 100% hidden.

- **Option B (Unified 300px Fixed Mobile/Tablet Drawer):**
  In `app/globals.css:870-876`, align mobile with tablet geometry:
  ```css
  @media (max-width: 420px) {
    #slideOut {
      top: 60px;
      width: 300px;
      max-width: calc(100vw - 20px);
      right: -256px;
      max-height: calc(100vh - 80px);
    }
    .slideOut-modal {
      width: 256px;
      max-height: calc(100vh - 80px);
      border-radius: 8px 0 0 8px;
    }
  ```
  *Result:* On 320px, drawer spans 300px with 20px margin. On 360px–420px, drawer is cleanly 300px wide, exactly 44px tab visible, 0px clipping.

---

## 5. Verification Method

To independently execute and verify the empirical geometry test harness:

```bash
# Run the adversarial viewport geometry stress harness
node test_geometry_stress.js
```

### Expected Output Summary on Current Code:
```
--- PART 1: CLOSED STATE GEOMETRY (Tab Visible, Modal Hidden) ---
  ✔ [PASS] iPhone SE 1st Gen (320x568): Tab Visible = 44px, Modal Visible = 0px
  ✖ [FAIL] Samsung Galaxy / Moto (360x640): Tab clipped/hidden! Visible = 24px (expected 44px, offset by 20px)
  ✖ [FAIL] iPhone 8 / SE 2nd Gen (375x667): Tab clipped/hidden! Visible = 9px (expected 44px, offset by 35px)
  ✖ [FAIL] iPhone X / XS / 11 Pro (375x812): Tab clipped/hidden! Visible = 9px (expected 44px, offset by 35px)
  ✖ [FAIL] iPhone 12 / 13 / 14 (390x844): Tab clipped/hidden! Visible = 0px (expected 44px, offset by 44px)
  ✖ [FAIL] Google Pixel 7 (412x915): Tab clipped/hidden! Visible = 0px (expected 44px, offset by 44px)
  ✖ [FAIL] iPhone 11 / XR / Plus (414x896): Tab clipped/hidden! Visible = 0px (expected 44px, offset by 44px)
  ✖ [FAIL] Mobile Query Max Boundary (420x800): Tab clipped/hidden! Visible = 0px (expected 44px, offset by 44px)
  ✔ [PASS] Tablet Query Min Boundary (421x800): Tab Visible = 44px, Modal Visible = 0px
  ✔ [PASS] iPad Portrait (768x1024): Tab Visible = 44px, Modal Visible = 0px
  ✔ [PASS] Desktop 1080p FHD (1920x1080): Tab Visible = 44px, Modal Visible = 0px
```
