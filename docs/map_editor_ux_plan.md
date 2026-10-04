# Plan: Large Map Editor Ergonomics & Floating HUD Overlay (64×64 UX Fixes)

This plan defines the architecture, DOM layout, camera state persistence, event handling, and verification strategy to make editing large maps (such as 64×64) seamless, fluid, and non-disruptive in Tavern.

Status: implemented and verified after class onboarding (October 2026).

## Execution reconciliation

The original baseline was 48 domain/integration tests and 14 browser tests; the verified class-onboarding milestone brought it to 49 and 15. Completion requires every test in the expanded suite to pass, rather than preserving historical counts. Scene identity already keys `MapCanvas`, so keep that lifecycle. The existing unconditional resize fit and in-flow controls matched the reported root causes.

Use minimum fit clearances of 72px top and 48px bottom (rather than the earlier conflicting 80px total margin), expanding them to the visible overlay bounds plus 8px. A browser regression demonstrated that fixed margins alone hide standard-map rows behind the HUD/palette. Measure overlays only on initial or explicit Fit. Preserve zoom and the world point at the viewport center on subsequent resizes. At narrow widths, allow the toolbar/palette to scroll within the workspace and keep zoom and movement controls accessible. Add regression coverage in `tests/e2e/map-editor.spec.ts`; shared browser helpers observe the real canvas transform instead of duplicating fit mathematics.

---

## 1. Overview & Root Cause Analysis

When working with large maps (such as 64×64 tiles / 2048×2048 px), terrain painting and map inspection suffer from four distinct ergonomic issues reported by users:

1. **Camera Zoom & Position Reset on Tool Switch:**
   - _Symptom:_ Switching between Paint (`B`) and Pan (`H`) resets camera zoom to 20% and recenters the viewport, discarding the user's focus.
   - _Root Cause:_ In `tabletop.tsx`, entering Paint mode conditionally renders the terrain palette (`.brush-dock`), while exiting unmounts it. Because `.brush-dock` is an in-flow flex item below `.canvas-area`, mounting or unmounting it mutates the canvas element's bounding rect by ~130–150px. `MapCanvas`'s `ResizeObserver` reacts to this resize by unconditionally invoking `fit()`. On a 64×64 map (2048×2048 px), `(height - 80) / 2048` evaluates to `< 0.2`, clamping zoom to the minimum `0.2` (20%) and resetting camera offsets `(x, y)` to center.

2. **Terrain Palette Layout Competition (Reflow & Canvas Shrinkage):**
   - _Symptom:_ Entering Paint mode steals vertical screen space, squishing the map and causing layout jitter.
   - _Root Cause:_ `.map-workspace` uses `display: flex; flex-direction: column`. The terrain palette (`.brush-dock`) is placed at `order: 4` in normal flow, directly consuming viewport height that belongs to the canvas.

3. **Absence of Right-Click Drag Panning in Paint Mode:**
   - _Symptom:_ In Paint mode, navigating across a 64×64 map requires constantly pressing `H` (Pan) to move, then `B` (Paint) to resume editing, interrupting flow.
   - _Root Cause:_ `pointerDown` in `map-canvas.tsx` explicitly guards `if (event.button !== 0 && event.button !== 1) return;`, ignoring right-mouse clicks (`event.button === 2`). Furthermore, `<canvas>` lacks `onContextMenu={(e) => e.preventDefault()}`, which would cause the browser's context menu to hijack right-clicks.

4. **Top Controls & Status HUDs Stealing Canvas Area:**
   - _Symptom:_ The top toolbar (`.map-top-tools`), token status HUD (`.character-hud`), and GM scene controls (`.gm-scene-controls`) occupy vertical flow space above the canvas (~120–150px), reducing usable canvas height.
   - _Root Cause:_ `.map-top-tools` (`order: 0`), `.character-hud` (`order: 1`), and `.gm-scene-controls` (`order: 2`) are all in-flow flex items preceding `.canvas-area` (`order: 3`).

