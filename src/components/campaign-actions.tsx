'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, LogOut, Settings, LoaderCircle } from 'lucide-react';
import { Modal } from './ui/modal';
import { useErrorMessage } from '../i18n/use-error-message';

export function ConfirmDeleteDialog({
  code,
  busy,
  error = '',
  onConfirm,
  onClose,
}: {
  code: string;
  busy: boolean;
  error?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const t = useTranslations(),
    formatError = useErrorMessage();
  const [confirmation, setConfirmation] = useState('');
  return (
    <Modal title={t('lifecycle.delete')} onClose={onClose}>
      <p className="modal-description">{t('lifecycle.warning')}</p>
      <strong>{code}</strong>
      <label>
        {t('lifecycle.confirmCode')}
        <input
          autoFocus
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {formatError(error)}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className="button danger"
          disabled={busy || confirmation !== code}
          onClick={() => void onConfirm()}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Trash2 size={16} aria-hidden="true" />
          )}
          {t('lifecycle.deletePermanently')}
        </button>
      </div>
    </Modal>
  );
}
export function ConfirmLeaveDialog({
  local = false,
  busy,
  error = '',
  onConfirm,
  onClose,
}: {
  local?: boolean;
  busy: boolean;
  error?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const t = useTranslations(),
    formatError = useErrorMessage();
  return (
    <Modal title={t(local ? 'lifecycle.remove' : 'lifecycle.leave')} onClose={onClose}>
      <p className="modal-description">
        {t(local ? 'lifecycle.removeWarning' : 'lifecycle.leaveWarning')}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {formatError(error)}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="button primary" disabled={busy} onClick={() => void onConfirm()}>
          {busy && <LoaderCircle size={16} className="spin" />}
          {t(local ? 'lifecycle.remove' : 'lifecycle.leave')}
        </button>
      </div>
    </Modal>
  );
}
export function CampaignActions({
  isGM,
  disabled,
  onAction,
}: {
  isGM: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  const t = useTranslations(),
    [open, setOpen] = useState(false);
  return (
    <div className="campaign-actions">
      <button
        className="icon-button"
        aria-label={t('lifecycle.actions')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Settings size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="campaign-menu">
          <button
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAction();
            }}
          >
            {isGM ? (
              <Trash2 size={16} aria-hidden="true" />
            ) : (
              <LogOut size={16} aria-hidden="true" />
            )}
            {t(isGM ? 'lifecycle.delete' : 'lifecycle.leave')}
          </button>
        </div>
      )}
    </div>
  );
}
