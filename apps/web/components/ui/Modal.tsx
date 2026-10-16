'use client';

import './ui.css';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { cx } from './cx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ModalTone = 'default' | 'danger';

export type ModalProps = {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  /** 위의 48px 원 안에 둘 아이콘. */
  icon?: ReactNode;
  /** danger 는 원을 `danger-soft` 로, 확인 버튼을 danger 로 바꾼다(삭제 확인). */
  tone?: ModalTone;
  cancelLabel: ReactNode;
  confirmLabel: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  /** 확인 중: 두 버튼이 막히고 확인 버튼에 스피너, Esc 와 바깥 누름도 취소하지 않는다. */
  busy?: boolean;
  /** 본문 아래에 더 둘 것(입력 칸 등). */
  children?: ReactNode;
};

/**
 * 확인창. 데스크톱은 가운데, 640px 이하는 아래에서 올라오는 시트(버튼은 세로로, 주 버튼이 위).
 * 열리면 포커스를 안(취소 버튼)으로 옮기고 Tab 을 가두며, 닫히면 연 요소로 돌려준다.
 */
export function Modal({
  open,
  title,
  body,
  icon,
  tone = 'default',
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  children,
}: ModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelHandler = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelHandler.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (cancelRef.current ?? dialogRef.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) cancelHandler.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items.at(-1);
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: 바깥 누름은 마우스 편의이고, 키보드의 같은 동작은 Esc 다.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc 는 document 의 keydown 이 받는다.
    <div
      data-modal-backdrop
      className="ui-fade fixed inset-0 z-50 grid place-items-center bg-overlay p-4 max-sm:place-items-end max-sm:p-0"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        tabIndex={-1}
        className="ui-pop w-full max-w-[420px] rounded-xl bg-surface-raised p-8 text-fg shadow-3 focus:outline-none max-sm:max-w-none max-sm:rounded-b-none max-sm:px-6 max-sm:pt-6 max-sm:pb-8"
      >
        {icon && (
          <div
            className={cx(
              'mb-4 grid size-12 place-items-center rounded-full [&_svg]:size-[22px]',
              tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-ink',
            )}
          >
            {icon}
          </div>
        )}
        <h2 id={titleId} className="m-0 mb-2 text-xl leading-snug font-[650]">
          {title}
        </h2>
        {body && (
          <div id={bodyId} className="text-[15px] leading-relaxed text-fg-muted">
            {body}
          </div>
        )}
        {children}
        <div className="mt-8 flex justify-end gap-2 max-sm:flex-col-reverse max-sm:[&_button]:w-full">
          <Button ref={cancelRef} variant="ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            busy={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
