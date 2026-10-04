import { test, expect, type Page } from '@playwright/test';
import type { Credential } from '../../src/types/game';

async function select(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

async function enter(page: Page, credential: Credential) {
  await page.addInitScript((saved) => {
    localStorage.setItem(
      'tavern:tables:v1',
      JSON.stringify([{ ...saved, name: 'Classes', lastVisited: new Date().toISOString() }]),
    );
  }, credential);
  await page.goto('/room/' + credential.roomCode);
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
}

test('creation-time catalog editing, player sheet and live attribute rolls stay synchronized', async ({
  page: gm,
  browser,
  request,
}) => {
  await gm.goto('/');
  await gm.getByRole('button', { name: 'Configure classes' }).click();
  const manager = gm.getByRole('dialog', { name: 'Manage classes' });
  await manager.getByLabel('Class name', { exact: true }).fill('Sentinela');
  await manager.getByLabel('Class Força', { exact: true }).fill('4');
  await manager.getByRole('button', { name: 'Save classes', exact: true }).click();
  await expect(manager).not.toBeVisible();
  await expect(gm.getByLabel('Starting classes', { exact: true })).toContainText('Sentinela');
  await gm.getByLabel('Your nickname').fill('GM');
  await gm.getByLabel('Table name').fill('Attribute workshop');
  await gm.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
  const code = gm.url().split('/').at(-1)!;
  const response = await request.post('/api/rooms/join', { data: { code, nickname: 'Marle' } });
  const credential = (await response.json()).data as Credential;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const player = await context.newPage();
    await enter(player, credential);
    await select(player, 'Class', 'Sentinela');
    await select(player, 'Subclass', 'Guardião');
    await expect(player.getByTestId('attribute-forca')).toHaveText('+4');
    await expect(player.getByTestId('attribute-constituicao')).toHaveText('+2');
    await expect(player.getByLabel('Character attributes')).toContainText('Determinação');
    await expect(player.getByLabel('Character attributes')).toContainText('Vigilância');
    await player.getByRole('button', { name: 'Enter tabletop' }).click();
    await expect(player.getByRole('button', { name: 'Manage classes', exact: true })).toHaveCount(
      0,
    );
    await player.getByRole('button', { name: 'Teste de Força +4', exact: true }).click();
    for (const view of [gm, player]) {
      const card = view.getByTestId('dice-history').locator('li').first();
      await expect(card).toContainText('Teste de Força');
      await expect(card).toContainText('1d20 + 4');
      await expect(card).toHaveAttribute('data-state', 'settled');
      await expect(card.getByTestId('dice-breakdown')).toHaveText(/\[\d+\] \+ 4/);
    }
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await gm.getByLabel('Class Força', { exact: true }).fill('-2');
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(
      player.getByRole('button', { name: 'Teste de Força -2', exact: true }),
    ).toBeVisible();
    await player.getByRole('button', { name: 'Teste de Força -2', exact: true }).click();
    await expect(gm.getByTestId('dice-history').locator('li').first()).toContainText('1d20 - 2');
    await player.getByRole('button', { name: 'Edit your character' }).click();
    await expect(player.getByTestId('attribute-forca')).toHaveText('-2');
    await select(player, 'Class', 'Mago');
    await expect(player.getByRole('combobox', { name: 'Subclass', exact: true })).toContainText(
      'No subclass',
    );
    await expect(player.getByTestId('attribute-inteligencia')).toHaveText('+2');
    await player.getByRole('button', { name: 'Save character' }).click();
    await player.reload();
    await expect(
      player.getByRole('button', { name: 'Teste de Inteligência +2', exact: true }),
    ).toBeVisible();
    await gm.screenshot({ path: 'artifacts/classes-desktop.png', fullPage: true });
  } finally {
    await context.close();
  }
});

