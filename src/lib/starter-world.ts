import type { Grid, Terrain, Tile } from '../types/game';
import { blockedTerrains } from './terrain';

type SceneKey = 'world' | 'town' | 'tavern' | 'dungeon' | 'castle' | 'shrine';
type Point = { x: number; y: number };
export interface StarterScene {
  key: SceneKey;
  name: string;
  grid: Grid;
  spawnPoint: Point;
  tiles: Tile[];
  structures: { templateKey: string; x: number; y: number; name?: string; target?: SceneKey }[];
  monsters: { definitionId: string; x: number; y: number }[];
}

export const starterWorldGrid: Grid = { cols: 40, rows: 40, tileSize: 32 };

function canvas(
  key: SceneKey,
  name: string,
  cols: number,
  rows: number,
  terrain: Terrain,
  spawnPoint: Point,
) {
  const scene: StarterScene = {
    key,
    name,
    grid: { cols, rows, tileSize: 32 },
    spawnPoint,
    tiles: Array.from({ length: cols * rows }, (_, i) => ({
      x: i % cols,
      y: Math.floor(i / cols),
      terrain,
      blocked: blockedTerrains.has(terrain),
    })),
    structures: [],
    monsters: [],
  };
  function paint(x: number, y: number, terrain: Terrain) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    scene.tiles[y * cols + x] = { x, y, terrain, blocked: blockedTerrains.has(terrain) };
  }
  function rect(x: number, y: number, width: number, height: number, terrain: Terrain) {
    for (let dy = 0; dy < height; dy++)
      for (let dx = 0; dx < width; dx++) paint(x + dx, y + dy, terrain);
  }
  // Paths follow orthogonal waypoints, so every bend permits one-tile player movement.
  function path(points: Point[], terrain: Terrain = 'stone', width = 1) {
    for (let i = 1; i < points.length; i++) {
      let { x, y } = points[i - 1];
      const destination = points[i];
      rect(x, y, width, width, terrain);
      while (x !== destination.x || y !== destination.y) {
        if (x !== destination.x) x += Math.sign(destination.x - x);
        else y += Math.sign(destination.y - y);
        rect(x, y, width, width, terrain);
      }
    }
  }
  function structure(templateKey: string, x: number, y: number, target?: SceneKey, name?: string) {
    scene.structures.push({ templateKey, x, y, target, name });
  }
  function border(terrain: Terrain) {
    rect(0, 0, cols, 1, terrain);
    rect(0, rows - 1, cols, 1, terrain);
    rect(0, 0, 1, rows, terrain);
    rect(cols - 1, 0, 1, rows, terrain);
  }
  return { scene, paint, rect, path, structure, border };
}

export function starterWorld(): StarterScene {
  const map = canvas('world', 'Verdant Reach', 40, 40, 'grass', { x: 16, y: 23 });
  const { paint, path, structure } = map;
  for (let y = 0; y < 40; y++) {
    const river = Math.round(22 + Math.sin(y / 5) * 2);
    for (let x = 0; x < 40; x++) {
      const variation = (x * 17 + y * 31 + x * y * 3) % 29;
      let terrain: Terrain = 'grass';
      if (y < 10 && x < 23) terrain = 'snow';
      if (y < 5 && x < 23 && variation < 20) terrain = 'snow_mountain';
      if (x > 27 && y < 23) terrain = 'sand';
      if (x > 34 && y < 20 && variation < 18) terrain = 'sand_mountain';
      if ((x < 4 || (y > 30 && x < 19) || (x < 15 && y > 10 && y < 18)) && variation < 23)
        terrain = 'forest';
      if (x > 27 && y > 26 && variation < 7) terrain = 'forest';
      if (terrain === 'grass' && variation < 4) terrain = 'flowers';
      if (x >= river && x <= river + 1) terrain = 'water';
      if (x > 35 && y > 27) terrain = x === 36 ? 'sand' : 'water';
      paint(x, y, terrain);
    }
  }
  // Broad crossroads and bridges join all four southern landmark entrances.
  path(
    [
      { x: 7, y: 22 },
      { x: 32, y: 22 },
    ],
    'stone',
    2,
  );
  path(
    [
      { x: 16, y: 9 },
      { x: 16, y: 32 },
    ],
    'stone',
    2,
  );
  path(
    [
      { x: 32, y: 13 },
      { x: 32, y: 32 },
      { x: 16, y: 32 },
    ],
    'stone',
    2,
  );
  map.rect(13, 21, 7, 5, 'stone');
  map.rect(7, 21, 4, 3, 'stone');
  map.rect(15, 8, 4, 3, 'stone');
  map.rect(31, 12, 4, 3, 'stone');
  map.rect(30, 31, 4, 3, 'stone');
  structure('poi_town', 7, 19, 'town', 'Willowbrook');
  structure('poi_dungeon', 31, 10, 'dungeon', 'Emberdeep Caverns');
  structure('poi_castle', 15, 6, 'castle', 'Frostwatch Keep');
  structure('poi_shrine', 30, 29, 'shrine', 'Moonwell Shrine');
  return map.scene;
}

