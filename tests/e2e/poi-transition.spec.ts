import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, clickTile, connectMaster } from './helpers/expansion';
test('categorized palette places a POI, links a scene and requires player consent plus GM approval', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    context = await browser.newContext();
  const api = await connectMaster(party.gm);
  try {
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [{ x: 5, y: 7, terrain: 'grass', blocked: false }],
    });
    await enterExpansion(page, party.gm);
    const player = await context.newPage();
    await enterExpansion(player, party.player);
    const world = page.getByRole('tab', { name: 'World', exact: true });
    await expect(world).toBeVisible();
    await world.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Cities', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await world.click();
    await page.getByRole('button', { name: 'Walled town', exact: true }).click();
    await clickTile(page, 4, 4);
    await page.getByRole('button', { name: 'Link Walled town' }).click();
    const link = page.getByRole('dialog', { name: 'Link point of interest' });
    await link.getByLabel('Point of interest name').fill('Guardia');
    await link.getByRole('button', { name: 'Create town scene' }).click();
    await api.socket.timeout(3000).emitWithAck('token:move', {
      panelId: api.snapshot.panel.id,
      memberId: party.player.memberId,
      x: 5,
      y: 7,
    });
    await player.getByLabel('Map canvas').focus();
    await player.keyboard.press('ArrowUp');
    for (const view of [page, player])
      await expect(view.getByRole('dialog', { name: 'Travel to Guardia?' })).toBeVisible();
    await player.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Approve travel' }).click();
    for (const view of [page, player]) await expect(view.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('.scene-item.active')).toContainText('Guardia');
  } finally {
    api.socket.disconnect();
    await context.close();
  }
});
