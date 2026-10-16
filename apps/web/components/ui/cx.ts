/** 클래스 이름을 잇는다. 거짓 값은 뺀다. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
