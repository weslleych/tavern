import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import { defaultAppearance } from '../src/lib/characters';
import {
  monsterDefinitionSchema,
  classAttackSchema,
  summonMonsterSchema,
} from '../src/lib/validation';
import { defaultMonsters } from '../src/lib/monsters';
import { defaultClasses } from '../src/lib/classes';
import { sortInitiative } from '../src/lib/combat';

async function fixture(options: ConstructorParameters<typeof GameService>[1] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-expansion-'));
  const store = new FileStore(join(directory, 'state.json'));
  const game = new GameService(store, options);
  const credential = await game.create({ name: 'World', nickname: 'GM', template: 'woodland' });
  const gm = await game.authenticate(credential);
  const playerCredential = await game.join({ code: credential.roomCode, nickname: 'Hero' });
  const player = await game.authenticate(playerCredential);
  await game.updateCharacter(player, defaultAppearance);
  game.setOnlineMembers(gm.roomId, [gm, player]);
  const panel = (await game.snapshot(gm)).panel;
  return {
    game,
    store,
    gm,
    player,
    credential,
    playerCredential,
    panel,
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

test('structures reject partial placement and erasing any child removes the complete footprint', async () => {
  const f = await fixture();
  try {
    assert.equal(
      typeof f.game.placeStructure,
      'function',
      'authoritative structure placement is missing',
    );
    await assert.rejects(
      f.game.placeStructure(f.player, { panelId: f.panel.id, templateKey: 'poi_town', x: 4, y: 4 }),
      /master/i,
    );
    await assert.rejects(
      f.game.placeStructure(f.gm, { panelId: f.panel.id, templateKey: 'poi_town', x: 25, y: 17 }),
      /outside/i,
    );
    const placed = await f.game.placeStructure(f.gm, {
      panelId: f.panel.id,
      templateKey: 'poi_town',
      x: 4,
      y: 4,
    });
    const view = await f.game.snapshot(f.gm);
    const footprint = view.panel.tiles.filter((t) => t.structureId === placed.id);
    assert.equal(footprint.length, 9);
    assert.equal(footprint.filter((t) => !t.blocked).length, 1);
    assert.deepEqual(
      footprint.find((t) => !t.blocked),
      {
        x: 5,
        y: 6,
        terrain: 'cobblestone',
        blocked: false,
        structureId: placed.id,
        structureRoot: false,
      },
    );
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 5, y: 5, terrain: 'empty', blocked: false }],
    });
    const erased = await f.game.snapshot(f.gm);
    assert.equal(erased.panel.structures?.length, 0);
    assert.equal(erased.panel.tiles.filter((t) => t.structureId === placed.id).length, 0);
    const restarted = new GameService(f.store);
    assert.equal(
      (await restarted.snapshot(await restarted.authenticate(f.credential))).panel.structures
        ?.length,
      0,
    );
  } finally {
    await f.close();
  }
});

test('structure overlap, duplication, portable imports and scene deletion never leave orphan footprints or destination IDs', async () => {
  const f = await fixture();
  try {
    const placed = await f.game.placeStructure(f.gm, {
      panelId: f.panel.id,
      templateKey: 'poi_castle',
      x: 4,
      y: 4,
    });
    await f.game.configurePoi(f.gm, {
      panelId: f.panel.id,
      structureId: placed.id,
      name: 'Castle',
      createTemplate: 'dungeon',
    });
    const source = (await f.game.snapshot(f.gm)).panel;
    assert.equal(source.structures![0].targetPanelId !== undefined, true);
    await f.game.duplicatePanel(f.gm, source.id);
    const duplicate = (await f.game.snapshot(f.gm)).panel;
    assert.notEqual(duplicate.structures![0].id, placed.id);
    assert.equal(
      duplicate.tiles.filter((t) => t.structureId === duplicate.structures![0].id).length,
      9,
    );
    await f.game.importPanel(f.gm, {
      version: 1,
      name: 'Portable',
      grid: source.grid,
      tiles: source.tiles,
      structures: source.structures,
    });
    const imported = (await f.game.snapshot(f.gm)).panel;
    assert.notEqual(imported.structures![0].id, placed.id);
    assert.equal(imported.structures![0].targetPanelId, undefined);
    await assert.rejects(
      f.game.importPanel(f.gm, {
        version: 1,
        name: 'Broken',
        grid: source.grid,
        tiles: source.tiles.filter((t) => !(t.x === 4 && t.y === 4)),
        structures: source.structures,
      }),
      /footprint/i,
    );
    await f.game.removePanel(f.gm, source.structures![0].targetPanelId);
    await f.game.changePanel(f.gm, source.id);
    assert.equal((await f.game.snapshot(f.gm)).panel.structures![0].targetPanelId, undefined);
    const next = await f.game.placeStructure(f.gm, {
      panelId: source.id,
      templateKey: 'house_timber',
      x: 5,
      y: 5,
    });
    const overlapped = (await f.game.snapshot(f.gm)).panel;
    assert.equal(overlapped.structures!.length, 1);
    assert.equal(
      overlapped.tiles.some((t) => t.structureId === placed.id),
      false,
    );
    assert.equal(overlapped.tiles.filter((t) => t.structureId === next.id).length, 4);
  } finally {
    await f.close();
  }
});

