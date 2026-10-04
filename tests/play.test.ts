import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore, type Session } from '../src/server/store';
import { parseDiceNotation } from '../src/lib/dice-notation';

const appearance = {
  skinColor: '#fcd0a1',
  hairStyle: 2,
  hairColor: '#69381e',
  shirtStyle: 1,
  shirtColor: '#315d44',
  pantsColor: '#343d46',
};

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-play-'));
  const store = new FileStore(join(directory, 'state.json'));
  const game = new GameService(store);
  const credential = await game.create({ name: 'Play', nickname: 'GM', template: 'blank' });
  const gm = await game.authenticate(credential);
  const heroCredential = await game.join({ code: credential.roomCode, nickname: 'Hero' });
  const hero = await game.authenticate(heroCredential);
  const player = await game.authenticate(
    await game.join({ code: credential.roomCode, nickname: 'Player' }),
  );
  const panel = (await game.snapshot(gm)).panel;
  return { directory, store, game, credential, heroCredential, gm, hero, player, panel };
}

// A missing feature is an assertion failure instead of an accidental TypeError.
async function action(game: GameService, method: string, member: Session, input: unknown) {
  const operation = Reflect.get(game, method);
  assert.equal(typeof operation, 'function', `GameService must implement ${method}`);
  return operation.call(game, member, input);
}