function town(): StarterScene {
  const map = canvas('town', 'Willowbrook', 28, 28, 'grass', { x: 14, y: 23 });
  const { rect, paint, path, structure } = map;
  map.border('wall');
  rect(2, 2, 24, 24, 'cobblestone');
  rect(2, 8, 24, 2, 'water_canal');
  path(
    [
      { x: 13, y: 2 },
      { x: 13, y: 25 },
    ],
    'stone_pavement',
    2,
  );
  path(
    [
      { x: 2, y: 15 },
      { x: 25, y: 15 },
    ],
    'stone_pavement',
    2,
  );
  rect(10, 11, 8, 7, 'stone_pavement');
  paint(14, 12, 'fountain');
  paint(10, 12, 'water_well');
  for (const [x, y] of [
    [3, 3],
    [8, 3],
    [18, 3],
    [23, 3],
    [3, 11],
    [23, 11],
  ])
    structure('house_timber', x, y);
  structure('blacksmith_shop', 18, 11);
  structure('tavern_exterior', 21, 14);
  for (const [x, y] of [
    [6, 6],
    [11, 6],
    [16, 6],
    [21, 6],
    [8, 18],
    [18, 18],
  ])
    paint(x, y, 'lamppost');
  for (const [x, y] of [
    [4, 18],
    [5, 18],
    [19, 13],
    [24, 18],
  ])
    paint(x, y, 'crates_barrels');
  rect(8, 20, 3, 3, 'flowers');
  rect(17, 21, 3, 3, 'flowers');
  path(
    [
      { x: 4, y: 24 },
      { x: 14, y: 24 },
    ],
    'stone_pavement',
  );
  path(
    [
      { x: 22, y: 20 },
      { x: 14, y: 20 },
    ],
    'stone_pavement',
  );
  structure('poi_town', 3, 21, 'world', 'Verdant Reach');
  structure('poi_town', 21, 17, 'tavern', 'The Lantern Tavern');
  return map.scene;
}

function tavern(): StarterScene {
  const map = canvas('tavern', 'The Lantern Tavern', 24, 24, 'cobblestone', { x: 12, y: 20 });
  const { rect, paint, structure } = map;
  map.border('wall');
  rect(2, 2, 20, 16, 'wood_wall');
  rect(3, 3, 18, 14, 'wood_floor');
  rect(11, 16, 2, 3, 'wood_floor');
  rect(10, 10, 4, 6, 'ornate_rug');
  structure('tavern_counter', 5, 4);
  structure('tavern_counter', 7, 4);
  structure('banquet_table', 5, 9);
  structure('banquet_table', 16, 9);
  for (const [x, y] of [
    [4, 9],
    [4, 10],
    [7, 9],
    [7, 10],
    [15, 9],
    [15, 10],
    [18, 9],
    [18, 10],
  ])
    paint(x, y, 'wood_chair');
  paint(12, 3, 'stone_fireplace');
  paint(4, 3, 'bookshelf');
  paint(19, 3, 'bookshelf');
  rect(16, 4, 1, 3, 'wood_wall');
  paint(18, 5, 'inn_bed');
  paint(20, 5, 'inn_bed');
  paint(19, 7, 'ornate_rug');
  paint(4, 6, 'crates_barrels');
  paint(5, 6, 'crates_barrels');
  paint(18, 20, 'water_well');
  rect(18, 21, 3, 1, 'flowers');
  structure('poi_town', 2, 19, 'town', 'Willowbrook');
  return map.scene;
}

