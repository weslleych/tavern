# Plan: Monster Creation, Bestiary & Summoning System

This plan defines the architecture, data models, canvas rendering, GM summoning tools, and health visibility mechanics for creating and deploying monsters in Tavern. It provides a built-in bestiary of classic fantasy RPG adversaries, full attribute customization for the Game Master (GM), custom/preset pixel-art sprites, and selective health visibility to balance narrative suspense with tactical gameplay.

Status: Planned (Phase 12).

---

## 1. Overview & Design Philosophy

### 1.1 The Role of Monsters in Tabletop & Retro RPGs

In tabletop RPGs (such as _Dungeons & Dragons_, _Tormenta_, and _Pathfinder_) as well as classic turn-based JRPGs (_Dragon Quest_, _Final Fantasy_, _Chrono Trigger_), adversaries have fundamentally different lifecycles and permissions from player characters:

- **Player Characters**: Persistent, player-owned, tied to authenticated sessions, customized via modular portraits, with full public attribute sheets and health values.
- **Monsters**: Ephemeral, GM-owned, scene-bound entities. The GM can summon individual bosses, spawn minion packs, modify stats on the fly, reposition them across obstacles, and remove or slay them when defeated.

### 1.2 The Health Transparency Dilemma: Metagaming vs. Suspense

In real tabletop play, GMs rarely tell players: _"The Orc has exactly 4 out of 19 HP remaining."_ Doing so encourages mathematical optimization (metagaming) rather than immersive narrative decisions. Instead, GMs describe physical trauma (_"He is bleeding heavily and staggering"_).
However, some tables prefer full tactical transparency or quick visual cues. Tavern resolves this by introducing **Three-Tier Health Visibility (`HpVisibility`)**:

1. **`gm_only` (Oculta dos Jogadores)**:
   - Only the GM sees the monster's health bar and numeric values (`14 / 20 HP`).
   - Players see no health bar and no numbers above the monster token.
   - Ideal for mystery encounters, horror campaigns, and narrative-first tables.
2. **`bar_only` (Apenas Barra Visual)**:
   - Players see a proportional colored bar (Green >50%, Amber 25–50%, Red <25%) above the token, but **no raw numbers**.
   - Standard across modern VTTs (Roll20, Foundry VTT): gives players a sense of monster condition without exposing exact mathematical thresholds.
3. **`public` (Totalmente Pública)**:
   - Players see the health bar and exact numbers (`14 / 20 HP`), exactly like fellow adventurers.
   - Ideal for casual, heroic, or board-game style play.

---

## 2. Classic Pre-Defined Bestiary (Presets)

Tavern provides a built-in catalog of classic RPG adversaries ready for immediate summoning during live sessions without requiring manual data entry:

| Monster Slug | Name (pt-BR / en)                      | Sprite Description                                              | Key Attributes (STR, DEX, CON, INT, WIS, CHA)          | Base HP | Default Attack               | Default Visibility |
| :----------- | :------------------------------------- | :-------------------------------------------------------------- | :----------------------------------------------------- | :------ | :--------------------------- | :----------------- |
| `bat`        | Morcego Gigante / Giant Bat            | Black & crimson winged beast with glowing red eyes              | `FOR: -2, DES: +3, CON: 0, INT: -4, SAB: +1, CAR: -3`  | 8 HP    | `1d4+3` (Mordida)            | `bar_only`         |
| `bandit`     | Ladrão / Bandit Outlaw                 | Hooded humanoid with leather armor and twin daggers             | `FOR: +1, DES: +3, CON: +1, INT: +1, SAB: 0, CAR: +1`  | 16 HP   | `1d6+3` (Apunhalada)         | `bar_only`         |
| `zombie`     | Zumbi Pútrido / Putrid Zombie          | Shambling undead with decaying greenish flesh and tattered rags | `FOR: +3, DES: -2, CON: +4, INT: -4, SAB: -2, CAR: -3` | 22 HP   | `1d8+3` (Pancada Decomposta) | `gm_only`          |
| `skeleton`   | Esqueleto Guerreiro / Skeleton         | Bleached bone warrior wielding rusty blade and notched shield   | `FOR: +2, DES: +2, CON: +2, INT: -2, SAB: 0, CAR: -2`  | 14 HP   | `1d8+2` (Corte de Espada)    | `bar_only`         |
| `slime`      | Gosma Ácida / Acid Slime               | Translucent emerald gelatinous blob with dissolving core        | `FOR: 0, DES: 0, CON: +3, INT: -5, SAB: -3, CAR: -5`   | 12 HP   | `1d6` (Jato Ácido)           | `bar_only`         |
| `spider`     | Aranha Gigante / Giant Spider          | Eight-legged black arachnid with venomous dripping fangs        | `FOR: +2, DES: +3, CON: +1, INT: -4, SAB: +1, CAR: -3` | 18 HP   | `1d8+3` (Picada Venenosa)    | `gm_only`          |
| `goblin`     | Goblin Saqueador / Goblin Raider       | Cunning green-skinned scout with jagged dagger and pointed ears | `FOR: -1, DES: +3, CON: +1, INT: 0, SAB: 0, CAR: -1`   | 10 HP   | `1d6+2` (Golpe Furtivo)      | `bar_only`         |
| `dragon`     | Dragão Jovem / Young Red Dragon (Boss) | Majestic scaled crimson wyrm with horned crest and fiery breath | `FOR: +5, DES: +1, CON: +4, INT: +2, SAB: +2, CAR: +3` | 65 HP   | `2d10+5` (Sopro de Fogo)     | `public`           |

