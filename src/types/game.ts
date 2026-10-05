export const terrains = [
  'empty',
  'grass',
  'forest',
  'water',
  'mountain',
  'stone',
  'wall',
  'sand',
  'snow',
  'flowers',
  'snow_mountain',
  'sand_mountain',
  'cobblestone',
  'stone_pavement',
  'water_canal',
  'dungeon_floor',
  'dungeon_dirt',
  'lava_pool',
  'acid_pool',
  'dungeon_wall',
  'iron_bars',
  'wooden_door_closed',
  'wooden_door_open',
  'skeleton_remains',
  'wall_torch',
  'treasure_chest',
  'treasure_chest_open',
  'sacrificial_altar',
  'lamppost',
  'crates_barrels',
  'fountain',
  'water_well',
  'wood_floor',
  'wood_wall',
  'ornate_rug',
  'stone_fireplace',
  'inn_bed',
  'bookshelf',
  'wood_chair',
] as const;
export type Terrain = (typeof terrains)[number];
export type Role = 'gm' | 'player';
export type AttributeId =
  'forca' | 'destreza' | 'constituicao' | 'inteligencia' | 'sabedoria' | 'carisma';
export type AttributeModifiers = Record<AttributeId, number>;
export interface AttributeDefinition {
  id: AttributeId;
  name: string;
  abbreviation: string;
}
export interface CharacterTrait {
  id: string;
  name: string;
  description: string;
}
export interface CharacterSubclass {
  id: string;
  name: string;
  description: string;
  attributes: AttributeModifiers;
  buffs: CharacterTrait[];
  debuffs: CharacterTrait[];
  healthModifier?: number;
}
export interface CharacterClass extends CharacterSubclass {
  subclasses: CharacterSubclass[];
  defaultAttack?: ClassAttack;
}
export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  blocked: boolean;
  sprite?: string;
  structureId?: string;
  structureRoot?: boolean;
}
export interface CharacterAppearance {
  skinColor: string;
  hairStyle: number;
  hairColor: string;
  shirtStyle: number;
  shirtColor: string;
  pantsColor: string;
  classId?: string;
  subclassId?: string;
}
export interface PlayerToken {
  x: number;
  y: number;
  panelId: string;
}
export interface MoveRequest extends PlayerToken {
  memberId?: string;
}
export interface SpawnRequest {
  panelId: string;
  point: { x: number; y: number } | null;
}
export interface Fog {
  enabled: boolean;
  revealed: string[];
}
export interface FogRequest {
  panelId: string;
  enabled?: boolean;
  revealed?: boolean;
  cells?: { x: number; y: number }[];
}
export interface DiceRequest {
  sides: number;
  count: number;
  modifier: number;
  attribute?: AttributeId;
  label?: string;
}
export interface DiceRoll extends DiceRequest {
  id: string;
  memberId: string;
  nickname: string;
  role?: Role;
  values: number[];
  total: number;
  createdAt: string;
}
export type MapTool = 'paint' | 'pan' | 'move' | 'reveal' | 'hide' | 'spawn' | 'summon';
export interface Grid {
  cols: number;
  rows: number;
  tileSize: number;
}
export interface Panel {
  id: string;
  roomId: string;
  name: string;
  order: number;
  grid: Grid;
  tiles: Tile[];
  fog?: Fog;
  spawnPoint?: { x: number; y: number };
  structures?: StructureAnchor[];
  monsters?: MonsterInstance[];
  updatedAt: string;
}
export interface Room {
  id: string;
  code: string;
  name: string;
  activePanelId: string;
  gmId: string;
  classes: CharacterClass[];
  rolls?: DiceRoll[];
  playersCanMove?: boolean;
  monsterDefinitions?: MonsterDefinition[];
  activeCombat?: ActiveCombatState | null;
  travelVote?: TravelVote | null;
  createdAt: string;
  updatedAt: string;
}
export interface Credential {
  roomCode: string;
  memberId: string;
  token: string;
  nickname: string;
  role: Role;
}
export interface Member {
  id: string;
  nickname: string;
  role: Role;
  character?: CharacterAppearance;
  token?: PlayerToken;
  health?: CharacterHealth;
}
export interface CharacterHealth {
  current: number;
  max: number;
  gmBonus?: number;
}
export interface HealthAdjustmentRequest {
  memberId?: string;
  current?: number;
  delta?: number;
  gmBonus?: number;
}
export interface RoomSummary {
  code: string;
  name: string;
  updatedAt: string;
  online: number;
  scenes: number;
}
export interface Snapshot {
  room: Omit<Room, 'gmId' | 'activeCombat'> & { activeCombat?: PublicCombatState | null };
  panels: Pick<Panel, 'id' | 'roomId' | 'name' | 'order' | 'grid' | 'updatedAt'>[];
  panel: PublicPanel;
  members: Member[];
  you: Member;
  rolls: DiceRoll[];
  combatParty?: Member[];
}
export interface PaintRequest {
  panelId: string;
  tiles: Tile[];
}
export interface SceneRequest {
  name: string;
  cols: number;
  rows: number;
  template: 'blank' | 'woodland';
}
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };
export type Ack<T> = (reply: Reply<T>) => void;
export interface ClientEvents {
  'tile:paint': (request: PaintRequest, ack: Ack<Tile[]>) => void;
  'panel:change': (panelId: string, ack: Ack<null>) => void;
  'panel:create': (request: SceneRequest, ack: Ack<null>) => void;
  'panel:rename': (request: { panelId: string; name: string }, ack: Ack<null>) => void;
  'panel:import': (request: unknown, ack: Ack<null>) => void;
  'character:update': (request: CharacterAppearance, ack: Ack<CharacterAppearance>) => void;
  'health:update': (request: HealthAdjustmentRequest, ack: Ack<CharacterHealth>) => void;
  'token:move': (request: MoveRequest, ack: Ack<PlayerToken>) => void;
  'room:movement': (request: { allowed: boolean }, ack: Ack<null>) => void;
  'room:classes': (request: { classes: CharacterClass[] }, ack: Ack<null>) => void;
  'panel:spawn': (request: SpawnRequest, ack: Ack<null>) => void;
  'dice:roll': (request: DiceRequest, ack: Ack<DiceRoll>) => void;
  'fog:update': (request: FogRequest, ack: Ack<null>) => void;
  'panel:duplicate': (panelId: string, ack: Ack<null>) => void;
  'panel:remove': (panelId: string, ack: Ack<null>) => void;
  'panel:reorder': (panelIds: string[], ack: Ack<null>) => void;
  'structure:place': (request: StructureRequest, ack: Ack<null>) => void;
  'poi:configure': (request: PoiConfiguration, ack: Ack<null>) => void;
  'poi:vote': (request: { voteId: string; accept: boolean }, ack: Ack<null>) => void;
  'poi:gm_decide': (request: { voteId: string; approved: boolean }, ack: Ack<null>) => void;
  'room:delete': (ack: Ack<{ success: boolean }>) => void;
  'room:leave': (ack: Ack<{ success: boolean }>) => void;
  'monster:save_definition': (request: MonsterDefinition, ack: Ack<null>) => void;
  'monster:delete_definition': (id: string, ack: Ack<null>) => void;
  'monster:summon': (request: SummonMonsterRequest, ack: Ack<null>) => void;
  'monster:move': (request: MonsterMoveRequest, ack: Ack<null>) => void;
  'monster:adjust_hp': (request: MonsterHealthRequest, ack: Ack<null>) => void;
  'monster:set_visibility': (request: MonsterVisibilityRequest, ack: Ack<null>) => void;
  'monster:remove': (request: MonsterReference, ack: Ack<null>) => void;
  'combat:start': (request: MonsterReference, ack: Ack<null>) => void;
  'combat:initiative': (request: CombatInitiativeRequest, ack: Ack<null>) => void;
  'combat:attack_player': (request: PlayerAttackRequest, ack: Ack<null>) => void;
  'combat:attack_monster': (request: MonsterAttackRequest, ack: Ack<null>) => void;
  'combat:next_turn': (ack: Ack<null>) => void;
  'combat:end': (ack: Ack<null>) => void;
}
export interface ServerEvents {
  'room:snapshot': (snapshot: Snapshot) => void;
  'room:presence': (members: Member[]) => void;
  'health:updated': (update: { memberId: string; health: CharacterHealth }) => void;
  'tile:updated': (update: { panelId: string; tiles: Tile[]; updatedAt: string }) => void;
  'token:moved': (update: { memberId: string; token?: PlayerToken }) => void;
  'dice:rolled': (roll: DiceRoll) => void;
  'poi:prompt': (vote: TravelVote) => void;
  'poi:unlinked': () => void;
  'poi:cancelled': (event: { reason: 'declined' | 'timeout' | 'changed' }) => void;
  'room:destroyed': (event: RoomDestroyedEvent) => void;
  'session:ended': (event: { reason: 'left' }) => void;
  'combat:started': (event: { combat: PublicCombatState }) => void;
  'combat:ended': (event: { reason: 'victory' | 'fled' | 'gm_dismissed' }) => void;
}

