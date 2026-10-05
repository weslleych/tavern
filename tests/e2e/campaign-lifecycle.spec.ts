import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, connectMaster } from './helpers/expansion';

test('active departure clears a seat and offline deleted campaigns are forgotten when reopened', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    context = await browser.newContext(),
    api = await connectMaster(party.gm);
  try {
    await enterExpansion(page, party.gm);
    const player = await context.newPage();
    await enterExpansion(player, party.player);
    await player.getByRole('button', { name: 'Campaign actions' }).click();
    await player.getByRole('button', { name: 'Leave table', exact: true }).click();
    await player
      .getByRole('dialog')
      .getByRole('button', { name: 'Leave table', exact: true })
      .click();
    await expect(player).toHaveURL('/');
    await expect(page.getByTestId('member-list')).not.toContainText('Hero');
    await page.goto('/');
    expect((await api.socket.timeout(3000).emitWithAck('room:delete')).ok).toBeTruthy();
    await page.getByRole('link', { name: /Expansion/ }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('#your-tables')).not.toContainText(party.gm.roomCode);
    await expect(page.getByRole('status')).toContainText('no longer exists');
  } finally {
    api.socket.disconnect();
    await context.close();
  }
});
test('GM confirmation deletes a campaign and redirects and forgets both active browsers', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    context = await browser.newContext();
  try {
    const player = await context.newPage();
    await enterExpansion(page, party.gm);
    await enterExpansion(player, party.player);
    await page.getByRole('button', { name: 'Campaign actions' }).click();
    await page.getByRole('button', { name: 'Delete campaign', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete campaign' });
    await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
    await dialog.getByLabel('Type the room code').fill(party.gm.roomCode);
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    for (const view of [page, player]) {
      await expect(view).toHaveURL('/');
      await expect(view.locator('#your-tables')).not.toContainText(party.gm.roomCode);
      await expect(view.getByRole('status')).toContainText('deleted');
    }
  } finally {
    await context.close();
  }
});
test('player removes a saved table locally and the GM retains the campaign', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request),
    context = await browser.newContext();
  try {
    await enterExpansion(page, party.gm);
    const player = await context.newPage();
    await enterExpansion(player, party.player);
    await player.goto('/');
    await player.getByRole('button', { name: 'Remove Expansion' }).click();
    await player
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove table', exact: true })
      .click();
    await expect(player.locator('#your-tables')).not.toContainText(party.gm.roomCode);
    await expect(page.getByTestId('connection-status')).toHaveText('Connected');
    expect((await request.get(`/api/rooms/${party.gm.roomCode}`)).ok()).toBeTruthy();
  } finally {
    await context.close();
  }
});
