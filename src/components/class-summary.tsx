import {
  attributeDefinitions,
  calculateAttributes,
  calculateTraits,
  signedModifier,
} from '../lib/classes';
import type { CharacterClass, CharacterSubclass } from '../types/game';

export function ClassSummary({
  characterClass,
  subclass,
}: {
  characterClass?: CharacterClass;
  subclass?: CharacterSubclass;
}) {
  const attributes = calculateAttributes(characterClass, subclass);
  const traits = calculateTraits(characterClass, subclass);
  return (
    <section className="class-summary" aria-label="Character attributes">
      <h3>
        {characterClass?.name ?? 'Attributes'}
        {subclass ? ` · ${subclass.name}` : ''}
      </h3>
      {characterClass?.description && <p>{characterClass.description}</p>}
      {subclass?.description && <p>{subclass.description}</p>}
      <dl className="attribute-grid">
        {attributeDefinitions.map(({ id, name, abbreviation }) => (
          <div key={id}>
            <dt>
              <abbr title={name}>{abbreviation}</abbr>
              <span>{name}</span>
            </dt>
            <dd
              className={
                attributes[id] > 0 ? 'positive' : attributes[id] < 0 ? 'negative' : undefined
              }
              data-testid={`attribute-${id}`}
            >
              {signedModifier(attributes[id])}
            </dd>
          </div>
        ))}
      </dl>
      <div className="trait-badges">
        {(['buffs', 'debuffs'] as const).flatMap((kind) =>
          traits[kind].map((trait, index) => (
            <span className={`trait-badge ${kind}`} key={`${kind}-${trait.id}-${index}`}>
              <strong>
                {kind === 'buffs' ? 'Buff' : 'Debuff'} · {trait.name}
              </strong>
              {trait.description && <small>{trait.description}</small>}
            </span>
          )),
        )}
      </div>
    </section>
  );
}
