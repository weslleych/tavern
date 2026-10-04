import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiceNotation, formatDiceNotation } from '../src/lib/dice-notation';

test('RPG notation maps counts, shorthand and signed modifiers to the server request', () => {
  for (const [expression, expected] of [
    ['2d4', { count: 2, sides: 4, modifier: 0 }],
    ['3d6', { count: 3, sides: 6, modifier: 0 }],
    ['d8', { count: 1, sides: 8, modifier: 0 }],
    ['1d10', { count: 1, sides: 10, modifier: 0 }],
    ['1d12-2', { count: 1, sides: 12, modifier: -2 }],
    ['d20', { count: 1, sides: 20, modifier: 0 }],
    ['2d6+4', { count: 2, sides: 6, modifier: 4 }],
    ['  2D20 + 3  ', { count: 2, sides: 20, modifier: 3 }],
    ['20d4-1000', { count: 20, sides: 4, modifier: -1000 }],
    ['1d6+1000', { count: 1, sides: 6, modifier: 1000 }],
    ['d6-0', { count: 1, sides: 6, modifier: 0 }],
  ] as const) {
    assert.deepEqual(parseDiceNotation(expression), expected, expression);
  }
});

test('invalid or out-of-range notation never produces a dice request', () => {
  for (const expression of [
    '',
    'abc',
    '2d7',
    '0d6',
    '25d20',
    'd100',
    '2d6+1001',
    '2d6-1001',
    '-1d6',
    '1.5d6',
    'd6+1.5',
    'd6+-2',
    'd6+2d4',
    'd6!',
    '2 d6',
    'd6\n+4',
    '999999999999999999d6',
    'd6+999999999999999999',
  ])
    assert.equal(parseDiceNotation(expression), null, expression);
});

test('history notation preserves signed modifiers and omits a zero modifier', () => {
  assert.equal(formatDiceNotation({ count: 2, sides: 6, modifier: 3 }), '2d6 + 3');
  assert.equal(formatDiceNotation({ count: 1, sides: 12, modifier: -2 }), '1d12 - 2');
  assert.equal(formatDiceNotation({ count: 1, sides: 20, modifier: 0 }), '1d20');
});
