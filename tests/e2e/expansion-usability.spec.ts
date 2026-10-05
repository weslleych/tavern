import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, clickTile, connectMaster } from './helpers/expansion';

test('bestiary has a visible label, roomy desktop cards and fits small screens', async ({
  page,
  request,
}) => {
  const party = await createParty(request);
  await enterExpansion(page, party.gm);
  const trigger = page.getByRole('button', { name: 'Bestiary', exact: true });
  await expect(trigger).toHaveText('Bestiary');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Bestiary', exact: true });
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(800);
  for (const width of [760, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(780);
    await dialog.getByRole('button', { name: 'Summon Young Red Dragon' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
    await expect(
      dialog.getByRole('button', { name: 'Create monster', exact: true }),
    ).toBeInViewport();
  }
  await dialog.getByRole('tab', { name: 'Custom monsters' }).click();
  await expect(dialog.getByRole('status')).toContainText('No custom monsters yet');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('POI actions work from the map and sidebar with keyboard and preserve explicit scene creation', async ({
  page,
  request,
}) => {
  const party = await createParty(request),
    api = await connectMaster(party.gm);
  try {
    await enterExpansion(page, party.gm);
    await page.getByRole('button', { name: 'Walled town', exact: true }).click();
    await clickTile(page, 4, 4);
    await page.getByRole('button', { name: 'Move players', exact: true }).click();
    await clickTile(page, 5, 5);
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Link existing scene' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Map canvas')).toBeFocused();
    await clickTile(page, 5, 5);
    await menu.getByRole('menuitem', { name: 'Create linked town scene' }).click();
    const form = page.getByRole('dialog', { name: 'Create linked town scene' });
    await form.getByLabel('Point of interest name').fill('Guardia');
    await form.getByRole('button', { name: 'Create and link scene' }).click();
    await expect(form).not.toBeVisible();
    const sidebar = page.getByRole('button', { name: 'Actions for Guardia' });
    await sidebar.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toContainText('Guardia');
    await page.keyboard.press('Escape');
    await expect(sidebar).toBeFocused();
    await sidebar.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'Link existing scene' }).click();
    const link = page.getByRole('dialog', { name: 'Link point of interest' });
    await expect(link.getByRole('combobox', { name: 'Destination scene' })).toContainText(
      'Guardia',
    );
    await link.getByRole('button', { name: 'Cancel', exact: true }).click();
    await sidebar.click();
    await menu.getByRole('menuitem', { name: 'Unlink scene' }).click();
    await sidebar.click();
    await expect(menu.getByRole('menuitem', { name: 'Unlink scene' })).toHaveCount(0);
  } finally {
    api.socket.disconnect();
  }
});
