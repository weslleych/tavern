'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import type { CharacterHealth, HealthAdjustmentRequest } from '../types/game';
import { healthAdjustmentSchema, readableError } from '../lib/validation';
import { Modal } from './ui/modal';
import { HealthStatus } from './health-status';
import { useErrorMessage } from '../i18n/use-error-message';

export function HealthEditor({
  memberId,
  nickname,
  health,
  isGM,
  busy,
  error,
  onAdjust,
  onClose,
}: {
  memberId: string;
  nickname: string;
  health: CharacterHealth;
  isGM: boolean;
  busy: boolean;
  error: string;
  onAdjust: (request: HealthAdjustmentRequest) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const formatError = useErrorMessage();
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const sending = useRef(false);
  const disabled = busy || saving;
  async function adjust(change: HealthAdjustmentRequest) {
    if (sending.current || busy) return;
    const parsed = healthAdjustmentSchema.safeParse({ ...change, memberId });
    if (!parsed.success) {
      setLocalError(readableError(parsed.error));
      return;
    }
    sending.current = true;
    setSaving(true);
    setLocalError('');
    try {
      if (!(await onAdjust(parsed.data))) setLocalError('Health could not be saved. Try again.');
    } catch (error) {
      setLocalError(readableError(error));
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>, field: 'current' | 'gmBonus') {
    event.preventDefault();
    void adjust({ [field]: Number(new FormData(event.currentTarget).get(field)) });
  }
  return (
    <Modal title={t('health.title', { nickname })} onClose={onClose}>
      <div className="health-editor" aria-busy={saving}>
        <HealthStatus health={health} nickname={nickname} />
        <p className="subtle">
          {isGM ? t('health.gmHint') : t('health.playerHint')} {t('health.immediateChanges')}
        </p>
        <fieldset disabled={disabled} className="health-quick-actions">
          <legend className="sr-only">{t('health.quickChanges')}</legend>
          {(isGM ? [-5, -1, 1, 5] : [-1, 1]).map((delta) => (
            <button
              type="button"
              className="button secondary"
              key={delta}
              aria-label={t('health.delta', {
                delta: `${delta > 0 ? '+' : ''}${delta}`,
                hp: t('common.hp'),
              })}
              onClick={() => void adjust({ delta })}
            >
              {delta > 0 ? '+' : ''}
              {delta}
            </button>
          ))}
          {isGM && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void adjust({ current: health.max })}
            >
              {t('health.healFull')}
            </button>
          )}
        </fieldset>
        {isGM ? (
          <>
            <form onSubmit={(event) => submit(event, 'current')}>
              <label>
                {t('health.currentHP')}{' '}
                <input
                  key={health.current}
                  name="current"
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  required
                  defaultValue={health.current}
                  disabled={disabled}
                />
              </label>
              <button type="submit" className="button secondary" disabled={disabled}>
                {t('health.setCurrent')}
              </button>
            </form>
            <form onSubmit={(event) => submit(event, 'gmBonus')}>
              <label>
                {t('health.maxBonus')}{' '}
                <input
                  key={health.gmBonus}
                  name="gmBonus"
                  type="number"
                  min={-100}
                  max={100}
                  step={1}
                  required
                  defaultValue={health.gmBonus ?? 0}
                  disabled={disabled}
                />
              </label>
              <button type="submit" className="button secondary" disabled={disabled}>
                {t('health.applyBonus')}
              </button>
            </form>
            <p className="subtle">{t('health.maximumHint')}</p>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const amount = Number(form.get('amount'));
              const action = (event.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement | null;
              void adjust({ delta: action?.value === 'heal' ? amount : -amount });
            }}
          >
            <label>
              {t('health.amount')}{' '}
              <input
                name="amount"
                type="number"
                min={1}
                max={999}
                step={1}
                required
                defaultValue={1}
                disabled={disabled}
              />
            </label>
            <div className="health-quick-actions">
              <button type="submit" className="button secondary" value="damage" disabled={disabled}>
                {t('health.applyDamage')}
              </button>
              <button type="submit" className="button secondary" value="heal" disabled={disabled}>
                {t('health.applyHealing')}
              </button>
            </div>
          </form>
        )}
        {(error || localError) && (
          <p role="alert" className="form-error">
            {formatError(error || localError)}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button primary" onClick={onClose}>
            {t('common.done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
