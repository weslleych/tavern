'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2, LoaderCircle } from 'lucide-react';
import { attributeDefinitions, calculateAttributes } from '../lib/classes';
import { classesSchema, readableError } from '../lib/validation';
import type { CharacterClass, CharacterSubclass, CharacterTrait } from '../types/game';
import { Modal } from './ui/modal';
import { FormSelect } from './ui/select';

function newDefinition(): CharacterSubclass {
  return {
    id: crypto.randomUUID(),
    name: 'New class',
    description: '',
    attributes: calculateAttributes(),
    healthModifier: 0,
    buffs: [],
    debuffs: [],
  };
}

function TraitEditor({
  kind,
  traits,
  onChange,
}: {
  kind: 'Buff' | 'Debuff';
  traits: CharacterTrait[];
  onChange: (traits: CharacterTrait[]) => void;
}) {
  return (
    <fieldset className="trait-editor">
      <legend>{kind}s</legend>
      {traits.map((trait) => (
        <div className="trait-editor-row" key={trait.id}>
          <label>
            {kind} name
            <input
              aria-label={`${kind} name`}
              value={trait.name}
              required
              maxLength={60}
              onChange={(event) =>
                onChange(
                  traits.map((item) =>
                    item.id === trait.id ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <label>
            {kind} description
            <textarea
              aria-label={`${kind} description`}
              value={trait.description}
              maxLength={240}
              rows={2}
              onChange={(event) =>
                onChange(
                  traits.map((item) =>
                    item.id === trait.id ? { ...item, description: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${kind.toLowerCase()} ${trait.name}`}
            onClick={() => onChange(traits.filter((item) => item.id !== trait.id))}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={traits.length >= 8}
        onClick={() =>
          onChange([
            ...traits,
            { id: crypto.randomUUID(), name: `New ${kind.toLowerCase()}`, description: '' },
          ])
        }
      >
        <Plus size={16} aria-hidden="true" /> Add {kind.toLowerCase()}
      </button>
    </fieldset>
  );
}

function DefinitionEditor({
  kind,
  value,
  onChange,
}: {
  kind: 'Class' | 'Subclass';
  value: CharacterSubclass;
  onChange: (value: CharacterSubclass) => void;
}) {
  return (
    <div className="definition-editor">
      <label>
        {kind} name
        <input
          aria-label={`${kind} name`}
          required
          maxLength={60}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        {kind} description
        <textarea
          aria-label={`${kind} description`}
          maxLength={240}
          rows={2}
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>
      <fieldset className="modifier-editor">
        <legend>{kind} modifiers</legend>
        <p className="subtle">Added to your character’s d20 checks. Each modifier: -100 to +100.</p>
        <div className="modifier-fields">
          {attributeDefinitions.map(({ id, name }) => (
            <label key={id}>
              {name}
              <input
                aria-label={`${kind} ${name}`}
                type="number"
                required
                min={-100}
                max={100}
                step={1}
                defaultValue={value.attributes[id]}
                onChange={(event) =>
                  onChange({
                    ...value,
                    attributes: { ...value.attributes, [id]: event.target.valueAsNumber },
                  })
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        {kind} health modifier
        <input
          aria-label={`${kind} health modifier`}
          type="number"
          required
          min={-100}
          max={100}
          step={1}
          defaultValue={value.healthModifier ?? 0}
          onChange={(event) => onChange({ ...value, healthModifier: event.target.valueAsNumber })}
        />
      </label>
      <p className="subtle">Adds to base 20 HP and specialization HP. Use -100 to +100.</p>
      <TraitEditor
        kind="Buff"
        traits={value.buffs}
        onChange={(buffs) => onChange({ ...value, buffs })}
      />
      <TraitEditor
        kind="Debuff"
        traits={value.debuffs}
        onChange={(debuffs) => onChange({ ...value, debuffs })}
      />
    </div>
  );
}

export function ClassManager({
  classes,
  busy,
  error = '',
  onSave,
  onClose,
}: {
  classes: CharacterClass[];
  busy: boolean;
  error?: string;
  onSave: (classes: CharacterClass[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(classes));
  const [classId, setClassId] = useState(classes[0]?.id);
  const [subclassId, setSubclassId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  const [localError, setLocalError] = useState('');
  const characterClass = draft.find((item) => item.id === classId);
  const subclass = characterClass?.subclasses.find((item) => item.id === subclassId);
  const disabled = busy || saving;
  function updateClass(value: CharacterClass) {
    setDraft((previous) => previous.map((item) => (item.id === value.id ? value : item)));
    setLocalError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || busy) return;
    const parsed = classesSchema.safeParse(draft);
    if (!parsed.success) {
      setLocalError(readableError(parsed.error));
      return;
    }
    sending.current = true;
    setSaving(true);
    setLocalError('');
    try {
      if (await onSave(parsed.data)) onClose();
      else setLocalError('The classes could not be saved. Please try again.');
    } catch (error) {
      setLocalError(readableError(error));
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }
  return (
    <Modal title="Manage classes" onClose={onClose}>
      <form className="class-manager" onSubmit={submit}>
        <p className="modal-description">
          Shape the classes for this table. Subclass modifiers add to class modifiers; buffs and
          debuffs describe narrative traits.
        </p>
        <fieldset disabled={disabled} className="class-manager-fields">
          <div className="class-manager-actions">
            {draft.length > 0 && (
              <label>
                Edit class
                <FormSelect
                  label="Edit class"
                  value={classId}
                  disabled={disabled}
                  onValueChange={(id) => {
                    if (draft.some((item) => item.id === id)) {
                      setClassId(id);
                      setSubclassId(undefined);
                    }
                  }}
                  options={draft.map((item) => ({
                    value: item.id,
                    label: item.name || 'Unnamed class',
                  }))}
                />
              </label>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={disabled || draft.length >= 16}
              onClick={() => {
                const value = { ...newDefinition(), subclasses: [] };
                setDraft([...draft, value]);
                setClassId(value.id);
                setSubclassId(undefined);
              }}
            >
              <Plus size={16} aria-hidden="true" /> Add class
            </button>
          </div>
          {!characterClass ? (
            <p className="subtle">No classes yet.</p>
          ) : (
            <>
              <DefinitionEditor
                key={characterClass.id}
                kind="Class"
                value={characterClass}
                onChange={(value) =>
                  updateClass({ ...value, subclasses: characterClass.subclasses })
                }
              />
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  const next = draft.filter((item) => item.id !== characterClass.id);
                  setDraft(next);
                  setClassId(next[0]?.id);
                  setSubclassId(undefined);
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> Delete class
              </button>
              <section className="subclass-editor" aria-label="Subclasses">
                <h3>Subclasses</h3>
                <div className="class-manager-actions">
                  {characterClass.subclasses.length > 0 && (
                    <label>
                      Edit subclass
                      <FormSelect
                        label="Edit subclass"
                        value={subclassId ?? '__none'}
                        disabled={disabled}
                        onValueChange={(id) => {
                          if (
                            id === '__none' ||
                            characterClass.subclasses.some((item) => item.id === id)
                          )
                            setSubclassId(id === '__none' ? undefined : id);
                        }}
                        options={[
                          { value: '__none', label: 'Choose a subclass' },
                          ...characterClass.subclasses.map((item) => ({
                            value: item.id,
                            label: item.name || 'Unnamed subclass',
                          })),
                        ]}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    disabled={disabled || characterClass.subclasses.length >= 8}
                    onClick={() => {
                      const value = { ...newDefinition(), name: 'New subclass' };
                      updateClass({
                        ...characterClass,
                        subclasses: [...characterClass.subclasses, value],
                      });
                      setSubclassId(value.id);
                    }}
                  >
                    <Plus size={16} aria-hidden="true" /> Add subclass
                  </button>
                </div>
                {subclass && (
                  <>
                    <DefinitionEditor
                      key={subclass.id}
                      kind="Subclass"
                      value={subclass}
                      onChange={(value) =>
                        updateClass({
                          ...characterClass,
                          subclasses: characterClass.subclasses.map((item) =>
                            item.id === value.id ? value : item,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        updateClass({
                          ...characterClass,
                          subclasses: characterClass.subclasses.filter(
                            (item) => item.id !== subclass.id,
                          ),
                        });
                        setSubclassId(undefined);
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" /> Delete subclass
                    </button>
                  </>
                )}
              </section>
            </>
          )}
        </fieldset>
        {(localError || error) && (
          <p role="alert" className="form-error">
            {localError || error}
          </p>
        )}
        <p className="subtle">
          Changes apply when saved. Removing a class or subclass clears that selection from affected
          characters.
        </p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={disabled}>
            {saving && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save classes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
