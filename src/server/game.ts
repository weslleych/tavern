import { createHash, randomBytes, randomUUID, randomInt, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  Credential,
  Member,
  Panel,
  Room,
  Snapshot,
  Tile,
  TravelVote,
  MonsterInstance,
  DiceRequest,
  DiceRoll,
} from '../types/game';
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
  updateClassesSchema,
  healthAdjustmentSchema,
  structureRequestSchema,
  poiConfigurationSchema,
  poiVoteSchema,
  poiDecisionSchema,
  monsterDefinitionSchema,
  summonMonsterSchema,
  moveMonsterSchema,
  adjustMonsterHpSchema,
  setMonsterVisibilitySchema,
  monsterReferenceSchema,
  playerAttackSchema,
  monsterAttackSchema,
  combatInitiativeSchema,
} from '../lib/validation';
import {
  defaultClasses,
  findClassSelection,
  calculateAttributes,
  attributeDefinitions,
  calculateMaxHealth,
} from '../lib/classes';
import { cellKey, firstFreeTile, walkable } from '../lib/characters';
import { woodland, sceneTemplate, structureTemplates } from '../lib/terrain';
import { defaultMonsters, publicMonster } from '../lib/monsters';
import { classAttack, defaultAttacks, sortInitiative } from '../lib/combat';
import { parseDiceNotation } from '../lib/dice-notation';
import { clearStructuresAt, placeStructure, validateImportedStructures } from './structures';
import type { GameStore, Session, StoredGame } from './store';
import { createStarterWorld } from './starter-world';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const now = () => new Date().toISOString();
const key = (tile: Tile) => `${tile.x},${tile.y}`;

export class MoveRejected extends Error {
  readonly code = 'MOVE_REJECTED';
}
export class Unauthorized extends Error {
  readonly code = 'UNAUTHORIZED';
}
export class RoomNotFound extends Error {
  readonly code = 'ROOM_NOT_FOUND';
  constructor() {
    super('Table not found.');
  }
}

export class GameService {
  readonly events = new EventEmitter();
  private data: Promise<StoredGame>;
  private queue: Promise<unknown> = Promise.resolve();
  private stagedRolls: Array<{ roomId: string; roll: DiceRoll }> = [];
  private online = new Map<string, string[]>();
  private travelCooldown = new Map<string, number>();
  constructor(
    public readonly store: GameStore,
    private options: { clock?: () => number; rollDie?: (sides: number) => number } = {},
  ) {
    this.data = store.load().then((state) => {
      for (const room of state.rooms) {
        room.classes ??= structuredClone(defaultClasses);
        for (const definition of room.classes)
          if (!definition.defaultAttack && defaultAttacks[definition.id])
            definition.defaultAttack = structuredClone(defaultAttacks[definition.id]);
        room.monsterDefinitions ??= structuredClone(defaultMonsters);
        room.travelVote = null;
      }
      for (const member of state.sessions)
        if (member.role === 'gm') {
          delete member.character;
          delete member.token;
          delete member.health;
        } else if (!member.health) {
          const room = state.rooms.find((room) => room.id === member.roomId);
          if (room) this.recalculateHealth(member, room);
        }
      return state;
    });
  }
  private clock() {
    return this.options.clock?.() ?? Date.now();
  }
  private die(sides: number) {
    return this.options.rollDie?.(sides) ?? randomInt(1, sides + 1);
  }
  setOnlineMembers(roomId: string, members: Member[]) {
    this.online.set(
      roomId,
      members
        .filter((m) => m.role === 'player')
        .map((m) => m.id)
        .sort(),
    );
  }
  async ready() {
    await this.data;
  }

