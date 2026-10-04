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

test('characters, movement and dice synchronize; fog never leaks hidden edits, tokens or sprites to players or another room', async () => {
  const f = await setup();
  try {
    const gm = await f.game.create({ name: 'Play', nickname: 'GM', template: 'blank' });
    const player = await f.game.join({ code: gm.roomCode, nickname: 'Player' });
    const companion = await f.game.join({ code: gm.roomCode, nickname: 'Companion' });
    const other = await f.game.create({ name: 'Other', nickname: 'Other', template: 'blank' });
    const open = async (credential: Credential) => {
      const socket = f.open(credential);
      const initial = receive<Snapshot>(socket, 'room:snapshot');
      socket.connect();
      return { socket, snapshot: await initial };
    };
    const master = await open(gm),
      guest = await open(player),
      friend = await open(companion),
      outsider = await open(other);
    const panelId = master.snapshot.panel.id;
    await master.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'grass', blocked: false },
        { x: 2, y: 0, terrain: 'stone', blocked: false },
      ],
    });
    const appearance = {
      skinColor: '#fcd0a1',
      hairStyle: 2,
      hairColor: '#69381e',
      shirtStyle: 1,
      shirtColor: '#315d44',
      pantsColor: '#343d46',
    };
    const gmCreated = receive<Snapshot>(guest.socket, 'room:snapshot');
    const characterResponse = await friend.socket
      .timeout(3000)
      .emitWithAck('character:update', appearance);
    assert.equal(characterResponse.ok, true);
    await gmCreated;
    const created = receive<Snapshot>(guest.socket, 'room:snapshot');
    assert.equal(
      (await guest.socket.timeout(3000).emitWithAck('character:update', appearance)).ok,
      true,
    );
    assert.deepEqual((await created).you.token, { x: 1, y: 0, panelId });
    const moved = receive<{ memberId: string; token: unknown }>(master.socket, 'token:moved');
    assert.equal(
      (await guest.socket.timeout(3000).emitWithAck('token:move', { x: 2, y: 0, panelId })).ok,
      true,
    );
    assert.deepEqual((await moved).token, { x: 2, y: 0, panelId });
    const history = receive<{ total: number }>(master.socket, 'dice:rolled');
    const rolled = await guest.socket
      .timeout(3000)
      .emitWithAck('dice:roll', { sides: 20, count: 1, modifier: 0 });
    assert.equal(rolled.ok, true);
    assert.equal((await history).total, rolled.data.total);
    const fogged = receive<Snapshot>(guest.socket, 'room:snapshot');
    assert.equal(
      (await master.socket.timeout(3000).emitWithAck('fog:update', { panelId, enabled: true })).ok,
      true,
    );
    assert.deepEqual((await fogged).panel.tiles, []);
    let hiddenEdit = false,
      leakedRoom = false;
    guest.socket.on('tile:updated', () => {
      hiddenEdit = true;
    });
    outsider.socket.on('token:moved', () => {
      leakedRoom = true;
    });
    outsider.socket.on('room:snapshot', () => {
      leakedRoom = true;
    });
    const concealed = receive<Snapshot>(guest.socket, 'room:snapshot');
    await master.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId,
      tiles: [{ x: 5, y: 0, terrain: 'wall', blocked: true }],
    });
    assert.deepEqual((await concealed).panel.tiles, []);
    const hiddenMove = receive<{ memberId: string; token?: unknown }>(guest.socket, 'token:moved');
    assert.equal(
      (
        await master.socket
          .timeout(3000)
          .emitWithAck('token:move', { memberId: companion.memberId, x: 1, y: 0, panelId })
      ).ok,
      true,
    );
    assert.equal((await hiddenMove).token, undefined);
    assert.equal(hiddenEdit, false);
    assert.equal(leakedRoom, false);
    assert.equal(
      (await guest.socket.timeout(3000).emitWithAck('fog:update', { panelId, enabled: false })).ok,
      false,
    );
    const fresh = receive<Snapshot>(guest.socket, 'room:snapshot');
    guest.socket.disconnect();
    guest.socket.connect();
    const resumed = await fresh;
    assert.deepEqual(resumed.you.character, appearance);
    assert.deepEqual(resumed.you.token, { x: 2, y: 0, panelId });
    assert.deepEqual(resumed.panel.tiles, []);
    assert.equal(resumed.rolls.length, 1);
  } finally {
    await f.close();
  }
});

