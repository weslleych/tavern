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
  await manager.getByLabel('Class Strength', { exact: true }).fill('4');
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
    await player.getByRole('radio', { name: 'Sentinela', exact: true }).check();
    await player.getByRole('radio', { name: 'Guardian', exact: true }).check();
    await expect(player.getByTestId('attribute-forca')).toHaveText('+4');
    await expect(player.getByTestId('attribute-constituicao')).toHaveText('+2');
    await expect(player.getByLabel('Character attributes')).toContainText('Determination');
    await expect(player.getByLabel('Character attributes')).toContainText('Vigilance');
    await player.getByRole('button', { name: 'Next: Appearance' }).click();
    await player.getByRole('button', { name: 'Enter tabletop' }).click();
    for (const view of [gm, player]) {
      await expect(view.getByTestId('member-list')).toContainText('Sentinela · Guardian');
    }
    await expect(player.locator('.character-hud')).toContainText('Sentinela · Guardian');
    await expect(player.getByRole('button', { name: 'Manage classes', exact: true })).toHaveCount(
      0,
    );
    await player.getByRole('button', { name: 'Strength check +4', exact: true }).click();
    for (const view of [gm, player]) {
      const card = view.getByTestId('dice-history').locator('li').first();
      await expect(card).toContainText('Strength check');
      await expect(card).toContainText('1d20 + 4');
      await expect(card).toHaveAttribute('data-state', 'settled');
      await expect(card.getByTestId('dice-breakdown')).toHaveText(/\[\d+\] \+ 4/);
    }
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await gm.getByLabel('Class name', { exact: true }).fill('Sentinela Prime');
    await gm.getByLabel('Class Strength', { exact: true }).fill('-2');
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(
      player.getByRole('button', { name: 'Strength check -2', exact: true }),
    ).toBeVisible();
    await expect(player.locator('.character-hud')).toContainText('Sentinela Prime · Guardian');
    await expect(gm.getByTestId('member-list')).toContainText('Sentinela Prime · Guardian');
    await player.getByRole('button', { name: 'Strength check -2', exact: true }).click();
    await expect(gm.getByTestId('dice-history').locator('li').first()).toContainText('1d20 - 2');
    await player.getByRole('button', { name: 'Edit your character' }).click();
    await expect(player.getByTestId('attribute-forca')).toHaveText('-2');
    await player.getByRole('tab', { name: 'Class & Specialization' }).click();
    await player.getByRole('radio', { name: 'Mage', exact: true }).check();
    await expect(
      player.getByRole('radio', { name: 'No specialization', exact: true }),
    ).toBeChecked();
    await expect(player.getByTestId('attribute-inteligencia')).toHaveText('+2');
    await player.getByRole('button', { name: 'Save character' }).click();
    await player.reload();
    await expect(
      player.getByRole('button', { name: 'Intelligence check +2', exact: true }),
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
  await page.getByLabel('Subclass Charisma', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save classes', exact: true }).click();
  await page.getByRole('button', { name: 'Manage classes', exact: true }).click();
  await select(page, 'Edit class', 'Bardo');
  await expect(page.getByLabel('Buff name', { exact: true })).toHaveValue('Inspiração');
  await expect(page.getByLabel('Debuff name', { exact: true })).toHaveValue('Distração');
  await select(page, 'Edit subclass', 'Poeta');
  await expect(page.getByLabel('Subclass Charisma', { exact: true })).toHaveValue('2');
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
  await expect(page.getByRole('button', { name: 'Next: Appearance' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Hair style' })).toBeVisible();
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
    const picker = player.getByRole('radio', { name: 'No class', exact: true });
    await picker.focus();
    await player.keyboard.press('ArrowDown');
    await expect(player.getByRole('radio', { name: 'Warrior', exact: true })).toBeFocused();
    await expect(player.getByRole('radio', { name: 'Warrior', exact: true })).toBeChecked();
    await player.getByRole('radio', { name: 'Guardian', exact: true }).check();
    await player.screenshot({ path: 'artifacts/class-onboarding-mobile.png', fullPage: true });
    expect(
      await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await player.getByRole('button', { name: 'Next: Appearance' }).click();
    await player.getByRole('button', { name: 'Enter tabletop' }).click();
    await player.getByRole('button', { name: 'Open dice' }).click();
    await player.getByRole('button', { name: 'Intelligence check -1', exact: true }).click();
    await expect(player.getByTestId('dice-history').locator('li').first()).toContainText(
      'Intelligence check',
    );
    await player.screenshot({ path: 'artifacts/attributes-mobile.png', fullPage: true });
    expect(
      await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await select(gm, 'Edit subclass', 'Guardian');
    await gm.getByRole('button', { name: 'Delete subclass', exact: true }).click();
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(
      player.getByRole('button', { name: 'Wisdom check +0', exact: true }),
    ).toBeVisible();
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await gm.getByRole('button', { name: 'Delete class', exact: true }).click();
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(player.getByRole('group', { name: 'Attribute checks' })).toHaveCount(0);
    await expect(player.locator('.character-hud .member-class-title')).toHaveCount(0);
    await expect(gm.getByTestId('member-list')).not.toContainText('Warrior');
    await expect(player.getByTestId('dice-history').locator('li')).toHaveCount(1);
    await player.keyboard.press('Escape');
    await player.getByRole('button', { name: 'Edit your character' }).click();
    await player.getByRole('tab', { name: 'Class & Specialization' }).click();
    await expect(player.getByRole('radio', { name: 'No class', exact: true })).toBeChecked();
    await expect(player.getByLabel('Character attributes')).not.toContainText('Vigilance');
  } finally {
    await context.close();
  }
});

test('onboarding preserves class and appearance across steps and editing tabs', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/rooms', {
    data: { name: 'Onboarding', nickname: 'GM' },
  });
  const gm = (await response.json()).data as Credential;
  const joined = await request.post('/api/rooms/join', {
    data: { code: gm.roomCode, nickname: 'Hero' },
  });
  await enter(page, (await joined.json()).data);
  await expect(page.getByRole('heading', { name: 'Choose your Archetype' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Hair style' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enter tabletop' })).toHaveCount(0);
  const warrior = page.getByRole('radio', { name: 'Warrior', exact: true });
  await warrior.check();
  const card = page.locator('.class-card').filter({ has: warrior });
  await expect(card).toContainText('+2 STR');
  await expect(card).toContainText('-1 INT');
  await expect(card).toContainText('Determination');
  await expect(card).toContainText('Discipline and courage');
  await page.getByRole('radio', { name: 'Guardian', exact: true }).check();
  await page.screenshot({ path: 'artifacts/class-onboarding-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Next: Appearance' }).click();
  await expect(
    page.getByRole('heading', { name: 'Meet your Adventurer', exact: true }),
  ).toBeFocused();
  await select(page, 'Hair style', 'Braids');
  await page.getByRole('button', { name: 'Back to Classes' }).click();
  await expect(warrior).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Guardian', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Mage', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'No specialization', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Next: Appearance' }).click();
  await expect(page.getByRole('combobox', { name: 'Hair style' })).toContainText('Braids');
  await page.getByRole('button', { name: 'Enter tabletop' }).click();
  await expect(page.locator('.character-hud')).toContainText('Mage');
  await page.getByRole('button', { name: 'Edit your character' }).click();
  const appearance = page.getByRole('tab', { name: 'Appearance', exact: true });
  await expect(appearance).toHaveAttribute('aria-selected', 'true');
  await appearance.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Class & Specialization' })).toBeFocused();
  await page.getByRole('radio', { name: 'No class', exact: true }).check();
  await page.getByRole('button', { name: 'Save character' }).click();
  await expect(page.locator('.character-hud .member-class-title')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Edit your character' }).click();
  await expect(page.getByRole('combobox', { name: 'Hair style' })).toContainText('Braids');
});
