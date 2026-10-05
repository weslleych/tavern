'use client';

import { useFormatter, useTranslations } from 'next-intl';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Crown, Dices, Sparkles, UserRound, X } from 'lucide-react';
import { diceSides, formatDiceNotation, parseDiceNotation } from '../lib/dice-notation';
import { useMediaQuery } from '../lib/use-media-query';
import {
  attributeDefinitions,
  calculateAttributes,
  findClassSelection,
  signedModifier,
} from '../lib/classes';
import type { DiceRequest, DiceRoll, CharacterAppearance, CharacterClass } from '../types/game';

const shapes: Record<number, { outline: string; facets: string }> = {
  4: { outline: 'M24 3 46 43H2Z', facets: 'M24 3 16 32 2 43M16 32 46 43' },
  6: {
    outline: 'M8 6H34L44 16V42H18L8 32Z',
    facets: 'M8 6 18 16H44M18 16V42M34 6V32H8M34 32 44 42',
  },
  8: { outline: 'M24 2 44 24 24 46 4 24Z', facets: 'M24 2V46M4 24H44' },
  10: {
    outline: 'M24 2 44 20 36 40 24 46 12 40 4 20Z',
    facets: 'M24 2 12 25 24 46 36 25 24 2M4 20 12 25 36 25 44 20',
  },
  12: {
    outline: 'M14 3H34L46 18 40 39 24 46 8 39 2 18Z',
    facets:
      'M14 3 13 17 2 18M34 3 35 17 46 18M13 17 24 10 35 17 31 31H17ZM17 31 8 39M31 31 40 39M24 46 24 36',
  },
  20: {
    outline: 'M24 2 44 13V35L24 46 4 35V13Z',
    facets:
      'M24 2 12 17 4 13M24 2 36 17 44 13M12 17H36L24 36ZM4 35 12 17 24 46 36 17 44 35M4 35 24 36 44 35',
  },
};

function DieShape({ sides }: { sides: number }) {
  const shape = shapes[sides] ?? shapes[20];
  return (
    <svg viewBox="0 0 48 48" width="32" height="32" aria-hidden="true" className="die-shape">
      <path d={shape.outline} className="die-outline" />
      <path d={shape.facets} className="die-facets" />
    </svg>
  );
}

