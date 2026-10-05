import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import { attachGateway } from '../src/server/gateway';
import { createApi } from '../src/server/http';
import { defaultAppearance } from '../src/lib/characters';
import type { Credential, Snapshot } from '../src/types/game';

function receive<T>(
  socket: Socket,
  event: string,
  accept: (value: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = (value: T) => {
      if (!accept(value)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Missing ${event}`));
    }, 3000);
    socket.on(event, listener);
  });
}
async function fixture(options: ConstructorParameters<typeof GameService>[1] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-expansion-live-'));
  const store = new FileStore(join(directory, 'store.json')),
    game = new GameService(store, options);
  const api = createApi(game),
    server = createServer((req, res) => {
      void api(req, res);
    }),
    gateway = attachGateway(server, game);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    sockets: Socket[] = [];
  const open = async (credential: Credential) => {
    const socket = io(url, {
      auth: credential,
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    sockets.push(socket);
    const initial = receive<Snapshot>(socket, 'room:snapshot');
    socket.connect();
    await initial;
    return socket;
  };
  const gm = await game.create({ name: 'World', nickname: 'GM', template: 'woodland' }),
    player = await game.join({ code: gm.roomCode, nickname: 'Hero' });
  const master = await open(gm),
    guest = await open(player),
    actor = await game.authenticate(gm),
    hero = await game.authenticate(player);
  await game.updateCharacter(hero, defaultAppearance);
  return {
    store,
    game,
    url,
    gm,
    player,
    master,
    guest,
    actor,
    hero,
    open,
    close: async () => {
      sockets.forEach((s) => s.disconnect());
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('failed HTTP deletion and combat writes return errors without teardown or publishing uncommitted rolls', async () => {
  const f = await fixture();
  try {
    const panel = (await f.game.snapshot(f.actor)).panel;
    await f.game.paint(f.actor, {
      panelId: panel.id,
      tiles: [{ x: 3, y: 0, terrain: 'grass', blocked: false }],
    });
    const monster = await f.game.summonMonster(f.actor, {
      panelId: panel.id,
      definitionId: 'slime',
      x: 3,
      y: 0,
    });
    const events: string[] = [];
    f.guest.on('dice:rolled', () => events.push('roll'));
    f.guest.on('combat:started', () => events.push('combat'));
    f.guest.on('room:destroyed', () => events.push('destroyed'));
    const save = f.store.save.bind(f.store);
    f.store.save = async () => {
      throw new Error('Disk unavailable.');
    };
    const response = await fetch(`${f.url}/api/rooms/${f.gm.roomCode}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${f.gm.token}`, 'X-Member-Id': f.gm.memberId },
    });
    assert.equal(response.status, 500);
    assert.equal(
      (
        await f.master
          .timeout(2000)
          .emitWithAck('combat:start', { panelId: panel.id, monsterId: monster.id })
      ).ok,
      false,
    );
    assert.equal(await f.game.roomExists(f.gm.roomCode), true);
    assert.equal((await f.game.snapshot(f.actor)).room.activeCombat, null);
    assert.equal(events.length, 0);
    f.store.save = save;
    const rolls: unknown[] = [];
    f.guest.on('dice:rolled', (roll) => rolls.push(roll));
    const snapshot = receive<Snapshot>(f.guest, 'room:snapshot');
    assert.equal(
      (
        await f.master
          .timeout(2000)
          .emitWithAck('combat:start', { panelId: panel.id, monsterId: monster.id })
      ).ok,
      true,
    );
    const waiting = (await snapshot).room.activeCombat!;
    assert.equal(waiting.status, 'initiative');
    assert.equal(rolls.length, 1);
    assert.equal(events.includes('combat'), false);
    const activated = receive<Snapshot>(f.guest, 'room:snapshot');
    assert.equal(
      (
        await f.guest
          .timeout(2000)
          .emitWithAck('combat:initiative', { combatId: waiting.id, round: 1 })
      ).ok,
      true,
    );
    assert.equal((await activated).room.activeCombat!.status, 'active');
    assert.equal(rolls.length, 2);
    const left = receive(f.guest, 'session:ended');
    assert.equal((await f.guest.timeout(2000).emitWithAck('room:leave')).ok, true);
    await left;
    await assert.rejects(f.game.authenticate(f.player), /session/i);
    assert.equal(await f.game.roomExists(f.gm.roomCode), true);
  } finally {
    await f.close();
  }
});

test('socket travel deduplicates seats, requires both votes and approval, relocates the party and expires safely', async () => {
  let time = 1000;
  const f = await fixture({ clock: () => time });
  try {
    const second = await f.game.join({ code: f.gm.roomCode, nickname: 'Companion' }),
      companion = await f.open(second);
    await f.open(f.player);
    await f.game.updateCharacter(await f.game.authenticate(second), defaultAppearance);
    const source = (await f.game.snapshot(f.actor)).panel;
    await f.game.createPanel(f.actor, { name: 'Town', cols: 8, rows: 8, template: 'woodland' });
    const target = (await f.game.snapshot(f.actor)).panel.id;
    await f.game.changePanel(f.actor, source.id);
    const poi = await f.game.placeStructure(f.actor, {
      panelId: source.id,
      templateKey: 'poi_town',
      x: 4,
      y: 4,
    });
    await f.game.configurePoi(f.actor, {
      panelId: source.id,
      structureId: poi.id,
      name: 'Town',
      targetPanelId: target,
    });
    await f.game.paint(f.actor, {
      panelId: source.id,
      tiles: [{ x: 5, y: 7, terrain: 'grass', blocked: false }],
    });
    await f.master
      .timeout(2000)
      .emitWithAck('token:move', { panelId: source.id, memberId: f.hero.id, x: 5, y: 7 });
    const prompt = receive<{ id: string; playerIds: string[] }>(companion, 'poi:prompt');
    assert.equal(
      (await f.guest.timeout(2000).emitWithAck('token:move', { panelId: source.id, x: 5, y: 6 }))
        .ok,
      true,
    );
    const vote = await prompt;
    assert.equal(vote.playerIds.length, 2);
    await f.guest.timeout(2000).emitWithAck('poi:vote', { voteId: vote.id, accept: true });
    await f.master.timeout(2000).emitWithAck('poi:gm_decide', { voteId: vote.id, approved: true });
    assert.equal((await f.game.snapshot(f.actor)).panel.id, source.id);
    const destination = receive<Snapshot>(
      f.guest,
      'room:snapshot',
      (view) => view.panel.id === target,
    );
    assert.equal(
      (await companion.timeout(2000).emitWithAck('poi:vote', { voteId: vote.id, accept: true })).ok,
      true,
    );
    const arrived = await destination;
    assert.equal(arrived.panel.id, target);
    assert.equal(arrived.members.filter((m) => m.token?.panelId === target).length, 2);
    await f.master.timeout(2000).emitWithAck('panel:change', source.id);
    await f.master
      .timeout(2000)
      .emitWithAck('token:move', { panelId: source.id, memberId: f.hero.id, x: 5, y: 7 });
    await f.guest.timeout(2000).emitWithAck('token:move', { panelId: source.id, x: 5, y: 6 });
    const cancelled = receive<{ reason: string }>(f.guest, 'poi:cancelled');
    time += 30001;
    assert.equal((await cancelled).reason, 'timeout');
    assert.equal((await f.game.snapshot(f.actor)).room.travelVote, null);
    time += 10001;
    await f.master
      .timeout(2000)
      .emitWithAck('token:move', { panelId: source.id, memberId: f.hero.id, x: 5, y: 7 });
    const retry = receive<{ id: string }>(f.guest, 'poi:prompt');
    await f.guest.timeout(2000).emitWithAck('token:move', { panelId: source.id, x: 5, y: 6 });
    const veto = receive<{ reason: string }>(f.guest, 'poi:cancelled');
    await f.master
      .timeout(2000)
      .emitWithAck('poi:gm_decide', { voteId: (await retry).id, approved: false });
    assert.equal((await veto).reason, 'declined');
    assert.equal((await f.game.snapshot(f.actor)).panel.id, source.id);
  } finally {
    await f.close();
  }
});
test('socket monsters send personalized snapshots, combat restores, and HTTP deletion tears down every seat', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-expansion-io-'));
  const game = new GameService(new FileStore(join(directory, 'store.json')));
  const api = createApi(game),
    server = createServer((req, res) => {
      void api(req, res);
    }),
    gateway = attachGateway(server, game);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const sockets: Socket[] = [];
  const open = async (credential: Credential) => {
    const socket = io(url, {
      auth: credential,
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    sockets.push(socket);
    const initial = receive<Snapshot>(socket, 'room:snapshot');
    socket.connect();
    await initial;
    return socket;
  };
  try {
    const gm = await game.create({ name: 'World', nickname: 'GM', template: 'woodland' }),
      player = await game.join({ code: gm.roomCode, nickname: 'Hero' });
    const master = await open(gm),
      guest = await open(player);
    await game.updateCharacter(await game.authenticate(player), defaultAppearance);
    const panel = (await game.snapshot(await game.authenticate(gm))).panel;
    await game.paint(await game.authenticate(gm), {
      panelId: panel.id,
      tiles: [{ x: 3, y: 0, terrain: 'grass', blocked: false }],
    });
    const view = receive<Snapshot>(guest, 'room:snapshot');
    const summoned = await master
      .timeout(2000)
      .emitWithAck('monster:summon', { panelId: panel.id, definitionId: 'slime', x: 3, y: 0 });
    assert.equal(summoned.ok, true, 'monster gateway is missing');
    const monster = (await view).panel.monsters![0];
    assert.equal('maxHp' in monster, false);
    assert.equal(monster.healthRatio, 1);
    const privateView = receive<Snapshot>(guest, 'room:snapshot');
    assert.equal(
      (
        await master.timeout(2000).emitWithAck('monster:set_visibility', {
          panelId: panel.id,
          monsterId: monster.id,
          hpVisibility: 'gm_only',
        })
      ).ok,
      true,
    );
    assert.equal('healthRatio' in (await privateView).panel.monsters![0], false);
    assert.equal(
      (
        await guest
          .timeout(2000)
          .emitWithAck('combat:start', { panelId: panel.id, monsterId: monster.id })
      ).ok,
      false,
    );
    const arena = receive<Snapshot>(guest, 'room:snapshot');
    assert.equal(
      (
        await master
          .timeout(2000)
          .emitWithAck('combat:start', { panelId: panel.id, monsterId: monster.id })
      ).ok,
      true,
    );
    const waiting = (await arena).room.activeCombat!;
    assert.equal(waiting.status, 'initiative');
    const activated = receive<Snapshot>(guest, 'room:snapshot');
    assert.equal(
      (
        await guest
          .timeout(2000)
          .emitWithAck('combat:initiative', { combatId: waiting.id, round: 1 })
      ).ok,
      true,
    );
    const combat = (await activated).room.activeCombat!;
    assert.equal(combat.turnQueue.length, 2);
    assert.equal(JSON.stringify(combat).includes('maxHp'), false);
    guest.disconnect();
    const rejoined = receive<Snapshot>(guest, 'room:snapshot');
    guest.connect();
    assert.equal((await rejoined).room.activeCombat?.id, combat.id);
    const denied = await fetch(`${url}/api/rooms/${gm.roomCode}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${player.token}`, 'X-Member-Id': player.memberId },
    });
    assert.equal(denied.status, 403);
    const destroyed = receive(guest, 'room:destroyed');
    const deleted = await fetch(`${url}/api/rooms/${gm.roomCode}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${gm.token}`, 'X-Member-Id': gm.memberId },
    });
    assert.equal(deleted.status, 200);
    assert.equal(((await destroyed) as { reason: string }).reason, 'gm_deleted');
    assert.equal((await fetch(`${url}/api/rooms/${gm.roomCode}`)).status, 404);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
