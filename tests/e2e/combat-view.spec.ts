import { test, expect } from '@playwright/test';
import { createParty, enterExpansion, connectMaster } from './helpers/expansion';
import type { Credential } from '../../src/types/game';
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
    await page.getByRole('button', { name: 'Actions for Young Red Dragon' }).click();
    const started = new Promise<import('../../src/types/game').Snapshot>((resolve) =>
      api.socket.once('room:snapshot', resolve),
    );
    await page.getByRole('menuitem', { name: 'Enter Combat View' }).click();
    const monsterId = (await started).room.activeCombat!.monsterId;
    for (const view of [page, player]) {
      await expect(view.getByRole('dialog', { name: 'Combat arena' })).toBeVisible();
      await expect(view.locator('.arena-header')).toContainText('Round 1');
    }
    const arena = page.getByRole('dialog', { name: 'Combat arena' });
    await expect(arena.getByRole('status')).toContainText('0 of 1 adventurers ready');
    await expect(arena.getByRole('button', { name: 'Pass turn' })).toHaveCount(0);
    await expect(page.locator('.combat-wipe')).toHaveCount(0);
    await player.reload();
    await expect(player.getByRole('dialog', { name: 'Combat arena' })).toBeVisible();
    await expect(player.locator('.combat-wipe')).toHaveCount(0);
    await player.getByRole('button', { name: 'Roll initiative', exact: true }).click();
    await expect(arena.locator('.combat-initiative')).toHaveCount(0);
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

test('offline seats do not block initial initiative and reconnecting preserves the fixed order', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request);
  const joined = await request.post('/api/rooms/join', {
    data: { code: party.gm.roomCode, nickname: 'Second hero' },
  });
  expect(joined.ok()).toBeTruthy();
  const secondCredential = (await joined.json()).data as Credential;
  const firstContext = await browser.newContext({ reducedMotion: 'reduce' });
  const secondContext = await browser.newContext({ reducedMotion: 'reduce' });
  const api = await connectMaster(party.gm);
  try {
    await enterExpansion(page, party.gm);
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await enterExpansion(first, party.player);
    await enterExpansion(second, secondCredential);
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    await api.socket.timeout(3000).emitWithAck('monster:summon', {
      panelId: api.snapshot.panel.id,
      definitionId: 'dragon',
      x: 4,
      y: 4,
    });
    await page.getByRole('button', { name: 'Actions for Young Red Dragon' }).click();
    await page.getByRole('menuitem', { name: 'Enter Combat View' }).click();
    const arena = page.getByRole('dialog', { name: 'Combat arena' });
    await expect(arena.getByRole('status')).toHaveText('0 of 2 adventurers ready');
    await first.close();
    await expect(arena.getByRole('status')).toHaveText('0 of 1 adventurers ready');
    await second.getByRole('button', { name: 'Roll initiative', exact: true }).click();
    await expect(arena.locator('.combat-initiative')).toHaveCount(0);
    await expect(arena.locator('.initiative-ribbon li')).toHaveCount(2);
    const order = await arena.locator('.initiative-ribbon li').allTextContents();
    const reconnected = await firstContext.newPage();
    await reconnected.goto(`/room/${party.gm.roomCode}`);
    await expect(reconnected.getByTestId('connection-status')).toHaveText('Connected');
    await expect(
      reconnected.getByRole('button', { name: 'Roll initiative', exact: true }),
    ).toHaveCount(0);
    for (let index = 0; index < 2; index++) {
      const active = await arena.locator('[aria-current="step"]').innerText();
      await arena.getByRole('button', { name: 'Pass turn' }).click();
      if (index === 0) await expect(arena.locator('[aria-current="step"]')).not.toHaveText(active);
    }
    await expect(arena.locator('.arena-header')).toContainText('Round 2');
    await expect(arena.locator('.initiative-ribbon li')).toHaveText(order);
    await expect(arena.locator('.combat-initiative')).toHaveCount(0);
    await expect(arena.locator('.initiative-ribbon li')).toHaveCount(2);
    await arena.getByRole('button', { name: 'End combat' }).click();
  } finally {
    api.socket.disconnect();
    await firstContext.close();
    await secondContext.close();
  }
});

