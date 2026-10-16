'use client';

import { useTranslations } from '@/i18n/I18nProvider';

/**
 * Choice chips — an alternative to the text Composer.
 * Generic: it only knows the label and hands the selected option back, so the
 * caller (onboarding) applies the value the option carries — no label re-parsing.
 */
export function ChoiceChips<T extends { label: string }>({
  options,
  onSelect,
  onSkip,
}: {
  options: T[];
  onSelect: (option: T) => void;
  onSkip: () => void;
}) {
  const translations = useTranslations();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-black/5 bg-surface px-4 py-4">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onSelect(option)}
          className="rounded-full border border-black/10 bg-background px-4 py-2 text-sm transition-colors hover:border-accent hover:bg-accent/10"
        >
          {option.label}
        </button>
      ))}
      <button type="button" onClick={onSkip} className="px-2 text-sm text-muted underline">
        {translations.chat.skip}
      </button>
    </div>
  );
}