test('travel veto, expiry, changed electorate and cooldown cancel safely while failed writes preserve an active vote', async () => {
  let clock = 1000;
  const f = await fixture({ clock: () => clock });
  try {
    const anchor = await f.game.placeStructure(f.gm, {
      panelId: f.panel.id,
      templateKey: 'poi_town',
      x: 4,
      y: 4,
    });
    await f.game.configurePoi(f.gm, {
      panelId: f.panel.id,
      structureId: anchor.id,
      name: 'Town',
      createTemplate: 'town',
    });
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 5, y: 7, terrain: 'grass', blocked: false }],
    });
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, f.player]);
    async function trigger() {
      await f.game.moveToken(f.gm, { panelId: f.panel.id, memberId: f.player.id, x: 5, y: 7 });
      await f.game.moveToken(f.player, { panelId: f.panel.id, x: 5, y: 6 });
      return (await f.game.snapshot(f.gm)).room.travelVote;
    }
    const first = (await trigger())!;
    await f.game.decideTravel(f.gm, { voteId: first.id, approved: true });
    assert.equal((await f.game.snapshot(f.gm)).panel.id, f.panel.id);
    const save = f.store.save.bind(f.store);
    f.store.save = async () => {
      throw new Error('Disk unavailable');
    };
    await assert.rejects(f.game.decideTravel(f.gm, { voteId: first.id, approved: false }), /Disk/);
    assert.equal((await f.game.snapshot(f.gm)).room.travelVote?.id, first.id);
    f.store.save = save;
    await f.game.decideTravel(f.gm, { voteId: first.id, approved: false });
    assert.equal(await trigger(), null);
    clock += 10001;
    const second = (await trigger())!;
    assert.ok(second);
    clock += 30001;
    assert.deepEqual(await f.game.expireTravel(), [{ roomId: f.gm.roomId, reason: 'timeout' }]);
    await assert.rejects(f.game.voteTravel(f.player, { voteId: second.id, accept: true }), /vote/i);
    clock += 10001;
    assert.ok(await trigger());
    f.game.setOnlineMembers(f.gm.roomId, [f.gm]);
    assert.deepEqual(await f.game.expireTravel(), [{ roomId: f.gm.roomId, reason: 'changed' }]);
    assert.equal((await f.game.snapshot(f.gm)).room.travelVote, null);
  } finally {
    await f.close();
  }
});

test('monster and attack validation rejects forged attributes, invalid notation, oversized sprites and out-of-bounds summons', () => {
  const definition = structuredClone(defaultMonsters[0]);
  assert.equal(monsterDefinitionSchema.safeParse(definition).success, true);
  for (const changed of [
    { ...definition, attackNotation: '100d20' },
    { ...definition, defaultMaxHp: 0 },
    { ...definition, attributes: { ...definition.attributes, forca: 101 } },
    { ...definition, sprite: 'https://example.com/monster.png' },
    { ...definition, attributes: { ...definition.attributes, hp: 9 } },
  ])
    assert.equal(monsterDefinitionSchema.safeParse(changed).success, false);
  assert.equal(
    classAttackSchema.safeParse({ ...defaultClasses[0].defaultAttack, damageNotation: '1d7' })
      .success,
    false,
  );
  assert.equal(
    summonMonsterSchema.safeParse({
      panelId: crypto.randomUUID(),
      definitionId: 'bat',
      x: 64,
      y: 0,
    }).success,
    false,
  );
});

