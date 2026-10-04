import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import type { Credential, DiceRoll } from '../../src/types/game';

async function createTable(request: APIRequestContext) {
  const response = await request.post('/api/rooms', {
    data: { name: 'Dice workshop', nickname: 'Frog', template: 'blank' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data as Credential;
}

async function enterTable(page: Page, credential: Credential) {
  const observed: DiceRoll[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      const frame = String(payload);
      if (!frame.startsWith('42[')) return;
      const [event, roll] = JSON.parse(frame.slice(2));
      if (event === 'dice:rolled') observed.push(roll);
    });
  });
  await page.addInitScript((saved) => {
    localStorage.setItem(
      'tavern:tables:v1',
      JSON.stringify([{ ...saved, name: 'Dice workshop', lastVisited: new Date().toISOString() }]),
    );
  }, credential);
  await page.goto('/room/' + credential.roomCode);
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  if (credential.role === 'player') {
    await page.getByRole('button', { name: 'Enter tabletop' }).click();
  }
  await expect(page.getByLabel('Map canvas')).toBeVisible();
  return observed;
}

test('GM and player use the docked dice log, share authoritative results, validate notation and restore history', async ({
  browser,
  request,
}) => {
  const gmCredential = await createTable(request);
  const join = await request.post('/api/rooms/join', {
    data: { code: gmCredential.roomCode, nickname: 'Marle' },
  });
  const playerCredential = (await join.json()).data as Credential;
  const gmContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const playerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const gm = await gmContext.newPage(),
      player = await playerContext.newPage();
    const gmRolls = await enterTable(gm, gmCredential);
    const playerRolls = await enterTable(player, playerCredential);
    const log = gm.getByRole('complementary', { name: 'Dice log' });
    await expect(log).toBeVisible();
    const canvasOpen = (await gm.getByLabel('Map canvas').boundingBox())!;
    const sidebar = (await log.boundingBox())!;
    expect(sidebar.width).toBe(280);
    expect(canvasOpen.x + canvasOpen.width).toBeLessThanOrEqual(sidebar.x);
    await gm.getByRole('button', { name: 'Close dice' }).click();
    await expect(log).not.toBeVisible();
    expect((await gm.getByLabel('Map canvas').boundingBox())!.width).toBeGreaterThan(
      canvasOpen.width,
    );
    await gm.getByRole('button', { name: 'Open dice' }).click();
    await gm.getByLabel('Dice expression').fill('2d6+3');
    await gm.getByLabel('Dice expression').press('Enter');
    await expect(gm.getByTestId('dice-history').locator('li').first()).toHaveAttribute(
      'data-state',
      'rolling',
    );
    await expect.poll(() => gmRolls.length).toBe(1);
    await expect.poll(() => playerRolls.length).toBe(1);
    expect(playerRolls[0]).toEqual(gmRolls[0]);
    for (const page of [gm, player]) {
      const card = page.getByTestId('dice-history').locator('li').first();
      await expect(card).toContainText('Frog');
      await expect(card.getByLabel('Game master')).toBeVisible();
      await expect(card).toContainText('2d6 + 3');
      await expect(card.locator('time')).toHaveText(/\d{2}:\d{2}/);
      await expect(card).toHaveAttribute('data-state', 'settled');
      await expect(card.getByTestId('dice-total')).toHaveText(String(gmRolls[0].total));
      await expect(card.getByTestId('dice-breakdown')).toHaveText(
        `[${gmRolls[0].values.join(', ')}] + 3`,
      );
    }
    for (const invalid of ['2d7', '0d6', '25d20', 'd6+1001', 'abc']) {
      await gm.getByLabel('Dice expression').fill(invalid);
      await gm.getByLabel('Dice expression').press('Enter');
      await expect(log.getByRole('alert')).toBeVisible();
      await expect(gm.getByTestId('dice-history').locator('li')).toHaveCount(1);
    }
    await player.getByLabel('Dice expression').fill('1d12-2');
    await player.getByLabel('Dice expression').press('Enter');
    await expect(gm.getByTestId('dice-history').locator('li').first()).toContainText('Marle');
    await expect(
      gm.getByTestId('dice-history').locator('li').first().getByLabel('Player', { exact: true }),
    ).toBeVisible();
    for (const sides of [4, 6, 8, 10, 12, 20]) {
      await player.getByRole('button', { name: `Roll d${sides}`, exact: true }).click();
      await expect(gm.getByTestId('dice-history').locator('li').first()).toContainText(
        `1d${sides}`,
      );
    }
    await expect.poll(() => gmRolls.length).toBe(8);
    expect(gmRolls.slice(2).map(({ sides, count, modifier }) => [sides, count, modifier])).toEqual([
      [4, 1, 0],
      [6, 1, 0],
      [8, 1, 0],
      [10, 1, 0],
      [12, 1, 0],
      [20, 1, 0],
    ]);
    await gm.screenshot({ path: 'artifacts/dice-desktop.png', fullPage: true });
    await playerContext.close();
    await expect(gm.getByTestId('member-list')).not.toContainText('Marle');
    await expect(
      gm.getByTestId('dice-history').locator('li').first().getByLabel('Player', { exact: true }),
    ).toBeVisible();
    await gm.reload();
    await expect(gm.getByTestId('dice-history').locator('li')).toHaveCount(8);
    await expect(gm.locator('[data-state="rolling"]')).toHaveCount(0);
    await expect(
      gm.getByTestId('dice-history').locator('li').last().getByTestId('dice-total'),
    ).toHaveText(String(gmRolls[0].total));
    await gmContext.setOffline(true);
    await expect(gm.getByTestId('connection-status')).toHaveText('Reconnecting');
    await expect(gm.getByLabel('Dice expression')).toBeDisabled();
    await expect(gm.getByRole('button', { name: 'Roll d20', exact: true })).toBeDisabled();
    await expect(gm.getByRole('button', { name: 'Roll dice', exact: true })).toBeDisabled();
    await gmContext.setOffline(false);
    await expect(gm.getByTestId('connection-status')).toHaveText('Connected');
    await expect(gm.locator('[data-state="rolling"]')).toHaveCount(0);
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});

