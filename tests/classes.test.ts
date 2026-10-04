import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attributeDefinitions,
  defaultClasses,
  calculateAttributes,
  findClassSelection,
  calculateTraits,
} from '../src/lib/classes';
import { classesSchema, characterSchema, diceSchema } from '../src/lib/validation';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/server/game';
import { FileStore } from '../src/server/store';
import { defaultAppearance } from '../src/lib/characters';
import type { Room } from '../src/types/game';

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'tavern-classes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileStore(join(directory, 'store.json'));
  const game = new GameService(store);
  const gm = await game.create({ name: 'Classes', nickname: 'GM', template: 'woodland' });
  const player = await game.join({ code: gm.roomCode, nickname: 'Player' });
  return {
    store,
    game,
    gm,
    player,
    master: await game.authenticate(gm),
    guest: await game.authenticate(player),
  };
}

test('ships four default classes with valid attribute modifiers', () => {
  assert.deepEqual(
    defaultClasses.map((item) => item.name),
    ['Guerreiro', 'Mago', 'Bárbaro', 'Arqueiro'],
  );
  assert.ok(defaultClasses.every((item) => item.subclasses.length > 0));
  assert.ok(
    defaultClasses.every(
      (item) => Object.keys(item.attributes).length === attributeDefinitions.length,
    ),
  );
});

test('calculates effective attributes from class and subclass modifiers', () => {
  const warrior = defaultClasses[0];
  const subclass = warrior.subclasses[0];
  const attributes = calculateAttributes(warrior, subclass);
  assert.equal(attributes.forca, warrior.attributes.forca + subclass.attributes.forca);
  assert.equal(attributes.carisma, warrior.attributes.carisma + subclass.attributes.carisma);
});

test('rejects a subclass that belongs to another class', () => {
  const selection = findClassSelection(
    defaultClasses,
    defaultClasses[0].id,
    defaultClasses[1].subclasses[0].id,
  );
  assert.equal(selection, null);
});

test('adds negative and missing modifiers without mutating class definitions', () => {
  const base = { ...defaultClasses[0], attributes: { forca: 2, destreza: -1 } };
  const sub = { ...base.subclasses[0], attributes: { forca: -3, carisma: 4 } };
  assert.deepEqual(calculateAttributes(base, sub), {
    forca: -1,
    destreza: -1,
    constituicao: 0,
    inteligencia: 0,
    sabedoria: 0,
    carisma: 4,
  });
  assert.deepEqual(base.attributes, { forca: 2, destreza: -1 });
  assert.deepEqual(calculateAttributes(), {
    forca: 0,
    destreza: 0,
    constituicao: 0,
    inteligencia: 0,
    sabedoria: 0,
    carisma: 0,
  });
});

test('combines descriptive class and subclass traits and resolves optional selections', () => {
  const base = defaultClasses[0];
  const sub = base.subclasses[0];
  assert.deepEqual(calculateTraits(base, sub), {
    buffs: [...base.buffs, ...sub.buffs],
    debuffs: [...base.debuffs, ...sub.debuffs],
  });
  assert.deepEqual(findClassSelection(defaultClasses, base.id), {
    characterClass: base,
    subclass: undefined,
  });
  assert.equal(findClassSelection(defaultClasses, 'missing'), null);
  assert.equal(findClassSelection(defaultClasses, undefined, sub.id), null);
});

test('catalog validation rejects duplicate IDs, unknown attributes and unbounded data', () => {
  assert.equal(classesSchema.safeParse(defaultClasses).success, true);
  assert.equal(classesSchema.safeParse([]).success, true);
  const base = structuredClone(defaultClasses[0]);
  for (const invalid of [
    [base, base],
    [{ ...base, attributes: { ...base.attributes, luck: 3 } }],
    [{ ...base, attributes: { ...base.attributes, forca: 101 } }],
    [{ ...base, attributes: { ...base.attributes, forca: 1.5 } }],
    [{ ...base, subclasses: [base.subclasses[0], base.subclasses[0]] }],
    [
      {
        ...base,
        buffs: [
          { id: 'same', name: 'A', description: '' },
          { id: 'same', name: 'B', description: '' },
        ],
      },
    ],
    [{ ...base, name: '' }],
    [{ ...base, description: 'x'.repeat(241) }],
    Array.from({ length: 17 }, (_, i) => ({ ...base, id: `class-${i}` })),
  ])
    assert.equal(classesSchema.safeParse(invalid).success, false);
  const full = {
    ...base,
    description: 'é'.repeat(240),
    buffs: Array.from({ length: 8 }, (_, i) => ({
      id: `buff-${i}`,
      name: 'Trait',
      description: 'é'.repeat(240),
    })),
  };
  assert.equal(
    classesSchema.safeParse(Array.from({ length: 16 }, (_, i) => ({ ...full, id: `class-${i}` })))
      .success,
    false,
  );
});

