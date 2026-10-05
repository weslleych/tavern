# Phases 10–13 execution checklist

Scope: the four plans linked by `roadmap.md`, implemented in roadmap order.

## Reconciliation

- The server method is `GameService.paint`, and HTTP routes belong in `src/server/http.ts`.
- Travel always requires a strict majority of online players AND GM approval. There is no unilateral override. A changed electorate cancels the vote; newly connected players participate in the next vote. Votes expire after 30 seconds and are not resumed after a server restart.
- Relocation uses existing Manhattan-distance, row-major tie-breaking spawns, rather than adding a conflicting BFS algorithm.
- Inspection uses the Move tool or keyboard-accessible scene lists; right-drag continues to pan.
- Structure metadata is additive in version 1 map exports. Imports validate complete footprints, regenerate IDs, and clear destination links belonging to the source room.
- Explicit player departure marks the seat departed, clears its token, and revokes reconnect access so later edits cannot respawn a forgotten seat. Hub removal remains browser-local.
- Monster definitions belong to the room; instances belong to scenes. Public panel and combat types explicitly model redacted health. Hidden definitions and numeric monster attributes are GM-only.
- Combat uses damage rolls (no armor/to-hit engine), automatic turn advancement, and a basic attack fallback. Presets retain the bestiary's thematic attack formulas; new custom monsters default to `1d12`. Reconnect restores the encounter without replaying its entry animation.

## Checklist

- [x] 10.1 Accessible categorized palette and keyboard selection.
- [x] 10.2 All terrain/prop sprites, composite structures, bounded preview.
- [x] 10.3 Atomic footprints, linking/templates, deletion protection, import/export.
- [x] 10.4 Authoritative entrance trigger, consensus/veto/expiry/debounce, relocation.
- [x] 10.5 Domain, socket, browser regressions.
- [x] 11.1 Saved-session helpers, Hub actions, accessible confirmations.
- [x] 11.2 Durable cascade deletion and departure/collision cleanup.
- [x] 11.3 Socket teardown, HTTP deletion, offline missing-room cleanup.
- [x] 11.4 Tabletop management actions and notifications.
- [x] 11.5 Lifecycle security/persistence/browser regressions.
- [x] 12.1 Monster types, eight presets, bounded schemas.
- [x] 12.2 Authoritative catalog, summon/move/health/visibility/remove, privacy/fog.
- [x] 12.3 Personalized socket synchronization and reconnect.
- [x] 12.4 Procedural/custom sprites, hostile ring, bars/defeat, GM drag.
- [x] 12.5 Bestiary, custom editor, inspection controls.
- [x] 12.6 Privacy, authorization, restart, browser regressions.
- [x] 13.1 Attack types, presets, validation, class editor.
- [x] 13.2 Initiative, deterministic ties, rounds, attacks, health, dice log.
- [x] 13.3 Authorized sockets, reconnect and encounter lifecycle.
- [x] 13.4 Wipe, reduced motion, terrain arena, responsive battlers/ribbon.
- [x] 13.5 Action docks, GM targets, effects, victory/retreat/return.
- [x] 13.6 Combat security/domain/socket/browser regressions.
- [x] Final full tests, browsers, typecheck, lint, formatting, build, diff audit.

## Verification evidence

- `npm test`: 86 unit/domain/socket integration tests pass, including failed-save isolation, cascade deletion, travel majority/veto/expiry, monster privacy/collision/restart, initiative ordering, trusted damage and KO handling.
- `npx playwright test`: all 36 browser tests pass, including the seven new expansion workflows and the 29 existing regressions. Coverage includes category keyboard navigation, POI template linking/travel, active and offline lifecycle cleanup, custom PNG monsters, low-zoom dragging, private health, mobile arena widths (375/600/760), reduced motion, reconnect, attacks and victory.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run build` pass with exit code 0. The production build includes all three app routes. Final `git diff --check` is clean and the changed/new-file inventory matches these four plans.
- Live MongoDB integration is optional and was not run because `MONGODB_TEST_URI` is not configured. Both stores retain the shared serialized mutation contract; MongoDB interrupted-write recovery remains an operational follow-up.