---

## 3. Data Models & Schemas

### 3.1 Domain Types (`src/types/game.ts`)

```typescript
export type HpVisibility = 'gm_only' | 'bar_only' | 'public';

export interface MonsterDefinition {
  id: string; // Unique slug or UUID
  name: string; // Display name (e.g. "Esqueleto Guerreiro")
  sprite: string; // Built-in slug or data:image/png;base64,... (32×32)
  attributes: AttributeModifiers; // Canonical Tavern attributes: forca, destreza, constituicao, inteligencia, sabedoria, carisma
  defaultMaxHp: number; // e.g. 14
  attackNotation: string; // e.g. "1d12" or "1d8+2"
  hpVisibility: HpVisibility;
  isCustom?: boolean; // True if created by the GM
}

export interface MonsterInstance {
  id: string; // UUID of this summoned instance on the scene
  panelId: string; // Scene where this monster is located
  definitionId: string; // Reference to MonsterDefinition
  name: string; // Instanced name (e.g. "Esqueleto 1", "Esqueleto 2")
  x: number; // Grid X coordinate
  y: number; // Grid Y coordinate
  currentHp: number; // Current health points
  maxHp: number; // Effective max health
  gmBonusHp?: number; // GM manual bonus
  hpVisibility: HpVisibility;
  sprite: string;
  attributes: AttributeModifiers;
  attackNotation: string;
}

// Scene panel extension
export interface Panel {
  id: string;
  roomId: string;
  name: string;
  order: number;
  grid: Grid;
  tiles: Tile[];
  fog?: Fog;
  spawnPoint?: { x: number; y: number } | null;
  monsters?: MonsterInstance[]; // Instanced monsters in this scene
  updatedAt: string;
}
```

### 3.2 Zod Validation Schemas (`src/lib/validation.ts`)

```typescript
export const hpVisibilitySchema = z.enum(['gm_only', 'bar_only', 'public']);

export const monsterDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  sprite: z.string().min(1).max(8192),
  attributes: z.record(attributeIdSchema, z.number().int().min(-100).max(100)),
  defaultMaxHp: z.number().int().min(1).max(9999),
  attackNotation: z.string().trim().min(1).max(30),
  hpVisibility: hpVisibilitySchema,
  isCustom: z.boolean().optional(),
});

export const summonMonsterSchema = z.object({
  panelId: z.string().uuid(),
  definitionId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60).optional(),
  x: z.number().int().min(0).max(63),
  y: z.number().int().min(0).max(63),
  customOverrides: z
    .object({
      maxHp: z.number().int().min(1).max(9999).optional(),
      attributes: z.record(attributeIdSchema, z.number().int().min(-100).max(100)).optional(),
      hpVisibility: hpVisibilitySchema.optional(),
      attackNotation: z.string().trim().min(1).max(30).optional(),
    })
    .optional(),
});

export const setMonsterVisibilitySchema = z.object({
  panelId: z.string().uuid(),
  monsterId: z.string().uuid(),
  hpVisibility: hpVisibilitySchema,
});

export const adjustMonsterHpSchema = z
  .object({
    monsterId: z.string().uuid(),
    panelId: z.string().uuid(),
    current: z.number().int().min(0).max(9999).optional(),
    delta: z.number().int().min(-9999).max(9999).optional(),
  })
  .refine(
    (data) => data.current !== undefined || data.delta !== undefined,
    'Provide an HP change.',
  );
```

