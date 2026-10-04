import type {
  AttributeDefinition,
  AttributeModifiers,
  CharacterClass,
  CharacterSubclass,
} from '../types/game';

export const attributeDefinitions: AttributeDefinition[] = [
  { id: 'forca', name: 'Força', abbreviation: 'STR' },
  { id: 'destreza', name: 'Destreza', abbreviation: 'DEX' },
  { id: 'constituicao', name: 'Constituição', abbreviation: 'CON' },
  { id: 'inteligencia', name: 'Inteligência', abbreviation: 'INT' },
  { id: 'sabedoria', name: 'Sabedoria', abbreviation: 'WIS' },
  { id: 'carisma', name: 'Carisma', abbreviation: 'CHA' },
];

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

function preset(
  id: string,
  name: string,
  description: string,
  attributes: Partial<AttributeModifiers>,
  buff: string,
  debuff: string,
): CharacterSubclass {
  return {
    id,
    name,
    description,
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
    ),
    subclasses: [
      preset(
        'guardiao',
        'Guardião',
        'Protege os companheiros e resiste às adversidades.',
        { constituicao: 1, sabedoria: 1, destreza: -1 },
        'Vigilância',
        'Cautela excessiva',
      ),
      preset(
        'duelista',
        'Duelista',
        'Precisão e agilidade em cada desafio.',
        { destreza: 2, constituicao: -1 },
        'Reflexos',
        'Orgulho',
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
    ),
    subclasses: [
      preset(
        'berserker',
        'Berserker',
        'Enfrenta desafios com intensidade.',
        { forca: 1, sabedoria: -1 },
        'Ímpeto',
        'Temeridade',
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
      ),
    ],
  },
];