**Objective:**
Convert the canvas into a full-bleed workspace layer filling 100% of `.map-workspace`. Position all controls (top toolbar, character HUD, GM scene controls, and bottom terrain palette) as floating overlays with transparent click pass-through on non-interactive areas. Decouple camera state from container resizes to preserve zoom and focal point. Enable fluid right-click hold-and-drag panning across all editing tools.

---

## 2. Workspace & Codebase Audit

- **Affected Files:**
  - `src/components/canvas/map-canvas.tsx`:
    - Add `initialized = useRef(false)` to distinguish initial mounting from subsequent container resizes.
    - Guard `ResizeObserver` against zero-dimension layout passes (`width === 0 || height === 0`).
    - On container resize after initialization, preserve `camera.zoom` and adjust `camera.x` and `camera.y` by viewport deltas `(newWidth - prevWidth) / 2` and `(newHeight - prevHeight) / 2` using functional state updater `setCamera(curr => ...)`.
    - Allow `event.button === 2` in `pointerDown` and mark `pan: true` in `drag.current`.
    - Ensure right-click does NOT trigger `onSelectMember` or `paint()`.
    - Ensure right-click release on `pointerUp` does NOT trigger `move()` or `onSpawn()`.
    - Attach `onContextMenu={(e) => e.preventDefault()}` on `<canvas>` to suppress native browser context menu.
    - Update accessible helper instructions in `#map-instructions` and the help modal in `tabletop.tsx`.
  - `src/components/tabletop.tsx`:
    - Group `.character-hud` and `.gm-scene-controls` inside a top floating container (`.map-hud-stack`).
    - Update the help modal text to document right-click drag panning.
  - `src/app/globals.css`:
    - Style `.map-workspace` with `position: relative; overflow: hidden;` (removing flex column layout constraint).
    - Style `.canvas-area` as full-bleed `position: absolute; inset: 0; width: 100%; height: 100%;`.
    - Style `.map-top-tools` as floating top bar (`position: absolute; top: 0; left: 0; right: 0; z-index: 10; pointer-events: none;`) with interactive children (`pointer-events: auto;`).
    - Style `.map-hud-stack` as floating top-left container (`position: absolute; top: 72px; left: 25px; z-index: 9; display: flex; flex-direction: column; gap: 8px; pointer-events: none;`).
    - Style `.character-hud` and `.gm-scene-controls` as `display: inline-flex; align-self: flex-start; pointer-events: none;` with glassmorphism backdrop blur.
    - Set `.character-hud button` and `.gm-scene-controls button` to `pointer-events: auto;` so status text allows clicks to pass through to the canvas while buttons remain clickable.
    - Style `.brush-dock` as floating bottom overlay (`position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 10; margin: 0;`).
    - Style `.player-view-note` as floating bottom overlay (`position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 8; margin: 0; pointer-events: none;`).
    - Elevate `.zoom-controls` to `z-index: 11;` to ensure zoom buttons always remain above other floating elements.
    - Update mobile media queries (`@media (max-width: 760px)` and `@media (max-width: 600px)`).
  - `docs/roadmap.md`:
    - Update Phase 7 with complete, trackable acceptance criteria.
  - `tests/e2e/map-editor.spec.ts` (or `tests/e2e/tavern.spec.ts`):
    - Dedicated end-to-end tests for 64×64 camera persistence, right-click drag pan, and overlay pass-through.
  - `tests/e2e/helpers/map-view.ts` and `tests/e2e/tavern.spec.ts`:
    - Observe the actual world rendering transform from browser test code, and replace obsolete fit-formula copies in tile-drag and sprite-pixel checks.

---

## 3. Detailed Technical Architecture

### 3.1 Camera Mathematics & Resize Handling (`map-canvas.tsx`)

#### Initial Layout vs. Subsequent Resizes