function RollCard({
  roll,
  animateUntil,
  reducedMotion,
}: {
  roll: DiceRoll;
  animateUntil?: number;
  reducedMotion: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const [animationUntil] = useState(animateUntil ?? 0);
  const [phase, setPhase] = useState<'rolling' | 'settling' | 'settled'>(() =>
    animationUntil > Date.now() ? 'rolling' : 'settled',
  );
  const rolling = phase === 'rolling' && !reducedMotion;
  useEffect(() => {
    if (phase === 'settled') return;
    const next = phase === 'rolling' ? 'settling' : 'settled';
    const until = animationUntil + (phase === 'settling' ? 200 : 0);
    const timer = setTimeout(() => setPhase(next), Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [phase, animationUntil]);
  const modifier = roll.modifier
    ? ` ${roll.modifier > 0 ? '+' : '-'} ${Math.abs(roll.modifier)}`
    : '';
  const gm = roll.role === 'gm';
  const initiative = /^Initiative \(Round (\d+)\)$/.exec(roll.label ?? '');
  return (
    <li className="dice-roll-card" data-state={rolling ? 'rolling' : 'settled'}>
      <div className="dice-roll-author">
        <span
          className={`dice-role ${gm ? 'dice-role-gm' : ''}`}
          role="img"
          aria-label={gm ? t('common.gameMaster') : t('common.player')}
        >
          {gm ? <Crown size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}
        </span>
        <strong>{roll.nickname}</strong>
        <time
          dateTime={roll.createdAt}
          title={format.dateTime(new Date(roll.createdAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        >
          {format.dateTime(new Date(roll.createdAt), {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </time>
      </div>
      <div className="dice-roll-result">
        <div className="dice-roll-details">
          {roll.label && (
            <span className="dice-test-label">
              {roll.attribute
                ? t('dice.attributeCheck', {
                    attribute: t(`classes.attributes.${roll.attribute}.name`),
                  })
                : initiative
                  ? t('combat.initiative', { round: Number(initiative[1]) })
                  : roll.label}
              {roll.attribute ? ` · ${signedModifier(roll.modifier)}` : ''}
            </span>
          )}
          <span className="dice-formula">{formatDiceNotation(roll)}</span>
          {rolling ? (
            <span className="dice-rolling-label">{t('dice.rolling')}</span>
          ) : (
            <span
              className="dice-breakdown"
              data-testid="dice-breakdown"
            >{`[${roll.values.join(', ')}]${modifier}`}</span>
          )}
        </div>
        {rolling ? (
          <div className="dice-tumble" aria-hidden="true">
            <DieShape sides={roll.sides} />
            <span className="dice-number-window">
              <span className="dice-number-reel">
                {[
                  1,
                  roll.sides,
                  Math.ceil(roll.sides / 2),
                  2,
                  Math.max(1, roll.sides - 1),
                  Math.ceil(roll.sides / 3),
                ].map((face, index) => (
                  <span key={index}>{face}</span>
                ))}
              </span>
            </span>
          </div>
        ) : (
          <b
            className={
              phase === 'settling' && !reducedMotion ? 'dice-total dice-settle' : 'dice-total'
            }
            data-testid="dice-total"
          >
            {roll.total}
          </b>
        )}
      </div>
      {!rolling && roll.sides === 20 && (
        <div className="dice-highlights">
          {roll.values.includes(20) && (
            <span className="dice-natural dice-natural-high">
              <Sparkles size={12} aria-hidden="true" /> {t('dice.natural20')}
            </span>
          )}
          {roll.values.includes(1) && (
            <span className="dice-natural dice-natural-low">{t('dice.natural1')}</span>
          )}
        </div>
      )}
      {animateUntil && (
        <p className="sr-only" role="status">
          {rolling
            ? t('dice.rollingAnnouncement', {
                nickname: roll.nickname,
                formula: formatDiceNotation(roll),
              })
            : t('dice.rolledAnnouncement', {
                nickname: roll.nickname,
                formula: formatDiceNotation(roll),
                total: roll.total,
              })}
        </p>
      )}
    </li>
  );
}

export function DiceSidebar({
  rolls,
  rollAnimations,
  disabled,
  open,
  mobile,
  onRoll,
  onClose,
  classes,
  character,
}: {
  rolls: DiceRoll[];
  rollAnimations: Record<string, number>;
  disabled: boolean;
  open: boolean;
  mobile: boolean;
  onRoll: (request: DiceRequest) => Promise<boolean>;
  onClose: () => void;
  classes?: CharacterClass[];
  character?: CharacterAppearance;
}) {
  const t = useTranslations();
  const selection = findClassSelection(classes ?? [], character?.classId, character?.subclassId);
  const attributes = calculateAttributes(selection?.characterClass, selection?.subclass);
  const [expression, setExpression] = useState('d20');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const sending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const newestId = rolls.at(-1)?.id;
  useEffect(() => {
    const drawer = dialog.current;
    if (!mobile || !drawer) return;
    if (open) {
      drawer.showModal();
      input.current?.focus({ preventScroll: true });
    }
    return () => drawer.close();
  }, [mobile, open]);
  useEffect(() => {
    history.current?.scrollTo({ top: 0 });
  }, [newestId]);

  async function roll(request: DiceRequest) {
    if (disabled || sending.current) return;
    sending.current = true;
    setPending(true);
    setError('');
    try {
      if (!(await onRoll(request))) setError(t('dice.saveDisconnected'));
    } catch {
      setError(t('dice.saveError'));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || sending.current) return;
    const request = parseDiceNotation(expression);
    if (!request) {
      setError(t('dice.notationHint'));
      return;
    }
    void roll(request);
  }
  const content = (
    <div className="dice-panel">
      <header className="dice-heading">
        <div>
          <h2 id="dice-heading">
            <Dices size={21} aria-hidden="true" /> {t('dice.log')}
          </h2>
          <p>{t('dice.sharedLuck')}</p>
        </div>
        <button className="icon-button" aria-label={t('dice.closeDice')} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      {selection && (
        <div className="attribute-checks" role="group" aria-label={t('dice.attributeChecks')}>
          <h3>{t('dice.attributeChecks')}</h3>
          <div>
            {attributeDefinitions.map(({ id }) => (
              <button
                type="button"
                key={id}
                disabled={disabled || pending}
                aria-label={t('dice.attributeButton', {
                  attribute: t(`classes.attributes.${id}.name`),
                  modifier: signedModifier(attributes[id]),
                })}
                onClick={() =>
                  void roll({ sides: 20, count: 1, modifier: attributes[id], attribute: id })
                }
              >
                <span>{t(`classes.attributes.${id}.abbreviation`)}</span>
                <strong>{signedModifier(attributes[id])}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
      <form className="dice-roller" onSubmit={submit} aria-label={t('dice.rollDice')}>
        <div className="dice-quick-rolls" role="group" aria-label={t('dice.quickRolls')}>
          {diceSides.map((sides) => (
            <button
              key={sides}
              type="button"
              aria-label={t('dice.rollDie', { sides })}
              disabled={disabled || pending}
              onClick={() => void roll({ sides, count: 1, modifier: 0 })}
            >
              <DieShape sides={sides} />
              <span>d{sides}</span>
            </button>
          ))}
        </div>
        <label htmlFor="dice-expression">{t('dice.expression')}</label>
        <input
          ref={input}
          id="dice-expression"
          name="expression"
          value={expression}
          onChange={(event) => {
            setExpression(event.target.value);
            setError('');
          }}
          maxLength={32}
          placeholder="2d6+3"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          disabled={disabled || pending}
          aria-invalid={!!error}
          aria-describedby={error ? 'dice-input-error' : 'dice-input-hint'}
        />
        <p id="dice-input-hint" className="dice-input-hint">
          {t('dice.inputHint')}
        </p>
        {error && (
          <p id="dice-input-error" className="dice-input-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary wide" type="submit" disabled={disabled || pending}>
          <Dices size={16} aria-hidden="true" />
          {pending ? t('dice.rolling') : t('dice.rollDice')}
        </button>
        {disabled && (
          <p className="dice-input-hint" role="status">
            {t('dice.reconnect')}
          </p>
        )}
      </form>
      <div className="dice-log-scroll" ref={history}>
        <div className="dice-history-heading">
          <h3>{t('dice.partyRolls')}</h3>
          <span>{rolls.length} / 20</span>
        </div>
        <ol className="dice-history" data-testid="dice-history" aria-label={t('dice.partyHistory')}>
          {rolls.toReversed().map((roll) => (
            <RollCard
              key={roll.id}
              roll={roll}
              animateUntil={rollAnimations[roll.id]}
              reducedMotion={reducedMotion}
            />
          ))}
        </ol>
        {!rolls.length && (
          <div className="dice-empty">
            <Dices size={32} aria-hidden="true" />
            <p>{t('dice.firstRoll')}</p>
            <small>{t('dice.everyoneShares')}</small>
          </div>
        )}
        {rolls.length > 0 && <p className="dice-note">{t('dice.lastRolls')}</p>}
      </div>
    </div>
  );
  return mobile ? (
    <dialog
      id="dice-sidebar"
      ref={dialog}
      className="dice-drawer"
      aria-labelledby="dice-heading"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)',
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      {content}
    </dialog>
  ) : (
    <aside id="dice-sidebar" className="dice-sidebar" aria-labelledby="dice-heading" hidden={!open}>
      {content}
    </aside>
  );
}
