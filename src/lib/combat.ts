import type { ClassAttack, CharacterClass, CombatParticipant, PublicPanel } from '../types/game';

export const basicAttack: ClassAttack = {
  id: 'basic',
  name: 'Basic attack',
  description: '',
  attributeId: 'forca',
  damageNotation: '1d6',
};
export const defaultAttacks: Record<string, ClassAttack> = {
  guerreiro: {
    id: 'heavy_strike',
    name: 'Heavy Strike',
    description: 'A powerful sword strike.',
    attributeId: 'forca',
    damageNotation: '1d8',
  },
  mago: {
    id: 'arcane_dart',
    name: 'Arcane Dart',
    description: 'A dart of arcane energy.',
    attributeId: 'inteligencia',
    damageNotation: '1d6',
  },
  barbaro: {
    id: 'reckless_cleave',
    name: 'Reckless Cleave',
    description: 'A furious axe strike.',
    attributeId: 'forca',
    damageNotation: '1d12',
  },
  arqueiro: {
    id: 'aimed_shot',
    name: 'Aimed Shot',
    description: 'A carefully aimed arrow.',
    attributeId: 'destreza',
    damageNotation: '1d8',
  },
};
export const classAttack = (characterClass?: CharacterClass) =>
  characterClass?.defaultAttack ?? basicAttack;
export function sortInitiative(queue: CombatParticipant[]): CombatParticipant[] {
  return queue.sort(
    (a, b) =>
      b.initiative - a.initiative ||
      b.dexterityModifier - a.dexterityModifier ||
      a.id.localeCompare(b.id),
  );
}
export function combatBackdrop(panel: PublicPanel): 'forest' | 'dungeon' | 'snow' | 'sand' {
  const counts = { forest: 0, dungeon: 0, snow: 0, sand: 0 };
  for (const tile of panel.tiles) {
    if (tile.terrain.includes('snow')) counts.snow++;
    else if (tile.terrain.includes('sand')) counts.sand++;
    else if (
      tile.terrain.includes('dungeon') ||
      ['stone', 'wall', 'lava_pool', 'acid_pool'].includes(tile.terrain)
    )
      counts.dungeon++;
    else counts.forest++;
  }
  return (Object.keys(counts) as (keyof typeof counts)[]).sort((a, b) => counts[b] - counts[a])[0];
}
