export const terrains = ['empty', 'grass', 'forest', 'water', 'mountain', 'stone', 'wall'] as const;
export type Terrain = (typeof terrains)[number];
export type Role = 'gm' | 'player';
export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  blocked: boolean;
}
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
  updatedAt: string;
}
export interface Room {
  id: string;
  code: string;
  name: string;
  activePanelId: string;
  gmId: string;
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
  panels: Omit<Panel, 'tiles'>[];
  panel: Panel;
  members: Member[];
  you: Member;
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
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T> = (reply: Reply<T>) => void;
export interface ClientEvents {
  'tile:paint': (request: PaintRequest, ack: Ack<Tile[]>) => void;
  'panel:change': (panelId: string, ack: Ack<null>) => void;
  'panel:create': (request: SceneRequest, ack: Ack<null>) => void;
  'panel:rename': (request: { panelId: string; name: string }, ack: Ack<null>) => void;
  'panel:import': (request: unknown, ack: Ack<null>) => void;
}
export interface ServerEvents {
  'room:snapshot': (snapshot: Snapshot) => void;
  'room:presence': (members: Member[]) => void;
  'tile:updated': (update: { panelId: string; tiles: Tile[]; updatedAt: string }) => void;
}