test('mobile dice drawer traps focus, dismisses with Escape, close and backdrop, and respects the 980px breakpoint', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enterTable(page, await createTable(request));
  const toggle = page.getByRole('button', { name: 'Open dice' });
  const drawer = page.getByRole('dialog', { name: 'Dice log' });
  await expect(drawer).not.toBeVisible();
  await toggle.click();
  await expect(drawer).toBeVisible();
  await expect(page.getByLabel('Dice expression')).toBeFocused();
  await page.getByRole('button', { name: 'Roll dice', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close dice' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Roll dice', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole('button', { name: 'Roll d8', exact: true }).click();
  await expect(page.getByTestId('dice-history')).toContainText('1d8');
  await page.screenshot({ path: 'artifacts/dice-mobile.png', fullPage: true });
  await page.mouse.click(8, 100);
  await expect(drawer).not.toBeVisible();
  await toggle.click();
  await page.getByRole('button', { name: 'Close dice' }).click();
  await expect(drawer).not.toBeVisible();
  await page.setViewportSize({ width: 979, height: 700 });
  await toggle.click();
  await expect(drawer).toBeVisible();
  await page.setViewportSize({ width: 980, height: 700 });
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Dice log' })).toBeVisible();
  await expect(page.getByTestId('dice-history')).toContainText('1d8');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 740, height: 375 });
  await expect(drawer).toBeVisible();
  await page.getByRole('button', { name: 'Roll d4', exact: true }).click();
  await expect(page.getByTestId('dice-history')).toContainText('1d4');
  await expect(page.getByRole('button', { name: 'Roll dice', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reduced motion displays settled server results without cycling or waiting', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rolls = await enterTable(page, await createTable(request));
  await page.getByLabel('Dice expression').fill('d20-2');
  await page.getByLabel('Dice expression').press('Enter');
  await expect.poll(() => rolls.length).toBe(1);
  await expect(page.locator('[data-state="rolling"]')).toHaveCount(0);
  await expect(page.getByTestId('dice-total')).toHaveText(String(rolls[0].total));
  await expect(page.getByTestId('dice-breakdown')).toHaveText(`[${rolls[0].values[0]}] - 2`);
});

test('simultaneous party rolls settle independently, cap history, and scroll inside the desktop sidebar', async ({
  browser,
  request,
}) => {
  const credential = await createTable(request);
  const response = await request.post('/api/rooms/join', {
    data: { code: credential.roomCode, nickname: 'Robo' },
  });
  const gmContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const playerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const gm = await gmContext.newPage(),
      player = await playerContext.newPage();
    const observed = await enterTable(gm, credential);
    await enterTable(player, (await response.json()).data);
    for (let batch = 0; batch < 11; batch++) {
      await Promise.all([
        gm.getByLabel('Dice expression').fill('2d4+1'),
        player.getByLabel('Dice expression').fill('d6-2'),
      ]);
      await Promise.all([
        gm.getByLabel('Dice expression').press('Enter'),
        player.getByLabel('Dice expression').press('Enter'),
      ]);
      await expect.poll(() => observed.length).toBe((batch + 1) * 2);
    }
    const cards = gm.getByTestId('dice-history').locator('li');
    await expect(cards).toHaveCount(20);
    await expect(player.getByTestId('dice-history').locator('li')).toHaveCount(20);
    await expect(gm.locator('[data-state="rolling"]')).toHaveCount(0);
    expect(await cards.getByTestId('dice-total').allTextContents()).toEqual(
      observed
        .slice(-20)
        .toReversed()
        .map((roll) => String(roll.total)),
    );
    for (const roll of observed) {
      expect(roll.total).toBe(roll.values.reduce((sum, value) => sum + value, roll.modifier));
    }
    await expect(cards.last()).not.toBeInViewport();
    await gm
      .locator('.dice-log-scroll')
      .evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(cards.last()).toBeInViewport();
    expect(await gm.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900);
    await expect
      .poll(() =>
        gm
          .getByTestId('dice-history')
          .evaluate(
            (element) =>
              element
                .getAnimations({ subtree: true })
                .filter((animation) => animation.playState === 'running').length,
          ),
      )
      .toBe(0);
    await gm.getByRole('button', { name: 'Close dice' }).click();
    await gm.getByRole('button', { name: 'Open dice' }).click();
    await expect(gm.locator('[data-state="rolling"]')).toHaveCount(0);
    expect(
      await gm
        .getByTestId('dice-history')
        .evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === 'running').length,
        ),
    ).toBe(0);
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
