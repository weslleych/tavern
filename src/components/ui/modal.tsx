'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPressed = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      // React may detach the dialog before effect cleanup, bypassing native focus restoration.
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onCancel={onClose}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPressed.current =
          event.button === 0 &&
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom);
      }}
      onClick={(event) => {
        if (backdropPressed.current && event.target === event.currentTarget) onClose();
        backdropPressed.current = false;
      }}
      aria-labelledby={titleId}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label={t('errors.closeDialog')}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
