import { describe, expect, it } from 'vitest';
import { splitByNumbers, telHref } from './phone';

describe('telHref', () => {
  it('하이픈과 빈칸을 뺀 tel: 주소를 만든다', () => {
    expect(telHref('109')).toBe('tel:109');
    expect(telHref('1577-1366')).toBe('tel:15771366');
    expect(telHref(' 1577 1366 ')).toBe('tel:15771366');
  });
});

describe('splitByNumbers', () => {
  it('글 속의 번호를 조각으로 떼어 낸다', () => {
    expect(
      splitByNumbers('전화 109 (24시간) · 다누리 1577-1366 (다국어).', ['109', '1577-1366']),
    ).toEqual([
      { text: '전화 ' },
      { text: '109', number: '109' },
      { text: ' (24시간) · 다누리 ' },
      { text: '1577-1366', number: '1577-1366' },
      { text: ' (다국어).' },
    ]);
  });

  it('더 긴 숫자의 일부는 번호로 보지 않는다', () => {
    expect(splitByNumbers('1093 과 2109', ['109'])).toEqual([{ text: '1093 과 2109' }]);
  });

  it('번호가 없으면 글 하나를 돌려준다', () => {
    expect(splitByNumbers('번호 없음', ['109'])).toEqual([{ text: '번호 없음' }]);
  });
});
