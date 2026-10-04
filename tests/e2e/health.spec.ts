import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import type { Credential } from '../../src/types/game';

async function enter(page: Page, credential: Credential) {
  await page.addInitScript((saved) => {
    localStorage.setItem(
      'tavern:tables:v1',
      JSON.stringify([{ ...saved, name: 'Health', lastVisited: new Date().toISOString() }]),
    );
  }, credential);
  await page.goto('/room/' + credential.roomCode);
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
}

async function create(request: APIRequestContext) {
  const response = await request.post('/api/rooms', {
    data: { name: 'Health', nickname: 'GM', template: 'woodland' },
  });
  const gm = (await response.json()).data as Credential;
  const joined = await request.post('/api/rooms/join', {
    data: { code: gm.roomCode, nickname: 'Marle' },
  });
  return { gm, player: (await joined.json()).data as Credential };
}

// Observe drawing commands on the real map canvas, without app-only testing hooks.
function recordHealthPaint() {
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  const fill = CanvasRenderingContext2D.prototype.fillRect;
  const text = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.getAttribute('aria-label') === 'Map canvas') {
      this.canvas.dataset.healthPaint = '[]';
      this.canvas.dataset.ko = '';
    }
    return Reflect.apply(clear, this, args);
  };
  CanvasRenderingContext2D.prototype.fillRect = function (...args) {
    if (
      this.canvas.getAttribute('aria-label') === 'Map canvas' &&
      args[3] === 3 &&
      ['#22c55e', '#f59e0b', '#ef4444'].includes(String(this.fillStyle))
    ) {
      const drawn = JSON.parse(this.canvas.dataset.healthPaint || '[]');
      drawn.push({ width: args[2], color: this.fillStyle });
      this.canvas.dataset.healthPaint = JSON.stringify(drawn);
    }
    return Reflect.apply(fill, this, args);
  };
  CanvasRenderingContext2D.prototype.fillText = function (...args) {
    if (this.canvas.getAttribute('aria-label') === 'Map canvas' && args[0] === 'KO')
      this.canvas.dataset.ko = 'KO';
    return Reflect.apply(text, this, args);
  };
}

test('GM health controls synchronize sidebar, HUD, token colors and unconscious status with the player', async ({
  page: gm,
  browser,
  request,
}) => {
  const credentials = await create(request);
  await enter(gm, credentials.gm);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const player = await context.newPage();
    await player.addInitScript(recordHealthPaint);
    await enter(player, credentials.player);
    await player.getByRole('radio', { name: 'No class', exact: true }).check();
    await player.getByRole('button', { name: 'Next: Appearance' }).click();
    await player.getByRole('button', { name: 'Enter tabletop' }).click();
    await gm.getByRole('button', { name: 'Move Marle', exact: true }).click();
    for (const view of [gm, player]) {
      await expect(view.getByTestId('member-list')).toContainText('20/20 HP');
      await expect(view.locator('.character-hud')).toContainText('20/20 HP');
    }
    await gm.getByRole('button', { name: "Adjust Marle's health", exact: true }).click();
    const editor = gm.getByRole('dialog', { name: "Marle's health" });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: '-5 HP', exact: true }).click();
    await expect(player.getByTestId('member-list')).toContainText('15/20 HP');
    await expect(player.getByLabel('Map canvas')).toHaveAttribute(
      'data-health-paint',
      '[{"width":18,"color":"#22c55e"}]',
    );
    await editor.getByLabel('Current HP', { exact: true }).fill('10');
    await editor.getByRole('button', { name: 'Set current HP', exact: true }).click();
    await expect(player.getByLabel('Map canvas')).toHaveAttribute(
      'data-health-paint',
      '[{"width":12,"color":"#f59e0b"}]',
    );
    await editor.getByLabel('Current HP', { exact: true }).fill('4');
    await editor.getByRole('button', { name: 'Set current HP', exact: true }).click();
    await expect(player.getByLabel('Map canvas')).toHaveAttribute(
      'data-health-paint',
      '[{"width":4.800000000000001,"color":"#ef4444"}]',
    );
    await expect(player.getByTestId('member-list').locator('.health-status')).toHaveAttribute(
      'data-health-state',
      'danger',
    );
    await editor.getByLabel('Maximum HP bonus', { exact: true }).fill('5');
    await editor.getByRole('button', { name: 'Apply bonus', exact: true }).click();
    await expect(player.locator('.character-hud')).toContainText('4/25 HP');
    await editor.getByRole('button', { name: 'Heal to full', exact: true }).click();
    await expect(player.locator('.character-hud')).toContainText('25/25 HP');
    await editor.getByLabel('Current HP', { exact: true }).fill('0');
    await editor.getByRole('button', { name: 'Set current HP', exact: true }).click();
    await expect(player.getByLabel('Map canvas')).toHaveAttribute('data-ko', 'KO');
    await expect(player.getByTestId('member-list')).toContainText('Unconscious');
    await expect(player.locator('.character-hud')).toContainText('0/25 HP');
    await gm.keyboard.press('Escape');
    await expect(editor).not.toBeVisible();
    await expect(
      gm.getByRole('button', { name: "Adjust Marle's health", exact: true }),
    ).toBeFocused();
    await gm.getByRole('button', { name: 'Heal Marle by 1 HP', exact: true }).click();
    await expect(player.locator('.character-hud')).toContainText('1/25 HP');
    await gm.getByRole('button', { name: 'Damage Marle by 1 HP', exact: true }).click();
    await expect(player.locator('.character-hud')).toContainText('0/25 HP');
    await gm.screenshot({ path: 'artifacts/health-desktop.png', fullPage: true });
    await player.reload();
    await expect(player.locator('.character-hud')).toContainText('0/25 HP');
    await player.getByRole('button', { name: "Adjust Marle's health", exact: true }).click();
    const ownEditor = player.getByRole('dialog', { name: "Marle's health" });
    await expect(ownEditor.getByLabel('Maximum HP bonus', { exact: true })).toHaveCount(0);
    await ownEditor.getByLabel('Damage or healing amount', { exact: true }).fill('999');
    await ownEditor.getByRole('button', { name: 'Apply healing', exact: true }).click();
    await expect(gm.getByTestId('member-list')).toContainText('25/25 HP');
    await ownEditor.getByRole('button', { name: 'Apply damage', exact: true }).click();
    await expect(gm.getByTestId('member-list')).toContainText('0/25 HP');
  } finally {
    await context.close();
  }
});

