import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { defaultClasses } from '../src/lib/classes';
import { localizeError } from '../src/i18n/errors';
import { healthAdjustmentSchema, readableError } from '../src/lib/validation';

async function localeModule() {
  assert.ok(existsSync('src/i18n/locale.ts'), 'locale negotiation is implemented');
  return import('../src/i18n/locale');
}

async function catalog(locale: string) {
  assert.ok(existsSync(`messages/${locale}.json`), `${locale} message catalog exists`);
  return JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
}

function leaves(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, message]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof message === 'object' && message !== null)
        return Object.entries(leaves(message as Record<string, unknown>, path));
      assert.equal(typeof message, 'string', path);
      assert.ok(String(message).trim(), `${path} is not empty`);
      return [[path, String(message)]];
    }),
  );
}

test('valid locale cookies override browser preferences; invalid cookies negotiate safely', async () => {
  const { resolveLocale } = await localeModule();
  assert.equal(resolveLocale('en', 'pt-BR,es;q=0.9'), 'en');
  assert.equal(resolveLocale('pt-BR', 'es'), 'pt-BR');
  assert.equal(resolveLocale('es', 'en'), 'es');
  assert.equal(resolveLocale('../../bad', 'es-MX'), 'es');
});

test('locale negotiation respects quality weights, regional variants and English fallback', async () => {
  const { resolveLocale } = await localeModule();
  for (const [header, expected] of [
    ['en-US,en;q=0.9,pt-BR;q=0.8', 'en'],
    ['pt-PT,es;q=0.8', 'pt-BR'],
    ['fr,es-AR;q=0.7,en;q=0.3', 'es'],
    ['pt-BR;q=0.3,es;q=0.9', 'es'],
    ['es;q=0,pt-BR;q=0.8', 'pt-BR'],
    ['es;q=invalid,en;q=0.5', 'en'],
    ['de-DE', 'en'],
    ['', 'en'],
  ])
    assert.equal(resolveLocale(undefined, header), expected, header);
  assert.equal(resolveLocale(), 'en');
});

test('all message catalogs have identical nonempty keys and interpolation variables', async () => {
  const english = leaves(await catalog('en'));
  for (const locale of ['es', 'pt-BR']) {
    const translated = leaves(await catalog(locale));
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      const variables = (text: string) =>
        [...text.matchAll(/\{(\w+)(?:\}|,)/g)].map((match) => match[1]).sort();
      assert.deepEqual(variables(translated[key]), variables(english[key]), `${locale}: ${key}`);
    }
  }
});

test('preset localization preserves canonical catalogs, custom fields and game modifiers', async () => {
  const messages = await catalog('en');
  const { createTranslator } = await import('next-intl');
  const { localizeClasses } = await import('../src/lib/classes');
  const translate = createTranslator({ locale: 'en', messages, namespace: 'classes.presets' });
  const original = structuredClone(defaultClasses);
  const translated = localizeClasses(defaultClasses, translate);
  assert.equal(translated[0].name, 'Warrior');
  assert.equal(translated[0].subclasses[0].name, 'Guardian');
  assert.equal(translated[0].buffs[0].name, 'Determination');
  assert.deepEqual(translated[0].attributes, original[0].attributes);
  assert.equal(translated[0].healthModifier, 4);
  assert.deepEqual(defaultClasses, original);
  const custom = structuredClone(defaultClasses);
  custom[0].name = 'Sentinela';
  custom[0].description = 'My own story';
  custom[0].buffs[0].name = 'Original trait';
  custom.push({ ...structuredClone(custom[0]), id: 'my-warrior', name: 'Guerreiro' });
  const view = localizeClasses(custom, translate);
  assert.equal(view[0].name, 'Sentinela');
  assert.equal(view[0].description, 'My own story');
  assert.equal(view[0].buffs[0].name, 'Original trait');
  assert.equal(view[4].name, 'Guerreiro');
  assert.deepEqual(custom[0].attributes, original[0].attributes);
});

test('validation errors translate at the UI boundary while canonical error contracts remain unchanged', async () => {
  const { createTranslator } = await import('next-intl');
  const translate = createTranslator({
    locale: 'pt-BR',
    messages: await catalog('pt-BR'),
    namespace: 'errors',
  });
  const parsed = healthAdjustmentSchema.safeParse({});
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const message = readableError(parsed.error);
  assert.equal(message, 'Provide an HP change or bonus.');
  assert.equal(localizeError(message, translate), 'Informe uma alteração de PV ou bônus.');
  assert.equal(localizeError('Table not found.', translate), 'Mesa não encontrada.');
  assert.equal(localizeError('', translate), '');
});
