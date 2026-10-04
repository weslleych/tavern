import { useId } from 'react';
import { Check } from 'lucide-react';
import { attributeDefinitions, signedModifier } from '../lib/classes';
import type { CharacterClass, CharacterSubclass } from '../types/game';

function ChoiceDetails({ definition }: { definition: CharacterSubclass }) {
  return (
    <>
      {definition.description && (
        <span className="class-card-description">{definition.description}</span>
      )}
      <span className="modifier-badges">
        {attributeDefinitions.flatMap(({ id, abbreviation, name }) =>
          definition.attributes[id] ? (
            <span
              className={`modifier-badge ${definition.attributes[id] > 0 ? 'positive' : 'negative'}`}
              key={id}
              title={name}
            >
              {signedModifier(definition.attributes[id])} {abbreviation}
            </span>
          ) : (
            []
          ),
        )}
      </span>
      <span className="trait-badges">
        {(['buffs', 'debuffs'] as const).flatMap((kind) =>
          definition[kind].map((trait) => (
            <span
              className={`trait-badge ${kind}`}
              key={`${kind}-${trait.id}`}
              title={trait.description}
            >
              {kind === 'buffs' ? 'Buff' : 'Debuff'} · {trait.name}
            </span>
          )),
        )}
      </span>
    </>
  );
}

export function ClassPicker({
  classes,
  characterClass,
  subclass,
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
  const id = useId();
  return (
    <div className="class-picker">
      <div className="class-cards-grid" role="radiogroup" aria-label="Class">
        <label className={`class-card ${!characterClass ? 'class-card-selected' : ''}`}>
          <input
            className="class-choice-radio"
            type="radio"
            name={`${id}-class`}
            aria-label="No class"
            checked={!characterClass}
            disabled={disabled}
            onChange={() => onClassChange()}
          />
          <span className="class-card-heading">
            No class {!characterClass && <Check size={16} aria-hidden="true" />}
          </span>
          <span className="class-card-description">
            Follow your own path with a freeform adventurer.
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
        <section className="subclass-choices" aria-label="Specializations">
          <h3>Choose a specialization</h3>
          <p className="subtle">Build on your archetype, or keep its core strengths.</p>
          <div className="subclass-chips" role="radiogroup" aria-label="Specialization">
            <label className={`subclass-chip ${!subclass ? 'class-card-selected' : ''}`}>
              <input
                className="class-choice-radio"
                type="radio"
                name={`${id}-subclass`}
                aria-label="No specialization"
                checked={!subclass}
                disabled={disabled}
                onChange={() => onSubclassChange()}
              />
              <span className="class-card-heading">
                No specialization {!subclass && <Check size={16} aria-hidden="true" />}
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
                <ChoiceDetails definition={item} />
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
