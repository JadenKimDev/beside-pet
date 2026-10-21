import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';
import { fieldControlClass } from './Input';

export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: readonly SelectOption[];
};

/**
 * `items-center`: 브라우저가 select 를 customizable select(`appearance: base-select`, display flex)로 그리면
 * 글자가 상자 위에 붙는다. 세로 가운데로 두고, 옛 모양(legacy appearance)에서는 효과가 없다.
 */
export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <select className={cn(fieldControlClass, 'items-center pr-8', className)} {...rest}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