test('monster health changes serialize, privacy changes reveal only permitted values and duplicated scenes regenerate monster IDs', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const m = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'dragon',
      x: 4,
      y: 4,
    });
    const r = { panelId: f.panel.id, monsterId: m.id };
    await Promise.all(
      Array.from({ length: 4 }, () => f.game.adjustMonsterHp(f.gm, { ...r, delta: -5 })),
    );
    assert.equal((await f.game.snapshot(f.player)).panel.monsters![0].currentHp, 45);
    await f.game.setMonsterVisibility(f.gm, { ...r, hpVisibility: 'bar_only' });
    const view = await f.game.snapshot(f.player);
    assert.equal(view.room.monsterDefinitions, undefined);
    assert.equal(view.panel.monsters![0].healthRatio, 45 / 65);
    assert.equal('attackNotation' in view.panel.monsters![0], false);
    await f.game.duplicatePanel(f.gm, f.panel.id);
    const copied = (await f.game.snapshot(f.gm)).panel;
    assert.notEqual(copied.monsters![0].id, m.id);
    assert.equal(copied.monsters![0].panelId, copied.id);
    const restored = new GameService(f.store);
    assert.equal(
      (await restored.snapshot(await restored.authenticate(f.credential))).panel.monsters![0]
        .currentHp,
      45,
    );
  } finally {
    await f.close();
  }
});

test('reviving a monster cannot overlap a player standing on its defeated token', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const monster = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'bat',
      x: 4,
      y: 4,
    });
    const ref = { panelId: f.panel.id, monsterId: monster.id };
    await f.game.adjustMonsterHp(f.gm, { ...ref, current: 0 });
    await f.game.moveToken(f.gm, { panelId: f.panel.id, memberId: f.player.id, x: 4, y: 4 });
    await assert.rejects(f.game.adjustMonsterHp(f.gm, { ...ref, current: 8 }), /free|occupied/i);
    assert.equal((await f.game.snapshot(f.gm)).panel.monsters![0].currentHp, 0);
  } finally {
    await f.close();
  }
});

test('initiative sorts totals then dexterity then stable IDs and preserves the order across rounds', async () => {
  assert.deepEqual(
    sortInitiative([
      { id: 'z', type: 'player', name: 'Z', initiative: 10, dexterityModifier: 1 },
      { id: 'b', type: 'player', name: 'B', initiative: 12, dexterityModifier: 0 },
      { id: 'a', type: 'player', name: 'A', initiative: 10, dexterityModifier: 1 },
      { id: 'c', type: 'monster', name: 'C', initiative: 10, dexterityModifier: 2 },
    ]).map((p) => p.id),
    ['b', 'c', 'a', 'z'],
  );
  const f = await fixture({ rollDie: () => 10 });
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const m = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'bat',
      x: 4,
      y: 4,
    });
    await f.game.startCombat(f.gm, { panelId: f.panel.id, monsterId: m.id });
    const started = (await f.game.snapshot(f.gm)).room.activeCombat!;
    await f.game.rollCombatInitiative(f.player, { combatId: started.id, round: started.round });
    assert.equal(started.turnQueue[0].id, m.id);
    assert.equal(started.turnQueue[0].initiative, 13);
    await assert.rejects(f.game.nextCombatTurn(f.player), /turn/i);
    await f.game.nextCombatTurn(f.gm);
    await f.game.nextCombatTurn(f.player);
    const next = await f.game.snapshot(f.gm);
    assert.equal(next.room.activeCombat?.round, 2);
    assert.equal(next.room.activeCombat?.status, 'active');
    assert.equal(next.room.activeCombat?.turnQueue[0].id, m.id);
    assert.equal(next.room.activeCombat?.turnQueue[0].initiative, 13);
    assert.equal(next.rolls.filter((r) => r.sides === 20).length, 2);
  } finally {
    await f.close();
  }
});

