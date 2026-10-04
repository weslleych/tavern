'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { CharacterAppearance } from '../types/game';
import {
  defaultAppearance,
  skinColors,
  dyeColors,
  pantsColors,
  hairStyles,
  shirtStyles,
} from '../lib/characters';
import { FormSelect } from './ui/select';
import { drawCharacter } from './canvas/character';

export function CharacterPortrait({
  appearance,
  size = 40,
}: {
  appearance: CharacterAppearance;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      drawCharacter(ctx, appearance, 0, 0, size);
    }
  }, [appearance, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="character-portrait"
      aria-hidden="true"
    />
  );
}

const dyeNames = [
  'Chestnut',
  'Charcoal',
  'Copper',
  'Wheat',
  'Linen',
  'Rust',
  'Terracotta',
  'Gold',
  'Forest',
  'Sage',
  'Navy',
  'Teal',
  'Plum',
  'Rose',
  'Slate',
  'Silver',
];
export function CharacterCreator({
  initial,
  nickname,
  busy,
  error,
  editing = false,
  onSave,
}: {
  initial?: CharacterAppearance;
  nickname: string;
  busy: boolean;
  error: string;
  editing?: boolean;
  onSave: (appearance: CharacterAppearance) => Promise<boolean>;
}) {
  const [appearance, setAppearance] = useState(initial || defaultAppearance);
  const [saving, setSaving] = useState(false);
  const change = <K extends keyof CharacterAppearance>(key: K, value: CharacterAppearance[K]) =>
    setAppearance((previous) => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(appearance);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="character-creator" onSubmit={submit}>
      <p className="modal-description">
        Choose your look for this table. You can change it whenever the story takes a new turn.
      </p>
      <div className="character-preview">
        <CharacterPortrait appearance={appearance} size={160} />
        <strong>{nickname}</strong>
        <span>Your adventurer</span>
      </div>
      <div className="character-fields">
        <label>
          Skin tone
          <FormSelect
            label="Skin tone"
            value={String(appearance.skinColor)}
            disabled={busy || saving}
            onValueChange={(value) => change('skinColor', value)}
            options={skinColors.map((color, index) => ({
              value: color,
              label: `Tone ${index + 1}`,
            }))}
          />
        </label>
        <label>
          Hair style
          <FormSelect
            label="Hair style"
            value={String(appearance.hairStyle)}
            disabled={busy || saving}
            onValueChange={(value) => change('hairStyle', Number(value))}
            options={hairStyles.map((style, index) => ({ value: String(index), label: style }))}
          />
        </label>
        <label>
          Hair color
          <FormSelect
            label="Hair color"
            value={String(appearance.hairColor)}
            disabled={busy || saving}
            onValueChange={(value) => change('hairColor', value)}
            options={dyeColors.map((color, index) => ({ value: color, label: dyeNames[index] }))}
          />
        </label>
        <label>
          Shirt style
          <FormSelect
            label="Shirt style"
            value={String(appearance.shirtStyle)}
            disabled={busy || saving}
            onValueChange={(value) => change('shirtStyle', Number(value))}
            options={shirtStyles.map((style, index) => ({ value: String(index), label: style }))}
          />
        </label>
        <label>
          Shirt color
          <FormSelect
            label="Shirt color"
            value={String(appearance.shirtColor)}
            disabled={busy || saving}
            onValueChange={(value) => change('shirtColor', value)}
            options={dyeColors.map((color, index) => ({ value: color, label: dyeNames[index] }))}
          />
        </label>
        <label>
          Pants color
          <FormSelect
            label="Pants color"
            value={String(appearance.pantsColor)}
            disabled={busy || saving}
            onValueChange={(value) => change('pantsColor', value)}
            options={pantsColors.map((color) => ({
              value: color,
              label: dyeNames[dyeColors.indexOf(color)],
            }))}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="button primary wide" disabled={busy || saving}>
        {saving && <LoaderCircle size={16} className="spin" />}
        {editing ? 'Save character' : 'Enter tabletop'}
      </button>
    </form>
  );
}
