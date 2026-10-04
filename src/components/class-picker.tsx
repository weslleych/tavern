import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Check } from 'lucide-react';
import {
  attributeDefinitions,
  signedModifier,
  calculateMaxHealth,
  DEFAULT_BASE_HP,
} from '../lib/classes';
import type { CharacterClass, CharacterSubclass } from '../types/game';
import { useClassCatalog } from '../i18n/use-class-catalog';

function ChoiceDetails({
  definition,
  baseClass,
}: {
  definition: CharacterSubclass;
  baseClass?: CharacterClass;
}) {
  const t = useTranslations();
  return (
    <>
      {definition.description && (
        <span className="class-card-description">{definition.description}</span>
      )}
      <span className="modifier-badges">
        <span
          className={`modifier-badge ${(definition.healthModifier ?? 0) >= 0 ? 'positive' : 'negative'}`}
        >
          {signedModifier(definition.healthModifier ?? 0)} {t('common.hp')}
        </span>
        {attributeDefinitions.flatMap(({ id }) =>
          definition.attributes[id] ? (
            <span
              className={`modifier-badge ${definition.attributes[id] > 0 ? 'positive' : 'negative'}`}
              key={id}
              title={t(`classes.attributes.${id}.name`)}
            >
              {signedModifier(definition.attributes[id])}{' '}
              {t(`classes.attributes.${id}.abbreviation`)}
            </span>
          ) : (
            []
          ),
        )}
      </span>
      <span className="class-card-description">
        {t('classes.maximumHP')}{' '}
        {baseClass ? calculateMaxHealth(baseClass, definition) : calculateMaxHealth(definition)}
      </span>
      <span className="trait-badges">
        {(['buffs', 'debuffs'] as const).flatMap((kind) =>
          definition[kind].map((trait) => (
            <span
              className={`trait-badge ${kind}`}
              key={`${kind}-${trait.id}`}
              title={trait.description}
            >
              {kind === 'buffs' ? t('classes.buff') : t('classes.debuff')} · {trait.name}
            </span>
          )),
        )}
      </span>
    </>
  );
}

export function ClassPicker({
  classes: catalog,
  characterClass: selectedClass,
  subclass: selectedSubclass,
  disabled,
  onClassChange,
  onSubclassChange,
}: {
  classes: CharacterClass[];
  characterClass?: CharacterClass;
  subclass?: CharacterSubclass;
  disabled: boolean;
  onClassChange: (id?: string) => void;
  onSubclassChange: (id?: string) => void;
}) {
  const t = useTranslations();
  const classes = useClassCatalog(catalog);
  const characterClass = classes.find((item) => item.id === selectedClass?.id);
  const subclass = characterClass?.subclasses.find((item) => item.id === selectedSubclass?.id);
  const id = useId();
  return (
    <div className="class-picker">
      <div className="class-cards-grid" role="radiogroup" aria-label={t('classes.class')}>
        <label className={`class-card ${!characterClass ? 'class-card-selected' : ''}`}>
          <input
            className="class-choice-radio"
            type="radio"
            name={`${id}-class`}
            aria-label={t('classes.noClass')}
            checked={!characterClass}
            disabled={disabled}
            onChange={() => onClassChange()}
          />
          <span className="class-card-heading">
            {t('classes.noClass')} {!characterClass && <Check size={16} aria-hidden="true" />}
          </span>
          <span className="class-card-description">{t('classes.freeform')}</span>
          <span className="class-card-description">
            {t('classes.maximumHP')} {DEFAULT_BASE_HP}
          </span>
        </label>
        {classes.map((item) => (
          <label
            className={`class-card ${characterClass?.id === item.id ? 'class-card-selected' : ''}`}
            key={item.id}
          >
            <input
              className="class-choice-radio"
              type="radio"
              name={`${id}-class`}
              aria-label={item.name}
              checked={characterClass?.id === item.id}
              disabled={disabled}
              onChange={() => onClassChange(item.id)}
            />
            <span className="class-card-heading">
              {item.name} {characterClass?.id === item.id && <Check size={16} aria-hidden="true" />}
            </span>
            <ChoiceDetails definition={item} />
          </label>
        ))}
      </div>
      {characterClass && characterClass.subclasses.length > 0 && (
        <section className="subclass-choices" aria-label={t('classes.specializations')}>
          <h3>{t('classes.chooseSpecialization')}</h3>
          <p className="subtle">{t('classes.specializationDescription')}</p>
          <div
            className="subclass-chips"
            role="radiogroup"
            aria-label={t('classes.specialization')}
          >
            <label className={`subclass-chip ${!subclass ? 'class-card-selected' : ''}`}>
              <input
                className="class-choice-radio"
                type="radio"
                name={`${id}-subclass`}
                aria-label={t('classes.noSpecialization')}
                checked={!subclass}
                disabled={disabled}
                onChange={() => onSubclassChange()}
              />
              <span className="class-card-heading">
                {t('classes.noSpecialization')}{' '}
                {!subclass && <Check size={16} aria-hidden="true" />}
              </span>
            </label>
            {characterClass.subclasses.map((item) => (
              <label
                className={`subclass-chip ${subclass?.id === item.id ? 'class-card-selected' : ''}`}
                key={item.id}
              >
                <input
                  className="class-choice-radio"
                  type="radio"
                  name={`${id}-subclass`}
                  aria-label={item.name}
                  checked={subclass?.id === item.id}
                  disabled={disabled}
                  onChange={() => onSubclassChange(item.id)}
                />
                <span className="class-card-heading">
                  {item.name} {subclass?.id === item.id && <Check size={16} aria-hidden="true" />}
                </span>
                <ChoiceDetails definition={item} baseClass={characterClass} />
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
