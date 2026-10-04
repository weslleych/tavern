import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function choose(page: import('@playwright/test').Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: new RegExp('^' + option) }).click();
}

async function tilePoint(page: import('@playwright/test').Page, x: number, y = 0) {
  await page.getByRole('button', { name: 'Fit map to view' }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const b = (await page.getByLabel('Map canvas').boundingBox())!;
  const zoom = Math.max(0.2, Math.min(2, (b.width - 80) / 832, (b.height - 80) / 576));
  return {
    x: b.x + (b.width - 832 * zoom) / 2 + (x + 0.5) * 32 * zoom,
    y: b.y + (b.height - 576 * zoom) / 2 + (y + 0.5) * 32 * zoom,
  };
}

async function finishCharacter(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'Meet your adventurer' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter tabletop' }).click();
  await expect(page.getByLabel('Map canvas')).toBeVisible();
}

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
  await choose(gm, 'Starting map', 'Blank canvas');
  await gm.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
  await expect(gm.getByLabel('Map canvas')).toBeVisible();
  const code = new URL(gm.url()).pathname.split('/').pop()!;
  await player.goto('/');
  await player.getByRole('tab', { name: 'Join a table' }).click();
  await player.getByLabel('Your nickname').fill('Marle');
  await player.getByLabel('Table code').fill(code);
  await player.getByRole('button', { name: 'Join adventure' }).click();
  await expect(player.getByTestId('connection-status')).toHaveText('Connected');
  await finishCharacter(player);
  await expect(gm.getByTestId('member-list')).toContainText('Marle');
  await expect(player.getByRole('button', { name: 'New scene' })).toHaveCount(0);
  await gm.getByRole('button', { name: 'Forest', exact: true }).click();
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('Enter');
  await expect(gm.getByTestId('tile-count')).toHaveText('1 tiles');
  await expect(player.getByTestId('tile-count')).toHaveText('1 tiles');
  await gm.getByRole('button', { name: 'New scene' }).click();
  await gm.getByLabel('Scene name').fill('Mystic woods');
  await choose(gm, 'Starting terrain', 'Woodland clearing');
  await choose(gm, 'Starting terrain', 'Blank canvas');
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
  await page.getByRole('tab', { name: 'Create a table' }).click();
  await page.getByRole('combobox', { name: 'Starting map' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Starting map' })).toContainText('Blank canvas');
});

test('GM can rename, export and import a scene without exposing session credentials', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Your nickname').fill('Lucca');
  await page.getByLabel('Table name').fill('Map workshop');
  await choose(page, 'Starting map', 'Blank canvas');
  await page.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByLabel('Map canvas')).toBeVisible();
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
  await choose(page, 'Starting map', 'Blank canvas');
  await page.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByLabel('Map canvas')).toBeVisible();
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

