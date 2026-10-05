'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Swords, SkipForward, LogOut } from 'lucide-react';
import type {
  Snapshot,
  PlayerAttackRequest,
  MonsterAttackRequest,
  DiceRequest,
} from '../types/game';
import { calculateAttributes, findClassSelection, characterClassTitle } from '../lib/classes';
import { classAttack, combatBackdrop, defaultAttacks } from '../lib/combat';
import { parseDiceNotation } from '../lib/dice-notation';
import { useClassCatalog } from '../i18n/use-class-catalog';
import { useErrorMessage } from '../i18n/use-error-message';
import { CharacterPortrait } from './character-creator';
import { MonsterPortrait, MonsterHealth, useMonsterName } from './bestiary-drawer';
import { HealthStatus } from './health-status';
import { CombatTransitionWipe, playBattleCue } from './combat-transition-wipe';

export function CombatArena({
  snapshot,
  busy,
  error,
  transition,
  onTransitionEnd,
  onPlayerAttack,
  onMonsterAttack,
  onNext,
  onEnd,
  onRoll,
}: {
  snapshot: Snapshot;
  busy: boolean;
  error: string;
  transition: 'enter' | 'exit' | null;
  onTransitionEnd: () => void;
  onPlayerAttack: (r: PlayerAttackRequest) => Promise<boolean>;
  onMonsterAttack: (r: MonsterAttackRequest) => Promise<boolean>;
  onNext: () => Promise<boolean>;
  onEnd: () => Promise<boolean>;
  onRoll: (r: DiceRequest) => Promise<boolean>;
}) {
  const t = useTranslations(),
    formatError = useErrorMessage(),
    name = useMonsterName(),
    ref = useRef<HTMLDialogElement>(null);
  const [targetId, setTargetId] = useState<string>(),
    [damageNotation, setDamageNotation] = useState(''),
    [freeRoll, setFreeRoll] = useState('1d20'),
    [localError, setLocalError] = useState('');
  const displayClasses = useClassCatalog(snapshot.room.classes);
  const combat = snapshot.room.activeCombat!,
    monster = snapshot.panel.monsters?.find((m) => m.id === combat.monsterId);
  const party =
    snapshot.combatParty ?? snapshot.members.filter((m) => combat.partyIds.includes(m.id));
  const isGM = snapshot.you.role === 'gm',
    active = combat.turnQueue[combat.turnIndex];
  const attacker = party.find((m) => m.id === active?.id);
  const selection = findClassSelection(
    snapshot.room.classes,
    attacker?.character?.classId,
    attacker?.character?.subclassId,
  );
  const attack = classAttack(selection?.characterClass),
    baseline = selection?.characterClass && defaultAttacks[selection.characterClass.id];
  const attackName =
    attack.id === 'basic'
      ? t('combat.basic')
      : baseline && attack.name === baseline.name
        ? t(`combat.${baseline.id}`)
        : attack.name;
  const modifier = calculateAttributes(selection?.characterClass, selection?.subclass)[
    attack.attributeId
  ];
  const canAct = !busy && combat.status === 'active' && (isGM || snapshot.you.id === active?.id);
  const effect = combat.lastAction;
  const [animatedAction, setAnimatedAction] = useState<string>();
  const seenAction = useRef(effect?.id);
  const entered = useRef(false),
    previousStatus = useRef(combat.status);
  useEffect(() => {
    if (transition === 'enter' && !entered.current) {
      entered.current = true;
      playBattleCue();
    }
  }, [transition]);
  useEffect(() => {
    if (combat.status === 'resolved' && previousStatus.current !== 'resolved' && monster?.defeated)
      playBattleCue(true);
    previousStatus.current = combat.status;
  }, [combat.status, monster?.defeated]);
  useEffect(() => {
    if (!effect || effect.id === seenAction.current) return;
    seenAction.current = effect.id;
    let activeEffect = true;
    queueMicrotask(() => {
      if (activeEffect) setAnimatedAction(effect.id);
    });
    const timer = setTimeout(() => setAnimatedAction(undefined), 750);
    return () => {
      activeEffect = false;
      clearTimeout(timer);
    };
  }, [effect]);
  useEffect(() => {
    const dialog = ref.current,
      focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (focus?.isConnected) focus.focus();
    };
  }, []);
  if (!monster) return null;
  const resolved = combat.status === 'resolved';
  return (
    <dialog
      ref={ref}
      className={`combat-arena arena-${combatBackdrop(snapshot.panel)}${transition === 'enter' ? ' combat-enter' : ''}`}
      aria-label={t('combat.arena')}
      onCancel={(event) => {
        event.preventDefault();
        if (isGM && !busy) void onEnd();
      }}
    >
      <div className="combat-arena-content">
        <header className="arena-header">
          <strong>{t('combat.round', { round: combat.round })}</strong>
          <ol className="initiative-ribbon" aria-label={t('combat.turnOrder')}>
            {combat.turnQueue.map((participant, index) => (
              <li
                key={participant.id}
                aria-current={!resolved && index === combat.turnIndex ? 'step' : undefined}
              >
                <span>{participant.type === 'monster' ? name(monster) : participant.name}</span>
                <b>{participant.initiative}</b>
              </li>
            ))}
          </ol>
          {isGM && (
            <button className="button secondary" disabled={busy} onClick={() => void onEnd()}>
              <LogOut size={16} aria-hidden="true" />
              {t('combat.end')}
            </button>
          )}
        </header>
        <div className="arena-battlers">
          <div className="arena-party">
            {party.map((member) => (
              <article
                key={member.id}
                className={`arena-hero${member.id === active?.id ? ' active-turn' : ''}${member.health?.current === 0 ? ' incapacitated' : ''}${animatedAction === effect?.id && effect?.targetId === member.id ? ' hit-effect' : ''}`}
              >
                <div className="battler-sprite">
                  {member.character && (
                    <CharacterPortrait appearance={member.character} size={64} />
                  )}
                </div>
                <div>
                  <strong>{member.nickname}</strong>
                  <span className="arena-class-badge">
                    {characterClassTitle(displayClasses, member.character)}
                  </span>
                  {member.health && (
                    <HealthStatus health={member.health} nickname={member.nickname} />
                  )}
                </div>
              </article>
            ))}
          </div>
          <article
            className={`arena-monster${active?.type === 'monster' ? ' active-turn' : ''}${monster.defeated ? ' defeated' : ''}${animatedAction === effect?.id && effect?.targetId === monster.id ? ' hit-effect' : ''}`}
          >
            <MonsterPortrait sprite={monster.sprite} size={160} />
            <h2>{name(monster)}</h2>
            <MonsterHealth monster={monster} />
            {animatedAction === effect?.id && effect?.targetId === monster.id && (
              <span className="attack-slash" aria-hidden="true" />
            )}
          </article>
        </div>
        {resolved ? (
          <div className="combat-resolution" role="status">
            <h2>{t(monster.defeated ? 'combat.victory' : 'combat.defeat')}</h2>
            {isGM && (
              <button className="button primary" disabled={busy} onClick={() => void onEnd()}>
                {t('combat.return')}
              </button>
            )}
          </div>
        ) : (
          <footer className="combat-action-dock">
            <p aria-live="polite">
              {t('combat.waiting', {
                name: active?.type === 'monster' ? name(monster) : (active?.name ?? ''),
              })}
            </p>
            {active?.type === 'player' && canAct && (
              <button
                className="button primary"
                aria-label={attackName}
                onClick={() =>
                  void onPlayerAttack({ targetMonsterId: monster.id, attackId: attack.id })
                }
              >
                <Swords size={18} aria-hidden="true" />
                {attackName}
                <small>
                  {attack.damageNotation} {modifier >= 0 ? '+' : ''}
                  {modifier}
                </small>
              </button>
            )}
            {isGM && active?.type === 'monster' && (
              <>
                <fieldset className="monster-targets" disabled={!canAct}>
                  <legend>{t('combat.target')}</legend>
                  {party
                    .filter((m) => (m.health?.current ?? 0) > 0)
                    .map((member) => (
                      <label key={member.id}>
                        <input
                          type="radio"
                          name="combat-target"
                          value={member.id}
                          checked={targetId === member.id}
                          onChange={() => setTargetId(member.id)}
                        />
                        {member.nickname} ({member.health!.current}/{member.health!.max} HP)
                      </label>
                    ))}
                </fieldset>
                <label className="monster-damage-input">
                  {t('monsters.attack')}
                  <input
                    value={damageNotation || monster.attackNotation || '1d12'}
                    onChange={(event) => setDamageNotation(event.target.value)}
                    disabled={!canAct}
                    maxLength={30}
                  />
                </label>
                <button
                  className="button primary"
                  aria-label={t('combat.monsterAttack')}
                  disabled={
                    !canAct || !party.some((m) => m.id === targetId && (m.health?.current ?? 0) > 0)
                  }
                  onClick={() =>
                    void onMonsterAttack({
                      targetMemberId: targetId!,
                      damageNotation: damageNotation || monster.attackNotation || '1d12',
                    })
                  }
                >
                  <Swords size={18} aria-hidden="true" />
                  {t('combat.monsterAttack')}
                </button>
              </>
            )}
            {canAct && (
              <button className="button secondary" onClick={() => void onNext()}>
                <SkipForward size={16} aria-hidden="true" />
                {t('combat.pass')}
              </button>
            )}
            <form
              className="combat-free-roll"
              onSubmit={(event) => {
                event.preventDefault();
                const request = parseDiceNotation(freeRoll);
                if (!request) {
                  setLocalError('Enter valid dice notation.');
                  return;
                }
                setLocalError('');
                void onRoll(request);
              }}
            >
              <label>
                {t('combat.freeRoll')}
                <input
                  maxLength={30}
                  value={freeRoll}
                  disabled={busy}
                  onChange={(event) => setFreeRoll(event.target.value)}
                />
              </label>
              <button className="button secondary" disabled={busy}>
                {t('combat.roll')}
              </button>
            </form>
          </footer>
        )}
        {(error || localError) && (
          <p className="form-error" role="alert">
            {formatError(error || localError)}
          </p>
        )}
      </div>
      {transition === 'enter' && (
        <CombatTransitionWipe direction="enter" onFinish={onTransitionEnd} />
      )}
    </dialog>
  );
}
