import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore, type Session } from '../src/server/store';
import { defaultAppearance } from '../src/lib/characters';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-gm-'));
  const store = new FileStore(join(directory, 'state.json'));
  const game = new GameService(store);
  const credential = await game.create({ name: 'GM controls', nickname: 'GM', template: 'blank' });
  const gm = await game.authenticate(credential);
  const player = await game.authenticate(
    await game.join({ code: credential.roomCode, nickname: 'Player' }),
  );
  const panel = (await game.snapshot(gm)).panel;
  await game.paint(gm, {
    panelId: panel.id,
    tiles: [
      { x: 0, y: 0, terrain: 'grass', blocked: false },
      { x: 1, y: 0, terrain: 'grass', blocked: false },
      { x: 2, y: 0, terrain: 'wall', blocked: true },
      { x: 3, y: 3, terrain: 'grass', blocked: false },
      { x: 2, y: 3, terrain: 'grass', blocked: false },
      { x: 4, y: 3, terrain: 'grass', blocked: false },
    ],
  });
  return { directory, store, game, credential, gm, player, panel };
}
async function action(game: GameService, method: string, member: Session, input: unknown) {
  const operation = Reflect.get(game, method);
  assert.equal(typeof operation, 'function', `GameService must implement ${method}`);
  return operation.call(game, member, input);
}

test('GM coordinates without a character and old GM tokens are removed before spawning players', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.game.updateCharacter(f.gm, defaultAppearance), /players/i);
    const old = await f.store.load();
    Object.assign(
      old.sessions.find((member) => member.id === f.gm.id)!,
      { character: defaultAppearance, token: { panelId: f.panel.id, x: 0, y: 0 } },
    );
    await f.store.save(old);
    const restored = new GameService(new FileStore(f.store.filename));
    const gmView = await restored.snapshot(f.gm, [f.gm, f.player]);
    assert.equal(gmView.you.character, undefined);
    assert.equal(gmView.you.token, undefined);
    await restored.updateCharacter(f.player, defaultAppearance);
    assert.deepEqual((await restored.snapshot(f.player)).you.token, {
      panelId: f.panel.id,
      x: 0,
      y: 0,
    });
    const stored = (await f.store.load()).sessions.find((member) => member.id === f.gm.id)!;
    assert.equal(stored.character, undefined);
    assert.equal(stored.token, undefined);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('only GM can pause and resume player movement; a pause persists and cannot be bypassed by forged target IDs', async () => {
  const f = await fixture();
  try {
    await f.game.updateCharacter(f.player, defaultAppearance);
    await assert.rejects(action(f.game, 'setMovement', f.player, { allowed: false }), /master/i);
    await action(f.game, 'setMovement', f.gm, { allowed: false });
    const move = { panelId: f.panel.id, x: 1, y: 0 };
    await assert.rejects(f.game.moveToken(f.player, move), /paused/i);
    await assert.rejects(f.game.moveToken(f.player, { ...move, memberId: f.player.id }), /paused/i);
    const restored = new GameService(new FileStore(f.store.filename));
    assert.equal((await restored.snapshot(f.player)).room.playersCanMove, false);
    await action(restored, 'setMovement', f.gm, { allowed: true });
    await restored.moveToken(f.player, move);
    assert.deepEqual((await restored.snapshot(f.player)).you.token, move);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('GM repositions a player across the map while movement is paused; players cannot move another player or forge a GM role', async () => {
  const f = await fixture();
  try {
    await f.game.updateCharacter(f.player, defaultAppearance);
    const companion = await f.game.authenticate(
      await f.game.join({ code: f.credential.roomCode, nickname: 'Companion' }),
    );
    await f.game.updateCharacter(companion, defaultAppearance);
    const target = { panelId: f.panel.id, x: 3, y: 3, memberId: f.player.id };
    await assert.rejects(f.game.moveToken(companion, target), /own/i);
    await assert.rejects(f.game.moveToken({ ...companion, role: 'gm' }, target), /own/i);
    await action(f.game, 'setMovement', f.gm, { allowed: false });
    await f.game.updateFog(f.gm, { panelId: f.panel.id, enabled: true });
    const moved = await f.game.moveToken(f.gm, target);
    assert.deepEqual(moved, { panelId: f.panel.id, x: 3, y: 3 });
    await assert.rejects(f.game.moveToken(f.gm, { ...target, x: 2, y: 0 }));
    await assert.rejects(f.game.moveToken(f.gm, { ...target, x: 1, y: 0 }));
    const other = await f.game.create({ name: 'Other', nickname: 'Other', template: 'blank' });
    await assert.rejects(f.game.moveToken(await f.game.authenticate(other), target));
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('per-scene spawn points prefer the marked tile then nearest free tiles, survive restart and are copied with a scene', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      action(f.game, 'setSpawn', f.player, { panelId: f.panel.id, point: { x: 3, y: 3 } }),
      /master/i,
    );
    await assert.rejects(
      action(f.game, 'setSpawn', f.gm, { panelId: f.panel.id, point: { x: 99, y: 0 } }),
    );
    await action(f.game, 'setSpawn', f.gm, { panelId: f.panel.id, point: { x: 3, y: 3 } });
    await f.game.updateCharacter(f.player, defaultAppearance);
    assert.deepEqual((await f.game.snapshot(f.player)).you.token, {
      panelId: f.panel.id,
      x: 3,
      y: 3,
    });
    const companion = await f.game.authenticate(
      await f.game.join({ code: f.credential.roomCode, nickname: 'Companion' }),
    );
    await f.game.updateCharacter(companion, defaultAppearance);
    assert.deepEqual((await f.game.snapshot(companion)).you.token, {
      panelId: f.panel.id,
      x: 2,
      y: 3,
    });
    const restored = new GameService(new FileStore(f.store.filename));
    assert.deepEqual((await restored.snapshot(f.gm)).panel.spawnPoint, { x: 3, y: 3 });
    await restored.duplicatePanel(f.gm, f.panel.id);
    assert.deepEqual((await restored.snapshot(f.gm)).panel.spawnPoint, { x: 3, y: 3 });
    await action(restored, 'setSpawn', f.gm, {
      panelId: (await restored.snapshot(f.gm)).panel.id,
      point: null,
    });
    assert.equal((await restored.snapshot(f.gm)).panel.spawnPoint, undefined);
    await restored.changePanel(f.gm, f.panel.id);
    assert.deepEqual((await restored.snapshot(f.gm)).panel.spawnPoint, { x: 3, y: 3 });
    await restored.paint(f.gm, {
      panelId: f.panel.id,
      tiles: [{ x: 3, y: 3, terrain: 'wall', blocked: true }],
    });
    assert.deepEqual((await restored.snapshot(f.player)).you.token, {
      panelId: f.panel.id,
      x: 4,
      y: 3,
    });
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
