import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { GameService } from '../src/server/game';
import { MongoStore } from '../src/server/store';

test('MongoDB restores private GM access, scene selection and tile coordinates after reconnect', async () => {
  const uri = process.env.MONGODB_TEST_URI;
  assert.ok(uri, 'Set MONGODB_TEST_URI to a test MongoDB instance before running test:mongodb.');
  const database = `tavern_test_${randomUUID().replaceAll('-', '')}`;
  const store = new MongoStore(uri, database);
  const restoredStore = new MongoStore(uri, database);
  try {
    const game = new GameService(store);
    const credential = await game.create({
      name: 'MongoDB adventure',
      nickname: 'Lelo',
      template: 'blank',
    });
    const gm = await game.authenticate(credential);
    await game.createPanel(gm, { name: 'Saved forest', cols: 12, rows: 10, template: 'blank' });
    const { panel } = await game.snapshot(gm);
    await game.paint(gm, {
      panelId: panel.id,
      tiles: [
        { x: 1, y: 2, terrain: 'forest', blocked: true },
        { x: 2, y: 1, terrain: 'water', blocked: false },
      ],
    });
    await game.renamePanel(gm, { panelId: panel.id, name: 'Forest crossing' });
    await store.close();

    const restored = new GameService(restoredStore);
    const restoredGM = await restored.authenticate(credential);
    const snapshot = await restored.snapshot(restoredGM);
    assert.equal(restoredGM.role, 'gm');
    assert.equal(snapshot.panel.name, 'Forest crossing');
    assert.equal(snapshot.panels.length, 2);
    assert.deepEqual(snapshot.panel.tiles, [
      { x: 1, y: 2, terrain: 'forest', blocked: true },
      { x: 2, y: 1, terrain: 'water', blocked: false },
    ]);
    await assert.rejects(
      restored.authenticate({ ...credential, token: '0'.repeat(64) }),
      /session/i,
    );
  } finally {
    await store.close();
    await restoredStore.close();
    const cleanup = new MongoClient(uri);
    try {
      await cleanup.db(database).dropDatabase();
    } finally {
      await cleanup.close();
    }
  }
});
