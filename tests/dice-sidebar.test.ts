import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DiceRoll } from '../src/types/game';
import { DiceSidebar } from '../src/components/dice-sidebar';

function history(overrides: Partial<DiceRoll>) {
  const roll: DiceRoll = {
    id: 'roll',
    memberId: 'member',
    nickname: 'Frog',
    role: 'gm',
    sides: 20,
    count: 1,
    modifier: 0,
    values: [20],
    total: 20,
    createdAt: '2026-10-04T14:42:00.000Z',
    ...overrides,
  };
  return renderToStaticMarkup(
    createElement(DiceSidebar, {
      rolls: [roll],
      rollAnimations: {},
      disabled: false,
      open: true,
      mobile: false,
      onRoll: async () => true,
      onClose: () => {},
    }),
  );
}

test('natural d20 highlights depend on individual faces, including a mixed multi-die roll', () => {
  const natural = history({ count: 2, values: [20, 1], modifier: -2, total: 19 });
  assert.match(natural, /Nat 20!/);
  assert.match(natural, /Nat 1!/);
  assert.match(natural, /\[20, 1\] - 2/);
  const modified = history({ values: [18], modifier: 2, total: 20 });
  assert.doesNotMatch(modified, /Nat 20!/);
  const otherDie = history({ sides: 6, values: [1], modifier: 0, total: 1 });
  assert.doesNotMatch(otherDie, /Nat 1!/);
});
