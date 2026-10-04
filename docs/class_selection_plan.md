# Class Selection & Player Onboarding Plan — Architecture & Specifications

This plan defines the architecture, data flow, UI components, and technical specifications for the guided, card-based class selection and player onboarding experience in Tavern.

Status: implemented and verified (October 2026).

## Execution checklist and reconciliation

- [x] Accessible class cards with modifier badges, narrative traits, and specialization chips.
- [x] Two-step onboarding with preserved choices, keyboard navigation, and an empty-catalog bypass.
- [x] Appearance/class editing tabs and optional freeform selection.
- [x] Current catalog class/subclass titles in party rows and player HUD, including live edits/deletions.
- [x] Helper unit tests and browser coverage for onboarding, editing, mobile, and empty catalogs.
- [x] Tests, type checking, lint, formatting, browser suite, and production build verified; roadmap/documentation updated.

The existing server already validates and persists optional class selections and clears deleted IDs. Keep that contract and expose a “No class” card; subclasses also remain optional. Use native radios inside labeled radio groups for built-in keyboard behavior. Update ordinary onboarding helpers in the dice and tabletop browser suites for the new appearance step. No data migration or server change is needed.

---

## 1. Overview & Principles

1. **Class Choice as Hero Onboarding:**
   - In RPGs, choosing an archetype/class is a defining moment for a player.
   - When entering a table, players should be introduced directly to the world archetypes configured by the Game Master (GM), rather than finding a class dropdown hidden beneath appearance options.
2. **Card-Based Visual Archetypes:**
   - Replace the narrow select dropdowns with rich, interactive archetype cards showing class name, description, attribute modifier highlights (e.g., `+2 STR`, `+1 CON`), and narrative traits (buffs/debuffs).
   - Once a class is selected, its specializations (subclasses) are presented as interactive chips/cards.
3. **Two-Step Onboarding Flow:**
   - **Step 1: Choose Archetype & Specialization**: Visual exploration and selection of the GM's class catalog.
   - **Step 2: Customize Appearance**: Modular 16×16 pixel art portrait customization (skin tone, hair style/color, clothing style/color).
   - Seamless navigation back and forth before entering the tabletop.
4. **Party Visibility & Social Identity:**
   - Display player class and subclass titles in the table's party list (`.party-section`) and in the player's HUD (`.character-hud`).
   - Allow party members and the GM to understand the party's composition at a glance.
5. **Editing Flexibility:**
   - When editing an existing character from inside the tabletop modal (`editing: true`), provide clean tabbed switching between "Appearance" and "Class & Specialization".
6. **Graceful Fallbacks:**
   - If a table has an explicitly empty class catalog (`classes.length === 0`), gracefully bypass the archetype step or indicate freeform character mode.

---

## 2. Workspace & Codebase Audit

- **Affected Files:**
  - `src/components/character-creator.tsx`: refactored into a step-based onboarding workflow (Step 1: Class selection cards; Step 2: Appearance customization) and tabbed editing view.
  - `src/components/class-picker.tsx`: native radio card groups, shared definition details, and specialization choices, extracted to keep appearance controls focused.
  - `src/components/class-summary.tsx`: enhanced attribute modifiers display (green badge for positive, subtle for negative) and trait highlights.
  - `src/components/classes.css`: styles for class cards grid (`.class-cards-grid`, `.class-card`, `.class-card-selected`), subclass chips, step progress bar, and mobile layout.
  - `src/components/tabletop.tsx`: display member class/subclass in party list (`.party-section`) and player HUD (`.character-hud`).
  - `src/lib/classes.ts`: helper functions for resolving and formatting member class badges.
  - `tests/classes.test.ts`: unit tests for helper functions.
  - `tests/e2e/classes.spec.ts`: Playwright tests covering card selection, multi-step navigation, and party list badges.

---

## 3. Implementation Phases

### Phase 1: Card-Based Class Selection UI

- Implement `ClassCard` / card grid in `character-creator.tsx` with accessible radio group semantics (`role="radiogroup"`, `role="radio"`, `aria-checked`).
- Render name, description, key attribute modifier badges, and trait tags on each card.
- Render subclass chips for the chosen class.
- Style cards with hover, focus-visible, and active/selected states adhering to Tavern's retro fantasy aesthetic.

### Phase 2: Guided Onboarding Flow

- Split `CharacterCreator` in non-editing mode (`!editing`) into a 2-step stepper:
  - Step 1: "Choose your Archetype" (Class & Subclass).
  - Step 2: "Meet your Adventurer" (Appearance & Colors).
- Add "Next: Appearance" and "Back to Classes" navigation controls.
- For editing mode (`editing: true`), offer tab navigation between "Appearance" and "Class & Specialization".

### Phase 3: Tabletop Party & HUD Integration

- In `tabletop.tsx`, inspect `member.character?.classId` and resolve the class and subclass names from `snapshot.room.classes`.
- Render the class title below the player nickname in `.party-section` (e.g., `Guerreiro · Guardião`).
- Render the class tag in `.character-hud` next to player coordinates.

### Phase 4: Automated Testing & Verification

- Update `tests/e2e/classes.spec.ts` for step navigation and card interactions.
- Ensure all unit, integration, and linting checks pass cleanly.

---

## 4. Verification Gates

- Full test suite: `npm test`
- Type checking: `npm run typecheck`
- Linter: `npm run lint`
- Browser E2E suite: `npm run test:e2e -- --workers=1`
- Production build: `npm run build`

## Verification evidence

The class-selection milestone passed all 49 domain/integration tests and 15 browser tests, plus type checking, lint, formatting, and production build. After the subsequent map-editor plan, the combined suite passes all 49 domain/integration tests and 20 browser tests with the same quality gates. Browser coverage includes preserved appearance across steps/tabs, keyboard radio/tab navigation, live title renames/deletions, optional classes/specializations, and empty catalogs. Desktop and 390px onboarding screenshots were inspected (`artifacts/class-onboarding-desktop.png` and `artifacts/class-onboarding-mobile.png`).
