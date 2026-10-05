import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import { defaultAppearance } from '../src/lib/characters';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-initiative-'));
  const store = new FileStore(join(directory, 'state.json'));
  const game = new GameService(store, { rollDie: () => 10 });
  const credential = await game.create({
    name: 'Initiative',
    nickname: 'GM',
    template: 'woodland',
  });
  const gm = await game.authenticate(credential);
  const players = [];
  for (const nickname of ['First', 'Second']) {
    const player = await game.authenticate(
      await game.join({ code: credential.roomCode, nickname }),
    );
    await game.updateCharacter(player, defaultAppearance);
    players.push(player);
  }
  const panel = (await game.snapshot(gm)).panel;
  game.setOnlineMembers(gm.roomId, [gm, ...players]);
  await game.paint(gm, {
    panelId: panel.id,
    tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
  });
  const monster = await game.summonMonster(gm, {
    panelId: panel.id,
    definitionId: 'dragon',
    x: 4,
    y: 4,
  });
  await game.startCombat(gm, { panelId: panel.id, monsterId: monster.id });
  const combat = (await game.snapshot(gm)).room.activeCombat!;
  return {
    game,
    store,
    gm,
    players,
    monster,
    credential,
    request: { combatId: combat.id, round: 1 },
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

test('combat waits for every player initiative and blocks attacks, passing and duplicate rolls', async () => {
  const f = await fixture();
  try {
    const initial = await f.game.snapshot(f.gm);
    assert.equal(initial.room.activeCombat!.status, 'initiative');
    assert.deepEqual(
      initial.rolls.map((r) => r.role),
      ['gm'],
    );
    await assert.rejects(f.game.nextCombatTurn(f.gm), /turn/i);
    await assert.rejects(
      f.game.executeMonsterAttack(f.gm, { targetMemberId: f.players[0].id }),
      /turn/i,
    );
    await assert.rejects(
      f.game.executePlayerAttack(f.players[0], {
        targetMonsterId: f.monster.id,
        attackId: 'basic',
      }),
      /turn/i,
    );
    await assert.rejects(f.game.rollCombatInitiative(f.gm, f.request), /player/i);
    await f.game.rollCombatInitiative(f.players[0], f.request);
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'initiative');
    await assert.rejects(f.game.rollCombatInitiative(f.players[0], f.request), /already/i);
    await f.game.rollCombatInitiative(f.players[1], f.request);
    const active = await f.game.snapshot(f.gm);
    assert.equal(active.room.activeCombat!.status, 'active');
    assert.equal(active.room.activeCombat!.turnQueue.length, 3);
    assert.equal(active.rolls.filter((r) => r.sides === 20).length, 3);
    for (let i = 0; i < 3; i++) await f.game.nextCombatTurn(f.gm);
    const next = await f.game.snapshot(f.gm);
    assert.equal(next.room.activeCombat!.round, 2);
    assert.equal(next.room.activeCombat!.status, 'active');
    assert.deepEqual(next.room.activeCombat!.turnQueue, active.room.activeCombat!.turnQueue);
    assert.equal(next.room.activeCombat!.turnIndex, 0);
    assert.equal(next.rolls.filter((r) => r.sides === 20).length, 3);
    await assert.rejects(f.game.rollCombatInitiative(f.players[0], f.request), /round/i);
    await assert.rejects(
      f.game.rollCombatInitiative(f.players[0], { ...f.request, round: 2 }),
      /already|phase/i,
    );
    const restarted = new GameService(f.store);
    const restored = (await restarted.snapshot(await restarted.authenticate(f.credential))).room
      .activeCombat!;
    assert.deepEqual(restored.turnQueue, active.room.activeCombat!.turnQueue);
    assert.equal(restored.round, 2);
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'active');
  } finally {
    await f.close();
  }
});

test('pending initiative survives restart and failed writes do not publish a roll or start combat', async () => {
  const f = await fixture();
  try {
    await f.game.rollCombatInitiative(f.players[0], f.request);
    const game = new GameService(f.store, { rollDie: () => 10 });
    const gm = await game.authenticate(f.credential);
    game.setOnlineMembers(gm.roomId, [gm, ...f.players]);
    assert.equal((await game.snapshot(gm)).room.activeCombat!.status, 'initiative');
    const rolls: unknown[] = [];
    game.events.on('diceRolls', (batch) => rolls.push(...batch.rolls));
    const save = f.store.save.bind(f.store);
    f.store.save = async () => {
      throw new Error('Disk unavailable');
    };
    await assert.rejects(game.rollCombatInitiative(f.players[1], f.request), /Disk/);
    assert.deepEqual(rolls, []);
    assert.equal((await game.snapshot(gm)).room.activeCombat!.status, 'initiative');
    f.store.save = save;
    await game.rollCombatInitiative(f.players[1], f.request);
    assert.equal((await game.snapshot(gm)).room.activeCombat!.status, 'active');
  } finally {
    await f.close();
  }
});

