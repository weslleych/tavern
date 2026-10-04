---
status: accepted
recorded: 2026-10-04
---

# ADR 0001: Extend phase 4 with GM coordination and player movement controls

The initial phase 4 implementation followed the roadmap and character system plan. A subsequent maintainer request clarified that the game master coordinates play without a character and added movement permissions, player repositioning, preferred spawn points, and interface improvements. We accepted these as a follow-up to phase 4, preserving the server's authority over positions and collisions.

## Original scope and change origin

The initial roadmap covered collision-aware player tokens, a dice overlay, GM-controlled fog, additional terrain/custom sprites, and scene ordering, duplication, and removal. The character proposal expanded the token work into per-room appearance customization, a first-visit creator, deterministic spawning, editable portraits, and keyboard/pointer movement.

The first implementation also applied the character gate to the GM, gave every participant their own token, spawned on the first free tile, and limited movement to the participant's own adjacent tile. These are the historical assumptions changed by this record. The room movement switch, GM-targeted movement, preferred spawn configuration, silent refusals, and shadcn selects were added after that initial scope.

Source: the maintainer's six-item follow-up request in the implementation conversation. This record captures the request and implementation choices so future readers do not need that conversation. The [implementation plan](../character_system_plan.md) describes the current combined scope; the [roadmap](../roadmap.md) distinguishes the original work from the follow-up.

## Accepted follow-up

| Request                                       | Decision                                                                                                                                                                                                                       | Reason                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. GM coordinates without a character         | Only player sessions have appearances and map tokens. The GM opens the tabletop directly and retains a role avatar in the navigation and party list.                                                                           | Match the GM's coordination role and avoid reserving a spawn tile for the GM.                                                                              |
| 2. GM decides whether players move freely     | Persist one movement permission for the whole room. It is enabled by default; only the GM can pause or resume it.                                                                                                              | Preserve existing tables' movement behavior and give the GM a simple control over pacing. Per-player and per-scene permissions are outside this increment. |
| 3. GM can move players                        | The GM selects a player in the party or on the map, then clicks a destination or drags the token. GM moves may cross any distance and ignore player movement permission and fog.                                               | Allow deliberate placement during encounters and scene coordination. Players retain one-step movement of their own tokens.                                 |
| 4. GM defines a preferred spawn in each scene | Persist an optional coordinate per scene. Choose the nearest free walkable tile by Manhattan distance, with row-major ties; use the first free tile when no preference exists.                                                 | Honor the marked point while handling occupied, empty, or blocked spawn tiles deterministically without stacking characters.                               |
| 5. Ordinary collision refusals are silent     | Empty, blocked, occupied, hidden, non-adjacent, and paused movement refusals leave the token in place without an alert. Authentication, permission, malformed input, connection, and persistence failures remain visible.      | Repeated ordinary movement attempts should not interrupt play, while actionable failures still need feedback.                                              |
| 6. Replace native selects with shadcn Select  | Use the shadcn/Radix Select for starting maps/scenes, appearance fields, and dice faces, adapted to Tavern's existing visual style. Preserve form values and keyboard controls; portal menus into their nearest native dialog. | Use a consistent component across forms and keep menus accessible inside the modal top layer.                                                              |

## Constraints and compatibility

- The persisted session role and room ownership authorize every mutation on the server. Players cannot bypass a pause, target another member, or gain GM powers by changing client payloads.
- Both player and GM moves require an active scene in the same room and a non-empty, unblocked, unoccupied destination. GM repositioning bypasses adjacency, player fog restrictions, and the room movement pause; it retains collision and occupancy checks.
- A spawn preference can be marked on an in-bounds coordinate before terrain is painted. If no valid free tile exists, keep the appearance saved with no token and retry when terrain becomes available. Offline player sessions continue to reserve their positions.
- Changing or clearing a spawn preference preserves valid current positions and retries waiting players. Activating another scene respawns players near that scene's preference; duplicating a scene copies the preference. Selecting the already active scene preserves positions.
- `Room.playersCanMove` is optional in storage and defaults to `true`; `Panel.spawnPoint` is optional and absent means row-major spawning. Existing records load without adding required fields.
- Legacy GM appearance/token fields are removed from loaded state and omitted from public snapshots/presence. The next successful mutation persists that cleanup. This deliberately retires any previously saved GM character.
- Mutations persist before acknowledgement and publication. Ordinary movement refusals use `MOVE_REJECTED` so the client can suppress only those alerts.
- Map export version 1 keeps its existing map-only contract. Movement permissions and preferred spawn points are not included in exports/imports; persistence and scene duplication retain them where applicable.

## Consequences and supporting interface changes

The GM's character onboarding and self-edit actions disappear. Their movement tool instead selects and repositions players. Players see when the GM pauses movement, and their direction controls are disabled during that pause.

Toolbar and session controls occupy space above the canvas so they do not cover its upper tiles. The terrain palette appears in Paint mode, leaving more map space while coordinating players. Map shortcuts ignore form controls and select menus. These interface choices support the accepted increment; they were not additional features in the original phase 4 scope.

This increment does not add initiative, turn automation, per-player movement permissions, saved positions for every inactive scene, GM recovery/role transfer, or transactional MongoDB writes. Existing operational follow-ups remain on the roadmap.

## Implementation evidence

The behavior is covered by [GM control tests](../../tests/gm-controls.test.ts), [character and play tests](../../tests/play.test.ts), [Socket.io integration tests](../../tests/realtime.test.ts), and [browser workflows](../../tests/e2e/tavern.spec.ts). At the end of implementation, 25 domain/socket tests and six browser tests passed, along with ESLint, TypeScript, formatting, and the production build. Live MongoDB integration was not run because `MONGODB_TEST_URI` was not configured.

Current behavior and contracts are documented in [characters](../characters.md), [architecture](../architecture.md), and [data models](../data-models.md). If these accepted decisions change, add a new numbered ADR referencing this one and mark the affected decision as superseded; preserve this record's original context and rationale.
