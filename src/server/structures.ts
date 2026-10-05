import { randomUUID } from 'node:crypto';
import type { Panel, StructureAnchor, Tile } from '../types/game';
import { structureTemplates } from '../lib/terrain';

export function structureFootprint(anchor: StructureAnchor): Tile[] {
  const template = structureTemplates.find((t) => t.key === anchor.templateKey)!;
  return Array.from({ length: anchor.cols * anchor.rows }, (_, index) => {
    const dx = index % anchor.cols,
      dy = Math.floor(index / anchor.cols);
    return {
      x: anchor.x + dx,
      y: anchor.y + dy,
      terrain: template.terrain,
      blocked: !template.poi || dx !== anchor.entranceOffset.dx || dy !== anchor.entranceOffset.dy,
      structureId: anchor.id,
      structureRoot: index === 0,
    };
  });
}
export function clearStructuresAt(panel: Panel, cells: { x: number; y: number }[]): boolean {
  const positions = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const ids = new Set(
    panel.tiles
      .filter((t) => positions.has(`${t.x},${t.y}`) && t.structureId)
      .map((t) => t.structureId),
  );
  if (!ids.size) return false;
  panel.tiles = panel.tiles.filter((t) => !ids.has(t.structureId));
  panel.structures = (panel.structures ?? []).filter((s) => !ids.has(s.id));
  return true;
}
export function placeStructure(
  panel: Panel,
  templateKey: string,
  x: number,
  y: number,
): StructureAnchor {
  const template = structureTemplates.find((t) => t.key === templateKey);
  if (!template) throw new Error('Unknown structure.');
  if (x + template.cols > panel.grid.cols || y + template.rows > panel.grid.rows)
    throw new Error('Structure footprint is outside this scene.');
  const anchor: StructureAnchor = {
    id: randomUUID(),
    templateKey,
    category: template.category,
    x,
    y,
    cols: template.cols,
    rows: template.rows,
    entranceOffset: { ...template.entranceOffset },
  };
  const footprint = structureFootprint(anchor);
  clearStructuresAt(panel, footprint);
  const positions = new Set(footprint.map((t) => `${t.x},${t.y}`));
  panel.tiles = [...panel.tiles.filter((t) => !positions.has(`${t.x},${t.y}`)), ...footprint];
  (panel.structures ??= []).push(anchor);
  return anchor;
}
export function validateImportedStructures(panel: Panel) {
  const anchors = panel.structures ?? [];
  const ids = new Set<string>(),
    cells = new Set<string>();
  for (const anchor of anchors) {
    const template = structureTemplates.find((t) => t.key === anchor.templateKey);
    if (
      !template ||
      ids.has(anchor.id) ||
      template.cols !== anchor.cols ||
      template.rows !== anchor.rows ||
      template.category !== anchor.category ||
      template.entranceOffset.dx !== anchor.entranceOffset.dx ||
      template.entranceOffset.dy !== anchor.entranceOffset.dy ||
      anchor.x + anchor.cols > panel.grid.cols ||
      anchor.y + anchor.rows > panel.grid.rows
    )
      throw new Error('Invalid structure footprint.');
    ids.add(anchor.id);
    for (const expected of structureFootprint(anchor)) {
      const key = `${expected.x},${expected.y}`;
      const tile = panel.tiles.find((t) => t.x === expected.x && t.y === expected.y);
      if (
        cells.has(key) ||
        !tile ||
        tile.structureId !== anchor.id ||
        tile.structureRoot !== expected.structureRoot ||
        tile.blocked !== expected.blocked ||
        tile.terrain !== expected.terrain
      )
        throw new Error('Invalid structure footprint.');
      cells.add(key);
    }
  }
  if (
    panel.tiles.some(
      (t) =>
        (t.structureId && !ids.has(t.structureId)) ||
        (t.structureRoot !== undefined && !t.structureId),
    )
  )
    throw new Error('Invalid structure footprint.');
  for (const anchor of anchors) {
    const original = anchor.id;
    anchor.id = randomUUID();
    delete anchor.targetPanelId;
    for (const tile of panel.tiles) if (tile.structureId === original) tile.structureId = anchor.id;
  }
}