test('combat damage uses persisted class/subclass modifiers, logs trusted actors and skips KO participants', async () => {
  const f = await fixture({ rollDie: (sides) => (sides === 20 ? 10 : 4) });
  try {
    await f.game.updateCharacter(f.player, { ...defaultAppearance, classId: 'guerreiro' });
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const m = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'dragon',
      x: 4,
      y: 4,
    });
    await f.game.startCombat(f.gm, { panelId: f.panel.id, monsterId: m.id });
    const combat = (await f.game.snapshot(f.gm)).room.activeCombat!;
    await f.game.rollCombatInitiative(f.player, { combatId: combat.id, round: 1 });
    await f.game.executeMonsterAttack(f.gm, {
      targetMemberId: f.player.id,
      damageNotation: '1d12',
    });
    assert.equal((await f.game.snapshot(f.player)).you.health?.current, 16);
    await f.game.executePlayerAttack(f.player, { targetMonsterId: m.id, attackId: 'heavy_strike' });
    const after = await f.game.snapshot(f.gm);
    assert.equal(after.panel.monsters![0].currentHp, 59);
    const damage = after.rolls.find((r) => r.sides === 8)!;
    assert.equal(damage.modifier, 2);
    assert.equal(damage.role, 'player');
    assert.equal(damage.total, 6);
    await f.game.adjustHealth(f.gm, { memberId: f.player.id, current: 0 });
    assert.equal((await f.game.snapshot(f.gm)).room.activeCombat?.status, 'resolved');
  } finally {
    await f.close();
  }
});

test('failed campaign and monster writes leave confirmed records and health intact', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const m = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'bat',
      x: 4,
      y: 4,
    });
    const save = f.store.save.bind(f.store);
    f.store.save = async () => {
      throw new Error('Disk unavailable');
    };
    await assert.rejects(
      f.game.adjustMonsterHp(f.gm, { panelId: f.panel.id, monsterId: m.id, current: 0 }),
      /Disk/,
    );
    await assert.rejects(f.game.deleteRoom(f.gm, f.credential.roomCode), /Disk/);
    assert.equal((await f.game.snapshot(f.gm)).panel.monsters![0].currentHp, 8);
    assert.equal((await f.game.authenticate(f.credential)).role, 'gm');
    f.store.save = save;
  } finally {
    await f.close();
  }
});

test('unlinked POIs accept entrance movement and publish a notice only after persistence', async () => {
  const f = await fixture();
  try {
    await f.game.placeStructure(f.gm, { panelId: f.panel.id, templateKey: 'poi_town', x: 4, y: 4 });
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 5, y: 7, terrain: 'grass', blocked: false }],
    });
    await f.game.moveToken(f.gm, { panelId: f.panel.id, memberId: f.player.id, x: 5, y: 7 });
    const notices: unknown[] = [];
    f.game.events.on('poiUnlinked', (event) => notices.push(event));
    const token = await f.game.moveToken(f.player, { panelId: f.panel.id, x: 5, y: 6 });
    assert.equal(token.y, 6);
    assert.deepEqual(notices, [{ roomId: f.gm.roomId, memberId: f.player.id }]);
    assert.equal((await f.store.load()).sessions.find((s) => s.id === f.player.id)?.token?.y, 6);
    assert.equal((await f.game.snapshot(f.gm)).room.travelVote, null);
  } finally {
    await f.close();
  }
});

