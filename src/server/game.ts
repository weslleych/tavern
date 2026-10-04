import { createHash, randomBytes, randomUUID, randomInt, timingSafeEqual } from 'node:crypto';
import type { Credential, Member, Panel, Room, Snapshot, Tile } from '../types/game';
import {
  authSchema,
  createSchema,
  importSchema,
  joinSchema,
  paintSchema,
  renameSchema,
  sceneSchema,
  characterSchema,
  moveSchema,
  fogSchema,
  diceSchema,
  panelIdSchema,
  panelOrderSchema,
  movementSchema,
  spawnSchema,
} from '../lib/validation';
import { cellKey, firstFreeTile, walkable } from '../lib/characters';
import { woodland } from '../lib/terrain';
import type { GameStore, Session, StoredGame } from './store';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const key = (tile: Tile) => `${tile.x},${tile.y}`;

export class MoveRejected extends Error {
  readonly code = 'MOVE_REJECTED';
}

export class GameService {
  private data: Promise<StoredGame>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public readonly store: GameStore) {
    this.data = store.load().then((state) => {
      for (const member of state.sessions)
        if (member.role === 'gm') {
          delete member.character;
          delete member.token;
        }
      return state;
    });
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
    member = this.session(state, member);
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
      playersCanMove: room.playersCanMove ?? true,
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
    const visible = new Set(panel.fog?.revealed || []);
    const restricted = member.role !== 'gm' && !!panel.fog?.enabled;
    const publicMember = (session: Session): Member => {
      const result: Member = { id: session.id, nickname: session.nickname, role: session.role };
      if (session.role === 'player' && session.character) result.character = session.character;
      if (
        session.role === 'player' &&
        session.token &&
        (!restricted || session.id === member.id || visible.has(cellKey(session.token)))
      )
        result.token = session.token;
      return result;
    };
    const online = new Set(members.map((item) => item.id));
    return structuredClone({
      room: publicRoom,
      panels,
      panel: restricted
        ? { ...panel, tiles: panel.tiles.filter((tile) => visible.has(key(tile))) }
        : panel,
      members: state.sessions
        .filter((item) => item.roomId === room.id && online.has(item.id))
        .map(publicMember),
      you: publicMember(member),
      rolls: room.rolls || [],
    });
  }

  private requireGM(member: Session, state: StoredGame): Room {
    member = this.session(state, member);
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

  private session(state: StoredGame, member: Session): Session {
    const session = state.sessions.find(
      (item) => item.id === member.id && item.roomId === member.roomId,
    );
    if (!session) throw new Error('Your session is invalid. Join the table again.');
    return session;
  }
  private roomFor(state: StoredGame, member: Session): Room {
    const room = state.rooms.find((item) => item.id === member.roomId);
    if (!room) throw new Error('Table not found.');
    return room;
  }
  private spawnCharacters(state: StoredGame, room: Room, reset = false) {
    const panel = this.panel(state, room.id, room.activePanelId);
    const characters = state.sessions.filter(
      (item) => item.roomId === room.id && item.role === 'player' && item.character,
    );
    const occupied = new Set<string>();
    for (const member of characters) {
      if (
        reset ||
        !member.token ||
        member.token.panelId !== panel.id ||
        !walkable(panel, member.token) ||
        occupied.has(cellKey(member.token))
      )
        delete member.token;
      else occupied.add(cellKey(member.token));
    }
    for (const member of characters)
      if (!member.token) {
        member.token = firstFreeTile(panel, occupied);
        if (member.token) occupied.add(cellKey(member.token));
        else delete member.token;
      }
  }
  async updateCharacter(member: Session, input: unknown) {
    const character = characterSchema.parse(input);
    return this.mutate((state) => {
      const session = this.session(state, member);
      if (session.role !== 'player') throw new Error('Only players have characters.');
      session.character = character;
      const room = this.roomFor(state, member);
      this.spawnCharacters(state, room);
      room.updatedAt = now();
      return character;
    });
  }
  async moveToken(member: Session, input: unknown) {
    const request = moveSchema.parse(input);
    return this.mutate((state) => {
      const actor = this.session(state, member);
      const room = this.roomFor(state, member);
      const isGM = actor.role === 'gm' && room.gmId === actor.id;
      if (!isGM && request.memberId && request.memberId !== actor.id)
        throw new Error('Move only your own character.');
      if (!isGM && room.playersCanMove === false)
        throw new MoveRejected('Player movement is paused.');
      const session = state.sessions.find(
        (item) =>
          item.id === (request.memberId || actor.id) &&
          item.roomId === room.id &&
          item.role === 'player',
      );
      if (!session) throw new Error('Player not found in this table.');
      const panel = this.panel(state, room.id, request.panelId);
      if (panel.id !== room.activePanelId) throw new Error('Move only in the active scene.');
      if (!session.character || !session.token || session.token.panelId !== panel.id)
        throw new MoveRejected('Your character is waiting for a free tile.');
      if (
        !isGM &&
        Math.abs(request.x - session.token.x) + Math.abs(request.y - session.token.y) !== 1
      )
        throw new MoveRejected('Move one adjacent tile at a time.');
      if (!isGM && panel.fog?.enabled && !panel.fog.revealed.includes(cellKey(request)))
        throw new MoveRejected('That tile is hidden by fog.');
      if (!walkable(panel, request))
        throw new MoveRejected('That tile is empty, blocked or outside the scene.');
      if (
        state.sessions.some(
          (other) =>
            other.id !== session.id &&
            other.roomId === room.id &&
            other.token?.panelId === panel.id &&
            cellKey(other.token) === cellKey(request),
        )
      )
        throw new MoveRejected('That tile is occupied.');
      const token = { x: request.x, y: request.y, panelId: request.panelId };
      session.token = token;
      room.updatedAt = now();
      return token;
    });
  }
  async setMovement(member: Session, input: unknown) {
    const request = movementSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      room.playersCanMove = request.allowed;
      room.updatedAt = now();
    });
  }
  async setSpawn(member: Session, input: unknown) {
    const request = spawnSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const panel = this.panel(state, room.id, request.panelId);
      if (
        request.point &&
        (request.point.x >= panel.grid.cols || request.point.y >= panel.grid.rows)
      )
        throw new Error('Spawn point is outside this scene.');
      if (request.point) panel.spawnPoint = request.point;
      else delete panel.spawnPoint;
      panel.updatedAt = room.updatedAt = now();
      if (panel.id === room.activePanelId) this.spawnCharacters(state, room);
    });
  }
  async updateFog(member: Session, input: unknown) {
    const request = fogSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const panel = this.panel(state, room.id, request.panelId);
      if (request.cells?.some((cell) => cell.x >= panel.grid.cols || cell.y >= panel.grid.rows))
        throw new Error('Fog coordinates are outside this scene.');
      const fog = (panel.fog ||= { enabled: false, revealed: [] });
      if (request.enabled !== undefined) fog.enabled = request.enabled;
      const revealed = new Set(fog.revealed);
      if (request.revealed !== undefined)
        for (const cell of request.cells || []) {
          if (request.revealed) revealed.add(cellKey(cell));
          else revealed.delete(cellKey(cell));
        }
      fog.revealed = [...revealed];
      panel.updatedAt = room.updatedAt = now();
    });
  }
  async rollDice(member: Session, input: unknown) {
    const request = diceSchema.parse(input);
    return this.mutate((state) => {
      const session = this.session(state, member);
      const room = this.roomFor(state, member);
      const values = Array.from({ length: request.count }, () => randomInt(1, request.sides + 1));
      const roll = {
        ...request,
        id: randomUUID(),
        memberId: session.id,
        nickname: session.nickname,
        values,
        total: values.reduce((a, b) => a + b, request.modifier),
        createdAt: now(),
      };
      room.rolls = [...(room.rolls || []), roll].slice(-20);
      room.updatedAt = roll.createdAt;
      return roll;
    });
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
      this.spawnCharacters(state, room);
      return request.tiles;
    });
  }
  async changePanel(member: Session, panelId: string) {
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const panel = this.panel(state, room.id, panelId);
      if (room.activePanelId === panel.id) return;
      room.activePanelId = panel.id;
      room.updatedAt = now();
      this.spawnCharacters(state, room, true);
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
      this.spawnCharacters(state, room, true);
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
      this.spawnCharacters(state, room, true);
    });
  }

  async duplicatePanel(member: Session, input: unknown) {
    const panelId = panelIdSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const source = this.panel(state, room.id, panelId);
      const panels = state.panels.filter((item) => item.roomId === room.id);
      if (panels.length >= 30) throw new Error('A table can have up to 30 scenes.');
      const copy = {
        ...structuredClone(source),
        id: randomUUID(),
        name: `${source.name.slice(0, 53)} (copy)`,
        order: panels.length,
        updatedAt: now(),
      };
      state.panels.push(copy);
      room.activePanelId = copy.id;
      room.updatedAt = now();
      this.spawnCharacters(state, room, true);
    });
  }
  async reorderPanels(member: Session, input: unknown) {
    const ids = panelOrderSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const panels = state.panels.filter((item) => item.roomId === room.id);
      if (ids.length !== panels.length || new Set(ids).size !== ids.length)
        throw new Error('Provide every scene exactly once.');
      ids.forEach((id, order) => {
        this.panel(state, room.id, id).order = order;
      });
      room.updatedAt = now();
    });
  }
  async removePanel(member: Session, input: unknown) {
    const panelId = panelIdSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      this.panel(state, room.id, panelId);
      const remaining = state.panels
        .filter((item) => item.roomId === room.id && item.id !== panelId)
        .sort((a, b) => a.order - b.order);
      if (!remaining.length) throw new Error('Keep at least one scene in this table.');
      state.panels = state.panels.filter((item) => item.id !== panelId);
      remaining.forEach((panel, order) => {
        panel.order = order;
      });
      if (room.activePanelId === panelId) {
        room.activePanelId = remaining[0].id;
        this.spawnCharacters(state, room, true);
      }
      room.updatedAt = now();
    });
  }
}
