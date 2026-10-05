import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, clickTile, connectMaster } from './helpers/expansion';
import { readMapView } from './helpers/map-view';

test('GM monster menus adjust shared HP, expose details and launch combat; players cannot open actions', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    api = await connectMaster(party.gm);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    await api.socket.timeout(3000).emitWithAck('monster:summon', {
      panelId: api.snapshot.panel.id,
      definitionId: 'bat',
      x: 4,
      y: 4,
    });
    await enterExpansion(page, party.gm);
    const player = await context.newPage();
    await enterExpansion(player, party.player);
    await page.getByRole('button', { name: 'Move players', exact: true }).click();
    await clickTile(page, 4, 4);
    const menu = page.getByRole('menu', { name: 'Actions for Giant Bat' });
    await expect(menu.getByRole('menuitem', { name: 'Enter Combat View' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Deal 5 damage' }).click();
    await expect(page.locator('.monster-list')).toContainText('3/8');
    await expect(player.locator('.monster-list [role="progressbar"]')).toHaveAttribute(
      'aria-valuenow',
      '38',
    );
    const trigger = page.getByRole('button', { name: 'Actions for Giant Bat' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await menu.getByRole('menuitem', { name: 'Heal 1 HP' }).click();
    await expect(page.locator('.monster-list')).toContainText('4/8');
    await trigger.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'Restore full HP' }).click();
    await expect(page.locator('.monster-list')).toContainText('8/8');
    const view = await readMapView(page),
      bounds = await page.getByLabel('Map canvas').boundingBox();
    await page.mouse.click(
      bounds!.x + view.x + (4 * 32 + 16) * view.zoom,
      bounds!.y + view.y + (4 * 32 + 16) * view.zoom,
      { button: 'right' },
    );
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Map canvas')).toBeFocused();
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Inspect monster' }).click();
    const details = page.getByRole('dialog', { name: 'Giant Bat' });
    await expect(details).toContainText('8/8');
    await details.getByRole('radio', { name: 'Hidden', exact: true }).check();
    await expect(player.locator('.monster-list [role="progressbar"]')).toHaveCount(0);
    await details.getByRole('button', { name: 'Close dialog' }).click();
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Deal 5 damage' }).click();
    await expect(page.locator('.monster-list')).toContainText('3/8');
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Deal 5 damage' }).click();
    await expect(page.locator('.monster-list')).toContainText('0/8');
    await trigger.click();
    await expect(menu.getByRole('menuitem', { name: 'Enter Combat View' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await menu.getByRole('menuitem', { name: 'Restore full HP' }).click();
    await expect(page.locator('.monster-list')).toContainText('8/8');
    await expect(player.getByRole('button', { name: 'Actions for Giant Bat' })).toHaveCount(0);
    await clickTile(player, 4, 4);
    await expect(player.getByRole('menu')).toHaveCount(0);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Enter Combat View' }).click();
    const arena = page.getByRole('dialog', { name: 'Combat arena' });
    await expect(arena.getByRole('status')).toHaveText('0 of 1 adventurers ready');
    await player.getByRole('button', { name: 'Roll initiative', exact: true }).click();
    await expect(arena.locator('.combat-initiative')).toHaveCount(0);
    await arena.getByRole('button', { name: 'End combat' }).click();
    await expect(arena).not.toBeVisible();
  } finally {
    api.socket.disconnect();
    await context.close();
  }
});
