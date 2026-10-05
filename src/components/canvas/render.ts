import type { Terrain } from '../../types/game';

export function drawTile(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  x: number,
  y: number,
  size: number,
  seed = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  if (
    ![
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
    ].includes(terrain)
  ) {
    drawExtraTerrain(ctx, terrain, seed);
    ctx.restore();
    return;
  }
  const rect = (color: string, a: number, b: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(a, b, w, h);
  };
  const ground =
    terrain === 'empty'
      ? '#e2e8d9'
      : terrain === 'water'
        ? '#76b1ba'
        : terrain === 'stone'
          ? '#d4c19a'
          : '#96b77c';
  rect(ground, 0, 0, 16, 16);
  if (terrain === 'sand') {
    rect('#d5bd82', 0, 0, 16, 16);
    rect('#e8d59f', 2, 3, 5, 1);
    rect('#bfa56f', 10, 10, 3, 1);
    rect('#e8d59f', 4, 13, 2, 1);
  } else if (terrain === 'snow') {
    rect('#e2ebe7', 0, 0, 16, 16);
    rect('#c0d5d4', 2, 11, 4, 1);
    rect('#ffffff', 9, 3, 5, 1);
    rect('#c0d5d4', 12, 13, 2, 1);
  } else if (terrain === 'flowers') {
    rect('#315d44', 4, 9, 1, 3);
    rect('#315d44', 11, 5, 1, 3);
    rect('#be8d9c', 3, 7, 3, 2);
    rect('#efe4c8', 10, 3, 3, 2);
    rect('#c7a34d', 4, 8, 1, 1);
    rect('#c7a34d', 11, 4, 1, 1);
  } else if (terrain === 'empty') {
    rect('#d7dfcc', 7, 7, 2, 2);
  } else if (terrain === 'water') {
    rect('#6aa2af', 0, 8, 16, 3);
    rect('#a8d1cc', 2 + (seed % 4), 3, 5, 1);
    rect('#92c7c7', 9, 12, 4, 1);
  } else if (terrain === 'stone') {
    rect('#c4ae85', 2, 3, 3, 1);
    rect('#e4d4b0', 9, 10, 4, 2);
    rect('#bda780', 7, 6, 1, 1);
  } else {
    rect('#85a969', 2 + (seed % 3), 11, 2, 1);
    rect('#afd08c', 10, 4 + (seed % 4), 2, 1);
    if (terrain === 'forest') {
      rect('#789b61', 3, 13, 11, 2);
      rect('#66533b', 7, 11, 2, 4);
      rect('#315d44', 3, 8, 10, 4);
      rect('#376a4a', 4, 5, 8, 4);
      rect('#438055', 5, 2, 6, 5);
      rect('#589561', 6, 1, 3, 3);
      rect('#72a873', 5, 5, 2, 2);
      rect('#284d3c', 10, 9, 3, 3);
    }
    if (terrain === 'mountain') {
      rect('#738176', 1, 13, 14, 2);
      rect('#828b7f', 3, 10, 11, 3);
      rect('#959c8a', 4, 7, 9, 4);
      rect('#aab09c', 6, 4, 5, 4);
      rect('#e4e6ce', 7, 2, 3, 4);
      rect('#cfd6be', 6, 5, 5, 2);
      rect('#6c786e', 11, 10, 2, 3);
    }
    if (terrain === 'wall') {
      rect('#69695e', 0, 13, 16, 2);
      rect('#888779', 0, 3, 16, 10);
      rect('#b4b09d', 0, 2, 16, 2);
      rect('#575e54', 0, 7, 16, 1);
      rect('#575e54', 7, 4, 1, 3);
      rect('#575e54', 3, 8, 1, 5);
      rect('#575e54', 12, 8, 1, 5);
    }
  }
  ctx.restore();
}

