'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { CharacterHealth, HealthAdjustmentRequest } from '../types/game';
import { healthAdjustmentSchema, readableError } from '../lib/validation';
import { Modal } from './ui/modal';
import { HealthStatus } from './health-status';

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
    <Modal title={`${nickname}'s health`} onClose={onClose}>
      <div className="health-editor" aria-busy={saving}>
        <HealthStatus health={health} nickname={nickname} />
        <p className="subtle">
          {isGM
            ? 'Set current HP or adjust the maximum with a bonus.'
            : 'Track damage and healing for your adventurer.'}{' '}
          Changes save immediately.
        </p>
        <fieldset disabled={disabled} className="health-quick-actions">
          <legend className="sr-only">Quick health changes</legend>
          {(isGM ? [-5, -1, 1, 5] : [-1, 1]).map((delta) => (
            <button
              type="button"
              className="button secondary"
              key={delta}
              aria-label={`${delta > 0 ? '+' : ''}${delta} HP`}
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
              Heal to full
            </button>
          )}
        </fieldset>
        {isGM ? (
          <>
            <form onSubmit={(event) => submit(event, 'current')}>
              <label>
                Current HP
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
                Set current HP
              </button>
            </form>
            <form onSubmit={(event) => submit(event, 'gmBonus')}>
              <label>
                Maximum HP bonus
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
                Apply bonus
              </button>
            </form>
            <p className="subtle">
              Maximum HP = base 20 + class + specialization + GM bonus (minimum 1). Increasing the
              maximum does not heal.
            </p>
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
              Damage or healing amount
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
                Apply damage
              </button>
              <button type="submit" className="button secondary" value="heal" disabled={disabled}>
                Apply healing
              </button>
            </div>
          </form>
        )}
        {(error || localError) && (
          <p role="alert" className="form-error">
            {error || localError}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
