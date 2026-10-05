'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { starterWorld, starterWorldGrid } from '../../lib/starter-world';
import { structureTemplates } from '../../lib/terrain';
import { drawStructure, drawTile } from './render';

export function MapPreview() {
  const t = useTranslations();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const world = starterWorld();
    for (const tile of world.tiles) {
      drawTile(ctx, tile.terrain, tile.x * 32, tile.y * 32, 32, tile.x + tile.y);
    }
    for (const structure of world.structures) {
      const template = structureTemplates.find(
        (template) => template.key === structure.templateKey,
      )!;
      for (let dy = 0; dy < template.rows; dy++) {
        for (let dx = 0; dx < template.cols; dx++) {
          const x = structure.x + dx;
          const y = structure.y + dy;
          drawTile(ctx, template.terrain, x * 32, y * 32, 32, x + y);
        }
      }
      drawStructure(
        ctx,
        structure.templateKey,
        structure.x * 32,
        structure.y * 32,
        template.cols,
        template.rows,
      );
    }
  }, []);
  return (
    <canvas
      ref={ref}
      width={starterWorldGrid.cols * starterWorldGrid.tileSize}
      height={starterWorldGrid.rows * starterWorldGrid.tileSize}
      className="map-preview"
      aria-label={t('hub.previewAlt')}
      role="img"
    />
  );
}