test('an even-player travel tie remains pending until a strict majority or timeout', async () => {
  const f = await fixture();
  try {
    const companion = await f.game.authenticate(
      await f.game.join({ code: f.credential.roomCode, nickname: 'Companion' }),
    );
    const anchor = await f.game.placeStructure(f.gm, {
      panelId: f.panel.id,
      templateKey: 'poi_town',
      x: 4,
      y: 4,
    });
    await f.game.configurePoi(f.gm, {
      panelId: f.panel.id,
      structureId: anchor.id,
      name: 'Town',
      createTemplate: 'town',
    });
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 5, y: 7, terrain: 'grass', blocked: false }],
    });
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, f.player, companion]);
    await f.game.moveToken(f.gm, { panelId: f.panel.id, memberId: f.player.id, x: 5, y: 7 });
    await f.game.moveToken(f.player, { panelId: f.panel.id, x: 5, y: 6 });
    const vote = (await f.game.snapshot(f.gm)).room.travelVote!;
    await f.game.voteTravel(companion, { voteId: vote.id, accept: false });
    assert.equal((await f.game.snapshot(f.gm)).room.travelVote?.id, vote.id);
    await f.game.voteTravel(f.player, { voteId: vote.id, accept: false });
    assert.equal((await f.game.snapshot(f.gm)).room.travelVote, null);
  } finally {
    await f.close();
  }
});

test('combat cannot disclose a fog-hidden monster; hiding the opponent ends an existing encounter', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const m = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'bat',
      x: 4,
      y: 4,
    });
    await f.game.updateFog(f.gm, { panelId: f.panel.id, enabled: true });
    await assert.rejects(
      f.game.startCombat(f.gm, { panelId: f.panel.id, monsterId: m.id }),
      /reveal|fog/i,
    );
    await f.game.updateFog(f.gm, { panelId: f.panel.id, revealed: true, cells: [{ x: 4, y: 4 }] });
    await f.game.startCombat(f.gm, { panelId: f.panel.id, monsterId: m.id });
    await f.game.updateFog(f.gm, { panelId: f.panel.id, revealed: false, cells: [{ x: 4, y: 4 }] });
    const hidden = await f.game.snapshot(f.player);
    assert.equal(hidden.room.activeCombat, null);
    assert.deepEqual(hidden.panel.monsters, []);
  } finally {
    await f.close();
  }
});

test('legacy default classes gain thematic attacks while custom classes keep the basic fallback', async () => {
  const f = await fixture();
  try {
    const stored = await f.store.load();
    for (const c of stored.rooms[0].classes) delete c.defaultAttack;
    stored.rooms[0].classes.push({
      ...structuredClone(defaultClasses[0]),
      id: 'custom-knight',
      defaultAttack: undefined,
    });
    await f.store.save(stored);
    const restored = new GameService(f.store);
    const classes = (await restored.snapshot(await restored.authenticate(f.credential))).room
      .classes;
    assert.equal(classes[0].defaultAttack?.id, 'heavy_strike');
    assert.equal(classes[4].defaultAttack, undefined);
  } finally {
    await f.close();
  }
});

test('every initiative roll is published after commit even when a large party exceeds the 20-record history cap', async () => {
  const f = await fixture();
  try {
    const players = [f.player];
    for (let index = 0; index < 20; index++) {
      const member = await f.game.authenticate(
        await f.game.join({ code: f.credential.roomCode, nickname: `Hero ${index}` }),
      );
      await f.game.updateCharacter(member, defaultAppearance);
      players.push(member);
    }
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    const m = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'dragon',
      x: 4,
      y: 4,
    });
    const rolls: unknown[] = [];
    f.game.events.on('diceRolls', ({ rolls: batch }) => rolls.push(...batch));
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, ...players]);
    await f.game.startCombat(f.gm, { panelId: f.panel.id, monsterId: m.id });
    const combat = (await f.game.snapshot(f.gm)).room.activeCombat!;
    for (const player of players)
      await f.game.rollCombatInitiative(player, { combatId: combat.id, round: 1 });
    assert.equal(rolls.length, 22);
    assert.equal((await f.game.snapshot(f.gm)).rolls.length, 20);
  } finally {
    await f.close();
  }
});

