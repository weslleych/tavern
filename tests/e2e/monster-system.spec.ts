import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, clickTile, connectMaster } from './helpers/expansion';

test('custom PNG monsters persist through refresh and can be dragged without changing private health', async ({
  page,
  request,
}) => {
  const party = await createParty(request),
    api = await connectMaster(party.gm);
  let latest = api.snapshot;
  api.socket.on('room:snapshot', (view) => {
    latest = view;
  });
  try {
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [4, 5].map((x) => ({ x, y: 4, terrain: 'grass', blocked: false })),
    });
    await enterExpansion(page, party.gm);
    await page.getByRole('button', { name: 'Bestiary', exact: true }).click();
    await page.getByRole('button', { name: 'Create monster', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Create monster' });
    await form.getByLabel('Monster name', { exact: true }).fill('Ember wisp');
    await form.getByLabel('Maximum HP', { exact: true }).fill('27');
    await form.getByRole('radio', { name: 'Hidden', exact: true }).check();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#de7138';
      ctx.fillRect(8, 8, 16, 16);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await form.getByLabel('Upload 32 × 32 PNG').setInputFiles({
      name: 'wisp.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    await form.getByRole('button', { name: 'Save monster' }).click();
    await expect(form).not.toBeVisible();
    await page.getByRole('tab', { name: 'Custom monsters' }).click();
    await page.getByRole('button', { name: 'Summon Ember wisp' }).click();
    await clickTile(page, 4, 4);
    await expect(page.locator('.monster-list')).toContainText('27/27');
    await page.reload();
    await expect(page.getByTestId('connection-status')).toHaveText('Connected');
    await expect(page.locator('.monster-list')).toContainText('Ember wisp');
    await page.getByRole('button', { name: 'Move players', exact: true }).click();
    const { readMapView } = await import('./helpers/map-view');
    const view = await readMapView(page),
      bounds = await page.getByLabel('Map canvas').boundingBox();
    const point = (x: number) => ({
      x: bounds!.x + view.x + (x * 32 + 16) * view.zoom,
      y: bounds!.y + view.y + (4 * 32 + 16) * view.zoom,
    });
    const start = point(4),
      end = point(5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => latest.panel.monsters?.find((m) => m.name === 'Ember wisp')?.x).toBe(5);
    await page.getByRole('button', { name: 'Inspect Ember wisp' }).click();
    const inspector = page.getByRole('dialog', { name: 'Ember wisp' });
    await expect(inspector.getByLabel('Column', { exact: true })).toHaveValue('6');
    await expect(inspector).toContainText('27/27');
    await page.screenshot({ path: '.tavern/custom-monster.png' });
  } finally {
    api.socket.disconnect();
  }
});
test('GM summons and damages a bar-only monster, toggles privacy and removes it', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    context = await browser.newContext(),
    api = await connectMaster(party.gm);
  try {
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    await enterExpansion(page, party.gm);
    const player = await context.newPage();
    await enterExpansion(player, party.player);
    await page.getByRole('button', { name: 'Bestiary', exact: true }).click();
    await page.getByRole('button', { name: 'Summon Acid Slime' }).click();
    await clickTile(page, 4, 4);
    await expect(player.locator('.monster-list')).toContainText('Acid Slime');
    await expect(player.locator('.monster-list')).not.toContainText('12/12');
    await page.getByRole('button', { name: 'Inspect Acid Slime' }).click();
    const editor = page.getByRole('dialog', { name: 'Acid Slime' });
    await editor.getByRole('button', { name: '-5 HP', exact: true }).click();
    await expect(editor).toContainText('7/12');
    await expect(player.locator('.monster-list [role="progressbar"]')).toHaveAttribute(
      'aria-valuenow',
      '58',
    );
    await editor.getByRole('radio', { name: 'Hidden', exact: true }).check();
    await expect(player.locator('.monster-list [role="progressbar"]')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Remove monster' }).click();
    await expect(player.locator('.monster-list-row')).toHaveCount(0);
  } finally {
    api.socket.disconnect();
    await context.close();
  }
});
