import { useTranslations } from 'next-intl';
import {
  attributeDefinitions,
  calculateAttributes,
  calculateTraits,
  signedModifier,
  calculateMaxHealth,
} from '../lib/classes';
import type { CharacterClass, CharacterSubclass } from '../types/game';
import { useClassCatalog } from '../i18n/use-class-catalog';

export function ClassSummary({
  characterClass: selectedClass,
  subclass: selectedSubclass,
}: {
  characterClass?: CharacterClass;
  subclass?: CharacterSubclass;
}) {
  const t = useTranslations();
  const classes = useClassCatalog(selectedClass ? [selectedClass] : []);
  const characterClass = classes[0];
  const subclass = characterClass?.subclasses.find((item) => item.id === selectedSubclass?.id);
  const attributes = calculateAttributes(characterClass, subclass);
  const traits = calculateTraits(characterClass, subclass);
  return (
    <section className="class-summary" aria-label={t('classes.characterAttributes')}>
      <h3>
        {characterClass?.name ?? t('classes.attributesTitle')}
        {subclass ? ` · ${subclass.name}` : ''}
      </h3>
      {characterClass?.description && <p>{characterClass.description}</p>}
      {subclass?.description && <p>{subclass.description}</p>}
      <p className="class-health-summary">
        <strong>
          {t('classes.maximumHP')} {calculateMaxHealth(characterClass, subclass)}
        </strong>{' '}
        {t('classes.baseHP')}{' '}
        {characterClass &&
          t('classes.classHP', {
            modifier: signedModifier(characterClass.healthModifier ?? 0),
            hp: t('common.hp'),
          })}
        {subclass &&
          t('classes.subclassHP', {
            modifier: signedModifier(subclass.healthModifier ?? 0),
            hp: t('common.hp'),
          })}
      </p>
      <dl className="attribute-grid">
        {attributeDefinitions.map(({ id }) => (
          <div key={id}>
            <dt>
              <abbr title={t(`classes.attributes.${id}.name`)}>
                {t(`classes.attributes.${id}.abbreviation`)}
              </abbr>
              <span>{t(`classes.attributes.${id}.name`)}</span>
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
                {kind === 'buffs' ? t('classes.buff') : t('classes.debuff')} · {trait.name}
              </strong>
              {trait.description && <small>{trait.description}</small>}
            </span>
          )),
        )}
      </div>
    </section>
  );
}
