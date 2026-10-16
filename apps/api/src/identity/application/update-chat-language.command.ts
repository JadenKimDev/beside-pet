/**
 * update-chat-language.command.ts — input for UpdateChatLanguageUseCase.
 */
import type { Locale } from '@/shared/locale';

export interface UpdateChatLanguageCommand {
  accountId: string;
  chatLanguage: Locale;
}
