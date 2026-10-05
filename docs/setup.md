# Setup & development

## Start

Install Node.js **22.12+**, then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a table and send the invite link to a friend. The creator becomes GM; people joining through a code are players. Use an incognito window to test both roles.

Returning in the same browser restores the private session. Clearing the creator's browser storage loses GM access. Map exports back up scenes, not session access.

The default starting map creates Verdant Reach, a 40×40 overworld with forest, snowy highlands, desert, a river and connected roads. Its four landmarks lead to Willowbrook village, Emberdeep Caverns, Frostwatch Keep and Moonwell Shrine. The village also links to The Lantern Tavern. Every destination has a furnished map, a clear arrival point and a linked return route. The caverns include three monsters for optional GM encounters. Travel uses the usual player vote and GM approval. Blank campaigns and existing saved tables keep their maps; the woodland clearing remains available when adding individual scenes.

Choose English, Português, or Español in the Hub or table language select. On mobile tables, open the scene sidebar to reach it. Each browser keeps its own preference; changing language does not change the party's shared names, maps, or game state. Without a saved choice, Tavern uses a supported browser language or falls back to English. The preference cookie is `NEXT_LOCALE`, with a one-year lifetime, and `tavern:locale:v1` in local storage can recover a missing cookie.

For world travel, choose a landmark from the World palette and stamp it. Click it with Move, right-click it, or open its sidebar actions to link an existing scene, create a linked town/dungeon, or unlink a destination. Keyboard users can open sidebar actions with Enter and navigate the menu with arrows. Creating a destination asks for a name and links a new 32×32 scene while keeping the current map open. A player entering the southern entrance opens a 30-second vote; a strict player majority and GM approval move the whole party.

For combat, open the labeled GM Bestiary, select Summon and choose a free tile. Open the monster's actions with Move + click, right-click on the map, or its name in the sidebar. The GM can enter Combat View, apply 1 or 5 damage, heal 1 or 5 HP, or restore full HP directly from the menu. Inspect monster opens the complete HP, privacy, position and removal controls. Defeated monsters cannot start combat, and health actions disable at their bounds. Each online, conscious participant must select Roll initiative before turns unlock; the server rolls 1d20 plus their persisted Dexterity modifier. The monster rolls automatically. The checklist counts only online participants. Offline players do not block initiative; disconnecting during the wait recalculates readiness. Reconnecting players retain any initiative already rolled. Players without an initial roll join the next encounter if turns have already started. The active hero uses their class attack; on monster turns the GM selects a conscious target and confirms a damage formula. Initiative is rolled once at the start of each encounter. Later rounds repeat the same saved turn order, skipping KO or departed participants without rerolling. A new encounter requests new initiative. Victory, defeat and retreat preserve HP when returning to the map. New custom monster PNGs are normalized to 32×32 and must fit the bounded sprite payload.

Campaign actions are available in the tabletop and saved-table cards. Deletion requires typing the room code and permanently purges every scene and seat. Leaving an active player seat revokes that credential and frees its token; removing a Hub card only forgets the browser entry. Offline deleted campaigns are removed when reopened.

## Configuration

Copy `.env.example` to `.env.local` when changing defaults. This file is ignored by Git.

| Variable           | Default                 | Purpose                                                             |
| ------------------ | ----------------------- | ------------------------------------------------------------------- |
| `PORT`             | `3000`                  | HTTP and Socket.io port                                             |
| `HOSTNAME`         | `0.0.0.0`               | Bind address; use `127.0.0.1` for local-only access                 |
| `MONGODB_URI`      | empty                   | Enables MongoDB when provided                                       |
| `MONGODB_DB`       | `tavern`                | MongoDB database name                                               |
| `TAVERN_DATA_FILE` | `.tavern/store.json`    | Local data file when MongoDB is not configured                      |
| `APP_ORIGIN`       | `http://<request host>` | Allowed browser origin; set to the public URL behind an HTTPS proxy |

Without MongoDB, the store saves through a temporary file and atomic rename. Keep `.tavern/` writable and back up `store.json`. MongoDB uses separate room, panel, and session collections. A configured database must connect at startup; a connection failure does not silently switch storage. Changing modes does not migrate data.

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=tavern
```

`GET /api/health` reports readiness and the storage mode. Listening starts after the store loads.

## Commands

| Command                                   | Purpose                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                             | Watch the custom server and hot-reload Next.js pages             |
| `npm run build`                           | Production build                                                 |
| `npm start`                               | Production custom server; build first                            |
| `npm run lint`                            | ESLint and React/Next.js rules                                   |
| `npm run typecheck`                       | Strict TypeScript validation                                     |
| `npm run format` / `npm run format:check` | Format source and documentation / check formatting               |
| `npm test`                                | Domain, permission, persistence, and Socket.io integration tests |
| `npm run test:e2e`                        | Browser workflows with independent GM/player contexts            |

Install the browser once with `npx playwright install chromium`. Browser tests launch a development server at `127.0.0.1:3100`, using isolated `.tavern/e2e.json` data. Stop other development servers first: Next.js permits one development instance per working directory. Tests do not overwrite `.tavern/store.json`.

The browser suite uses one worker because its independent contexts share one server/IP and the API's 40 requests/minute allowance. Increasing worker concurrency can produce legitimate HTTP 429 responses; the application rate limit stays enabled during tests.

To check the MongoDB adapter against a real test instance, set `MONGODB_TEST_URI` and run `npm run test:mongodb`. This creates and removes a uniquely named temporary database; it never touches the application's database. The normal test suite requires no database or binary downloads.

Dependency audit: runtime dependencies have no reported vulnerabilities. The development dependency chain for Next.js's ESLint plugin has five high audit findings from the unpatched [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). They concern deeply nested glob patterns in development tooling; application inputs do not pass through this dependency. Recheck when an upstream fix is released. The suggested forced fix downgrades the Next.js ESLint configuration to version 14, so it is not applied to this Next.js 16 project.

## Production

```bash
npm ci
npm run build
npm start
```

Use one persistent Node process, HTTPS, and a proxy that forwards WebSocket upgrades. Set `APP_ORIGIN` to the public origin and retain the working directory/data volume across restarts. Use the npm scripts rather than `next start`. Static exports, Vercel's serverless runtime, and multiple instances are incompatible with this MVP architecture. `tsx` is a runtime dependency because the custom server runs TypeScript.

Use `npm run dev` while editing the interface. For a local production preview, stop `npm start` before running a new `npm run build`, then start it again. A running production server retains the previous build's asset references; replacing that build without restarting can leave CSS and JavaScript requests pointing to files that no longer exist.

See [architecture](architecture.md) for cached state, serialized writes, MongoDB transaction limits, and session recovery boundaries.

## Layout

```text
server.ts         Custom HTTP, Next.js, and Socket.io entry point
src/app/          Pages, metadata, and styles
src/components/   Hub, tabletop, dialogs, Canvas 2D renderer
src/lib/          Validation, terrain, browser sessions, room connection
src/server/       Game service, API, gateway, persistence stores
src/types/        Shared domain and socket event types
tests/            Domain and integration tests
tests/e2e/        Playwright workflows
docs/             Architecture, models, setup, roadmap
```
