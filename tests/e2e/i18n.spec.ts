import { test, expect, type Page } from '@playwright/test';

async function switchLanguage(page: Page, label: string, language: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: language, exact: true }).click();
}

test('language switching preserves form drafts, clean URLs and preferences after reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Your nickname').fill('Crono');
  await page.getByLabel('Table name').fill('Our untouched story');
  await switchLanguage(page, 'Language', 'Português');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByLabel('Seu apelido')).toHaveValue('Crono');
  await expect(page.getByLabel('Nome da mesa')).toHaveValue('Our untouched story');
  await expect(page.getByRole('heading', { name: 'Puxe uma cadeira.' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  const cookie = (await context.cookies()).find((item) => item.name === 'NEXT_LOCALE');
  expect(cookie).toMatchObject({ value: 'pt-BR', path: '/', sameSite: 'Lax' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await switchLanguage(page, 'Idioma', 'Español');
  await expect(page.getByRole('heading', { name: 'Acerca una silla.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('request headers negotiate supported languages and localize missing routes', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'es-MX' });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.goto('/missing-trail');
    await expect(page.getByRole('heading', { name: 'Un camino poco transitado.' })).toBeVisible();
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: test.info().project.use.baseURL! },
    ]);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  } finally {
    await context.close();
  }
});

test('GM and player keep independent languages and synchronized game state when switching', async ({
  page: gm,
  browser,
}) => {
  await gm.goto('/');
  await switchLanguage(gm, 'Language', 'Português');
  await gm.getByLabel('Seu apelido').fill('Lelo');
  await gm.getByLabel('Nome da mesa').fill('Shared custom story');
  await gm.getByRole('button', { name: 'Criar uma mesa', exact: true }).click();
  await expect(gm.getByTestId('connection-status')).toHaveText('Conectado');
  const code = new URL(gm.url()).pathname.split('/').at(-1)!;
  await expect(gm.getByRole('button', { name: 'Floresta', exact: true })).toBeVisible();
  const context = await browser.newContext({
    locale: 'es',
    viewport: { width: 1280, height: 900 },
  });
  try {
    const player = await context.newPage();
    await player.goto('/?join=' + code);
    await player.getByLabel('Tu apodo').fill('Marle');
    await player.getByRole('button', { name: 'Unirse a la aventura', exact: true }).click();
    await expect(player.getByRole('heading', { name: 'Elige tu arquetipo' })).toBeVisible();
    await player.getByRole('radio', { name: 'Guerrero', exact: true }).check();
    await player.getByRole('button', { name: 'Siguiente: Apariencia' }).click();
    await player.getByRole('button', { name: 'Entrar a la mesa' }).click();
    await expect(player.getByLabel('Lienzo del mapa')).toBeVisible();
    await expect(gm.getByTestId('member-list')).toContainText('Guerreiro');
    await expect(player.getByTestId('member-list')).toContainText('Guerrero');
    const canvas = await gm.getByLabel('Tela do mapa').elementHandle();
    await gm.getByRole('button', { name: 'Aumentar zoom', exact: true }).click();
    const zoom = await gm.locator('.zoom-controls > span').first().innerText();
    await switchLanguage(gm, 'Idioma', 'English');
    await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
    expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(gm.locator('.zoom-controls > span').first()).toHaveText(zoom);
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await expect(gm.getByLabel('Class name', { exact: true })).toHaveValue('Warrior');
    await gm.getByLabel('Class Strength', { exact: true }).fill('3');
    await gm.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(player.getByTestId('member-list')).toContainText('Guerrero');
    await expect(
      player.getByRole('button', { name: 'Prueba de Fuerza +3', exact: true }),
    ).toBeVisible();
    await switchLanguage(gm, 'Language', 'Português');
    await player.getByRole('button', { name: 'Prueba de Fuerza +3', exact: true }).click();
    await expect(player.getByTestId('dice-history').locator('li').first()).toContainText(
      'Prueba de Fuerza',
    );
    await expect(gm.getByTestId('dice-history').locator('li').first()).toContainText(
      'Teste de Força',
    );
    await player.getByRole('button', { name: 'Ajustar tu salud', exact: true }).click();
    await player.getByLabel('Cantidad de daño o curación').fill('3');
    await player.getByRole('button', { name: 'Aplicar daño', exact: true }).click();
    await expect(gm.getByRole('meter', { name: 'PV de Marle' })).toHaveAttribute(
      'aria-valuenow',
      '21',
    );
    await player.getByRole('button', { name: 'Listo', exact: true }).click();
    await switchLanguage(player, 'Idioma', 'English');
    await expect(player.getByTestId('connection-status')).toHaveText('Connected');
    await expect(player.getByRole('meter', { name: "Marle's HP" }).first()).toHaveAttribute(
      'aria-valuenow',
      '21',
    );
    await expect(player.getByRole('heading', { name: 'Create your adventurer' })).toHaveCount(0);
    await expect(player.getByTestId('member-list')).toContainText('Warrior');
    await expect(gm.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(gm.getByTestId('member-list')).toContainText('Marle');
    expect(new URL(player.url()).pathname).toBe('/room/' + code);
    await player.reload();
    await expect(player.getByTestId('connection-status')).toHaveText('Connected');
    await expect(player.getByRole('meter', { name: "Marle's HP" }).first()).toHaveAttribute(
      'aria-valuenow',
      '21',
    );
  } finally {
    await context.close();
  }
});

test('mobile tabletop localizes scenes, dialogs and dice while keeping custom names intact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await switchLanguage(page, 'Language', 'Português');
  await page.getByLabel('Seu apelido').fill('Lelo');
  await page.getByLabel('Nome da mesa').fill('A custom story');
  await page.getByRole('button', { name: 'Criar uma mesa', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('Conectado');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Abrir cenas' }).click();
  await switchLanguage(page, 'Idioma', 'Español');
  await expect(page.getByRole('button', { name: 'Nueva escena', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva escena', exact: true }).click();
  await page.getByLabel('Nombre de la escena').fill('Our original forest');
  await page.getByRole('button', { name: 'Crear escena', exact: true }).click();
  await expect(page.getByTestId('scene-title')).toHaveText('Our original forest');
  await page.getByRole('button', { name: 'Cerrar panel de escenas' }).click();
  await page.getByRole('button', { name: 'Ayuda del mapa' }).click();
  await expect(page.getByRole('dialog', { name: 'Siéntete como en casa' })).toContainText(
    'Niebla de Guerra',
  );
  await page.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await page.getByRole('button', { name: 'Abrir dados' }).click();
  await page.getByLabel('Expresión de dados').fill('2d7');
  await page.getByRole('button', { name: 'Tirar dados', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Usa d4');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 720 });
  const inviteBounds = (await page
    .getByRole('button', { name: 'Invitar amigos', exact: true })
    .boundingBox())!;
  expect(inviteBounds.x + inviteBounds.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/i18n-tabletop-mobile-es.png', fullPage: true });
});

test('a saved language preference recovers when its cookie is missing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tavern:locale:v1', 'pt-BR'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('combobox', { name: 'Idioma', exact: true })).toContainText(
    'Português',
  );
});

test('mobile language controls work when local storage is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
  });
  await page.goto('/');
  await switchLanguage(page, 'Language', 'Português');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Entrar em uma mesa' }).click();
  await page.getByLabel('Seu apelido').fill('Crono');
  await page.getByLabel('Código da mesa').fill('TVRN-ABC234');
  await page.getByRole('button', { name: 'Entrar na aventura', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Mesa não encontrada' })).toBeVisible();
});
