import type { Viewer } from '../model/types';

/** 껍데기 머리의 운영자 이름. 좁은 화면에서는 말줄임한다. */
export function ViewerName({ viewer }: { viewer: Pick<Viewer, 'username'> }) {
  return <span className="min-w-0 truncate text-sm text-fg-muted">{viewer.username}</span>;
}
