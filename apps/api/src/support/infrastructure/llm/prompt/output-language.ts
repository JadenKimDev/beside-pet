/**
 * output-language.ts — locale → target-language name for prompt instructions.
 * Prompts are written in English; the output language is steered by a
 * "Respond ONLY in {language}" line built from this map.
 */
import type { Locale } from '@/shared/locale';

export const OUTPUT_LANGUAGE: Record<Locale, string> = { ko: 'Korean', en: 'English' };
