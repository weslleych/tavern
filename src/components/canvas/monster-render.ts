import type { PublicMonster } from '../../types/game';

export function drawMonsterSprite(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  size: number,
  image?: HTMLImageElement,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  ctx.imageSmoothingEnabled = false;
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, 0, 0, 16, 16);
    ctx.restore();
    return;
  }
  const r = (color: string, a: number, b: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(a, b, w, h);
  };
  if (sprite === 'bat') {
    r('#383040', 1, 4, 14, 7);
    r('#633448', 2, 5, 4, 3);
    r('#633448', 10, 5, 4, 3);
    r('#251f30', 6, 3, 4, 10);
    r('#da6c56', 6, 6, 1, 1);
    r('#da6c56', 9, 6, 1, 1);
  } else if (sprite === 'slime') {
    r('#345746', 2, 10, 12, 4);
    r('#72b073', 3, 7, 10, 6);
    r('#a4ce79', 5, 5, 6, 4);
    r('#cee298', 5, 7, 2, 1);
    r('#27453e', 6, 10, 1, 1);
    r('#27453e', 9, 10, 1, 1);
  } else if (sprite === 'spider') {
    for (let y = 5; y <= 11; y += 3) {
      r('#493d46', 1, y, 4, 1);
      r('#493d46', 11, y, 4, 1);
      r('#493d46', y === 5 ? 1 : 0, y + 1, 1, 2);
      r('#493d46', y === 5 ? 14 : 15, y + 1, 1, 2);
    }
    r('#2c2935', 5, 4, 6, 8);
    r('#bd4848', 6, 8, 1, 1);
    r('#bd4848', 9, 8, 1, 1);
    r('#d9d3b1', 6, 11, 1, 2);
    r('#d9d3b1', 9, 11, 1, 2);
  } else if (sprite === 'dragon') {
    r('#824437', 1, 3, 14, 8);
    r('#c6764c', 2, 4, 4, 4);
    r('#c6764c', 10, 4, 4, 4);
    r('#9f463a', 5, 3, 6, 11);
    r('#dda967', 6, 2, 1, 3);
    r('#dda967', 9, 2, 1, 3);
    r('#ffd66f', 6, 6, 1, 1);
    r('#ffd66f', 9, 6, 1, 1);
    r('#d39152', 7, 9, 2, 4);
    r('#713d33', 3, 13, 3, 2);
    r('#713d33', 10, 13, 3, 2);
  } else {
    const skeleton = sprite === 'skeleton',
      goblin = sprite === 'goblin',
      zombie = sprite === 'zombie';
    const skin = skeleton ? '#d2cfb3' : goblin ? '#7aa35e' : zombie ? '#94a281' : '#c9a17a';
    r(skin, 5, 3, 6, 6);
    if (goblin) {
      r(skin, 3, 3, 2, 3);
      r(skin, 11, 3, 2, 3);
    }
    r('#2d3334', 6, 5, 1, 1);
    r('#2d3334', 9, 5, 1, 1);
    r(skeleton ? '#b2b29d' : zombie ? '#66695a' : goblin ? '#795c3b' : '#5d6067', 5, 9, 6, 5);
    r(skin, 3, 9, 2, 4);
    r(skin, 11, 9, 2, 4);
    r('#3c3e3c', 5, 14, 2, 2);
    r('#3c3e3c', 9, 14, 2, 2);
    if (skeleton) {
      r('#333a3a', 6, 10, 4, 1);
      r('#333a3a', 6, 12, 4, 1);
      r('#8d938c', 13, 5, 1, 8);
    }
    if (sprite === 'bandit') {
      r('#34373e', 4, 1, 8, 3);
      r('#34373e', 4, 4, 1, 4);
      r('#34373e', 11, 4, 1, 4);
      r('#9faaaa', 2, 8, 1, 5);
    }
    if (zombie) {
      r('#4f6951', 5, 4, 2, 2);
      r('#986956', 9, 8, 2, 2);
    }
  }
  ctx.restore();
}
export function drawMonster(
  ctx: CanvasRenderingContext2D,
  monster: PublicMonster,
  image?: HTMLImageElement,
) {
  const x = monster.x * 32,
    y = monster.y * 32;
  ctx.save();
  ctx.globalAlpha = monster.defeated ? 0.5 : 1;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 1);
  ctx.lineTo(x + 30, y + 8);
  ctx.lineTo(x + 30, y + 24);
  ctx.lineTo(x + 16, y + 31);
  ctx.lineTo(x + 2, y + 24);
  ctx.lineTo(x + 2, y + 8);
  ctx.closePath();
  ctx.stroke();
  drawMonsterSprite(ctx, monster.sprite, x + 2, y + 2, 28, image);
  if (monster.defeated) {
    ctx.fillStyle = '#f1e5c8';
    ctx.fillRect(x + 11, y + 11, 10, 7);
    ctx.fillStyle = '#242b30';
    ctx.fillRect(x + 13, y + 13, 2, 2);
    ctx.fillRect(x + 17, y + 13, 2, 2);
    ctx.fillStyle = '#f1e5c8';
    ctx.fillRect(x + 13, y + 18, 6, 3);
  }
  const ratio =
    monster.healthRatio ??
    (monster.currentHp !== undefined && monster.maxHp
      ? monster.currentHp / monster.maxHp
      : undefined);
  if (ratio !== undefined) {
    ctx.fillStyle = '#242b30';
    ctx.fillRect(x + 3, y - 7, 26, 5);
    ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio >= 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(x + 4, y - 6, 24 * ratio, 3);
  }
  if (monster.currentHp !== undefined) {
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${monster.currentHp}/${monster.maxHp}`, x + 16, y - 10);
  }
  ctx.restore();
}
