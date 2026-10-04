import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import { createApi } from '../src/server/http';
import { defaultClasses } from '../src/lib/classes';

test('HTTP creation accepts a class catalog above 8 KB and rejects bodies above 32 KB', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-class-http-'));
  const game = new GameService(new FileStore(join(directory, 'store.json')));
  const api = createApi(game);
  const server = createServer((req, res) => {
    void api(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const classes = structuredClone(defaultClasses);
  for (const item of classes) {
    item.description = 'a'.repeat(240);
    item.buffs = Array.from({ length: 8 }, (_, i) => ({
      id: `buff-${i}`,
      name: 'Trait',
      description: 'b'.repeat(240),
    }));
  }
  const body = JSON.stringify({ name: 'HTTP classes', nickname: 'GM', classes });
  assert.ok(Buffer.byteLength(body) > 8192);
  const post = (data: string) =>
    fetch(`http://127.0.0.1:${port}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
    });
  try {
    const accepted = await post(body);
    assert.equal(accepted.status, 201);
    const { data } = await accepted.json();
    assert.deepEqual((await game.snapshot(await game.authenticate(data))).room.classes, classes);
    assert.equal(
      (await post(JSON.stringify({ name: 'Oversize', nickname: 'GM', padding: 'x'.repeat(32768) })))
        .status,
      413,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
