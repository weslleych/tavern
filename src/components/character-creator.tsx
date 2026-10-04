'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { CharacterAppearance, CharacterClass } from '../types/game';
import { ClassSummary } from './class-summary';
import { ClassPicker } from './class-picker';
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
  classes,
  nickname,
  busy,
  error,
  editing = false,
  onSave,
}: {
  initial?: CharacterAppearance;
  classes: CharacterClass[];
  nickname: string;
  busy: boolean;
  error: string;
  editing?: boolean;
  onSave: (appearance: CharacterAppearance) => Promise<boolean>;
}) {
  const [appearance, setAppearance] = useState(initial || defaultAppearance);
  const [saving, setSaving] = useState(false);
  const [pane, setPane] = useState<'class' | 'appearance'>(editing ? 'appearance' : 'class');
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  const showAppearance = classes.length === 0 || pane === 'appearance';
  useEffect(() => {
    if (navigated.current && !editing) heading.current?.focus();
  }, [pane, editing]);
  function navigate(next: 'class' | 'appearance') {
    navigated.current = true;
    setPane(next);
  }
  const characterClass = classes.find((item) => item.id === appearance.classId);
  const subclass = characterClass?.subclasses.find((item) => item.id === appearance.subclassId);
  const change = <K extends keyof CharacterAppearance>(key: K, value: CharacterAppearance[K]) =>
    setAppearance((previous) => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving) return;
    if (!editing && !showAppearance) {
      navigate('appearance');
      return;
    }
    setSaving(true);
    try {
      const look = { ...appearance };
      delete look.classId;
      delete look.subclassId;
      await onSave({
        ...look,
        ...(characterClass ? { classId: characterClass.id } : {}),
        ...(subclass ? { subclassId: subclass.id } : {}),
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="character-creator" onSubmit={submit}>
      {classes.length > 0 &&
        (editing ? (
          <div className="character-tabs" role="tablist" aria-label="Character customization">
            {(['appearance', 'class'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${id}-${tab}-tab`}
                aria-controls={`${id}-panel`}
                aria-selected={pane === tab}
                tabIndex={pane === tab ? 0 : -1}
                disabled={busy || saving}
                onClick={() => navigate(tab)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 'appearance'
                      : event.key === 'End'
                        ? 'class'
                        : tab === 'appearance'
                          ? 'class'
                          : 'appearance';
                  navigate(next);
                  document.getElementById(`${id}-${next}-tab`)?.focus();
                }}
              >
                {tab === 'appearance' ? 'Appearance' : 'Class & Specialization'}
              </button>
            ))}
          </div>
        ) : (
          <ol className="character-steps" aria-label="Character creation progress">
            <li aria-current={!showAppearance ? 'step' : undefined}>
              <span>1</span> Archetype
            </li>
            <li aria-current={showAppearance ? 'step' : undefined}>
              <span>2</span> Appearance
            </li>
          </ol>
        ))}
      <div
        id={`${id}-panel`}
        role={editing && classes.length > 0 ? 'tabpanel' : undefined}
        aria-labelledby={editing && classes.length > 0 ? `${id}-${pane}-tab` : undefined}
      >
        <h2 className="character-step-heading" ref={heading} tabIndex={-1}>
          {showAppearance ? 'Meet your Adventurer' : 'Choose your Archetype'}
        </h2>
        <p className="modal-description">
          {showAppearance
            ? 'Choose your look for this table. You can change it whenever the story takes a new turn.'
            : 'Discover the paths your game master has created. Choose the strengths and story that suit you.'}
        </p>
        {showAppearance ? (
          <>
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
                  options={hairStyles.map((style, index) => ({
                    value: String(index),
                    label: style,
                  }))}
                />
              </label>
              <label>
                Hair color
                <FormSelect
                  label="Hair color"
                  value={String(appearance.hairColor)}
                  disabled={busy || saving}
                  onValueChange={(value) => change('hairColor', value)}
                  options={dyeColors.map((color, index) => ({
                    value: color,
                    label: dyeNames[index],
                  }))}
                />
              </label>
              <label>
                Shirt style
                <FormSelect
                  label="Shirt style"
                  value={String(appearance.shirtStyle)}
                  disabled={busy || saving}
                  onValueChange={(value) => change('shirtStyle', Number(value))}
                  options={shirtStyles.map((style, index) => ({
                    value: String(index),
                    label: style,
                  }))}
                />
              </label>
              <label>
                Shirt color
                <FormSelect
                  label="Shirt color"
                  value={String(appearance.shirtColor)}
                  disabled={busy || saving}
                  onValueChange={(value) => change('shirtColor', value)}
                  options={dyeColors.map((color, index) => ({
                    value: color,
                    label: dyeNames[index],
                  }))}
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
          </>
        ) : (
          <ClassPicker
            classes={classes}
            characterClass={characterClass}
            subclass={subclass}
            disabled={busy || saving}
            onClassChange={(classId) =>
              setAppearance((previous) => {
                const look = { ...previous };
                delete look.classId;
                delete look.subclassId;
                return { ...look, ...(classId ? { classId } : {}) };
              })
            }
            onSubclassChange={(subclassId) =>
              setAppearance((previous) => {
                const look = { ...previous };
                delete look.subclassId;
                return { ...look, ...(subclassId ? { subclassId } : {}) };
              })
            }
          />
        )}
        {classes.length === 0 && (
          <p className="subtle">No classes available. Your game master can add them.</p>
        )}
        <ClassSummary characterClass={characterClass} subclass={subclass} />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!editing && showAppearance && classes.length > 0 && (
        <button
          type="button"
          className="button secondary wide character-back"
          disabled={busy || saving}
          onClick={() => navigate('class')}
        >
          Back to Classes
        </button>
      )}
      <button type="submit" className="button primary wide" disabled={busy || saving}>
        {saving && <LoaderCircle size={16} className="spin" />}
        {editing ? 'Save character' : showAppearance ? 'Enter tabletop' : 'Next: Appearance'}
      </button>
    </form>
  );
}