```typescript
const initialized = useRef(false);

const fit = useCallback(() => {
  if (size.current.width === 0 || size.current.height === 0) return;
  initialized.current = true;
  const width = panel.grid.cols * 32;
  const height = panel.grid.rows * 32;
  const workspace = canvasRef.current?.closest('.map-workspace');
  const bounds = canvasRef.current?.getBoundingClientRect();
  let top = 72;
  let bottom = 48;
  if (workspace && bounds) {
    for (const overlay of workspace.querySelectorAll('.map-top-tools, .map-hud-stack')) {
      const rect = overlay.getBoundingClientRect();
      if (rect.height > 0) top = Math.max(top, rect.bottom - bounds.top + 8);
    }
    for (const overlay of workspace.querySelectorAll(
      '.brush-dock, .player-view-note, .zoom-controls',
    )) {
      const rect = overlay.getBoundingClientRect();
      if (rect.height > 0) bottom = Math.max(bottom, bounds.bottom - rect.top + 8);
    }
  }
  const zoom = Math.max(
    0.2,
    Math.min(2, (size.current.width - 80) / width, (size.current.height - top - bottom) / height),
  );
  setCamera({
    x: (size.current.width - width * zoom) / 2,
    y: top + (size.current.height - top - bottom - height * zoom) / 2,
    zoom,
  });
}, [panel.grid.cols, panel.grid.rows]);

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    // Guard against zero-dimension layout passes on initial render
    if (width === 0 || height === 0) return;

    const prev = size.current;
    size.current = { width, height };
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;

    if (!initialized.current) {
      fit();
    } else {
      // Container resized (e.g. window resize or sidebar toggle):
      // Keep exact zoom, adjust camera offset by viewport delta to preserve center focal point
      const dx = (width - prev.width) / 2;
      const dy = (height - prev.height) / 2;
      if (dx !== 0 || dy !== 0) {
        setCamera((current) => ({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        }));
      }
    }
    schedule();
  });

  observer.observe(canvas);
  return () => {
    observer.disconnect();
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
}, [fit, schedule]);
```

**Key Invariants:**

1. Switching `tool` (Paint <-> Pan <-> Move) changes props on `MapCanvas`, but does NOT remount it (since `key={snapshot.panel.id}` remains stable).
2. Because `.brush-dock` is now a floating overlay, `ResizeObserver` does NOT trigger when switching tools.
3. Even when `ResizeObserver` DOES trigger (e.g. opening the dice sidebar or resizing browser window), `camera.zoom` is untouched and `setCamera` adjusts only by `(dx, dy) / 2`, preserving the exact tile at the center of the screen.
4. Switching scenes changes `panel.id`, remounting `MapCanvas` and re-running `fit()` for the new scene.

---

### 3.2 Right-Click Drag Pan Event Flow (`map-canvas.tsx`)

#### Pointer Down

```typescript
function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
  // Allow left button (0), middle button (1), and right button (2)
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  event.currentTarget.focus();
  event.currentTarget.setPointerCapture(event.pointerId);
  stroke.current.clear();

  // Right-click always acts as a Pan gesture
  const isRightClick = event.button === 2;
  const pan =
    tool === 'pan' ||
    event.button === 1 ||
    isRightClick ||
    (tool !== 'move' && !canEdit) ||
    event.altKey;

  const cell = cellAt(event);
  const hit =
    !pan && tool === 'move' && cell
      ? members.find(
          (member) =>
            member.role === 'player' &&
            member.token?.panelId === panel.id &&
            member.token.x === cell.x &&
            member.token.y === cell.y &&
            (you.role === 'gm' || member.id === you.id),
        )
      : undefined;

  if (!pan && canMove && hit && you.role === 'gm') onSelectMember(hit.id);

  drag.current = {
    x: event.clientX,
    y: event.clientY,
    pan,
    cell,
    memberId: hit?.id,
  };

  // Only paint on left click when not panning
  if (!pan && tool !== 'move') paint(cell);
}
```

#### Pointer Move & Pointer Up

- During `pointerMove`: If `drag.current.pan` is true, calculate `dx = event.clientX - drag.current.x` and `dy = event.clientY - drag.current.y`, updating `setCamera` and setting `drag.current.x/y`.
- On `pointerUp`: If `start.pan` is true, skip token movement (`move()`), spawn setting (`onSpawn()`), and tile painting.
- On `<canvas>`: Add `onContextMenu={(event) => event.preventDefault()}` to suppress the context menu when right-clicking the canvas.

