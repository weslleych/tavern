# Data models

Canonical definitions: [game types](../src/types/game.ts), [store contracts](../src/server/store.ts), and [Zod validation](../src/lib/validation.ts).

Room, panel, session, and roll IDs are UUID strings; class/subclass/trait IDs are bounded slugs. Timestamps are ISO 8601 strings. MongoDB's additional `_id` is excluded when loading domain objects.

## Records

| Record / collection    | Fields                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Room` / `rooms`       | `id`, unique `code`, `name`, `gmId`, `activePanelId`, `classes`, optional `rolls`, optional `playersCanMove`, `createdAt`, `updatedAt` |
| `Panel` / `panels`     | `id`, `roomId`, `name`, `order`, `grid`, sparse `tiles`, optional `fog`, optional `spawnPoint`, `updatedAt`                            |
| `Session` / `sessions` | `id`, `roomId`, `nickname`, `role`, `tokenHash`, optional `character`, optional `token`, optional `health`                             |

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
  classId?: string; // Room catalog class ID
  subclassId?: string; // ID within the selected class
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
  health?: CharacterHealth; // Players only; visible to the party
};
```

Tokens spawn on the non-empty, unblocked, unoccupied tile nearest `Panel.spawnPoint` by Manhattan distance, with row-major ties. Without a preference, choose the first valid tile in row-major order. If none exists, the saved character has no token until terrain is available. All saved player sessions reserve positions, including offline ones. Scene activation respawns characters; appearance edits preserve valid positions. Player requests move exactly one adjacent tile and require room movement permission. The GM may target a room player via `MoveRequest.memberId` and reposition them without adjacency, fog or player-lock restrictions; collisions and occupancy still apply. Ordinary refusals return `code: "MOVE_REJECTED"` for silent handling. See [characters](characters.md).

## Classes, attributes and traits

`Room.classes` is a room-scoped `CharacterClass[]`. Classes have `id`, `name`, `description`, six `attributes`, `buffs`, `debuffs`, and `subclasses`. A subclass has the same fields except `subclasses`; traits have `id`, `name`, and `description`. Attribute IDs are `forca`, `destreza`, `constituicao`, `inteligencia`, `sabedoria`, and `carisma` (STR, DEX, CON, INT, WIS, CHA). All six keys are required, with integer modifiers from -100 to +100. A character's effective modifier is the class value plus the optional subclass value; inherited buff/debuff traits are descriptive and do not alter the numbers.

Catalog limits are 16 classes, 8 subclasses per class, and 8 buffs/debuffs per definition, within 24 KB serialized UTF-8. Names are trimmed, non-empty, and at most 60 characters; descriptions are at most 240. IDs are 1–64 ASCII letters, digits, underscores, or hyphens and unique within each catalog, subclass list, or trait list. HTTP creation accepts optional `classes` within its 32 KB request limit. Without them, rooms get independent copies of the four defaults. Legacy missing catalogs receive defaults on load, persisted with the next mutation; an empty list remains empty.

Character class selection is optional for compatibility and empty catalogs. A subclass requires a class and must belong to it in that room. GM catalog replacement clears deleted selections from all room sessions, including offline players, preserving appearance and tokens. Catalogs and selections persist through the same FileStore/MongoStore room and session records; no separate collection is needed.

## Character health

```typescript
type CharacterHealth = {
  current: number;
  max: number;
  gmBonus?: number;
};

type HealthAdjustmentRequest = {
  memberId?: string;
  current?: number;
  delta?: number;
  gmBonus?: number;
};
```

Every unconfigured player session starts at 20/20 HP. On the first character save, current HP fills to the effective maximum, including class/subclass modifiers and any GM bonus. A character with maximum 30 HP therefore starts at 30/30, even while waiting for a free map tile. Later character saves preserve current HP and do not heal. Classes and subclasses have an optional integer `healthModifier` from -100 to +100, defaulting to zero when absent. Effective maximum HP is `max(1, 20 + class modifier + subclass modifier + gmBonus)`. New default catalogs use Guerreiro +4 (Guardião +2, Duelista -1), Mago -2 (Arcanista 0), Bárbaro +6 (Berserker +2), and Arqueiro 0 (Rastreador +1). Existing catalogs without modifiers retain their zero modifiers.

The GM has no health. Legacy player sessions missing health initialize at their selected class/subclass maximum; existing health is retained. Legacy GM health is removed. These load-time migrations persist with the next successful mutation. Character and catalog edits recalculate maximum HP for affected players, including offline members, preserve the GM bonus and current HP, and clamp current HP to the new maximum. Increasing the maximum never heals automatically. Deleting classes/subclasses removes their modifiers without removing the character.

Authenticated `health:update` requests accept either absolute `current` (0–999) or signed `delta` (-999–999), optionally combined with `gmBonus` (-100–100). Values must be integers. Empty requests, unknown fields, invalid member UUIDs, and simultaneous `current`/`delta` are rejected. Players may set only their own current HP; changing the GM bonus is denied even when the supplied bonus is zero. The authenticated room GM must supply `memberId` and may adjust any player in that room, including offline players. GM or cross-room targets are rejected. Current HP always clamps to `[0, max]`.

After persistence succeeds, the acknowledgement returns `CharacterHealth`, and the room receives `health:updated` with `{ memberId, health }`, followed by personalized snapshots/presence. Public members and `snapshot.you` include player health; fog continues to redact token positions while HP remains public to the party. Zero HP displays “KO · Unconscious” and does not change movement permissions or automate combat.

## Visibility and dice

`Panel.fog` is optional `{ enabled: boolean, revealed: string[] }`; missing fog means disabled. Keys use `"x,y"`. GM-only mutations accept at most 64 bounded coordinates. Player snapshots omit hidden tiles/sprites and other hidden token positions; the player's own token is retained. Scene summaries never contain tile or fog arrays.

`Room.rolls` optionally stores the last 20 `DiceRoll` records: `id`, `memberId`, `nickname`, optional `role`, `sides`, `count`, `modifier`, optional `attribute` and `label`, `values`, `total`, and `createdAt`. New rolls record the authenticated session's `gm` or `player` role; legacy snapshots infer it from the author and room creator without exposing `gmId`. Missing history means no rolls. Faces are generated on the server, rather than accepted from the client. Existing records without characters, tokens, fog, history, or roll roles need no migration. The notation UI supports d4/d6/d8/d10/d12/d20; server validation retains d100 compatibility. Counts are 1–20 and modifiers are -1000 to +1000.

Attribute checks require a player with a valid class selection, a known attribute ID, and exactly one d20. The server computes `modifier` from the persisted class/subclass and supplies `label` (for example, `Teste de Força`), overriding client-supplied bonuses and labels. Ordinary rolls may include a trimmed 1–80-character label. The resulting values and bonus are retained in history even after the catalog changes.

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
