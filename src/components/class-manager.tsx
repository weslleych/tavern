'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2, LoaderCircle } from 'lucide-react';
import { attributeDefinitions, calculateAttributes } from '../lib/classes';
import { classesSchema, readableError } from '../lib/validation';
import type { CharacterClass, CharacterSubclass, CharacterTrait } from '../types/game';
import { Modal } from './ui/modal';
import { FormSelect } from './ui/select';
import { useClassCatalog } from '../i18n/use-class-catalog';
import { useErrorMessage } from '../i18n/use-error-message';

function newDefinition(name: string): CharacterSubclass {
  return {
    id: crypto.randomUUID(),
    name,
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
  displayTraits,
  onChange,
}: {
  kind: 'Buff' | 'Debuff';
  traits: CharacterTrait[];
  displayTraits: CharacterTrait[];
  onChange: (traits: CharacterTrait[]) => void;
}) {
  const t = useTranslations();
  const isBuff = kind === 'Buff';
  const kindLabel = t(isBuff ? 'classes.buff' : 'classes.debuff');
  return (
    <fieldset className="trait-editor">
      <legend>{t(isBuff ? 'classes.buffs' : 'classes.debuffs')}</legend>
      {traits.map((trait) => (
        <div className="trait-editor-row" key={trait.id}>
          <label>
            {t(isBuff ? 'classes.buffName' : 'classes.debuffName')}
            <input
              aria-label={t(isBuff ? 'classes.buffName' : 'classes.debuffName')}
              value={displayTraits.find((item) => item.id === trait.id)?.name ?? trait.name}
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
            {t(isBuff ? 'classes.buffDescription' : 'classes.debuffDescription')}
            <textarea
              aria-label={t(isBuff ? 'classes.buffDescription' : 'classes.debuffDescription')}
              value={
                displayTraits.find((item) => item.id === trait.id)?.description ?? trait.description
              }
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
            aria-label={t('classes.removeTrait', {
              kind: kindLabel.toLowerCase(),
              name: displayTraits.find((item) => item.id === trait.id)?.name ?? trait.name,
            })}
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
            {
              id: crypto.randomUUID(),
              name: t(isBuff ? 'classes.newBuff' : 'classes.newDebuff'),
              description: '',
            },
          ])
        }
      >
        <Plus size={16} aria-hidden="true" />{' '}
        {t('classes.addTrait', { kind: kindLabel.toLowerCase() })}
      </button>
    </fieldset>
  );
}

