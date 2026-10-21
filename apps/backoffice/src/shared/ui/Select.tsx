import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';
import { fieldControlClass } from './Input';

export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: readonly SelectOption[];
};

export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <select className={cn(fieldControlClass, 'pr-8', className)} {...rest}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
