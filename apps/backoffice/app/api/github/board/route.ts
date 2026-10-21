import { getBoardResponse } from '@/shared/github';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => getBoardResponse(request);
