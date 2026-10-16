/**
 * i18n/particle.ts — Korean particles after a name.
 * The particle depends on whether the word's last syllable has a final consonant
 * (받침): 보리와 / 별과, 보리는 / 별은. 로/으로 also treats a final ㄹ as none
 * (별로, 솜으로). A last letter that is not a Hangul syllable (Latin letters,
 * digits) counts as having no final consonant.
 */

/** Written as "<no final consonant>/<final consonant>". */
export type ParticlePair = '와/과' | '는/은' | '를/을' | '가/이' | '로/으로';

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const FINAL_COUNT = 28;
const FINAL_RIEUL = 8;

/** Index of the final consonant of the last syllable; 0 when there is none. */
const finalConsonant = (word: string): number => {
  const last = word.trimEnd().slice(-1);
  if (!last) return 0;
  const code = last.charCodeAt(0);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return 0;
  return (code - HANGUL_FIRST) % FINAL_COUNT;
};

export const particle = (word: string, pair: ParticlePair): string => {
  const [withoutFinal, withFinal] = pair.split('/') as [string, string];
  const final = finalConsonant(word);
  if (pair === '로/으로' && final === FINAL_RIEUL) return withoutFinal;
  return final === 0 ? withoutFinal : withFinal;
};

export const withParticle = (word: string, pair: ParticlePair): string =>
  `${word}${particle(word, pair)}`;