function drawExtraTerrain(ctx: CanvasRenderingContext2D, terrain: Terrain, seed: number) {
  const r = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const wood = [
    'wood_floor',
    'wood_wall',
    'bookshelf',
    'wood_chair',
    'inn_bed',
    'stone_fireplace',
    'ornate_rug',
  ].includes(terrain);
  r(wood ? '#a2764c' : terrain.startsWith('dungeon') ? '#414a48' : '#92928a', 0, 0, 16, 16);
  if (terrain === 'snow_mountain' || terrain === 'sand_mountain') {
    const snow = terrain === 'snow_mountain';
    r(snow ? '#c1d7df' : '#d6b67c', 0, 0, 16, 16);
    for (let y = 2; y < 15; y++)
      r(snow ? '#839fae' : '#aa7352', Math.max(1, 8 - Math.floor(y / 2)), y, Math.min(14, y), 1);
    for (let y = 2; y < 14; y++)
      r(snow ? '#e9f4ed' : '#ead09b', 8 - Math.floor(y / 2), y, Math.floor(y / 2) + 1, 1);
    r(snow ? '#fff8e7' : '#f2d599', 7, 2, 2, 3);
    r(snow ? '#c8e2ea' : '#c78f5f', 10, 11, 3, 2);
    return;
  }
  if (['cobblestone', 'stone_pavement', 'dungeon_floor', 'dungeon_wall'].includes(terrain)) {
    const dark = terrain.startsWith('dungeon');
    for (let y = 0; y < 16; y += 4)
      for (let x = -2 + (y % 8); x < 16; x += 6) {
        r(dark ? '#28302f' : '#6c7068', x, y, 6, 4);
        r(dark ? '#4b5752' : '#b7b7a5', x + 1, y + 1, 4, 2);
        if ((x + y + seed) % 3 === 0) r(dark ? '#5a704d' : '#d3cbbb', x + 1, y + 2, 2, 1);
      }
    if (terrain === 'dungeon_wall') r('#202728', 0, 12, 16, 4);
    return;
  }
  if (['water_canal', 'lava_pool', 'acid_pool'].includes(terrain)) {
    const color =
      terrain === 'water_canal' ? '#477f9a' : terrain === 'lava_pool' ? '#c54e27' : '#789e35';
    r(color, 1, 1, 14, 14);
    for (let y = 2; y < 16; y += 4) {
      r(
        terrain === 'lava_pool' ? '#ffc15e' : terrain === 'acid_pool' ? '#c5e962' : '#91c6d0',
        ((y + seed) % 5) + 2,
        y,
        6,
        1,
      );
      r('#1e363750', 10, y + 1, 3, 1);
    }
    return;
  }
  if (terrain === 'dungeon_dirt') {
    r('#635a49', 0, 0, 16, 16);
    for (let i = 0; i < 9; i++)
      r(i % 2 ? '#827762' : '#444b40', (i * 7 + seed) % 16, (i * 3) % 16, 2, 1);
    return;
  }
  if (terrain === 'wood_floor' || terrain === 'wood_wall') {
    for (let x = 0; x < 16; x += 4) {
      r('#704c34', x, 0, 1, 16);
      r('#c49661', x + 1, 0, 1, 16);
      r('#6c4a35', x + 2, (x * 3 + seed) % 14, 2, 1);
    }
    if (terrain === 'wood_wall') r('#4b3c30', 0, 13, 16, 3);
    return;
  }
  if (terrain === 'iron_bars') {
    for (let x = 2; x < 16; x += 4) {
      r('#263439', x, 1, 2, 14);
      r('#a0a7a6', x, 1, 1, 14);
    }
    r('#303d43', 0, 4, 16, 2);
    r('#303d43', 0, 11, 16, 2);
    return;
  }
  if (terrain.startsWith('wooden_door')) {
    r('#252d2e', 2, 0, 12, 16);
    const open = terrain.endsWith('open');
    r('#735339', open ? 2 : 3, 1, open ? 3 : 10, 14);
    r('#bd9569', open ? 2 : 3, 2, open ? 2 : 9, 1);
    r('#8a9695', open ? 2 : 3, 5, open ? 3 : 10, 1);
    r('#8a9695', open ? 2 : 3, 11, open ? 3 : 10, 1);
    r('#d4b361', open ? 3 : 10, 8, 1, 2);
    return;
  }
  if (terrain === 'skeleton_remains') {
    r('#d9d9bd', 4, 3, 4, 4);
    r('#252d2e', 5, 4, 1, 1);
    r('#252d2e', 7, 4, 1, 1);
    r('#dddcc7', 7, 8, 5, 1);
    r('#bfbba2', 8, 7, 1, 5);
    r('#dddcc7', 3, 11, 4, 1);
    r('#dddcc7', 11, 10, 2, 4);
    return;
  }
  if (terrain === 'lamppost' || terrain === 'wall_torch' || terrain === 'stone_fireplace') {
    if (terrain === 'lamppost') {
      r('#e6bf6640', 1, 0, 14, 12);
      r('#343f43', 7, 4, 2, 11);
      r('#252e34', 5, 1, 6, 6);
      r('#ffd976', 6, 2, 4, 4);
      r('#343f43', 5, 14, 6, 1);
    } else if (terrain === 'stone_fireplace') {
      r('#554d45', 1, 1, 14, 14);
      r('#958774', 1, 1, 14, 3);
      r('#232b2e', 4, 5, 8, 9);
      r('#8b542d', 4, 12, 8, 2);
      r('#d56e34', 5, 8, 6, 4);
      r('#ffd976', 7, 9, 2, 3);
    } else {
      r('#443732', 7, 6, 2, 8);
      r('#8d7661', 5, 10, 6, 2);
      r('#dd742e', 5, 2, 6, 6);
      r('#ffd976', 7, 3, 2, 4);
    }
    return;
  }
  if (terrain === 'crates_barrels') {
    r('#583e29', 1, 5, 7, 10);
    r('#b0834e', 2, 6, 5, 8);
    r('#785539', 2, 8, 5, 1);
    r('#765037', 9, 2, 6, 12);
    r('#ae8051', 10, 3, 4, 10);
    r('#545751', 9, 5, 6, 2);
    r('#545751', 9, 10, 6, 2);
    return;
  }
  if (terrain === 'fountain' || terrain === 'water_well') {
    r('#686d64', 2, 8, 12, 6);
    r('#c3c5af', 1, 8, 14, 2);
    r('#5c8fa0', 4, 10, 8, 3);
    if (terrain === 'fountain') {
      r('#d0d0b7', 7, 3, 2, 8);
      r('#7abed0', 5, 3, 6, 2);
    } else {
      r('#69513b', 3, 1, 1, 8);
      r('#69513b', 12, 1, 1, 8);
      r('#b39258', 2, 1, 12, 2);
      r('#b39258', 9, 3, 1, 6);
    }
    return;
  }
  if (terrain.startsWith('treasure_chest')) {
    r('#3c342a', 2, 7, 12, 7);
    r('#a27840', 3, 8, 10, 5);
    r('#dab367', 3, 9, 1, 5);
    r('#dab367', 12, 9, 1, 5);
    r('#dab367', 7, 9, 2, 3);
    r(terrain.endsWith('open') ? '#5f422b' : '#b3894f', 2, terrain.endsWith('open') ? 2 : 5, 12, 3);
    return;
  }
  if (terrain === 'sacrificial_altar') {
    r('#292b2b', 1, 12, 14, 3);
    r('#58565b', 2, 5, 12, 8);
    r('#a59894', 1, 4, 14, 3);
    r('#944742', 5, 5, 5, 2);
    r('#dbbd7b', 7, 9, 2, 2);
    return;
  }
  if (terrain === 'ornate_rug') {
    r('#6b3435', 1, 1, 14, 14);
    r('#c4a05e', 2, 2, 12, 1);
    r('#c4a05e', 2, 13, 12, 1);
    r('#c4a05e', 2, 2, 1, 12);
    r('#c4a05e', 13, 2, 1, 12);
    r('#ad7551', 6, 6, 4, 4);
    return;
  }
  if (terrain === 'inn_bed') {
    r('#503b2c', 3, 1, 10, 14);
    r('#dfd7b7', 4, 2, 8, 4);
    r('#677e87', 4, 6, 8, 8);
    r('#aabea5', 4, 8, 8, 2);
    r('#bd9569', 3, 14, 10, 1);
    return;
  }
  if (terrain === 'bookshelf') {
    r('#493628', 2, 0, 12, 16);
    for (let y = 1; y < 16; y += 5) {
      for (let x = 3; x < 13; x += 2)
        r(['#58716d', '#9b5e50', '#b39460'][Math.floor((x + y) / 2) % 3], x, y, 1, 4);
      r('#b39161', 2, y + 4, 12, 1);
    }
    return;
  }
  if (terrain === 'wood_chair') {
    r('#694b33', 4, 2, 8, 7);
    r('#b68c59', 5, 3, 6, 5);
    r('#c09a66', 3, 9, 10, 3);
    r('#604932', 4, 12, 2, 3);
    r('#604932', 10, 12, 2, 3);
  }
}

