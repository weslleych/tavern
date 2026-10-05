import { test, expect } from '@playwright/test';
import { connectMaster, enterExpansion } from './helpers/expansion';
import type { Credential, Snapshot } from '../../src/types/game';

test('the default table opens the 40×40 adventure and players travel through its prepared scenes', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('img', { name: /pixel-art adventure world/ })).toHaveAttribute(
    'width',
    '1280',
  );
  await page.screenshot({ path: 'artifacts/starter-hub.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'artifacts/starter-hub-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Your nickname').fill('GM');
  await page.getByLabel('Table name').fill('Starter adventure');
  await page.getByRole('button', { name: 'Create a table', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByTestId('scene-title')).toHaveText('Verdant Reach');
  const credential = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tavern:tables:v1')!)[0] as Credential,
  );
  const api = await connectMaster(credential);
  let latest: Snapshot = api.snapshot;
  api.socket.on('room:snapshot', (snapshot) => {
    latest = snapshot;
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    expect(api.snapshot.panel.grid).toEqual({ cols: 40, rows: 40, tileSize: 32 });
    expect(api.snapshot.panels).toHaveLength(6);
    const joined = await page.request.post('/api/rooms/join', {
      data: { code: credential.roomCode, nickname: 'Traveler' },
    });
    expect(joined.ok()).toBeTruthy();
    const playerCredential = (await joined.json()).data as Credential;
    const player = await context.newPage();
    await enterExpansion(player, playerCredential);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    player.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('button', { name: 'Fit map to view', exact: true }).click();
    await page.screenshot({ path: 'artifacts/starter-world.png', fullPage: true });
    for (const destination of [
      'Willowbrook',
      'The Lantern Tavern',
      'Willowbrook',
      'Verdant Reach',
      'Emberdeep Caverns',
      'Verdant Reach',
      'Frostwatch Keep',
      'Verdant Reach',
      'Moonwell Shrine',
      'Verdant Reach',
    ]) {
      const anchor = latest.panel.structures!.find((anchor) => anchor.name === destination)!;
      expect(anchor, `a prepared route to ${destination}`).toBeTruthy();
      const panelId = latest.panel.id;
      const x = anchor.x + anchor.entranceOffset.dx;
      const y = anchor.y + anchor.entranceOffset.dy;
      const moved = await api.socket
        .timeout(3000)
        .emitWithAck('token:move', { panelId, memberId: playerCredential.memberId, x, y: y + 1 });
      expect(moved.ok).toBeTruthy();
      await expect(player.getByTestId('token-position')).toContainText(`${x + 1}, ${y + 2}`);
      await player.getByLabel('Map canvas').focus();
      await player.keyboard.press('ArrowUp');
      const prompt = `Travel to ${destination}?`;
      await expect(page.getByRole('dialog', { name: prompt })).toBeVisible();
      await expect(player.getByRole('dialog', { name: prompt })).toBeVisible();
      await player.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect(player.getByTestId('scene-title')).not.toHaveText(destination);
      await page.getByRole('button', { name: 'Approve travel', exact: true }).click();
      for (const view of [page, player]) {
        await expect(view.getByRole('dialog')).not.toBeVisible();
        await expect(view.getByTestId('scene-title')).toHaveText(destination);
      }
      await expect.poll(() => latest.panel.name).toBe(destination);
      if (destination !== 'Verdant Reach') {
        await page.getByRole('button', { name: 'Fit map to view', exact: true }).click();
        await page.screenshot({
          path: `artifacts/starter-${destination.toLowerCase().replaceAll(' ', '-')}.png`,
          fullPage: true,
        });
      }
    }
    await page.reload();
    await expect(page.getByTestId('connection-status')).toHaveText('Connected');
    await expect(page.getByTestId('scene-title')).toHaveText('Verdant Reach');
    expect(errors).toEqual([]);
  } finally {
    api.socket.disconnect();
    await context.close();
  }
});
