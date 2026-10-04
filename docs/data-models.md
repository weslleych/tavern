# Data models

Canonical definitions: [game types](../src/types/game.ts), [store contracts](../src/server/store.ts), and [Zod validation](../src/lib/validation.ts).

Application IDs are UUID strings; timestamps are ISO 8601 strings. MongoDB's additional `_id` is excluded when loading domain objects.

## Records

| Record / collection    | Fields                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| `Room` / `rooms`       | `id`, unique `code`, `name`, `gmId`, `activePanelId`, `createdAt`, `updatedAt` |
| `Panel` / `panels`     | `id`, `roomId`, `name`, `order`, `grid`, sparse `tiles`, `updatedAt`           |
| `Session` / `sessions` | `id`, `roomId`, `nickname`, `role`, `tokenHash`                                |

Rooms own many panels/sessions. `gmId` identifies the creator's session. `activePanelId` selects the whole party's scene. Membership persists; online presence comes from live sockets.

MongoDB indexes room `code` uniquely, panel `{ roomId, order }`, and session `id` uniquely. Local storage writes `{ rooms, panels, sessions }` with the same records. Neither storage source is exposed to browsers.

## Tiles and limits

```typescript
type Terrain = 'empty' | 'grass' | 'forest' | 'water' | 'mountain' | 'stone' | 'wall';
type Tile = { x: number; y: number; terrain: Terrain; blocked: boolean };
type Grid = { cols: number; rows: number; tileSize: 32 };
```

Coordinates start at zero; grid axes have 5–64 tiles. Out-of-bounds input is rejected. Default empty/passable tiles are omitted; painting that state erases a stored tile. Coordinates are unique, and imports reject duplicates. Blocking is collision metadata; movement comes with future tokens.

Limits: 30 scenes/table, 100 issued sessions/table, 1–60 trimmed characters per room/scene name, and 1–24 per nickname. Codes use `TVRN-` plus six uppercase letters/digits.

## Credentials and shared state

Create/join returns a credential once:

```typescript
type Credential = {
  roomCode: string;
  memberId: string;
  token: string; // 64 hexadecimal characters; private bearer secret
  nickname: string;
  role: 'gm' | 'player';
};
```

The server trusts the stored session rather than a supplied role/nickname, and hashes tokens before persistence. Browser key `tavern:tables:v1` holds up to 20 recent tables with private credentials, display name, and visit time. Never include this data in invites or map exports.

A snapshot includes the room without `gmId`, ordered panel summaries without inactive tiles, the active panel, online members, and the recipient's public identity. Tokens/hashes never enter shared state.

## Map export, version 1

```json
{
  "version": 1,
  "name": "Forest crossing",
  "grid": { "cols": 12, "rows": 10, "tileSize": 32 },
  "tiles": [{ "x": 3, "y": 4, "terrain": "forest", "blocked": true }]
}
```

Exports contain maps only. Import validates version, names, terrain, bounds, duplicates, and at most 4,096 tiles, then creates and activates a **new scene**. File limit: 512 KB. It never overwrites a scene or restores a private session.

Mutations match the combined `(x, y)` key. MongoDB persistence replaces changed documents by application `id`, rather than using independent coordinate array filters. See [architecture](architecture.md) for transaction and single-process limits.