test('two players roll once and the initial order persists across rounds and refresh', async ({
  page,
  browser,
  request,
}) => {
  const party = await createParty(request);
  const joined = await request.post('/api/rooms/join', {
    data: { code: party.gm.roomCode, nickname: 'Second hero' },
  });
  expect(joined.ok()).toBeTruthy();
  const secondCredential = (await joined.json()).data as Credential;
  const firstContext = await browser.newContext({ reducedMotion: 'reduce' });
  const secondContext = await browser.newContext({ reducedMotion: 'reduce' });
  const api = await connectMaster(party.gm);
  let startedEvents = 0;
  api.socket.on('combat:started', () => {
    startedEvents++;
  });
  try {
    await enterExpansion(page, party.gm);
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await enterExpansion(first, party.player);
    await enterExpansion(second, secondCredential);
    await api.socket.timeout(3000).emitWithAck('tile:paint', {
      panelId: api.snapshot.panel.id,
      tiles: [{ x: 4, y: 4, terrain: 'grass', blocked: false }],
    });
    await api.socket.timeout(3000).emitWithAck('monster:summon', {
      panelId: api.snapshot.panel.id,
      definitionId: 'dragon',
      x: 4,
      y: 4,
    });
    await page.getByRole('button', { name: 'Actions for Young Red Dragon' }).click();
    await page.getByRole('menuitem', { name: 'Enter Combat View' }).click();
    const arena = page.getByRole('dialog', { name: 'Combat arena' });
    await expect(arena.getByRole('status')).toHaveText('0 of 2 adventurers ready');
    expect(startedEvents).toBe(0);
    await secondContext.setOffline(true);
    await expect(second.getByTestId('connection-status')).toHaveText('Reconnecting');
    await expect(
      second.getByRole('button', { name: 'Roll initiative', exact: true }),
    ).toBeDisabled();
    await secondContext.setOffline(false);
    await expect(second.getByTestId('connection-status')).toHaveText('Connected');
    await expect(arena.getByRole('status')).toHaveText('0 of 2 adventurers ready');
    await first.getByRole('button', { name: 'Roll initiative', exact: true }).click();
    await expect(arena.getByRole('status')).toHaveText('1 of 2 adventurers ready');
    await expect(arena.getByRole('button', { name: 'Pass turn' })).toHaveCount(0);
    await expect(second.getByRole('button', { name: 'Basic attack', exact: true })).toHaveCount(0);
    expect(startedEvents).toBe(0);
    await first.reload();
    await expect(first.getByRole('heading', { name: 'Roll for initiative' })).toBeVisible();
    await expect(first.getByRole('button', { name: 'Roll initiative', exact: true })).toHaveCount(
      0,
    );
    await api.socket.timeout(3000).emitWithAck('dice:roll', {
      sides: 20,
      count: 1,
      modifier: 100,
      label: 'Initiative (Round 1)',
    });
    await expect(arena.getByRole('status')).toHaveText('1 of 2 adventurers ready');
    await second.getByRole('button', { name: 'Roll initiative', exact: true }).click();
    await expect(arena.locator('.combat-initiative')).toHaveCount(0);
    await expect.poll(() => startedEvents).toBe(1);
    await expect(arena.locator('.initiative-ribbon li')).toHaveCount(3);
    const order = await arena.locator('.initiative-ribbon li').allTextContents();
    for (let index = 0; index < 3; index++) {
      const active = await arena.locator('[aria-current="step"]').innerText();
      await arena.getByRole('button', { name: 'Pass turn' }).click();
      if (index < 2) await expect(arena.locator('[aria-current="step"]')).not.toHaveText(active);
    }
    await expect(arena.locator('.arena-header')).toContainText('Round 2');
    await expect(arena.locator('.combat-initiative')).toHaveCount(0);
    await expect(arena.locator('.initiative-ribbon li')).toHaveText(order);
    await first.reload();
    await expect(first.locator('.arena-header')).toContainText('Round 2');
    await expect(first.locator('.initiative-ribbon li')).toHaveText(order);
    await expect(first.getByRole('button', { name: 'Roll initiative', exact: true })).toHaveCount(
      0,
    );
    await arena.getByRole('button', { name: 'End combat' }).click();
    await expect(arena).not.toBeVisible();
  } finally {
    api.socket.disconnect();
    await firstContext.close();
    await secondContext.close();
  }
});
