import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/server/store';
import { GameService } from '../src/server/game';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-test-'));
  const store = new FileStore(join(directory, 'store.json'));
  const game = new GameService(store);
  const gm = await game.create({ name: 'Guardia', nickname: 'Lelo', template: 'blank' });
  return { directory, store, game, gm };
}

test('a room creator reconnects as GM without sharing their private token', async () => {
  const { directory, game, gm } = await fixture();
  try {
    const member = await game.authenticate(gm);
    assert.equal(member.role, 'gm');
    const snapshot = await game.snapshot(member);
    assert.equal(snapshot.panel.tiles.length, 0);
    assert.equal('gmId' in snapshot.room, false);
    assert.equal(JSON.stringify(snapshot).includes(gm.token), false);
    await assert.rejects(game.authenticate({ ...gm, token: 'forged' }), /session/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('players cannot paint, change scenes, create scenes, rename or import maps', async () => {
  const { directory, game, gm } = await fixture();
  try {
    const player = await game.join({ code: gm.roomCode, nickname: 'Marle' });
    const member = await game.authenticate(player);
    const { panel } = await game.snapshot(member);
    await assert.rejects(
      game.paint(member, {
        panelId: panel.id,
        tiles: [{ x: 0, y: 0, terrain: 'forest', blocked: false }],
      }),
      /master/i,
    );
    await assert.rejects(game.changePanel(member, panel.id), /master/i);
    await assert.rejects(
      game.createPanel(member, { name: 'Forest', cols: 20, rows: 15, template: 'blank' }),
      /master/i,
    );
    await assert.rejects(
      game.renamePanel(member, { panelId: panel.id, name: 'Hacked' }),
      /master/i,
    );
    await assert.rejects(
      game.importPanel(member, { version: 1, name: 'Imported', grid: panel.grid, tiles: [] }),
      /master/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejoining with a valid saved session preserves the GM seat; a forged token never grants it', async () => {
  const { directory, game, gm } = await fixture();
  try {
    const resumed = await game.join({
      code: gm.roomCode,
      nickname: 'Another nickname',
      session: gm,
    });
    assert.deepEqual(resumed, gm);
    const forged = await game.join({
      code: gm.roomCode,
      nickname: 'Imposter',
      session: { ...gm, token: '0'.repeat(64) },
    });
    assert.equal(forged.role, 'player');
    assert.notEqual(forged.memberId, gm.memberId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('painting updates the matching coordinate, erasing restores sparse empty state, and edits persist', async () => {
  const { directory, store, game, gm } = await fixture();
  try {
    const member = await game.authenticate(gm);
    const { panel } = await game.snapshot(member);
    await game.paint(member, {
      panelId: panel.id,
      tiles: [
        { x: 1, y: 2, terrain: 'grass', blocked: false },
        { x: 2, y: 1, terrain: 'water', blocked: true },
      ],
    });
    await game.paint(member, {
      panelId: panel.id,
      tiles: [{ x: 1, y: 2, terrain: 'forest', blocked: true }],
    });
    const persisted = new GameService(new FileStore(store.filename));
    const saved = await persisted.snapshot(await persisted.authenticate(gm));
    assert.deepEqual(saved.panel.tiles, [
      { x: 1, y: 2, terrain: 'forest', blocked: true },
      { x: 2, y: 1, terrain: 'water', blocked: true },
    ]);
    await game.paint(member, {
      panelId: panel.id,
      tiles: [{ x: 1, y: 2, terrain: 'empty', blocked: false }],
    });
    assert.equal((await game.snapshot(member)).panel.tiles.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('out-of-bounds coordinates, forged rooms, and malformed imports never mutate a scene', async () => {
  const { directory, game, gm } = await fixture();
  try {
    const member = await game.authenticate(gm);
    const { panel } = await game.snapshot(member);
    await assert.rejects(
      game.paint(member, {
        panelId: panel.id,
        tiles: [{ x: -1, y: 0, terrain: 'water', blocked: true }],
      }),
    );
    await assert.rejects(
      game.paint(member, {
        panelId: panel.id,
        tiles: [{ x: 999, y: 0, terrain: 'water', blocked: true }],
      }),
    );
    const other = await game.create({
      name: 'Other room',
      nickname: 'Other GM',
      template: 'blank',
    });
    const otherPanel = (await game.snapshot(await game.authenticate(other))).panel;
    await assert.rejects(game.changePanel(member, otherPanel.id), /scene/i);
    await assert.rejects(
      game.importPanel(member, {
        version: 1,
        name: 'Invalid',
        grid: { cols: 5, rows: 5, tileSize: 32 },
        tiles: [{ x: 7, y: 1, terrain: 'water', blocked: false }],
      }),
    );
    assert.equal((await game.snapshot(member)).panel.tiles.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent strokes retain all coordinates and imported scenes can be selected', async () => {
  const { directory, game, gm } = await fixture();
  try {
    const member = await game.authenticate(gm);
    const { panel } = await game.snapshot(member);
    await Promise.all(
      Array.from({ length: 8 }, (_, x) =>
        game.paint(member, {
          panelId: panel.id,
          tiles: [{ x, y: 0, terrain: 'stone', blocked: false }],
        }),
      ),
    );
    assert.equal((await game.snapshot(member)).panel.tiles.length, 8);
    await game.importPanel(member, {
      version: 1,
      name: 'Imported forest',
      grid: { cols: 8, rows: 8, tileSize: 32 },
      tiles: [{ x: 3, y: 4, terrain: 'forest', blocked: true }],
    });
    const imported = await game.snapshot(member);
    assert.equal(imported.panel.name, 'Imported forest');
    assert.equal(imported.panels.length, 2);
    await game.changePanel(member, panel.id);
    assert.equal((await game.snapshot(member)).panel.tiles.length, 8);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed persistence write leaves the scene unchanged and does not block the next edit', async () => {
  const { directory, store, gm } = await fixture();
  let failNextWrite = true;
  const game = new GameService({
    mode: 'local',
    load: () => store.load(),
    save: async (data) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('Storage unavailable');
      }
      await store.save(data);
    },
  });
  try {
    const member = await game.authenticate(gm);
    const { panel } = await game.snapshot(member);
    const paint = { panelId: panel.id, tiles: [{ x: 2, y: 3, terrain: 'forest', blocked: true }] };
    await assert.rejects(game.paint(member, paint), /Storage unavailable/);
    assert.equal((await game.snapshot(member)).panel.tiles.length, 0);
    await game.paint(member, paint);
    assert.equal((await game.snapshot(member)).panel.tiles.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
