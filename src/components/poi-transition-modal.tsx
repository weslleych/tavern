'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  Member,
  TravelVote,
  StructureAnchor,
  Snapshot,
  PoiConfiguration,
} from '../types/game';
import { Modal } from './ui/modal';
import { FormSelect } from './ui/select';
import { useErrorMessage } from '../i18n/use-error-message';

export function PoiTransitionModal({
  vote,
  members,
  you,
  busy,
  error,
  onVote,
  onDecide,
}: {
  vote: TravelVote;
  members: Member[];
  you: Member;
  busy: boolean;
  error: string;
  onVote: (id: string, accept: boolean) => Promise<boolean>;
  onDecide: (id: string, approved: boolean) => Promise<boolean>;
}) {
  const t = useTranslations(),
    formatError = useErrorMessage(),
    [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const voted = vote.votes[you.id];
  return (
    <Modal
      title={t('world.travelTitle', { name: vote.name })}
      onClose={() => {
        if (!busy) void (you.role === 'gm' ? onDecide(vote.id, false) : onVote(vote.id, false));
      }}
    >
      <p>{t('world.travelHint')}</p>
      <p className="travel-countdown">
        {t('world.remaining', { seconds: Math.max(0, Math.ceil((vote.expiresAt - time) / 1000)) })}
      </p>
      <ul className="travel-voters">
        {vote.playerIds.map((id) => (
          <li key={id}>
            <strong>{members.find((m) => m.id === id)?.nickname ?? '—'}</strong>
            <span>
              {t(
                vote.votes[id] === undefined
                  ? 'world.pending'
                  : vote.votes[id]
                    ? 'world.yes'
                    : 'world.no',
              )}
            </span>
          </li>
        ))}
      </ul>
      {vote.gmApproved && <p role="status">{t('world.approved')}</p>}
      {error && (
        <p role="alert" className="form-error">
          {formatError(error)}
        </p>
      )}
      <div className="modal-actions">
        {you.role === 'gm' ? (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void onDecide(vote.id, false)}
            >
              {t('world.decline')}
            </button>
            <button
              className="button primary"
              disabled={busy || vote.gmApproved}
              onClick={() => void onDecide(vote.id, true)}
            >
              {t('world.approve')}
            </button>
          </>
        ) : (
          <>
            <button
              className="button secondary"
              aria-pressed={voted === false}
              disabled={busy}
              onClick={() => void onVote(vote.id, false)}
            >
              {t('world.stay')}
            </button>
            <button
              className="button primary"
              aria-pressed={voted === true}
              disabled={busy}
              onClick={() => void onVote(vote.id, true)}
            >
              {t('world.enter')}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
export function PoiLinkModal({
  anchor,
  panelId,
  panels,
  busy,
  error,
  onSave,
  onClose,
  action = 'link',
}: {
  anchor: StructureAnchor;
  panelId: string;
  panels: Snapshot['panels'];
  busy: boolean;
  error: string;
  onSave: (request: PoiConfiguration) => Promise<boolean>;
  onClose: () => void;
  action?: 'link' | 'town' | 'dungeon';
}) {
  const t = useTranslations(),
    formatError = useErrorMessage(),
    [name, setName] = useState(anchor.name ?? t(`world.${anchor.templateKey}`)),
    [target, setTarget] = useState(anchor.targetPanelId ?? '__none');
  async function save(createTemplate?: 'town' | 'dungeon') {
    if (
      await onSave({
        panelId,
        structureId: anchor.id,
        name,
        ...(createTemplate
          ? { createTemplate }
          : { targetPanelId: target === '__none' ? null : target }),
      })
    )
      onClose();
  }
  return (
    <Modal
      title={t(
        action === 'link'
          ? 'world.linkTitle'
          : action === 'town'
            ? 'world.createLinkedTown'
            : 'world.createLinkedDungeon',
      )}
      onClose={onClose}
    >
      <p className="modal-description">
        {t(action === 'link' ? 'world.linkHint' : 'world.createLinkHint')}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(action === 'link' ? undefined : action);
        }}
      >
        <label>
          {t('world.poiName')}
          <input
            autoFocus
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {action === 'link' && (
          <label>
            {t('world.destination')}
            <FormSelect
              label={t('world.destination')}
              value={target}
              onValueChange={setTarget}
              disabled={busy}
              options={[
                { value: '__none', label: t('world.unlinked') },
                ...panels
                  .filter((p) => p.id !== panelId)
                  .map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {formatError(error)}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="button primary"
            disabled={busy || !name.trim() || (action !== 'link' && panels.length >= 30)}
          >
            {t(action === 'link' ? 'world.saveLink' : 'world.createAndLink')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
