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

## MVP features

- Create a table as its GM, join by code or invite, and return from the same browser.
- Create and rename up to 30 scenes; switch the whole party between them.
- Paint seven terrain types, erase, and mark blocked tiles on configurable 5–64 column/row maps.
- Pan, zoom, fit, and paint with mouse, touch, or keyboard.
- Start with an empty canvas or a generated woodland clearing.
- See live party presence, confirmed map edits, and automatic reconnect.
- Retain the GM role after refresh and server restart.
- Persist with MongoDB or local storage; export/import scenes as versioned JSON.
- Use responsive layouts, native dialogs, visible focus, and reduced-motion support.

Private session credentials live in browser local storage. **Keep the GM's browser data:** clearing it removes GM access. Invites grant player access; they never share the GM credential. There are no accounts or recovery flow in this MVP.

## Controls

| Action         | Control                                           |
| -------------- | ------------------------------------------------- |
| Paint          | Click or drag; `B` selects the brush              |
| Select terrain | `1`–`7`                                           |
| Pan            | Hand tool (`H`), Alt-drag, or middle-button drag  |
| Zoom           | Scroll, `+` / `−`, or viewport buttons            |
| Keyboard paint | Focus the canvas, use arrows, then Enter or Space |

Only the GM edits maps and chooses scenes. Blocking is map metadata for future tokens.

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

Read [setup](docs/setup.md), [architecture](docs/architecture.md), [data models](docs/data-models.md), and [roadmap](docs/roadmap.md). Tokens, dice, and fog of war are future work.

Released under the [project license](LICENSE).
