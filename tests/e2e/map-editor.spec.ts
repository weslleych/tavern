import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import type { Credential } from '../../src/types/game';
import type { Snapshot } from '../../src/types/game';
import { io } from 'socket.io-client';
import { defaultAppearance } from '../../src/lib/characters';
import {
  recordMapView,
  readMapView as view,
  settleMap as settle,
  type MapView as View,
} from './helpers/map-view';

async function enter(page: Page, credential: Credential) {
  await page.addInitScript(recordMapView);
  await page.addInitScript((saved) => {
    localStorage.setItem(
      'tavern:tables:v1',
      JSON.stringify([{ ...saved, name: 'Map editor', lastVisited: new Date().toISOString() }]),
    );
  }, credential);
  await page.goto('/room/' + credential.roomCode);
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByLabel('Map canvas')).toHaveAttribute('data-view', /zoom/);
}

async function create(page: Page, request: APIRequestContext) {
  const response = await request.post('/api/rooms', {
    data: { name: 'Map editor', nickname: 'GM', template: 'blank' },
  });
  const gm = (await response.json()).data as Credential;
  await enter(page, gm);
  await page.getByRole('button', { name: 'New scene', exact: true }).click();
  await page.getByLabel('Scene name', { exact: true }).fill('Large map');
  await page.getByLabel('Columns', { exact: true }).fill('64');
  await page.getByLabel('Rows', { exact: true }).fill('64');
  await page.getByRole('button', { name: 'Create scene', exact: true }).click();
  await expect(page.getByTestId('scene-title')).toHaveText('Large map');
  await expect(page.locator('.map-coordinate')).toContainText('64 × 64');
  await settle(page);
  return gm;
}

function center(current: View) {
  return {
    x: (current.width / 2 - current.x) / current.zoom,
    y: (current.height / 2 - current.y) / current.zoom,
  };
}

async function drag(page: Page, button: 'left' | 'middle' | 'right', dx = 96, dy = 48) {
  const bounds = (await page.getByLabel('Map canvas').boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up({ button });
  await settle(page);
}

test('64×64 tools keep canvas bounds and exact camera; resizes preserve the world center and scene changes refit', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await create(page, request);
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Pan tool', exact: true }).click();
  await drag(page, 'left');
  const chosen = await view(page);
  const zoomLabel = await page.locator('.zoom-controls').innerText();
  for (const shortcut of ['b', 'h', 'm', 'b', 'h']) {
    await page.getByLabel('Map canvas').focus();
    await page.keyboard.press(shortcut);
    expect(await view(page)).toEqual(chosen);
    await expect(page.locator('.zoom-controls')).toHaveText(zoomLabel);
  }
  // Canvas matrices use single precision; compare resizes within 0.001 world pixels.
  const originalCenter = center(chosen);
  await page.getByRole('button', { name: 'Close dice', exact: true }).click();
  const expanded = await view(page);
  expect(expanded.width).toBeGreaterThan(chosen.width);
  expect(expanded.zoom).toBe(chosen.zoom);
  expect(center(expanded).x).toBeCloseTo(originalCenter.x, 3);
  expect(center(expanded).y).toBeCloseTo(originalCenter.y, 3);
  await page.setViewportSize({ width: 1180, height: 840 });
  const resized = await view(page);
  expect(resized.zoom).toBe(chosen.zoom);
  expect(center(resized).x).toBeCloseTo(originalCenter.x, 3);
  expect(center(resized).y).toBeCloseTo(originalCenter.y, 3);
  // A transient hidden layout must not destroy the initialized camera.
  await page.locator('.map-workspace').evaluate((workspace) => {
    (workspace as HTMLElement).style.display = 'none';
  });
  await settle(page);
  await page.locator('.map-workspace').evaluate((workspace) => {
    (workspace as HTMLElement).style.display = '';
  });
  expect(await view(page)).toEqual(resized);
  await page.getByRole('button', { name: /The clearing/ }).click();
  await expect(page.getByTestId('scene-title')).toHaveText('The clearing');
  const fitted = await view(page);
  expect(fitted.zoom).not.toBe(chosen.zoom);
  // Chromium's canvas transform rounds to single precision; assert subpixel accuracy.
  expect(center(fitted).x).toBeCloseTo(416, 3);
  await page.getByRole('button', { name: /Large map/ }).click();
  await expect(page.getByTestId('scene-title')).toHaveText('Large map');
  expect((await view(page)).zoom).toBeLessThan(chosen.zoom);
});

