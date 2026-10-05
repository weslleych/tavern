import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { io } from 'socket.io-client';
import type { Credential, Snapshot } from '../../../src/types/game';
import { recordMapView, readMapView } from './map-view';

export async function createParty(request: APIRequestContext) {
  const created = await request.post('/api/rooms', {
    data: { name: 'Expansion', nickname: 'GM', template: 'woodland' },
  });
  expect(created.ok()).toBeTruthy();
  const gm = (await created.json()).data as Credential;
  const joined = await request.post('/api/rooms/join', {
    data: { code: gm.roomCode, nickname: 'Hero' },
  });
  expect(joined.ok()).toBeTruthy();
  return { gm, player: (await joined.json()).data as Credential };
}
export async function enterExpansion(page: Page, credential: Credential) {
  await page.addInitScript(recordMapView);
  await page.goto('/');
  await page.evaluate(
    (saved) =>
      localStorage.setItem(
        'tavern:tables:v1',
        JSON.stringify([{ ...saved, name: 'Expansion', lastVisited: new Date().toISOString() }]),
      ),
    credential,
  );
  await page.goto(`/room/${credential.roomCode}`);
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  if (credential.role === 'player') {
    await page.getByRole('radio', { name: 'No class', exact: true }).check();
    await page.getByRole('button', { name: 'Next: Appearance' }).click();
    await page.getByRole('button', { name: 'Enter tabletop' }).click();
  }
}
export async function clickTile(page: Page, x: number, y: number) {
  const view = await readMapView(page),
    bounds = await page.getByLabel('Map canvas').boundingBox();
  await page.mouse.click(
    bounds!.x + view.x + (x * 32 + 16) * view.zoom,
    bounds!.y + view.y + (y * 32 + 16) * view.zoom,
  );
}
export async function connectMaster(credential: Credential) {
  const socket = io('http://127.0.0.1:3100', {
    auth: credential,
    transports: ['websocket'],
    autoConnect: false,
  });
  const snapshot = new Promise<Snapshot>((resolve) => socket.once('room:snapshot', resolve));
  socket.connect();
  return { socket, snapshot: await snapshot };
}
