import { draftResponse } from '../../_lib/handlers';

export const GET = async (request: Request, { params }: { params: Promise<{ file: string }> }) =>
  draftResponse((await params).file, request);
