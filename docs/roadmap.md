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

## Phase 6: Guided class onboarding & party archetype visual presence — implemented

- [x] Card-based visual presentation of GM-defined classes with attribute modifier highlights, lore, and narrative traits.
- [x] Guided two-step onboarding flow for players entering the table: Step 1 (Class & Subclass Archetype) → Step 2 (Adventurer Appearance & Pixel Art).
- [x] Subclass selection chips and quick-spec cards for specialization choices under each class.
- [x] Member class and subclass badges in the party sidebar and character HUD.
- [x] Tabbed character customization modal inside the tabletop for seamless appearance editing and class re-speccing.
- [x] Graceful fallback for empty class catalogs, allowing freeform entry when the GM defines no classes.

Detailed specifications and implementation plan: [class selection & onboarding plan](class_selection_plan.md).

## Phase 7: Large map editor ergonomics & floating HUD overlay — implemented

- [x] Persistent camera zoom and pan coordinates when toggling tools (Paint, Pan, Move) on large grids (e.g. 64×64).
- [x] Floating terrain palette (`.brush-dock`) bottom overlay with backdrop blur to eliminate canvas resizing during terrain painting.
- [x] Fluid right-click hold-and-drag panning during Paint mode (and all editing tools) without manual tool switching.
- [x] Non-intrusive floating top HUD overlays: mode switcher, player token info ("Select a player to move"), and GM scene controls ("Players can move freely", spawn point) hovering directly over the canvas with pass-through clicks.
- [x] Window and dice-sidebar resizes preserve zoom and the world point at the viewport center; zero-sized layouts preserve initialized state.
- [x] Scene changes fit the new scene; initial/explicit Fit accounts for actual visible overlay bounds.
- [x] Right-drag leaves painting, fog, spawn, token selection, and movement untouched; ordinary left input still works.
- [x] Buttons stay interactive while HUD labels and toolbar gaps pass through to painting and token dragging.
- [x] Mobile toolbar/palette stay within the workspace at 760px, 600px, and 390px, with reachable terrain, zoom, and dice controls.
- [x] Mobile movement hints remain readable without overlapping zoom or direction controls.
- [x] Domain/integration and browser suites, type checking, lint, formatting, and production build pass.

Detailed specifications and implementation plan: [map editor UX plan](map_editor_ux_plan.md).

Phases 6 and 7 were completed in order. Final verification passes all 49 domain/integration tests and 20 browser tests, TypeScript, lint, formatting, and production build. Dedicated regressions cover 64×64 camera persistence, overlay clearance/pass-through, right-drag with no game mutations, scene refitting, and mobile controls/hints.

## Phase 8: Character health (HP) & GM management — implemented

- [x] Shared base health (`DEFAULT_BASE_HP = 20`) for all adventurer characters upon creation.
- [x] Class and subclass health modifiers (`healthModifier`, e.g. +4 for Warrior, +6 for Barbarian, -2 for Mage) adjusting maximum HP.
- [x] Authoritative GM controls to adjust/override current HP and maximum HP bonus for any character in real time.
- [x] Player controls to adjust their own current HP (taking damage or healing up to effective maximum HP).
- [x] Real-time Socket.io synchronization (`health:update` and `health:updated`) with persistent storage across sessions and server restarts.
- [x] Visual HP representations: token health bars on the 2D canvas, party list health badges with quick adjustment popovers, and floating HUD status.
- [x] Class manager UI integration allowing the GM to configure class and subclass health modifiers with bounds validation (-100 to +100).
- [x] Guided onboarding and class card integration displaying health bonuses and calculated maximum HP.

Detailed specifications and implementation plan: [health system plan](health_system_plan.md).

Phase 8 verification passes all 60 domain/integration tests and 23 browser tests, TypeScript, lint, formatting, and production build. Health regressions cover bounds, persisted GM/player authority, room isolation, concurrent deltas, failed writes, legacy migration, catalog changes, durable reconnect/restart, canvas proportions/colors/KO, class previews, modal focus restoration, and mobile reduced-motion controls. Live MongoDB integration was not run because `MONGODB_TEST_URI` was not configured.