---

## 4. Architecture & Technical Mechanics

### 4.1 Server-Side Health Redaction & Snapshot Privacy

To guarantee that players cannot inspect browser network traffic to read hidden monster HP values:

- In `GameService.snapshotFor(actor, room)`:
  - If `actor.role === 'gm'`: Full monster data is transmitted (`currentHp`, `maxHp`, `attributes`, `hpVisibility`).
  - If `actor.role === 'player'`:
    - For each monster in the active scene:
      - If `monster.hpVisibility === 'gm_only'`: `currentHp`, `maxHp`, and `healthRatio` are completely omitted (`undefined`).
      - If `monster.hpVisibility === 'bar_only'`: The server transmits only `healthRatio: Math.max(0, Math.min(1, currentHp / maxHp))`. Raw `currentHp` and `maxHp` are redacted.
      - If `monster.hpVisibility === 'public'`: Transmits full `currentHp`, `maxHp`, and `healthRatio`.
- Real-time broadcasts (`monster:hp_updated`, `monster:visibility_updated`):
  - Emitted with distinct payloads to GM socket vs. player sockets, preventing any client-side network leakage.
- **Live GM Visibility Toggle**:
  - The GM can toggle visibility on any summoned monster at any time via `monster:set_visibility`. The server authoritatively updates `monster.hpVisibility` and broadcasts the redacted snapshot update.

### 4.2 Token Rendering on Canvas 2D

In `src/components/canvas/map-canvas.tsx`:

1. **Distinct Visual Footprint**:
   - Adventurers have round wooden bases. Monsters have a **pointed crimson angular ring** (`#dc2626`) beneath their sprite to instantly communicate hostile status at a glance.
2. **Sprite Drawing**:
   - Supports both built-in modular monster pixel art (procedural routines in `src/components/canvas/monster-render.ts`) and loaded PNG sprite images.
3. **Health Bar Rendering**:
   - **For GM**: Always renders the health bar with numeric text overlay (`14/20`).
   - **For Players**:
     - `gm_only`: Nothing rendered above the monster token.
     - `bar_only`: Renders the 24×3px bar filled to `healthRatio` with dynamic color (Green > 0.5, Amber 0.25–0.5, Red < 0.25). No numbers.
     - `public`: Renders both bar and text.
4. **Defeated State (0 HP)**:
   - When a monster's health reaches 0, a skull indicator (`💀`) renders over the token, and its opacity dims to 50% until the GM removes or cleans it up.
5. **GM Token Popover & Context Actions**:
   - Clicking a monster token opens an inspection popover for the GM:
     - Health step buttons (`-1`, `+1`, `-5`, `+5`).
     - Manual HP value input.
     - Visibility toggle segmented control (`Oculto (gm_only)` | `Barra (bar_only)` | `Público (public)`).
     - Action button: **"Iniciar Visão de Luta"** (launches tactical Combat View).
     - Action button: **"Remover Monstro"** (destroys the summoned instance).

### 4.3 GM Bestiary & Summoning Drawer

In `src/components/tabletop.tsx`:

- A dedicated GM toolbar button opens the **Bestiary Drawer (`.bestiary-drawer`)**:
  - **Preset Tab**: Grid of cards for the 8 classic presets with pixel art previews, HP, and stats.
  - **Custom Tab**: Form for creating a new custom monster:
    - Name and custom sprite selector / PNG file dropper.
    - Six canonical attribute modifier steppers (`forca`, `destreza`, `constituicao`, `inteligencia`, `sabedoria`, `carisma`).
    - Max HP input and Default Attack notation (default `1d12`).
    - Radio group for `HpVisibility` (`gm_only`, `bar_only`, `public`).
  - **Summon Action**:
    - Clicking "Summon / Invocar" enters placement mode.
    - Clicking on any non-blocked, unoccupied map tile summons the monster with an authoritative broadcast.

