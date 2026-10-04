import type { CharacterAppearance, Panel, PlayerToken } from '../types/game';

export const skinColors = [
  '#fcd0a1',
  '#f5bc8c',
  '#e8a773',
  '#c78351',
  '#9b5a32',
  '#69381e',
  '#dfc9b8',
  '#8a998c',
] as const;
export const dyeColors = [
  '#69381e',
  '#342c2b',
  '#a56842',
  '#d5ad62',
  '#efe4c8',
  '#9c504c',
  '#bd744b',
  '#c7a34d',
  '#315d44',
  '#7e9560',
  '#344f70',
  '#688f9b',
  '#796080',
  '#be8d9c',
  '#343d46',
  '#b7b8a5',
] as const;
export const pantsColors = [
  '#343d46',
  '#344f70',
  '#69381e',
  '#342c2b',
  '#a56842',
  '#efe4c8',
  '#315d44',
  '#7e9560',
  '#796080',
  '#9c504c',
  '#b7b8a5',
  '#688f9b',
] as const;
export const hairStyles = [
  'Short',
  'Parted',
  'Messy',
  'Ponytail',
  'Braids',
  'Mohawk',
  'Bald',
  'Long',
  'Curly',
  'Side swept',
] as const;
export const shirtStyles = [
  'Tunic',
  'Crewneck',
  'Vest',
  'Suspenders',
  'Robe',
  'Stripes',
  'Jacket',
  'Scarf',
] as const;
export const defaultAppearance: CharacterAppearance = {
  skinColor: skinColors[0],
  hairStyle: 0,
  hairColor: dyeColors[0],
  shirtStyle: 0,
  shirtColor: dyeColors[8],
  pantsColor: pantsColors[0],
};

export const cellKey = (cell: { x: number; y: number }) => `${cell.x},${cell.y}`;
export function walkable(panel: Panel, cell: { x: number; y: number }): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x >= panel.grid.cols || cell.y >= panel.grid.rows)
    return false;
  const tile = panel.tiles.find((tile) => tile.x === cell.x && tile.y === cell.y);
  return !!tile && tile.terrain !== 'empty' && !tile.blocked;
}
export function firstFreeTile(panel: Panel, occupied: Set<string>): PlayerToken | undefined {
  const tiles = new Map(panel.tiles.map((tile) => [cellKey(tile), tile]));
  let best: PlayerToken | undefined;
  let distance = Infinity;
  for (let y = 0; y < panel.grid.rows; y++)
    for (let x = 0; x < panel.grid.cols; x++) {
      const tile = tiles.get(`${x},${y}`);
      if (tile && tile.terrain !== 'empty' && !tile.blocked && !occupied.has(`${x},${y}`)) {
        if (!panel.spawnPoint) return { x, y, panelId: panel.id };
        const candidate = Math.abs(x - panel.spawnPoint.x) + Math.abs(y - panel.spawnPoint.y);
        if (candidate < distance) {
          distance = candidate;
          best = { x, y, panelId: panel.id };
        }
      }
    }
  return best;
}