## Phase 9: Multi-language support (i18n) with next-intl — implemented

- [x] Internationalization framework using `next-intl` for Next.js App Router.
- [x] Support for three initial locales: English (`en`, default), Spanish (`es`), and Brazilian Portuguese (`pt-BR`).
- [x] Cookie and header-based locale detection preserving clean table URLs (`/`, `/room/[code]`) and per-player language autonomy.
- [x] Dedicated accessible language switcher component (`LanguageSwitcher`) in the Hub navigation and Tabletop topbar/sidebar.
- [x] Modular message catalogs (`messages/en.json`, `messages/es.json`, `messages/pt-BR.json`) covering Hub, Tabletop editor, Canvas HUD, Character Creator, Class Manager, Dice Sidebar, and Health systems.
- [x] Localized class presets and terrain tooltips with full backward compatibility for existing rooms, tests, and saves.
- [x] Comprehensive verification suite: catalog parity tests, locale cookie persistence, language switcher interaction, and Playwright e2e specs.

Detailed specifications and implementation plan: [i18n plan](i18n_plan.md).

Phase 9 verification passes all 65 unit/domain/integration tests and 29 browser tests, TypeScript, lint, formatting, and production build. Regressions cover locale negotiation, preference persistence/recovery, localized errors, mobile layouts, independent participant languages, and language changes preserving drafts, camera, private sessions, custom catalog text, authoritative dice results, and health synchronization. Playwright uses one worker to respect the application's shared-IP API rate limit.

## Major Update: World Expansion, Campaigns & Tactical Encounters (Phases 10–13)

### Phase 10: World sprites, categorized tabs & multi-tile POI scene transitions — planned

- [ ] Categorized terrain palette using shadcn/ui Tabs (`@radix-ui/react-tabs`) in `.brush-dock` with keyboard navigation and dark-fantasy styling.
- [ ] World / Overworld tab: procedurally rendered Snow Mountains (glacial peaks) and Sand Mountains (desert dunes).
- [ ] Overworld 3×3 Points of Interest (POIs) inspired by _Chrono Trigger_ (Walled Town, Dark Cave/Dungeon, Fortress/Castle, Ancient Arcane Shrine).
- [ ] City tab: 1×1 urban cobblestone, canal water, 2×2 timber houses, forge/shops, and 1×1 props (lampposts with warm halo, barrels/crates, fountains, wells).
- [ ] Dungeon tab: 1×1 dark flagstones, damp earth, lava/acid hazards, mossy dungeon walls, iron prison bars, reinforced doors, and props (scattered skeleton remains, wall torches, chests, sacrificial altar).
- [ ] Identified 4th tab — Interiors & Tavern: hardwood floors, timber walls, 2×2 tavern bar counters, banquet feast tables, hearth fireplaces, and inn beds.
- [ ] Multi-tile (2×2 and 3×3) anchor-tile footprint data model, brush hover preview, and Canvas 2D composite pixel-art rendering.
- [ ] Authoritative Group Travel Prompt: stepping on a POI entrance triggers a party-wide modal vote with 30s timeout, entrance debounce, and strictly enforced consensus gate (majority of active players vote YES and GM approves).
- [ ] Scene transition relocates all party members synchronously to the destination scene's spawn point using Tavern's deterministic `spawnCharacters` and `firstFreeTile`.

Detailed specifications and implementation plan: [world sprites & POI plan](world_sprites_and_poi_plan.md).

### Phase 11: Campaign lifecycle management (GM deletion & player removal) — planned