export function drawStructure(
  ctx: CanvasRenderingContext2D,
  templateKey: string,
  x: number,
  y: number,
  cols: number,
  rows: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(2, 2);
  ctx.imageSmoothingEnabled = false;
  const w = cols * 16,
    h = rows * 16;
  const r = (color: string, a: number, b: number, c: number, d: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(a, b, c, d);
  };
  const building = (a: number, b: number, c: number, d: number) => {
    r('#453d35', a + 1, b + 3, c, d);
    r('#c2a271', a + 2, b + 5, c - 2, d - 4);
    r('#7e5142', a, b, c + 2, 5);
    r('#b27752', a + 2, b + 1, c - 2, 1);
    r('#705238', a + Math.floor(c / 2), b + 6, 1, d - 4);
    r('#a7c4bb', a + 3, b + 8, 3, 3);
  };
  if (templateKey === 'poi_dungeon') {
    for (let y = 3; y < h - 4; y += 3)
      r(
        y % 2 ? '#5a645d' : '#737e70',
        Math.max(3, 18 - Math.floor(y / 2)),
        y,
        Math.min(w - 5, 14 + y),
        4,
      );
    r('#1d2b2e', 14, 22, 20, 20);
    r('#364742', 12, 23, 2, 17);
    r('#364742', 34, 23, 2, 17);
    r('#73957b88', 12, 38, 25, 3);
    r('#56796c66', 6, 42, 36, 2);
  } else if (templateKey === 'poi_shrine') {
    r('#637b72', 5, 12, 38, 24);
    r('#9caaa0', 9, 9, 6, 25);
    r('#9caaa0', 33, 9, 6, 25);
    r('#c5cabb', 7, 6, 34, 6);
    r('#526760', 21, 14, 6, 25);
    r('#a6dcd0', 22, 15, 4, 18);
    for (let y = 17; y < 32; y += 4) r('#446d6a', 23, y, 2, 1);
    r('#c1b787', 14, 39, 20, 3);
  } else if (templateKey === 'poi_town' || templateKey === 'poi_castle') {
    r('#737c70', 3, 13, w - 6, h - 19);
    r('#a9ae96', 3, 13, w - 6, 3);
    r('#47594c', 6, 16, w - 12, h - 23);
    if (templateKey === 'poi_town') {
      building(8, 20, 11, 11);
      building(26, 20, 11, 11);
      building(17, 5, 13, 12);
    } else {
      r('#7f8b85', 13, 12, 22, 22);
      r('#b0b8a8', 13, 12, 22, 3);
      r('#626e68', 8, 5, 8, 25);
      r('#626e68', 32, 5, 8, 25);
      r('#b0b8a8', 7, 5, 10, 4);
      r('#b0b8a8', 31, 5, 10, 4);
      r('#6e4b3b', 12, 0, 1, 5);
      r('#ae4b43', 13, 0, 6, 3);
      r('#6e4b3b', 36, 0, 1, 5);
      r('#ae4b43', 37, 0, 6, 3);
    }
    for (let a = 3; a < w - 4; a += 6) {
      r('#c0c1a9', a, 11, 3, 3);
      r('#c0c1a9', a, h - 8, 3, 4);
    }
    r('#372e2b', 18, h - 14, 12, 13);
    r('#bd9461', 19, h - 15, 10, 2);
    r('#bbaa7d', 21, h - 4, 6, 4);
  } else if (templateKey === 'tavern_counter') {
    r('#553c2c', 2, 2, 28, 6);
    r('#ac8553', 2, 8, 28, 2);
    for (let a = 4; a < 29; a += 5) {
      r('#4b7662', a, 3, 2, 4);
      r('#c1aa70', a, 2, 1, 1);
    }
    r('#53372a', 2, 20, 28, 9);
    r('#ba8d55', 1, 18, 30, 4);
    r('#dfcda1', 5, 18, 2, 3);
    r('#868f80', 24, 15, 2, 6);
  } else if (templateKey === 'banquet_table') {
    r('#5b402a', 4, 5, 24, 23);
    r('#ad814b', 3, 3, 26, 23);
    r('#d0a46a', 4, 4, 24, 1);
    for (let b = 7; b < 24; b += 7) {
      r('#dfd3ad', 6, b, 5, 3);
      r('#dfd3ad', 21, b, 5, 3);
      r('#8c6040', 12, b, 2, 3);
    }
    r('#ad713b', 14, 13, 5, 6);
    r('#d1a65d', 15, 14, 3, 2);
  } else {
    building(3, 8, 25, 20);
    r('#d3a05d', 4, 3, 24, 5);
    r('#8c5745', 3, 6, 26, 5);
    r('#614c38', 14, 21, 5, 10);
    if (templateKey === 'tavern_exterior') {
      r('#4a3d2c', 26, 16, 5, 7);
      r('#e1c986', 27, 17, 3, 4);
      r('#c5bca1', 23, 2, 4, 8);
      r('#abb6a566', 22, 0, 6, 2);
    }
    if (templateKey === 'blacksmith_shop') {
      r('#39372f', 5, 19, 9, 10);
      r('#df6d34', 6, 23, 7, 4);
      r('#fad67c', 8, 24, 3, 2);
      r('#727c77', 20, 24, 8, 2);
      r('#4b5653', 22, 26, 4, 3);
    }
  }
  ctx.restore();
}
