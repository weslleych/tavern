import type { Grid, Terrain, Tile, TerrainCategory, MultiTileDimension } from '../types/game';

export const terrainInfo: Record<Terrain, { label: string; color: string; shortcut: string }> = {
  empty: { label: 'Erase', color: '#e9eee1', shortcut: '1' },
  grass: { label: 'Grass', color: '#91b875', shortcut: '2' },
  forest: { label: 'Forest', color: '#3d7354', shortcut: '3' },
  water: { label: 'Water', color: '#68a8b5', shortcut: '4' },
  mountain: { label: 'Mountain', color: '#959b8d', shortcut: '5' },
  stone: { label: 'Path', color: '#d2bd91', shortcut: '6' },
  wall: { label: 'Wall', color: '#8a8274', shortcut: '7' },
  sand: { label: 'Sand', color: '#d5bd82', shortcut: '8' },
  snow: { label: 'Snow', color: '#e2ebe7', shortcut: '9' },
  flowers: { label: 'Flowers', color: '#96b77c', shortcut: '0' },
  ...(Object.fromEntries(
    [
      'snow_mountain',
      'sand_mountain',
      'cobblestone',
      'stone_pavement',
      'water_canal',
      'dungeon_floor',
      'dungeon_dirt',
      'lava_pool',
      'acid_pool',
      'dungeon_wall',
      'iron_bars',
      'wooden_door_closed',
      'wooden_door_open',
      'skeleton_remains',
      'wall_torch',
      'treasure_chest',
      'treasure_chest_open',
      'sacrificial_altar',
      'lamppost',
      'crates_barrels',
      'fountain',
      'water_well',
      'wood_floor',
      'wood_wall',
      'ornate_rug',
      'stone_fireplace',
      'inn_bed',
      'bookshelf',
      'wood_chair',
    ].map((key) => [key, { label: key.replaceAll('_', ' '), color: '#84715d', shortcut: '' }]),
  ) as Record<
    Exclude<
      Terrain,
      | 'empty'
      | 'grass'
      | 'forest'
      | 'water'
      | 'mountain'
      | 'stone'
      | 'wall'
      | 'sand'
      | 'snow'
      | 'flowers'
    >,
    { label: string; color: string; shortcut: string }
  >),
};

export const terrainCategories: Record<TerrainCategory, Terrain[]> = {
  world: [
    'empty',
    'grass',
    'forest',
    'water',
    'mountain',
    'stone',
    'wall',
    'sand',
    'snow',
    'flowers',
    'snow_mountain',
    'sand_mountain',
  ],
  city: [
    'empty',
    'cobblestone',
    'stone_pavement',
    'water_canal',
    'lamppost',
    'crates_barrels',
    'fountain',
    'water_well',
  ],
  dungeon: [
    'empty',
    'dungeon_floor',
    'dungeon_dirt',
    'lava_pool',
    'acid_pool',
    'dungeon_wall',
    'iron_bars',
    'wooden_door_closed',
    'wooden_door_open',
    'skeleton_remains',
    'wall_torch',
    'treasure_chest',
    'treasure_chest_open',
    'sacrificial_altar',
  ],
  interior: [
    'empty',
    'wood_floor',
    'wood_wall',
    'ornate_rug',
    'stone_fireplace',
    'inn_bed',
    'bookshelf',
    'wood_chair',
  ],
};
export const blockedTerrains = new Set<Terrain>([
  'forest',
  'water',
  'mountain',
  'wall',
  'snow_mountain',
  'sand_mountain',
  'water_canal',
  'lava_pool',
  'acid_pool',
  'dungeon_wall',
  'iron_bars',
  'wooden_door_closed',
  'wood_wall',
  'lamppost',
  'crates_barrels',
  'fountain',
  'water_well',
  'treasure_chest',
  'sacrificial_altar',
  'stone_fireplace',
  'inn_bed',
  'bookshelf',
]);
export interface StructureTemplate extends MultiTileDimension {
  key: string;
  category: TerrainCategory;
  terrain: Terrain;
  entranceOffset: { dx: number; dy: number };
  poi: boolean;
}
export const structureTemplates: StructureTemplate[] = [
  ...['town', 'dungeon', 'castle', 'shrine'].map((kind) => ({
    key: `poi_${kind}`,
    category: 'world' as const,
    cols: 3,
    rows: 3,
    terrain: 'cobblestone' as const,
    entranceOffset: { dx: 1, dy: 2 },
    poi: true,
  })),
  ...['house_timber', 'tavern_exterior', 'blacksmith_shop'].map((key) => ({
    key,
    category: 'city' as const,
    cols: 2,
    rows: 2,
    terrain: 'cobblestone' as const,
    entranceOffset: { dx: 0, dy: 1 },
    poi: false,
  })),
  ...['tavern_counter', 'banquet_table'].map((key) => ({
    key,
    category: 'interior' as const,
    cols: 2,
    rows: 2,
    terrain: 'wood_floor' as const,
    entranceOffset: { dx: 0, dy: 1 },
    poi: false,
  })),
];
export function sceneTemplate(kind: 'town' | 'dungeon', grid: Grid): Tile[] {
  return Array.from({ length: grid.cols * grid.rows }, (_, index) => {
    const x = index % grid.cols,
      y = Math.floor(index / grid.cols);
    const edge = x === 0 || y === 0 || x === grid.cols - 1 || y === grid.rows - 1;
    return {
      x,
      y,
      terrain: edge
        ? kind === 'town'
          ? 'wall'
          : 'dungeon_wall'
        : kind === 'town'
          ? 'cobblestone'
          : 'dungeon_floor',
      blocked: edge,
    };
  });
}

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
