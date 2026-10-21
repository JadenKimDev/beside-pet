import { getIssueResponse } from '@/shared/github';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request, { params }: { params: Promise<{ number: string }> }) =>
  getIssueResponse((await params).number, request);
