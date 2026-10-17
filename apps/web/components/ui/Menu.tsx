'use client';

import './ui.css';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { cx } from './cx';
import { IconButton } from './IconButton';

export type MenuItem = {
  label: ReactNode;
  icon?: ReactNode;
  /** danger 는 글자를 `danger` 로 둔다(삭제). */
  tone?: 'default' | 'danger';
  onSelect: () => void;
};

/**
 * 더보기 메뉴. 아이콘 버튼을 누르면 아래 오른쪽에 항목들이 뜬다.
 * 열리면 첫 항목으로 포커스, 위·아래 화살표로 돌고, Esc 는 닫고 버튼으로 포커스를 돌려준다. 바깥 누름도 닫는다.
 * 항목을 고르면 닫은 뒤 `onSelect` 를 부른다(포커스는 버튼으로 돌아가므로 모달이 열리면 닫힐 때 다시 버튼으로 온다).
 */
export function Menu({
  label,
  icon,
  items,
  className,
}: {
  /** 아이콘 버튼의 이름(예: 더 보기). */
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const entries = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const at = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      entries[(at + step + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <span ref={wrapRef} className={cx('relative inline-flex', className)}>
      <IconButton
        ref={buttonRef}
        label={label}
        icon={icon}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((was) => !was)}
      />
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="ui-pop absolute top-[calc(100%+6px)] right-0 z-30 min-w-[168px] rounded-md border border-border bg-surface-raised p-1.5 shadow-3"
        >
          {items.map((item, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: 항목은 호출하는 쪽이 고정된 순서로 넘긴다.
              key={index}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cx(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-sm border-0 bg-transparent px-3 py-2.5 text-left text-sm whitespace-nowrap hover:bg-bg-sunk focus-visible:bg-bg-sunk focus-visible:outline-none [&_svg]:size-4 [&_svg]:flex-none',
                item.tone === 'danger' ? 'text-danger' : 'text-fg',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