test('campaign deletion checks persisted ownership and cascades only its own room; leave never respawns a departed seat', async () => {
  const f = await fixture();
  try {
    assert.equal(typeof f.game.deleteRoom, 'function', 'campaign deletion is missing');
    const other = await f.game.create({ name: 'Unrelated', nickname: 'Other' });
    await assert.rejects(
      f.game.deleteRoom({ ...f.player, role: 'gm' }, f.credential.roomCode),
      /master/i,
    );
    await assert.rejects(f.game.deleteRoom(f.gm, other.roomCode), /code/i);
    await f.game.leaveRoom(f.player);
    assert.equal(
      (await f.store.load()).sessions.find((s) => s.id === f.player.id)?.token,
      undefined,
    );
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 0, y: 0, terrain: 'grass', blocked: false }],
    });
    assert.equal(
      (await f.store.load()).sessions.find((s) => s.id === f.player.id)?.token,
      undefined,
    );
    await assert.rejects(f.game.authenticate(f.playerCredential), /session/i);
    await f.game.deleteRoom(f.gm, f.credential.roomCode);
    await assert.rejects(
      f.game.paint(f.gm, {
        panelId: f.panel.id,
        tiles: [{ x: 0, y: 0, terrain: 'grass', blocked: false }],
      }),
      (error: unknown) => (error as { code?: string }).code === 'ROOM_NOT_FOUND',
    );
    const saved = await f.store.load();
    assert.equal(saved.rooms.length, 1);
    assert.equal(
      saved.panels.some((p) => p.roomId === f.gm.roomId),
      false,
    );
    assert.equal(
      saved.sessions.some((s) => s.roomId === f.gm.roomId),
      false,
    );
    assert.equal((await f.game.authenticate(other)).role, 'gm');
  } finally {
    await f.close();
  }
});

test('travel needs strict player majority and GM approval, rejects stale votes, expires and clusters the whole party', async () => {
  const f = await fixture();
  try {
    assert.equal(typeof f.game.voteTravel, 'function', 'travel voting is missing');
    const secondCredential = await f.game.join({
      code: f.credential.roomCode,
      nickname: 'Companion',
    });
    const second = await f.game.authenticate(secondCredential);
    await f.game.updateCharacter(second, defaultAppearance);
    await f.game.createPanel(f.gm, { name: 'Town', cols: 8, rows: 8, template: 'woodland' });
    const destination = (await f.game.snapshot(f.gm)).panel.id;
    await f.game.setSpawn(f.gm, { panelId: destination, point: { x: 4, y: 4 } });
    await f.game.changePanel(f.gm, f.panel.id);
    const placed = await f.game.placeStructure(f.gm, {
      panelId: f.panel.id,
      templateKey: 'poi_town',
      x: 4,
      y: 4,
    });
    await f.game.configurePoi(f.gm, {
      panelId: f.panel.id,
      structureId: placed.id,
      name: 'Guardia',
      targetPanelId: destination,
    });
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, f.player, second]);
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 5, y: 7, terrain: 'grass', blocked: false }],
    });
    await f.game.moveToken(f.gm, { panelId: f.panel.id, memberId: f.player.id, x: 5, y: 7 });
    await f.game.moveToken(f.player, { panelId: f.panel.id, x: 5, y: 6 });
    const vote = (await f.game.snapshot(f.gm)).room.travelVote!;
    assert.ok(vote);
    await f.game.voteTravel(f.player, { voteId: vote.id, accept: true });
    await f.game.decideTravel(f.gm, { voteId: vote.id, approved: true });
    assert.equal(
      (await f.game.snapshot(f.gm)).panel.id,
      f.panel.id,
      'one of two YES votes is not a majority',
    );
    await f.game.voteTravel(second, { voteId: vote.id, accept: true });
    const arrived = await f.game.snapshot(f.gm, [f.gm, f.player, second]);
    assert.equal(arrived.panel.id, destination);
    assert.equal(arrived.room.travelVote, null);
    const positions = arrived.members.filter((m) => m.role === 'player').map((m) => m.token);
    assert.equal(new Set(positions.map((p) => `${p?.x},${p?.y}`)).size, 2);
    assert.deepEqual(positions[0], { x: 4, y: 4, panelId: destination });
    await assert.rejects(f.game.voteTravel(f.player, { voteId: vote.id, accept: true }), /vote/i);
  } finally {
    await f.close();
  }
});

