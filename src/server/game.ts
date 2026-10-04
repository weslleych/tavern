import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Credential, Member, Panel, Room, Snapshot, Tile } from '../types/game';
import {
  authSchema,
  createSchema,
  importSchema,
  joinSchema,
  paintSchema,
  renameSchema,
  sceneSchema,
} from '../lib/validation';
import { woodland } from '../lib/terrain';
import type { GameStore, Session, StoredGame } from './store';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const key = (tile: Tile) => `${tile.x},${tile.y}`;

export class GameService {
  private data: Promise<StoredGame>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public readonly store: GameStore) {
    this.data = store.load();
  }
  async ready() {
    await this.data;
  }

  private async mutate<T>(operation: (state: StoredGame) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const next = structuredClone(await this.data);
      const result = operation(next);
      await this.store.save(next);
      this.data = Promise.resolve(next);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private newSession(
    state: StoredGame,
    room: Room,
    nickname: string,
    role: 'gm' | 'player',
  ): Credential {
    const token = randomBytes(32).toString('hex');
    const memberId = randomUUID();
    state.sessions.push({ id: memberId, nickname, role, roomId: room.id, tokenHash: hash(token) });
    return { roomCode: room.code, memberId, nickname, role, token };
  }

  async create(input: unknown): Promise<Credential> {
    const request = createSchema.parse(input);
    return this.mutate((state) => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code: string;
      do {
        code =
          'TVRN-' +
          Array.from(randomBytes(6), (value) => alphabet[value % alphabet.length]).join('');
      } while (state.rooms.some((room) => room.code === code));
      const room: Room = {
        id: randomUUID(),
        code,
        name: request.name,
        gmId: '',
        activePanelId: '',
        createdAt: now(),
        updatedAt: now(),
      };
      const session = this.newSession(state, room, request.nickname, 'gm');
      room.gmId = session.memberId;
      const grid = { cols: 26, rows: 18, tileSize: 32 };
      const panel: Panel = {
        id: randomUUID(),
        roomId: room.id,
        name: 'The clearing',
        order: 0,
        grid,
        tiles: request.template === 'woodland' ? woodland(grid) : [],
        updatedAt: now(),
      };
      room.activePanelId = panel.id;
      state.rooms.push(room);
      state.panels.push(panel);
      return session;
    });
  }

  async join(input: unknown): Promise<Credential> {
    const request = joinSchema.parse(input);
    const saved = authSchema.safeParse(request.session);
    if (saved.success && saved.data.roomCode === request.code) {
      try {
        const member = await this.authenticate(saved.data);
        return { ...saved.data, nickname: member.nickname, role: member.role };
      } catch {
        // An invalid saved credential may rejoin as a new player, never as GM.
      }
    }
    return this.mutate((state) => {
      const room = state.rooms.find((item) => item.code === request.code);
      if (!room) throw new Error('Table not found. Check the code with your game master.');
      if (state.sessions.filter((item) => item.roomId === room.id).length >= 100)
        throw new Error('This table has reached its session limit.');
      return this.newSession(state, room, request.nickname, 'player');
    });
  }

  async authenticate(input: unknown): Promise<Session> {
    const parsed = authSchema.safeParse(input);
    if (!parsed.success) throw new Error('Your session is invalid. Join the table again.');
    const request = parsed.data;
    const state = await this.data;
    const room = state.rooms.find((item) => item.code === request.roomCode);
    const member = state.sessions.find(
      (item) => item.id === request.memberId && item.roomId === room?.id,
    );
    if (
      !member ||
      !timingSafeEqual(
        Buffer.from(member.tokenHash, 'hex'),
        Buffer.from(hash(request.token), 'hex'),
      )
    )
      throw new Error('Your session is invalid. Join the table again.');
    return { ...member };
  }

  async snapshot(member: Session, members: Member[] = []): Promise<Snapshot> {
    const state = await this.data;
    const room = state.rooms.find((item) => item.id === member.roomId);
    if (!room) throw new Error('Table not found.');
    const panel = state.panels.find(
      (item) => item.id === room.activePanelId && item.roomId === room.id,
    );
    if (!panel) throw new Error('Scene not found.');
    const publicRoom = {
      id: room.id,
      code: room.code,
      name: room.name,
      activePanelId: room.activePanelId,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
    const panels = state.panels
      .filter((item) => item.roomId === room.id)
      .sort((a, b) => a.order - b.order)
      .map((panel) => ({
        id: panel.id,
        roomId: panel.roomId,
        name: panel.name,
        order: panel.order,
        grid: panel.grid,
        updatedAt: panel.updatedAt,
      }));
    return structuredClone({
      room: publicRoom,
      panels,
      panel,
      members,
      you: { id: member.id, nickname: member.nickname, role: member.role },
    });
  }

  private requireGM(member: Session, state: StoredGame): Room {
    const room = state.rooms.find((item) => item.id === member.roomId);
    if (!room || member.role !== 'gm' || room.gmId !== member.id)
      throw new Error('Only the game master can edit this table.');
    return room;
  }
  private panel(state: StoredGame, roomId: string, panelId: string): Panel {
    const panel = state.panels.find((item) => item.id === panelId && item.roomId === roomId);
    if (!panel) throw new Error('Scene not found in this table.');
    return panel;
  }
  private validateBounds(tiles: Tile[], panel: Pick<Panel, 'grid'>) {
    if (tiles.some((tile) => tile.x >= panel.grid.cols || tile.y >= panel.grid.rows))
      throw new Error('Tile coordinates are outside this scene.');
  }

  async paint(member: Session, input: unknown): Promise<Tile[]> {
    return this.mutate((state) => {
      const room = this.requireGM(member, state);
      const request = paintSchema.parse(input);
      const panel = this.panel(state, room.id, request.panelId);
      this.validateBounds(request.tiles, panel);
      const tiles = new Map(panel.tiles.map((tile) => [key(tile), tile]));
      for (const tile of request.tiles) {
        if (tile.terrain === 'empty' && !tile.blocked) tiles.delete(key(tile));
        else tiles.set(key(tile), tile);
      }
      panel.tiles = [...tiles.values()];
      panel.updatedAt = now();
      room.updatedAt = panel.updatedAt;
      return request.tiles;
    });
  }
  async changePanel(member: Session, panelId: string) {
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      room.activePanelId = this.panel(state, room.id, panelId).id;
      room.updatedAt = now();
    });
  }
  async createPanel(member: Session, input: unknown) {
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const request = sceneSchema.parse(input);
      const panels = state.panels.filter((panel) => panel.roomId === room.id);
      if (panels.length >= 30) throw new Error('A table can have up to 30 scenes.');
      const grid = { cols: request.cols, rows: request.rows, tileSize: 32 };
      const panel: Panel = {
        id: randomUUID(),
        roomId: room.id,
        name: request.name,
        order: panels.length,
        grid,
        tiles: request.template === 'woodland' ? woodland(grid) : [],
        updatedAt: now(),
      };
      state.panels.push(panel);
      room.activePanelId = panel.id;
      room.updatedAt = now();
    });
  }
  async renamePanel(member: Session, input: unknown) {
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const request = renameSchema.parse(input);
      const panel = this.panel(state, room.id, request.panelId);
      panel.name = request.name;
      panel.updatedAt = now();
      room.updatedAt = now();
    });
  }
  async importPanel(member: Session, input: unknown) {
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const request = importSchema.parse(input);
      this.validateBounds(request.tiles, request);
      if (new Set(request.tiles.map(key)).size !== request.tiles.length)
        throw new Error('The map contains duplicate coordinates.');
      const panels = state.panels.filter((panel) => panel.roomId === room.id);
      if (panels.length >= 30) throw new Error('A table can have up to 30 scenes.');
      const panel: Panel = {
        id: randomUUID(),
        roomId: room.id,
        name: request.name,
        order: panels.length,
        grid: request.grid,
        tiles: request.tiles.filter((tile) => tile.terrain !== 'empty' || tile.blocked),
        updatedAt: now(),
      };
      state.panels.push(panel);
      room.activePanelId = panel.id;
      room.updatedAt = now();
    });
  }
}
