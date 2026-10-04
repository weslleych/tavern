import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as classes from '../src/lib/classes';
import * as validation from '../src/lib/validation';
import { defaultAppearance } from '../src/lib/characters';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-health-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileStore(join(directory, 'store.json'));
  const game = new GameService(store);
  const gm = await game.create({ name: 'Health', nickname: 'GM' });
  const player = await game.join({ code: gm.roomCode, nickname: 'Marle' });
  const master = await game.authenticate(gm);
  const guest = await game.authenticate(player);
  return { store, game, gm, player, master, guest };
}

test('health maximum sums optional modifiers and GM bonus with a minimum of one', () => {
  assert.equal(typeof classes.calculateMaxHealth, 'function');
  for (const [cls, sub, bonus, want] of [
    [undefined, undefined, 0, 20],
    [4, 2, 0, 26],
    [-2, 0, 3, 21],
    [6, 2, -5, 23],
    [-100, -100, -100, 1],
  ] as const) {
    assert.equal(
      classes.calculateMaxHealth(
        cls === undefined ? undefined : { healthModifier: cls },
        sub === undefined ? undefined : { healthModifier: sub },
        bonus,
      ),
      want,
    );
  }
  assert.equal(
    classes.calculateMaxHealth(classes.defaultClasses[0], classes.defaultClasses[0].subclasses[0]),
    26,
  );
  assert.equal(
    classes.calculateMaxHealth(classes.defaultClasses[0], classes.defaultClasses[0].subclasses[1]),
    23,
  );
  assert.equal(
    classes.calculateMaxHealth(classes.defaultClasses[1], classes.defaultClasses[1].subclasses[0]),
    18,
  );
  assert.equal(
    classes.calculateMaxHealth(classes.defaultClasses[2], classes.defaultClasses[2].subclasses[0]),
    28,
  );
  assert.equal(
    classes.calculateMaxHealth(classes.defaultClasses[3], classes.defaultClasses[3].subclasses[0]),
    21,
  );
});

test('health inputs reject empty, ambiguous, fractional, unknown and out-of-range changes', () => {
  assert.ok(validation.healthAdjustmentSchema);
  for (const value of [
    {},
    { memberId: 'bad', delta: 1 },
    { current: -1 },
    { current: 1000 },
    { delta: -1000 },
    { delta: 1000 },
    { delta: 0.5 },
    { gmBonus: 101 },
    { gmBonus: -101 },
    { gmBonus: 0.5 },
    { current: 10, delta: 1 },
    { max: 999 },
    { current: 1, role: 'gm' },
  ]) {
    assert.equal(validation.healthAdjustmentSchema.safeParse(value).success, false);
  }
  for (const value of [
    { current: 0 },
    { delta: -999 },
    { delta: 999 },
    { gmBonus: -100 },
    { current: 0, gmBonus: 100 },
  ]) {
    assert.equal(validation.healthAdjustmentSchema.safeParse(value).success, true);
  }
  for (const value of [-101, 101, 0.5]) {
    assert.equal(
      validation.classesSchema.safeParse([{ ...classes.defaultClasses[0], healthModifier: value }])
        .success,
      false,
    );
    const cls = structuredClone(classes.defaultClasses[0]);
    cls.subclasses[0].healthModifier = value;
    assert.equal(validation.classesSchema.safeParse([cls]).success, false);
  }
  const legacy = structuredClone(classes.defaultClasses[0]);
  delete legacy.healthModifier;
  delete legacy.subclasses[0].healthModifier;
  const normalized = validation.classesSchema.parse([legacy])[0];
  assert.equal(normalized.healthModifier, 0);
  assert.equal(normalized.subclasses[0].healthModifier, 0);
});

test('new players have base health, public snapshots share it and GMs have no health', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 20,
    max: 20,
    gmBonus: 0,
  });
  assert.equal((await f.game.snapshot(f.master)).you.health, undefined);
  const view = await f.game.snapshot(f.master, [f.guest]);
  assert.deepEqual(view.members[0].health, { current: 20, max: 20, gmBonus: 0 });
  assert.equal('tokenHash' in view.members[0], false);
});