test('characters persist without an unsafe spawn on an empty map; painting retries row-major free spawns', async () => {
  const f = await fixture();
  try {
    await action(f.game, 'updateCharacter', f.hero, appearance);
    assert.deepEqual((await f.game.snapshot(f.hero)).you.character, appearance);
    assert.equal((await f.game.snapshot(f.hero)).you.token, undefined);
    await action(f.game, 'updateCharacter', f.player, appearance);
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: true },
        { x: 0, y: 1, terrain: 'grass', blocked: false },
        { x: 2, y: 0, terrain: 'water', blocked: false },
      ],
    });
    assert.deepEqual((await f.game.snapshot(f.hero)).you.token, {
      x: 2,
      y: 0,
      panelId: f.panel.id,
    });
    assert.deepEqual((await f.game.snapshot(f.player)).you.token, {
      x: 0,
      y: 1,
      panelId: f.panel.id,
    });
    const restored = new GameService(new FileStore(f.store.filename));
    assert.deepEqual(
      (await restored.snapshot(await restored.authenticate(f.heroCredential))).you.character,
      appearance,
    );
    assert.equal(JSON.stringify(await restored.snapshot(f.gm)).includes('tokenHash'), false);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('appearance rejects arbitrary colors, invalid styles and attempts to customize another member', async () => {
  const f = await fixture();
  try {
    for (const input of [
      { ...appearance, skinColor: 'red' },
      { ...appearance, hairStyle: 10 },
      { ...appearance, shirtStyle: -1 },
      { ...appearance, memberId: f.gm.id },
    ])
      await assert.rejects(action(f.game, 'updateCharacter', f.player, input));
    assert.equal((await f.game.snapshot(f.player)).you.character, undefined);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('movement enforces adjacency, bounds, occupied tiles, active scene and blocking on the server', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'water', blocked: false },
        { x: 2, y: 0, terrain: 'grass', blocked: true },
        { x: 0, y: 1, terrain: 'stone', blocked: false },
      ],
    });
    await action(f.game, 'updateCharacter', f.hero, appearance);
    await action(f.game, 'updateCharacter', f.player, appearance);
    for (const cell of [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
    ]) {
      await assert.rejects(action(f.game, 'moveToken', f.hero, { ...cell, panelId: f.panel.id }));
    }
    await action(f.game, 'moveToken', f.hero, { x: 0, y: 1, panelId: f.panel.id });
    await action(f.game, 'updateCharacter', f.hero, { ...appearance, hairStyle: 9 });
    assert.deepEqual((await f.game.snapshot(f.hero)).you.token, {
      x: 0,
      y: 1,
      panelId: f.panel.id,
    });
    await f.game.createPanel(f.gm, { name: 'Other', cols: 5, rows: 5, template: 'blank' });
    assert.equal((await f.game.snapshot(f.hero)).you.token, undefined);
    await assert.rejects(action(f.game, 'moveToken', f.hero, { x: 0, y: 0, panelId: f.panel.id }));
    await f.game.changePanel(f.gm, f.panel.id);
    assert.deepEqual((await f.game.snapshot(f.hero)).you.token, {
      x: 0,
      y: 0,
      panelId: f.panel.id,
    });
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('blocking occupied terrain relocates tokens without stacking and persistence failure does not publish a character', async () => {
  const f = await fixture();
  try {
    const failed = new GameService({
      mode: 'local',
      load: () => f.store.load(),
      save: async () => {
        throw new Error('disk full');
      },
    });
    await assert.rejects(action(failed, 'updateCharacter', f.hero, appearance), /disk full/);
    assert.equal((await failed.snapshot(f.hero)).you.character, undefined);
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'grass', blocked: false },
      ],
    });
    await action(f.game, 'updateCharacter', f.hero, appearance);
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 0, y: 0, terrain: 'wall', blocked: true }],
    });
    assert.deepEqual((await f.game.snapshot(f.hero)).you.token, {
      x: 1,
      y: 0,
      panelId: f.panel.id,
    });
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('fog redacts terrain, custom sprites and other tokens; only the GM can reveal and players cannot enter hidden cells', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'stone', blocked: false },
        { x: 2, y: 0, terrain: 'flowers', blocked: false },
      ],
    });
    await action(f.game, 'updateCharacter', f.hero, appearance);
    await action(f.game, 'updateCharacter', f.player, appearance);
    await action(f.game, 'updateFog', f.gm, { panelId: f.panel.id, enabled: true });
    const playerView = await f.game.snapshot(f.player, [f.gm, f.hero, f.player]);
    assert.deepEqual(playerView.panel.tiles, []);
    assert.equal(playerView.members.find((m) => m.id === f.hero.id)?.token, undefined);
    assert.deepEqual(playerView.you.token, { x: 1, y: 0, panelId: f.panel.id });
    assert.equal((await f.game.snapshot(f.gm)).panel.tiles.length, 3);
    await assert.rejects(
      action(f.game, 'updateFog', f.player, { panelId: f.panel.id, enabled: false }),
      /master/i,
    );
    await assert.rejects(
      action(f.game, 'moveToken', f.player, { panelId: f.panel.id, x: 2, y: 0 }),
      /hidden/i,
    );
    await action(f.game, 'updateFog', f.gm, {
      panelId: f.panel.id,
      revealed: true,
      cells: [{ x: 2, y: 0 }],
    });
    assert.deepEqual((await f.game.snapshot(f.player)).panel.tiles, [
      { x: 2, y: 0, terrain: 'flowers', blocked: false },
    ]);
    await action(f.game, 'moveToken', f.player, { panelId: f.panel.id, x: 2, y: 0 });
    await action(f.game, 'updateFog', f.gm, {
      panelId: f.panel.id,
      revealed: false,
      cells: [{ x: 2, y: 0 }],
    });
    assert.equal((await f.game.snapshot(f.player)).panel.tiles.length, 0);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('scene duplication, ordering and deletion preserve maps, enforce GM permissions and retain one scene after restart', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 0, y: 0, terrain: 'snow', blocked: false }],
    });
    await action(f.game, 'duplicatePanel', f.gm, f.panel.id);
    let view = await f.game.snapshot(f.gm);
    const copy = view.panel.id;
    assert.notEqual(copy, f.panel.id);
    assert.deepEqual(view.panel.tiles, [{ x: 0, y: 0, terrain: 'snow', blocked: false }]);
    await action(f.game, 'reorderPanels', f.gm, [copy, f.panel.id]);
    assert.deepEqual(
      (await f.game.snapshot(f.gm)).panels.map((p) => p.id),
      [copy, f.panel.id],
    );
    await assert.rejects(action(f.game, 'reorderPanels', f.gm, [copy, copy]));
    await assert.rejects(action(f.game, 'removePanel', f.player, copy), /master/i);
    await action(f.game, 'removePanel', f.gm, copy);
    view = await f.game.snapshot(f.gm);
    assert.equal(view.panel.id, f.panel.id);
    await assert.rejects(action(f.game, 'removePanel', f.gm, f.panel.id), /one scene/i);
    const restarted = new GameService(new FileStore(f.store.filename));
    assert.equal((await restarted.snapshot(f.gm)).panels.length, 1);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('dice are generated on the server with bounded faces and a capped, durable room history', async () => {
  const f = await fixture();
  try {
    for (const input of [
      { sides: 3, count: 1, modifier: 0 },
      { sides: 6, count: 21, modifier: 0 },
      { sides: 20, count: 1, modifier: 1001 },
    ])
      await assert.rejects(action(f.game, 'rollDice', f.player, input));
    for (let i = 0; i < 21; i++) {
      const roll = await action(f.game, 'rollDice', f.player, { sides: 6, count: 2, modifier: -2 });
      assert.equal(roll.memberId, f.player.id);
      assert.equal(roll.values.length, 2);
      assert.ok(
        roll.values.every((value: number) => Number.isInteger(value) && value >= 1 && value <= 6),
      );
      assert.equal(roll.total, roll.values[0] + roll.values[1] - 2);
    }
    const restored = new GameService(new FileStore(f.store.filename));
    assert.equal((await restored.snapshot(f.gm)).rolls.length, 20);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('parsed GM and player rolls carry trusted roles and survive restart with individual faces', async () => {
  const f = await fixture();
  try {
    for (const [member, expression, role] of [
      [f.gm, '2d4+3', 'gm'],
      [f.player, '3d6-2', 'player'],
    ] as const) {
      const roll = await f.game.rollDice(member, parseDiceNotation(expression));
      assert.equal(roll.role, role);
      assert.equal(roll.nickname, member.nickname);
      assert.equal(
        roll.total,
        roll.values.reduce((sum, value) => sum + value, roll.modifier),
      );
      assert.equal(roll.values.length, role === 'gm' ? 2 : 3);
    }
    const restored = new GameService(new FileStore(f.store.filename));
    const history = (await restored.snapshot(f.player)).rolls;
    assert.deepEqual(
      history.map((roll) => roll.role),
      ['gm', 'player'],
    );
    assert.deepEqual(
      history.map((roll) => [roll.count, roll.sides, roll.modifier]),
      [
        [2, 4, 3],
        [3, 6, -2],
      ],
    );
    await assert.rejects(
      f.game.rollDice(f.player, { sides: 6, count: 1, modifier: 0, role: 'gm' }),
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('legacy dice history supplies GM and player badges even when authors are offline', async () => {
  const f = await fixture();
  try {
    await f.game.rollDice(f.gm, { count: 1, sides: 20, modifier: 0 });
    await f.game.rollDice(f.player, { count: 1, sides: 6, modifier: 0 });
    const data = await f.store.load();
    for (const roll of data.rooms[0].rolls || []) delete roll.role;
    await f.store.save(data);
    const restored = new GameService(new FileStore(f.store.filename));
    const view = await restored.snapshot(f.hero);
    assert.deepEqual(view.members, []);
    assert.deepEqual(
      view.rolls.map((roll) => roll.role),
      ['gm', 'player'],
    );
    assert.equal(JSON.stringify(view).includes('gmId'), false);
    assert.equal(JSON.stringify(view).includes('tokenHash'), false);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('tile sprites accept bounded PNG data and survive export/import while remote URLs and malformed images are rejected', async () => {
  const f = await fixture();
  try {
    const sprite =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    const tile = { x: 0, y: 0, terrain: 'sand', blocked: false, sprite };
    await f.game.paint(f.gm, { panelId: f.panel.id, tiles: [tile] });
    assert.deepEqual((await f.game.snapshot(f.gm)).panel.tiles, [tile]);
    const truncated =
      'data:image/png;base64,' +
      Buffer.from(sprite.split(',')[1], 'base64').subarray(0, 33).toString('base64');
    for (const sprite of [
      'https://example.com/a.png',
      'data:image/svg+xml;base64,AAAA',
      'data:image/png;base64,AAAA',
      truncated,
    ])
      await assert.rejects(
        f.game.paint(f.gm, { panelId: f.panel.id, tiles: [{ ...tile, sprite }] }),
      );
    await f.game.importPanel(f.gm, {
      version: 1,
      name: 'Portable',
      grid: f.panel.grid,
      tiles: [tile],
    });
    assert.deepEqual((await f.game.snapshot(f.gm)).panel.tiles, [tile]);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('selecting the already active scene preserves a character position', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'grass', blocked: false },
      ],
    });
    await f.game.updateCharacter(f.hero, appearance);
    await f.game.moveToken(f.hero, { panelId: f.panel.id, x: 1, y: 0 });
    await f.game.changePanel(f.gm, f.panel.id);
    assert.deepEqual((await f.game.snapshot(f.hero)).you.token, {
      panelId: f.panel.id,
      x: 1,
      y: 0,
    });
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('movement into fog gives the same hidden error for blocked and walkable terrain', async () => {
  const f = await fixture();
  try {
    await f.game.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [
        { x: 0, y: 0, terrain: 'grass', blocked: false },
        { x: 1, y: 0, terrain: 'wall', blocked: true },
        { x: 0, y: 1, terrain: 'grass', blocked: false },
      ],
    });
    await f.game.updateCharacter(f.player, appearance);
    await f.game.updateFog(f.gm, { panelId: f.panel.id, enabled: true });
    for (const cell of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ])
      await assert.rejects(f.game.moveToken(f.player, { panelId: f.panel.id, ...cell }), /hidden/i);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