test('explicit fit keeps a standard map clear of the floating toolbar, HUD and terrain palette', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await create(page, request);
  await page.getByRole('button', { name: /The clearing/ }).click();
  await expect(page.getByTestId('scene-title')).toHaveText('The clearing');
  await page.getByRole('button', { name: 'Paint tool', exact: true }).click();
  await page.getByRole('button', { name: 'Fit map to view', exact: true }).click();
  const current = await view(page);
  const bounds = (await page.getByLabel('Map canvas').boundingBox())!;
  const hud = (await page.locator('.map-hud-stack').boundingBox())!;
  const dock = (await page.locator('.brush-dock').boundingBox())!;
  expect(bounds.y + current.y).toBeGreaterThanOrEqual(hud.y + hud.height + 7);
  expect(bounds.y + current.y + 576 * current.zoom).toBeLessThanOrEqual(dock.y - 7);
});

test('right and middle drags pan without painting, setting spawn, changing fog or selecting/moving a token', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await create(page, request);
  const sent: string[] = [];
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => sent.push(String(payload))),
  );
  // Reconnect so the mutation observer sees this page's real socket.
  await page.reload();
  await expect(page.getByLabel('Map canvas')).toHaveAttribute('data-view', /zoom/);
  await page.getByRole('button', { name: 'Toggle fog of war', exact: true }).click();
  for (const tool of [
    'Paint tool',
    'Set spawn point',
    'Reveal fog',
    'Hide tiles',
    'Move players',
    'Pan tool',
  ]) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    const before = await view(page);
    const start = sent.length;
    await drag(page, 'right', 48, 24);
    const after = await view(page);
    expect(after.x).toBeCloseTo(before.x + 48, 3);
    expect(after.y).toBeCloseTo(before.y + 24, 3);
    expect(after.zoom).toBe(before.zoom);
    expect(
      sent
        .slice(start)
        .filter((frame) => /"(?:tile:paint|token:move|panel:spawn|fog:update)"/.test(frame)),
    ).toEqual([]);
    await expect(page.getByTestId('tile-count')).toHaveText('0 tiles');
    await expect(page.getByTestId('spawn-position')).toContainText('No preferred spawn');
  }
  await page.getByRole('button', { name: 'Paint tool', exact: true }).click();
  await page.getByRole('button', { name: 'Fit map to view' }).click();
  const before = await view(page);
  await drag(page, 'middle', -48, -24);
  const after = await view(page);
  expect(after.x).toBeCloseTo(before.x - 48, 3);
  expect(after.y).toBeCloseTo(before.y - 24, 3);
  expect(
    await page
      .getByLabel('Map canvas')
      .evaluate(
        (canvas) =>
          !canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Fit map to view' }).click();
  await page.getByLabel('Map canvas').click();
  await expect(page.getByTestId('tile-count')).toHaveText('1 tiles');
});