test('KO and departed participants stop blocking initiative; late joiners cannot roll', async () => {
  const f = await fixture();
  try {
    const outsider = await f.game.authenticate(
      await f.game.join({ code: f.credential.roomCode, nickname: 'Late' }),
    );
    await f.game.updateCharacter(outsider, defaultAppearance);
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, ...f.players, outsider]);
    await assert.rejects(f.game.rollCombatInitiative(outsider, f.request), /encounter/i);
    await f.game.rollCombatInitiative(f.players[0], f.request);
    await f.game.adjustHealth(f.gm, { memberId: f.players[1].id, current: 0 });
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'active');
    await f.game.endCombat(f.gm);
    await f.game.adjustHealth(f.gm, { memberId: f.players[1].id, current: 20 });
    const panel = (await f.game.snapshot(f.gm)).panel;
    await f.game.startCombat(f.gm, { panelId: panel.id, monsterId: f.monster.id });
    const combat = (await f.game.snapshot(f.gm)).room.activeCombat!;
    await f.game.rollCombatInitiative(f.players[0], { combatId: combat.id, round: 1 });
    await f.game.rollCombatInitiative(outsider, { combatId: combat.id, round: 1 });
    await f.game.leaveRoom(f.players[1]);
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'active');
  } finally {
    await f.close();
  }
});

test('offline adventurers do not need initiative and the initial turn order repeats without new rolls', async () => {
  const f = await fixture();
  try {
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, f.players[0]]);
    await f.game.rollCombatInitiative(f.players[0], f.request);
    const active = (await f.game.snapshot(f.gm)).room.activeCombat!;
    assert.equal(active.status, 'active');
    assert.deepEqual(
      active.turnQueue.map((turn) => turn.id),
      [f.monster.id, f.players[0].id],
    );
    await f.game.nextCombatTurn(f.gm);
    await f.game.nextCombatTurn(f.gm);
    const next = await f.game.snapshot(f.gm);
    assert.equal(next.room.activeCombat!.status, 'active');
    assert.deepEqual(next.room.activeCombat!.turnQueue, active.turnQueue);
    assert.equal(next.rolls.length, 2);
  } finally {
    await f.close();
  }
});

test('disconnecting the last pending player unlocks combat, while no online players keeps it waiting', async () => {
  const f = await fixture();
  try {
    f.game.setOnlineMembers(f.gm.roomId, [f.gm]);
    await f.game.refreshCombatInitiative(f.gm.roomId);
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'initiative');
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, ...f.players]);
    await f.game.refreshCombatInitiative(f.gm.roomId);
    await f.game.rollCombatInitiative(f.players[0], f.request);
    const started: unknown[] = [];
    f.game.events.on('combatStarted', (event) => started.push(event));
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, f.players[0]]);
    await f.game.refreshCombatInitiative(f.gm.roomId);
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'active');
    assert.equal(started.length, 1);
    await f.game.refreshCombatInitiative(f.gm.roomId);
    assert.equal(started.length, 1);
  } finally {
    await f.close();
  }
});

test('fixed initiative resolves when every rolled adventurer is KO, regardless of offline saved seats', async () => {
  const f = await fixture();
  try {
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, f.players[0]]);
    await f.game.rollCombatInitiative(f.players[0], f.request);
    const initial = (await f.game.snapshot(f.gm)).room.activeCombat!;
    await f.game.nextCombatTurn(f.gm);
    await f.game.nextCombatTurn(f.gm);
    const round = await f.game.snapshot(f.gm);
    assert.deepEqual(round.room.activeCombat!.turnQueue, initial.turnQueue);
    assert.equal(round.rolls.length, 2);
    await f.game.adjustHealth(f.gm, { memberId: f.players[0].id, current: 0 });
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat!.status, 'resolved');
  } finally {
    await f.close();
  }
});
