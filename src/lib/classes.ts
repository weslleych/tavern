import type {
  AttributeDefinition,
  AttributeModifiers,
  CharacterClass,
  CharacterSubclass,
  CharacterAppearance,
} from '../types/game';
import { defaultAttacks } from './combat';

export const attributeDefinitions: AttributeDefinition[] = [
  { id: 'forca', name: 'Força', abbreviation: 'STR' },
  { id: 'destreza', name: 'Destreza', abbreviation: 'DEX' },
  { id: 'constituicao', name: 'Constituição', abbreviation: 'CON' },
  { id: 'inteligencia', name: 'Inteligência', abbreviation: 'INT' },
  { id: 'sabedoria', name: 'Sabedoria', abbreviation: 'WIS' },
  { id: 'carisma', name: 'Carisma', abbreviation: 'CHA' },
];

export const DEFAULT_BASE_HP = 20;

export function calculateMaxHealth(
  characterClass?: Pick<CharacterClass, 'healthModifier'>,
  subclass?: Pick<CharacterSubclass, 'healthModifier'>,
  gmBonus = 0,
): number {
  return Math.max(
    1,
    DEFAULT_BASE_HP +
      (characterClass?.healthModifier ?? 0) +
      (subclass?.healthModifier ?? 0) +
      gmBonus,
  );
}

export function calculateAttributes(
  characterClass?: { attributes: Partial<AttributeModifiers> },
  subclass?: { attributes: Partial<AttributeModifiers> },
): AttributeModifiers {
  return Object.fromEntries(
    attributeDefinitions.map(({ id }) => [
      id,
      (characterClass?.attributes[id] ?? 0) + (subclass?.attributes[id] ?? 0),
    ]),
  ) as AttributeModifiers;
}

export function calculateTraits(characterClass?: CharacterClass, subclass?: CharacterSubclass) {
  return {
    buffs: [...(characterClass?.buffs ?? []), ...(subclass?.buffs ?? [])],
    debuffs: [...(characterClass?.debuffs ?? []), ...(subclass?.debuffs ?? [])],
  };
}

export function findClassSelection(
  classes: CharacterClass[],
  classId?: string,
  subclassId?: string,
): { characterClass: CharacterClass; subclass?: CharacterSubclass } | null {
  const characterClass = classes.find((item) => item.id === classId);
  if (!characterClass) return null;
  const subclass = characterClass.subclasses.find((item) => item.id === subclassId);
  if (subclassId && !subclass) return null;
  return { characterClass, subclass };
}

export const signedModifier = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

export function characterClassTitle(
  classes: CharacterClass[],
  character?: Pick<CharacterAppearance, 'classId' | 'subclassId'>,
): string | undefined {
  const characterClass = classes.find((item) => item.id === character?.classId);
  if (!characterClass) return undefined;
  const subclass = characterClass.subclasses.find((item) => item.id === character?.subclassId);
  return subclass ? `${characterClass.name} · ${subclass.name}` : characterClass.name;
}

function preset(
  id: string,
  name: string,
  description: string,
  attributes: Partial<AttributeModifiers>,
  buff: string,
  debuff: string,
  healthModifier = 0,
): CharacterSubclass {
  return {
    id,
    name,
    description,
    healthModifier,
    attributes: calculateAttributes({ attributes }),
    buffs: [{ id: `${id}-buff`, name: buff, description: `Traço narrativo de ${name}.` }],
    debuffs: [{ id: `${id}-debuff`, name: debuff, description: `Limitação narrativa de ${name}.` }],
  };
}