test('character and dice schemas accept known attributes but reject orphan subclasses and unknown checks', () => {
  assert.equal(
    characterSchema.safeParse({
      skinColor: '#fcd0a1',
      hairStyle: 0,
      hairColor: '#69381e',
      shirtStyle: 0,
      shirtColor: '#315d44',
      pantsColor: '#343d46',
      subclassId: 'orphan',
    }).success,
    false,
  );
  assert.equal(
    diceSchema.safeParse({ sides: 20, count: 1, modifier: 0, attribute: 'forca' }).success,
    true,
  );
  assert.equal(
    diceSchema.safeParse({ sides: 20, count: 1, modifier: 0, attribute: 'luck' }).success,
    false,
  );
});

test('new rooms persist independent defaults and accept a configured or empty catalog', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.game.snapshot(f.master)).room.classes, defaultClasses);
  const custom = [{ ...defaultClasses[0], name: 'Sentinela' }];
  const configured = await f.game.create({ name: 'Custom', nickname: 'GM', classes: custom });
  custom[0].name = 'Changed caller';
  const other = await f.game.authenticate(configured);
  assert.equal((await f.game.snapshot(other)).room.classes[0].name, 'Sentinela');
  const empty = await f.game.create({ name: 'Empty', nickname: 'GM', classes: [] });
  assert.deepEqual((await f.game.snapshot(await f.game.authenticate(empty))).room.classes, []);
  const reloaded = new GameService(new FileStore(f.store.filename));
  assert.equal(
    (await reloaded.snapshot(await reloaded.authenticate(configured))).room.classes[0].name,
    'Sentinela',
  );
  assert.equal((await reloaded.snapshot(await reloaded.authenticate(f.gm))).room.classes.length, 4);
});

test('legacy rooms gain defaults on load while explicitly empty catalogs remain empty', async (t) => {
  const f = await fixture(t);
  const empty = await f.game.create({ name: 'Empty', nickname: 'GM', classes: [] });
  const state = await f.store.load();
  delete (state.rooms[0] as Partial<Room>).classes;
  await f.store.save(state);
  const reloaded = new GameService(new FileStore(f.store.filename));
  assert.equal((await reloaded.snapshot(await reloaded.authenticate(f.gm))).room.classes.length, 4);
  assert.deepEqual((await reloaded.snapshot(await reloaded.authenticate(empty))).room.classes, []);
  await reloaded.updateCharacter(await reloaded.authenticate(f.player), defaultAppearance);
  assert.equal((await f.store.load()).rooms[0].classes.length, 4);
});

test('only the authenticated room GM can replace a validated class catalog', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.game.updateClasses(f.guest, { classes: [] }), /master/i);
  await assert.rejects(
    f.game.updateClasses({ ...f.guest, role: 'gm' }, { classes: [] }),
    /master/i,
  );
  await assert.rejects(
    f.game.updateClasses(f.master, { classes: [defaultClasses[0], defaultClasses[0]] }),
  );
  await f.game.updateClasses(f.master, { classes: [{ ...defaultClasses[0], name: 'Sentinela' }] });
  assert.equal((await f.game.snapshot(f.guest)).room.classes[0].name, 'Sentinela');
  const reload = new GameService(new FileStore(f.store.filename));
  assert.equal(
    (await reload.snapshot(await reload.authenticate(f.player))).room.classes[0].name,
    'Sentinela',
  );
});

test('characters validate selections against their own room catalog and allow legacy appearance-only saves', async (t) => {
  const f = await fixture(t);
  for (const selection of [
    { classId: 'absent' },
    { classId: 'guerreiro', subclassId: 'arcanista' },
    { subclassId: 'guardiao' },
  ])
    await assert.rejects(f.game.updateCharacter(f.guest, { ...defaultAppearance, ...selection }));
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  assert.equal((await f.game.snapshot(f.guest)).you.character?.subclassId, 'guardiao');
  await f.game.updateCharacter(f.guest, defaultAppearance);
  assert.deepEqual((await f.game.snapshot(f.guest)).you.character, defaultAppearance);
});

