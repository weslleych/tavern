# Project roadmap & scope

Tavern gives friends a simple way to play tabletop RPGs over a classic pixel-art world. Story and rules stay with the party.

## Phase 1: foundations and editor — implemented

- [x] Next.js App Router, strict TypeScript, ESLint, Tailwind.
- [x] Create/join hub, invite links, browser-local recent tables.
- [x] GM/player layout, scene sidebar, creation, rename, switching.
- [x] Configurable bounded Canvas 2D grid and original procedural terrain.
- [x] Paint, erase, blocking metadata, collision overlay.
- [x] Pan, zoom, fit, keyboard painting, touch, responsive layouts.

## Phase 2: authoritative synchronization — implemented

- [x] Socket.io on the shared Node server.
- [x] Isolated room channels and authenticated private sessions.
- [x] Server-side GM checks, validated paint, confirmed broadcasts.
- [x] Scene synchronization across the party.
- [x] Live presence, automatic reconnect, GM retention after refresh.
- [x] Input limits and tests for forged access and invalid coordinates.

## Phase 3: persistence and portability — implemented

- [x] MongoDB rooms, panels, and hashed sessions.
- [x] Durable local file store for zero-configuration use.
- [x] Persistence before acknowledgement.
- [x] Versioned JSON map import/export.
- [x] Domain, persistence, Socket.io, and browser workflow checks.
- [x] Documentation matching the running application.

The original MVP covers phases 1–3; phase 4 adds playable characters and shared table tools. Hosting requires one persistent Node process; see [architecture](architecture.md).

## Phase 4: richer play — implemented

### Original scope

- [x] Per-room character creation (Stardew Valley inspired original modular pixel art: skin, hair, shirt, pants; see [characters](characters.md)).
- [x] First-visit character onboarding and editable portraits; the accepted follow-up makes onboarding player-only.
- [x] Deterministic spawning on free terrain; wait safely when none exists. The accepted follow-up adds a per-scene preference.
- [x] Keyboard (WASD & Arrow keys), adjacent clicks, one-step token drops, and touch movement with server collision checks.
- [x] Shared dice overlay with server-generated rolls and persistent room history.
- [x] GM-controlled per-scene fog with server-side hidden-data filtering.
- [x] Sand, snow, flowers, and optional bounded PNG tile sprites.
- [x] Scene ordering, duplication, removal with GM checks and one-scene minimum.

### Accepted follow-up after the initial implementation

- [x] GM coordinates without a character/token; player-only onboarding and cleanup of legacy GM tokens.
- [x] GM allows or pauses player movement for the room; movement remains enabled by default.
- [x] GM selects and repositions players by click or drag, including while player movement is paused.
- [x] GM defines a preferred spawn per scene; nearest free walkable tile with deterministic ties and row-major fallback.
- [x] Ordinary movement refusals stay silent; actionable failures remain visible.
- [x] shadcn/Radix Select throughout forms, including native modal dialogs.

The six-item maintainer request extended or corrected the original phase 4 scope. Its context, rationale, defaults, compatibility, and boundaries are preserved in [ADR 0001](adr/0001-phase-4-gm-coordination.md), indexed in [decision records](adr/README.md).

Current validation and implementation decisions: [phase 4 plan](character_system_plan.md). Domain and Socket.io tests cover permissions, persistence, collision, visibility, reconnect, and scene lifecycle. Browser checks cover GM/player workflows, sprite rendering, keyboard fog, and mobile controls. Live MongoDB integration requires `MONGODB_TEST_URI`; it was not configured for this implementation's verification.

### Dice system & table log evolution — implemented

- [x] Dedicated right sidebar for persistent dice log and party roll history (desktop docked, mobile drawer).
- [x] Standard RPG dice notation parser (`XdY`, `XdY±Z` for d4, d6, d8, d10, d12, d20) and quick-roll buttons.
- [x] Visual mini-animation for dice rolling with result settle.

Detailed technical specifications and architecture: [validated dice system plan](dice_system_plan.md). Validation covers trusted GM/player badges, exact shared results, notation limits, concurrent rolls, the 20-record cap, desktop/mobile controls, focus, reconnect, reduced motion, and history without animation replay. All 31 unit/integration tests and 10 browser tests pass, along with lint, TypeScript, formatting, and production build.

## Phase 5: Classes, attributes & dice integration — implemented

- [x] Room-scoped default classes (Warrior, Mage, Barbarian, Archer) initialized on room creation, with full GM edit/delete/create controls.
- [x] Core attribute modifiers (STR, DEX, CON, INT, WIS, CHA) and buff/debuff traits per class.
- [x] Subclasses per class extending and complementing attributes, buffs, and debuffs, editable by the GM.
- [x] Player character creator & sheet integration: choose class and subclass with dynamic attribute totals and active traits.
- [x] Attribute-based dice rolls: 1-click test rolls (e.g. 1d20 + modifier) with automatic sum calculation and shared party log attribution.

Detailed specifications and verification: [attribute system plan](attribute_system_plan.md). GM catalog editing works before creation and during play; deleted selections are cleared without losing appearance or token position. Attribute bonuses and labels are derived by the server, and history retains the bonus originally applied. All 48 unit/integration tests and 14 browser tests pass, along with lint, TypeScript, formatting, and production build. Live MongoDB integration remains an optional check requiring `MONGODB_TEST_URI`, which was not configured for this verification.

## Operational follow-ups

- [ ] GM recovery or role transfer.
- [ ] Session lifecycle and room archival.
- [ ] Transactional MongoDB writes and interrupted-write recovery.
- [ ] Incremental persistence and scalable room loading.
- [ ] Multi-process coordination and deployment automation.

## Out of scope

- Complex accounts, passwords, OAuth, email verification.
- Embedded RPG rules or automated combat/stat/spell mechanics.
- Equipment, inventory, weapons, and armor systems (deferred to future phases).
- Built-in voice/video; use your preferred communication app.