// Room catalogs receive independent copies; traits are descriptive, not automatic mechanics.
export const defaultClasses: CharacterClass[] = [
  {
    ...preset(
      'guerreiro',
      'Guerreiro',
      'Disciplina e coragem na linha de frente.',
      { forca: 2, constituicao: 1, inteligencia: -1 },
      'Determinação',
      'Rigidez',
      4,
    ),
    subclasses: [
      preset(
        'guardiao',
        'Guardião',
        'Protege os companheiros e resiste às adversidades.',
        { constituicao: 1, sabedoria: 1, destreza: -1 },
        'Vigilância',
        'Cautela excessiva',
        2,
      ),
      preset(
        'duelista',
        'Duelista',
        'Precisão e agilidade em cada desafio.',
        { destreza: 2, constituicao: -1 },
        'Reflexos',
        'Orgulho',
        -1,
      ),
    ],
  },
  {
    ...preset(
      'mago',
      'Mago',
      'Conhecimento e curiosidade pelo mundo arcano.',
      { inteligencia: 2, sabedoria: 1, forca: -1 },
      'Erudição',
      'Fragilidade',
      -2,
    ),
    subclasses: [
      preset(
        'arcanista',
        'Arcanista',
        'Estuda os mistérios da magia.',
        { inteligencia: 1, carisma: 1 },
        'Intuição arcana',
        'Distração',
      ),
    ],
  },
  {
    ...preset(
      'barbaro',
      'Bárbaro',
      'Vigor e instinto diante do perigo.',
      { forca: 2, constituicao: 2, inteligencia: -1, carisma: -1 },
      'Tenacidade',
      'Impulsividade',
      6,
    ),
    subclasses: [
      preset(
        'berserker',
        'Berserker',
        'Enfrenta desafios com intensidade.',
        { forca: 1, sabedoria: -1 },
        'Ímpeto',
        'Temeridade',
        2,
      ),
    ],
  },
  {
    ...preset(
      'arqueiro',
      'Arqueiro',
      'Atenção e precisão nas trilhas selvagens.',
      { destreza: 2, sabedoria: 1, constituicao: -1 },
      'Percepção',
      'Isolamento',
    ),
    subclasses: [
      preset(
        'rastreador',
        'Rastreador',
        'Lê os sinais da natureza.',
        { sabedoria: 1, destreza: 1 },
        'Orientação',
        'Desconfiança',
        1,
      ),
    ],
  },
];

for (const characterClass of defaultClasses)
  characterClass.defaultAttack = structuredClone(defaultAttacks[characterClass.id]);

type PresetTranslator = (key: string) => string;

// Translate unchanged preset fields only. Room catalogs and custom prose remain authoritative.
export function localizeClassDefinition<T extends CharacterSubclass>(
  value: T,
  baseline: CharacterSubclass | undefined,
  translate: PresetTranslator,
): T {
  if (!baseline) return value;
  const field = (key: 'name' | 'description') =>
    value[key] === baseline[key] ? translate(`${baseline.id}.${key}`) : value[key];
  const traits = (kind: 'buffs' | 'debuffs') =>
    value[kind].map((trait) => {
      const original = baseline[kind].find((item) => item.id === trait.id);
      const prefix = kind === 'buffs' ? 'buff' : 'debuff';
      return {
        ...trait,
        name:
          original && trait.name === original.name
            ? translate(`${baseline.id}.${prefix}Name`)
            : trait.name,
        description:
          original && trait.description === original.description
            ? translate(`${baseline.id}.${prefix}Description`)
            : trait.description,
      };
    });
  return {
    ...value,
    name: field('name'),
    description: field('description'),
    buffs: traits('buffs'),
    debuffs: traits('debuffs'),
  };
}

export function localizeClasses(
  classes: CharacterClass[],
  translate: PresetTranslator,
): CharacterClass[] {
  return classes.map((item) => {
    const baseline = defaultClasses.find((preset) => preset.id === item.id);
    return {
      ...localizeClassDefinition(item, baseline, translate),
      subclasses: item.subclasses.map((subclass) =>
        localizeClassDefinition(
          subclass,
          baseline?.subclasses.find((preset) => preset.id === subclass.id),
          translate,
        ),
      ),
    };
  });
}
