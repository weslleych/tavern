import { z } from 'zod';
import { terrains } from '../types/game';
import { skinColors, dyeColors, pantsColors } from './characters';

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
  })
  .strict();
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
export const importSchema = z.object({
  version: z.literal(1),
  name,
  grid: gridSchema,
  tiles: z.array(tileSchema).max(4096),
});
export function readableError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || 'Check the supplied data.';
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}
