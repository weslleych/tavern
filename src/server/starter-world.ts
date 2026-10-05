import { randomUUID } from 'node:crypto';
import type { Panel } from '../types/game';
import { starterScenes } from '../lib/starter-world';
import { defaultMonsters } from '../lib/monsters';
import { placeStructure } from './structures';

export function createStarterWorld(roomId: string, updatedAt: string): Panel[] {
  const layouts = starterScenes();
  const ids = new Map(layouts.map((layout) => [layout.key, randomUUID()]));
  return layouts.map((layout, order) => {
    const panel: Panel = {
      id: ids.get(layout.key)!,
      roomId,
      name: layout.name,
      order,
      grid: layout.grid,
      tiles: layout.tiles,
      spawnPoint: layout.spawnPoint,
      updatedAt,
    };
    for (const structure of layout.structures) {
      const anchor = placeStructure(panel, structure.templateKey, structure.x, structure.y);
      if (structure.target) anchor.targetPanelId = ids.get(structure.target)!;
      if (structure.name) anchor.name = structure.name;
    }
    panel.monsters = layout.monsters.map(({ definitionId, x, y }) => {
      const definition = defaultMonsters.find((monster) => monster.id === definitionId)!;
      return {
        id: randomUUID(),
        panelId: panel.id,
        definitionId,
        name: definition.name,
        sprite: definition.sprite,
        x,
        y,
        attributes: { ...definition.attributes },
        attackNotation: definition.attackNotation,
        currentHp: definition.defaultMaxHp,
        maxHp: definition.defaultMaxHp,
        hpVisibility: definition.hpVisibility,
      };
    });
    return panel;
  });
}
