import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import { defaultAppearance } from '../src/lib/characters';
import { validateImportedStructures } from '../src/server/structures';
import type { Panel, PublicPanel } from '../src/types/game';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-starter-'));
  const store = new FileStore(join(directory, 'state.json'));
  const game = new GameService(store);
  const credential = await game.create({ name: 'Adventure', nickname: 'GM', template: 'woodland' });
  const gm = await game.authenticate(credential);
  return {
    game,
    gm,
    credential,
    store,
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

function reachableTiles(panel: PublicPanel) {
  const occupied = new Set(
    (panel.monsters ?? [])
      .filter((monster) => !monster.defeated)
      .map((monster) => `${monster.x},${monster.y}`),
  );
  const walkable = new Set(
    panel.tiles
      .filter(
        (tile) => !tile.blocked && tile.terrain !== 'empty' && !occupied.has(`${tile.x},${tile.y}`),
      )
      .map((tile) => `${tile.x},${tile.y}`),
  );
  assert.ok(panel.spawnPoint, `${panel.name} needs a preferred arrival point`);
  const start = panel.spawnPoint!;
  assert.ok(walkable.has(`${start.x},${start.y}`), `${panel.name} arrival must be free`);
  const reached = new Set([`${start.x},${start.y}`]);
  const pending = [start];
  for (let i = 0; i < pending.length; i++) {
    const { x, y } = pending[i];
    for (const next of [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ]) {
      const key = `${next.x},${next.y}`;
      if (walkable.has(key) && !reached.has(key)) {
        reached.add(key);
        pending.push(next);
      }
    }
  }
  return reached;
}

test('the starting adventure persists a 40×40 world with every landmark linked to a decorated, reachable scene', async () => {
  const f = await fixture();
  try {
    const initial = await f.game.snapshot(f.gm);
    assert.deepEqual(initial.panel.grid, { cols: 40, rows: 40, tileSize: 32 });
    assert.equal(initial.panels.length, 6);
    assert.deepEqual(initial.panel.structures?.map((anchor) => anchor.templateKey).sort(), [
      'poi_castle',
      'poi_dungeon',
      'poi_shrine',
      'poi_town',
    ]);
    const restarted = new GameService(f.store);
    const gm = await restarted.authenticate(f.credential);
    assert.deepEqual(await restarted.snapshot(gm), initial);
    const destinations = new Set(initial.panels.map((panel) => panel.id));
    for (const summary of initial.panels) {
      await restarted.changePanel(gm, summary.id);
      const { panel } = await restarted.snapshot(gm);
      assert.equal(panel.tiles.length, panel.grid.cols * panel.grid.rows);
      assert.equal(
        new Set(panel.tiles.map((tile) => `${tile.x},${tile.y}`)).size,
        panel.tiles.length,
      );
      assert.ok(
        panel.tiles.every(
          (tile) =>
            tile.x >= 0 && tile.y >= 0 && tile.x < panel.grid.cols && tile.y < panel.grid.rows,
        ),
      );
      validateImportedStructures(structuredClone(panel) as Panel);
      const reached = reachableTiles(panel);
      const landmarks =
        panel.structures?.filter((anchor) => anchor.templateKey.startsWith('poi_')) ?? [];
      assert.ok(landmarks.length, `${panel.name} needs a travel route`);
      for (const anchor of landmarks) {
        assert.ok(anchor.targetPanelId && destinations.has(anchor.targetPanelId));
        assert.notEqual(anchor.targetPanelId, panel.id);
        const x = anchor.x + anchor.entranceOffset.dx;
        const y = anchor.y + anchor.entranceOffset.dy;
        assert.ok(
          reached.has(`${x},${y}`),
          `${anchor.name} entrance must be reachable from arrival`,
        );
        assert.ok(reached.has(`${x},${y + 1}`), `${anchor.name} needs a southern approach`);
      }
      if (panel.id !== initial.panel.id) {
        assert.ok(
          new Set(panel.tiles.map((tile) => tile.terrain)).size >= 5,
          `${panel.name} should have furnishings and scenery`,
        );
      }
      for (const monster of panel.monsters ?? []) {
        assert.ok(
          panel.tiles.some((tile) => tile.x === monster.x && tile.y === monster.y && !tile.blocked),
        );
        assert.notDeepEqual({ x: monster.x, y: monster.y }, panel.spawnPoint);
      }
    }
  } finally {
    await f.close();
  }
});

test('players can vote to enter every starting destination and follow linked exits back to the world', async () => {
  const f = await fixture();
  try {
    const playerCredential = await f.game.join({ code: f.credential.roomCode, nickname: 'Hero' });
    const player = await f.game.authenticate(playerCredential);
    await f.game.updateCharacter(player, defaultAppearance);
    f.game.setOnlineMembers(f.gm.roomId, [f.gm, player]);
    const initial = await f.game.snapshot(f.gm);
    assert.equal(initial.panels.length, 6);
    const visited = new Set<string>();
    async function travel(panelId: string, anchorId: string) {
      await f.game.changePanel(f.gm, panelId);
      const { panel } = await f.game.snapshot(f.gm);
      const anchor = panel.structures!.find((anchor) => anchor.id === anchorId)!;
      const x = anchor.x + anchor.entranceOffset.dx;
      const y = anchor.y + anchor.entranceOffset.dy;
      await f.game.moveToken(f.gm, { panelId, memberId: player.id, x, y: y + 1 });
      await f.game.moveToken(player, { panelId, x, y });
      const vote = (await f.game.snapshot(player)).room.travelVote!;
      assert.ok(vote, `${anchor.name} should trigger the travel prompt`);
      await f.game.voteTravel(player, { voteId: vote.id, accept: true });
      assert.equal((await f.game.snapshot(player)).panel.id, panelId);
      await f.game.decideTravel(f.gm, { voteId: vote.id, approved: true });
      const arrived = await f.game.snapshot(player);
      assert.equal(arrived.panel.id, anchor.targetPanelId);
      assert.deepEqual(
        { x: arrived.you.token!.x, y: arrived.you.token!.y },
        arrived.panel.spawnPoint,
      );
      visited.add(arrived.panel.id);
      return (await f.game.snapshot(f.gm)).panel;
    }
    for (const summary of initial.panels) {
      await f.game.changePanel(f.gm, summary.id);
      const { panel } = await f.game.snapshot(f.gm);
      for (const anchor of panel.structures ?? []) {
        if (!anchor.targetPanelId) continue;
        const destination = await travel(panel.id, anchor.id);
        if (panel.id === initial.panel.id) {
          const exit = destination.structures!.find(
            (exit) => exit.targetPanelId === initial.panel.id,
          );
          assert.ok(exit, `${destination.name} needs a return to the world`);
          await travel(destination.id, exit.id);
        }
      }
    }
    assert.equal(visited.size, initial.panels.length);
  } finally {
    await f.close();
  }
});

test('blank campaigns remain a single empty scene', async () => {
  const f = await fixture();
  try {
    const credential = await f.game.create({ name: 'Empty', nickname: 'GM', template: 'blank' });
    const snapshot = await f.game.snapshot(await f.game.authenticate(credential));
    assert.equal(snapshot.panels.length, 1);
    assert.deepEqual(snapshot.panel.tiles, []);
    assert.equal(snapshot.panel.structures?.length ?? 0, 0);
  } finally {
    await f.close();
  }
});
