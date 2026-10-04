import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('GM and player share terrain, scenes and presence; a refreshed GM retains control', async ({
  browser,
}) => {
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();
  await gm.goto('/');
  await gm.getByLabel('Your nickname').fill('Lelo');
  await gm.getByLabel('Table name').fill('Guardia E2E');
  await gm.getByLabel('Starting map').selectOption('blank');
  await gm.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
  const code = new URL(gm.url()).pathname.split('/').pop()!;
  await player.goto('/');
  await player.getByRole('tab', { name: 'Join a table' }).click();
  await player.getByLabel('Your nickname').fill('Marle');
  await player.getByLabel('Table code').fill(code);
  await player.getByRole('button', { name: 'Join adventure' }).click();
  await expect(player.getByTestId('connection-status')).toHaveText('Connected');
  await expect(gm.getByTestId('member-list')).toContainText('Marle');
  await expect(player.getByRole('button', { name: 'New scene' })).toHaveCount(0);
  await gm.getByRole('button', { name: 'Forest', exact: true }).click();
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('Enter');
  await expect(gm.getByTestId('tile-count')).toHaveText('1 tiles');
  await expect(player.getByTestId('tile-count')).toHaveText('1 tiles');
  await gm.getByRole('button', { name: 'New scene' }).click();
  await gm.getByLabel('Scene name').fill('Mystic woods');
  await gm.getByRole('button', { name: 'Create scene', exact: true }).click();
  await expect(player.getByTestId('scene-title')).toHaveText('Mystic woods');
  await gm.getByRole('button', { name: /The clearing/ }).click();
  await expect(player.getByTestId('scene-title')).toHaveText('The clearing');
  await expect(player.getByTestId('tile-count')).toHaveText('1 tiles');
  await gm.reload();
  await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
  await expect(gm.getByRole('button', { name: 'New scene' })).toBeVisible();
  await expect(gm.getByTestId('tile-count')).toHaveText('1 tiles');
  await gm.goto('/');
  await gm.getByRole('tab', { name: 'Join a table' }).click();
  await gm.getByLabel('Your nickname').fill('Lelo again');
  await gm.getByLabel('Table code').fill(code);
  await gm.getByRole('button', { name: 'Join adventure' }).click();
  await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
  await expect(gm.getByRole('button', { name: 'New scene' })).toBeVisible();
  await gmContext.close();
  await expect(player.getByTestId('member-list')).not.toContainText('Lelo');
  await playerContext.close();
});

test('hub works on mobile and invalid codes give a recoverable error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Join a table' }).click();
  await page.getByLabel('Your nickname').fill('Crono');
  await page.getByLabel('Table code').fill('TVRN-ABC234');
  await page.getByRole('button', { name: 'Join adventure' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Table not found' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('GM can rename, export and import a scene without exposing session credentials', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Your nickname').fill('Lucca');
  await page.getByLabel('Table name').fill('Map workshop');
  await page.getByLabel('Starting map').selectOption('blank');
  await page.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await page.getByLabel('Map canvas').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tile-count')).toHaveText('1 tiles');
  await page.getByRole('button', { name: 'Rename current scene' }).click();
  await page.getByLabel('Scene name').fill('Forest crossing');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByTestId('scene-title')).toHaveText('Forest crossing');

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export map' }).click();
  const download = await downloadEvent;
  const contents = await readFile((await download.path())!, 'utf8');
  const exported = JSON.parse(contents);
  expect(Object.keys(exported).sort()).toEqual(['grid', 'name', 'tiles', 'version']);
  expect(exported.tiles).toEqual([{ x: 0, y: 0, terrain: 'grass', blocked: false }]);
  expect(contents).not.toContain('token');

  await page.getByLabel('Import map file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.locator('.room-error')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  exported.name = 'Imported forest';
  await page.getByLabel('Import map file').setInputFiles({
    name: 'forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByTestId('scene-title')).toHaveText('Imported forest');
  await expect(page.getByTestId('tile-count')).toHaveText('1 tiles');
  await expect(page.getByRole('button', { name: /Forest crossing/ })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('scene-title')).toHaveText('Imported forest');
});

test('a fast brush stroke paints every tile between pointer samples', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your nickname').fill('Ayla');
  await page.getByLabel('Table name').fill('Brush workshop');
  await page.getByLabel('Starting map').selectOption('blank');
  await page.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Fit map to view' }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const bounds = (await page.getByLabel('Map canvas').boundingBox())!;
  const zoom = Math.max(0.2, Math.min(2, (bounds.width - 80) / 832, (bounds.height - 80) / 576));
  const left = bounds.x + (bounds.width - 832 * zoom) / 2;
  const top = bounds.y + (bounds.height - 576 * zoom) / 2;
  await page.mouse.move(left + 2.5 * 32 * zoom, top + 8.5 * 32 * zoom);
  await page.mouse.down();
  await page.mouse.move(left + 8.5 * 32 * zoom, top + 8.5 * 32 * zoom, { steps: 1 });
  await page.mouse.up();
  await expect(page.getByTestId('tile-count')).toHaveText('7 tiles');
});