test('GM can create and delete classes, subclasses and traits; cancel and validation preserve the catalog', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/rooms', { data: { name: 'Editor', nickname: 'GM' } });
  await enter(page, (await response.json()).data);
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await page.getByRole('button', { name: 'Add class', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Edit class', exact: true })).toContainText(
    'New class',
  );
  await page.getByLabel('Class name', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Save classes', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByLabel('Class name', { exact: true }).fill('Bardo');
  await page.getByLabel('Class description', { exact: true }).fill('Stories and songs.');
  await page.getByRole('button', { name: 'Add buff', exact: true }).first().click();
  await page.getByLabel('Buff name', { exact: true }).fill('Inspiração');
  await page.getByLabel('Buff description', { exact: true }).fill('Encourages the party.');
  await page.getByRole('button', { name: 'Add debuff', exact: true }).first().click();
  await page.getByLabel('Debuff name', { exact: true }).fill('Distração');
  await page.getByLabel('Debuff description', { exact: true }).fill('Easily distracted.');
  await page.getByRole('button', { name: 'Add subclass', exact: true }).click();
  await page.getByLabel('Subclass name', { exact: true }).fill('Poeta');
  await page.getByLabel('Subclass Carisma', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save classes', exact: true }).click();
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await select(page, 'Edit class', 'Bardo');
  await expect(page.getByLabel('Buff name', { exact: true })).toHaveValue('Inspiração');
  await expect(page.getByLabel('Debuff name', { exact: true })).toHaveValue('Distração');
  await select(page, 'Edit subclass', 'Poeta');
  await expect(page.getByLabel('Subclass Carisma', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Delete subclass', exact: true }).click();
  await page.getByRole('button', { name: 'Remove buff Inspiração', exact: true }).click();
  await page.getByRole('button', { name: 'Remove debuff Distração', exact: true }).click();
  await page.getByRole('button', { name: 'Save classes', exact: true }).click();
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await select(page, 'Edit class', 'Bardo');
  await expect(page.getByLabel('Buff name', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Edit subclass', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete class', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await select(page, 'Edit class', 'Bardo');
  await page.getByRole('button', { name: 'Delete class', exact: true }).click();
  await page.getByRole('button', { name: 'Save classes', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Edit class', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Bardo', exact: true })).toHaveCount(0);
});

test('mobile class forms support keyboard selection and an empty catalog preserves onboarding and ordinary dice', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await request.post('/api/rooms', {
    data: { name: 'Empty', nickname: 'GM', classes: [] },
  });
  const gm = (await response.json()).data as Credential;
  await enter(page, gm);
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await expect(page.getByText('No classes yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add class', exact: true }).click();
  await page.getByLabel('Class name', { exact: true }).fill('Temporary');
  await page.screenshot({ path: 'artifacts/classes-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const joined = await request.post('/api/rooms/join', {
    data: { code: gm.roomCode, nickname: 'Player' },
  });
  await enter(page, (await joined.json()).data);
  await expect(
    page.getByText('No classes available. Your game master can add them.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enter tabletop' }).click();
  await page.getByRole('button', { name: 'Open dice' }).click();
  await expect(page.getByRole('group', { name: 'Attribute checks' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Roll d20', exact: true }).click();
  await expect(page.getByTestId('dice-history').locator('li')).toHaveCount(1);
});

test('mobile attribute checks support keyboard selection and live deletion clears the sheet without losing history', async ({
  page: gm,
  browser,
  request,
}) => {
  const response = await request.post('/api/rooms', {
    data: { name: 'Mobile attributes', nickname: 'GM' },
  });
  const credential = (await response.json()).data as Credential;
  await enter(gm, credential);
  const join = await request.post('/api/rooms/join', {
    data: { code: credential.roomCode, nickname: 'Player' },
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const player = await context.newPage();
    await enter(player, (await join.json()).data);
    const picker = player.getByRole('combobox', { name: 'Class', exact: true });
    await picker.focus();
    await player.keyboard.press('Enter');
    await expect(player.getByRole('option', { name: 'No class', exact: true })).toBeFocused();
    await player.keyboard.press('ArrowDown');
    await expect(player.getByRole('option', { name: 'Guerreiro', exact: true })).toBeFocused();
    await player.keyboard.press('Enter');
    await expect(picker).toContainText('Guerreiro');
    await select(player, 'Subclass', 'Guardião');
    await player.getByRole('button', { name: 'Enter tabletop' }).click();
    await player.getByRole('button', { name: 'Open dice' }).click();
    await player.getByRole('button', { name: 'Teste de Inteligência -1', exact: true }).click();
    await expect(player.getByTestId('dice-history').locator('li').first()).toContainText(
      'Teste de Inteligência',
    );
    await player.screenshot({ path: 'artifacts/attributes-mobile.png', fullPage: true });
    expect(
      await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await select(gm, 'Edit subclass', 'Guardião');
    await gm.getByRole('button', { name: 'Delete subclass', exact: true }).click();
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(
      player.getByRole('button', { name: 'Teste de Sabedoria +0', exact: true }),
    ).toBeVisible();
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await gm.getByRole('button', { name: 'Delete class', exact: true }).click();
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(player.getByRole('group', { name: 'Attribute checks' })).toHaveCount(0);
    await expect(player.getByTestId('dice-history').locator('li')).toHaveCount(1);
    await player.keyboard.press('Escape');
    await player.getByRole('button', { name: 'Edit your character' }).click();
    await expect(player.getByRole('combobox', { name: 'Class', exact: true })).toContainText(
      'No class',
    );
    await expect(player.getByLabel('Character attributes')).not.toContainText('Vigilância');
  } finally {
    await context.close();
  }
});