---

### 3.3 DOM & CSS Overlay Architecture (`tabletop.tsx`, `globals.css`)

#### Layout Hierarchy in `.map-workspace`

```html
<div class="map-workspace">
  <!-- Full-bleed canvas layer filling 100% of workspace -->
  <div class="canvas-area">
    <canvas class="map-canvas" onContextMenu="..." />
    <div class="map-coordinate">...</div>
    <div class="zoom-controls">...</div>
    <div class="movement-pad">...</div>
  </div>

  <!-- Top floating toolbar -->
  <div class="map-top-tools">
    <div class="tool-switch">...</div>
    <span class="role-tag">...</span>
  </div>

  <!-- Top-left floating status stack -->
  <div class="map-hud-stack">
    <div class="character-hud">...</div>
    <div class="gm-scene-controls">...</div>
  </div>

  <!-- Bottom floating terrain palette (GM Paint mode) -->
  <div class="brush-dock">...</div>

  <!-- Bottom floating note (Player view) -->
  <div class="player-view-note">...</div>
</div>
```

#### Pointer-Events & Pass-Through Strategy

To ensure that hovering or dragging across HUD text does not block painting or token movement:

1. `.map-top-tools`: `pointer-events: none;`. Only child buttons have `pointer-events: auto;`. Role text and gaps fall through to the canvas.
2. `.map-hud-stack`: `pointer-events: none;`.
3. `.character-hud` and `.gm-scene-controls`:
   - Containers have `pointer-events: none;` and `display: inline-flex; align-self: flex-start;` so they only occupy their intrinsic content box.
   - Interactive child elements (`.character-hud button`, `.gm-scene-controls button`) have `pointer-events: auto;`.
   - Text elements (`Position X, Y`, `Players can move freely`, `Spawn X, Y`) have `pointer-events: none;`. Clicks and drags over these labels pass straight through to the map canvas underneath.
4. `.brush-dock`: `pointer-events: auto; z-index: 10;`.
5. `.zoom-controls`: `pointer-events: auto; z-index: 11;` (always clickable above dock overlays).

#### Camera Inset Clearance

When `.canvas-area` is full-bleed, `fit()` centers the map vertically in `size.current.height`. To prevent row 0 of a fitted map from being occluded by `.tool-switch` in standard views, `fit()` includes safe margin calculation:

- `safeTopMargin`: at least 72px, expanded to the bottom edge of the toolbar/HUD stack plus 8px.
- `safeBottomMargin`: at least 48px, expanded above the palette, player note, and zoom controls with 8px clearance.
- Fit centers the map in the remaining vertical space. Standard maps fitted with `<Crosshair />` remain clear of the overlays. The existing 20% minimum zoom still applies to large maps on narrow/short viewports; panning remains available.

---

## 4. Implementation Steps

### Phase 1: Camera State & Zoom Persistence (`map-canvas.tsx`)

- [x] **Step 1.1: Guard initial fit and preserve camera on container resizes**
  - Add `initialized = useRef(false)`.
  - Guard `ResizeObserver` against `width === 0 || height === 0`.
  - On first non-zero resize, call `fit()`.
  - On subsequent resizes, update `camera.x += dx / 2` and `camera.y += dy / 2` with functional state update.
- [x] **Step 1.2: Right-click hold-and-drag panning**
  - Allow `event.button === 2` in `pointerDown`.
  - Set `pan: true` in `drag.current` on right click.
  - Guard `onSelectMember` and `paint` from executing on right click.
  - Add `onContextMenu={(e) => e.preventDefault()}` on `<canvas>`.
  - Update accessible hint in `#map-instructions` and modal help text in `tabletop.tsx`.

### Phase 2: Floating Overlays & Pass-Through Styling (`tabletop.tsx`, `globals.css`)

- [x] **Step 2.1: Floating HUD stack wrapper**
  - In `src/components/tabletop.tsx`, wrap `.character-hud` and `.gm-scene-controls` inside `<div className="map-hud-stack">`.
