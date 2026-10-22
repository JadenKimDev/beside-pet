const DAY_MS = 86_400_000;

/**
 * 보관함 카드의 남은 날수. 서버가 준 파기 시각(`purgeAt`)까지 남은 시간을 날수로 올려 센다.
 * 하루가 안 남았거나 이미 지났으면 0 이고, 화면은 그것을 "오늘 지워요"로 보인다.
 * 서버는 기동 때만 파기하므로 지난 시각이 와도 카드는 다음 기동까지 남는다.
 */
export function daysUntilPurge(purgeAt: string, now: Date): number {
  const left = new Date(purgeAt).getTime() - now.getTime();
  return left < DAY_MS ? 0 : Math.ceil(left / DAY_MS);
}
