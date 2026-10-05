import type { MonsterDefinition, MonsterInstance, PublicMonster, Role } from '../types/game';
import { calculateAttributes } from './classes';

const entries = [
  ['bat', 'Giant Bat', 8, '1d4+3', 'bar_only', [-2, 3, 0, -4, 1, -3]],
  ['bandit', 'Bandit Outlaw', 16, '1d6+3', 'bar_only', [1, 3, 1, 1, 0, 1]],
  ['zombie', 'Putrid Zombie', 22, '1d8+3', 'gm_only', [3, -2, 4, -4, -2, -3]],
  ['skeleton', 'Skeleton Warrior', 14, '1d8+2', 'bar_only', [2, 2, 2, -2, 0, -2]],
  ['slime', 'Acid Slime', 12, '1d6', 'bar_only', [0, 0, 3, -5, -3, -5]],
  ['spider', 'Giant Spider', 18, '1d8+3', 'gm_only', [2, 3, 1, -4, 1, -3]],
  ['goblin', 'Goblin Raider', 10, '1d6+2', 'bar_only', [-1, 3, 1, 0, 0, -1]],
  ['dragon', 'Young Red Dragon', 65, '2d10+5', 'public', [5, 1, 4, 2, 2, 3]],
] as const;
export const defaultMonsters: MonsterDefinition[] = entries.map(
  ([id, name, defaultMaxHp, attackNotation, hpVisibility, values]) => ({
    id,
    name,
    sprite: id,
    defaultMaxHp,
    attackNotation,
    hpVisibility,
    attributes: {
      ...calculateAttributes(),
      forca: values[0],
      destreza: values[1],
      constituicao: values[2],
      inteligencia: values[3],
      sabedoria: values[4],
      carisma: values[5],
    },
  }),
);
export function publicMonster(monster: MonsterInstance, role: Role): PublicMonster {
  const { currentHp, maxHp, gmBonusHp, attributes, attackNotation, ...visible } = monster;
  const base: PublicMonster = { ...visible, defeated: currentHp === 0 };
  if (role === 'gm')
    return {
      ...base,
      currentHp,
      maxHp,
      gmBonusHp,
      attributes,
      attackNotation,
      healthRatio: currentHp / maxHp,
    };
  if (monster.hpVisibility === 'public')
    return { ...base, currentHp, maxHp, healthRatio: currentHp / maxHp };
  if (monster.hpVisibility === 'bar_only') return { ...base, healthRatio: currentHp / maxHp };
  return base;
}
