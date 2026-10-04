# Dice System & Right Sidebar Plan — Architecture & Specifications

This plan defines the architecture, data flow, user interface, and technical specifications for the dedicated right sidebar dice log, standard RPG dice notation (`XdY`), and dice rolling animation in Tavern.

## Execution checklist & reconciliation

The initial audit confirmed that `GameService.rollDice`, Socket.io broadcasts, cryptographic faces, validation, and durable last-20 history already exist; the baseline suite passes 25 tests. Existing local layout and roadmap changes are preserved.

- [x] Audit current implementation, constraints, and baseline tests.
- [x] Reconcile library claims, role metadata, responsive behavior, and animation lifecycle.
- [x] Implement and test notation parsing, formatting, limits, and server integration.
- [x] Add optional server-authored role metadata; infer roles for legacy history without exposing private session data.
- [x] Replace the floating tray with a default-open desktop sidebar (280px) and a default-closed mobile drawer below 980px.
- [x] Implement Enter submission, six one-click quick rolls, inline validation, and disconnected/pending controls.
- [x] Display author/role, timestamp, formula, individual faces/modifier, prominent total, and natural d20 highlights.
- [x] Animate live rolls with SVG/CSS for about 800ms, then display server values; respect reduced motion and do not replay restored history.
- [x] Verify GM/player sharing, persistent history, concurrent rolls, desktop toggling, mobile dismissal/focus, and reduced motion in browser tests.
- [x] Update architecture, data models, README, roadmap, and this checklist with verification evidence.
- [x] Pass the full unit/integration and browser suites, lint, typecheck, formatting, and production build; audit the final diff.

The right drawer uses a native modal dialog for Escape and backdrop dismissal, with input focus on opening and explicit Tab/Shift+Tab wrapping. Quick buttons roll one die immediately. The animation uses only newly received `dice:rolled` records, independently for each roll; restored snapshots and reopening a sidebar do not replay history. Roles are optional on persisted records for compatibility and supplied authoritatively for new rolls and legacy snapshots.

## 1. Scope & Objectives

1. **Right Sidebar Log (`dice-sidebar`):**
   - Provide a persistent, scrollable right sidebar log on desktop and collapsible drawer on mobile for all dice rolls.
   - Display who rolled the dice (player nickname, GM crown badge, or player indicator), what was rolled (`count`d`sides` ± `modifier`), individual roll breakdown, and prominent total sum.
   - Both Game Master (GM) and Players can roll and view the real-time shared history.

2. **Standard RPG Dice Notation (`XdY`):**
   - Support standard RPG dice notation: `XdY` (e.g., `2d4`, `3d6`, `1d20`), shorthand `dY` (defaults to 1 die, e.g. `d20`), and optional modifiers (e.g. `2d6+3`, `1d20-2`).
   - Supported polyhedral dice set: **d4, d6, d8, d10, d12, d20**.
   - Input methods:
     - Text command input with parser and immediate submit on Enter.
     - Quick polyhedral dice buttons (`d4`, `d6`, `d8`, `d10`, `d12`, `d20`) for 1-click rolling or expression building.

3. **Mini Roll Animation:**
   - Visual rolling animation for the player whenever a dice roll occurs before settling on the final result.
   - Evaluation of 3D engines vs. lightweight CSS3/SVG retro polyhedral animation fitting Tavern's 16-bit pixel aesthetic.

---

## 2. Library Research & Evaluation for Dice Roll Animation

