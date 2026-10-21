/**
 * ADR-0003: words never used in user-facing copy. Shared by the catalog test and by the
 * check that reads the server's fixed crisis copy (`apps/server/src/safety/resources.rs`).
 */
export const BANNED_EN: readonly RegExp[] = [
  /\bcounsel(?:ing|ling|or|lor|ors|lors)?\b/i,
  /\btherap(?:y|ies|ist|ists|eutic)\b/i,
  /\btreatments?\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bdiagnos(?:e|es|is|ed|ing)\b/i,
  /\bcure[sd]?\b/i,
  /\bpatients?\b/i,
];
export const BANNED_KO: readonly RegExp[] = [/상담/, /치료/];
export const BANNED: readonly RegExp[] = [...BANNED_EN, ...BANNED_KO];

/** The proper name of an outside institution, not a description of this product. */
export const PROPER_NAMES: readonly string[] = ['자살예방상담전화'];

export const stripProperNames = (text: string): string =>
  PROPER_NAMES.reduce((acc, name) => acc.split(name).join(''), text);

/** Banned patterns that `text` matches once proper names are removed. */
export const bannedWordsIn = (text: string): RegExp[] =>
  BANNED.filter((pattern) => pattern.test(stripProperNames(text)));