export type TerrainCategory = 'world' | 'city' | 'dungeon' | 'interior';
export type PoiType = 'town' | 'dungeon' | 'castle' | 'shrine' | 'custom';
export interface MultiTileDimension {
  cols: number;
  rows: number;
}
export interface StructureAnchor extends MultiTileDimension {
  id: string;
  templateKey: string;
  category: TerrainCategory;
  x: number;
  y: number;
  name?: string;
  targetPanelId?: string;
  entranceOffset: { dx: number; dy: number };
}
export interface StructureRequest {
  panelId: string;
  templateKey: string;
  x: number;
  y: number;
}
export interface PoiConfiguration {
  panelId: string;
  structureId: string;
  name: string;
  targetPanelId?: string | null;
  createTemplate?: 'town' | 'dungeon';
}
export interface TravelVote {
  id: string;
  poiId: string;
  panelId: string;
  targetPanelId: string;
  name: string;
  initiatedBy: string;
  playerIds: string[];
  votes: Record<string, boolean>;
  gmApproved: boolean;
  expiresAt: number;
}
export interface RoomDestroyedEvent {
  roomCode: string;
  reason: 'gm_deleted' | 'expired';
  message: string;
}
export type HpVisibility = 'gm_only' | 'bar_only' | 'public';
export interface MonsterDefinition {
  id: string;
  name: string;
  sprite: string;
  attributes: AttributeModifiers;
  defaultMaxHp: number;
  attackNotation: string;
  hpVisibility: HpVisibility;
  isCustom?: boolean;
}
export interface MonsterInstance {
  id: string;
  panelId: string;
  definitionId: string;
  name: string;
  x: number;
  y: number;
  currentHp: number;
  maxHp: number;
  gmBonusHp?: number;
  hpVisibility: HpVisibility;
  sprite: string;
  attributes: AttributeModifiers;
  attackNotation: string;
}
export type PublicMonster = Omit<
  MonsterInstance,
  'currentHp' | 'maxHp' | 'gmBonusHp' | 'attributes' | 'attackNotation'
