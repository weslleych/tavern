import type { DiceRequest } from '../types/game';

export const diceSides = [4, 6, 8, 10, 12, 20] as const;
const expressionPattern = /^(\d+)?d(4|6|8|10|12|20)[ \t]*(?:([+-])[ \t]*(\d+))?$/i;

export function parseDiceNotation(expression: string): DiceRequest | null {
  const input = expression.trim();
  if (input.length > 32 || /[\r\n]/.test(input)) return null;
  const match = expressionPattern.exec(input);
  if (!match) return null;
  const count = Number(match[1] ?? 1);
  const amount = Number(match[4] ?? 0);
  if (count < 1 || count > 20 || amount > 1000) return null;
  return {
    count,
    sides: Number(match[2]),
    modifier: amount === 0 ? 0 : match[3] === '-' ? -amount : amount,
  };
}

export function formatDiceNotation(request: DiceRequest): string {
  return `${request.count}d${request.sides}${
    request.modifier === 0
      ? ''
      : ` ${request.modifier > 0 ? '+' : '-'} ${Math.abs(request.modifier)}`
  }`;
}
