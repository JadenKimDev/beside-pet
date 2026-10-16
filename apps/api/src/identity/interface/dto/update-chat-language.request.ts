/**
 * update-chat-language.request.ts — PATCH /v1/auth/me/chat-language request body.
 */
import { IsIn } from 'class-validator';
import type { Locale } from '@/shared/locale';

export class UpdateChatLanguageRequest {
  @IsIn(['ko', 'en'])
  chatLanguage!: Locale;
}
