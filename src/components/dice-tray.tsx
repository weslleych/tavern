'use client';
import { useState, type FormEvent } from 'react';
import { FormSelect } from './ui/select';
import { Dices, X } from 'lucide-react';
import type { DiceRequest, DiceRoll } from '../types/game';

export function DiceTray({
  rolls,
  disabled,
  onRoll,
  onClose,
}: {
  rolls: DiceRoll[];
  disabled: boolean;
  onRoll: (request: DiceRequest) => Promise<boolean>;
  onClose: () => void;
}) {
  const [rolling, setRolling] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setRolling(true);
    try {
      await onRoll({
        sides: Number(data.get('sides')),
        count: Number(data.get('count')),
        modifier: Number(data.get('modifier')),
      });
    } finally {
      setRolling(false);
    }
  }
  return (
    <aside className="dice-tray" aria-label="Dice tray">
      <div className="dice-heading">
        <h2>
          <Dices size={20} aria-hidden="true" /> Let fate decide
        </h2>
        <button className="icon-button" aria-label="Close dice" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="dice-fields">
          <label>
            Dice sides
            <FormSelect
              label="Dice sides"
              name="sides"
              defaultValue="20"
              disabled={disabled || rolling}
              options={[4, 6, 8, 10, 12, 20, 100].map((sides) => ({
                value: String(sides),
                label: `d${sides}`,
              }))}
            />
          </label>
          <label>
            Dice count
            <input name="count" type="number" min={1} max={20} defaultValue={1} required />
          </label>
          <label>
            Modifier
            <input name="modifier" type="number" min={-1000} max={1000} defaultValue={0} required />
          </label>
        </div>
        <button className="button primary wide" type="submit" disabled={disabled || rolling}>
          <Dices size={16} aria-hidden="true" />
          {rolling ? 'Rolling…' : 'Roll dice'}
        </button>
      </form>
      <p className="dice-note">Shared with your party. Your last 20 rolls stay with the table.</p>
      <ol className="dice-history" data-testid="dice-history">
        {[...rolls].reverse().map((roll) => (
          <li key={roll.id}>
            <div>
              <strong>{roll.nickname}</strong>
              <span>
                {roll.count}d{roll.sides}
                {roll.modifier
                  ? `${roll.modifier > 0 ? ' + ' : ' − '}${Math.abs(roll.modifier)}`
                  : ''}
              </span>
              <small>{roll.values.join(' · ')}</small>
            </div>
            <b>{roll.total}</b>
          </li>
        ))}
      </ol>
      {!rolls.length && <p className="dice-note">The first roll is yours.</p>}
      <p className="sr-only" role="status">
        {rolls.length ? `${rolls.at(-1)!.nickname} rolled ${rolls.at(-1)!.total}` : ''}
      </p>
    </aside>
  );
}
