'use client';

/**
 * ThemeSelect — the three colour themes as a segmented control, each with a small
 * swatch of that theme's own colours (the `swatch-*` tokens do not change with the
 * active theme). Choosing one flips `<html data-theme>` at once and stores it in the
 * cookie (a device setting: never the server or DB). Light/dark follows the OS, so
 * there is no dark toggle.
 */
import { Segmented } from '@/components/ui';
import { useDocumentTheme } from '@/features/safety/use-document-theme';
import { useTranslations } from '@/i18n/I18nProvider';
import { THEMES, type Theme } from '@/theme/config';
import { persistTheme } from '@/theme/persist-theme';

const SWATCH: Record<Theme, [string, string, string]> = {
  hanji: ['bg-swatch-hanji-bg', 'bg-swatch-hanji-accent', 'bg-swatch-hanji-warm'],
  night: ['bg-swatch-night-bg', 'bg-swatch-night-accent', 'bg-swatch-night-warm'],
  ink: ['bg-swatch-ink-bg', 'bg-swatch-ink-accent', 'bg-swatch-ink-warm'],
};

function Swatch({ theme }: { theme: Theme }) {
  return (
    <span aria-hidden="true" className="inline-flex -space-x-1">
      {SWATCH[theme].map((color) => (
        <span key={color} className={`size-3 rounded-full border border-border ${color}`} />
      ))}
    </span>
  );
}

export function ThemeSelect() {
  const t = useTranslations().settings;
  const theme = useDocumentTheme();

  const choose = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    void persistTheme(next).catch(() => undefined);
  };

  return (
    <Segmented
      label={t.theme}
      value={theme}
      onChange={choose}
      options={THEMES.map((candidate) => ({
        value: candidate,
        label: (
          <span className="inline-flex items-center gap-2">
            <Swatch theme={candidate} />
            {t.themeNames[candidate]}
          </span>
        ),
      }))}
    />
  );
}