function dungeon(): StarterScene {
  const map = canvas('dungeon', 'Emberdeep Caverns', 32, 28, 'dungeon_wall', { x: 5, y: 22 });
  const { rect, paint, path, structure } = map;
  rect(1, 20, 9, 7, 'dungeon_floor');
  rect(2, 10, 9, 8, 'dungeon_dirt');
  rect(13, 8, 8, 10, 'dungeon_floor');
  rect(23, 2, 8, 10, 'dungeon_floor');
  path(
    [
      { x: 6, y: 23 },
      { x: 6, y: 13 },
      { x: 17, y: 13 },
      { x: 17, y: 6 },
      { x: 26, y: 6 },
    ],
    'dungeon_floor',
    2,
  );
  rect(24, 3, 2, 2, 'lava_pool');
  rect(28, 8, 2, 2, 'lava_pool');
  rect(3, 11, 2, 2, 'acid_pool');
  rect(14, 9, 2, 1, 'iron_bars');
  paint(16, 9, 'wooden_door_open');
  for (const [x, y] of [
    [2, 20],
    [9, 20],
    [3, 16],
    [10, 11],
    [13, 12],
    [20, 16],
    [23, 3],
    [30, 6],
  ])
    paint(x, y, 'wall_torch');
  for (const [x, y] of [
    [4, 15],
    [15, 16],
    [28, 5],
  ])
    paint(x, y, 'skeleton_remains');
  paint(19, 9, 'treasure_chest');
  paint(29, 3, 'treasure_chest');
  paint(27, 3, 'sacrificial_altar');
  structure('poi_dungeon', 2, 23, 'world', 'Verdant Reach');
  map.scene.monsters.push(
    { definitionId: 'bat', x: 5, y: 12 },
    { definitionId: 'skeleton', x: 18, y: 11 },
    { definitionId: 'slime', x: 27, y: 7 },
  );
  return map.scene;
}

function castle(): StarterScene {
  const map = canvas('castle', 'Frostwatch Keep', 24, 24, 'stone_pavement', { x: 12, y: 20 });
  const { rect, paint, structure } = map;
  map.border('wall');
  rect(3, 2, 18, 12, 'wall');
  rect(4, 3, 16, 10, 'wood_floor');
  rect(11, 5, 2, 10, 'ornate_rug');
  rect(11, 13, 2, 2, 'stone_pavement');
  paint(11, 4, 'wood_chair');
  paint(12, 4, 'wood_chair');
  paint(5, 3, 'bookshelf');
  paint(18, 3, 'bookshelf');
  paint(8, 3, 'stone_fireplace');
  structure('banquet_table', 6, 8);
  structure('banquet_table', 16, 8);
  rect(5, 15, 4, 2, 'flowers');
  rect(16, 15, 4, 2, 'flowers');
  paint(7, 16, 'fountain');
  paint(18, 16, 'fountain');
  for (const [x, y] of [
    [3, 15],
    [20, 15],
    [9, 19],
    [15, 19],
  ])
    paint(x, y, 'lamppost');
  rect(18, 19, 3, 3, 'snow');
  paint(20, 20, 'snow_mountain');
  structure('poi_castle', 3, 18, 'world', 'Verdant Reach');
  return map.scene;
}

function shrine(): StarterScene {
  const map = canvas('shrine', 'Moonwell Shrine', 24, 24, 'grass', { x: 12, y: 20 });
  const { rect, paint, path, structure } = map;
  map.border('forest');
  for (let y = 2; y < 22; y++) {
    for (let x = 2; x < 22; x++) {
      const distance = Math.hypot(x - 12, y - 10);
      if (distance < 8) paint(x, y, 'flowers');
      if (distance > 6 && distance < 8) paint(x, y, 'stone_pavement');
      if (distance < 3) paint(x, y, 'water');
      if (distance > 9 && (x * 3 + y * 7) % 11 < 3) paint(x, y, 'forest');
    }
  }
  path(
    [
      { x: 12, y: 21 },
      { x: 12, y: 10 },
    ],
    'stone_pavement',
    2,
  );
  rect(11, 9, 3, 3, 'stone_pavement');
  paint(12, 9, 'sacrificial_altar');
  for (const [x, y] of [
    [8, 6],
    [16, 6],
    [8, 14],
    [16, 14],
  ])
    paint(x, y, 'mountain');
  for (const [x, y] of [
    [10, 15],
    [15, 15],
  ])
    paint(x, y, 'wall_torch');
  paint(17, 10, 'treasure_chest');
  path(
    [
      { x: 4, y: 21 },
      { x: 12, y: 21 },
    ],
    'stone_pavement',
  );
  rect(3, 18, 4, 4, 'stone_pavement');
  structure('poi_shrine', 3, 18, 'world', 'Verdant Reach');
  return map.scene;
}

export function starterScenes(): StarterScene[] {
  return [starterWorld(), town(), tavern(), dungeon(), castle(), shrine()];
}
