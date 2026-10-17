'use client';

/**
 * /sessions/[id]/report — 마친 대화 하나의 마음 리포트(§7.5). 상태와 불러오기는 features/report 가 갖는다.
 */
import { useParams } from 'next/navigation';
import { ReportScreen } from '@/features/report/components/ReportScreen';

export default function SessionReportPage() {
  const params = useParams<{ id: string }>();
  return <ReportScreen sessionId={params.id} />;
}
