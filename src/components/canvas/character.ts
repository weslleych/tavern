import type { CharacterAppearance } from '../../types/game';

// Original modular 16 × 16 art, shared by portraits, the creator, and tokens.
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  appearance: CharacterAppearance,
  x: number,
  y: number,
  size: number,
  direction: 'down' | 'up' | 'left' | 'right' = 'down',
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  ctx.imageSmoothingEnabled = false;
  const rect = (color: string, a: number, b: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(a, b, w, h);
  };
  rect('#263c3030', 3, 14, 10, 2);
  rect('#263c30', 5, 13, 3, 2);
  rect('#263c30', 9, 13, 3, 2);
  rect(appearance.pantsColor, 5, 10, 3, 4);
  rect(appearance.pantsColor, 9, 10, 3, 4);
  rect(appearance.shirtColor, 4, 7, 9, 5);
  rect(appearance.skinColor, 3, 8, 2, 3);
  rect(appearance.skinColor, 12, 8, 2, 3);
  const accent = '#efe4c8';
  switch (appearance.shirtStyle) {
    case 0:
      rect('#69381e', 4, 10, 9, 1);
      rect('#c7a34d', 8, 10, 1, 1);
      break;
    case 1:
      rect(accent, 7, 7, 3, 1);
      break;
    case 2:
      rect('#342c2b', 5, 7, 2, 5);
      rect('#342c2b', 10, 7, 2, 5);
      break;
    case 3:
      rect('#69381e', 6, 7, 1, 5);
      rect('#69381e', 10, 7, 1, 5);
      break;
    case 4:
      rect(appearance.shirtColor, 4, 11, 9, 3);
      rect(accent, 8, 7, 1, 7);
      break;
    case 5:
      rect(accent, 5, 8, 7, 1);
      rect(accent, 5, 10, 7, 1);
      break;
    case 6:
      rect('#342c2b', 8, 7, 1, 5);
      rect(accent, 9, 8, 1, 1);
      break;
    case 7:
      rect('#c7a34d', 5, 7, 7, 1);
      rect('#c7a34d', 10, 8, 2, 3);
      break;
  }
  rect('#342c2b', 5, 2, 7, 6);
  rect(appearance.skinColor, 5, 3, 7, 4);
  rect(appearance.skinColor, 4, 4, 1, 2);
  rect(appearance.skinColor, 12, 4, 1, 2);
  if (direction !== 'up') {
    const offset = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    rect('#263c30', 6 + offset, 5, 1, 1);
    rect('#263c30', 10 + offset, 5, 1, 1);
    rect('#a56842', 8 + offset, 6, 1, 1);
  }
  const hair = appearance.hairColor;
  if (appearance.hairStyle !== 6) {
    rect(hair, 5, 1, 7, 2);
    switch (appearance.hairStyle) {
      case 0:
        rect(hair, 5, 3, 2, 1);
        rect(hair, 11, 3, 1, 1);
        break;
      case 1:
        rect(hair, 5, 3, 3, 1);
        rect(hair, 10, 3, 2, 1);
        break;
      case 2:
        rect(hair, 4, 2, 2, 2);
        rect(hair, 7, 0, 2, 1);
        rect(hair, 10, 3, 3, 1);
        break;
      case 3:
        rect(hair, 12, 2, 2, 5);
        rect(hair, 13, 7, 1, 2);
        break;
      case 4:
        rect(hair, 4, 3, 1, 6);
        rect(hair, 12, 3, 1, 6);
        rect('#c7a34d', 4, 8, 1, 1);
        rect('#c7a34d', 12, 8, 1, 1);
        break;
      case 5:
        rect(appearance.skinColor, 5, 1, 7, 2);
        rect(hair, 7, 0, 3, 4);
        break;
      case 7:
        rect(hair, 4, 2, 1, 7);
        rect(hair, 12, 2, 1, 7);
        break;
      case 8:
        rect(hair, 4, 1, 2, 3);
        rect(hair, 11, 1, 2, 3);
        rect(hair, 6, 0, 5, 1);
        break;
      case 9:
        rect(hair, 5, 3, 5, 1);
        rect(hair, 5, 4, 3, 1);
        break;
    }
    if (direction === 'up') rect(hair, 5, 3, 7, 4);
  }
  ctx.restore();
}