- [ ] Browser `localStorage` session management enhancements (`forgetTable`, `hasSavedSession`).
- [ ] GM campaign deletion: destructive server-side purge of room, panels, sessions, and rolls using native `GameService.mutate` across FileStore (`store.json`) and MongoStore without store-layer transaction fragility.
- [ ] High-stakes confirmation guardrails in Hub and Tabletop (requiring room code or keyword confirmation before enabling delete).
- [ ] Real-time `room:destroyed` Socket.io broadcast disconnecting participants and redirecting them to the Hub with an informative toast.
- [ ] Player campaign removal: "Sair da Mesa" / "Remover" action detaching saved browser credentials, clearing active `session.token` to free map collision, and returning to the Hub without affecting the server room.
- [ ] Headless `DELETE /api/rooms/:code` HTTP endpoint with GM cryptographic token verification.

Detailed specifications and implementation plan: [campaign lifecycle plan](campaign_lifecycle_plan.md).

### Phase 12: Monster creation, bestiary & summoning — planned

- [ ] Built-in classic RPG monster bestiary with 8 presets (Giant Bat, Bandit Outlaw, Putrid Zombie, Skeleton Warrior, Acid Slime, Giant Spider, Goblin Raider, Young Red Dragon).
- [ ] Custom monster creator for the GM: canonical attribute modifiers (`forca`, `destreza`, `constituicao`, `inteligencia`, `sabedoria`, `carisma`), custom names, HP values, attack notations, and custom 32×32 PNG sprites.
- [ ] Three-tier monster HP visibility (`HpVisibility`): `gm_only` (hidden from players), `bar_only` (colored health bar without numbers), and `public` (full numbers and bar) with real-time GM toggle on active tokens.
- [ ] Server-side HP redaction in public snapshots and socket broadcasts to prevent client-side network metagaming.
- [ ] Movement collision blocking in `walkable()` and `moveToken()` against active monsters (`currentHp > 0`).
- [ ] Distinct Canvas 2D token rendering: pointed crimson indicator ring and skull indicator on defeat (0 HP).
- [ ] Dedicated GM Bestiary drawer and token click popover for real-time monster HP adjustments and combat launch.

Detailed specifications and implementation plan: [monster system plan](monster_system_plan.md).

### Phase 13: Classic turn-based combat view & arena scene transition — planned

- [ ] Opt-in GM trigger from map monster popover to enter Combat View without forcing rigid combat during casual roleplay.
- [ ] Synchronized retro scene transition animation ("The Battle Wipe"): dramatic shutter/iris closure (~800ms) with `prefers-reduced-motion` cross-fade fallback.
- [ ] Classic side-view combat arena: party heroes lined up on the Left with portraits/HP bars; summoned monster on the Right with scaled sprite.
- [ ] Thematic battle backdrops dynamically derived from the active scene's dominant terrain (Forest, Dungeon, Snow, Desert).
- [ ] Round-by-round authoritative d20 initiative (+ DES modifier) generating a visible top turn-order tracker with round counters.
- [ ] Default class attacks for the 4 core classes (Warrior, Mage, Barbarian, Archer) stored on `CharacterClass.defaultAttack`, fully editable by the GM in Class Manager.
- [ ] Default 1d12 monster attack damage (customizable by GM) with explicit GM target selection for which living adventurer the monster attacks.
- [ ] Combat resolution (victory fanfare or tactical retreat) with smooth reverse transition back to the 2D map canvas preserving HP state.

Detailed specifications and implementation plan: [combat view system plan](combat_view_system_plan.md).

## Operational follow-ups

- [ ] GM recovery or role transfer.
- [x] Session lifecycle and campaign cleanup (addressed in Phase 11 plan).
- [ ] Transactional MongoDB writes and interrupted-write recovery.
- [ ] Incremental persistence and scalable room loading.
- [ ] Multi-process coordination and deployment automation.

## Out of scope

- Complex accounts, passwords, OAuth, email verification.
- Full automated RPG rulebook simulation (hundreds of spells, heavy feat engines); freeform GM adjudication remains central.
- Equipment, inventory, weapons, and armor systems (deferred to future phases).
- Built-in voice/video; use your preferred communication app.
