import { z } from 'zod';
import { terrains } from '../types/game';
import { skinColors, dyeColors, pantsColors } from './characters';
import { parseDiceNotation } from './dice-notation';
import { structureTemplates } from './terrain';

const classIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const attributeIdSchema = z.enum([
  'forca',
  'destreza',
  'constituicao',
  'inteligencia',
  'sabedoria',
  'carisma',
]);
const modifierSchema = z.number().int().min(-100).max(100);
export const healthModifierSchema = modifierSchema.default(0);
export const healthAdjustmentSchema = z
  .object({
    memberId: z.string().uuid().optional(),
    current: z.number().int().min(0).max(999).optional(),
    delta: z.number().int().min(-999).max(999).optional(),
    gmBonus: modifierSchema.optional(),
  })
  .strict()
  .refine(
    (data) => data.current !== undefined || data.delta !== undefined || data.gmBonus !== undefined,
    'Provide an HP change or bonus.',
  )
  .refine(
    (data) => data.current === undefined || data.delta === undefined,
    'Choose either current HP or a damage/healing amount.',
  );
export const attributesSchema = z
  .object({
    forca: modifierSchema,
    destreza: modifierSchema,
    constituicao: modifierSchema,
    inteligencia: modifierSchema,
    sabedoria: modifierSchema,
    carisma: modifierSchema,
  })
  .strict();
export const traitSchema = z
  .object({
    id: classIdSchema,
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240),
  })
  .strict();
const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
const traitsSchema = z.array(traitSchema).max(8).refine(uniqueIds, 'Trait IDs must be unique.');
export const subclassSchema = z
  .object({
    id: classIdSchema,
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240),
    attributes: attributesSchema,
    healthModifier: healthModifierSchema,
    buffs: traitsSchema,
    debuffs: traitsSchema,
  })
  .strict();
export const attackNotationSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .refine((value) => !!parseDiceNotation(value), 'Enter valid dice notation.');
export const classAttackSchema = z
  .object({
    id: classIdSchema,
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240),
    attributeId: attributeIdSchema,
    damageNotation: attackNotationSchema,
  })
  .strict();
export const classSchema = subclassSchema.extend({
  subclasses: z.array(subclassSchema).max(8).refine(uniqueIds, 'Subclass IDs must be unique.'),
  defaultAttack: classAttackSchema.optional(),
});
export const classesSchema = z
  .array(classSchema)
  .max(16)
  .refine(uniqueIds, 'Class IDs must be unique.')
  .refine(
    (items) => new TextEncoder().encode(JSON.stringify(items)).length <= 24 * 1024,
    'The class catalog must fit within 24 KB.',
  );
export const updateClassesSchema = z.object({ classes: classesSchema }).strict();

export const spriteSchema = z
  .string()
  .max(8192)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => {
    try {
      const bytes = Uint8Array.from(atob(value.split(',')[1]), (char) => char.charCodeAt(0));
      if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
        return false;
      const view = new DataView(bytes.buffer);
      if (
        view.getUint32(8) !== 13 ||
        String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' ||
        view.getUint32(16) === 0 ||
        view.getUint32(16) > 128 ||
        view.getUint32(20) === 0 ||
        view.getUint32(20) > 128
      )
        return false;
      let offset = 8,
        hasData = false;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
        if (length > bytes.length - offset - 12) return false;
        if (type === 'IDAT' && length > 0) hasData = true;
        if (type === 'IEND') return length === 0 && offset + 12 === bytes.length && hasData;
        offset += length + 12;
      }
      return false;
    } catch {
      return false;
    }
  }, 'Choose a PNG sprite up to 128 × 128 pixels and 6 KB.');
export const characterSchema = z
  .object({
    skinColor: z.enum(skinColors),
    hairStyle: z.number().int().min(0).max(9),
    hairColor: z.enum(dyeColors),
    shirtStyle: z.number().int().min(0).max(7),
    shirtColor: z.enum(dyeColors),
    pantsColor: z.enum(pantsColors),
    classId: classIdSchema.optional(),
    subclassId: classIdSchema.optional(),
  })
  .strict()
  .refine((value) => !value.subclassId || !!value.classId, 'Choose a class before its subclass.');
