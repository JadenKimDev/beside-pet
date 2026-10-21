'use client';

import { type ReactNode, useEffect, useRef } from 'react';

export type ModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** 바닥의 버튼들(취소, 확인). */
  actions?: ReactNode;
};

/** 네이티브 <dialog> 의 모달. Esc 와 포커스 가두기, 닫은 뒤 포커스 복귀는 브라우저가 한다. */
export function Modal({ open, title, onClose, children, actions }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-5 text-fg"
    >
      <h2 id="modal-title" className="text-base font-semibold">
        {title}
      </h2>
      {children && <div className="mt-2 text-sm text-fg-muted">{children}</div>}
      {actions && <div className="mt-5 flex justify-end gap-2">{actions}</div>}
    </dialog>
  );
}