test('class health modifiers preview onboarding, fill initial HP and recalculate edits without healing', async ({
  page: gm,
  browser,
  request,
}) => {
  const credentials = await create(request);
  await enter(gm, credentials.gm);
  await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
  const manager = gm.getByRole('dialog', { name: 'Manage classes' });
  await manager.getByLabel('Class health modifier', { exact: true }).fill('7');
  await manager.getByRole('combobox', { name: 'Edit subclass', exact: true }).click();
  await gm.getByRole('option', { name: 'Guardião', exact: true }).click();
  await manager.getByLabel('Subclass health modifier', { exact: true }).fill('3');
  await manager.getByRole('button', { name: 'Save classes', exact: true }).click();
  const context = await browser.newContext();
  try {
    const player = await context.newPage();
    await enter(player, credentials.player);
    await player.getByRole('radio', { name: 'Guerreiro', exact: true }).check();
    await expect(
      player.getByRole('radio', { name: 'Guerreiro', exact: true }).locator('..'),
    ).toContainText('+7 HP');
    await expect(
      player.getByRole('radio', { name: 'Guerreiro', exact: true }).locator('..'),
    ).toContainText('Maximum HP: 27');
    await player.getByRole('radio', { name: 'Guardião', exact: true }).check();
    await expect(player.getByLabel('Character attributes')).toContainText('Maximum HP: 30');
    await player.getByRole('button', { name: 'Next: Appearance' }).click();
    await player.getByRole('button', { name: 'Enter tabletop' }).click();
    for (const view of [gm, player]) {
      await expect(view.getByTestId('member-list')).toContainText('30/30 HP');
    }
    await expect(player.locator('.character-hud')).toContainText('30/30 HP');
    await gm.getByRole('button', { name: 'Manage classes', exact: true }).click();
    await manager.getByLabel('Class health modifier', { exact: true }).fill('-10');
    await manager.getByRole('button', { name: 'Save classes', exact: true }).click();
    await expect(player.locator('.character-hud')).toContainText('13/13 HP');
  } finally {
    await context.close();
  }
});

test('mobile players adjust their own health with keyboard focus and reduced motion', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const credentials = await create(request);
  await enter(page, credentials.player);
  await page.getByRole('button', { name: 'Next: Appearance' }).click();
  await page.getByRole('button', { name: 'Enter tabletop' }).click();
  await page.getByRole('button', { name: 'Adjust your health', exact: true }).click();
  const editor = page.getByRole('dialog', { name: "Marle's health" });
  await editor.getByRole('button', { name: '-1 HP', exact: true }).click();
  await expect(editor).toContainText('19/20 HP');
  await editor.getByLabel('Damage or healing amount', { exact: true }).fill('5');
  await editor.getByRole('button', { name: 'Apply damage', exact: true }).click();
  await expect(editor).toContainText('14/20 HP');
  await page.keyboard.press('Tab');
  await expect(editor.locator(':focus')).toHaveCount(1);
  const bounds = await editor.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/health-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('.character-hud')).toContainText('14/20 HP');
  await expect(page.locator('.character-hud .health-fill')).toHaveCSS('transition-duration', '0s');
});
