'use client';

/**
 * ChatLanguageSelect — account-level conversation language control.
 * Independent of the app UI locale: changing it only affects what language the
 * companion replies in, starting from the next turn. The choice shows at once;
 * if the server refuses it the control goes back to the saved value and an error
 * toast offers a retry. The use case lives in auth.store.
 */
import { useState } from 'react';
import { Segmented, Toast, type ToastTone } from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { LOCALE_LABELS, LOCALES, type Locale } from '@/i18n/config';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';

type Notice = { tone: ToastTone; language: Locale };

export function ChatLanguageSelect() {
  const translations = useTranslations();
  const { locale } = useLocale();
  const principal = useAuthStore((s) => s.principal);
  const setChatLanguage = useAuthStore((s) => s.setChatLanguage);
  const saved = principal?.chatLanguage ?? locale;
  const [choosing, setChoosing] = useState<Locale | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const save = async (language: Locale) => {
    setNotice(null);
    setChoosing(language);
    await setChatLanguage(language);
    // The store keeps the old principal when the save fails.
    const ok = useAuthStore.getState().principal?.chatLanguage === language;
    if (!ok) useAuthStore.setState({ error: undefined });
    setChoosing(null);
    setNotice({ tone: ok ? 'default' : 'error', language });
  };

  return (
    <>
      <Segmented
        label={translations.auth.chatLanguage}
        value={choosing ?? saved}
        disabled={choosing !== null}
        onChange={(language) => void save(language)}
        options={LOCALES.map((candidate) => ({
          value: candidate,
          label: LOCALE_LABELS[candidate],
        }))}
      />
      {notice && (
        <Toast
          tone={notice.tone}
          message={
            notice.tone === 'error'
              ? translations.toast.saveFailed
              : translations.toast.chatLanguageSaved(LOCALE_LABELS[notice.language])
          }
          retryLabel={translations.common.retry}
          onRetry={() => void save(notice.language)}
          onDismiss={() => setNotice(null)}
        />
      )}
    </>
  );
}