test('floating controls leave the whole canvas available and HUD labels pass painting through', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await create(page, request);
  const workspace = (await page.locator('.map-workspace').boundingBox())!;
  expect(await page.getByLabel('Map canvas').boundingBox()).toEqual(workspace);
  const label = page.getByTestId('token-position');
  const bounds = (await label.boundingBox())!;
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'),
      point,
    ),
  ).toBe('Map canvas');
  const current = await view(page);
  // Bring map terrain beneath the non-interactive HUD text, then actually paint through it.
  await page.getByRole('button', { name: 'Pan tool', exact: true }).click();
  await drag(
    page,
    'left',
    point.x - workspace.x - current.x - 1024 * current.zoom,
    point.y - workspace.y - current.y - 1024 * current.zoom,
  );
  await page.getByRole('button', { name: 'Paint tool', exact: true }).click();
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('tile-count')).toHaveText('1 tiles');
  await page.screenshot({ path: 'artifacts/map-editor-desktop.png', fullPage: true });
  for (const width of [760, 600, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Paint tool' }).click();
    const mobileWorkspace = (await page.locator('.map-workspace').boundingBox())!;
    expect(await page.getByLabel('Map canvas').boundingBox()).toEqual(mobileWorkspace);
    const dock = (await page.locator('.brush-dock').boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(mobileWorkspace.x);
    expect(dock.x + dock.width).toBeLessThanOrEqual(mobileWorkspace.x + mobileWorkspace.width);
    await page.getByRole('button', { name: 'Flowers', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Open dice', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Dice log' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: 'artifacts/map-editor-mobile.png', fullPage: true });
});

test('right-drag over a player never selects or moves them; left-drag moves their token through HUD text', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const gm = await create(page, request);
  const master = io(test.info().project.use.baseURL ?? 'http://127.0.0.1:3100', {
    auth: gm,
    transports: ['websocket'],
    autoConnect: false,
  });
  const joined = await request.post('/api/rooms/join', {
    data: { code: gm.roomCode, nickname: 'Robo' },
  });
  const player = io(test.info().project.use.baseURL ?? 'http://127.0.0.1:3100', {
    auth: (await joined.json()).data,
    transports: ['websocket'],
    autoConnect: false,
  });
  try {
    const ready = new Promise<Snapshot>((resolve, reject) => {
      master.once('room:snapshot', resolve);
      master.once('connect_error', reject);
    });
    master.connect();
    const snapshot = await ready;
    expect(
      (
        await master.emitWithAck('tile:paint', {
          panelId: snapshot.panel.id,
          tiles: [
            { x: 31, y: 31, terrain: 'grass', blocked: false },
            { x: 32, y: 31, terrain: 'grass', blocked: false },
          ],
        })
      ).ok,
    ).toBe(true);
    const connected = new Promise<void>((resolve) => player.once('connect', resolve));
    player.connect();
    await connected;
    expect((await player.emitWithAck('character:update', defaultAppearance)).ok).toBe(true);
    await expect(page.getByRole('button', { name: 'Move Robo', exact: true })).toBeVisible();
    await expect(page.getByTestId('tile-count')).toHaveText('2 tiles');
    await page.getByRole('button', { name: 'Pan tool', exact: true }).click();
    const label = (await page.getByTestId('token-position').boundingBox())!;
    const point = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
    const bounds = (await page.getByLabel('Map canvas').boundingBox())!;
    const current = await view(page);
    await drag(
      page,
      'left',
      point.x - bounds.x - current.x - 31.5 * 32 * current.zoom,
      point.y - bounds.y - current.y - 31.5 * 32 * current.zoom,
    );
    await page.getByRole('button', { name: 'Move players', exact: true }).click();
    const before = await view(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x + 32, point.y + 16, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    expect((await view(page)).x).toBeCloseTo(before.x + 32, 3);
    await expect(page.getByRole('button', { name: 'Move Robo', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByTestId('token-position')).toContainText('Select a player');
    await page.getByRole('button', { name: 'Pan tool', exact: true }).click();
    await drag(page, 'left', -32, -16);
    await page.getByRole('button', { name: 'Move players', exact: true }).click();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + before.zoom * 32, point.y, { steps: 3 });
    await page.mouse.up();
    await expect(page.getByTestId('token-position')).toContainText('Robo · Position 33, 32');
  } finally {
    player.disconnect();
    master.disconnect();
  }
});
