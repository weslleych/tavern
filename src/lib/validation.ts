import { z } from 'zod';
import { terrains } from '../types/game';

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
