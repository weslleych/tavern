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
