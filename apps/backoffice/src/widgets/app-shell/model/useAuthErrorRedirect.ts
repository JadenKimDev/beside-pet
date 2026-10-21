'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { authErrorTarget } from './gate';

/** 지금 경로와 질의. `next` 로 실어 로그인 뒤 되돌아온다. */
export function currentLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 데이터 호출의 catch 에서 부른다. 401 이면 로그인(`?next=`), 403 이면 권한 없음으로 보내고 true.
 * 그 밖의 오류면 false 이고 화면이 오류 Alert 를 보인다.
 */
export function useAuthErrorRedirect(): (error: unknown) => boolean {
  const router = useRouter();
  return useCallback(
    (error: unknown) => {
      const to = authErrorTarget(error, currentLocation());
      if (to) router.replace(to);
      return to !== null;
    },
    [router],
  );
}
