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
}
export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  blocked: boolean;
  sprite?: string;
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
export type MapTool = 'paint' | 'pan' | 'move' | 'reveal' | 'hide' | 'spawn';
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
  room: Omit<Room, 'gmId'>;
  panels: Omit<Panel, 'tiles' | 'fog'>[];
  panel: Panel;
  members: Member[];
  you: Member;
  rolls: DiceRoll[];
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
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; code?: 'MOVE_REJECTED' };
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
}
export interface ServerEvents {
  'room:snapshot': (snapshot: Snapshot) => void;
  'room:presence': (members: Member[]) => void;
  'health:updated': (update: { memberId: string; health: CharacterHealth }) => void;
  'tile:updated': (update: { panelId: string; tiles: Tile[]; updatedAt: string }) => void;
  'token:moved': (update: { memberId: string; token?: PlayerToken }) => void;
  'dice:rolled': (roll: DiceRoll) => void;
}
