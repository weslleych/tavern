import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { attachGateway } from '../src/server/gateway';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import type { Credential, Snapshot } from '../src/types/game';

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-socket-'));
  const game = new GameService(new FileStore(join(directory, 'state.json')));
  const server = createServer();
  const gateway = attachGateway(server, game);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const sockets: Socket[] = [];
  const open = (auth: unknown) => {
    const socket = connect(`http://127.0.0.1:${address.port}`, {
      auth: auth as object,
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(socket);
    return socket;
  };
  return {
    game,
    open,
    async close() {
      sockets.forEach((socket) => socket.disconnect());
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function receive<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 5000);
    socket.once(event, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

test('a forged socket credential is rejected before it joins a room', async () => {
  const fixture = await setup();
  try {
    const socket = fixture.open({ roomCode: 'TVRN-ABC234', memberId: 'forged', token: 'forged' });
    const result = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Authentication did not respond')), 5000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve('connected');
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timer);
        resolve(error.message);
      });
    });
    socket.connect();
    assert.match(await result, /session/i);
  } finally {
    await fixture.close();
  }
});

test('authoritative tile updates reach players, forged edits fail, and other rooms stay isolated', async () => {
  const fixture = await setup();
  try {
    const gm = await fixture.game.create({ name: 'Room A', nickname: 'GM', template: 'blank' });
    const player = await fixture.game.join({ code: gm.roomCode, nickname: 'Player' });
    const other = await fixture.game.create({
      name: 'Room B',
      nickname: 'Other',
      template: 'blank',
    });
    const open = async (credential: Credential) => {
      const socket = fixture.open(credential);
      const initial = receive<Snapshot>(socket, 'room:snapshot');
      socket.connect();
      return { socket, snapshot: await initial };
    };
    const master = await open(gm);
    const guest = await open(player);
    const outsider = await open(other);
    let leaked = false;
    outsider.socket.on('tile:updated', () => {
      leaked = true;
    });
    const update = receive<{ tiles: unknown[] }>(guest.socket, 'tile:updated');
    const response = await master.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: master.snapshot.panel.id,
      tiles: [{ x: 2, y: 3, terrain: 'forest', blocked: true }],
    });
    assert.equal(response.ok, true);
    assert.deepEqual((await update).tiles, [{ x: 2, y: 3, terrain: 'forest', blocked: true }]);
    const denied = await guest.socket
      .timeout(3000)
      .emitWithAck('panel:change', outsider.snapshot.panel.id);
    assert.equal(denied.ok, false);
    assert.match(denied.error, /master/i);
    const forged = await guest.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: master.snapshot.panel.id,
      tiles: [{ x: 2, y: 3, terrain: 'water', blocked: false }],
    });
    assert.equal(forged.ok, false);
    assert.equal(leaked, false);
    const saved = await fixture.game.snapshot(await fixture.game.authenticate(gm));
    assert.deepEqual(saved.panel.tiles, [{ x: 2, y: 3, terrain: 'forest', blocked: true }]);
  } finally {
    await fixture.close();
  }
});
