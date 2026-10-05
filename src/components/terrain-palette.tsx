'use client';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Terrain, TerrainCategory } from '../types/game';
import { terrainCategories, terrainInfo, structureTemplates } from '../lib/terrain';
import { drawTile, drawStructure } from './canvas/render';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
function BrushSwatch({ terrain, structureKey }: { terrain?: Terrain; structureKey?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 32, 32);
    if (terrain) drawTile(ctx, terrain, 0, 0, 32);
    else {
      const template = structureTemplates.find((s) => s.key === structureKey)!;
      ctx.save();
      ctx.scale(1 / template.cols, 1 / template.rows);
      drawStructure(ctx, template.key, 0, 0, template.cols, template.rows);
      ctx.restore();
    }
  }, [terrain, structureKey]);
  return <canvas ref={ref} width={32} height={32} className="terrain-swatch" aria-hidden="true" />;
}
export function TerrainPalette({
  category,
  terrain,
  structureKey,
  disabled,
  onCategory,
  onTerrain,
  onStructure,
}: {
  category: TerrainCategory;
  terrain: Terrain;
  structureKey?: string;
  disabled: boolean;
  onCategory: (category: TerrainCategory) => void;
  onTerrain: (terrain: Terrain) => void;
  onStructure: (key: string) => void;
}) {
  const t = useTranslations();
  return (
    <Tabs value={category} onValueChange={(value) => onCategory(value as TerrainCategory)}>
      <TabsList aria-label={t('tabletop.terrainPalette')}>
        {(Object.keys(terrainCategories) as TerrainCategory[]).map((key) => (
          <TabsTrigger key={key} value={key}>
            {t(`world.${key}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(terrainCategories) as TerrainCategory[]).map((key) => (
        <TabsContent key={key} value={key}>
          <div className="terrain-palette">
            {terrainCategories[key].map((next) => (
              <button
                key={next}
                aria-label={t(`tabletop.terrain.${next}`)}
                aria-pressed={!structureKey && terrain === next}
                disabled={disabled}
                onClick={() => onTerrain(next)}
                title={`${t(`tabletop.terrain.${next}`)}${terrainInfo[next].shortcut ? ` (${terrainInfo[next].shortcut})` : ''}`}
              >
                <BrushSwatch terrain={next} />
                <span>{t(`tabletop.terrain.${next}`)}</span>
              </button>
            ))}
            {structureTemplates
              .filter((s) => s.category === key)
              .map((template) => (
                <button
                  key={template.key}
                  aria-label={t(`world.${template.key}`)}
                  aria-pressed={structureKey === template.key}
                  disabled={disabled}
                  onClick={() => onStructure(template.key)}
                  title={`${t(`world.${template.key}`)} · ${template.cols} × ${template.rows}`}
                >
                  <BrushSwatch structureKey={template.key} />
                  <span>{t(`world.${template.key}`)}</span>
                </button>
              ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