export const moveSchema = z
  .object({
    panelId: z.string().uuid(),
    x: z.number().int().min(0).max(63),
    y: z.number().int().min(0).max(63),
    memberId: z.string().uuid().optional(),
  })
  .strict();
export const movementSchema = z.object({ allowed: z.boolean() }).strict();
export const spawnSchema = z
  .object({
    panelId: z.string().uuid(),
    point: z
      .object({ x: z.number().int().min(0).max(63), y: z.number().int().min(0).max(63) })
      .nullable(),
  })
  .strict();
export const fogSchema = z
  .object({
    panelId: z.string().uuid(),
    enabled: z.boolean().optional(),
    revealed: z.boolean().optional(),
    cells: z
      .array(z.object({ x: z.number().int().min(0).max(63), y: z.number().int().min(0).max(63) }))
      .min(1)
      .max(64)
      .optional(),
  })
  .strict()
  .refine(
    (request) =>
      request.enabled !== undefined || (request.revealed !== undefined && !!request.cells),
    'Choose a fog action.',
  );
export const diceSchema = z
  .object({
    sides: z.union([
      z.literal(4),
      z.literal(6),
      z.literal(8),
      z.literal(10),
      z.literal(12),
      z.literal(20),
      z.literal(100),
    ]),
    count: z.number().int().min(1).max(20),
    modifier: z.number().int().min(-1000).max(1000),
    attribute: attributeIdSchema.optional(),
    label: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export const panelIdSchema = z.string().uuid();
export const panelOrderSchema = z.array(panelIdSchema).min(1).max(30);

const name = z.string().trim().min(1, 'Enter a name.').max(60, 'Use at most 60 characters.');
const nickname = z
  .string()
  .trim()
  .min(1, 'Enter your nickname.')
  .max(24, 'Use at most 24 characters.');
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^TVRN-[A-Z2-9]{6}$/, 'Enter a code like TVRN-ABC234.');
export const createSchema = z.object({
  name,
  nickname,
  template: z.enum(['blank', 'woodland']).default('blank'),
  classes: classesSchema.optional(),
});
export const joinSchema = z.object({
  code: roomCodeSchema,
  nickname,
  session: z.unknown().optional(),
});
export const authSchema = z.object({
  roomCode: roomCodeSchema,
  memberId: z.string().uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const gridSchema = z.object({
  cols: z.number().int().min(5).max(64),
  rows: z.number().int().min(5).max(64),
  tileSize: z.literal(32),
});
export const tileSchema = z.object({
  x: z.number().int().min(0).max(63),
  y: z.number().int().min(0).max(63),
  terrain: z.enum(terrains),
  blocked: z.boolean(),
  sprite: spriteSchema.optional(),
  structureId: z.string().uuid().optional(),
  structureRoot: z.boolean().optional(),
});
export const paintSchema = z.object({
  panelId: z.string().uuid(),
  tiles: z.array(tileSchema).min(1).max(64),
});
export const sceneSchema = z.object({
  name,
  cols: gridSchema.shape.cols,
  rows: gridSchema.shape.rows,
  template: z.enum(['blank', 'woodland']),
});
export const renameSchema = z.object({ panelId: z.string().uuid(), name });
export const structureAnchorSchema = z
  .object({
    id: z.string().uuid(),
    templateKey: z
      .string()
      .refine((value) => structureTemplates.some((t) => t.key === value), 'Unknown structure.'),
    category: z.enum(['world', 'city', 'dungeon', 'interior']),
    x: z.number().int().min(0).max(63),
    y: z.number().int().min(0).max(63),
    cols: z.number().int().min(2).max(3),
    rows: z.number().int().min(2).max(3),
    entranceOffset: z.object({
      dx: z.number().int().min(0).max(2),
      dy: z.number().int().min(0).max(2),
    }),
    name: z.string().trim().min(1).max(60).optional(),
    targetPanelId: z.string().uuid().optional(),
  })
  .strict();
export const importSchema = z.object({
  version: z.literal(1),
  name,
  grid: gridSchema,
  tiles: z.array(tileSchema).max(4096),
  structures: z.array(structureAnchorSchema).max(1024).optional(),
});
const coordinateSchema = z.number().int().min(0).max(63);
export const structureRequestSchema = z
  .object({
    panelId: panelIdSchema,
    templateKey: z
      .string()
      .refine((value) => structureTemplates.some((t) => t.key === value), 'Unknown structure.'),
    x: coordinateSchema,
    y: coordinateSchema,
  })
  .strict();
export const poiConfigurationSchema = z
  .object({
    panelId: panelIdSchema,
    structureId: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    targetPanelId: panelIdSchema.nullable().optional(),
    createTemplate: z.enum(['town', 'dungeon']).optional(),
  })
  .strict()
  .refine(
    (data) => !data.createTemplate || !data.targetPanelId,
    'Choose a destination or create a scene.',
  );
export const poiVoteSchema = z.object({ voteId: z.string().uuid(), accept: z.boolean() }).strict();
export const poiDecisionSchema = z
  .object({ voteId: z.string().uuid(), approved: z.boolean() })
  .strict();
export const hpVisibilitySchema = z.enum(['gm_only', 'bar_only', 'public']);
export const monsterSpriteSchema = z.union([
  z.enum(['bat', 'bandit', 'zombie', 'skeleton', 'slime', 'spider', 'goblin', 'dragon']),
  spriteSchema.refine((value) => {
    try {
      const bytes = Uint8Array.from(atob(value.split(',')[1] ?? ''), (char) => char.charCodeAt(0));
      if (bytes.length < 24) return false;
      const view = new DataView(bytes.buffer);
      return view.getUint32(16) === 32 && view.getUint32(20) === 32;
    } catch {
      return false;
    }
  }, 'Choose a 32 × 32 PNG sprite.'),
]);
export const monsterDefinitionSchema = z
  .object({
    id: classIdSchema,
    name: z.string().trim().min(1).max(60),
    sprite: monsterSpriteSchema,
    attributes: attributesSchema,
    defaultMaxHp: z.number().int().min(1).max(9999),
    attackNotation: attackNotationSchema,
    hpVisibility: hpVisibilitySchema,
    isCustom: z.boolean().optional(),
  })
  .strict();
export const summonMonsterSchema = z
  .object({
    panelId: panelIdSchema,
    definitionId: classIdSchema,
    name: z.string().trim().min(1).max(60).optional(),
    x: coordinateSchema,
    y: coordinateSchema,
    customOverrides: z
      .object({
        maxHp: z.number().int().min(1).max(9999).optional(),
        attributes: attributesSchema.optional(),
        hpVisibility: hpVisibilitySchema.optional(),
        attackNotation: attackNotationSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const monsterReferenceSchema = z
  .object({ panelId: panelIdSchema, monsterId: z.string().uuid() })
  .strict();
export const moveMonsterSchema = monsterReferenceSchema.extend({
  x: coordinateSchema,
  y: coordinateSchema,
});
export const setMonsterVisibilitySchema = monsterReferenceSchema.extend({
  hpVisibility: hpVisibilitySchema,
});
export const adjustMonsterHpSchema = monsterReferenceSchema
  .extend({
    current: z.number().int().min(0).max(9999).optional(),
    delta: z.number().int().min(-9999).max(9999).optional(),
    gmBonusHp: z.number().int().min(-9998).max(9998).optional(),
  })
  .refine(
    (data) =>
      data.current !== undefined || data.delta !== undefined || data.gmBonusHp !== undefined,
    'Provide an HP change.',
  )
  .refine(
    (data) => data.current === undefined || data.delta === undefined,
    'Choose current HP or a delta.',
  );
export const playerAttackSchema = z
  .object({ targetMonsterId: z.string().uuid(), attackId: classIdSchema })
  .strict();
export const monsterAttackSchema = z
  .object({ targetMemberId: z.string().uuid(), damageNotation: attackNotationSchema.optional() })
  .strict();
export function readableError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Check the supplied data.';
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}
