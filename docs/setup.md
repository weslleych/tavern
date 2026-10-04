# Setup & development

## Start

Install Node.js **22.12+**, then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a table and send the invite link to a friend. The creator becomes GM; people joining through a code are players. Use an incognito window to test both roles.

Returning in the same browser restores the private session. Clearing the creator's browser storage loses GM access. Map exports back up scenes, not session access.

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