  private async mutate<T>(operation: (state: StoredGame) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const next = structuredClone(await this.data);
      this.stagedRolls = [];
      const result = operation(next);
      await this.store.save(next);
      const previous = await this.data;
      for (const room of previous.rooms)
        if (
          room.travelVote &&
          !next.rooms.find((r) => r.id === room.id)?.travelVote &&
          next.rooms.find((r) => r.id === room.id)?.activePanelId === room.activePanelId
        )
          this.travelCooldown.set(
            `${room.id}:${room.travelVote.poiId}:${room.travelVote.initiatedBy}`,
            this.clock() + 10000,
          );
      this.data = Promise.resolve(next);
      const batches = new Map<string, DiceRoll[]>();
      for (const { roomId, roll } of this.stagedRolls) {
        const rolls = batches.get(roomId) ?? [];
        rolls.push(roll);
        batches.set(roomId, rolls);
      }
      for (const [roomId, rolls] of batches) this.events.emit('diceRolls', { roomId, rolls });
      for (const room of next.rooms) {
        const before = previous.rooms.find((r) => r.id === room.id)?.activeCombat;
        if (
          before?.status === 'initiative' &&
          room.activeCombat?.status === 'active' &&
          room.activeCombat.round === 1
        )
          this.events.emit('combatStarted', { roomId: room.id, combat: room.activeCombat });
      }
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
    const session: Session = {
      id: memberId,
      nickname,
      role,
      roomId: room.id,
      tokenHash: hash(token),
    };
    if (role === 'player') this.recalculateHealth(session, room);
    state.sessions.push(session);
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
        classes: structuredClone(request.classes ?? defaultClasses),
        monsterDefinitions: structuredClone(defaultMonsters),
        createdAt: now(),
        updatedAt: now(),
      };
      const session = this.newSession(state, room, request.nickname, 'gm');
      room.gmId = session.memberId;
      const panels: Panel[] =
        request.template === 'woodland'
          ? createStarterWorld(room.id, now())
          : [
              {
                id: randomUUID(),
                roomId: room.id,
                name: 'The clearing',
                order: 0,
                grid: { cols: 26, rows: 18, tileSize: 32 },
                tiles: [],
                updatedAt: now(),
              },
            ];
      room.activePanelId = panels[0].id;
      state.rooms.push(room);
      state.panels.push(...panels);
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
      if (!room) throw new RoomNotFound();
      if (state.sessions.filter((item) => item.roomId === room.id && !item.departed).length >= 100)
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
    if (!room) throw new RoomNotFound();
    const member = state.sessions.find(
      (item) => item.id === request.memberId && item.roomId === room?.id,
    );
    if (
      !member ||
      member.departed ||
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
    if (!room) throw new RoomNotFound();
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
      classes: room.classes,
      monsterDefinitions: member.role === 'gm' ? room.monsterDefinitions : undefined,
      travelVote: room.travelVote ?? null,
      activeCombat: room.activeCombat ?? null,
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
      if (session.role === 'player' && session.health) result.health = session.health;
      if (
        session.role === 'player' &&
        session.token &&
        (!restricted || session.id === member.id || visible.has(cellKey(session.token)))
      )
        result.token = session.token;
      return result;
    };
    const online = new Set(members.map((item) => item.id));
    const visibleStructures = (panel.structures ?? []).filter(
      (anchor) =>
        !restricted ||
        Array.from(
          { length: anchor.cols * anchor.rows },
          (_, i) => `${anchor.x + (i % anchor.cols)},${anchor.y + Math.floor(i / anchor.cols)}`,
        ).every((cell) => visible.has(cell)),
    );
    const visibleIds = new Set(visibleStructures.map((s) => s.id));
    const publicPanel = {
      ...panel,
      structures: visibleStructures.map((s) =>
        member.role === 'gm' ? s : { ...s, targetPanelId: undefined },
      ),
      tiles: panel.tiles
        .filter((tile) => !restricted || visible.has(key(tile)))
        .map((tile) =>
          tile.structureId && !visibleIds.has(tile.structureId)
            ? { ...tile, structureId: undefined, structureRoot: undefined }
            : tile,
        ),
      monsters: (panel.monsters ?? [])
        .filter((monster) => !restricted || visible.has(cellKey(monster)))
        .map((monster) => publicMonster(monster, member.role)),
    };
    return structuredClone({
      room: publicRoom,
      panels,
      panel: publicPanel,
      members: state.sessions
        .filter((item) => item.roomId === room.id && !item.departed && online.has(item.id))
        .map(publicMember),
      you: publicMember(member),
      combatParty: room.activeCombat
        ? state.sessions
            .filter(
              (s) =>
                s.roomId === room.id && !s.departed && room.activeCombat!.partyIds.includes(s.id),
            )
            .map((s) => ({
              id: s.id,
              nickname: s.nickname,
              role: s.role,
              character: s.character,
              health: s.health,
            }))
        : [],
      rolls: (room.rolls || []).map((roll) => ({
        ...roll,
        role: roll.role ?? (roll.memberId === room.gmId ? 'gm' : 'player'),
      })),
    });
  }

  private requireGM(member: Session, state: StoredGame): Room {
    member = this.session(state, member);
    const room = state.rooms.find((item) => item.id === member.roomId);
    if (!room || member.role !== 'gm' || room.gmId !== member.id)
      throw new Unauthorized('Only the game master can edit this table.');
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
    if (!state.rooms.some((room) => room.id === member.roomId)) throw new RoomNotFound();
    const session = state.sessions.find(
      (item) => item.id === member.id && item.roomId === member.roomId,
    );
    if (!session || session.departed)
      throw new Error('Your session is invalid. Join the table again.');
    return session;
  }
  private roomFor(state: StoredGame, member: Session): Room {
    const room = state.rooms.find((item) => item.id === member.roomId);
    if (!room) throw new RoomNotFound();
    return room;
  }
  private spawnCharacters(state: StoredGame, room: Room, reset = false) {
    const panel = this.panel(state, room.id, room.activePanelId);
    const characters = state.sessions.filter(
      (item) =>
        item.roomId === room.id && item.role === 'player' && item.character && !item.departed,
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
  private recalculateHealth(session: Session, room: Room) {
    const selection = findClassSelection(
      room.classes,
      session.character?.classId,
      session.character?.subclassId,
    );
    const gmBonus = session.health?.gmBonus ?? 0;
    const max = calculateMaxHealth(selection?.characterClass, selection?.subclass, gmBonus);
    session.health = {
      current: Math.max(0, Math.min(max, session.health?.current ?? max)),
      max,
      gmBonus,
    };
    return session.health;
  }
  async adjustHealth(member: Session, input: unknown) {
    const request = healthAdjustmentSchema.parse(input);
    return this.mutate((state) => {
      const actor = this.session(state, member);
      const room = this.roomFor(state, actor);
      if (actor.role === 'gm') {
        this.requireGM(actor, state);
        if (!request.memberId) throw new Error('Select a player to adjust health.');
      } else {
        if (request.memberId && request.memberId !== actor.id)
          throw new Error('Adjust only your own health.');
        if (request.gmBonus !== undefined)
          throw new Error('Only the game master can change maximum health.');
      }
      const target = state.sessions.find(
        (session) =>
          session.id === (request.memberId ?? actor.id) &&
          session.roomId === room.id &&
          session.role === 'player',
      );
      if (!target) throw new Error('Player not found in this table.');
      const previous = this.recalculateHealth(target, room);
      const current = request.current ?? previous.current + (request.delta ?? 0);
      if (request.gmBonus !== undefined) previous.gmBonus = request.gmBonus;
      const health = this.recalculateHealth(target, room);
      health.current = Math.max(0, Math.min(health.max, current));
      this.skipIncapacitated(state, room);
      room.updatedAt = now();
      return { memberId: target.id, health };
    });
  }
  async updateCharacter(member: Session, input: unknown) {
    const character = characterSchema.parse(input);
    return this.mutate((state) => {
      const session = this.session(state, member);
      if (session.role !== 'player') throw new Error('Only players have characters.');
      const room = this.roomFor(state, member);
      if (
        character.classId &&
        !findClassSelection(room.classes, character.classId, character.subclassId)
      )
        throw new Error('Choose a class and subclass available in this table.');
      const creatingCharacter = !session.character;
      session.character = character;
      const health = this.recalculateHealth(session, room);
      if (creatingCharacter) health.current = health.max;
      this.spawnCharacters(state, room);
      room.updatedAt = now();
      return character;
    });
  }
  async updateClasses(member: Session, input: unknown) {
    const request = updateClassesSchema.parse(input);
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      room.classes = request.classes;
      for (const session of state.sessions) {
        if (session.roomId !== room.id || !session.character) continue;
        const character = session.character;
        const characterClass = room.classes.find((item) => item.id === character.classId);
        if (!characterClass) {
          delete character.classId;
          delete character.subclassId;
        } else if (!characterClass.subclasses.some((item) => item.id === character.subclassId)) {
          delete character.subclassId;
        }
        if (session.role === 'player') this.recalculateHealth(session, room);
      }
      room.updatedAt = now();
    });
  }
  async moveToken(member: Session, input: unknown) {
    const request = moveSchema.parse(input);
    const result = await this.mutate((state) => {
      const actor = this.session(state, member);
      const room = this.roomFor(state, member);
      const isGM = actor.role === 'gm' && room.gmId === actor.id;
      if (room.activeCombat) throw new MoveRejected('Movement is paused during combat.');
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
      const unlinked = !isGM && this.triggerTravel(state, room, panel, session) === true;
      room.updatedAt = now();
      return { token, unlinked, roomId: room.id, memberId: session.id };
    });
    if (result.unlinked)
      this.events.emit('poiUnlinked', { roomId: result.roomId, memberId: result.memberId });
    return result.token;
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
      if (room.activeCombat?.panelId === panel.id && fog.enabled) {
        const monster = this.monster(state, room, panel.id, room.activeCombat.monsterId);
        if (!revealed.has(cellKey(monster))) room.activeCombat = null;
      }
      panel.updatedAt = room.updatedAt = now();
    });
  }
  async rollDice(member: Session, input: unknown) {
    const request = diceSchema.parse(input);
    return this.mutate((state) => {
      const session = this.session(state, member);
      const room = this.roomFor(state, member);
      const trusted = { ...request };
      if (request.attribute) {
        if (session.role !== 'player')
          throw new Error('Only players with characters can roll attribute checks.');
        const selection = findClassSelection(
          room.classes,
          session.character?.classId,
          session.character?.subclassId,
        );
        if (!selection) throw new Error('Choose a class before rolling an attribute check.');
        if (request.sides !== 20 || request.count !== 1)
          throw new Error('Attribute checks use one d20.');
        trusted.modifier = calculateAttributes(selection.characterClass, selection.subclass)[
          request.attribute
        ];
        trusted.label = `Teste de ${attributeDefinitions.find((item) => item.id === request.attribute)!.name}`;
      }
      return this.recordRoll(room, session, trusted);
    });
  }

  async paint(member: Session, input: unknown): Promise<Tile[]> {
    return this.mutate((state) => {
      const room = this.requireGM(member, state);
      const request = paintSchema.parse(input);
      const panel = this.panel(state, room.id, request.panelId);
      this.validateBounds(request.tiles, panel);
      if (request.tiles.some((t) => t.structureId || t.structureRoot !== undefined))
        throw new Error('Place structures using the structure brush.');
      clearStructuresAt(panel, request.tiles);
      const tiles = new Map(panel.tiles.map((tile) => [key(tile), tile]));
      for (const tile of request.tiles) {
        if (tile.terrain === 'empty' && !tile.blocked) tiles.delete(key(tile));
        else tiles.set(key(tile), tile);
      }
      panel.tiles = [...tiles.values()];
      panel.updatedAt = now();
      room.updatedAt = panel.updatedAt;
      if (room.travelVote && !panel.structures?.some((s) => s.id === room.travelVote?.poiId))
        room.travelVote = null;
      this.spawnCharacters(state, room);
      return request.tiles;
    });
  }
  async changePanel(member: Session, panelId: string) {
    await this.mutate((state) => {
      const room = this.requireGM(member, state);
      const panel = this.panel(state, room.id, panelId);
      if (room.activePanelId === panel.id) return;
      room.travelVote = null;
      room.activeCombat = null;
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
      room.travelVote = null;
      room.activeCombat = null;
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
        structures: request.structures ?? [],
        updatedAt: now(),
      };
      validateImportedStructures(panel);
      state.panels.push(panel);
      room.activePanelId = panel.id;
      room.travelVote = null;
      room.activeCombat = null;
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
      const structureIds = new Map((copy.structures ?? []).map((s) => [s.id, randomUUID()]));
      for (const anchor of copy.structures ?? []) anchor.id = structureIds.get(anchor.id)!;
      for (const tile of copy.tiles)
        if (tile.structureId) tile.structureId = structureIds.get(tile.structureId);
      for (const monster of copy.monsters ?? []) {
        monster.id = randomUUID();
        monster.panelId = copy.id;
      }
      room.travelVote = null;
      room.activeCombat = null;
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
  async placeStructure(member: Session, input: unknown) {
    const request = structureRequestSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        panel = this.panel(state, room.id, request.panelId);
      const anchor = placeStructure(panel, request.templateKey, request.x, request.y);
      room.travelVote = null;
      panel.updatedAt = room.updatedAt = now();
      this.spawnCharacters(state, room);
      return anchor;
    });
  }
  async configurePoi(member: Session, input: unknown) {
    const request = poiConfigurationSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        panel = this.panel(state, room.id, request.panelId);
      const anchor = panel.structures?.find((s) => s.id === request.structureId);
      if (!anchor || !structureTemplates.find((t) => t.key === anchor.templateKey)?.poi)
        throw new Error('Point of interest not found.');
      if (request.createTemplate) {
        const panels = state.panels.filter((p) => p.roomId === room.id);
        if (panels.length >= 30) throw new Error('A table can have up to 30 scenes.');
        const grid = { cols: 32, rows: 32, tileSize: 32 };
        const destination: Panel = {
          id: randomUUID(),
          roomId: room.id,
          name: request.name,
          order: panels.length,
          grid,
          tiles: sceneTemplate(request.createTemplate, grid),
          spawnPoint: { x: 16, y: 28 },
          updatedAt: now(),
        };
        state.panels.push(destination);
        anchor.targetPanelId = destination.id;
      } else if (request.targetPanelId) {
        this.panel(state, room.id, request.targetPanelId);
        if (request.targetPanelId === panel.id)
          throw new Error('Choose a different destination scene.');
        anchor.targetPanelId = request.targetPanelId;
      } else delete anchor.targetPanelId;
      anchor.name = request.name;
      room.travelVote = null;
      panel.updatedAt = room.updatedAt = now();
    });
  }
  private triggerTravel(state: StoredGame, room: Room, panel: Panel, member: Session) {
    if (room.travelVote || room.activeCombat || !member.token) return;
    const anchor = panel.structures?.find(
      (s) =>
        s.x + s.entranceOffset.dx === member.token!.x &&
        s.y + s.entranceOffset.dy === member.token!.y &&
        structureTemplates.find((t) => t.key === s.templateKey)?.poi,
    );
    if (!anchor) return;
    if (!anchor.targetPanelId) return true;
    this.panel(state, room.id, anchor.targetPanelId);
    const cooldownKey = `${room.id}:${anchor.id}:${member.id}`;
    if ((this.travelCooldown.get(cooldownKey) ?? 0) > this.clock()) return;
    const playerIds = this.online.get(room.id) ?? [];
    if (!playerIds.includes(member.id)) return;
    room.travelVote = {
      id: randomUUID(),
      poiId: anchor.id,
      panelId: panel.id,
      targetPanelId: anchor.targetPanelId,
      name: anchor.name ?? anchor.templateKey,
      initiatedBy: member.id,
      playerIds: [...playerIds],
      votes: {},
      gmApproved: false,
      expiresAt: this.clock() + 30000,
    };
  }
  private cancelTravel(room: Room) {
    room.travelVote = null;
  }
  private currentVote(room: Room, id: string): TravelVote {
    const vote = room.travelVote;
    if (
      !vote ||
      vote.id !== id ||
      vote.expiresAt <= this.clock() ||
      vote.panelId !== room.activePanelId
    )
      throw new Error('This travel vote is no longer active.');
    if (JSON.stringify(vote.playerIds) !== JSON.stringify(this.online.get(room.id) ?? []))
      throw new Error('The travel vote participants changed.');
    return vote;
  }
  private resolveTravel(state: StoredGame, room: Room) {
    const vote = room.travelVote!;
    const yes = Object.values(vote.votes).filter(Boolean).length;
    const no = Object.values(vote.votes).filter((v) => !v).length;
    if (no > vote.playerIds.length / 2) {
      this.cancelTravel(room);
      return;
    }
    if (yes > vote.playerIds.length / 2 && vote.gmApproved) {
      this.panel(state, room.id, vote.targetPanelId);
      room.activePanelId = vote.targetPanelId;
      room.travelVote = null;
      this.spawnCharacters(state, room, true);
    }
    room.updatedAt = now();
  }
  async voteTravel(member: Session, input: unknown) {
    const request = poiVoteSchema.parse(input);
    return this.mutate((state) => {
      const actor = this.session(state, member),
        room = this.roomFor(state, actor);
      const vote = this.currentVote(room, request.voteId);
      if (actor.role !== 'player' || !vote.playerIds.includes(actor.id))
        throw new Error('Only active players can vote on travel.');
      vote.votes[actor.id] = request.accept;
      this.resolveTravel(state, room);
    });
  }
  async decideTravel(member: Session, input: unknown) {
    const request = poiDecisionSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        vote = this.currentVote(room, request.voteId);
      if (!request.approved) this.cancelTravel(room);
      else {
        vote.gmApproved = true;
        this.resolveTravel(state, room);
      }
    });
  }
  async expireTravel(): Promise<{ roomId: string; reason: 'timeout' | 'changed' }[]> {
    const needs = (await this.data).rooms.some(
      (room) =>
        room.travelVote &&
        (room.travelVote.expiresAt <= this.clock() ||
          JSON.stringify(room.travelVote.playerIds) !==
            JSON.stringify(this.online.get(room.id) ?? [])),
    );
    if (!needs) return [];
    return this.mutate((state) => {
      const cancelled: { roomId: string; reason: 'timeout' | 'changed' }[] = [];
      for (const room of state.rooms)
        if (room.travelVote) {
          const expired = room.travelVote.expiresAt <= this.clock(),
            changed =
              JSON.stringify(room.travelVote.playerIds) !==
              JSON.stringify(this.online.get(room.id) ?? []);
          if (expired || changed) {
            cancelled.push({ roomId: room.id, reason: expired ? 'timeout' : 'changed' });
            this.cancelTravel(room);
          }
        }
      return cancelled;
    });
  }
  async roomExists(code: string) {
    return (await this.data).rooms.some((room) => room.code === code.toUpperCase());
  }
  async deleteRoom(member: Session, roomCode: string) {
    const deleted = await this.mutate((state) => {
      const room = this.requireGM(member, state);
      if (room.code !== roomCode.trim().toUpperCase())
        throw new Error('Room code confirmation mismatch.');
      state.rooms = state.rooms.filter((r) => r.id !== room.id);
      state.panels = state.panels.filter((p) => p.roomId !== room.id);
      state.sessions = state.sessions.filter((s) => s.roomId !== room.id);
      return { roomId: room.id, roomCode: room.code };
    });
    this.online.delete(deleted.roomId);
    for (const key of this.travelCooldown.keys())
      if (key.startsWith(`${deleted.roomId}:`)) this.travelCooldown.delete(key);
    this.events.emit('roomDeleted', deleted);
    return true;
  }
  async leaveRoom(member: Session) {
    return this.mutate((state) => {
      const actor = this.session(state, member),
        room = this.roomFor(state, actor);
      if (actor.role !== 'player') throw new Error('Only players can leave a campaign.');
      delete actor.token;
      actor.departed = true;
      room.travelVote = null;
      if (room.activeCombat) {
        room.activeCombat.partyIds = room.activeCombat.partyIds.filter((id) => id !== actor.id);
        this.skipIncapacitated(state, room);
      }
      return true;
    });
  }
  async saveMonsterDefinition(member: Session, input: unknown) {
    const definition = monsterDefinitionSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        definitions = (room.monsterDefinitions ??= structuredClone(defaultMonsters));
      const index = definitions.findIndex((d) => d.id === definition.id);
      if (index < 0 && definitions.length >= 40)
        throw new Error('A table can have up to 40 monster definitions.');
      if (index < 0) definitions.push({ ...definition, isCustom: true });
      else
        definitions[index] = {
          ...definition,
          isCustom: !defaultMonsters.some((m) => m.id === definition.id),
        };
      room.updatedAt = now();
    });
  }
  async deleteMonsterDefinition(member: Session, id: string) {
    id = monsterDefinitionSchema.shape.id.parse(id);
    return this.mutate((state) => {
      const room = this.requireGM(member, state);
      room.monsterDefinitions = (room.monsterDefinitions ?? []).filter((d) => d.id !== id);
      room.updatedAt = now();
    });
  }
  private monster(
    state: StoredGame,
    room: Room,
    panelId: string,
    monsterId: string,
  ): MonsterInstance {
    const monster = this.panel(state, room.id, panelId).monsters?.find((m) => m.id === monsterId);
    if (!monster) throw new Error('Monster not found in this scene.');
    return monster;
  }
  private freeMonsterPosition(
    state: StoredGame,
    room: Room,
    panel: Panel,
    x: number,
    y: number,
    ignoreId?: string,
  ) {
    const withoutSelf = { ...panel, monsters: panel.monsters?.filter((m) => m.id !== ignoreId) };
    if (
      !walkable(withoutSelf, { x, y }) ||
      state.sessions.some(
        (s) =>
          !s.departed &&
          s.roomId === room.id &&
          s.token?.panelId === panel.id &&
          s.token.x === x &&
          s.token.y === y,
      )
    )
      throw new Error('Choose a free walkable tile for the monster.');
  }
  async summonMonster(member: Session, input: unknown) {
    const request = summonMonsterSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        panel = this.panel(state, room.id, request.panelId);
      if ((panel.monsters?.length ?? 0) >= 100)
        throw new Error('A scene can have up to 100 monsters.');
      const definition = room.monsterDefinitions?.find((d) => d.id === request.definitionId);
      if (!definition) throw new Error('Monster definition not found.');
      this.freeMonsterPosition(state, room, panel, request.x, request.y);
      const maxHp = request.customOverrides?.maxHp ?? definition.defaultMaxHp;
      const monster: MonsterInstance = {
        id: randomUUID(),
        panelId: panel.id,
        definitionId: definition.id,
        name: request.name ?? definition.name,
        x: request.x,
        y: request.y,
        currentHp: maxHp,
        maxHp,
        sprite: definition.sprite,
        attributes: structuredClone(request.customOverrides?.attributes ?? definition.attributes),
        attackNotation: request.customOverrides?.attackNotation ?? definition.attackNotation,
        hpVisibility: request.customOverrides?.hpVisibility ?? definition.hpVisibility,
      };
      (panel.monsters ??= []).push(monster);
      panel.updatedAt = room.updatedAt = now();
      return monster;
    });
  }
  async moveMonster(member: Session, input: unknown) {
    const request = moveMonsterSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        panel = this.panel(state, room.id, request.panelId);
      const monster = this.monster(state, room, panel.id, request.monsterId);
      this.freeMonsterPosition(state, room, panel, request.x, request.y, monster.id);
      monster.x = request.x;
      monster.y = request.y;
      panel.updatedAt = room.updatedAt = now();
    });
  }
  async adjustMonsterHp(member: Session, input: unknown) {
    const request = adjustMonsterHpSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        monster = this.monster(state, room, request.panelId, request.monsterId);
      if (request.gmBonusHp !== undefined) {
        const base = monster.maxHp - (monster.gmBonusHp ?? 0);
        monster.gmBonusHp = request.gmBonusHp;
        monster.maxHp = Math.max(1, Math.min(9999, base + request.gmBonusHp));
      }
      const current = request.current ?? monster.currentHp + (request.delta ?? 0);
      if (monster.currentHp === 0 && current > 0)
        this.freeMonsterPosition(
          state,
          room,
          this.panel(state, room.id, request.panelId),
          monster.x,
          monster.y,
          monster.id,
        );
      monster.currentHp = Math.max(0, Math.min(monster.maxHp, current));
      this.spawnCharacters(state, room);
      this.skipIncapacitated(state, room);
      this.panel(state, room.id, request.panelId).updatedAt = room.updatedAt = now();
    });
  }
  async setMonsterVisibility(member: Session, input: unknown) {
    const request = setMonsterVisibilitySchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state);
      this.monster(state, room, request.panelId, request.monsterId).hpVisibility =
        request.hpVisibility;
      room.updatedAt = now();
    });
  }
  async removeMonster(member: Session, input: unknown) {
    const request = monsterReferenceSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        panel = this.panel(state, room.id, request.panelId);
      this.monster(state, room, panel.id, request.monsterId);
      panel.monsters = panel.monsters!.filter((m) => m.id !== request.monsterId);
      if (room.activeCombat?.monsterId === request.monsterId) room.activeCombat = null;
      this.spawnCharacters(state, room);
      panel.updatedAt = room.updatedAt = now();
    });
  }
  private recordRoll(
    room: Room,
    actor: Pick<Session, 'id' | 'nickname' | 'role'>,
    request: DiceRequest,
  ): DiceRoll {
    const values = Array.from({ length: request.count }, () => this.die(request.sides));
    const roll: DiceRoll = {
      ...request,
      id: randomUUID(),
      memberId: actor.id,
      nickname: actor.nickname,
      role: actor.role,
      values,
      total: values.reduce((a, b) => a + b, request.modifier),
      createdAt: now(),
    };
    room.rolls = [...(room.rolls ?? []), roll].slice(-20);
    this.stagedRolls.push({ roomId: room.id, roll });
    room.updatedAt = roll.createdAt;
    return roll;
  }
  private playerModifiers(session: Session, room: Room) {
    const selection = findClassSelection(
      room.classes,
      session.character?.classId,
      session.character?.subclassId,
    );
    return calculateAttributes(selection?.characterClass, selection?.subclass);
  }
  private livingParty(state: StoredGame, room: Room) {
    return state.sessions.filter(
      (s) =>
        s.roomId === room.id &&
        !s.departed &&
        s.role === 'player' &&
        s.character &&
        (s.health?.current ?? 0) > 0 &&
        (!room.activeCombat || room.activeCombat.partyIds.includes(s.id)),
    );
  }
  private beginInitiative(state: StoredGame, room: Room) {
    const combat = room.activeCombat!,
      monster = this.monster(state, room, combat.panelId, combat.monsterId);
    const gm = state.sessions.find((s) => s.id === room.gmId)!;
    const roll = this.recordRoll(
      room,
      { ...gm, nickname: monster.name },
      {
        sides: 20,
        count: 1,
        modifier: monster.attributes.destreza,
        label: `Initiative (Round ${combat.round})`,
      },
    );
    combat.turnQueue = [
      {
        id: monster.id,
        type: 'monster',
        name: monster.name,
        initiative: roll.total,
        dexterityModifier: monster.attributes.destreza,
      },
    ];
    combat.turnIndex = 0;
    combat.status = 'initiative';
    delete combat.lastAction;
  }
  private completeInitiative(state: StoredGame, room: Room) {
    const combat = room.activeCombat!;
    const living = this.initiativeParty(state, room);
    combat.turnQueue = combat.turnQueue.filter(
      (turn) =>
        turn.type === 'monster' || this.livingParty(state, room).some((s) => s.id === turn.id),
    );
    if (living.length && living.every((s) => combat.turnQueue.some((turn) => turn.id === s.id))) {
      combat.turnQueue = sortInitiative(combat.turnQueue);
      combat.turnIndex = 0;
      combat.status = 'active';
    }
  }
  private initiativeParty(state: StoredGame, room: Room) {
    const online = this.online.get(room.id) ?? [];
    return this.livingParty(state, room).filter((s) => online.includes(s.id));
  }
  async refreshCombatInitiative(roomId: string) {
    await this.queue;
    const state = await this.data;
    const room = state.rooms.find((r) => r.id === roomId);
    const combat = room?.activeCombat;
    if (!room || combat?.status !== 'initiative') return false;
    const living = this.initiativeParty(state, room);
    const allReady =
      living.length > 0 && living.every((s) => combat.turnQueue.some((turn) => turn.id === s.id));
    if (!allReady) return false;
    return this.mutate((state) => {
      const room = state.rooms.find((r) => r.id === roomId);
      if (room?.activeCombat?.status !== 'initiative') return false;
      this.skipIncapacitated(state, room);
      return true;
    });
  }
  async rollCombatInitiative(member: Session, input: unknown) {
    const request = combatInitiativeSchema.parse(input);
    return this.mutate((state) => {
      const actor = this.session(state, member),
        room = this.roomFor(state, actor);
      const combat = room.activeCombat;
      if (!combat || combat.id !== request.combatId || combat.round !== request.round)
        throw new Error('Choose the current encounter and initiative round.');
      if (actor.role !== 'player') throw new Error('Only players roll their own initiative.');
      if (!this.initiativeParty(state, room).some((s) => s.id === actor.id))
        throw new Error('Choose a conscious adventurer in this encounter.');
      if (combat.turnQueue.some((turn) => turn.id === actor.id))
        throw new Error('You already rolled initiative for this combat.');
      if (combat.status !== 'initiative') throw new Error('Wait for the initiative phase.');
      const dexterityModifier = this.playerModifiers(actor, room).destreza;
      const roll = this.recordRoll(room, actor, {
        sides: 20,
        count: 1,
        modifier: dexterityModifier,
        label: `Initiative (Round ${combat.round})`,
      });
      combat.turnQueue.push({
        id: actor.id,
        type: 'player',
        name: actor.nickname,
        initiative: roll.total,
        dexterityModifier,
      });
      this.completeInitiative(state, room);
    });
  }
  async startCombat(member: Session, input: unknown) {
    const request = monsterReferenceSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        monster = this.monster(state, room, request.panelId, request.monsterId);
      const panel = this.panel(state, room.id, request.panelId);
      if (panel.fog?.enabled && !panel.fog.revealed.includes(cellKey(monster)))
        throw new Error('Reveal the monster before starting combat.');
      if (room.activeCombat) throw new Error('End the current encounter first.');
      if (room.activePanelId !== request.panelId || monster.currentHp <= 0)
        throw new Error('Choose a living monster in the active scene.');
      const party = this.livingParty(state, room);
      if (!party.length) throw new Error('At least one conscious adventurer is needed for combat.');
      room.travelVote = null;
      room.activeCombat = {
        id: randomUUID(),
        panelId: request.panelId,
        monsterId: monster.id,
        round: 1,
        turnIndex: 0,
        turnQueue: [],
        status: 'initiative',
        partyIds: party.map((s) => s.id),
      };
      this.beginInitiative(state, room);
    });
  }
  private skipIncapacitated(state: StoredGame, room: Room) {
    const combat = room.activeCombat;
    if (!combat || combat.status === 'resolved') return;
    const monster = this.monster(state, room, combat.panelId, combat.monsterId);
    const living = this.livingParty(state, room).filter(
      (s) => combat.status === 'initiative' || combat.turnQueue.some((turn) => turn.id === s.id),
    );
    if (monster.currentHp === 0 || !living.length) {
      combat.status = 'resolved';
      return;
    }
    if (combat.status === 'initiative') {
      this.completeInitiative(state, room);
      return;
    }
    while (combat.turnIndex < combat.turnQueue.length) {
      const turn = combat.turnQueue[combat.turnIndex];
      if (turn.type === 'monster' || living.some((s) => s.id === turn.id)) return;
      combat.turnIndex++;
    }
    combat.round++;
    combat.turnIndex = 0;
    this.skipIncapacitated(state, room);
  }
  private combatTurn(state: StoredGame, room: Room, actor: Session, type?: 'player' | 'monster') {
    const combat = room.activeCombat;
    if (!combat || combat.status !== 'active') throw new Error('No active combat turn.');
    this.skipIncapacitated(state, room);
    const turn = combat.turnQueue[combat.turnIndex];
    if (combat.status !== 'active' || !turn || (type && turn.type !== type))
      throw new Error('Wait for the correct combat turn.');
    if (actor.role !== 'gm' && turn.id !== actor.id) throw new Error('Wait for your combat turn.');
    return { combat, turn };
  }
  async executePlayerAttack(member: Session, input: unknown) {
    const request = playerAttackSchema.parse(input);
    return this.mutate((state) => {
      const actor = this.session(state, member),
        room = this.roomFor(state, actor);
      if (actor.role === 'gm') this.requireGM(actor, state);
      const { combat, turn } = this.combatTurn(state, room, actor, 'player');
      if (request.targetMonsterId !== combat.monsterId)
        throw new Error('Choose the encounter monster.');
      const attacker = state.sessions.find((s) => s.id === turn.id && s.roomId === room.id)!;
      const selection = findClassSelection(
        room.classes,
        attacker.character?.classId,
        attacker.character?.subclassId,
      );
      const attack = classAttack(selection?.characterClass);
      if (request.attackId !== attack.id)
        throw new Error('Choose an attack available to this character.');
      const monster = this.monster(state, room, combat.panelId, combat.monsterId);
      const notation = parseDiceNotation(attack.damageNotation)!;
      const roll = this.recordRoll(room, attacker, {
        ...notation,
        modifier: notation.modifier + this.playerModifiers(attacker, room)[attack.attributeId],
        label: `${attack.name} → ${monster.name}`.slice(0, 80),
      });
      monster.currentHp = Math.max(0, monster.currentHp - Math.max(0, roll.total));
      combat.lastAction = {
        id: roll.id,
        sourceId: attacker.id,
        targetId: monster.id,
        kind: 'attack',
      };
      combat.turnIndex++;
      this.skipIncapacitated(state, room);
      this.panel(state, room.id, combat.panelId).updatedAt = now();
    });
  }
  async executeMonsterAttack(member: Session, input: unknown) {
    const request = monsterAttackSchema.parse(input);
    return this.mutate((state) => {
      const room = this.requireGM(member, state),
        actor = this.session(state, member),
        { combat } = this.combatTurn(state, room, actor, 'monster');
      const target = this.livingParty(state, room).find((s) => s.id === request.targetMemberId);
      if (!target) throw new Error('Choose a conscious adventurer in this encounter.');
      const monster = this.monster(state, room, combat.panelId, combat.monsterId);
      const notation = parseDiceNotation(request.damageNotation ?? monster.attackNotation)!;
      const roll = this.recordRoll(
        room,
        { ...actor, nickname: monster.name },
        { ...notation, label: `${monster.name} → ${target.nickname}`.slice(0, 80) },
      );
      target.health!.current = Math.max(0, target.health!.current - Math.max(0, roll.total));
      combat.lastAction = {
        id: roll.id,
        sourceId: monster.id,
        targetId: target.id,
        kind: 'attack',
      };
      combat.turnIndex++;
      this.skipIncapacitated(state, room);
    });
  }
  async nextCombatTurn(member: Session) {
    return this.mutate((state) => {
      const actor = this.session(state, member),
        room = this.roomFor(state, actor);
      if (actor.role === 'gm') this.requireGM(actor, state);
      const { combat, turn } = this.combatTurn(state, room, actor);
      combat.lastAction = { id: randomUUID(), sourceId: turn.id, targetId: turn.id, kind: 'pass' };
      combat.turnIndex++;
      this.skipIncapacitated(state, room);
      room.updatedAt = now();
    });
  }
  async endCombat(member: Session) {
    return this.mutate((state) => {
      const room = this.requireGM(member, state);
      room.activeCombat = null;
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
      for (const panel of remaining)
        for (const anchor of panel.structures ?? [])
          if (anchor.targetPanelId === panelId) delete anchor.targetPanelId;
      room.travelVote = null;
      if (room.activeCombat?.panelId === panelId) room.activeCombat = null;
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
