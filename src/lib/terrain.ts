import type { Grid, Terrain, Tile } from '../types/game';

export const terrainInfo: Record<Terrain, { label: string; color: string; shortcut: string }> = {
  empty: { label: 'Erase', color: '#e9eee1', shortcut: '1' },
  grass: { label: 'Grass', color: '#91b875', shortcut: '2' },
  forest: { label: 'Forest', color: '#3d7354', shortcut: '3' },
  water: { label: 'Water', color: '#68a8b5', shortcut: '4' },
  mountain: { label: 'Mountain', color: '#959b8d', shortcut: '5' },
  stone: { label: 'Path', color: '#d2bd91', shortcut: '6' },
  wall: { label: 'Wall', color: '#8a8274', shortcut: '7' },
};

export function woodland(grid: Grid): Tile[] {
  const tiles: Tile[] = [];
  const middle = Math.floor(grid.rows / 2);
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const river = Math.round(grid.cols * 0.68 + Math.sin(y / 3) * 1.5);
      const seed = (x * 17 + y * 31 + x * y * 3) % 23;
      let terrain: Terrain = 'grass';
      if (x >= river && x <= river + 1) terrain = 'water';
      else if (y === middle || (y === middle - 1 && x < grid.cols / 2)) terrain = 'stone';
      else if ((x < 5 || y < 4 || y > grid.rows - 4 || x > grid.cols - 4) && seed < 15)
        terrain = 'forest';
      else if (x > grid.cols - 6 && y < 5 && seed < 12) terrain = 'mountain';
      else if (seed === 1 && Math.abs(y - middle) > 2) terrain = 'forest';
      if (terrain === 'water' && y === middle) terrain = 'stone';
      tiles.push({ x, y, terrain, blocked: ['water', 'forest', 'mountain'].includes(terrain) });
    }
  }
  return tiles;
}
