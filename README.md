# Tavern

A little world. A great adventure.

A free, open-source virtual tabletop for playing RPGs with friends. Create a table, paint an original pixel-art world, and share a code with your party. Everyone sees the game master's scene live, without accounts or an imposed ruleset.

## Run locally

Requires Node.js **22.12+** and npm.

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). No database setup is needed: maps and session hashes persist in `.tavern/store.json`. Set `MONGODB_URI` in `.env.local` to use MongoDB instead. See [setup](docs/setup.md).

## Features

- Create a table as its GM, join by code or invite, and return from the same browser.
- Create, rename, order, duplicate, and remove scenes; keep 1–30 per table and switch the whole party between them.
- Paint nine terrain types, erase, and mark blocked tiles on configurable 5–64 column/row maps; add optional PNG sprites.
- Pan, zoom, fit, and paint with mouse, touch, or keyboard. Floating map controls preserve the canvas area, and zoom/focus persist across tool changes and resizes.
- Start with an empty canvas or a generated woodland clearing.
- See live party presence, confirmed map edits, and automatic reconnect.
- Retain the GM role after refresh and server restart.
- Persist with MongoDB or local storage; export/import scenes as versioned JSON.
- Use responsive layouts, native dialogs, shadcn/Radix selects, visible focus, and reduced-motion support.
- As a player, create a modular pixel character per table, then edit your appearance from your portrait. The GM coordinates without a character.
- Configure room classes and subclasses as GM during creation or live play; players explore archetype cards, choose a specialization, then customize their appearance. Edit either through character tabs and see party class titles, summed attributes, and descriptive buffs/debuffs.
- Roll one-click attribute checks with server-calculated class/subclass bonuses and labeled results in the shared party log.
- As GM, allow/pause player movement, reposition selected players, and mark a preferred spawn per scene.
- Spawn near the preferred point (first free tile when unset) and move with WASD, arrows, adjacent clicks, token drops, or touch controls; the server enforces collisions.
- Roll shared dice using RPG notation or six quick-roll buttons, with a saved 20-roll sidebar, author badges, individual faces, and a short retro animation. On mobile, open the dice drawer from the toolbar.
- Reveal/hide terrain with GM-controlled fog of war.

Private session credentials live in browser local storage. **Keep the GM's browser data:** clearing it removes GM access. Invites grant player access; they never share the GM credential. There are no accounts or recovery flow in this MVP.

## Controls

| Action         | Control                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Paint          | Click or drag; `B` selects the brush                                                                                 |
| Select terrain | `1`–`9`, then `0` for Flowers                                                                                        |
| Pan            | Hand tool (`H`), Alt-drag, or right-/middle-button drag with any tool                                                |
| Zoom           | Scroll, `+` / `−`, or viewport buttons                                                                               |
| Keyboard paint | Focus the canvas, use arrows, then Enter or Space                                                                    |
| Move character | Move tool (`M`); focused canvas WASD/arrows, adjacent click, one-step token drop, or direction buttons               |
| GM controls    | Lock button allows/pauses players; select a player in the party or on the map, then click/drag to reposition         |
| Spawn          | GM flag tool; click or arrows + Enter to choose a preferred point per scene                                          |
| Fog            | GM toggles fog, then uses Reveal/Hide tools with drag or keyboard painting                                           |
| Dice           | Type `d20`, `2d6+3` or `1d12-2` in the dice log and press Enter, or tap a quick die; toggle the log from the toolbar |

Only the GM edits maps, chooses scenes, and controls fog. Players move their own character one tile at a time when the GM permits it, onto non-empty, unblocked, unoccupied revealed terrain. The GM may reposition players at any distance or behind fog, including while movement is paused. Ordinary collision refusals do not display alerts. Empty or full scenes retain the character with no token until a free tile becomes available.

## Development

```bash
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

Always use the npm scripts: a custom Node server runs Next.js, the HTTP API, and Socket.io together. Hosting requires **one persistent Node process** and writable storage or MongoDB. Serverless hosting and horizontal scaling are outside this MVP.

Read [setup](docs/setup.md), [architecture](docs/architecture.md), [data models](docs/data-models.md), [characters](docs/characters.md), the [validated phase 4 plan](docs/character_system_plan.md), and [roadmap](docs/roadmap.md).

The [decision records](docs/adr/README.md) preserve accepted scope changes and their rationale, starting with the six improvements added after the initial phase 4 implementation.

Released under the [project license](LICENSE).
