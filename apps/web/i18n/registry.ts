/**
 * i18n/registry.ts — locale → catalog lookup.
 * Add a language: author `<locale>.ts`, then register it here. Unknown locales
 * fall back to the default (ko).
 */
import type { Locale } from './config';
import { en } from './en';
import { ko } from './ko';
import type { Messages } from './messages';

const catalogs: Record<Locale, Messages> = { ko, en };

export const getMessages = (locale: Locale): Messages => catalogs[locale] ?? ko;