test('deleting selections cleans offline characters while preserving appearance, tokens and unrelated rooms', async (t) => {
  const f = await fixture(t);
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  const token = (await f.game.snapshot(f.guest)).you.token;
  const other = await f.game.create({ name: 'Other', nickname: 'GM' });
  await f.game.updateClasses(f.master, { classes: [{ ...defaultClasses[0], subclasses: [] }] });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.character, {
    ...defaultAppearance,
    classId: 'guerreiro',
  });
  assert.deepEqual((await f.game.snapshot(f.guest)).you.token, token);
  await f.game.updateClasses(f.master, { classes: [] });
  const reload = new GameService(new FileStore(f.store.filename));
  const saved = await reload.snapshot(await reload.authenticate(f.player));
  assert.deepEqual(saved.you.character, defaultAppearance);
  assert.deepEqual(saved.you.token, token);
  assert.deepEqual(saved.room.classes, []);
  assert.equal((await reload.snapshot(await reload.authenticate(other))).room.classes.length, 4);
});

test('attribute checks use the current persisted selection and trusted labels and bonuses', async (t) => {
  const f = await fixture(t);
  await f.game.updateCharacter(f.guest, {
    ...defaultAppearance,
    classId: 'guerreiro',
    subclassId: 'guardiao',
  });
  const first = await f.game.rollDice(f.guest, {
    sides: 20,
    count: 1,
    modifier: 999,
    attribute: 'forca',
    label: 'Forged',
  });
  assert.equal(first.modifier, 2);
  assert.equal(first.label, 'Teste de Força');
  assert.equal(first.attribute, 'forca');
  assert.equal(first.total, first.values[0] + 2);
  const updated = structuredClone(defaultClasses);
  updated[0].attributes.forca = -4;
  await f.game.updateClasses(f.master, { classes: updated });
  const second = await f.game.rollDice(f.guest, {
    sides: 20,
    count: 1,
    modifier: 2,
    attribute: 'forca',
  });
  assert.equal(second.modifier, -4);
  assert.equal(second.total, second.values[0] - 4);
  const zero = await f.game.rollDice(f.guest, {
    sides: 20,
    count: 1,
    modifier: 3,
    attribute: 'carisma',
  });
  assert.equal(zero.modifier, 0);
  const reload = new GameService(new FileStore(f.store.filename));
  assert.deepEqual((await reload.snapshot(await reload.authenticate(f.player))).rolls, [
    first,
    second,
    zero,
  ]);
});

test('invalid attribute checks never reach history and ordinary dice stay compatible', async (t) => {
  const f = await fixture(t);
  const request = { sides: 20, count: 1, modifier: 0, attribute: 'forca' };
  await assert.rejects(f.game.rollDice(f.master, request), /character|player/i);
  await assert.rejects(f.game.rollDice(f.guest, request), /class/i);
  await f.game.updateCharacter(f.guest, { ...defaultAppearance, classId: 'mago' });
  for (const invalid of [
    { ...request, sides: 6 },
    { ...request, count: 2 },
    { ...request, attribute: 'luck' },
  ])
    await assert.rejects(f.game.rollDice(f.guest, invalid));
  assert.equal((await f.game.snapshot(f.guest)).rolls.length, 0);
  const ordinary = await f.game.rollDice(f.master, {
    sides: 6,
    count: 2,
    modifier: -2,
    label: 'Damage',
  });
  assert.equal(ordinary.label, 'Damage');
  assert.equal(ordinary.total, ordinary.values[0] + ordinary.values[1] - 2);
});

test('failed writes do not publish class edits, selection cleanup or attribute rolls', async (t) => {
  const f = await fixture(t);
  await f.game.updateCharacter(f.guest, { ...defaultAppearance, classId: 'guerreiro' });
  const save = f.store.save.bind(f.store);
  f.store.save = async () => {
    throw new Error('Disk unavailable');
  };
  await assert.rejects(f.game.updateClasses(f.master, { classes: [] }), /Disk/);
  await assert.rejects(
    f.game.rollDice(f.guest, { sides: 20, count: 1, modifier: 0, attribute: 'forca' }),
    /Disk/,
  );
  assert.equal((await f.game.snapshot(f.guest)).you.character?.classId, 'guerreiro');
  assert.equal((await f.game.snapshot(f.guest)).room.classes.length, 4);
  assert.equal((await f.game.snapshot(f.guest)).rolls.length, 0);
  f.store.save = save;
  await f.game.updateClasses(f.master, { classes: [] });
  assert.equal((await f.game.snapshot(f.guest)).you.character?.classId, undefined);
});