test('GM movement permissions and preferred spawn synchronize; ordinary movement refusals carry a quiet code', async () => {
  const f = await setup();
  try {
    const gm = await f.game.create({ name: 'Controls', nickname: 'GM', template: 'blank' });
    const player = await f.game.join({ code: gm.roomCode, nickname: 'Player' });
    const open = async (credential: Credential) => {
      const socket = f.open(credential);
      const initial = receive<Snapshot>(socket, 'room:snapshot');
      socket.connect();
      return { socket, snapshot: await initial };
    };
    const master = await open(gm),
      guest = await open(player);
    const panelId = master.snapshot.panel.id;
    assert.equal(master.snapshot.you.character, undefined);
    assert.equal(master.snapshot.you.token, undefined);
    await master.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'grass', blocked: false },
        { x: 4, y: 0, terrain: 'grass', blocked: false },
      ],
    });
    assert.equal(
      (
        await guest.socket
          .timeout(3000)
          .emitWithAck('panel:spawn', { panelId, point: { x: 4, y: 0 } })
      ).ok,
      false,
    );
    const spawnView = receive<Snapshot>(guest.socket, 'room:snapshot');
    assert.equal(
      (
        await master.socket
          .timeout(3000)
          .emitWithAck('panel:spawn', { panelId, point: { x: 4, y: 0 } })
      ).ok,
      true,
    );
    assert.deepEqual((await spawnView).panel.spawnPoint, { x: 4, y: 0 });
    const appearance = {
      skinColor: '#fcd0a1',
      hairStyle: 2,
      hairColor: '#69381e',
      shirtStyle: 1,
      shirtColor: '#315d44',
      pantsColor: '#343d46',
    };
    assert.equal(
      (await master.socket.timeout(3000).emitWithAck('character:update', appearance)).ok,
      false,
    );
    const created = receive<Snapshot>(guest.socket, 'room:snapshot');
    await guest.socket.timeout(3000).emitWithAck('character:update', appearance);
    assert.deepEqual((await created).you.token, { panelId, x: 4, y: 0 });
    const blocked = await guest.socket
      .timeout(3000)
      .emitWithAck('token:move', { panelId, x: 3, y: 0 });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'MOVE_REJECTED');
    assert.equal(
      (await guest.socket.timeout(3000).emitWithAck('room:movement', { allowed: false })).ok,
      false,
    );
    const paused = receive<Snapshot>(guest.socket, 'room:snapshot');
    await master.socket.timeout(3000).emitWithAck('room:movement', { allowed: false });
    assert.equal((await paused).room.playersCanMove, false);
    const moved = receive<{ memberId: string; token: unknown }>(guest.socket, 'token:moved');
    assert.equal(
      (
        await master.socket
          .timeout(3000)
          .emitWithAck('token:move', { memberId: player.memberId, panelId, x: 0, y: 0 })
      ).ok,
      true,
    );
    assert.deepEqual(await moved, { memberId: player.memberId, token: { panelId, x: 0, y: 0 } });
    const locked = await guest.socket
      .timeout(3000)
      .emitWithAck('token:move', { panelId, x: 1, y: 0 });
    assert.equal(locked.ok, false);
    assert.equal(locked.code, 'MOVE_REJECTED');
    const resumed = receive<Snapshot>(guest.socket, 'room:snapshot');
    await master.socket.timeout(3000).emitWithAck('room:movement', { allowed: true });
    assert.equal((await resumed).room.playersCanMove, true);
    assert.equal(
      (await guest.socket.timeout(3000).emitWithAck('token:move', { panelId, x: 1, y: 0 })).ok,
      true,
    );
    const saved = await f.game.snapshot(await f.game.authenticate(gm));
    assert.equal(saved.you.token, undefined);
    assert.equal(saved.you.character, undefined);
  } finally {
    await f.close();
  }
});

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
