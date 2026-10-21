import { Badge } from '@/shared/ui';
import { PURPOSE_LABELS, PURPOSE_TONES } from '../model/labels';
import type { Purpose } from '../model/types';

/** 호출의 역할 배지(발화, 위기 판정, 리포트). */
export function PurposeBadge({ purpose }: { purpose: Purpose }) {
  return <Badge tone={PURPOSE_TONES[purpose]}>{PURPOSE_LABELS[purpose]}</Badge>;
}
