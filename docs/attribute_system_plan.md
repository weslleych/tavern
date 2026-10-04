# Attribute & Class System Plan — Architecture & Specifications

This plan defines the architecture, data flow, domain models, and technical specifications for the GM-configurable class and subclass system, core attributes, buffs/debuffs, and attribute-based dice rolls in Tavern.

Status: implemented and verified on 2026-10-04.

---

## 1. Scope & Principles

1. **Room-Scoped Class Management:**
   - Every room initializes with a predefined set of default classes: **Guerreiro (Warrior)**, **Mago (Mage)**, **Bárbaro (Barbarian)**, and **Arqueiro (Archer)**.
   - The Game Master (GM) has full authority to edit, add, or remove classes and subclasses during table creation and in the live tabletop.
2. **Attributes, Buffs & Debuffs:**
   - Classes and subclasses specify core attribute modifiers: **Força (STR)**, **Destreza (DEX)**, **Constituição (CON)**, **Inteligência (INT)**, **Sabedoria (WIS)**, and **Carisma (CHA)**.
   - Classes define buffs and debuffs; subclasses complement and extend them.
   - Effective character attributes are computed as the sum of class and subclass modifiers.
3. **Player Onboarding & Customization:**
   - Players select a class and subclass during character creation alongside their appearance.
   - The character creator displays the resulting attribute totals and active trait badges.
4. **Attribute-Based Dice Rolls:**
   - Attributes directly integrate into dice rolling. When rolling an attribute check (e.g. Força test with +2 modifier), the modifier is automatically added to the roll (e.g. `1d20+2 = 17`).
   - The shared party dice log labels the roll with the test name and applied attribute bonus.
5. **Equipment Explicitly Out of Scope:**
   - No inventory, weapon, armor, or item mechanics are included in this phase.

---

## 2. Domain Models & Data Structures

```typescript
export type AttributeId =
  'forca' | 'destreza' | 'constituicao' | 'inteligencia' | 'sabedoria' | 'carisma';

export interface AttributeDefinition {
  id: AttributeId;
  name: string;
  abbreviation: string;
}

export interface CharacterTrait {
  id: string;
  name: string;
  description: string;
}

export interface CharacterSubclass {
  id: string;
  name: string;
  description: string;
  attributes: Record<AttributeId, number>;
  buffs: CharacterTrait[];
  debuffs: CharacterTrait[];
}

export interface CharacterClass {
  id: string;
  name: string;
  description: string;
  attributes: Record<AttributeId, number>;
  buffs: CharacterTrait[];
  debuffs: CharacterTrait[];
  subclasses: CharacterSubclass[];
}
```

- **Room Extension:** `Room.classes: CharacterClass[]` persisted durably in `store.json` and MongoDB.
- **Session/Member Extension:** `CharacterAppearance` extended with optional `classId?: string` and `subclassId?: string`.
- **Dice Extension:** `DiceRequest` and `DiceRoll` extended with optional `attribute?: AttributeId` and `label?: string`.

---

## 3. Implementation Phases

### Reality check and implementation decisions (2026-10-04)

- At intake, the existing dice notation, persistent log, appearance editor, modal, and Radix Select were available, alongside three prepared helper tests; the class implementation was absent. These existing components are reused.
- Attribute IDs are the six Portuguese keys, with a complete typed modifier record. Modifiers are integers from -100 to +100 per class/subclass. Effective values are their sum; traits are descriptive and do not add hidden modifiers.
- IDs are bounded slugs, unique within each class catalog, subclass list, and trait list. Catalogs allow up to 16 classes, 8 subclasses/class, and 8 buffs/debuffs per definition; the serialized catalog is capped at 24 KB. HTTP requests are capped at 32 KB.
- Creation accepts an optional configured catalog. Missing catalogs in old rooms initialize with independent default copies on load; an explicitly empty catalog stays empty. Legacy characters may remain without a class; subclass selection is optional and always belongs to the chosen class.
- GM catalog updates clear deleted class/subclass references for all room players, including offline players, preserving appearance and tokens. Existing dice history retains the bonus used when rolled.
- Attribute checks require a player's valid class, one d20, and a known attribute. The server derives the modifier and canonical test label from current persisted selections, overriding client-supplied bonuses/labels. Ordinary dice requests remain compatible.
- Browser verification covers creation-time editing, player selections/totals/traits, live GM edits, shared rolls, reconnect, empty catalogs, keyboard dialogs, and mobile layout. Current architecture/data-model documentation and the roadmap are updated.

