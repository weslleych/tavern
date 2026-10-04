# Phase 4 implementation plan — validated and implemented

The phase covers the original scope and accepted follow-up in [roadmap](roadmap.md), using the existing single-process, persistence-before-confirmation architecture. [Characters](characters.md) describes the visual model. This is the current implementation plan; [ADR 0001](adr/0001-phase-4-gm-coordination.md) preserves the scope change, rationale, compatibility decisions, and consequences.

## Scope history

The initial scope was collision-aware player tokens, per-room character customization and onboarding, deterministic free-tile spawning, keyboard/pointer movement, shared dice, GM-controlled fog, additional terrain/custom sprites, and scene ordering, duplication, and removal. Initial implementation assumptions included a character/token for the GM, spawning on the first free tile, and each participant moving only their own token one adjacent tile.

After that implementation, the maintainer requested six follow-up changes: a GM without a character/token, room-wide movement permission controlled by the GM, GM repositioning of players, a preferred spawn point per scene, silent ordinary movement refusals, and shadcn selects. These changes extend or correct the initial scope; the original plan did not already contain all six. They are recorded as accepted in ADR 0001 and tracked separately in the roadmap.

## Current validated decisions

- GameService alone assigns spawn positions and accepts moves. Clients render confirmed state; prediction is deferred to avoid rollback and reconciliation complexity.
- A walkable tile has non-empty terrain and `blocked: false`. Water and walls can be made passable by the GM; terrain names do not override the collision flag.
- Only players have characters and tokens. The GM enters the tabletop directly; old saved GM characters/tokens are discarded when loading.
- Each scene can have a GM-defined preferred spawn coordinate. Choose the free walkable tile with the least Manhattan distance from it, breaking ties in row-major order; without a preferred point, scan in row-major order. Exclude coordinates reserved by other saved players, including offline sessions. If no free tile exists, keep the character saved with no token. Painting terrain retries waiting spawns. Never fall back onto a blocked or empty `(0, 0)`.
- Player keyboard, adjacent clicks, and token drops use the same one-step Manhattan movement contract. The GM can pause/resume player movement for the room (allowed by default) and reposition a selected player at any free walkable tile, even while paused or behind fog. Neither role can stack tokens or move in inactive/foreign scenes. Ordinary refusals are silent in the UI; connection, permission, validation, and persistence errors remain visible.
- On scene activation, respawn room characters in session creation order. Editing appearance preserves a valid position. Painting relocates invalidated tokens and retries waiting characters.
- Read current sessions when producing presence/snapshots; the socket authentication object can become stale after a character edit or scene change.
- Fog is manual, per scene, and GM controlled. The server omits hidden terrain/sprites and other hidden token positions from player snapshots and broadcasts. The player's own token remains available; players cannot enter unrevealed tiles while fog is enabled. GM sees the entire map with a dim overlay.

## Implementation sequence and acceptance

1. Add shared appearance palettes, validation, persisted session characters/tokens, deterministic spawning, collision checks, and tests covering failure to persist and old records without new fields.
2. Wire character/movement socket contracts with fresh, personalized presence and snapshots. Add a player-only mandatory first-visit creator, editable portraits, procedural 16×16 art, GM player selection/repositioning and movement lock, scene spawn controls, and touch direction buttons. Replace native selects with the shadcn/Radix Select, preserving form submission, keyboard navigation and menus inside native dialogs.
3. Add server-generated d4/d6/d8/d10/d12/d20/d100 rolls (1–20 dice, bounded modifier), persist the last 20 per room, and display a shared dice overlay.
4. Add bounded fog reveal/hide strokes and an enable switch. Test hidden-data redaction, foreign room isolation, GM permission checks, and reconnect.
5. Add sand, snow, and flowers plus an optional local PNG brush sprite. Normalize uploads to 32×32; store bounded PNG data on tiles, validate dimensions/signature server-side, and preserve it in map exports/imports. Do not accept remote URLs or SVG.
6. Add scene ordering, duplication, and removal. Retain at least one scene, enforce the 30-scene limit, respawn on activation, and delete removed MongoDB panel documents after saving room pointers.
7. Run domain/socket tests, lint, typecheck, production build, and browser workflows with separate GM/player contexts, including a mobile viewport. Update documentation and roadmap only for verified implemented behavior.

## Compatibility and boundaries

Characters, tokens, fog, dice history, room movement permissions, and per-scene spawn points are optional stored fields, so existing local/MongoDB records load without a destructive migration. Map export version 1 retains its top-level contract; optional tile sprites are portable, while fog and session credentials are excluded. MongoDB remains a single-writer adapter without multi-document transactions; interrupted operations may leave partial disk state, as documented in architecture.

PNG validation also rejects incomplete image chunks. Selecting the already active scene preserves positions. Hidden movement destinations return the same refusal for blocked and passable terrain, avoiding disclosure through collision messages. Ordinary refusals use `MOVE_REJECTED`, which the client handles silently. Preferred spawn changes preserve valid current positions; activation and waiting characters use the new preference. Map imports remain capped at 512 KB, so maps with many repeated inline sprites may exceed the import limit.

## Verification

The implementation was checked with the domain/Socket.io suite, ESLint, strict TypeScript, a production build, and browser workflows with independent seats and desktop/mobile viewports. Browser tests also verify actual custom sprite pixels and fog reveal/hide. Screenshots are written under ignored `artifacts/` for visual review. Live MongoDB checks remain conditional on a configured `MONGODB_TEST_URI`.
