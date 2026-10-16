import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type CardVariant = 'default' | 'sunk' | 'keepsake';

const VARIANT: Record<CardVariant, string> = {
  default: 'border border-border bg-surface shadow-1',
  sunk: 'bg-bg-sunk',
  keepsake:
    'border border-border bg-[linear-gradient(160deg,color-mix(in_srgb,var(--color-warm)_55%,var(--color-surface)),var(--color-surface)_70%)] shadow-1',
};

const HOVER =
  'transition-[transform,box-shadow,border-color] duration-(--t-base) ease-soft hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:shadow-2';

export type CardProps = HTMLAttributes<HTMLElement> & {
  variant?: CardVariant;
  /** 목록 항목, 소개 카드처럼 눌러 들어가는 카드. hover 때 위로 2px 뜬다. */
  interactive?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
  children?: ReactNode;
};

/** 카드의 클래스. 카드 전체가 링크일 때 `<Link className={cardClass(...)}>` 로 쓴다. */
export function cardClass({
  variant = 'default',
  interactive,
}: Pick<CardProps, 'variant' | 'interactive'> = {}): string {
  return cx('block rounded-lg p-6', VARIANT[variant], interactive && HOVER);
}

export function Card({
  variant = 'default',
  interactive,
  as: Tag = 'div',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag {...rest} className={cx(cardClass({ variant, interactive }), className)}>
      {children}
    </Tag>
  );
}