test('first character creation fills class and subclass health and persists it across restart', async (t) => {
  const f = await fixture(t);
  const catalog = structuredClone(classes.defaultClasses);
  catalog[0].healthModifier = 8;
  catalog[0].subclasses[0].healthModifier = 2;
  await f.game.updateClasses(f.master, { classes: catalog });
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 30,
    max: 30,
    gmBonus: 0,
  });
  const reload = new GameService(new FileStore(f.store.filename));
  const guest = await reload.authenticate(f.player);
  assert.deepEqual((await reload.snapshot(guest)).you.health, {
    current: 30,
    max: 30,
    gmBonus: 0,
  });
  await reload.adjustHealth(guest, { delta: -5 });
  // Repeated creation requests and appearance/class edits must not refill existing health.
  await reload.updateCharacter(guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.equal((await reload.snapshot(guest)).you.health?.current, 25);
  await reload.updateCharacter(guest, defaultAppearance);
  assert.deepEqual((await reload.snapshot(guest)).you.health, {
    current: 20,
    max: 20,
    gmBonus: 0,
  });
  await reload.updateCharacter(guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.deepEqual((await reload.snapshot(guest)).you.health, {
    current: 20,
    max: 30,
    gmBonus: 0,
  });
});

test('first character creation fills health including a previously configured GM bonus', async (t) => {
  const f = await fixture(t);
  await f.game.adjustHealth(f.master, { memberId: f.guest.id, gmBonus: 4 });
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 30,
    max: 30,
    gmBonus: 4,
  });
});

test('GM changes current health and bonus; players clamp only their own current health', async (t) => {
  const f = await fixture(t);
  assert.equal(typeof f.game.adjustHealth, 'function');
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.deepEqual(
    await f.game.adjustHealth(f.master, { memberId: f.guest.id, gmBonus: 4, current: 999 }),
    { memberId: f.guest.id, health: { current: 30, max: 30, gmBonus: 4 } },
  );
  assert.equal((await f.game.adjustHealth(f.guest, { delta: -999 })).health.current, 0);
  assert.equal((await f.game.adjustHealth(f.guest, { current: 999 })).health.current, 30);
  assert.equal(
    (await f.game.adjustHealth(f.guest, { memberId: f.guest.id, delta: -5 })).health.current,
    25,
  );
  assert.deepEqual(
    (await f.game.adjustHealth(f.master, { memberId: f.guest.id, gmBonus: -100 })).health,
    { current: 1, max: 1, gmBonus: -100 },
  );
});

test('persisted authority rejects forged roles, other players, other rooms and GM targets', async (t) => {
  const f = await fixture(t);
  assert.equal(typeof f.game.adjustHealth, 'function');
  const second = await f.game.join({ code: f.gm.roomCode, nickname: 'Lucca' });
  const other = await f.game.create({ name: 'Other', nickname: 'Other GM' });
  const outsider = await f.game.join({ code: other.roomCode, nickname: 'Other player' });
  for (const [actor, input] of [
    [f.guest, { memberId: second.memberId, current: 1 }],
    [f.guest, { gmBonus: 0 }],
    [
      { ...f.guest, role: 'gm' as const },
      { memberId: second.memberId, gmBonus: 10 },
    ],
    [f.master, { memberId: outsider.memberId, delta: -5 }],
    [f.master, { memberId: f.master.id, delta: -5 }],
    [f.master, { delta: 1 }],
    [{ ...f.guest, id: outsider.memberId }, { delta: -5 }],
  ] as const)
    await assert.rejects(f.game.adjustHealth(actor, input));
  assert.equal((await f.game.snapshot(f.guest)).you.health?.current, 20);
});

