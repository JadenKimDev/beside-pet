/** 거짓 값을 뺀 클래스 이름을 공백으로 잇는다. */
export function cn(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
