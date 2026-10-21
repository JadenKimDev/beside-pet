import type { ReactNode } from 'react';
import { AdminGate } from '@/widgets/app-shell';

// 화면 쪽 관리자 가드는 편의다. 판정은 서버의 관리자 추출기(`403 Insufficient role`)가 한다.
export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminGate>{children}</AdminGate>;
}