function DefinitionEditor({
  kind,
  value,
  displayValue,
  onChange,
}: {
  kind: 'Class' | 'Subclass';
  value: CharacterSubclass;
  displayValue: CharacterSubclass;
  onChange: (value: CharacterSubclass) => void;
}) {
  const t = useTranslations();
  const kindLabel = t(kind === 'Class' ? 'classes.class' : 'classes.subclass');
  return (
    <div className="definition-editor">
      <label>
        {t('classes.definitionName', { kind: kindLabel })}
        <input
          aria-label={t('classes.definitionName', { kind: kindLabel })}
          required
          maxLength={60}
          value={displayValue.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        {t('classes.definitionDescription', { kind: kindLabel })}
        <textarea
          aria-label={t('classes.definitionDescription', { kind: kindLabel })}
          maxLength={240}
          rows={2}
          value={displayValue.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>
      <fieldset className="modifier-editor">
        <legend>{t('classes.definitionModifiers', { kind: kindLabel })}</legend>
        <p className="subtle">{t('classes.modifierHint')}</p>
        <div className="modifier-fields">
          {attributeDefinitions.map(({ id }) => (
            <label key={id}>
              {t(`classes.attributes.${id}.name`)}
              <input
                aria-label={t('classes.attributeField', {
                  kind: kindLabel,
                  attribute: t(`classes.attributes.${id}.name`),
                })}
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
        {t('classes.definitionHealth', { kind: kindLabel })}
        <input
          aria-label={t('classes.definitionHealth', { kind: kindLabel })}
          type="number"
          required
          min={-100}
          max={100}
          step={1}
          defaultValue={value.healthModifier ?? 0}
          onChange={(event) => onChange({ ...value, healthModifier: event.target.valueAsNumber })}
        />
      </label>
      <p className="subtle">{t('classes.healthModifierHint')}</p>
      <TraitEditor
        kind="Buff"
        traits={value.buffs}
        displayTraits={displayValue.buffs}
        onChange={(buffs) => onChange({ ...value, buffs })}
      />
      <TraitEditor
        kind="Debuff"
        traits={value.debuffs}
        displayTraits={displayValue.debuffs}
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
  const t = useTranslations();
  const formatError = useErrorMessage();
  const [draft, setDraft] = useState(() => structuredClone(classes));
  const displayCatalog = useClassCatalog(draft);
  const [classId, setClassId] = useState(classes[0]?.id);
  const [subclassId, setSubclassId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  const [localError, setLocalError] = useState('');
  const characterClass = draft.find((item) => item.id === classId);
  const subclass = characterClass?.subclasses.find((item) => item.id === subclassId);
  const displayClass = displayCatalog.find((item) => item.id === classId);
  const displaySubclass = displayClass?.subclasses.find((item) => item.id === subclassId);
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
    <Modal title={t('tabletop.manageClasses')} onClose={onClose}>
      <form className="class-manager" onSubmit={submit}>
        <p className="modal-description">{t('classes.managerDescription')}</p>
        <fieldset disabled={disabled} className="class-manager-fields">
          <div className="class-manager-actions">
            {draft.length > 0 && (
              <label>
                {t('classes.editClass')}{' '}
                <FormSelect
                  label={t('classes.editClass')}
                  value={classId}
                  disabled={disabled}
                  onValueChange={(id) => {
                    if (draft.some((item) => item.id === id)) {
                      setClassId(id);
                      setSubclassId(undefined);
                    }
                  }}
                  options={displayCatalog.map((item) => ({
                    value: item.id,
                    label: item.name || t('classes.unnamedClass'),
                  }))}
                />
              </label>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={disabled || draft.length >= 16}
              onClick={() => {
                const value = { ...newDefinition(t('classes.newClass')), subclasses: [] };
                setDraft([...draft, value]);
                setClassId(value.id);
                setSubclassId(undefined);
              }}
            >
              <Plus size={16} aria-hidden="true" /> {t('classes.addClass')}
            </button>
          </div>
          {!characterClass ? (
            <p className="subtle">{t('classes.noClassesYet')}</p>
          ) : (
            <>
              <DefinitionEditor
                key={characterClass.id}
                kind="Class"
                value={characterClass}
                displayValue={displayClass ?? characterClass}
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
                <Trash2 size={16} aria-hidden="true" /> {t('classes.deleteClass')}
              </button>
              <section className="subclass-editor" aria-label={t('classes.subclasses')}>
                <h3>{t('classes.subclasses')}</h3>
                <div className="class-manager-actions">
                  {characterClass.subclasses.length > 0 && (
                    <label>
                      {t('classes.editSubclass')}{' '}
                      <FormSelect
                        label={t('classes.editSubclass')}
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
                          { value: '__none', label: t('classes.chooseSubclass') },
                          ...(displayClass ?? characterClass).subclasses.map((item) => ({
                            value: item.id,
                            label: item.name || t('classes.unnamedSubclass'),
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
                      const value = newDefinition(t('classes.newSubclass'));
                      updateClass({
                        ...characterClass,
                        subclasses: [...characterClass.subclasses, value],
                      });
                      setSubclassId(value.id);
                    }}
                  >
                    <Plus size={16} aria-hidden="true" /> {t('classes.addSubclass')}
                  </button>
                </div>
                {subclass && (
                  <>
                    <DefinitionEditor
                      key={subclass.id}
                      kind="Subclass"
                      value={subclass}
                      displayValue={displaySubclass ?? subclass}
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
                      <Trash2 size={16} aria-hidden="true" /> {t('classes.deleteSubclass')}
                    </button>
                  </>
                )}
              </section>
            </>
          )}
        </fieldset>
        {(localError || error) && (
          <p role="alert" className="form-error">
            {formatError(localError || error)}
          </p>
        )}
        <p className="subtle">{t('classes.saveHint')}</p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="button primary" type="submit" disabled={disabled}>
            {saving && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
            {saving ? t('common.saving') : t('classes.saveClasses')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
