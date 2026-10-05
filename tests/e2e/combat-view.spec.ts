import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, connectMaster } from './helpers/expansion';
test('combat displays an arena, authoritative initiative/actions and returns to exploration', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    context = await browser.newContext({ reducedMotion: 'reduce' }),
    api = await connectMaster(party.gm);
  try {
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    await enterExpansion(page, party.gm);
    const player = await context.newPage();
    await enterExpansion(player, party.player);
    await api.socket.timeout(3000).emitWithAck('monster:summon', {
      panelId: api.snapshot.panel.id,
      definitionId: 'dragon',
      x: 4,
      y: 4,
    });
    await page.getByRole('button', { name: 'Inspect Young Red Dragon' }).click();
    const started = new Promise<import('../../src/types/game').Snapshot>((resolve) =>
      api.socket.once('room:snapshot', resolve),
    );
    await page.getByRole('button', { name: 'Enter Combat View' }).click();
    const monsterId = (await started).room.activeCombat!.monsterId;
    for (const view of [page, player]) {
      await expect(view.getByRole('dialog', { name: 'Combat arena' })).toBeVisible();
      await expect(view.locator('.arena-header')).toContainText('Round 1');
    }
    const arena = page.getByRole('dialog', { name: 'Combat arena' });
    await expect(page.locator('.combat-wipe')).toHaveCount(0);
    await player.reload();
    await expect(player.getByRole('dialog', { name: 'Combat arena' })).toBeVisible();
    await expect(player.locator('.combat-wipe')).toHaveCount(0);
    for (const width of [760, 600, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(arena).toBeVisible();
      expect(
        await arena.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBeTruthy();
      await expect(arena.getByRole('button', { name: 'End combat' })).toBeInViewport();
    }
    await page.screenshot({ path: '.tavern/combat-mobile.png' });
    await page.setViewportSize({ width: 1280, height: 800 });
    const monsterFirst = await arena
      .getByRole('button', { name: 'Monster attack', exact: true })
      .isVisible();
    const monsterAttack = async () => {
      await arena.getByRole('radio', { name: /Hero/ }).check();
      await arena.getByLabel('Attack notation').fill('1d12');
      await arena.getByRole('button', { name: 'Monster attack', exact: true }).click();
    };
    if (monsterFirst) await monsterAttack();
    await player.getByRole('button', { name: 'Basic attack', exact: true }).click();
    await expect(page.locator('.dice-log-scroll')).toContainText('Basic attack');
    if (!monsterFirst) await monsterAttack();
    await api.socket
      .timeout(3000)
      .emitWithAck('monster:adjust_hp', { panelId: api.snapshot.panel.id, monsterId, current: 0 });
    await expect(arena.getByRole('status')).toContainText('Party victory!');
    await arena.getByRole('button', { name: 'Return to map' }).click();
    for (const view of [page, player]) {
      await expect(view.getByRole('dialog', { name: 'Combat arena' })).not.toBeVisible();
      await expect(view.getByLabel('Map canvas')).toBeVisible();
    }
  } finally {
    api.socket.disconnect();
    await context.close();
  }
});
