// 위기 번호를 화면에 놓는 도우미. 번호와 문구는 i18n 의 고정값이고 모델이 쓰지 않는다(ADR-0004).

/** 보이는 번호("1577-1366")를 거는 주소("tel:15771366")로 바꾼다. */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^0-9+]/g, '')}`;
}

export type TextPiece = { text: string; number?: string };

/**
 * 글 속에서 `numbers` 를 찾아 조각으로 나눈다. 번호 조각에는 `number` 가 붙어 전화 링크로 그릴 수 있다.
 * 앞뒤가 숫자인 자리(더 긴 숫자의 일부)는 번호로 보지 않는다.
 */
export function splitByNumbers(text: string, numbers: readonly string[]): TextPiece[] {
  const escaped = [...numbers]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return [{ text }];
  const pattern = new RegExp(`(?<![0-9])(${escaped.join('|')})(?![0-9])`, 'g');
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) pieces.push({ text: text.slice(last, match.index) });
    pieces.push({ text: match[0], number: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}