> & {
  currentHp?: number;
  maxHp?: number;
  healthRatio?: number;
  defeated: boolean;
  attributes?: AttributeModifiers;
  attackNotation?: string;
  gmBonusHp?: number;
};
export type PublicPanel = Omit<Panel, 'monsters'> & { monsters?: PublicMonster[] };
export interface MonsterReference {
  panelId: string;
  monsterId: string;
}
export interface MonsterMoveRequest extends MonsterReference {
  x: number;
  y: number;
}
export interface MonsterVisibilityRequest extends MonsterReference {
  hpVisibility: HpVisibility;
}
export interface MonsterHealthRequest extends MonsterReference {
  current?: number;
  delta?: number;
  gmBonusHp?: number;
}
export interface SummonMonsterRequest {
  panelId: string;
  definitionId: string;
  x: number;
  y: number;
  name?: string;
  customOverrides?: Partial<
    Pick<MonsterInstance, 'maxHp' | 'attributes' | 'hpVisibility' | 'attackNotation'>
  >;
}
export interface ClassAttack {
  id: string;
  name: string;
  description: string;
  attributeId: AttributeId;
  damageNotation: string;
}
export interface CombatParticipant {
  id: string;
  type: 'player' | 'monster';
  name: string;
  initiative: number;
  dexterityModifier: number;
}
export interface CombatEffect {
  id: string;
  sourceId: string;
  targetId: string;
  kind: 'attack' | 'pass';
}
export interface ActiveCombatState {
  id: string;
  panelId: string;
  monsterId: string;
  round: number;
  turnIndex: number;
  turnQueue: CombatParticipant[];
  status: 'initiative' | 'active' | 'resolved';
  partyIds: string[];
  lastAction?: CombatEffect;
}
export type PublicCombatState = ActiveCombatState;
export interface CombatInitiativeRequest {
  combatId: string;
  round: number;
}
export interface PlayerAttackRequest {
  targetMonsterId: string;
  attackId: string;
}
export interface MonsterAttackRequest {
  targetMemberId: string;
  damageNotation?: string;
}
