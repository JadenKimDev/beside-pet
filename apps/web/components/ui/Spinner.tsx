import './ui.css';
import { cx } from './cx';

/** 18px 원형 스피너. 색은 글자색(currentColor)을 따른다. 장식이므로 읽히지 않는다. */
export function Spinner({ className }: { className?: string }) {
  return <span data-spinner aria-hidden="true" className={cx('ui-spinner', className)} />;
}