### Phase 1: Domain Models, Presets & Validation

- [x] Add `src/lib/classes.ts` with standard attribute definitions, default classes (Warrior, Mage, Barbarian, Archer), and pure attribute calculation helpers.
- [x] Extend `src/types/game.ts` and `src/lib/validation.ts` with Zod schemas for traits, subclasses, classes, character updates, and dice requests.

### Phase 2: Authoritative Server & Socket Synchronization

- [x] Initialize `room.classes` on room creation in `GameService.create()`.
- [x] Implement `GameService.updateClasses()` with GM-only validation, durable persistence, and broadcast in snapshot.
- [x] Extend `GameService.updateCharacter()` to validate chosen `classId` and `subclassId`.
- [x] Extend `GameService.rollDice()` to persist and broadcast `attribute` and `label`.
- [x] Register `room:classes` in `src/server/gateway.ts` and expose in `src/lib/use-room.ts`.
- [x] Adjust `src/server/http.ts` payload limits to 32 KB.

### Phase 3: Player UI & Attribute Dice Rolling

- [x] Update `CharacterCreator` (`src/components/character-creator.tsx`) with Class and Subclass selectors and attribute summary card.
- [x] Update `DiceSidebar` (`src/components/dice-sidebar.tsx`) with 1-click attribute test buttons (`1d20 + modifier`) and test label formatting in `RollCard`.

### Phase 4: GM Table Creation & Class Management

- [x] Add class selection preview in table creation (`src/components/hub.tsx`).
- [x] Create `ClassManager` modal component (`src/components/class-manager.tsx`) allowing the GM to add, edit, and delete classes, subclasses, attributes, buffs, and debuffs.
- [x] Integrate `ClassManager` into `Tabletop` navigation for the GM.

---

## 4. Verification Gates

- Unit and integration tests in `tests/classes.test.ts`.
- Full suite passing: `npm test`.
- Strict typing: `npm run typecheck`.
- Linting and formatting: `npm run lint` and `npm run format:check`.
- Production build: `npm run build`.

### Verification results

| Gate                                                                                                                               | Evidence                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Domain, validation, creation, GM permissions, selection cleanup, trusted attribute bonuses, history and failed writes              | `tests/classes.test.ts`; all 48 tests pass with `npm test`                                      |
| HTTP creation and size limits                                                                                                      | `tests/classes-http.test.ts`: valid catalogs above 8 KB accepted; requests above 32 KB rejected |
| Room isolation, live catalog/selection updates, shared authoritative rolls and reconnect                                           | `tests/realtime.test.ts`                                                                        |
| Creation-time editor, class/subclass/trait CRUD, validation, cancel, player sheet, live dice, keyboard selection and mobile layout | `tests/e2e/classes.spec.ts`; all 14 browser tests pass with `npm run test:e2e -- --workers=1`   |
| Strict typing                                                                                                                      | `npm run typecheck`: exit 0                                                                     |
| Lint and formatting                                                                                                                | `npm run lint` and `npm run format:check`: exit 0, no lint warnings                             |
| Production build                                                                                                                   | `npm run build`: exit 0                                                                         |
| Change review                                                                                                                      | `git diff --check`: exit 0; source, tests and current documentation reviewed                    |

FileStore restart checks exercise durable catalogs, character selections, cleanup and roll metadata. MongoStore continues to replace complete room/session records, so these fields use the existing persistence contract without a new collection. Live MongoDB integration is optional and was not run because `MONGODB_TEST_URI` was not configured.

Browser screenshots reviewed: `artifacts/classes-desktop.png`, `artifacts/classes-mobile.png`, and `artifacts/attributes-mobile.png`. The dynamic catalog selector ignores transient invalid values from Radix's hidden native select when adding/removing options; the CRUD browser test covers this regression.