- [x] **Step 2.2: CSS absolute overlays and pointer-events rules**
  - In `src/app/globals.css`, configure `.canvas-area` with `position: absolute; inset: 0; width: 100%; height: 100%;`.
  - Style `.map-top-tools` with `position: absolute; top: 0; left: 0; right: 0; margin: 18px 25px 0; z-index: 10; pointer-events: none;`.
  - Style `.map-hud-stack` with `position: absolute; top: 72px; left: 25px; z-index: 9; display: flex; flex-direction: column; gap: 8px; pointer-events: none;`.
  - Style `.character-hud` and `.gm-scene-controls` with `display: inline-flex; align-self: flex-start; pointer-events: none; backdrop-filter: blur(4px);`.
  - Ensure `.character-hud button` and `.gm-scene-controls button` have `pointer-events: auto;`.
  - Style `.brush-dock` with `position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 10; margin: 0; backdrop-filter: blur(6px);`.
  - Style `.player-view-note` with `position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 8; margin: 0; pointer-events: none;`.
  - Set `.zoom-controls` to `z-index: 11;`.
- [x] **Step 2.3: Mobile responsive positioning**
  - At `@media (max-width: 760px)` and `@media (max-width: 600px)`: adjust `.map-top-tools` margin to `12px 12px 0`, `.map-hud-stack` top to `64px`, left to `12px`, and `.brush-dock` to `width: calc(100% - 24px); bottom: 12px; margin: 0;`.
  - Below 760px, place the non-interactive player movement hint 164px above the workspace bottom, clearing the movement pad and zoom controls. A visual review and overlap regression caught the original 16px placement covering this text.

### Phase 3: Comprehensive Verification & Test Suite

- [x] **Step 3.1: Unit & Integration tests**
  - Run `npm test` (`tsx --test tests/*.test.ts`) ensuring every test in the current suite passes.
- [x] **Step 3.2: E2E Playwright test suite**
  - Add dedicated tests in `tests/e2e/map-editor.spec.ts`:
    - Create a 64×64 table.
    - Zoom in beyond the initial fit and pan around coordinate (32, 32). Existing zoom controls use multiplicative increments, so assert the exact chosen zoom rather than inventing a 100% preset.
    - Switch between Paint (`B`), Pan (`H`), and Move (`M`) tools. Assert zoom and camera coordinates are unchanged.
    - Right-click drag in Paint mode. Assert camera moves and no tiles are painted.
    - Click and drag tokens beneath `.character-hud` to verify pointer-event pass-through.
    - Assert every browser test passes without regressions, including center preservation on window/sidebar resizes, scene refitting, mobile control reachability, and actual token movement under HUD text.

---

## 5. Definition of Done & Quality Gate

1. `npm test` passes every current test with zero failures.
2. `npx playwright test` passes all browser integration tests.
3. `npm run typecheck` (`tsc --noEmit`) passes with zero errors.
4. `npm run lint` (`eslint .`) passes with zero warnings or errors.
5. `npm run format:check` (`prettier --check .`) passes cleanly.
6. `docs/roadmap.md` is updated with Phase 7 referencing this plan.
7. `npm run build` passes the production compilation and page-generation gate.

## Verification evidence

Executed after the verified class-selection plan, in roadmap phase order. All checklist items are complete. Final validation passes with 49 domain/integration tests and 20 Playwright tests, plus TypeScript, ESLint, formatting, production build, and `git diff --check`.

The five dedicated map-editor browser tests verify 64×64 tool/camera persistence, window/dice-sidebar center preservation, zero-size transitions, scene refitting, actual overlay clearance, right/middle panning with no game mutations, context-menu suppression, HUD painting/token-drag pass-through, and mobile control reachability at 760px, 600px, and 390px. Existing workflows additionally verify sprite pixels using the real transform and mobile movement-hint overlap. Desktop/mobile screenshots were inspected in `artifacts/map-editor-desktop.png`, `artifacts/map-editor-mobile.png`, and `artifacts/phase4-player-mobile.png`.
