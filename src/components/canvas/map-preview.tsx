'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { woodland } from '../../lib/terrain';
import { drawTile } from './render';

export function MapPreview() {
  const t = useTranslations();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    for (const tile of woodland({ cols: 26, rows: 18, tileSize: 32 })) {
      drawTile(ctx, tile.terrain, tile.x * 32, tile.y * 32, 32, tile.x + tile.y);
    }
    // Original little campsite, drawn on the preview only.
    ctx.fillStyle = '#6b634b';
    ctx.fillRect(290, 289, 52, 9);
    ctx.fillStyle = '#d6a36b';
    ctx.fillRect(301, 259, 28, 30);
    ctx.fillStyle = '#a46c4b';
    ctx.fillRect(307, 250, 16, 11);
    ctx.fillStyle = '#594f3b';
    ctx.fillRect(311, 273, 9, 16);
    ctx.fillStyle = '#d86d44';
    ctx.fillRect(390, 267, 8, 12);
    ctx.fillStyle = '#f5ce7b';
    ctx.fillRect(392, 262, 4, 10);
  }, []);
  return (
    <canvas
      ref={ref}
      width={832}
      height={576}
      className="map-preview"
      aria-label={t('hub.previewAlt')}
      role="img"
    />
  );
}
