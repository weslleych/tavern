# Data models

Canonical definitions: [game types](../src/types/game.ts), [store contracts](../src/server/store.ts), and [Zod validation](../src/lib/validation.ts).

Application IDs are UUID strings; timestamps are ISO 8601 strings. MongoDB's additional `_id` is excluded when loading domain objects.

## Records

| Record / collection    | Fields                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Room` / `rooms`       | `id`, unique `code`, `name`, `gmId`, `activePanelId`, optional `rolls`, optional `playersCanMove`, `createdAt`, `updatedAt` |
| `Panel` / `panels`     | `id`, `roomId`, `name`, `order`, `grid`, sparse `tiles`, optional `fog`, optional `spawnPoint`, `updatedAt`                 |
| `Session` / `sessions` | `id`, `roomId`, `nickname`, `role`, `tokenHash`, optional `character`, optional `token`                                     |

Rooms own many panels/sessions. `gmId` identifies the creator's session. `activePanelId` selects the whole party's scene. Membership persists; online presence comes from live sockets. Player sessions persist character appearance and map token positions per room. The GM has neither; old GM character/token fields are removed on load. `Room.playersCanMove` defaults to true when absent. `Panel.spawnPoint` is an optional in-bounds `{ x, y }` preference controlled by the GM.

MongoDB indexes room `code` uniquely, panel `{ roomId, order }`, and session `id` uniquely. Local storage writes `{ rooms, panels, sessions }` with the same records. Neither storage source is exposed to browsers.

## Tiles and limits

```typescript
type Terrain =
  | 'empty'
  | 'grass'
  | 'forest'
  | 'water'
  | 'mountain'
  | 'stone'
  | 'wall'
  | 'sand'
  | 'snow'
  | 'flowers';
type Tile = { x: number; y: number; terrain: Terrain; blocked: boolean; sprite?: string };
type Grid = { cols: number; rows: number; tileSize: 32 };
```

Coordinates start at zero; grid axes have 5–64 tiles. Out-of-bounds input is rejected. Default empty/passable tiles are omitted; painting that state erases a stored tile. Coordinates are unique, and imports reject duplicates. Movement requires non-empty terrain and `blocked: false`; terrain names do not override the flag. Occupied destinations are rejected.

An optional sprite is an inline `data:image/png;base64,...` string, capped at 8,192 characters. Validation checks PNG signature, dimensions (1–128 on each axis), and complete image-data/end chunks. The browser normalizes uploads to 32×32 with interpolation disabled; no remote URLs or SVG are accepted. Sprite painting replaces the previous tile's sprite, and normal terrain painting clears it.

Limits: 30 scenes/table, 100 issued sessions/table, 1–60 trimmed characters per room/scene name, and 1–24 per nickname. Codes use `TVRN-` plus six uppercase letters/digits.

## Characters and tokens

Characters are configured per room upon first joining, inspired by _Stardew Valley_ modular sprites. See [character system](characters.md).

```typescript
type CharacterAppearance = {
  skinColor: string; // Hex code from approved palette
  hairStyle: number; // Style index (0..9)
  hairColor: string; // Hex code
  shirtStyle: number; // Style index (0..7)
  shirtColor: string; // Hex code
  pantsColor: string; // Hex code
};

type PlayerToken = {
  x: number;
  y: number;
  panelId: string;
};

type Member = {
  id: string;
  nickname: string;
  role: 'gm' | 'player';
  character?: CharacterAppearance;
  token?: PlayerToken;
};
```

Tokens spawn on the non-empty, unblocked, unoccupied tile nearest `Panel.spawnPoint` by Manhattan distance, with row-major ties. Without a preference, choose the first valid tile in row-major order. If none exists, the saved character has no token until terrain is available. All saved player sessions reserve positions, including offline ones. Scene activation respawns characters; appearance edits preserve valid positions. Player requests move exactly one adjacent tile and require room movement permission. The GM may target a room player via `MoveRequest.memberId` and reposition them without adjacency, fog or player-lock restrictions; collisions and occupancy still apply. Ordinary refusals return `code: "MOVE_REJECTED"` for silent handling. See [characters](characters.md).

## Visibility and dice

`Panel.fog` is optional `{ enabled: boolean, revealed: string[] }`; missing fog means disabled. Keys use `"x,y"`. GM-only mutations accept at most 64 bounded coordinates. Player snapshots omit hidden tiles/sprites and other hidden token positions; the player's own token is retained. Scene summaries never contain tile or fog arrays.

`Room.rolls` optionally stores the last 20 `DiceRoll` records: `id`, `memberId`, `nickname`, `sides`, `count`, `modifier`, `values`, `total`, and `createdAt`. Missing history means no rolls. Faces are generated on the server, rather than accepted from the client. Existing records without characters, tokens, fog, or history need no migration.

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

A snapshot includes the room without `gmId`, ordered panel summaries without inactive tiles/fog, a personalized active panel and online members, the recipient's current public identity, and dice `rolls`. Private bearer tokens/hashes never enter shared state; public character token positions obey visibility rules.

## Map export, version 1

```json
{
  "version": 1,
  "name": "Forest crossing",
  "grid": { "cols": 12, "rows": 10, "tileSize": 32 },
  "tiles": [{ "x": 3, "y": 4, "terrain": "forest", "blocked": true }]
}
```

Exports contain maps only, including optional inline tile sprites. Fog, characters, credentials, and dice history are excluded. Import validates version, names, terrain, sprites, bounds, duplicates, and at most 4,096 tiles, then creates and activates a **new scene**. File limit: 512 KB; repeated custom sprites can increase an export beyond that import limit. It never overwrites a scene or restores a private session.

Mutations match the combined `(x, y)` key. MongoDB persistence replaces changed documents by application `id`, rather than using independent coordinate array filters. See [architecture](architecture.md) for transaction and single-process limits.