| Approach / Library                                                             | Technology                   | Polyhedral Support (d4-d20)                    | Bundle Size & Dependencies                                                                           | Aesthetic & UX Fit                                                                                                 |
| :----------------------------------------------------------------------------- | :--------------------------- | :--------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| **[`@3d-dice/dice-box`](https://github.com/3d-dice/dice-box)**                 | BabylonJS + AmmoJS           | RPG polyhedral dice                            | Adds a rendering/physics runtime, workers, and static assets; bundle size not measured here          | Full physics would need extra integration with authoritative results and Tavern's 2D art.                          |
| **[`@3d-dice/dice-box-threejs`](https://github.com/3d-dice/dice-box-threejs)** | ThreeJS + Cannon ES          | RPG polyhedral dice and predetermined outcomes | Adds rendering/physics dependencies and optional texture/sound assets; bundle size not measured here | Verified alternative to the unsubstantiated `react-3d-dice` entry; full physics exceeds this mini-animation scope. |
| **Retro CSS3 / SVG Polyhedral Mini-Animator**                                  | CSS transforms + SVG + React | Custom d4, d6, d8, d10, d12, d20 shapes        | Zero new dependencies or external assets; no unmeasured bundle-size claim                            | Selected to match Tavern's pixel typography and provide a short local tumble, cycling faces, and result settle.    |

### Decision on Animation:

- For Tavern's lightweight, retro-styled virtual tabletop, the recommended implementation is a **Retro CSS3 Polyhedral Mini-Animator** (with polyhedral SVG shapes, tumbling 3D keyframe rotation, cycling number values during roll duration ~800ms, and a settle/bounce effect displaying the authoritative server result).
- The implemented lifecycle ends the tumble at its receipt deadline and removes the settle animation after another 200ms. Reopening or changing responsive layouts after completion cannot restart either phase. Reduced motion presents the server values immediately.
- If full 3D physics dice tumbling across the map canvas is specifically desired, `@3d-dice/dice-box` can be integrated with dynamic client-side imports.

---

## 3. Architecture & Data Flow

### 3.1 Backend & Socket Compatibility

The existing server architecture already supports authoritative dice rolls:

- **Event `dice:roll`**: Accepts `DiceRequest` (`{ sides: number, count: number, modifier: number }`).
- **Validation `diceSchema`**: Accepts `sides` (4, 6, 8, 10, 12, 20, 100), `count` (1-20), `modifier` (-1000 to 1000).
- **State Mutation**: Generates cryptographically safe random integers on the server, calculates total, stores the last 20 rolls in `room.rolls`, and broadcasts `dice:rolled` to the room.
- **Conclusion**: The request protocol requires **no breaking changes**. The frontend RPG notation parser maps directly into `{ sides, count, modifier }`. Add optional `role` to `DiceRoll`, authored from the authenticated session. For legacy rolls, snapshots infer GM from the room's creator ID, so badges survive authors going offline without publishing private IDs or credentials.

### 3.2 RPG Notation Parsing Engine

The parser trims surrounding whitespace, accepts uppercase `D` and spaces around the modifier sign, rejects multiline/compound expressions, and caps input at 32 characters. See [parser implementation](../src/lib/dice-notation.ts).

```typescript
const DICE_EXPRESSION_REGEX = /^(\d+)?d(4|6|8|10|12|20)[ \t]*(?:([+-])[ \t]*(\d+))?$/i;
```

- Examples:
  - `2d4` -> `{ count: 2, sides: 4, modifier: 0 }`
  - `3d6` -> `{ count: 3, sides: 6, modifier: 0 }`
  - `1d20` or `d20` -> `{ count: 1, sides: 20, modifier: 0 }`
  - `2d6+3` -> `{ count: 2, sides: 6, modifier: 3 }`
  - `1d8-1` -> `{ count: 1, sides: 8, modifier: -1 }`

Limits enforced on client:

- `count`: 1 to 20.
- `sides`: must be in `[4, 6, 8, 10, 12, 20]`.
- `modifier`: -1000 to +1000.

---

## 4. UI/UX Layout: Right Sidebar

### 4.1 Layout Structure (`.room-body`)

```text
+-----------------------------------------------------------------------------------+
| Room Header (.room-nav)                                                           |
+-------------------+-------------------------------------------+-------------------+
| Scene Sidebar     | Tabletop Main (.table-main)               | Dice Sidebar      |
| (Left, 245px)     |                                           | (Right, 280px)    |
|                   |  - Toolbar (Tools, Views, Dice Toggle)    |                   |
|  - Scenes list    |  - Map Canvas                             |  - Roller Form    |
|  - Party online   |  - HUD / Tokens / GM dock                 |    * Quick chips  |
|  - Table code     |                                           |    * RPG input    |
|                   |                                           |  - Roll History   |
|                   |                                           |    * Author       |
|                   |                                           |    * Formula      |
|                   |                                           |    * Total result |
+-------------------+-------------------------------------------+-------------------+
```

### 4.2 Responsive Behavior

- **Desktop (≥ 980px):**
  - Right sidebar docked to the right of `.room-body`.
  - Can be toggled open/closed via the toolbar dice button to maximize canvas space when needed.
- **Mobile / Tablet (< 980px):**
  - Slides in from the right edge with backdrop overlay (mirrors the left sidebar behavior).
  - Dismissible with close button, backdrop tap, or Escape key.

### 4.3 Roll History Card Details

Each item in `.dice-history`:

- **Header:** Nickname + Role indicator (Crown icon for GM, adventurer avatar/badge for players) + timestamp (`10:42`).
- **Formula & Breakdown:** e.g., `2d20 + 2` -> `[19, 12] + 2`.
- **Result:** Displayed in prominent pixel font (`Pixelify Sans`).
- **Highlights:**
  - Critical Hit (Natural 20 on d20): Gold/emerald glowing badge ("Nat 20!").
  - Critical Miss (Natural 1 on d20): Crimson badge ("Nat 1!").

---

## 5. Verification & Testing Plan

1. **Unit Tests (`tests/play.test.ts`, `tests/dice-notation.test.ts`, `tests/dice-sidebar.test.ts`):**
   - Test regex parser for valid notations (`2d4`, `3d6`, `d20`, `2d6+4`, `1d12-2`).
   - Test rejection of invalid notations (`2d7`, `0d6`, `25d20`, `abc`).
   - Test integration with `game.rollDice`.
   - Verify durable trusted author roles and legacy offline badges without exposing private session data.
   - Verify natural 1/20 badges use individual d20 faces, including mixed rolls; modifiers or other dice do not trigger them.
2. **E2E Tests (`tests/e2e/dice.spec.ts` and existing `tests/e2e/tavern.spec.ts`):**
   - Verify GM and player rolling via the new right sidebar.
   - Verify roll history displays nickname, formula, and total.
   - Verify toggle behavior of right sidebar on desktop and mobile viewports.
   - Verify exact server faces/totals, all six quick buttons, validation errors, disabled offline controls, history restoration, concurrent rolls, and the 20-record cap.
   - Verify mobile autofocus, Tab/Shift+Tab containment, focus return, backdrop/close/Escape dismissal, 979/980px boundary, and landscape controls.
   - Verify independent animation settlement, no snapshot/reopen replay, immediate reduced-motion results, and bounded desktop scrolling.

## 6. Completed verification

Verified on 2026-10-04:

| Command                | Result                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm test`             | 31 unit/domain/persistence/Socket.io/rendering tests passed, zero failures                                |
| `npm run test:e2e`     | 10 Chromium browser tests passed, including four dedicated dice workflows and all existing tabletop flows |
| `npm run lint`         | Exit 0, no findings                                                                                       |
| `npm run typecheck`    | Exit 0                                                                                                    |
| `npm run format:check` | All matched files formatted, exit 0                                                                       |
| `npm run build`        | Production build compiled and generated all routes, exit 0                                                |
| `git diff --check`     | No whitespace errors                                                                                      |

The new tests were observed failing before implementation. The browser review also reproduced and corrected drawer autofocus/Tab wrapping, page overflow from uncontained screen-reader messages, and settle-animation replay on reopening. The concurrency workflow sends 22 real GM/player rolls, verifies authoritative results and the last-20 cap, and checks that scrolling stays in the sidebar. Browser checks cover 375px portrait, 740px landscape, the 979/980px breakpoint, and 1280px desktop. Screenshots are saved in ignored `artifacts/dice-desktop.png` and `artifacts/dice-mobile.png`.

No new dependencies, private session exposure, request-protocol break, or storage migration was introduced. The existing server-side d100 contract remains supported; the new notation/quick-roll UI intentionally implements the six dice specified in this plan. Live MongoDB testing remains optional and was not part of this change; durable local persistence and the shared existing storage contract are covered by the suite.