---

## 5. Security & Permission Rules

1. **GM Exclusivity**:
   - Only the authenticated GM (`actor.role === 'gm'`) can summon, edit attributes, reposition, or delete monsters.
   - Any player attempt to emit `monster:summon`, `monster:move`, `monster:adjust_hp`, or `monster:set_visibility` is rejected with `UNAUTHORIZED`.
2. **Occupancy & Collision**:
   - Active monsters (`currentHp > 0`) occupy their tile (`x, y`) on `panel.monsters`.
   - `GameService.moveToken` and `walkable()` enforce that player tokens cannot walk onto tiles occupied by alive monsters:
     ```typescript
     const monsterOccupied = panel.monsters?.some(
       (m) => m.currentHp > 0 && m.x === request.x && m.y === request.y,
     );
     if (monsterOccupied) throw new MoveRejected('That tile is occupied by an adversary.');
     ```
   - Defeated monsters (`currentHp === 0`) allow passage over their tile or can be cleansed by the GM.
3. **Fog of War Integration**:
   - Monsters positioned on fog-covered tiles are filtered out on the server and never sent to player clients until revealed by the GM.
4. **Scene Panel Lifecycle**:
   - Monsters are persisted inside `Panel.monsters`. When duplicating a scene (`panel:duplicate`), monsters are cloned with new UUIDs. When removing a scene (`panel:remove`), monster records are cleaned up with the scene.

## 6. Implementation Phases & Steps

### Phase 12.1: Types, Presets & Zod Schemas

- [ ] Define `MonsterDefinition`, `MonsterInstance`, and `HpVisibility` in `src/types/game.ts`.
- [ ] Create `defaultMonsters` preset catalog in `src/lib/monsters.ts`.
- [ ] Add Zod schemas in `src/lib/validation.ts`.
- [ ] Write unit tests for schema validation and attribute bounds.

### Phase 12.2: Server GameService & Authoritative Storage

- [ ] Extend `Panel` in `src/server/store.ts` to persist `monsters?: MonsterInstance[]`.
- [ ] Implement `summonMonster`, `moveMonster`, `adjustMonsterHp`, and `removeMonster` in `GameService`.
- [ ] Implement server-side snapshot redaction based on `HpVisibility`.

### Phase 12.3: Socket Gateway & Client State Hook

- [ ] Add gateway handlers for `monster:summon`, `monster:move`, `monster:adjust_hp`, and `monster:remove`.
- [ ] Add personalized broadcasts ensuring player clients never receive redacted data.
- [ ] Update `use-room.ts` to manage active monsters in the scene.

### Phase 12.4: Canvas 2D Token Rendering & Visuals

- [ ] Implement procedural pixel-art routines for the 8 classic monster presets in `monster-render.ts`.
- [ ] Implement monster token drawing in `map-canvas.tsx` with crimson indicator ring and conditional health bars.
- [ ] Add drag-and-drop repositioning for GM on monster tokens.

### Phase 12.5: GM Bestiary Drawer & Custom Monster Modal

- [ ] Create `BestiaryDrawer` component in `src/components/bestiary-drawer.tsx`.
- [ ] Create `MonsterFormModal` for creating/editing custom monsters and toggling HP visibility.
- [ ] Add quick HP adjustment popover for the GM when clicking a monster token on the map.

### Phase 12.6: Automated Testing & Regressions

- [ ] Unit tests for privacy filtering (verifying players never receive raw HP for `gm_only` or `bar_only`).
- [ ] Integration tests verifying GM-only authorization and persistence across server restarts.
- [ ] Playwright E2E tests:
  - GM summons a monster with `bar_only`.
  - Player view shows only the colored bar without numbers.
  - GM damages monster -> bar updates smoothly on both screens without leaking numeric HP to player console/network.

---

## 7. Verification Gates

1. **Unit & Domain Tests**: `npm test` passes all tests cleanly.
2. **Type Checking**: `npm run typecheck` zero errors.
3. **Linter**: `npm run lint` passes without warnings.
4. **Browser E2E Suite**: `npx playwright test tests/e2e/monster-system.spec.ts` passes.
5. **Production Build**: `npm run build` succeeds.
