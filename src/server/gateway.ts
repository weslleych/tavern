import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { MoveRejected, type GameService } from './game';
import type { Session } from './store';
import type { Ack, ClientEvents, Member, ServerEvents } from '../types/game';
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
    return [...unique.values()].sort((a, b) =>
      a.role === b.role ? a.nickname.localeCompare(b.nickname) : a.role === 'gm' ? -1 : 1,
    );
  }
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
    } catch {
      next(new Error('Your session is invalid. Join the table again.'));
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
          ...(error instanceof MoveRejected ? { code: error.code } : {}),
        });
      }
    }
    socket.on(
      'tile:paint',
      (request, ack) =>
        void run(ack, async () => {
          const tiles = await game.paint(member, request);
          const snapshot = await game.snapshot(member);
          if (snapshot.panel.fog?.enabled || request.panelId !== snapshot.panel.id) {
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
          return token;
        }),
    );
    socket.on(
      'dice:roll',
      (request, ack) =>
        void run(ack, async () => {
          const roll = await game.rollDice(member, request);
          io.to(channel(member.roomId)).emit('dice:rolled', roll);
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
    try {
      socket.emit('room:snapshot', await game.snapshot(member, members(member.roomId)));
      await presence(member.roomId);
    } catch {
      socket.disconnect(true);
    }
  });
  return io;
}