test('monsters enforce GM authority, redact hidden health and block movement only while alive', async () => {
  const f = await fixture();
  try {
    assert.equal(typeof f.game.summonMonster, 'function', 'monster summoning is missing');
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [0, 1, 2].map((x) => ({ x, y: 0, terrain: 'grass', blocked: false })),
    });
    await f.game.moveToken(f.gm, { panelId: f.panel.id, memberId: f.player.id, x: 0, y: 0 });
    const request = { panelId: f.panel.id, definitionId: 'slime', x: 1, y: 0 };
    await assert.rejects(f.game.summonMonster(f.player, request), /master/i);
    const monster = await f.game.summonMonster(f.gm, request);
    const online = [f.gm, f.player];
    const bar = (await f.game.snapshot(f.player, online)).panel.monsters![0];
    assert.equal('currentHp' in bar, false);
    assert.equal('maxHp' in bar, false);
    assert.equal('attributes' in bar, false);
    assert.equal(bar.healthRatio, 1);
    await f.game.setMonsterVisibility(f.gm, {
      panelId: f.panel.id,
      monsterId: monster.id,
      hpVisibility: 'gm_only',
    });
    const hidden = (await f.game.snapshot(f.player, online)).panel.monsters![0];
    assert.equal('healthRatio' in hidden, false);
    await assert.rejects(
      f.game.moveToken(f.player, { panelId: f.panel.id, x: 1, y: 0 }),
      /blocked/i,
    );
    await f.game.adjustMonsterHp(f.gm, { panelId: f.panel.id, monsterId: monster.id, current: 0 });
    assert.equal((await f.game.moveToken(f.player, { panelId: f.panel.id, x: 1, y: 0 })).x, 1);
    await f.game.updateFog(f.gm, { panelId: f.panel.id, enabled: true });
    assert.deepEqual((await f.game.snapshot(f.player, online)).panel.monsters, []);
  } finally {
    await f.close();
  }
});

test('combat is opt-in, rejects out-of-turn actors and forged attacks, preserves health and restores encounters', async () => {
  const f = await fixture();
  try {
    assert.equal(typeof f.game.startCombat, 'function', 'combat engine is missing');
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 2, y: 0, terrain: 'grass', blocked: false }],
    });
    const monster = await f.game.summonMonster(f.gm, {
      panelId: f.panel.id,
      definitionId: 'dragon',
      x: 2,
      y: 0,
    });
    await assert.rejects(
      f.game.startCombat(f.player, { panelId: f.panel.id, monsterId: monster.id }),
      /master/i,
    );
    await f.game.startCombat(f.gm, { panelId: f.panel.id, monsterId: monster.id });
    const pendingCombat = (await f.game.snapshot(f.gm)).room.activeCombat!;
    await f.game.rollCombatInitiative(f.player, { combatId: pendingCombat.id, round: 1 });
    const started = (await f.game.snapshot(f.gm, [f.gm, f.player])).room.activeCombat!;
    assert.equal(started.round, 1);
    assert.equal(started.turnQueue.length, 2);
    await assert.rejects(
      f.game.executeMonsterAttack(f.player, { targetMemberId: f.player.id }),
      /master/i,
    );
    await assert.rejects(
      f.game.executePlayerAttack(f.player, { targetMonsterId: monster.id, attackId: 'forged' }),
    );
    const restarted = new GameService(f.store);
    assert.equal(
      (await restarted.snapshot(await restarted.authenticate(f.credential))).room.activeCombat?.id,
      started.id,
    );
    if (started.turnQueue[0].type === 'monster') await f.game.nextCombatTurn(f.gm);
    await f.game.executePlayerAttack(f.player, { targetMonsterId: monster.id, attackId: 'basic' });
    const attacked = await f.game.snapshot(f.gm);
    assert.ok(attacked.panel.monsters![0].currentHp! < 65);
    assert.ok(attacked.rolls.some((r) => r.memberId === f.player.id && r.sides === 6));
    await f.game.endCombat(f.gm);
    const ended = await f.game.snapshot(f.gm);
    assert.equal(ended.room.activeCombat, null);
    assert.equal(ended.panel.monsters![0].currentHp, attacked.panel.monsters![0].currentHp);
  } finally {
    await f.close();
  }
});