test('selection and catalog changes recalculate offline player health without healing or losing bonuses', async (t) => {
  const f = await fixture(t);
  assert.equal(typeof f.game.adjustHealth, 'function');
  await f.game.updateCharacter(f.guest, defaultAppearance);
  await f.game.adjustHealth(f.master, { memberId: f.guest.id, gmBonus: 3, current: 23 });
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 23,
    max: 29,
    gmBonus: 3,
  });
  const updated = structuredClone(classes.defaultClasses);
  updated[0].healthModifier = -10;
  await f.game.updateClasses(f.master, { classes: updated });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 15,
    max: 15,
    gmBonus: 3,
  });
  updated[0].subclasses = [];
  await f.game.updateClasses(f.master, { classes: updated });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 13,
    max: 13,
    gmBonus: 3,
  });
  await f.game.updateClasses(f.master, { classes: [] });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 13,
    max: 23,
    gmBonus: 3,
  });
  await f.game.adjustHealth(f.guest, { current: 0 });
  await f.game.updateCharacter(f.guest, defaultAppearance);
  assert.equal((await f.game.snapshot(f.guest)).you.health?.current, 0);
  const reload = new GameService(new FileStore(f.store.filename));
  assert.deepEqual((await reload.snapshot(await reload.authenticate(f.player))).you.health, {
    current: 0,
    max: 23,
    gmBonus: 3,
  });
});

test('legacy health migration respects existing catalogs and preserves saved health and characters', async (t) => {
  const f = await fixture(t);
  const second = await f.game.join({ code: f.gm.roomCode, nickname: 'Lucca' });
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  const data = await f.store.load();
  const legacy = data.sessions.find((session) => session.id === f.guest.id)!;
  delete legacy.health;
  const existing = data.sessions.find((session) => session.id === second.memberId)!;
  existing.health = { current: 7, max: 25, gmBonus: 5 };
  data.sessions.find((session) => session.id === f.master.id)!.health = { current: 10, max: 10 };
  await f.store.save(data);
  const reload = new GameService(new FileStore(f.store.filename));
  const guest = await reload.authenticate(f.player);
  assert.deepEqual((await reload.snapshot(guest)).you.health, { current: 26, max: 26, gmBonus: 0 });
  assert.deepEqual((await reload.snapshot(await reload.authenticate(second))).you.health, {
    current: 7,
    max: 25,
    gmBonus: 5,
  });
  assert.equal((await reload.snapshot(await reload.authenticate(f.gm))).you.health, undefined);
  await reload.updateCharacter(guest, legacy.character);
  assert.deepEqual(
    (await f.store.load()).sessions.find((session) => session.id === f.guest.id)?.health,
    { current: 26, max: 26, gmBonus: 0 },
  );
  assert.equal(
    (await f.store.load()).sessions.find((session) => session.id === f.master.id)?.health,
    undefined,
  );
});

test('health deltas serialize, survive restart and failed writes never change confirmed health', async (t) => {
  const f = await fixture(t);
  assert.equal(typeof f.game.adjustHealth, 'function');
  await Promise.all(Array.from({ length: 5 }, () => f.game.adjustHealth(f.guest, { delta: -1 })));
  assert.equal((await f.game.snapshot(f.guest)).you.health?.current, 15);
  const save = f.store.save.bind(f.store);
  f.store.save = async () => {
    throw new Error('Disk unavailable');
  };
  await assert.rejects(
    f.game.adjustHealth(f.master, { memberId: f.guest.id, current: 0, gmBonus: 10 }),
    /Disk/,
  );
  assert.deepEqual((await f.game.snapshot(f.guest)).you.health, {
    current: 15,
    max: 20,
    gmBonus: 0,
  });
  f.store.save = save;
  await f.game.adjustHealth(f.guest, { delta: -1 });
  const reload = new GameService(new FileStore(f.store.filename));
  assert.deepEqual((await reload.snapshot(await reload.authenticate(f.player))).you.health, {
    current: 14,
    max: 20,
    gmBonus: 0,
  });
});
