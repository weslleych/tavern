import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { GameService } from './game';
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
        ack({ ok: false, error: readableError(error) });
      }
    }
    socket.on(
      'tile:paint',
      (request, ack) =>
        void run(ack, async () => {
          const tiles = await game.paint(member, request);
          const snapshot = await game.snapshot(member);
          io.to(channel(member.roomId)).emit('tile:updated', {
            panelId: request.panelId,
            tiles,
            updatedAt: snapshot.room.updatedAt,
          });
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
    socket.on('disconnect', () =>
      io.to(channel(member.roomId)).emit('room:presence', members(member.roomId)),
    );
    try {
      socket.emit('room:snapshot', await game.snapshot(member, members(member.roomId)));
      io.to(channel(member.roomId)).emit('room:presence', members(member.roomId));
    } catch {
      socket.disconnect(true);
    }
  });
  return io;
}
