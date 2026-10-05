import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { MoveRejected, RoomNotFound, Unauthorized, type GameService } from './game';
import type { Session } from './store';
import type { Ack, ClientEvents, DiceRoll, Member, ServerEvents } from '../types/game';
import { readableError } from '../lib/validation';

interface SocketData {
  member: Session;
}
export function attachGateway(server: HttpServer, game: GameService) {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(server, {
    maxHttpBufferSize: 512 * 1024,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      const expected = process.env.APP_ORIGIN || `http://${request.headers.host}`;
      callback(null, !origin || origin === expected);
    },
  });
  const channel = (roomId: string) => `room:${roomId}`;
  function members(roomId: string): Member[] {
    const unique = new Map<string, Member>();
    for (const socket of io.sockets.sockets.values()) {
      const member = socket.data.member;
      if (member?.roomId === roomId && socket.rooms.has(channel(roomId)))
        unique.set(member.id, { id: member.id, nickname: member.nickname, role: member.role });
    }
    const result = [...unique.values()].sort((a, b) =>
      a.role === b.role ? a.nickname.localeCompare(b.nickname) : a.role === 'gm' ? -1 : 1,
    );
    game.setOnlineMembers(roomId, result);
    return result;
  }
  const onDeleted = ({ roomId, roomCode }: { roomId: string; roomCode: string }) => {
    io.to(channel(roomId)).emit('room:destroyed', {
      roomCode,
      reason: 'gm_deleted',
      message: 'Campaign deleted by its game master.',
    });
    setTimeout(() => io.in(channel(roomId)).disconnectSockets(true), 25).unref();
  };
  game.events.on('roomDeleted', onDeleted);
  const onUnlinked = ({ roomId, memberId }: { roomId: string; memberId: string }) => {
    for (const socket of io.sockets.sockets.values())
      if (socket.data.member?.roomId === roomId && socket.data.member.id === memberId)
        socket.emit('poi:unlinked');
  };
  game.events.on('poiUnlinked', onUnlinked);
  const onDiceRolls = ({ roomId, rolls }: { roomId: string; rolls: DiceRoll[] }) => {
    for (const roll of rolls) io.to(channel(roomId)).emit('dice:rolled', roll);
  };
  game.events.on('diceRolls', onDiceRolls);
  let expiring = false;
  const expiryTimer = setInterval(() => {
    if (expiring) return;
    expiring = true;
    void game
      .expireTravel()
      .then(async (cancelled) => {
        for (const item of cancelled) {
          io.to(channel(item.roomId)).emit('poi:cancelled', { reason: item.reason });
          await snapshots(item.roomId);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        expiring = false;
      });
  }, 500);
  expiryTimer.unref();
  io.engine.on('close', () => {
    clearInterval(expiryTimer);
    game.events.off('roomDeleted', onDeleted);
    game.events.off('poiUnlinked', onUnlinked);
    game.events.off('diceRolls', onDiceRolls);
  });
  async function snapshots(roomId: string) {
    const online = members(roomId);
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.member?.roomId === roomId && socket.rooms.has(channel(roomId))) {
        socket.emit('room:snapshot', await game.snapshot(socket.data.member, online));
      }
    }
  }
  async function presence(roomId: string) {
    const online = members(roomId);
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.member?.roomId === roomId && socket.rooms.has(channel(roomId))) {
        const view = await game.snapshot(socket.data.member, online);
        socket.emit('room:presence', view.members);
      }
    }
  }
  io.use(async (socket, next) => {
    try {
      socket.data.member = await game.authenticate(socket.handshake.auth);
      next();
    } catch (cause) {
      const error = new Error(
        cause instanceof RoomNotFound
          ? 'Table not found.'
          : 'Your session is invalid. Join the table again.',
      ) as Error & { data?: { code: string } };
      if (cause instanceof RoomNotFound) error.data = { code: cause.code };
      next(error);
    }
  });
  io.on('connection', async (socket) => {
    const member = socket.data.member;
    await socket.join(channel(member.roomId));
    let windowStart = Date.now();
    let actions = 0;
    async function run<T>(ack: Ack<T>, action: () => Promise<T>) {
      if (typeof ack !== 'function') return;
      if (Date.now() - windowStart > 1000) {
        windowStart = Date.now();
        actions = 0;
      }
      if (++actions > 80) {
        ack({ ok: false, error: 'Too many actions. Give the table a moment.' });
        return;
      }
      try {
        ack({ ok: true, data: await action() });
      } catch (error) {
        ack({
          ok: false,
          error: readableError(error),
          ...(error instanceof MoveRejected ||
          error instanceof RoomNotFound ||
          error instanceof Unauthorized
            ? { code: error.code }
            : {}),
        });
      }
    }
    socket.on(
      'tile:paint',
      (request, ack) =>
        void run(ack, async () => {
          const previous = await game.snapshot(member);
          const tiles = await game.paint(member, request);
          const snapshot = await game.snapshot(member);
          if (
            snapshot.panel.fog?.enabled ||
            request.panelId !== snapshot.panel.id ||
            previous.panel.structures?.length ||
            snapshot.panel.structures?.length ||
            request.tiles.some((t) => t.terrain === 'empty')
          ) {
            await snapshots(member.roomId);
          } else {
            io.to(channel(member.roomId)).emit('tile:updated', {
              panelId: request.panelId,
              tiles,
              updatedAt: snapshot.room.updatedAt,
            });
            await presence(member.roomId);
          }
          return tiles;
        }),
    );
    socket.on(
      'panel:change',
      (id, ack) =>
        void run(ack, async () => {
          await game.changePanel(member, id);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:create',
      (request, ack) =>
        void run(ack, async () => {
          await game.createPanel(member, request);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:rename',
      (request, ack) =>
        void run(ack, async () => {
          await game.renamePanel(member, request);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:import',
      (request, ack) =>
        void run(ack, async () => {
          await game.importPanel(member, request);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'character:update',
      (request, ack) =>
        void run(ack, async () => {
          const character = await game.updateCharacter(member, request);
          await snapshots(member.roomId);
          await presence(member.roomId);
          return character;
        }),
    );
    socket.on(
      'token:move',
      (request, ack) =>
        void run(ack, async () => {
          const token = await game.moveToken(member, request);
          const memberId = request.memberId || member.id;
          const online = members(member.roomId);
          for (const recipient of io.sockets.sockets.values()) {
            if (
              recipient.data.member?.roomId === member.roomId &&
              recipient.rooms.has(channel(member.roomId))
            ) {
              const view = await game.snapshot(recipient.data.member, online);
              recipient.emit('token:moved', {
                memberId,
                token: view.members.find((item) => item.id === memberId)?.token,
              });
            }
          }
          const view = await game.snapshot(member, online);
          if (view.room.travelVote) {
            io.to(channel(member.roomId)).emit('poi:prompt', view.room.travelVote);
            await snapshots(member.roomId);
          }
          return token;
        }),
    );
    socket.on(
      'health:update',
      (request, ack) =>
        void run(ack, async () => {
          const update = await game.adjustHealth(member, request);
          io.to(channel(member.roomId)).emit('health:updated', update);
          await snapshots(member.roomId);
          await presence(member.roomId);
          return update.health;
        }),
    );
    socket.on(
      'dice:roll',
      (request, ack) =>
        void run(ack, async () => {
          const roll = await game.rollDice(member, request);
          return roll;
        }),
    );
    socket.on(
      'room:movement',
      (request, ack) =>
        void run(ack, async () => {
          await game.setMovement(member, request);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'room:classes',
      (request, ack) =>
        void run(ack, async () => {
          await game.updateClasses(member, request);
          await snapshots(member.roomId);
          await presence(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:spawn',
      (request, ack) =>
        void run(ack, async () => {
          await game.setSpawn(member, request);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'fog:update',
      (request, ack) =>
        void run(ack, async () => {
          await game.updateFog(member, request);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:duplicate',
      (id, ack) =>
        void run(ack, async () => {
          await game.duplicatePanel(member, id);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:remove',
      (id, ack) =>
        void run(ack, async () => {
          await game.removePanel(member, id);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on(
      'panel:reorder',
      (ids, ack) =>
        void run(ack, async () => {
          await game.reorderPanels(member, ids);
          await snapshots(member.roomId);
          return null;
        }),
    );
    socket.on('disconnect', () => {
      void presence(member.roomId).catch(() => undefined);
    });
    const update = async (action: () => Promise<unknown>, combat = false) => {
      const before = await game.snapshot(member, members(member.roomId));
      await action();
      const after = await game.snapshot(member, members(member.roomId));
      if (combat && !before.room.activeCombat && after.room.activeCombat) {
        for (const recipient of io.sockets.sockets.values())
          if (
            recipient.data.member?.roomId === member.roomId &&
            recipient.rooms.has(channel(member.roomId))
          )
            recipient.emit('combat:started', {
              combat: (await game.snapshot(recipient.data.member, members(member.roomId))).room
                .activeCombat!,
            });
      }
      if (before.room.travelVote && !after.room.travelVote && before.panel.id === after.panel.id)
        io.to(channel(member.roomId)).emit('poi:cancelled', { reason: 'declined' });
      if (before.room.activeCombat && !after.room.activeCombat)
        io.to(channel(member.roomId)).emit('combat:ended', {
          reason: before.room.activeCombat.status === 'resolved' ? 'victory' : 'gm_dismissed',
        });
      await snapshots(member.roomId);
      await presence(member.roomId);
      return null;
    };
    socket.on(
      'structure:place',
      (request, ack) => void run(ack, () => update(() => game.placeStructure(member, request))),
    );
    socket.on(
      'poi:configure',
      (request, ack) => void run(ack, () => update(() => game.configurePoi(member, request))),
    );
    socket.on(
      'poi:vote',
      (request, ack) => void run(ack, () => update(() => game.voteTravel(member, request))),
    );
    socket.on(
      'poi:gm_decide',
      (request, ack) => void run(ack, () => update(() => game.decideTravel(member, request))),
    );
    socket.on(
      'monster:save_definition',
      (request, ack) =>
        void run(ack, () => update(() => game.saveMonsterDefinition(member, request))),
    );
    socket.on(
      'monster:delete_definition',
      (id, ack) => void run(ack, () => update(() => game.deleteMonsterDefinition(member, id))),
    );
    socket.on(
      'monster:summon',
      (request, ack) => void run(ack, () => update(() => game.summonMonster(member, request))),
    );
    socket.on(
      'monster:move',
      (request, ack) => void run(ack, () => update(() => game.moveMonster(member, request))),
    );
    socket.on(
      'monster:adjust_hp',
      (request, ack) => void run(ack, () => update(() => game.adjustMonsterHp(member, request))),
    );
    socket.on(
      'monster:set_visibility',
      (request, ack) =>
        void run(ack, () => update(() => game.setMonsterVisibility(member, request))),
    );
    socket.on(
      'monster:remove',
      (request, ack) => void run(ack, () => update(() => game.removeMonster(member, request))),
    );
    socket.on(
      'combat:start',
      (request, ack) => void run(ack, () => update(() => game.startCombat(member, request), true)),
    );
    socket.on(
      'combat:attack_player',
      (request, ack) =>
        void run(ack, () => update(() => game.executePlayerAttack(member, request), true)),
    );
    socket.on(
      'combat:attack_monster',
      (request, ack) =>
        void run(ack, () => update(() => game.executeMonsterAttack(member, request), true)),
    );
    socket.on(
      'combat:next_turn',
      (ack) => void run(ack, () => update(() => game.nextCombatTurn(member), true)),
    );
    socket.on(
      'combat:end',
      (ack) => void run(ack, () => update(() => game.endCombat(member), true)),
    );
    socket.on(
      'room:delete',
      (ack) =>
        void run(ack, async () => ({
          success: await game.deleteRoom(member, (await game.snapshot(member)).room.code),
        })),
    );
    socket.on(
      'room:leave',
      (ack) =>
        void run(ack, async () => {
          const success = await game.leaveRoom(member);
          for (const seat of io.sockets.sockets.values())
            if (seat.data.member?.id === member.id) {
              seat.emit('session:ended', { reason: 'left' });
              await seat.leave(channel(member.roomId));
              setTimeout(() => seat.disconnect(true), 25).unref();
            }
          await snapshots(member.roomId);
          await presence(member.roomId);
          return { success };
        }),
    );
    try {
      socket.emit('room:snapshot', await game.snapshot(member, members(member.roomId)));
      await presence(member.roomId);
    } catch {
      socket.disconnect(true);
    }
  });
  return io;
}