test('GM coordinates players, movement permissions and spawn; player character, silent collisions, selects and scene controls work', async ({
  browser,
}) => {
  const gmContext = await browser.newContext(),
    playerContext = await browser.newContext();
  const gm = await gmContext.newPage(),
    player = await playerContext.newPage();
  await gm.goto('/');
  await gm.getByLabel('Your nickname').fill('Frog');
  await gm.getByLabel('Table name').fill('Phase 4');
  await choose(gm, 'Starting map', 'Blank canvas');
  await gm.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(gm.getByLabel('Map canvas')).toBeVisible();
  await expect(gm.getByRole('heading', { name: 'Meet your adventurer' })).toHaveCount(0);
  await expect(gm.getByRole('button', { name: 'Edit your character', exact: true })).toHaveCount(0);
  const code = new URL(gm.url()).pathname.split('/').pop()!;
  await gm.getByLabel('Map canvas').focus();
  for (let i = 0; i < 5; i++) {
    await gm.keyboard.press('Enter');
    if (i < 4) await gm.keyboard.press('ArrowRight');
  }
  await expect(gm.getByTestId('tile-count')).toHaveText('5 tiles');
  await gm.getByRole('button', { name: 'Set spawn point', exact: true }).click();
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('ArrowLeft');
  await gm.keyboard.press('Enter');
  await expect(gm.getByTestId('spawn-position')).toContainText('4, 1');
  const socketReady = player.waitForEvent('websocket', {
    predicate: (socket) => socket.url().includes('/socket.io/'),
  });
  await player.goto('/?join=' + code);
  await player.getByLabel('Your nickname').fill('Robo');
  await player.getByRole('button', { name: 'Join adventure' }).click();
  const playerSocket = await socketReady;
  await expect(player.getByLabel('Map canvas')).toHaveCount(0);
  await choose(player, 'Hair style', 'Braids');
  await player.screenshot({ path: 'artifacts/phase4-creator.png', fullPage: true });
  await finishCharacter(player);
  await expect(player.getByTestId('token-position')).toContainText('4, 1');
  await player.getByRole('button', { name: 'Edit your character', exact: true }).click();
  await expect(player.getByRole('combobox', { name: 'Hair style' })).toHaveText('Braids');
  await choose(player, 'Shirt style', 'Scarf');
  // Escape closes the menu while keeping the native dialog open.
  await player.getByRole('combobox', { name: 'Hair color' }).click();
  await player.keyboard.press('Escape');
  await expect(player.getByRole('dialog')).toBeVisible();
  await player.getByRole('button', { name: 'Save character' }).click();
  await expect(player.getByRole('dialog')).not.toBeVisible();
  await expect(player.getByTestId('token-position')).toContainText('4, 1');
  await player.getByLabel('Map canvas').focus();
  await player.keyboard.press('ArrowRight');
  await expect(player.getByTestId('token-position')).toContainText('5, 1');
  const emptyRefusal = playerSocket.waitForEvent('framereceived', {
    predicate: (event) => String(event.payload).includes('MOVE_REJECTED'),
  });
  await player.keyboard.press('ArrowRight');
  await emptyRefusal;
  await expect(player.locator('.save-state')).toHaveText('All changes saved');
  await expect(player.locator('.room-error')).toHaveCount(0);
  await expect(player.getByTestId('token-position')).toContainText('5, 1');
  await gm.getByRole('button', { name: 'Paint tool', exact: true }).click();
  await gm.getByRole('button', { name: 'Wall', exact: true }).click();
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('ArrowRight');
  await gm.keyboard.press('ArrowRight');
  await gm.keyboard.press('Enter');
  await expect(player.getByTestId('tile-count')).toHaveText('6 tiles');
  const wallRefusal = playerSocket.waitForEvent('framereceived', {
    predicate: (event) => String(event.payload).includes('MOVE_REJECTED'),
  });
  await player.getByLabel('Map canvas').focus();
  await player.keyboard.press('ArrowRight');
  await wallRefusal;
  await expect(player.locator('.save-state')).toHaveText('All changes saved');
  await expect(player.locator('.room-error')).toHaveCount(0);
  await gm.getByRole('button', { name: 'Allow player movement', exact: true }).click();
  await expect(player.getByText('Movement paused by GM', { exact: true })).toBeVisible();
  await expect(player.getByRole('button', { name: 'Move left', exact: true })).toBeDisabled();
  await gm.getByRole('button', { name: 'Move Robo', exact: true }).click();
  await expect(gm.locator('.brush-dock')).toHaveCount(0);
  const source = await tilePoint(gm, 4),
    destination = await tilePoint(gm, 0);
  await gm.mouse.move(source.x, source.y);
  await gm.mouse.down();
  await gm.mouse.move(destination.x, destination.y, { steps: 3 });
  await gm.mouse.up();
  await expect(player.getByTestId('token-position')).toContainText('1, 1');
  await gm.mouse.click((await tilePoint(gm, 2)).x, destination.y);
  await expect(player.getByTestId('token-position')).toContainText('3, 1');
  await gm.getByRole('button', { name: 'Allow player movement', exact: true }).click();
  await expect(player.getByRole('button', { name: 'Move left', exact: true })).toBeEnabled();
  await player.getByRole('button', { name: 'Move left', exact: true }).click();
  await expect(player.getByTestId('token-position')).toContainText('2, 1');
  const from = await tilePoint(player, 1),
    to = await tilePoint(player, 2);
  await player.mouse.move(from.x, from.y);
  await player.mouse.down();
  await player.mouse.move(to.x, to.y, { steps: 3 });
  await player.mouse.up();
  await expect(player.getByTestId('token-position')).toContainText('3, 1');
  await gm.getByRole('button', { name: 'Toggle fog of war' }).click();
  await expect(player.getByTestId('tile-count')).toHaveText('0 tiles');
  const fogRefusal = playerSocket.waitForEvent('framereceived', {
    predicate: (event) => String(event.payload).includes('MOVE_REJECTED'),
  });
  await player.getByLabel('Map canvas').focus();
  await player.keyboard.press('ArrowRight');
  await fogRefusal;
  await expect(player.locator('.save-state')).toHaveText('All changes saved');
  await expect(player.locator('.room-error')).toHaveCount(0);
  await expect(player.getByTestId('token-position')).toContainText('3, 1');
  await gm.getByRole('button', { name: 'Toggle fog of war' }).click();
  await player.getByLabel('Dice expression').fill('d6');
  await player.getByRole('button', { name: 'Roll dice', exact: true }).click();
  await expect(player.getByTestId('dice-history')).toContainText('1d6');
  await expect(gm.getByTestId('dice-history')).toContainText('Robo');
  await gm.getByRole('button', { name: 'Close dice' }).click();
  await gm.getByRole('button', { name: 'Duplicate current scene' }).click();
  await expect(player.getByTestId('scene-title')).toHaveText('The clearing (copy)');
  await expect(player.getByTestId('token-position')).toContainText('4, 1');
  await gm.getByRole('button', { name: 'Move scene up' }).last().click();
  await expect(gm.locator('.scene-item').first()).toContainText('The clearing (copy)');
  await gm.getByRole('button', { name: 'Remove current scene' }).click();
  await gm.getByRole('button', { name: 'Remove scene', exact: true }).click();
  await expect(player.getByTestId('scene-title')).toHaveText('The clearing');
  await gm.reload();
  await expect(gm.getByLabel('Map canvas')).toBeVisible();
  await expect(gm.getByTestId('spawn-position')).toContainText('4, 1');
  await expect(gm.getByRole('button', { name: 'Allow player movement' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await gm.screenshot({ path: 'artifacts/phase4-table.png', fullPage: true });
  await player.reload();
  await expect(player.getByLabel('Map canvas')).toBeVisible();
  await player.setViewportSize({ width: 390, height: 844 });
  await player.getByRole('button', { name: 'Move right', exact: true }).click();
  await expect(player.getByTestId('token-position')).toContainText('5, 1');
  expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await player.screenshot({ path: 'artifacts/phase4-player-mobile.png', fullPage: true });
  await gmContext.close();
  await playerContext.close();
});

test('custom PNG brushes render and export; fog reveal/hide supports keyboard and a mobile GM can reach all tools', async ({
  browser,
}) => {
  const gmContext = await browser.newContext(),
    playerContext = await browser.newContext();
  const gm = await gmContext.newPage(),
    player = await playerContext.newPage();
  await gm.goto('/');
  await gm.getByLabel('Your nickname').fill('Ayla');
  await gm.getByLabel('Table name').fill('Sprite atelier');
  await choose(gm, 'Starting map', 'Blank canvas');
  await gm.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(gm.getByLabel('Map canvas')).toBeVisible();
  const code = new URL(gm.url()).pathname.split('/').pop()!;
  await player.goto(`/?join=${code}`);
  await player.getByLabel('Your nickname').fill('Lucca');
  await player.getByRole('button', { name: 'Join adventure' }).click();
  await finishCharacter(player);
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('Enter');
  await expect(gm.getByTestId('tile-count')).toHaveText('1 tiles');
  await gm.keyboard.press('ArrowRight');
  await gm.keyboard.press('Enter');
  await expect(player.getByTestId('token-position')).toContainText('1, 1');
  const data = await gm.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#b46480';
    ctx.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png');
  });
  await gm.getByLabel('Custom sprite file').setInputFiles({
    name: 'flower.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data.split(',')[1], 'base64'),
  });
  await expect(gm.getByRole('button', { name: 'Replace sprite' })).toBeVisible();
  await gm.getByRole('button', { name: 'Sand', exact: true }).click();
  await gm.getByLabel('Map canvas').focus();
  for (let i = 0; i < 3; i++) await gm.keyboard.press('ArrowRight');
  for (let i = 0; i < 4; i++) await gm.keyboard.press('ArrowDown');
  await gm.keyboard.press('Enter');
  await expect(player.getByTestId('tile-count')).toHaveText('3 tiles');
  await expect
    .poll(() =>
      player.getByLabel('Map canvas').evaluate((canvas: HTMLCanvasElement) => {
        const bounds = canvas.getBoundingClientRect();
        const zoom = Math.max(
          0.2,
          Math.min(2, (bounds.width - 80) / 832, (bounds.height - 80) / 576),
        );
        const x = (bounds.width - 832 * zoom) / 2 + 4.5 * 32 * zoom,
          y = (bounds.height - 576 * zoom) / 2 + 4.5 * 32 * zoom;
        return Array.from(
          canvas
            .getContext('2d')!
            .getImageData(
              (x * canvas.width) / bounds.width,
              (y * canvas.height) / bounds.height,
              1,
              1,
            ).data,
        ).slice(0, 3);
      }),
    )
    .toEqual([180, 100, 128]);
  const downloadEvent = gm.waitForEvent('download');
  await gm.getByRole('button', { name: 'Export map' }).click();
  const exported = JSON.parse(await readFile((await (await downloadEvent).path())!, 'utf8'));
  expect(exported.tiles.find((tile: { sprite?: string }) => tile.sprite).sprite).toMatch(
    /^data:image\/png;base64,/,
  );
  await gm.getByRole('button', { name: 'Toggle fog of war' }).click();
  await expect(player.getByTestId('tile-count')).toHaveText('0 tiles');
  await gm.getByRole('button', { name: 'Reveal fog' }).click();
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('Enter');
  await expect(player.getByTestId('tile-count')).toHaveText('1 tiles');
  await gm.getByRole('button', { name: 'Hide tiles' }).click();
  await gm.getByLabel('Map canvas').focus();
  await gm.keyboard.press('Enter');
  await expect(player.getByTestId('tile-count')).toHaveText('0 tiles');
  await gm.setViewportSize({ width: 390, height: 844 });
  await gm.getByRole('button', { name: 'Toggle fog of war' }).click();
  await gm.getByRole('button', { name: 'Move players', exact: true }).click();
  await gm.getByRole('button', { name: 'Open dice' }).click();
  await expect(gm.getByRole('button', { name: 'Roll dice', exact: true })).toBeVisible();
  await gm.getByRole('button', { name: 'Close dice' }).click();
  await gm.getByRole('button', { name: 'Open scenes' }).click();
  await expect(gm.getByRole('button', { name: 'Duplicate current scene' })).toBeVisible();
  await gm.getByRole('button', { name: 'Close scene sidebar' }).click();
  await expect(gm.getByRole('button', { name: 'Close scene sidebar' })).not.toBeInViewport();
  expect(await gm.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await gm.screenshot({ path: 'artifacts/phase4-gm-mobile.png', fullPage: true });
  await gmContext.close();
  await playerContext.close();
});
